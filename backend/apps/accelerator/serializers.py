"""
apps.accelerator.serializers
============================
DRF serializers for the Venture Admissions OS.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from .models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAssessment,
    ApplicationClaim,
    ApplicationDocument,
    ApplicationQuestion,
    ClaimEvidence,
    CommitteeDecision,
    ContinuousAssessment,
    EvidenceRequest,
    FounderApplicationProfile,
    InterviewSession,
    MilestoneTemplate,
    ProgramMembership,
    QuestionResponse,
    ReviewerAssessment,
    ReviewerDisagreement,
    StartupApplicationProfile,
    StartupMilestone,
)


# ─── Program ──────────────────────────────────────────────────────────────────

class AcceleratorProgramListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for marketplace listing."""
    total_applications = serializers.SerializerMethodField()
    days_until_deadline = serializers.SerializerMethodField()

    class Meta:
        model = AcceleratorProgram
        fields = [
            "id", "name", "organization_name", "slug", "logo_url", "tagline",
            "sector_focus", "geography_focus", "stage_focus",
            "equity_offered_pct", "funding_amount_usd", "program_duration_weeks",
            "is_remote", "location", "application_deadline", "cohort_start_date",
            "program_cycle", "target_cohort_size", "total_applications",
            "days_until_deadline", "is_active", "is_public",
        ]

    def get_total_applications(self, obj):
        return obj.applications.count()

    def get_days_until_deadline(self, obj):
        if obj.application_deadline:
            delta = obj.application_deadline - timezone.now()
            return max(0, delta.days)
        return None


class AcceleratorProgramDetailSerializer(serializers.ModelSerializer):
    """Full program detail including eligibility rules and question config."""
    total_applications = serializers.SerializerMethodField()

    class Meta:
        model = AcceleratorProgram
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]

    def get_total_applications(self, obj):
        return obj.applications.count()


class AcceleratorProgramWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcceleratorProgram
        exclude = ["created_at", "updated_at", "created_by"]


# ─── Eligibility Check ────────────────────────────────────────────────────────

class EligibilityCheckSerializer(serializers.Serializer):
    """Input for real-time eligibility check."""
    country = serializers.CharField(required=False, default="")
    sector = serializers.CharField(required=False, default="")
    stage = serializers.CharField(required=False, default="pre_seed")
    incorporated = serializers.BooleanField(required=False, default=False)
    full_time = serializers.BooleanField(required=False, default=True)
    total_funding_raised_usd = serializers.FloatField(required=False, default=0)
    team_size = serializers.IntegerField(required=False, default=1)
    previous_accelerator = serializers.BooleanField(required=False, default=False)
    revenue_usd = serializers.FloatField(required=False, default=0)


# ─── Founder & Startup Profile ───────────────────────────────────────────────

class FounderApplicationProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = FounderApplicationProfile
        exclude = ["user"]
        read_only_fields = ["created_at", "updated_at", "profile_completeness"]


class StartupApplicationProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StartupApplicationProfile
        exclude = ["founder_profile"]
        read_only_fields = ["created_at", "updated_at", "profile_completeness"]


# ─── Questions ────────────────────────────────────────────────────────────────

class ApplicationQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationQuestion
        exclude = ["program"]
        read_only_fields = ["id"]


class QuestionResponseSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source="question.text", read_only=True)
    question_category = serializers.CharField(source="question.category", read_only=True)

    class Meta:
        model = QuestionResponse
        fields = "__all__"
        read_only_fields = ["last_saved_at", "extracted_claims", "ai_score", "ai_score_reasoning", "word_count"]


# ─── Documents ───────────────────────────────────────────────────────────────

class ApplicationDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationDocument
        fields = "__all__"
        read_only_fields = ["uploaded_at", "extracted_at", "extraction_status",
                            "extracted_claims_count", "parsed_content"]


# ─── Claims ──────────────────────────────────────────────────────────────────

class ClaimEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClaimEvidence
        fields = "__all__"
        read_only_fields = ["verified_at"]


class ApplicationClaimSerializer(serializers.ModelSerializer):
    evidence_detail = ClaimEvidenceSerializer(read_only=True)

    class Meta:
        model = ApplicationClaim
        fields = "__all__"
        read_only_fields = ["created_at", "verified_at", "claim_id"]


# ─── Assessment ──────────────────────────────────────────────────────────────

class ApplicationAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationAssessment
        fields = "__all__"
        read_only_fields = ["generated_at", "engine_version"]


# ─── Application ─────────────────────────────────────────────────────────────

class AcceleratorApplicationListSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="startup_profile.company_name", read_only=True)
    program_name = serializers.CharField(source="program.name", read_only=True)
    organization_name = serializers.CharField(source="program.organization_name", read_only=True)
    total_claims = serializers.SerializerMethodField()
    unverified_claims = serializers.SerializerMethodField()
    reviewer_count = serializers.SerializerMethodField()

    class Meta:
        model = AcceleratorApplication
        fields = [
            "id", "company_name", "program_name", "organization_name",
            "status", "automated_screening_tier",
            "program_fit_score", "startup_strength_score",
            "evidence_confidence_score", "application_completeness_score",
            "founder_score", "eligibility_score",
            "stage_conflict_detected", "inferred_stage",
            "total_claims", "unverified_claims", "reviewer_count",
            "submitted_at", "created_at", "updated_at",
        ]

    def get_total_claims(self, obj):
        return obj.claims.count()

    def get_unverified_claims(self, obj):
        return obj.claims.filter(verification_status__in=["pending", "unverified"]).count()

    def get_reviewer_count(self, obj):
        return obj.reviewer_assessments.count()


class AcceleratorApplicationDetailSerializer(serializers.ModelSerializer):
    startup_profile = StartupApplicationProfileSerializer(read_only=True)
    program = AcceleratorProgramListSerializer(read_only=True)
    assessment = ApplicationAssessmentSerializer(read_only=True)
    claims = ApplicationClaimSerializer(many=True, read_only=True)
    documents = ApplicationDocumentSerializer(many=True, read_only=True)
    responses = QuestionResponseSerializer(many=True, read_only=True)
    reviewer_assessments = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="startup_profile.company_name", read_only=True)

    class Meta:
        model = AcceleratorApplication
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at", "submitted_at"]

    def get_reviewer_assessments(self, obj):
        return ReviewerAssessmentSerializer(obj.reviewer_assessments.all(), many=True).data


class AcceleratorApplicationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcceleratorApplication
        fields = ["program", "startup_profile"]

    def validate(self, data):
        # Prevent duplicate applications
        if AcceleratorApplication.objects.filter(
            program=data["program"],
            startup_profile=data["startup_profile"],
        ).exists():
            raise serializers.ValidationError(
                "An application for this program already exists."
            )
        return data


# ─── Reviewer ────────────────────────────────────────────────────────────────

class ReviewerAssessmentSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source="reviewer.full_name", read_only=True)
    reviewer_email = serializers.CharField(source="reviewer.email", read_only=True)

    class Meta:
        model = ReviewerAssessment
        fields = "__all__"
        read_only_fields = ["submitted_at", "updated_at"]


class ReviewerDisagreementSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewerDisagreement
        fields = "__all__"
        read_only_fields = ["detected_at"]


# ─── Interview ───────────────────────────────────────────────────────────────

class InterviewSessionSerializer(serializers.ModelSerializer):
    interviewer_name = serializers.SerializerMethodField()

    class Meta:
        model = InterviewSession
        fields = "__all__"
        read_only_fields = ["created_at"]

    def get_interviewer_name(self, obj):
        if obj.interviewer:
            return obj.interviewer.full_name or obj.interviewer.email
        return "Pitchmic AI"


# ─── Committee ───────────────────────────────────────────────────────────────

class CommitteeDecisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommitteeDecision
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]


# ─── Evidence Request ────────────────────────────────────────────────────────

class EvidenceRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenceRequest
        fields = "__all__"
        read_only_fields = ["created_at", "resolved_at"]


# ─── Cohort / Membership ─────────────────────────────────────────────────────

class MilestoneTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MilestoneTemplate
        exclude = ["program"]


class StartupMilestoneSerializer(serializers.ModelSerializer):
    template_title = serializers.CharField(source="template.title", read_only=True)
    template_category = serializers.CharField(source="template.category", read_only=True)
    template_week = serializers.IntegerField(source="template.week_number", read_only=True)

    class Meta:
        model = StartupMilestone
        fields = "__all__"
        read_only_fields = ["updated_at"]


class ProgramMembershipSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(
        source="application.startup_profile.company_name", read_only=True
    )
    milestones = StartupMilestoneSerializer(many=True, read_only=True)
    milestones_complete = serializers.SerializerMethodField()
    milestones_total = serializers.SerializerMethodField()

    class Meta:
        model = ProgramMembership
        fields = "__all__"
        read_only_fields = ["enrolled_at"]

    def get_milestones_complete(self, obj):
        return obj.milestones.filter(status="complete").count()

    def get_milestones_total(self, obj):
        return obj.milestones.count()


# ─── Continuous Assessment ───────────────────────────────────────────────────

class ContinuousAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContinuousAssessment
        fields = "__all__"
        read_only_fields = ["recorded_at"]


# ─── Pipeline View ───────────────────────────────────────────────────────────

class PipelineSerializer(serializers.Serializer):
    """Summary for the accelerator Pipeline tab (Kanban columns)."""
    program_id = serializers.IntegerField(read_only=True)
    program_name = serializers.CharField(read_only=True)
    tiers = serializers.DictField(read_only=True)
    columns = serializers.DictField(read_only=True)
    funnel_counts = serializers.DictField(read_only=True)
    avg_scores = serializers.DictField(read_only=True)
