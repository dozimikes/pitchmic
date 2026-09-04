"""apps.accelerator.admin - Django admin registration"""
from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import (
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
    AcceleratorApplication,
)


@admin.register(AcceleratorProgram)
class AcceleratorProgramAdmin(admin.ModelAdmin):
    list_display = ["name", "organization_name", "program_cycle", "stage_focus",
                    "application_deadline", "is_active", "is_public"]
    list_filter = ["is_active", "stage_focus", "workflow_style"]
    search_fields = ["name", "organization_name", "slug"]
    prepopulated_fields = {"slug": ("organization_name", "name")}
    readonly_fields = ["created_at", "updated_at"]


@admin.register(FounderApplicationProfile)
class FounderApplicationProfileAdmin(admin.ModelAdmin):
    list_display = ["full_name", "user", "country", "full_time_status", "profile_completeness"]
    search_fields = ["full_name", "user__email", "country"]


@admin.register(StartupApplicationProfile)
class StartupApplicationProfileAdmin(admin.ModelAdmin):
    list_display = ["company_name", "founder_profile", "declared_stage",
                    "revenue_status", "customer_count", "profile_completeness"]
    list_filter = ["declared_stage", "revenue_status", "business_model"]
    search_fields = ["company_name"]


@admin.register(AcceleratorApplication)
class AcceleratorApplicationAdmin(admin.ModelAdmin):
    list_display = ["__str__", "status", "automated_screening_tier",
                    "program_fit_score", "startup_strength_score",
                    "evidence_confidence_score", "submitted_at"]
    list_filter = ["status", "automated_screening_tier", "stage_conflict_detected"]
    search_fields = ["startup_profile__company_name", "program__name"]
    readonly_fields = ["created_at", "updated_at", "submitted_at"]
    date_hierarchy = "created_at"


@admin.register(ApplicationQuestion)
class ApplicationQuestionAdmin(admin.ModelAdmin):
    list_display = ["text", "program", "category", "materiality",
                    "question_type", "is_required", "order"]
    list_filter = ["category", "materiality", "question_type", "is_required"]
    ordering = ["program", "order"]


@admin.register(QuestionResponse)
class QuestionResponseAdmin(admin.ModelAdmin):
    list_display = ["application", "question", "evidence_status", "ai_score", "word_count"]
    list_filter = ["evidence_status"]


@admin.register(ApplicationDocument)
class ApplicationDocumentAdmin(admin.ModelAdmin):
    list_display = ["file_name", "document_type", "application",
                    "extraction_status", "extracted_claims_count", "uploaded_at"]
    list_filter = ["document_type", "extraction_status"]


@admin.register(ApplicationClaim)
class ApplicationClaimAdmin(admin.ModelAdmin):
    list_display = ["claim_id", "claim_text", "category", "materiality",
                    "source", "verification_status"]
    list_filter = ["category", "materiality", "verification_status", "source"]
    search_fields = ["claim_text", "claim_id"]


@admin.register(ClaimEvidence)
class ClaimEvidenceAdmin(admin.ModelAdmin):
    list_display = ["claim", "claimed_count", "documents_found", "documents_signed",
                    "unique_entities", "confidence"]


@admin.register(ApplicationAssessment)
class ApplicationAssessmentAdmin(admin.ModelAdmin):
    list_display = ["application", "overall_program_fit", "startup_strength",
                    "evidence_confidence", "application_completeness",
                    "overall_recommendation", "recommendation_confidence", "generated_at"]
    list_filter = ["overall_recommendation", "stage_conflict"]
    readonly_fields = ["generated_at"]


@admin.register(ReviewerAssessment)
class ReviewerAssessmentAdmin(admin.ModelAdmin):
    list_display = ["application", "reviewer", "overall_conviction",
                    "recommendation", "submitted_at"]
    list_filter = ["recommendation"]


@admin.register(ReviewerDisagreement)
class ReviewerDisagreementAdmin(admin.ModelAdmin):
    list_display = ["application", "dimension", "variance_pct", "resolved", "detected_at"]
    list_filter = ["resolved"]


@admin.register(InterviewSession)
class InterviewSessionAdmin(admin.ModelAdmin):
    list_display = ["application", "interview_type", "round_number", "status",
                    "scheduled_at", "overall_interview_score"]
    list_filter = ["interview_type", "status"]


@admin.register(CommitteeDecision)
class CommitteeDecisionAdmin(admin.ModelAdmin):
    list_display = ["application", "decision", "decided_by", "decided_at"]
    list_filter = ["decision"]


@admin.register(EvidenceRequest)
class EvidenceRequestAdmin(admin.ModelAdmin):
    list_display = ["application", "requested_by", "status",
                    "pre_readiness_score", "post_readiness_score", "created_at"]
    list_filter = ["status"]


@admin.register(ProgramMembership)
class ProgramMembershipAdmin(admin.ModelAdmin):
    list_display = ["__str__", "program", "enrolled_at", "is_active", "demo_day_slot"]
    list_filter = ["is_active"]


@admin.register(MilestoneTemplate)
class MilestoneTemplateAdmin(admin.ModelAdmin):
    list_display = ["title", "program", "category", "week_number", "is_required"]
    list_filter = ["category", "is_required"]
    ordering = ["program", "week_number", "order"]


@admin.register(StartupMilestone)
class StartupMilestoneAdmin(admin.ModelAdmin):
    list_display = ["membership", "template", "status", "completed_at"]
    list_filter = ["status"]


@admin.register(ContinuousAssessment)
class ContinuousAssessmentAdmin(admin.ModelAdmin):
    list_display = ["application", "period_label", "readiness_score",
                    "revenue_at_period", "customers_at_period", "recorded_at"]
