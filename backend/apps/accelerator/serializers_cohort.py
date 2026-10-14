"""
apps.accelerator.serializers_cohort
===================================
Serializers for the Cohort OS, People & Relationship OS, Program Delivery OS
and Outcome OS. These back the operational half of the Program OS (everything
after selection): cohorts, tracks, curriculum, events, mentorship, tasks,
onboarding, metrics, assessments, investor readiness, demo day, offers,
graduation, outcomes and alumni.

The operational models are numerous and mostly expose their own columns, so they
use a compact ModelSerializer factory over ``fields = "__all__"``. Read/write
scoping (program / membership) is enforced in the viewsets, not the serializers.
"""
from __future__ import annotations

from rest_framework import serializers

from . import models_os as os_models
from .models import ProgramMembership


def _model_serializer(model, exclude=()) -> type:
    """`fields = "__all__"`, with the timestamp columns held by the database.

    `exclude` drops a column from the payload. DRF refuses `fields` and `exclude`
    on the same Meta, so the wildcard is expanded by building the all-fields
    serializer once and reading back its own field names — which keeps the
    reverse relations `__all__` includes rather than hand-listing them.
    """
    ro = [f for f in ("created_at", "updated_at") if hasattr(model, f)]

    def build(fields):
        meta = type("Meta", (), {
            "model": model,
            "fields": fields,
            "read_only_fields": ro,
        })
        return type(f"{model.__name__}Serializer", (serializers.ModelSerializer,), {"Meta": meta})

    if not exclude:
        return build("__all__")
    return build([name for name in build("__all__")().fields if name not in exclude])


class ProgramMembershipSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(
        source="application.startup_profile.company_name", read_only=True
    )

    class Meta:
        model = ProgramMembership
        fields = "__all__"
        read_only_fields = ["enrolled_at"]


# Model -> serializer built from the factory (kept explicit so typos fail loudly).
ProgramTrackSerializer = _model_serializer(os_models.ProgramTrack)
CohortWorkspaceSerializer = _model_serializer(os_models.CohortWorkspace)
CurriculumWeekSerializer = _model_serializer(os_models.CurriculumWeek)
CohortEventSerializer = _model_serializer(os_models.CohortEvent)
EventAttendanceSerializer = _model_serializer(os_models.EventAttendance)
# The bench is a directory, so its rows are read by every authenticated account.
# The vector the matcher computes for a mentor is not part of a directory: it is
# an internal representation, and publishing it would let a reader probe who the
# matcher considers similar to whom.
MentorProfileSerializer = _model_serializer(
    os_models.MentorProfile, exclude=["embedding_vector"])
MentorSessionSerializer = _model_serializer(os_models.MentorSession)
MentorAssignmentSerializer = _model_serializer(os_models.MentorAssignment)
MentorMatchRequestSerializer = _model_serializer(os_models.MentorMatchRequest)
FounderTaskSerializer = _model_serializer(os_models.FounderTask)
OnboardingChecklistSerializer = _model_serializer(os_models.OnboardingChecklist)
BaselineMetricsSerializer = _model_serializer(os_models.BaselineMetrics)
MetricSnapshotSerializer = _model_serializer(os_models.MetricSnapshot)
ProgramAssessmentSerializer = _model_serializer(os_models.ProgramAssessment)
MemberAssessmentResultSerializer = _model_serializer(os_models.MemberAssessmentResult)
InvestorReadinessReportSerializer = _model_serializer(os_models.InvestorReadinessReport)
DemoDaySlotSerializer = _model_serializer(os_models.DemoDaySlot)
InvestorIntroductionSerializer = _model_serializer(os_models.InvestorIntroduction)
OfferLetterSerializer = _model_serializer(os_models.OfferLetter)
ProgramGraduationSerializer = _model_serializer(os_models.ProgramGraduation)
OutcomeRecordSerializer = _model_serializer(os_models.OutcomeRecord)
OutcomeSurveySerializer = _model_serializer(os_models.OutcomeSurvey)
AlumniProfileSerializer = _model_serializer(os_models.AlumniProfile)
RiskSignalSerializer = _model_serializer(os_models.RiskSignal)
InterventionLogSerializer = _model_serializer(os_models.InterventionLog)
