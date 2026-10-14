"""Rollback-only smoke: the tenant boundary on the rows a selection team works.

`smoke_config_tenant_scope.py` covers the configuration layer (stages, forms,
roles, templates, records). This one covers the other half of the surface — the
review flow, the cohort/delivery tables, and the ids a caller types into a URL,
a query string or a body — because those were guarded by different code and
failed in different ways:

- Seven review-flow viewsets resolved an application by id and then read it. A
  scorecard, a transcript, a committee ballot or a diligence question in another
  team's program answered to any authenticated accelerator account.
- Roughly two dozen cohort viewsets were built by one factory that started at
  `Model.objects.all()` and narrowed by whatever `?program_id=` arrived. The
  parameter is the caller's, so leaving it out listed every team's mentor
  sessions and offer letters: a filter standing in for a boundary.
- The evidence graph took an `application_id` and returned that founder's
  claims, the reviewers' emails and what the committee decided, unscoped.
- `update_or_create` inside an action, and an application id in a POST body, are
  both outside any queryset, so the tenant had to be named and proved there
  rather than assumed from a scoped list.
- A caller-supplied id is text. `?program_id=abc` raised `ValueError` inside the
  lookup — a 500 where the answer should have been a refusal naming the field —
  and an ignored `?program_id=` returned the whole tenant to a caller who asked
  for one program.
- A role check is not a tenant check, and neither is the other: the review
  ledgers are also not founders' reading material, so both questions are asked
  here rather than inferred from the router.
- Withheld is not empty. Where a row is deliberately not shown the answer is
  `None` or 404; where it genuinely does not exist the answer says that instead.
"""
import datetime
import os
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.apps import apps
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import models_os as os_models
from apps.accelerator import views as v
from apps.accelerator import views_cohort as coh
from apps.accelerator import views_config as cfg
from apps.accelerator import views_intel as intel
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationQuestion,
    CommitteeDecision,
    DiligenceItem,
    EvidenceRequest,
    FounderApplicationProfile,
    InterviewSession,
    ProgramMembership,
    ReviewerAssessment,
    ReviewerDisagreement,
    StartupApplicationProfile,
)
from apps.accelerator.models_config import EventOutbox, ProgramRole
from apps.accelerator.models_os import ApplicationCycle, ProgramInvitation
from apps.accelerator.serializers_cohort import MentorProfileSerializer
from apps.accelerator.tenant import (
    NULL_PROGRAM_READABLE,
    positive_int,
    scope_cohort_rows,
    scope_to_visible_programs,
)

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def _view(cls, method, path, user, action, payload=None, **kwargs):
    inner = (
        getattr(factory, method)(path)
        if payload is None
        else getattr(factory, method)(path, payload, format="json")
    )
    req = Request(inner, parsers=[JSONParser()])
    req.user = user
    view = cls()
    view.request = req
    view.action = action
    view.kwargs = kwargs
    view.format_kwarg = None
    return view, req


def call(cls, method, user, path, payload=None, action=None, handler=None, **kwargs):
    """Run one endpoint action directly and hand back (response, exception).

    A direct call skips `initial()`, which is what is wanted here: the tenant
    rules live in `get_queryset` and the action bodies, and they run either way.
    `handler` is the method to invoke when it is not named after the action.
    """
    action = action or {
        "get": "list", "post": "create", "patch": "partial_update",
        "delete": "destroy",
    }[method]
    view, req = _view(cls, method, path, user, action, payload, **kwargs)
    fn = getattr(view, handler or action)
    try:
        return fn(req, **kwargs), None
    except (Http404, NotFound, ValidationError, PermissionDenied) as exc:
        return None, exc


def scoped(cls, user, path):
    """The ids this caller's own queryset returns.

    Asked at the queryset rather than the rendered page because a page is
    paginated: an id missing from a 25-row page proves nothing, while an id
    missing from the scoped rows is the boundary.
    """
    view, _ = _view(cls, "get", f"/api/v1/accelerator/{path}", user, "list")
    return set(view.get_queryset().values_list("id", flat=True))


def may(cls, user, method="get", action="list"):
    """The viewset's permission classes, asked directly — the role gate is a
    separate fact from the row scoping and is asserted rather than assumed."""
    view, req = _view(cls, method, "/api/v1/accelerator/x", user, action)
    return all(p.has_permission(req, view) for p in
               (perm() for perm in cls.permission_classes))


def fields_of(exc):
    return set(exc.detail) if isinstance(getattr(exc, "detail", None), dict) else set()


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    owner = User.objects.create_user(email=f"tb-owner-{tag}@x.io", password="x",
                                     role="accelerator", first_name="Mira")
    rival = User.objects.create_user(email=f"tb-rival-{tag}@x.io", password="x",
                                     role="accelerator", first_name="Rex")
    staffer = User.objects.create_user(email=f"tb-staff-{tag}@x.io", password="x",
                                       role="admin", is_staff=True, is_superuser=True)
    reviewer = User.objects.create_user(email=f"tb-rev-{tag}@x.io", password="x",
                                        role="accelerator", first_name="Nia")
    founder_a = User.objects.create_user(email=f"tb-fa-{tag}@x.io", password="x",
                                         role="startup", first_name="Ada")
    founder_b = User.objects.create_user(email=f"tb-fb-{tag}@x.io", password="x",
                                         role="startup", first_name="Ben")
    mentor_user = User.objects.create_user(email=f"tb-mentor-{tag}@x.io",
                                           password="x", role="accelerator",
                                           first_name="Mo")

    org = os_models.AcceleratorOrganization.objects.create(
        name=f"Org {tag}", slug=f"tb-org-{tag}")

    def program(label, **kw):
        kw.setdefault("is_public", False)
        return AcceleratorProgram.objects.create(
            name=f"TBScope {label} {tag}", slug=f"tb-{label}-{tag}",
            organization_name="Pitchmic", organization=org, **kw)

    own = program("own", created_by=owner)
    away = program("away", created_by=rival)
    published = program("published", created_by=rival, is_public=True)
    # A private program the reviewer runs themselves: two programs one caller can
    # both see, so an inbox that mixed them up would show.
    home = program("home", created_by=reviewer)

    def profile(user, company):
        return StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(
                user=user, full_name=user.first_name),
            company_name=company, declared_stage="seed",
            sector_tags="fintech", geography="NG")

    sp_a, sp_b = profile(founder_a, f"AdaCo {tag}"), profile(founder_b, f"BenCo {tag}")
    founder_c = User.objects.create_user(email=f"tb-fc-{tag}@x.io", password="x",
                                         role="startup", first_name="Cai")

    def application(prog, sp, founder):
        return AcceleratorApplication.objects.create(
            program=prog, startup_profile=sp, submitted_by=founder,
            status="SUBMITTED")

    app_own = application(own, sp_a, founder_a)
    app_away = application(away, sp_b, founder_b)
    app_pub = application(published, sp_a, founder_a)
    # A rival row with nothing ever written against it, so a diligence denominator
    # that wandered outside the tenant has somewhere to show it.
    sp_c = profile(founder_c, f"CaiCo {tag}")
    app_away2 = application(away, sp_c, founder_c)
    app_home = application(home, sp_c, founder_c)

    # ── A. The review flow is scoped by tenant, on both sides ────────────────
    # `founder_ok` records which of these a founder may read at all: the two
    # application-shaped tables are the founder's own view of their pipeline,
    # the five ledgers are the program's internal record.
    FLOW = []
    card_away = ReviewerAssessment.objects.create(
        application=app_away, reviewer=reviewer, overall_conviction=7,
        recommendation="advance", notes="rival team's private read")
    card_second = ReviewerAssessment.objects.create(
        application=app_away, reviewer=rival, overall_conviction=3,
        recommendation="reject", notes="the other human on the same row")
    FLOW.append((v.ReviewerAssessmentViewSet, "reviews", card_away,
                 ReviewerAssessment.objects.create(
                     application=app_own, reviewer=reviewer, overall_conviction=6,
                     recommendation="advance"), False))
    FLOW.append((v.ReviewerDisagreementViewSet, "disagreements",
                 ReviewerDisagreement.objects.create(
                     application=app_away, dimension="Overall", reviewer_a=card_away,
                     reviewer_b=card_second, variance_pct=40), None, False))
    assign_away = os_models.ReviewAssignment.objects.create(
        application=app_away, reviewer=reviewer, round_id="round-1", assigned_by=rival)
    FLOW.append((v.ReviewAssignmentViewSet, "review-assignments", assign_away,
                 os_models.ReviewAssignment.objects.create(
                     application=app_own, reviewer=reviewer, round_id="round-1",
                     assigned_by=owner), False))
    # Two of the reviewer's own diligence questions, one per program: the work
    # inbox has to count the one they owe this program and not the other.
    DiligenceItem.objects.create(application=app_own, created_by=owner,
                                 owner=reviewer, question="Confirm the cap table")
    DiligenceItem.objects.create(application=app_away, created_by=rival,
                                 owner=reviewer, question="Confirm the cap table")
    FLOW.append((v.DiligenceItemViewSet, "diligence-items",
                 DiligenceItem.objects.create(
                     application=app_away, created_by=rival,
                     question="Rival: are the ARR numbers real?"),
                 DiligenceItem.objects.create(
                     application=app_own, created_by=owner,
                     question="Are the ARR numbers real?"), False))
    comm_away = CommitteeDecision.objects.create(application=app_away)
    FLOW.append((v.CommitteeDecisionViewSet, "committee", comm_away, None, False))
    iv_away = InterviewSession.objects.create(
        application=app_away, interview_type="human_video", round_number=1,
        interviewer=rival, status="scheduled",
        transcript=[{"speaker": "Rex", "text": "internal note only"}])
    FLOW.append((v.InterviewSessionViewSet, "interviews", iv_away, None, True))
    FLOW.append((v.EvidenceRequestViewSet, "evidence-requests",
                 EvidenceRequest.objects.create(
                     application=app_away, requested_by=rival,
                     requested_items=[{"type": "document",
                                       "description": "Bank statements"}]),
                 None, True))

    for cls, path, foreign, local, founder_reads in FLOW:
        mine = scoped(cls, owner, f"{path}/")
        ok(f"{path}: another team's row is not in this account's queryset",
           foreign.pk not in mine)
        ok(f"{path}: the team that works it still reads it",
           foreign.pk in scoped(cls, rival, f"{path}/"))
        ok(f"{path}: staff reaches either",
           foreign.pk in scoped(cls, staffer, f"{path}/"))
        ok(f"{path}: a query parameter cannot widen the rows",
           foreign.pk not in scoped(cls, owner, f"{path}/?program_id={away.pk}"))
        ok(f"{path}: ...nor can naming the application",
           foreign.pk not in scoped(cls, owner,
                                    f"{path}/?application_id={app_away.pk}"))
        resp, exc = call(cls, "get", owner, f"{path}/{foreign.pk}/",
                         action="retrieve", pk=foreign.pk)
        ok(f"{path}: a rival's row answers as missing by id, not as a detail page",
           isinstance(exc, Http404) and resp is None)
        ok(f"{path}: a founder {'may' if founder_reads else 'may not'} read it "
           f"{'because it is their own pipeline view' if founder_reads else 'at all'}",
           may(cls, founder_a) is founder_reads)
        ok(f"{path}: an anonymous caller is refused", not may(cls, AnonymousUser()))
        if local is not None:
            ok(f"{path}: the caller's own row is readable", local.pk in mine)

    # ── B. Bodies that name an application: proved, not trusted ──────────────
    _, exc = call(v.CommitteeDecisionViewSet, "post", owner,
                  "committee/cast-vote/",
                  {"application_id": app_away.pk, "vote": "YES"},
                  action="cast_vote")
    comm_away.refresh_from_db()
    ok("a ballot cannot be cast inside another team's committee room",
       isinstance(exc, ValidationError))
    ok("...and nothing was written on the refusal", not (comm_away.individual_votes or []))
    resp, exc = call(v.CommitteeDecisionViewSet, "post", rival, "committee/cast-vote/",
                     {"application_id": app_away.pk, "vote": "YES",
                      "conviction_score": 6, "notes": "committee member"},
                     action="cast_vote")
    comm_away.refresh_from_db()
    ok("the team that works the program still votes",
       exc is None and len(comm_away.individual_votes or []) == 1)
    _, exc = call(v.CommitteeDecisionViewSet, "post", owner,
                  "committee/finalize-decision/",
                  {"application_id": app_away.pk, "decision": "ACCEPT",
                   "rationale": "because"}, action="finalize_decision")
    app_away.refresh_from_db()
    ok("a decision cannot be finalised on an application outside the tenant",
       isinstance(exc, (ValidationError, PermissionDenied)))
    ok("...and the application's status is unchanged", app_away.status == "SUBMITTED")
    resp, _ = call(v.CommitteeDecisionViewSet, "post", owner, "committee/cast-vote/",
                   {"application_id": "not-a-number", "vote": "YES"},
                   action="cast_vote")
    ok("a malformed application id in a ballot answers as unknown, not 500",
       resp is not None and resp.status_code == 404)

    _, exc = call(v.ReviewAssignmentViewSet, "get", owner,
                  f"review-assignments/candidates/?program_id={away.pk}",
                  action="candidates")
    ok("the reviewer picker refuses a program the caller does not work in",
       isinstance(exc, ValidationError))
    _, exc = call(v.ReviewAssignmentViewSet, "get", owner,
                  f"review-assignments/candidates/?application_id={app_away.pk}",
                  action="candidates")
    ok("...nor resolves one out of another team's application",
       isinstance(exc, ValidationError))
    _, exc = call(v.ReviewAssignmentViewSet, "get", owner,
                  "review-assignments/candidates/?application_id=abc",
                  action="candidates")
    ok("a malformed application_id in the picker is refused by name",
       isinstance(exc, ValidationError) and "application_id" in fields_of(exc))
    _, exc = call(v.ReviewAssignmentViewSet, "get", owner,
                  "review-assignments/candidates/", action="candidates")
    ok("the picker says which scope it needs instead of serving every program",
       isinstance(exc, ValidationError))
    os_models.ProgramStaffMembership.objects.create(
        program=own, user=reviewer, role="reviewer")
    resp, exc = call(v.ReviewAssignmentViewSet, "get", owner,
                     f"review-assignments/candidates/?program_id={own.pk}",
                     action="candidates")
    picked = next((c for c in (resp.data["candidates"] if resp else [])
                   if c["id"] == reviewer.pk), None) if exc is None else None
    ok("the picker still answers for a program the caller works",
       exc is None and picked is not None)
    ok("...and counts one program's load rather than every program's",
       picked is not None and picked["open_assignments"] == 1
       and picked["scorecards_filed"] == 1 and picked["open_diligence"] == 1
       and picked["on_program_team"] is True)

    q_away = ApplicationQuestion.objects.create(program=away, text="Rival's private question")
    q_own = ApplicationQuestion.objects.create(program=own, text="Revenue?")
    _, exc = call(v.QuestionResponseViewSet, "post", owner, "responses/batch-save/",
                  {"responses": [{"question": q_away.pk, "application": app_away.pk,
                                  "text_response": "x"}]}, action="batch_save")
    ok("answers cannot be batch-saved onto another program's application",
       isinstance(exc, (ValidationError, PermissionDenied)))
    resp, exc = call(v.QuestionResponseViewSet, "post", owner, "responses/batch-save/",
                     {"responses": [{"question": q_own.pk, "application": app_own.pk,
                                     "text_response": "9"}]}, action="batch_save")
    ok("...and a matching pair still saves",
       exc is None and resp is not None and resp.data["saved_count"] == 1)
    _, exc = call(v.QuestionResponseViewSet, "post", owner, "responses/batch-save/",
                  {"responses": [{"question": q_away.pk, "application": app_own.pk,
                                  "text_response": "x"}]}, action="batch_save")
    ok("a question from another program is refused even on your own application",
       isinstance(exc, ValidationError) and "question" in fields_of(exc))
    _, exc = call(v.QuestionResponseViewSet, "post", founder_a, "responses/batch-save/",
                  {"responses": [{"question": q_own.pk, "application": app_away.pk,
                                  "text_response": "x"}]}, action="batch_save")
    ok("a founder cannot file answers under someone else's application",
       isinstance(exc, (PermissionDenied, ValidationError)))

    resp, exc = call(v.AcceleratorApplicationViewSet, "post", owner,
                     "applications/batch-analyze/", {"application_ids": [app_away.pk]},
                     action="batch_analyze")
    app_away.refresh_from_db()
    ok("automated triage does not run on an application outside the tenant",
       resp is not None and resp.status_code == 400)
    ok("...it reports the row as asked-but-not-run rather than a clean run",
       resp is not None and resp.data["requested"] == 1 and resp.data["ran"] == 0
       and resp.data["not_run"] == 1)
    ok("...and the rival's screening tier is untouched",
       app_away.automated_screening_tier in ("", None))
    _, exc = call(v.AcceleratorApplicationViewSet, "post", owner,
                  "applications/batch-analyze/", {"program_id": "abc"},
                  action="batch_analyze")
    ok("batch-analyze refuses a malformed program_id in the body",
       isinstance(exc, ValidationError) and "program_id" in fields_of(exc))

    # ── C. The cohort/delivery factory: the tenant comes first ───────────────
    mem_away = ProgramMembership.objects.create(application=app_away, program=away)
    mem_own = ProgramMembership.objects.create(application=app_own, program=own)
    COHORT = [
        (coh.ProgramMembershipViewSet, "memberships", mem_away, mem_own),
        (coh.RiskSignalViewSet, "risk-signals",
         os_models.RiskSignal.objects.create(membership=mem_away, program=away,
                                             signal_type="traction",
                                             title="Rival: revenue falling"),
         os_models.RiskSignal.objects.create(membership=mem_own, program=own,
                                             signal_type="traction",
                                             title="Revenue falling")),
        (coh.OfferLetterViewSet, "offer-letters",
         os_models.OfferLetter.objects.create(application=app_away, program=away), None),
    ]
    cyc_away = ApplicationCycle.objects.create(name=f"Away cycle {tag}", program=away)
    ws_away = os_models.CohortWorkspace.objects.create(
        cycle=cyc_away, program=away, cohort_name=f"Away cohort {tag}")
    COHORT.append((coh.CohortWorkspaceViewSet, "cohorts", ws_away, None))
    COHORT.append((coh.CurriculumWeekViewSet, "curriculum-weeks",
                   os_models.CurriculumWeek.objects.create(
                       program=away, week_number=1, title="Rival week"), None))
    mentor = os_models.MentorProfile.objects.create(
        user=mentor_user, full_name=f"Mo {tag}", embedding_vector=[0.1, 0.2])
    massign_away = os_models.MentorAssignment.objects.create(
        membership=mem_away, workspace=ws_away, mentor=mentor)
    COHORT.append((coh.MentorAssignmentViewSet, "mentor-assignments", massign_away, None))
    COHORT.append((coh.MentorSessionViewSet, "mentor-sessions",
                   os_models.MentorSession.objects.create(assignment=massign_away), None))
    mreq_away = os_models.MentorMatchRequest.objects.create(
        membership=mem_away, challenge_description="Rival: hiring")
    COHORT.append((coh.MentorMatchRequestViewSet, "mentor-requests", mreq_away, None))

    for cls, path, foreign, local in COHORT:
        mine = scoped(cls, owner, f"{path}/")
        ok(f"{path}: the factory no longer starts at every row", foreign.pk not in mine)
        ok(f"{path}: the owning team reads its own",
           foreign.pk in scoped(cls, rival, f"{path}/"))
        ok(f"{path}: staff reads either", foreign.pk in scoped(cls, staffer, f"{path}/"))
        ok(f"{path}: naming a foreign program in the query adds nothing",
           foreign.pk not in scoped(cls, owner, f"{path}/?program_id={away.pk}"))
        _, exc = call(cls, "patch", owner, f"{path}/{foreign.pk}/", {"title": "Vandalised"},
                      action="partial_update", pk=foreign.pk)
        ok(f"{path}: a rival's row is a 404 to PATCH, not an edit", isinstance(exc, Http404))
        if local is not None:
            ok(f"{path}: the caller's own row survives", local.pk in mine)

    ok("a founder reads the enrolment on their own application",
       mem_own.pk in scoped(coh.ProgramMembershipViewSet, founder_a, "memberships/"))
    ok("...and never another founder's",
       mem_away.pk not in scoped(coh.ProgramMembershipViewSet, founder_a, "memberships/"))
    risk_mine = scoped(coh.RiskSignalViewSet, founder_a, "risk-signals/")
    ok("a founder's delivery rows are the ones on their own enrolment",
       any(r.membership_id == mem_own.pk for r in
           os_models.RiskSignal.objects.filter(pk__in=risk_mine))
       and mem_away.pk not in {r.membership_id for r in
                               os_models.RiskSignal.objects.filter(pk__in=risk_mine)})
    ok("a founder is refused at the permission class on cohort writes",
       not may(coh.RiskSignalViewSet, founder_a, "post", "create"))

    before = os_models.RiskSignal.objects.count()
    _, exc = call(coh.RiskSignalViewSet, "post", owner, "risk-signals/", {
        "membership": mem_away.pk, "program": away.pk,
        "signal_type": "traction", "title": f"Planted {tag}"})
    ok("a cohort row cannot be filed against another team's membership",
       isinstance(exc, ValidationError)
       and not os_models.RiskSignal.objects.filter(title=f"Planted {tag}").exists())
    _, exc = call(coh.RiskSignalViewSet, "post", owner, "risk-signals/", {
        "membership": mem_own.pk, "program": away.pk,
        "signal_type": "traction", "title": f"Two tenants {tag}"})
    ok("a body naming two different programs is refused: a row sits in one tenant",
       isinstance(exc, ValidationError) and "program" in fields_of(exc)
       and not os_models.RiskSignal.objects.filter(title=f"Two tenants {tag}").exists())
    resp, exc = call(coh.RiskSignalViewSet, "post", owner, "risk-signals/", {
        "membership": mem_own.pk, "program": own.pk,
        "signal_type": "traction", "title": f"Filed {tag}"})
    ok("the matching pair still saves",
       exc is None and os_models.RiskSignal.objects.count() == before + 1)

    # The mentor bench is the one stated exception: no program, so nothing to
    # leak — a directory of people rather than another team's pipeline.
    ok("the mentor bench is listed across tenants, by design",
       mentor.pk in scoped(coh.MentorProfileViewSet, owner, "mentors/")
       and mentor.pk in scoped(coh.MentorProfileViewSet, founder_a, "mentors/"))
    ok("...and its row carries no matcher internals",
       "embedding_vector" not in MentorProfileSerializer(mentor).data)

    _, exc = call(coh.MentorMatchRequestViewSet, "post", owner,
                  f"mentor-requests/{mreq_away.pk}/match/", {"mentor_profile": mentor.pk},
                  action="match", handler="match", pk=mreq_away.pk)
    mreq_away.refresh_from_db()
    ok("a mentor cannot be matched onto another team's member",
       isinstance(exc, Http404) and mreq_away.status == "pending")
    _, exc = call(coh.MentorMatchRequestViewSet, "post", rival,
                  f"mentor-requests/{mreq_away.pk}/match/", {"mentor_profile": "abc"},
                  action="match", handler="match", pk=mreq_away.pk)
    mreq_away.refresh_from_db()
    ok("a malformed mentor id is refused before the request is marked matched",
       isinstance(exc, ValidationError) and mreq_away.status == "pending")
    _, exc = call(coh.MentorMatchRequestViewSet, "post", rival,
                  f"mentor-requests/{mreq_away.pk}/match/", {"mentor_profile": 999999},
                  action="match", handler="match", pk=mreq_away.pk)
    mreq_away.refresh_from_db()
    ok("a mentor who is not on the bench is refused, and nothing is half-matched",
       isinstance(exc, ValidationError) and mreq_away.status == "pending")
    resp, exc = call(coh.MentorMatchRequestViewSet, "post", rival,
                     f"mentor-requests/{mreq_away.pk}/match/",
                     {"mentor_profile": mentor.pk}, action="match",
                     handler="match", pk=mreq_away.pk)
    mreq_away.refresh_from_db()
    ok("the owning team's match completes, with the assignment it claims",
       exc is None and mreq_away.status == "matched"
       and mreq_away.resolved_assignment_id == resp.data["assignment_id"]
       and os_models.MentorAssignment.objects.get(
           pk=resp.data["assignment_id"]).workspace_id == ws_away.pk)

    # ── D. Bulk reads name a scope; rollups count their own tenant ───────────
    _, exc = call(v.ReviewerAssessmentViewSet, "get", rival, "reviews/")
    ok("an unscoped listing of the reviewer ledger is refused, not served",
       isinstance(exc, ValidationError))
    _, exc = call(v.DiligenceItemViewSet, "get", rival, "diligence-items/")
    ok("...and the same for diligence questions", isinstance(exc, ValidationError))
    _, exc = call(v.ReviewerAssessmentViewSet, "get", rival, "reviews/calibration/",
                  action="calibration")
    ok("calibration is a program's numbers, so it needs a program",
       isinstance(exc, ValidationError))

    def rollup(user, qs):
        return call(v.DiligenceItemViewSet, "get", user,
                    f"diligence-items/rollup/?{qs}", action="rollup")

    def live_apps(prog):
        """The applications a coverage denominator may honestly count."""
        return AcceleratorApplication.objects.filter(program=prog).exclude(
            status__in=["DRAFT", "WITHDRAWN"]).count()

    resp, exc = rollup(owner, f"program_id={own.pk}")
    ok("a rollup scoped to the caller's program answers",
       exc is None and resp.data["program_id"] == own.pk)
    ok("...and its coverage pair counts that program's applications, not its reach",
       exc is None and
       resp.data["applications_covered"] + resp.data["applications_uncovered"]
       == live_apps(own))
    resp_r, exc_r = rollup(rival, f"program_id={away.pk}")
    ok("the owning team's rollup counts the row nobody has looked at, and only theirs",
       exc_r is None and resp_r.data["applications_covered"] == 1
       and resp_r.data["applications_uncovered"] == 1)
    resp_s, exc_s = rollup(staffer, f"program_id={away.pk}")
    ok("a platform account asking about the same program reads the same "
       "denominator — staff is not blinded, and a tenant's number is not widened",
       exc_s is None and exc_r is None
       and (resp_s.data["applications_covered"], resp_s.data["applications_uncovered"])
       == (resp_r.data["applications_covered"], resp_r.data["applications_uncovered"]))
    _, exc = rollup(owner, f"program_id={away.pk}")
    ok("a rollup of another team's program is refused, not answered as zeros",
       isinstance(exc, ValidationError) and "program_id" in fields_of(exc))
    _, exc = rollup(owner, f"application_id={app_away.pk}")
    ok("...and so is one reached through another team's application",
       isinstance(exc, ValidationError) and "application_id" in fields_of(exc))
    resp_a, exc_a = rollup(rival, f"application_id={app_away.pk}")
    ok("naming one's own application resolves to a program rather than opening "
       "the whole tenant",
       exc_a is None and resp_a.data["program_id"] == away.pk
       and resp_a.data["applications_covered"] + resp_a.data["applications_uncovered"]
       == live_apps(away))
    _, exc = rollup(owner, "program_id=abc")
    ok("a malformed program in a rollup is refused by name",
       isinstance(exc, ValidationError) and "program_id" in fields_of(exc))

    resp, _ = call(v.AcceleratorApplicationViewSet, "get", owner,
                   f"applications/screening-summary/?program_id={own.pk}",
                   action="screening_summary")
    resp_all, _ = call(v.AcceleratorApplicationViewSet, "get", staffer,
                       "applications/screening-summary/", action="screening_summary")
    ok("the funnel's totals cover the caller's tenant, not the database",
       resp.data["total"] < resp_all.data["total"])

    # ── E. The work inbox: whose desk, which program, what a bad id costs ────
    _, exc = call(v.WorkInboxView, "get", owner, "work-inbox/", handler="get")
    ok("the work inbox asks for a program rather than assuming one",
       isinstance(exc, ValidationError) and "program_id" in fields_of(exc))
    _, exc = call(v.WorkInboxView, "get", owner, "work-inbox/?program_id=abc",
                  handler="get")
    ok("...and a present-but-malformed one is refused, not served unscoped",
       isinstance(exc, ValidationError) and "must be an integer" in str(exc.detail))
    resp, exc = call(v.WorkInboxView, "get", owner, f"work-inbox/?program_id={away.pk}",
                     handler="get")
    ok("a program outside the tenant answers as unknown",
       isinstance(exc, NotFound) and resp is None)
    # The reviewer runs two programs they can see: a public one they work, and a
    # private one of their own. One seat and one question in each.
    os_models.ReviewAssignment.objects.create(application=app_pub, reviewer=reviewer,
                                              round_id="round-1", assigned_by=rival)
    os_models.ReviewAssignment.objects.create(application=app_home, reviewer=reviewer,
                                              round_id="round-1", assigned_by=reviewer)
    DiligenceItem.objects.create(application=app_pub, owner=reviewer, created_by=rival,
                                 question="Send the ledger")
    DiligenceItem.objects.create(application=app_home, owner=reviewer, created_by=reviewer,
                                 question="Send the ledger")
    resp, exc = call(v.WorkInboxView, "get", reviewer,
                     f"work-inbox/?program_id={published.pk}", handler="get")
    ok("a reviewer's inbox counts the rows carrying their name in this program",
       exc is None and resp.data["counts"]["reviews"] == 1
       and resp.data["counts"]["diligence"] == 1
       and resp.data["total_open"] == 2
       and {i["application_id"] for i in resp.data["items"]} == {app_pub.pk})
    resp2, exc2 = call(v.WorkInboxView, "get", reviewer,
                       f"work-inbox/?program_id={home.pk}", handler="get")
    ok("...and not the same person's rows in the other program they can see",
       exc2 is None and {i["application_id"] for i in resp2.data["items"]} == {app_home.pk})
    resp, exc = call(v.WorkInboxView, "get", staffer,
                     f"work-inbox/?program_id={own.pk}", handler="get")
    ok("staff is not blinded by a visible-programs lookup", exc is None)

    # ── F. Missing is not zero, and withheld is not empty ────────────────────
    mine = scoped(v.AcceleratorApplicationViewSet, founder_a, "applications/")
    ok("a founder reads their own submissions, including a public program's",
       {app_own.pk, app_pub.pk} <= mine)
    ok("...and never another founder's row", app_away.pk not in mine)
    team_view = call(v.InterviewSessionViewSet, "get", rival,
                     f"interviews/{iv_away.pk}/", action="retrieve", pk=iv_away.pk)
    body = team_view[0].data if team_view[0] else {}
    ok("the program team reads the transcript they recorded",
       isinstance(body.get("transcript"), list) and len(body["transcript"]) == 1)
    _, exc = call(v.InterviewSessionViewSet, "get", founder_a,
                  f"interviews/{iv_away.pk}/", action="retrieve", pk=iv_away.pk)
    ok("a founder cannot read an interview on someone else's application",
       isinstance(exc, Http404))
    theirs, exc = call(v.InterviewSessionViewSet, "get", founder_b,
                       f"interviews/{iv_away.pk}/", action="retrieve", pk=iv_away.pk)
    ok("...while the founder who sat in it reads the row, with the interviewers' "
       "notes withheld and the turn count kept",
       exc is None and theirs.data["transcript"] is None
       and theirs.data["transcript_turn_count"] == 1)
    quiet = InterviewSession.objects.create(
        application=app_own, interview_type="human_video", round_number=1,
        interviewer=owner, status="scheduled", transcript=[])
    as_founder = Request(factory.get("/x/"), parsers=[JSONParser()])
    as_founder.user = founder_a
    withheld = v.InterviewSessionSerializer(quiet, context={"request": as_founder}).data
    as_team = Request(factory.get("/x/"), parsers=[JSONParser()])
    as_team.user = owner
    seen = v.InterviewSessionSerializer(quiet, context={"request": as_team}).data
    ok("a founder's own interview answers with the body withheld and the count kept",
       withheld["transcript"] is None and withheld["transcript_turn_count"] == 0)
    ok("...which is a different answer from the team's empty list",
       seen["transcript"] == [])

    ghost = call(intel.EvidenceGraphView, "get", owner,
                 "evidence-graph/?application_id=99999999", handler="get")[0]
    foreign = call(intel.EvidenceGraphView, "get", owner,
                   f"evidence-graph/?application_id={app_away.pk}", handler="get")[0]
    ok("the evidence graph answers about a rival's application exactly as about one "
       "that does not exist",
       ghost.status_code == foreign.status_code == 404 and ghost.data == foreign.data)
    ok("...while the team holding it gets the traversal",
       call(intel.EvidenceGraphView, "get", rival,
            f"evidence-graph/?application_id={app_away.pk}",
            handler="get")[0].status_code == 200)
    _, exc = call(intel.EvidenceGraphView, "get", rival,
                  "evidence-graph/?application_id=abc", handler="get")
    ok("a malformed application id on the graph is a refusal naming it",
       isinstance(exc, ValidationError) and "application_id" in fields_of(exc))

    # ── G. A program-less row stays a decision, not a default ────────────────
    for label, reason in NULL_PROGRAM_READABLE.items():
        Model = apps.get_model("accelerator", label.split(".")[1].capitalize())
        ok(f"allowlisted {label} is a real model", Model._meta.label.lower() == label)
        ok("...described rather than merely named", len(reason) > 40)
        ok("...and its program really is nullable, which is what the entry is about",
           Model._meta.get_field("program").null)
    role_global = ProgramRole.objects.create(name=f"Global role {tag}",
                                             slug=f"tb-global-{tag}", program=None)
    evt_global = EventOutbox.objects.create(event_type=f"cycle.opened.{tag}", program=None)
    evt_away = EventOutbox.objects.create(event_type=f"app.moved.{tag}", program=away)
    ok("a platform role definition is readable from outside every tenant",
       role_global.pk in scoped(cfg.ProgramRoleViewSet, owner, "program-roles/"))
    ok("...and so is a platform event",
       evt_global.pk in scoped(cfg.EventOutboxViewSet, owner, "events/"))
    ok("...while a program's event is not",
       evt_away.pk not in scoped(cfg.EventOutboxViewSet, owner, "events/"))
    invitation = ProgramInvitation.objects.create(
        email=f"invited-{tag}@x.io", role="reviewer", token=uuid.uuid4().hex,
        organization=org, program=None,
        expires_at=timezone.now() + datetime.timedelta(days=3))
    _, as_owner = _view(cfg.ProgramStageViewSet, "get", "/x/", owner, "list")
    ok("a model that is NOT allowlisted keeps its null-program rows out: strict "
       "filtering is the default",
       invitation.pk not in scope_to_visible_programs(
           ProgramInvitation.objects.all(), as_owner).values_list("id", flat=True))
    _, as_founder_req = _view(cfg.ProgramStageViewSet, "get", "/x/", founder_a, "list")
    ok("...and a founder is handed nothing from a table with no path to their own "
       "application",
       scope_cohort_rows(os_models.CurriculumWeek.objects.all(), as_founder_req,
                         "program", None).count() == 0)

    # ── H. The id coercion itself ────────────────────────────────────────────
    for bad in ("abc", "0", "-1", "", None, "1.5", "12x"):
        try:
            positive_int(bad, "program_id")
            ok(f"positive_int refuses {bad!r}", False)
        except ValidationError as exc:
            ok(f"positive_int refuses {bad!r} and names the field",
               "program_id" in fields_of(exc))
    ok("positive_int accepts a real id", positive_int("12", "program_id") == 12)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
