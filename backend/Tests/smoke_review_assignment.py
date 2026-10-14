"""Rollback-only smoke: reviewer assignment (apps.accelerator.ReviewAssignment).

Doctrine under test:
- An assignment routes attention and records ownership. It is not a verdict and
  not a gate: nothing here decides admission, and no eligible reviewer is
  blocked from filing a scorecard by the absence of an assignment.
- "Asked" and "done" stay separate facts. An assignment with no scorecard behind
  it must report scorecard_filed=False, never disappear from the row.
- Reviewer identity is staff-only, so a founder's row shows no assignment list —
  and no empty list implying nobody is on it either.
- Every assignment change lands in the immutable audit ledger.
"""
import os
import uuid
from datetime import timedelta

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import views as acc_views
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAuditEvent,
    FounderApplicationProfile,
    ReviewerAssessment,
    StartupApplicationProfile,
)
from apps.accelerator.models_os import ProgramStaffMembership, ReviewAssignment, ReviewerProfile
from apps.accelerator.permissions import IsAcceleratorOrStaff
from apps.accelerator.serializers import AcceleratorApplicationListSerializer, ReviewAssignmentSerializer

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def viewset(cls, request, action, **kwargs):
    vs = cls()
    vs.request = request
    vs.action = action
    vs.kwargs = kwargs
    # APIView.initialize_request normally sets this; we bypass as_view().
    vs.format_kwarg = None
    return vs


def make_request(method, path, payload=None, user=None):
    inner = (
        getattr(factory, method)(path)
        if payload is None
        else getattr(factory, method)(path, payload, format="json")
    )
    req = Request(inner, parsers=[JSONParser()])
    if user is not None:
        req.user = user
    return req


def results_of(response):
    data = response.data
    return data["results"] if isinstance(data, dict) and "results" in data else data


def assign(user, payload):
    """POST /review-assignments/ — returns the viewset, or raises what it raised."""
    req = make_request("post", "/api/v1/accelerator/review-assignments/", payload, user=user)
    vs = viewset(acc_views.ReviewAssignmentViewSet, req, "create")
    try:
        vs.create(req)
        return vs
    except (ValidationError, PermissionDenied) as exc:
        vs._error = exc
        return vs


def assignments_list(user, query=""):
    req = make_request("get", f"/api/v1/accelerator/review-assignments/{query}", user=user)
    vs = viewset(acc_views.ReviewAssignmentViewSet, req, "list")
    try:
        return vs.list(req)
    except (ValidationError, PermissionDenied) as exc:
        return exc


def candidates(user, query=""):
    req = make_request("get", f"/api/v1/accelerator/review-assignments/candidates/{query}", user=user)
    vs = viewset(acc_views.ReviewAssignmentViewSet, req, "candidates")
    try:
        return vs.candidates(req)
    except (ValidationError, PermissionDenied) as exc:
        return exc


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    owner = User.objects.create_user(email=f"ra-owner-{tag}@x.io", password="x", role="accelerator",
                                     first_name="Owena", last_name="Owner")
    coord = User.objects.create_user(email=f"ra-coord-{tag}@x.io", password="x", role="accelerator",
                                     first_name="Cody", last_name="Coordinator")
    other_staff = User.objects.create_user(email=f"ra-other-{tag}@x.io", password="x", role="accelerator",
                                           first_name="Olga", last_name="Other")
    reviewer = User.objects.create_user(email=f"ra-rev-{tag}@x.io", password="x", role="accelerator",
                                        first_name="Rita", last_name="Reviewer")
    founder = User.objects.create_user(email=f"ra-founder-{tag}@x.io", password="x", role="startup")
    # In the reviewer pool, holding no seat anywhere is the point of this account.
    User.objects.create_user(
        email=f"ra-by-{tag}@x.io", password="x", role="accelerator",
        first_name="Bea", last_name="Outside",
    )

    prog = AcceleratorProgram.objects.create(
        name=f"Assign Program {tag}", slug=f"assign-{tag}", created_by=owner,
        sector_focus="fintech", stage_focus="seed",
    )
    other_prog = AcceleratorProgram.objects.create(
        name=f"Assign Other {tag}", slug=f"assign-other-{tag}", created_by=owner,
    )

    # The coordinator works in these programs because each one seats them. The
    # owner is a different human on purpose: reach is a grant, not a side effect
    # of the program being published.
    for scoped in (prog, other_prog):
        ProgramStaffMembership.objects.create(program=scoped, user=coord, role="manager")

    def make_app(company, *, program=None, status="SCREENING"):
        person = User.objects.create_user(email=f"ra-{company.lower()}-{tag}@x.io", password="x", role="startup")
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=person, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", sector_tags="fintech", geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=program or prog, startup_profile=sp, submitted_by=founder, status=status,
        )

    app = make_app("AssignCo")
    waiting_app = make_app("WaitingCo")  # in scope, deliberately never assigned
    other_app = make_app("AssignElsewhere", program=other_prog)
    draft_app = make_app("DraftCo", status="DRAFT")

    # ── 1. Creating an assignment ───────────────────────────────────────────
    vs = assign(coord, {"application": app.id, "reviewer": reviewer.id})
    ok("staff can assign a reviewer", getattr(vs, "_error", None) is None)
    row = ReviewAssignment.objects.filter(application=app, reviewer=reviewer).first()
    ok("the assignment row exists", row is not None)
    ok("assigned_by is the acting human, not the client", row is not None and row.assigned_by_id == coord.id)
    ok("a new assignment is pending, not completed", row is not None and row.status == "pending")
    ok("the default round is recorded", row is not None and row.round_id == "round-1")
    ok("assigned_by is read-only to the API",
       ReviewAssignmentSerializer().get_fields()["assigned_by"].read_only is True)

    audit = ApplicationAuditEvent.objects.filter(application=app, action_type="reviewer_assigned").first()
    ok("the assignment is in the audit ledger", audit is not None)
    ok("the audit names who was asked", audit is not None and "Rita Reviewer" in audit.reason)
    ok("the audit records who asked", audit is not None and audit.actor_id == coord.id)
    ok("an assignment is not an automated screening event", audit is not None and audit.is_automated is False)

    # ── 2. What the row reports back ────────────────────────────────────────
    resp = assignments_list(coord, f"?program_id={prog.id}")
    rows = results_of(resp)
    ok("scoped list returns the assignment", len(rows) == 1)
    ok("the reviewer is named for humans", rows and rows[0]["reviewer_name"] == "Rita Reviewer")
    ok("the reviewer is also keyed, under the same name the row uses",
       rows and rows[0]["reviewer_id"] == reviewer.id)
    ok("asked-but-not-done reports scorecard_filed False", rows and rows[0]["scorecard_filed"] is False)

    ReviewerAssessment.objects.create(
        application=app, reviewer=reviewer, founder_score=6, market_score=6, product_score=6,
        team_score=6, traction_score=6, overall_conviction=6,
    )
    after = results_of(assignments_list(coord, f"?program_id={prog.id}"))
    ok("a filed scorecard flips scorecard_filed", after and after[0]["scorecard_filed"] is True)
    ok("assignment count is unchanged by a scorecard", len(after) == 1)

    # ── 3. Refusals ─────────────────────────────────────────────────────────
    dupe = assign(coord, {"application": app.id, "reviewer": reviewer.id})
    ok("assigning the same human twice is refused", getattr(dupe, "_error", None) is not None)
    ok("the duplicate refusal is a field error, not a crash",
       isinstance(getattr(dupe, "_error", None), ValidationError))
    ok("no second row was created", ReviewAssignment.objects.filter(application=app, reviewer=reviewer).count() == 1)

    second_round = assign(coord, {"application": app.id, "reviewer": reviewer.id, "round_id": "round-2"})
    ok("a second round for the same human is allowed", getattr(second_round, "_error", None) is None)
    ok("rounds are separate rows", ReviewAssignment.objects.filter(application=app, reviewer=reviewer).count() == 2)

    outsider = assign(coord, {"application": app.id, "reviewer": founder.id})
    ok("a founder cannot be assigned as a reviewer", getattr(outsider, "_error", None) is not None)

    on_draft = assign(coord, {"application": draft_app.id, "reviewer": reviewer.id})
    ok("a DRAFT application cannot be assigned", getattr(on_draft, "_error", None) is not None)

    no_scope = assignments_list(coord)
    ok("an unscoped bulk read is refused", isinstance(no_scope, ValidationError))
    # A direct viewset call skips DRF's initial(), so the request never passes
    # through the gate on its own. Ask the gate the question instead of
    # pretending the harness enforced it.
    ok("the assignments endpoint is staff-only",
       acc_views.ReviewAssignmentViewSet.permission_classes == [IsAcceleratorOrStaff])
    ok("a founder fails that gate",
       IsAcceleratorOrStaff().has_permission(make_request("get", "/", user=founder), None) is False)
    ok("program staff pass it",
       IsAcceleratorOrStaff().has_permission(make_request("get", "/", user=coord), None) is True)

    # ── 4. Program scoping ──────────────────────────────────────────────────
    assign(coord, {"application": other_app.id, "reviewer": other_staff.id})
    prog_rows = results_of(assignments_list(coord, f"?program_id={prog.id}"))
    other_rows = results_of(assignments_list(coord, f"?program_id={other_prog.id}"))
    ok("a program list holds only that program's assignments",
       {r["company_name"] for r in prog_rows} == {"AssignCo"} and
       {r["company_name"] for r in other_rows} == {"AssignElsewhere"})

    # ── 5. The review-queue / applications row carries its owners ───────────
    def ser_rows(user, qs):
        return AcceleratorApplicationListSerializer(qs, many=True, context={"request": make_request("get", "/", user=user)}).data

    staff_rows = ser_rows(coord, AcceleratorApplication.objects.filter(program=prog).order_by("id"))
    by_company = {r["company_name"]: r for r in staff_rows}
    ok("staff rows carry the assignment list",
       [a["reviewer_name"] for a in by_company["AssignCo"]["assignments"]] == ["Rita Reviewer", "Rita Reviewer"])
    ok("a row with no assignment is an empty list, not null",
       by_company["DraftCo"]["assignments"] == [])
    founder_rows = ser_rows(founder, AcceleratorApplication.objects.filter(submitted_by=founder, startup_profile__company_name="AssignCo"))
    ok("a founder's row hides reviewer identity as null, not []",
       founder_rows[0]["assignments"] is None)
    anon = AcceleratorApplicationListSerializer(
        AcceleratorApplication.objects.filter(pk=app.pk), many=True
    ).data
    ok("with no request in context nothing is exposed", anon[0]["assignments"] is None)

    # ── 6. Candidates: load counted on the server ───────────────────────────
    # The pool is the platform's eligibility rule, so what comes back is one
    # page of a list that may hold hundreds of accounts. Every lookup below
    # narrows with the fixture's own address, which is what keeps these
    # assertions true as the dev database grows.
    ReviewerProfile.objects.create(user=reviewer, max_active_reviews=10, is_active=True)
    ProgramStaffMembership.objects.create(program=prog, user=other_staff)
    cand = candidates(coord, f"?program_id={prog.id}&q=ra-rev-{tag}")
    ok("candidates answers a scoped request", not isinstance(cand, (ValidationError, PermissionDenied)))
    ok("candidates without a program is refused", isinstance(candidates(coord), ValidationError))
    people = {c["email"]: c for c in cand.data["candidates"]}
    ok("a program-team member is a candidate", f"ra-rev-{tag}@x.io" in people)
    me = people[f"ra-rev-{tag}@x.io"]
    ok("open assignments are counted server-side", me["open_assignments"] == 2)
    ok("filed scorecards counted separately from assignments", me["scorecards_filed"] == 1)
    ok("capacity comes from the reviewer profile", me["max_active_reviews"] == 10)
    ok("at_capacity is false under the limit", me["at_capacity"] is False)
    ok("the page says what it matched, so a short list is not read as the whole team",
       cand.data["total_matching"] == 1 and cand.data["returned"] == 1
       and cand.data["limit"] == 50)
    ok("a founder is not in the pool, even when the search would match them",
       candidates(coord, f"?program_id={prog.id}&q=ra-founder-{tag}").data["candidates"] == [])
    coord_page = candidates(coord, f"?program_id={prog.id}&q=ra-coord-{tag}").data
    ok("no profile means unknown capacity, not unlimited",
       coord_page["candidates"][0]["max_active_reviews"] is None
       and coord_page["candidates"][0]["at_capacity"] is False)
    ok("an account the program seated is marked as holding a seat",
       coord_page["candidates"][0]["on_program_team"] is True)
    ok("the eligibility pool is not described as the program's team",
       candidates(coord, f"?program_id={prog.id}&q=ra-by-{tag}").data["candidates"][0]
       ["on_program_team"] is False)
    ok("an account holding a staff seat in this program is marked as one",
       candidates(coord, f"?program_id={prog.id}&q=ra-other-{tag}").data["candidates"][0]
       ["on_program_team"] is True)
    ok("a human already holding a seat here is marked, not hidden",
       candidates(coord, f"?program_id={prog.id}&application_id={app.id}&q=ra-rev-{tag}")
       .data["candidates"][0]["already_asked"] is True)
    ok("...and a human with no seat on it is not",
       candidates(coord, f"?program_id={prog.id}&application_id={app.id}&q=ra-coord-{tag}")
       .data["candidates"][0]["already_asked"] is False)
    ReviewerProfile.objects.filter(user=reviewer).update(max_active_reviews=2)
    tight = candidates(coord, f"?program_id={prog.id}&q=ra-rev-{tag}").data["candidates"][0]
    ok("at_capacity is true at the stated limit", tight["at_capacity"] is True)
    ok("capacity is advisory: the seat itself is still recorded",
       ReviewAssignment.objects.filter(application=app, reviewer=reviewer).exists())

    # ── 7. Recusal and removal ──────────────────────────────────────────────
    req = make_request("patch", f"/api/v1/accelerator/review-assignments/{row.id}/",
                       {"conflict_status": "recused"}, user=reviewer)
    vs = viewset(acc_views.ReviewAssignmentViewSet, req, "partial_update", pk=str(row.id))
    vs.partial_update(req, pk=str(row.id))
    row.refresh_from_db()
    ok("a reviewer can flag themselves recused", row.conflict_status == "recused")
    recusal = ApplicationAuditEvent.objects.filter(application=app, action_type="reviewer_conflict_update").first()
    ok("the recusal is in the audit ledger", recusal is not None)
    ok("the recusal shows before and after",
       recusal is not None and "none → recused" in recusal.reason)

    req = make_request("delete", f"/api/v1/accelerator/review-assignments/{row.id}/", user=other_staff)
    vs = viewset(acc_views.ReviewAssignmentViewSet, req, "destroy", pk=str(row.id))
    refused = None
    try:
        vs.destroy(req, pk=str(row.id))
    except PermissionDenied as exc:
        refused = exc
    ok("a team member who did not assign it cannot remove it", refused is not None)
    ok("the row survives the refusal", ReviewAssignment.objects.filter(pk=row.pk).exists())

    req = make_request("delete", f"/api/v1/accelerator/review-assignments/{row.id}/", user=coord)
    vs = viewset(acc_views.ReviewAssignmentViewSet, req, "destroy", pk=str(row.id))
    vs.destroy(req, pk=str(row.id))
    ok("the assigner can remove an assignment", not ReviewAssignment.objects.filter(pk=row.pk).exists())
    ok("the removal is audited",
       ApplicationAuditEvent.objects.filter(application=app, action_type="reviewer_unassigned").exists())

    # ── 8. The consensus screen shows asked vs done ─────────────────────────
    req = make_request("get", f"/api/v1/accelerator/applications/reviewer-consensus-report/?program_id={prog.id}", user=coord)
    rep = viewset(acc_views.AcceleratorApplicationViewSet, req, "reviewer_consensus_report")
    out = rep.reviewer_consensus_report(req).data
    cons = {r["company_name"]: r for r in out["rows"]}
    ok("consensus rows carry assignments", "assignments" in cons["AssignCo"])
    list_row_now = ser_rows(coord, AcceleratorApplication.objects.filter(pk=app.pk))[0]
    ok("the applications list and the consensus report share one assignment shape",
       [sorted(a) for a in list_row_now["assignments"]] == [sorted(a) for a in cons["AssignCo"]["assignments"]])
    ok("the list row also says whether the asked human filed",
       list_row_now["assignments"][0]["scorecard_filed"] is True)
    ok("consensus shows the remaining round and who is on it",
       [a["reviewer_name"] for a in cons["AssignCo"]["assignments"]] == ["Rita Reviewer"])
    ok("consensus still separates filed scorecards from assignments",
       cons["AssignCo"]["reviewer_count"] == 1 and cons["AssignCo"]["assignments"][0]["scorecard_filed"] is True)
    ok("an application nobody was asked about shows an empty list",
       cons["WaitingCo"]["assignments"] == [])
    ok("asked and not-asked are counted separately in the rollup",
       out["rollup"]["applications_assigned"] == 1
       and out["rollup"]["applications_unassigned"] == 1)
    ok("an unset due date arrives as null, not a default date",
       all(a["due_at"] is None for a in cons["AssignCo"]["assignments"]))
    due = timezone.now() + timedelta(days=3)
    kept = ReviewAssignment.objects.filter(application=app).first()
    kept.due_at = due
    kept.save(update_fields=["due_at"])
    rep2 = viewset(acc_views.AcceleratorApplicationViewSet, req, "reviewer_consensus_report")
    cons2 = {r["company_name"]: r for r in rep2.reviewer_consensus_report(req).data["rows"]}
    ok("a due date reaches the consensus row verbatim",
       cons2["AssignCo"]["assignments"][0]["due_at"].startswith(due.strftime("%Y-%m-%dT")))

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
