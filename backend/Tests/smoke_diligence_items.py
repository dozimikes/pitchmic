"""Rollback-only smoke: due-diligence items (apps.accelerator.DiligenceItem).

Doctrine under test:
- A diligence item is ownership, not a verdict. Nothing here decides admission;
  closing an item only records that a human checked something and what they
  found.
- Missing is not zero. No owner reads as unassigned, no date as undated, and
  neither may render as "overdue" or "done".
- The overdue rule lives on the model alone, so the row, the ?overdue= filter
  and the rollup endpoint cannot drift into three different definitions.
- Diligence ownership is staff-only, exactly like reviewer identity: a founder's
  application row carries null, never an empty list implying nobody is looking.
- Opening, closing and handing over all land in the immutable audit ledger, with
  from_stage == to_stage so a diligence note never masquerades as a stage move.
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
    DiligenceItem,
    FounderApplicationProfile,
    StartupApplicationProfile,
)
from apps.accelerator.permissions import IsAcceleratorOrStaff
from apps.accelerator.serializers import (
    AcceleratorApplicationListSerializer,
    DiligenceItemSerializer,
)

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


def create(user, payload):
    """POST /diligence-items/ — returns the viewset, with ._error if it raised."""
    req = make_request("post", "/api/v1/accelerator/diligence-items/", payload, user=user)
    vs = viewset(acc_views.DiligenceItemViewSet, req, "create")
    try:
        resp = vs.create(req)
        vs.created = resp.data
        return vs
    except (ValidationError, PermissionDenied) as exc:
        vs._error = exc
        return vs


def update(user, item_id, payload):
    req = make_request("patch", f"/api/v1/accelerator/diligence-items/{item_id}/", payload, user=user)
    vs = viewset(acc_views.DiligenceItemViewSet, req, "partial_update", pk=str(item_id))
    try:
        resp = vs.partial_update(req, pk=item_id)
        vs.updated = resp.data
        return vs
    except (ValidationError, PermissionDenied) as exc:
        vs._error = exc
        return vs


def items_list(user, query=""):
    req = make_request("get", f"/api/v1/accelerator/diligence-items/{query}", user=user)
    vs = viewset(acc_views.DiligenceItemViewSet, req, "list")
    try:
        return vs.list(req)
    except (ValidationError, PermissionDenied) as exc:
        return exc


def rollup(user, query=""):
    req = make_request("get", f"/api/v1/accelerator/diligence-items/rollup/{query}", user=user)
    vs = viewset(acc_views.DiligenceItemViewSet, req, "rollup")
    try:
        return vs.rollup(req)
    except (ValidationError, PermissionDenied) as exc:
        return exc


def candidates(user, query=""):
    req = make_request("get", f"/api/v1/accelerator/review-assignments/candidates/{query}", user=user)
    vs = viewset(acc_views.ReviewAssignmentViewSet, req, "candidates")
    try:
        return vs.candidates(req)
    except (ValidationError, PermissionDenied) as exc:
        return exc


def app_rows(user, program_id):
    """Application rows through the real list queryset, so the rollup is read
    off the same prefetch the endpoints serve."""
    req = make_request("get", f"/api/v1/accelerator/applications/?program_id={program_id}", user=user)
    vs = viewset(acc_views.AcceleratorApplicationViewSet, req, "list")
    qs = vs.get_queryset().filter(program_id=program_id)
    data = AcceleratorApplicationListSerializer(qs, many=True, context={"request": req}).data
    return {r["company_name"]: r for r in data}


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    coord = User.objects.create_user(email=f"dd-coord-{tag}@x.io", password="x", role="accelerator",
                                     first_name="Cody", last_name="Coordinator")
    lawyer = User.objects.create_user(email=f"dd-lawyer-{tag}@x.io", password="x", role="accelerator",
                                      first_name="Lena", last_name="Legal")
    founder = User.objects.create_user(email=f"dd-founder-{tag}@x.io", password="x", role="startup")

    prog = AcceleratorProgram.objects.create(
        name=f"DD Program {tag}", slug=f"dd-{tag}", created_by=coord,
        sector_focus="fintech", stage_focus="seed",
    )
    other_prog = AcceleratorProgram.objects.create(
        name=f"DD Other {tag}", slug=f"dd-other-{tag}", created_by=coord,
    )

    def make_app(company, *, program=None, status="COMMITTEE_REVIEW"):
        person = User.objects.create_user(email=f"dd-{company.lower()}-{tag}@x.io",
                                          password="x", role="startup")
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=person, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", sector_tags="fintech", geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=program or prog, startup_profile=sp, submitted_by=founder, status=status,
        )

    app = make_app("DiligentCo")
    bare_app = make_app("UncheckedCo")   # in scope, deliberately never questioned
    other_app = make_app("ElsewhereCo", program=other_prog)
    draft_app = make_app("DraftCo", status="DRAFT")

    now = timezone.now()
    staff_req = make_request("get", "/", user=coord)

    # ── 1. Opening a question, with nobody on it and no date ─────────────────
    vs = create(coord, {"application": app.id, "question": "Does the stated MRR survive refunds?"})
    ok("program staff can open a diligence question", getattr(vs, "_error", None) is None)
    item = DiligenceItem.objects.filter(application=app).first()
    ok("the item row exists", item is not None)
    ok("created_by is the acting human, not the client",
       item is not None and item.created_by_id == coord.id)
    ok("created_by is read-only to the API",
       DiligenceItemSerializer().get_fields()["created_by"].read_only is True)
    ok("resolved_at is read-only to the API",
       DiligenceItemSerializer().get_fields()["resolved_at"].read_only is True)
    ok("a new question is open", item is not None and item.status == "open")
    ok("no owner means unassigned, and the payload says so with null",
       item is not None and vs.created["owner"] is None and vs.created["owner_name"] is None)
    ok("no date means undated, not due today",
       vs.created["due_at"] is None and vs.created["is_overdue"] is False)
    ok("the company travels with the question", vs.created["company_name"] == "DiligentCo")

    audit = ApplicationAuditEvent.objects.filter(application=app,
                                                action_type="diligence_item_opened").first()
    ok("opening a question is in the audit ledger", audit is not None)
    ok("the audit quotes the question", audit is not None and "MRR" in audit.reason)
    ok("a diligence event is not an automated screening event",
       audit is not None and audit.is_automated is False)
    ok("a diligence event moves no stage", audit is not None and audit.from_stage == audit.to_stage)

    # ── 2. The overdue rule lives in exactly one place ───────────────────────
    undated = item
    ok("an undated open item is never overdue", undated.is_overdue(now) is False)
    dated = make_app("DatedCo")
    past_vs = create(coord, {"application": dated.id, "question": "Confirm the churn figure",
                             "due_at": (now - timedelta(days=2)).isoformat()})
    past_item = DiligenceItem.objects.get(pk=past_vs.created["id"])
    ok("a past deadline on an open item is overdue", past_item.is_overdue(now) is True)
    ok("and the row reports the same verdict as the model",
       DiligenceItemSerializer(past_item, context={"request": staff_req}).data["is_overdue"] is True)

    future_vs = create(coord, {"application": dated.id, "question": "Reference call with the top customer",
                               "due_at": (now + timedelta(days=5)).isoformat()})
    future_item = DiligenceItem.objects.get(pk=future_vs.created["id"])
    ok("a future deadline is not overdue", future_item.is_overdue(now) is False)
    ok("a due date reaches the client verbatim",
       future_vs.created["due_at"].startswith((now + timedelta(days=5)).strftime("%Y-%m-%dT")))

    blocked_vs = create(coord, {"application": dated.id, "question": "Wait for the signed cap table"})
    blocked = DiligenceItem.objects.get(pk=blocked_vs.created["id"])
    blocked.status = "blocked"
    blocked.save(update_fields=["status"])
    ok("blocked still counts as owed, so it can be overdue",
       blocked.is_overdue(now) is False)  # no date yet — undated is not late
    blocked.due_at = now - timedelta(days=1)
    blocked.save(update_fields=["due_at"])
    ok("once a blocked question passes its date it is overdue", blocked.is_overdue(now) is True)
    ok("blocked is in the open set the rollup counts", "blocked" in DiligenceItem.OPEN_STATUSES)

    # ── 3. Refusals ──────────────────────────────────────────────────────────
    blank = create(coord, {"application": app.id, "question": "    "})
    ok("a blank question is refused", isinstance(getattr(blank, "_error", None), ValidationError))
    outsider = create(coord, {"application": app.id, "question": "Check the books",
                              "owner": founder.id})
    ok("a founder cannot be handed a diligence question",
       isinstance(getattr(outsider, "_error", None), ValidationError))
    on_draft = create(coord, {"application": draft_app.id, "question": "Anything at all"})
    ok("a DRAFT application cannot carry a diligence question",
       isinstance(getattr(on_draft, "_error", None), ValidationError))
    ok("and no row was written for it",
       not DiligenceItem.objects.filter(application=draft_app).exists())
    no_scope = items_list(coord)
    ok("an unscoped bulk read is refused", isinstance(no_scope, ValidationError))
    no_scope_rollup = rollup(coord)
    ok("an unscoped rollup is refused", isinstance(no_scope_rollup, ValidationError))
    # A direct viewset call bypasses DRF's initial(), so the permission class is
    # asserted rather than exercised through the request cycle.
    ok("the diligence endpoint is staff-only",
       acc_views.DiligenceItemViewSet.permission_classes == [IsAcceleratorOrStaff])
    ok("a founder fails that gate",
       IsAcceleratorOrStaff().has_permission(make_request("get", "/", user=founder), None) is False)
    ok("program staff pass it",
       IsAcceleratorOrStaff().has_permission(staff_req, None) is True)

    # ── 4. Ownership and closing, server-stamped ─────────────────────────────
    assign = update(coord, undated.id, {"owner": lawyer.id})
    ok("a question can be given an owner", getattr(assign, "_error", None) is None)
    undated.refresh_from_db()
    ok("the owner is the person named", undated.owner_id == lawyer.id)
    ok("the owner is named, not just keyed",
       assign.updated["owner_name"] == "Lena Legal" and assign.updated["owner_id"] == lawyer.id)
    reassign_audit = ApplicationAuditEvent.objects.filter(
        application=app, action_type="diligence_item_reassigned"
    ).first()
    ok("handing a question over is audited", reassign_audit is not None)
    ok("the audit says it went from nobody to someone",
       reassign_audit is not None and "nobody" in reassign_audit.reason and "Lena Legal" in reassign_audit.reason)

    unassign = update(coord, undated.id, {"owner": None})
    undated.refresh_from_db()
    ok("ownership can be taken back off (unassigned, not deleted)",
       undated.owner_id is None and getattr(unassign, "_error", None) is None)
    update(coord, undated.id, {"owner": lawyer.id})

    claim_resolve = update(coord, undated.id, {"status": "resolved", "resolved_at": now.isoformat()})
    ok("a client cannot set resolved_at — the field is read-only",
       DiligenceItemSerializer().get_fields()["resolved_at"].read_only is True)
    undated.refresh_from_db()
    ok("closing stamps resolved_at from the server clock", undated.resolved_at is not None)
    ok("a resolved question is no longer overdue even if its date passed",
       undated.is_overdue(now) is False)
    resolve_audit = ApplicationAuditEvent.objects.filter(
        application=app, action_type="diligence_item_resolved"
    ).first()
    ok("closing is audited", resolve_audit is not None)
    ok("the audit names the closer",
       resolve_audit is not None and resolve_audit.actor_id == coord.id)

    reopen = update(coord, undated.id, {"status": "in_progress"})
    undated.refresh_from_db()
    ok("a human can reopen a closed question", undated.status == "in_progress")
    ok("reopening clears the stale close date", undated.resolved_at is None)
    ok("a reopened question has no date, so it is not overdue", undated.is_overdue(now) is False)
    ok("in_progress counts as open", "in_progress" in DiligenceItem.OPEN_STATUSES)

    # ── 5. Program scoping ───────────────────────────────────────────────────
    create(coord, {"application": other_app.id, "question": "Is the entity actually incorporated?"})
    prog_rows = results_of(items_list(coord, f"?program_id={prog.id}"))
    other_rows = results_of(items_list(coord, f"?program_id={other_prog.id}"))
    ok("a program list holds only that program's questions",
       {r["company_name"] for r in prog_rows} == {"DiligentCo", "DatedCo"}
       and {r["company_name"] for r in other_rows} == {"ElsewhereCo"})
    one_app = results_of(items_list(coord, f"?application_id={app.id}"))
    ok("an application filter narrows it further",
       len(one_app) == 1 and one_app[0]["question"].startswith("Does the stated MRR"))

    # ── 6. The application row carries its own diligence rollup ──────────────
    rows = app_rows(coord, prog.id)
    dd = rows["DiligentCo"]["diligence"]
    ok("the application row carries a diligence rollup", isinstance(dd, dict))
    ok("the rollup counts open questions", dd["open"] == 1)
    ok("the rollup counts overdue against the same rule", dd["overdue"] == 0)
    ok("the rollup counts unowned open questions", dd["unowned"] == 0)
    ok("the rollup reports the next deadline honestly (none set)", dd["next_due_at"] is None)
    ok("items counts everything, open counts what is still owed",
       dd["items"] == 1 and dd["resolved"] == 0)
    dated_dd = rows["DatedCo"]["diligence"]
    ok("a second application's rollup is its own, not the program's",
       dated_dd["items"] == 3 and dated_dd["open"] == 3)
    ok("and it sees both slipped questions on this application", dated_dd["overdue"] == 2)
    ok("with the earliest deadline as next due",
       dated_dd["next_due_at"] == past_item.due_at.isoformat())
    ok("an application nobody has questioned reads as zero, not null",
       rows["UncheckedCo"]["diligence"]["items"] == 0
       and rows["UncheckedCo"]["diligence"]["next_due_at"] is None)
    founder_rows = app_rows(founder, prog.id)
    ok("a founder's row carries no diligence rollup",
       founder_rows["DiligentCo"]["diligence"] is None)
    ok("null, never an empty dict implying the program looked and found nothing",
       "diligence" in founder_rows["DiligentCo"])
    no_request = AcceleratorApplicationListSerializer(
        AcceleratorApplication.objects.filter(pk=app.pk), many=True
    ).data
    ok("without a request the rollup stays hidden too", no_request[0]["diligence"] is None)

    # Row rollup and endpoint must agree — one definition, two readers.
    sum_open = sum(r["diligence"]["open"] for r in rows.values() if r["diligence"])
    sum_overdue = sum(r["diligence"]["overdue"] for r in rows.values() if r["diligence"])
    ok("row rollups add up to what the endpoint reports",
       sum_open == rollup(coord, f"?program_id={prog.id}").data["open"]
       and sum_overdue == rollup(coord, f"?program_id={prog.id}").data["overdue"])

    # ── 7. The program rollup endpoint ───────────────────────────────────────
    rep = rollup(coord, f"?program_id={prog.id}").data
    ok("the rollup is scoped to one program", rep["program_id"] == prog.id)
    ok("it counts items across the program", rep["items"] == 4)
    ok("open, overdue and unowned are separate columns",
       rep["open"] == 4 and rep["overdue"] == 2 and rep["unowned_open"] == 3)
    ok("undated open questions are reported as undated, not as late",
       rep["undated_open"] == 1)
    ok("resolved questions are counted apart", rep["resolved"] == 0)
    ok("blocked questions are counted apart", rep["blocked"] == 1)
    ok("by_status covers every declared status",
       set(rep["by_status"]) == {"open", "in_progress", "resolved", "blocked"})
    ok("by_status sums to items", sum(rep["by_status"].values()) == rep["items"])
    ok("next_due_at is the earliest live deadline", rep["next_due_at"] == past_item.due_at.isoformat())
    ok("oldest_overdue_days is a real count of days", rep["oldest_overdue_days"] == 2)
    ok("coverage counts the applications someone has questioned",
       rep["applications_covered"] == 2)
    ok("and the ones nobody has written a question about",
       rep["applications_uncovered"] == 1)
    ok("covered + uncovered is the whole in-scope portfolio (DRAFT excluded)",
       rep["applications_covered"] + rep["applications_uncovered"] == 3)
    owner_rows = {o["owner_name"]: o for o in rep["by_owner"]}
    ok("by_owner spreads the load across named humans",
       len(owner_rows) == 2 and owner_rows["Lena Legal"]["open"] == 1)
    ok("the unowned pile is its own row, not folded into someone's",
       owner_rows[None]["open"] == 3 and owner_rows[None]["overdue"] == 2)
    ok("no owner is listed as overdue-only-by-default",
       all(isinstance(o["overdue"], int) for o in rep["by_owner"]))
    other_rep = rollup(coord, f"?program_id={other_prog.id}").data
    ok("another program's rollup counts only its own",
       other_rep["items"] == 1 and other_rep["overdue"] == 0)
    ok("and its own coverage, where the one application has been questioned",
       other_rep["applications_covered"] == 1 and other_rep["applications_uncovered"] == 0)
    ok("an undated question leaves next_due_at null rather than inventing one",
       other_rep["next_due_at"] is None and other_rep["oldest_overdue_days"] is None)

    # ── 8. Owner load is counted server-side in the candidate picker ─────────
    cands = {c["email"]: c for c in candidates(coord, f"?program_id={prog.id}").data["candidates"]}
    ok("the picker knows who owns a diligence question",
       cands[lawyer.email]["open_diligence"] == 1)
    ok("and who owns none", cands[coord.email]["open_diligence"] == 0)
    ok("diligence load is counted apart from review load",
       "open_assignments" in cands[lawyer.email])
    ok("the count is per program",
       {c["email"]: c for c in candidates(coord, f"?program_id={other_prog.id}").data["candidates"]}
       [lawyer.email]["open_diligence"] == 0)

    # ── 9. Deleting a question is possible and leaves the audit trail ────────
    drop = update(coord, future_item.id, {"status": "resolved",
                                          "resolution_note": "Called them; figure holds."})
    future_item.refresh_from_db()
    ok("a resolution note survives the round trip",
       future_item.resolution_note == "Called them; figure holds.")
    ok("closing with a note audits the note",
       ApplicationAuditEvent.objects.filter(
           application=dated, action_type="diligence_item_resolved",
           reason__contains="figure holds").exists())
    req = make_request("delete", f"/api/v1/accelerator/diligence-items/{future_item.id}/", user=coord)
    vs = viewset(acc_views.DiligenceItemViewSet, req, "destroy", pk=str(future_item.id))
    vs.destroy(req, pk=future_item.id)
    ok("staff can remove a question that should never have been written",
       not DiligenceItem.objects.filter(pk=future_item.id).exists())
    ok("removing it does not remove the record that it existed",
       ApplicationAuditEvent.objects.filter(application=dated,
                                            action_type="diligence_item_opened").count() == 3)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
