"""Rollback-only smoke: who you are, what you run, and what you owe.

Doctrine under test:

- The server does not accept an identity the client asserts. A role is whatever
  the account record says, or null. ``ProgramStaffMembership`` could carry a
  program-scoped role but is not wired to any endpoint, so "Director" handed
  back to a browser that typed it is an invented authority.
- An organization is a row, not a proxy. Handing out a program's primary key as
  an organization id lets a client switch into an entity that does not exist.
- Missing is not zero, and zero is not "handled". An inbox with no rows means
  nothing is owed to this person; it says nothing about the program's backlog.
- Counts are over the whole working set. Capping the list is a display
  decision; capping the count would make the badge lie.
"""
import os
import uuid
from datetime import timedelta
from types import SimpleNamespace

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accelerator import permissions as acc_perms
from apps.accelerator import views as acc_views
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    DiligenceItem,
    EvidenceRequest,
    FounderApplicationProfile,
    InterviewSession,
    StartupApplicationProfile,
)
from apps.accelerator.models_os import (
    AcceleratorOrganization,
    ProgramStaffMembership,
    ReviewAssignment,
)
from apps.accelerator.serializers import SwitchContextSerializer

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def get_context(user):
    req = factory.get("/api/v1/accelerator/context/")
    force_authenticate(req, user=user)
    return acc_views.UserContextView.as_view()(req)


def switch_context(user, payload):
    req = factory.post("/api/v1/accelerator/context/switch/", payload, format="json")
    force_authenticate(req, user=user)
    return acc_views.SwitchContextView.as_view()(req)


def work_inbox(user, program_id):
    req = factory.get("/api/v1/accelerator/work-inbox/", {"program_id": program_id})
    force_authenticate(req, user=user)
    return acc_views.WorkInboxView.as_view()(req)


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]

    def make_user(who, kind):
        return User.objects.create_user(
            email=f"inbox-{who}-{tag}@x.io", password="x", role=kind
        )

    director = make_user("director", "accelerator")
    reviewer = make_user("reviewer", "accelerator")
    colleague = make_user("colleague", "accelerator")
    investor = make_user("investor", "investor")
    founder = make_user("founder", "startup")
    odd = make_user("odd", "")      # an account role the server has never seen

    now = timezone.now()

    # A program that only carries its organization as free text — every seeded
    # program looks like this.
    prog = AcceleratorProgram.objects.create(
        name=f"Inbox Program {tag}", slug=f"inbox-{tag}",
        organization_name="Northstar Ventures", is_public=True,
        sector_focus="fintech", stage_focus="seed",
    )
    # A program actually linked to an organization record whose name disagrees
    # with the program's own stale text.
    linked_org = AcceleratorOrganization.objects.create(
        name="Linked League", slug=f"linked-{tag}"
    )
    prog_linked = AcceleratorProgram.objects.create(
        name=f"Linked Program {tag}", slug=f"linked-{tag}",
        organization_name="Stale Text Name", organization=linked_org, is_public=True,
        sector_focus="health", stage_focus="seed",
    )
    # The two programs above carry no creator, so the only thing that can put an
    # accelerator team inside one is a staff membership the program wrote. That is
    # what `director` and `investor` are switched in with below; `is_public` is the
    # founder's route in, not theirs.
    for prog_ in (prog, prog_linked):
        ProgramStaffMembership.objects.create(user=director, program=prog_,
                                              role="director")
        ProgramStaffMembership.objects.create(user=investor, program=prog_,
                                              role="sponsor")

    # Somebody else's closed program: not visible, not switchable.
    private = AcceleratorProgram.objects.create(
        name=f"Private Program {tag}", slug=f"private-{tag}",
        organization_name="Private Org", created_by=colleague, is_public=False,
        sector_focus="fintech", stage_focus="seed",
    )

    def make_app(company, program, n):
        # FounderApplicationProfile.user is UNIQUE, so each application needs
        # its own submitting account.
        submitter = make_user(f"submitter{n}", "startup")
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(
                user=submitter, full_name=f"F {company}"
            ),
            company_name=company, declared_stage="seed", sector_tags="fintech",
            geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=program, startup_profile=sp, submitted_by=submitter, status="REVIEWING",
        )

    app_a = make_app("Alpha Grid", prog, 1)
    app_b = make_app("Beta Rail", prog, 2)
    app_other = make_app("Gamma Yield", prog, 3)

    # ── 1. Identity: the account says what the account is ────────────────────
    ok("SwitchContextSerializer no longer even has a role field to accept",
       "role" not in SwitchContextSerializer().fields)

    resp = switch_context(director, {"program_id": prog.pk, "role": "DIRECTOR"})
    ok("a switch that asserts a role still succeeds", resp.status_code == 200)
    ctx = resp.data["active_context"]
    ok("but the asserted role is ignored, not echoed back as authority",
       ctx["role"] == "Accelerator team" and ctx["role_code"] == "accelerator")
    ok("no 'DIRECTOR' claim survives anywhere in the payload",
       "DIRECTOR" not in str(resp.data))

    ok("an investor account reads as an investor",
       switch_context(investor, {"program_id": prog.pk}).data["active_context"]["role"]
       == "Investor")
    ok("a founder account reads as a founder",
       switch_context(founder, {"program_id": prog.pk}).data["active_context"]["role"]
       == "Founder")
    odd_ctx = switch_context(odd, {"program_id": prog.pk}).data["active_context"]
    ok("an unrecognised account role is null, not a default title",
       odd_ctx["role"] is None and odd_ctx["role_code"] is None)

    ok("creating a program is the one real authority the server can see",
       switch_context(colleague, {"program_id": private.pk}).data["active_context"]
       ["is_program_creator"] is True)
    ok("and it is false where the program has no creator at all",
       switch_context(director, {"program_id": prog.pk}).data["active_context"]
       ["is_program_creator"] is False)

    # ── 2. Organizations: rows, not proxies ──────────────────────────────────
    data = get_context(director).data
    orgs = {org["name"]: org for org in data["organizations"]}
    ok("a program carrying its organization as text only is reported unlinked",
       orgs["Northstar Ventures"]["id"] is None
       and orgs["Northstar Ventures"]["linked"] is False)
    ok("and it names the programs behind it",
       orgs["Northstar Ventures"]["program_ids"] == [prog.pk])
    ok("a linked program reports the real organization key",
       orgs["Linked League"]["id"] == linked_org.pk and orgs["Linked League"]["linked"] is True)
    ok("the organization record owns the name, not the program's stale text",
       "Stale Text Name" not in orgs and orgs["Linked League"]["name"] == "Linked League")
    ok("no organization entry carries a role, a permission list or a borrowed slug",
       all("role" not in org and "permissions" not in org and "slug" not in org
           for org in data["organizations"]))
    ok("a program this account cannot see is absent from the payload",
       private.name not in str(data))

    # ── 3. Switching is checked, not echoed ──────────────────────────────────
    hidden = switch_context(director, {"program_id": private.pk})
    ok("switching to a program this account cannot see is rejected",
       hidden.status_code == 400)
    ok("and it does not quietly report some other program instead",
       private.name not in str(getattr(hidden, "data", {}))
       and prog.name not in str(getattr(hidden, "data", {})))

    bogus_org = switch_context(director, {"program_id": prog.pk, "organization_id": 999_999})
    ok("an organization id that is not a row is rejected", bogus_org.status_code == 400)
    mismatched = switch_context(
        director, {"program_id": prog.pk, "organization_id": linked_org.pk}
    )
    ok("an organization that does not run the selected program is rejected",
       mismatched.status_code == 400)
    matched = switch_context(director, {"program_id": prog_linked.pk,
                                        "organization_id": linked_org.pk})
    ok("the real pairing is accepted and reported from the organization row",
       matched.status_code == 200
       and matched.data["active_context"]["organization_id"] == linked_org.pk
       and matched.data["active_context"]["organization_name"] == "Linked League")

    # ── 4. The work inbox: only rows that carry your name ────────────────────
    ok("the inbox is authenticated",
       acc_views.WorkInboxView.permission_classes == [IsAuthenticated])

    ReviewAssignment.objects.create(
        application=app_a, reviewer=reviewer, round_id="round-1",
        status="pending", due_at=now - timedelta(days=1),
    )
    ReviewAssignment.objects.create(
        application=app_b, reviewer=reviewer, round_id="round-1",
        status="in_progress", due_at=now + timedelta(days=7),
    )
    ReviewAssignment.objects.create(   # completed: owed to nobody
        application=app_other, reviewer=reviewer, round_id="round-1",
        status="completed", due_at=now - timedelta(days=2),
    )
    ReviewAssignment.objects.create(   # recused: stepped away
        application=app_a, reviewer=reviewer, round_id="round-2",
        status="pending", conflict_status="recused", due_at=now - timedelta(days=1),
    )
    ReviewAssignment.objects.create(   # somebody else's assignment
        application=app_a, reviewer=colleague, round_id="round-1",
        status="pending", due_at=now - timedelta(days=1),
    )

    DiligenceItem.objects.create(
        application=app_a, question="Confirm churn against Stripe", area="finance",
        owner=reviewer, status="open", due_at=now - timedelta(days=1),
    )
    undated_dd = DiligenceItem.objects.create(
        application=app_b, question="Is the pilot contract countersigned?", area="legal",
        owner=reviewer, status="in_progress", due_at=None,
    )
    DiligenceItem.objects.create(      # resolved: finished whatever the date said
        application=app_other, question="Cap table matches the round docs", area="legal",
        owner=reviewer, status="resolved", due_at=now - timedelta(days=5),
    )
    DiligenceItem.objects.create(      # another person's question
        application=app_a, question="Founder references", area="team",
        owner=colleague, status="open", due_at=now - timedelta(days=3),
    )

    InterviewSession.objects.create(
        application=app_a, interview_type="human_video", round_number=2,
        interviewer=reviewer, status="scheduled", scheduled_at=now + timedelta(days=2),
    )
    InterviewSession.objects.create(   # ML-conducted: no human owes anything to it
        application=app_b, interview_type="ai_voice", round_number=1,
        interviewer=None, status="scheduled", scheduled_at=now - timedelta(days=1),
    )
    InterviewSession.objects.create(   # already done
        application=app_other, interview_type="human_video", round_number=1,
        interviewer=reviewer, status="complete", scheduled_at=now - timedelta(days=4),
    )

    EvidenceRequest.objects.create(
        application=app_a, requested_by=reviewer, status="PENDING",
        response_deadline=now - timedelta(days=1),
    )
    EvidenceRequest.objects.create(    # answered
        application=app_b, requested_by=reviewer, status="COMPLETE",
        response_deadline=now - timedelta(days=2),
    )
    EvidenceRequest.objects.create(    # another person's request
        application=app_other, requested_by=colleague, status="PENDING",
        response_deadline=now - timedelta(days=2),
    )

    mine = work_inbox(reviewer, prog.pk).data
    ok("the inbox is scoped to the program asked for",
       mine["program_id"] == prog.pk and mine["program_name"] == prog.name)
    counts = mine["counts"]
    ok("two open reviews; a completed assignment is not owed work",
       counts["reviews"] == 2)
    ok("a recused reviewer is not counted as still owing the review",
       ReviewAssignment.objects.filter(reviewer=reviewer).count() == 4
       and counts["reviews"] == 2)
    ok("two diligence questions they own", counts["diligence"] == 2)
    ok("one interview names them as the interviewer", counts["interviews"] == 1)
    ok("an ML-conducted session owes no human anything",
       InterviewSession.objects.filter(application__program=prog, interviewer__isnull=True)
       .exists() and counts["interviews"] == 1)
    ok("one evidence request is still with the founder", counts["awaiting_founder"] == 1)
    ok("the total is the sum of the four ledgers", mine["total_open"] == 6)
    ok("three are past their date; the interview is still ahead of it",
       counts["overdue"] == 3)
    ok("six rows listed and nothing truncated",
       len(mine["items"]) == 6 and mine["truncated"] is False)
    ok("all four kinds are represented",
       {i["kind"] for i in mine["items"]} == {"review", "diligence", "interview",
                                              "awaiting_founder"})
    undated_key = f"diligence-{undated_dd.pk}"
    undated = [i for i in mine["items"] if i["key"] == undated_key][0]
    ok("an undated row reports no date rather than a stand-in", undated["due_at"] is None)
    ok("and is neither overdue nor on time — missing is not false",
       undated["overdue"] is None)
    ok("the undated row sorts after every dated one", mine["items"][-1]["key"] == undated_key)
    dated = [i["due_at"] for i in mine["items"] if i["due_at"]]
    ok("dated rows come back soonest-deadline first", len(dated) == 5 and dated == sorted(dated))
    ok("rows carry the company actually on the application",
       {i["company"] for i in mine["items"] if i["application_id"] == app_b.pk} == {"Beta Rail"})
    ok("every row links somewhere inside the accelerator",
       all(i["href"].startswith("/accelerator/") for i in mine["items"]))
    colleague_inbox = work_inbox(colleague, prog.pk).data
    ok("a colleague's inbox is a different set of numbers",
       colleague_inbox["counts"]["diligence"] == 1
       and colleague_inbox["total_open"] == 3)
    founder_inbox = work_inbox(founder, prog.pk).data
    ok("a person with no rows gets zeros, and the same shape",
       founder_inbox["total_open"] == 0 and founder_inbox["items"] == []
       and set(founder_inbox["counts"]) == {"reviews", "diligence", "interviews",
                                            "awaiting_founder", "overdue"})
    ok("the payload has no field that could read as 'everything is handled'",
       set(founder_inbox) == {"program_id", "program_name", "generated_at", "counts",
                              "total_open", "items", "item_limit", "truncated"})

    for n in range(51):
        DiligenceItem.objects.create(
            application=app_a, question=f"Flood question {n}", area="finance",
            owner=founder, status="open", due_at=None,
        )
    flooded = work_inbox(founder, prog.pk).data
    ok("the listed rows are capped", len(flooded["items"]) == 50)
    ok("and the cap is stated", flooded["truncated"] is True and flooded["item_limit"] == 50)
    ok("the count stays over the whole set while the list is capped",
       flooded["counts"]["diligence"] == 51 and flooded["total_open"] == 51)

    # ── 5. The inbox refuses to guess ────────────────────────────────────────
    bare_req = factory.get("/api/v1/accelerator/work-inbox/")
    force_authenticate(bare_req, user=reviewer)
    no_program = acc_views.WorkInboxView.as_view()(bare_req)
    ok("with no program asked for it is a 400, not a zero-filled panel",
       no_program.status_code == 400)
    ok("a non-numeric program id is a 400 too",
       work_inbox(reviewer, "not-a-number").status_code == 400)
    ok("a program this account cannot see is not listed out",
       work_inbox(reviewer, private.pk).status_code == 404)

    # The endpoint answers "what do the ledgers owe *you*", so an unauthenticated
    # call must be turned away before it can read request.user as nobody.
    anon_inbox = acc_views.WorkInboxView.as_view()(
        factory.get("/api/v1/accelerator/work-inbox/", {"program_id": prog.pk})
    )
    ok("an anonymous work inbox is refused rather than served as empty",
       anon_inbox.status_code in (401, 403))
    anon_context = acc_views.UserContextView.as_view()(
        factory.get("/api/v1/accelerator/context/")
    )
    ok("an anonymous context is refused too", anon_context.status_code in (401, 403))

    ok("a missing company falls back to the application's own id",
       acc_views._company_label(SimpleNamespace(pk=7, startup_profile=None))
       == "Application #7")
    ok("and a real one is used verbatim", acc_views._company_label(app_a) == "Alpha Grid")

    # ── 6. Helpers report nothing they did not check ─────────────────────────
    ok("_account_role returns the account's own role",
       acc_views._account_role(investor) == ("Investor", "investor"))
    ok("_account_role returns no invented label for an unknown role",
       acc_views._account_role(odd) == (None, None))
    ok("one visibility rule backs every program-scoped endpoint",
       list(acc_perms.programs_visible_to(founder).filter(pk=prog.pk)) == [prog]
       and not acc_perms.programs_visible_to(founder).filter(pk=private.pk).exists())

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
