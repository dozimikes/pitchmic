from __future__ import annotations

from rest_framework import serializers

from .models import (
    DueDiligenceReport,
    EnterpriseTenant,
    InstitutionalMemoryEntry,
    ModelPerformanceTracker,
    PitchDeckForensicAnalysis,
    PredictionFeedback,
    StartupSuccessPrediction,
    StealthFounderSignal,
    TenantAPIKey,
    TenantUsageLog,
    VoiceInterviewSession,
)


class StartupSuccessPredictionSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)

    class Meta:
        model = StartupSuccessPrediction
        fields = (
            "id",
            "startup",
            "startup_name",
            "success_probability",
            "confidence_interval_lower",
            "confidence_interval_upper",
            "exit_prediction",
            "investor_roi",
            "market_potential",
            "scalability_score",
            "uniqueness_score",
            "growth_trajectory",
            "risk_profile",
            "benchmarks",
            "founder_dna",
            "competitive_intelligence",
            "top_features",
            "explanation",
            "model_version",
            "pipeline_type",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class DueDiligenceReportSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)

    class Meta:
        model = DueDiligenceReport
        fields = (
            "id",
            "startup",
            "startup_name",
            "requested_by",
            "status",
            "verdict",
            "overall_score",
            "forensic_analysis",
            "market_analysis",
            "investment_memo",
            "citations",
            "bull_arguments",
            "bear_arguments",
            "scorecard",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "status", "verdict", "overall_score",
            "forensic_analysis", "market_analysis", "investment_memo",
            "citations", "bull_arguments", "bear_arguments", "scorecard",
            "started_at", "completed_at", "created_at", "updated_at",
        )


class PredictionFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = PredictionFeedback
        fields = (
            "id",
            "prediction",
            "accuracy_rating",
            "helpfulness_score",
            "actual_outcome",
            "actual_exit_type",
            "actual_exit_value",
            "comment",
            "feedback_source",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate_accuracy_rating(self, v: int) -> int:
        if not 1 <= v <= 5:
            raise serializers.ValidationError("Must be between 1 and 5.")
        return v

    def validate_helpfulness_score(self, v: int) -> int:
        if not 1 <= v <= 5:
            raise serializers.ValidationError("Must be between 1 and 5.")
        return v

    def create(self, validated_data: dict) -> PredictionFeedback:
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class ModelPerformanceTrackerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelPerformanceTracker
        fields = "__all__"
        read_only_fields = ("id", "deployed_at")


class PitchDeckForensicAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = PitchDeckForensicAnalysis
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class StealthFounderSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = StealthFounderSignal
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class InstitutionalMemoryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = InstitutionalMemoryEntry
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class EnterpriseTriageRequestSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=200)
    industry = serializers.CharField(max_length=100, default="Fintech / AI")
    pitch_text = serializers.CharField(required=False, allow_blank=True, default="")
    deck_url = serializers.URLField(required=False, allow_blank=True)
    financials = serializers.DictField(required=False, default=dict)
    tenant_id = serializers.CharField(max_length=100, default="antler_global")
    callback_url = serializers.URLField(required=False, allow_blank=True)


class EnterpriseTenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnterpriseTenant
        fields = (
            "id",
            "name",
            "slug",
            "tier",
            "monthly_deal_quota",
            "current_month_usage",
            "webhook_url",
            "contact_email",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "current_month_usage", "created_at")


class TenantAPIKeyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, default="Production Key")


class VoiceInterviewSessionSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="startup.company_name", read_only=True)

    class Meta:
        model = VoiceInterviewSession
        fields = (
            "id",
            "startup",
            "company_name",
            "stage",
            "interviewer_persona",
            "status",
            "duration_seconds",
            "transcript",
            "debrief_scorecard",
            "started_at",
            "completed_at",
            "created_at",
        )
        read_only_fields = ("id", "status", "debrief_scorecard", "started_at", "completed_at", "created_at")


class VoiceInterviewTurnSerializer(serializers.Serializer):
    speaker = serializers.ChoiceField(choices=["interviewer", "founder", "candidate"])
    text = serializers.CharField()
    timestamp = serializers.FloatField(default=0.0)


class PitchDeckUploadSerializer(serializers.Serializer):
    startup_id = serializers.IntegerField(required=False)
    file = serializers.FileField()
    company_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    industry = serializers.CharField(max_length=100, required=False, default="Technology / AI")
    declared_funding_stage = serializers.CharField(max_length=50, required=False, default="pre_seed")
    sector = serializers.CharField(max_length=50, required=False, default="fintech")


