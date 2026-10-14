"""
apps.accelerator.views_cohort
=============================
REST viewsets for the operational Program OS subsystems (Cohort, People,
Delivery, Outcome). Every one of them is built by `_scoped_viewset`, which puts
the tenant rule in front of the caller's filters: a program-team account reads
and writes rows inside the programs it works in, a founder reads only the rows
on their own enrolment, staff reads everywhere. Reads need an authenticated
user; writes need an accelerator manager or staff (same rule as the rest of the
accelerator API).

The mentor bench (`MentorProfileViewSet`) is the one resource with no program to
reach — a mentor is a person on the platform's bench, not another team's data —
so it is listed to any authenticated account and is the only exception here.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from . import models_os as os_models
from .models import ProgramMembership
from .serializers_cohort import (
    AlumniProfileSerializer,
    BaselineMetricsSerializer,
    CohortEventSerializer,
    CohortWorkspaceSerializer,
    CurriculumWeekSerializer,
    DemoDaySlotSerializer,
    EventAttendanceSerializer,
    FounderTaskSerializer,
    InvestorIntroductionSerializer,
    InvestorReadinessReportSerializer,
    InterventionLogSerializer,
    MemberAssessmentResultSerializer,
    MentorAssignmentSerializer,
    MentorMatchRequestSerializer,
    MentorProfileSerializer,
    MentorSessionSerializer,
    MetricSnapshotSerializer,
    OnboardingChecklistSerializer,
    OfferLetterSerializer,
    OutcomeRecordSerializer,
    OutcomeSurveySerializer,
    ProgramAssessmentSerializer,
    ProgramGraduationSerializer,
    ProgramMembershipSerializer,
    ProgramTrackSerializer,
    RiskSignalSerializer,
)
from .tenant import TenantScopedWriteMixin, positive_int, scope_cohort_rows
from .views_config import ReadOnlyOrAccelerator


_FILTERABLE = ("membership_id", "application_id", "event_id", "mentor_id", "assignment_id")


def _path(lookup):
    """`"membership__program_id"` → `"membership__program"`.

    The lookups were written as database column names; the scopers take relation
    paths and add the `_id` themselves, so one spelling per idea.
    """
    return lookup[:-3] if lookup and lookup.endswith("_id") else lookup


def _scoped_viewset(model, serializer, scope, *, default_order="-id", on_create=None,
                    program_lookup=None, membership_lookup=None):
    # Default program/membership filter paths derived from the coarse scope.
    # Some models reach the program through an intermediate relation (e.g. a
    # cohort workspace or a mentor assignment) and override these lookups.
    if program_lookup is None:
        program_lookup = {
            "program": "program_id",
            "membership": "membership__program_id",
            "none": None,
        }.get(scope)
    if membership_lookup is None:
        membership_lookup = "membership_id" if scope == "membership" else None

    program_path = _path(program_lookup)
    membership_path = _path(membership_lookup)
    # A founder's own rows are the ones hanging off the application they
    # submitted: through the enrolment, or through whatever relation carries it.
    founder_path = (
        f"{membership_path}__application" if membership_path
        else ("application" if any(f.name == "application" for f in model._meta.get_fields())
              else None)
    )

    # The write guard only makes sense where a program can be named: a mentor
    # profile has none, and demanding one would refuse every mentor on the bench.
    bases = ((TenantScopedWriteMixin, viewsets.ModelViewSet) if program_path
             else (viewsets.ModelViewSet,))

    class ViewSet(*bases):
        serializer_class = serializer
        permission_classes = [ReadOnlyOrAccelerator]
        # Both paths recorded on the class, not kept only in the factory's
        # arguments, so "who reads this table" is a question the surface answers
        # rather than one a test has to re-derive: `read_scope` is the relation
        # the tenant is reached through (None for the platform-level bench),
        # `founder_scope` is how a founder reaches their own rows, or None when
        # the table is the program team's view and a founder reads nothing.
        read_scope = program_path
        founder_scope = founder_path
        if program_path:
            # Delivery records are work done inside a program, so the reviewer
            # needs the program in sight rather than to own it.
            program_source = program_path
            program_write_rule = "visible"

        def get_queryset(self):
            """The tenant first, the caller's filters second.

            This factory used to start at `model.objects.all()` and narrow by
            whatever `?program_id=` arrived with the request — a *filter*
            standing in for a boundary, so leaving the parameter out returned
            every team's mentor sessions, risk signals and offer letters, and
            naming a foreign one returned that team's instead.
            """
            qs = model.objects.all()
            if program_path:
                qs = scope_cohort_rows(qs, self.request, program_path, founder_path)
            qp = self.request.query_params
            pid = qp.get("program_id") or qp.get("program")
            if pid and program_path:
                qs = qs.filter(**{f"{program_path}_id": positive_int(pid, "program_id")})
            mid = qp.get("membership_id")
            if mid and membership_path:
                qs = qs.filter(**{f"{membership_path}_id":
                                  positive_int(mid, "membership_id")})
            for key in _FILTERABLE:
                value = qp.get(key)
                if value and hasattr(model, key[:-3]):  # strip _id
                    # Every one of these is a caller-supplied id about to reach a
                    # lookup: refused by name when it is not one.
                    qs = qs.filter(**{key[:-3]: positive_int(value, key)})
            st = qp.get("status")
            if st:
                try:
                    qs = qs.filter(status=st)
                except Exception:  # noqa: BLE001 - model has no usable status
                    pass
            return qs.order_by(default_order)

        def perform_create(self, serializer):
            if program_path:
                self._assert_writable(serializer)  # the mixin's, not the default hook
            instance = serializer.save()
            if on_create is not None:
                on_create(instance, self.request)

    ViewSet.__name__ = f"{model.__name__}ViewSet"
    return ViewSet


# ── Membership / Cohort core ─────────────────────────────────────────────────
ProgramMembershipViewSet = _scoped_viewset(
    ProgramMembership, ProgramMembershipSerializer, "program", default_order="-enrolled_at"
)
ProgramTrackViewSet = _scoped_viewset(os_models.ProgramTrack, ProgramTrackSerializer, "program", default_order="order") if hasattr(os_models.ProgramTrack, "order") else _scoped_viewset(os_models.ProgramTrack, ProgramTrackSerializer, "program")
CohortWorkspaceViewSet = _scoped_viewset(os_models.CohortWorkspace, CohortWorkspaceSerializer, "program")
CohortEventViewSet = _scoped_viewset(os_models.CohortEvent, CohortEventSerializer, "program", default_order="scheduled_at", program_lookup="workspace__program_id", membership_lookup=None)
EventAttendanceViewSet = _scoped_viewset(os_models.EventAttendance, EventAttendanceSerializer, "membership")
CurriculumWeekViewSet = _scoped_viewset(os_models.CurriculumWeek, CurriculumWeekSerializer, "program", default_order="week_number")
ProgramAssessmentViewSet = _scoped_viewset(os_models.ProgramAssessment, ProgramAssessmentSerializer, "program", program_lookup="workspace__program_id", membership_lookup=None)
MemberAssessmentResultViewSet = _scoped_viewset(os_models.MemberAssessmentResult, MemberAssessmentResultSerializer, "membership")

# ── People & mentorship ───────────────────────────────────────────────────────
MentorProfileViewSet = _scoped_viewset(os_models.MentorProfile, MentorProfileSerializer, "none")
MentorSessionViewSet = _scoped_viewset(os_models.MentorSession, MentorSessionSerializer, "membership", default_order="-scheduled_at", program_lookup="assignment__membership__program_id", membership_lookup="assignment__membership_id")
MentorAssignmentViewSet = _scoped_viewset(os_models.MentorAssignment, MentorAssignmentSerializer, "membership")


def _complete_match_request(instance, request):
    pass  # no-op; the explicit action below handles matching.


MentorMatchRequestViewSet = _scoped_viewset(os_models.MentorMatchRequest, MentorMatchRequestSerializer, "membership")


@action(detail=True, methods=["post"], url_path="match", permission_classes=[ReadOnlyOrAccelerator])
def match(self, request, pk=None):  # pragma: no cover - attached below
    req = self.get_object()
    mentor_id = request.data.get("mentor_profile") or request.data.get("mentor_id")
    mentor = workspace = None
    if mentor_id:
        # Every part is proved before anything is written. Marking the request
        # matched and then failing on the mentor or the cohort would leave a
        # claim on the record that nobody can see the back of.
        mentor = os_models.MentorProfile.objects.filter(
            pk=positive_int(mentor_id, "mentor_profile")).first()
        if mentor is None:
            raise ValidationError(
                {"mentor_profile": "No such mentor on the bench, so nothing is matched."})
        # An assignment hangs off a cohort workspace, so a match without one is a
        # row no cohort view can ever list.
        workspace = (os_models.CohortWorkspace.objects
                     .filter(program=req.membership.program)
                     .order_by("-created_at").first())
        if workspace is None:
            raise ValidationError({"mentor_profile": (
                "This program has no cohort workspace yet, so no mentor can be "
                "assigned to its members. Nothing is matched."
            )})
    req.status = "matched"
    req.save(update_fields=["status"])
    assignment = None
    if mentor is not None:
        assignment = os_models.MentorAssignment.objects.create(
            membership=req.membership, mentor=mentor, workspace=workspace,
            assigned_by=request.user, status="active",
        )
        # "matched" without the row it matched to is a claim with nothing behind
        # it, and the field for that link already exists on the request.
        req.resolved_assignment = assignment
        req.save(update_fields=["resolved_assignment"])
    return Response({
        "request_id": req.id, "status": req.status,
        "assignment_id": assignment.id if assignment else None,
    })


MentorMatchRequestViewSet.match = match

# ── Program delivery: tasks / onboarding / metrics ───────────────────────────
FounderTaskViewSet = _scoped_viewset(os_models.FounderTask, FounderTaskSerializer, "membership", default_order="due_date")
OnboardingChecklistViewSet = _scoped_viewset(os_models.OnboardingChecklist, OnboardingChecklistSerializer, "membership")
BaselineMetricsViewSet = _scoped_viewset(os_models.BaselineMetrics, BaselineMetricsSerializer, "membership")
MetricSnapshotViewSet = _scoped_viewset(os_models.MetricSnapshot, MetricSnapshotSerializer, "membership")

# ── Investor readiness / demo day / offers ───────────────────────────────────
InvestorReadinessReportViewSet = _scoped_viewset(os_models.InvestorReadinessReport, InvestorReadinessReportSerializer, "membership")
DemoDaySlotViewSet = _scoped_viewset(os_models.DemoDaySlot, DemoDaySlotSerializer, "membership")
InvestorIntroductionViewSet = _scoped_viewset(os_models.InvestorIntroduction, InvestorIntroductionSerializer, "membership")
OfferLetterViewSet = _scoped_viewset(os_models.OfferLetter, OfferLetterSerializer, "program", default_order="-id")


def _ensure_alumni(graduation, request):
    os_models.AlumniProfile.objects.get_or_create(
        membership=graduation.membership,
        defaults={
            "program": graduation.membership.program,
            "organization": getattr(graduation.membership.program, "organization", None),
        },
    )


ProgramGraduationViewSet = _scoped_viewset(
    os_models.ProgramGraduation, ProgramGraduationSerializer, "membership", on_create=_ensure_alumni
)

# ── Outcomes / alumni / risk ─────────────────────────────────────────────────
OutcomeRecordViewSet = _scoped_viewset(os_models.OutcomeRecord, OutcomeRecordSerializer, "membership")
AlumniProfileViewSet = _scoped_viewset(os_models.AlumniProfile, AlumniProfileSerializer, "program")
RiskSignalViewSet = _scoped_viewset(os_models.RiskSignal, RiskSignalSerializer, "membership")
InterventionLogViewSet = _scoped_viewset(os_models.InterventionLog, InterventionLogSerializer, "membership")


@action(detail=True, methods=["post"], url_path="complete", permission_classes=[ReadOnlyOrAccelerator])
def complete(self, request, pk=None):  # pragma: no cover
    survey = self.get_object()
    if request.data.get("responses") is not None:
        # Store on whichever JSON field the model exposes for answers.
        for attr in ("responses", "answers", "data"):
            if hasattr(os_models.OutcomeSurvey, attr):
                setattr(survey, attr, request.data["responses"])
                break
    survey.status = "completed"
    survey.completed_at = timezone.now()
    survey.save()
    return Response({"id": survey.id, "status": survey.status})


OutcomeSurveyViewSet = _scoped_viewset(os_models.OutcomeSurvey, OutcomeSurveySerializer, "membership")
OutcomeSurveyViewSet.complete = complete
