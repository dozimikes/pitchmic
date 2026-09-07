"""
=============================
DRF serializers for the Fundability Engine models.
Follows the same patterns as apps/startups/serializers.py.
"""
from __future__ import annotations

from rest_framework import serializers

from apps.fundability.models import (
    EvidenceVaultItem,
    FundabilityAssessment,
    FundabilityDimension,
    FundabilityGap,
    ImprovementAction,
    ProgramReadiness,
)


# ---------------------------------------------------------------------------
# Evidence Vault
# ---------------------------------------------------------------------------

class EvidenceVaultItemSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    evidence_type_display = serializers.CharField(source="get_evidence_type_display", read_only=True)
    dimension_tag_display = serializers.CharField(source="get_dimension_tag_display", read_only=True)

    class Meta:
        model = EvidenceVaultItem
        fields = [
            "id",
            "startup",
            "title",
            "description",
            "evidence_type",
            "evidence_type_display",
            "dimension_tag",
            "dimension_tag_display",
            "claim_description",
            "file_url",
            "external_url",
            "status",
            "status_display",
            "source_name",
            "observed_date",
            "confidence",
            "contradicts_claim",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "startup", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Fundability Dimension
# ---------------------------------------------------------------------------

class FundabilityDimensionSerializer(serializers.ModelSerializer):
    evidence_state_display = serializers.CharField(source="get_evidence_state_display", read_only=True)
    stage_concern_display = serializers.CharField(source="get_stage_concern_display", read_only=True)

    class Meta:
        model = FundabilityDimension
        fields = [
            "id",
            "dimension_key",
            "dimension_name",
            "raw_score",
            "weight_pct",
            "weighted_contribution",
            "evidence_state",
            "evidence_state_display",
            "confidence_pct",
            "stage_concern",
            "stage_concern_display",
            "positive_signals",
            "missing_evidence",
            "justifications",
            "recommended_actions",
        ]
        read_only_fields = ["id"]


# ---------------------------------------------------------------------------
# Fundability Gap
# ---------------------------------------------------------------------------

class FundabilityGapSerializer(serializers.ModelSerializer):
    severity_display = serializers.CharField(source="get_severity_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    action_count = serializers.SerializerMethodField()

    class Meta:
        model = FundabilityGap
        fields = [
            "id",
            "assessment",
            "startup",
            "dimension_key",
            "title",
            "description",
            "severity",
            "severity_display",
            "status",
            "status_display",
            "current_state",
            "expected_state",
            "why_it_matters",
            "evidence_required",
            "impact",
            "effort",
            "priority_rank",
            "action_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "assessment", "startup", "created_at", "updated_at"]

    def get_action_count(self, obj) -> int:
        return obj.actions.count()


class FundabilityGapUpdateSerializer(serializers.ModelSerializer):
    """Lightweight serializer for founder status updates on gaps."""

    class Meta:
        model = FundabilityGap
        fields = ["status"]


# ---------------------------------------------------------------------------
# Improvement Action
# ---------------------------------------------------------------------------

class ImprovementActionSerializer(serializers.ModelSerializer):
    action_type_display = serializers.CharField(source="get_action_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    gap_title = serializers.CharField(source="gap.title", read_only=True)
    gap_severity = serializers.CharField(source="gap.severity", read_only=True)
    dimension_key = serializers.CharField(source="gap.dimension_key", read_only=True)

    class Meta:
        model = ImprovementAction
        fields = [
            "id",
            "gap",
            "gap_title",
            "gap_severity",
            "dimension_key",
            "startup",
            "action_type",
            "action_type_display",
            "title",
            "description",
            "why_investors_care",
            "evidence_missing",
            "how_to_obtain",
            "target_milestone",
            "reassess_after",
            "status",
            "status_display",
            "completed_at",
            "completion_notes",
            "estimated_score_delta",
            "priority_rank",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "gap", "startup", "gap_title", "gap_severity", "dimension_key",
            "created_at", "updated_at",
        ]


class ImprovementActionUpdateSerializer(serializers.ModelSerializer):
    """Founder updates action progress."""

    class Meta:
        model = ImprovementAction
        fields = ["status", "completed_at", "completion_notes"]


# ---------------------------------------------------------------------------
# Program Readiness
# ---------------------------------------------------------------------------

class ProgramReadinessSerializer(serializers.ModelSerializer):
    recommendation_display = serializers.CharField(
        source="get_recommendation_display", read_only=True
    )

    class Meta:
        model = ProgramReadiness
        fields = [
            "id",
            "program_name",
            "program_type",
            "fit_score",
            "readiness_score",
            "evidence_gaps_count",
            "fit_rationale",
            "top_gap",
            "recommendation",
            "recommendation_display",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ---------------------------------------------------------------------------
# Fundability Assessment (full — nested)
# ---------------------------------------------------------------------------

class FundabilityAssessmentSerializer(serializers.ModelSerializer):
    """
    Full assessment response — includes nested dimensions, gaps,
    actions, and program readiness.
    Used for GET /fundability/assessments/{id}/
    """
    conviction_display = serializers.CharField(source="get_conviction_display", read_only=True)
    confidence_display = serializers.CharField(source="get_confidence_display", read_only=True)
    inferred_stage_display = serializers.CharField(source="get_inferred_stage_display", read_only=True)
    declared_stage_display = serializers.CharField(source="get_declared_stage_display", read_only=True)
    company_name = serializers.CharField(source="startup.company_name", read_only=True)

    dimensions = FundabilityDimensionSerializer(many=True, read_only=True)
    gaps = FundabilityGapSerializer(many=True, read_only=True)
    program_readiness = ProgramReadinessSerializer(many=True, read_only=True)

    # Actions are retrieved through gaps but surfaced at assessment level for dashboard
    improvement_plan = serializers.SerializerMethodField()

    class Meta:
        model = FundabilityAssessment
        fields = [
            "id",
            "startup",
            "company_name",
            # Stage
            "declared_stage",
            "declared_stage_display",
            "inferred_stage",
            "inferred_stage_display",
            "stage_confidence",
            "stage_rationale",
            # Score
            "overall_score",
            "conviction",
            "conviction_display",
            "confidence",
            "confidence_display",
            "confidence_interval_low",
            "confidence_interval_high",
            # Evidence
            "evidence_completeness_pct",
            # Counts
            "critical_gaps_count",
            "important_gaps_count",
            "strong_signals_count",
            # Thesis
            "bull_thesis",
            "bear_thesis",
            # Deck
            "deck_contradictions",
            # Context
            "sector",
            "target_funding_type",
            "target_amount_usd",
            # Meta
            "methodology_version",
            "assessed_at",
            "is_current",
            # Nested
            "dimensions",
            "gaps",
            "program_readiness",
            "improvement_plan",
        ]
        read_only_fields = [
            "id", "assessed_at", "is_current", "methodology_version",
        ]

    def get_improvement_plan(self, obj) -> list:
        """Return top 5 highest-priority improvement actions across all gaps."""
        actions = ImprovementAction.objects.filter(
            gap__assessment=obj
        ).select_related("gap").order_by("priority_rank")[:8]
        return ImprovementActionSerializer(actions, many=True).data


class FundabilityAssessmentSummarySerializer(serializers.ModelSerializer):
    """
    Lightweight summary — used for dashboard widgets and list views.
    No nested detail; just the numbers needed for the command center.
    """
    conviction_display = serializers.CharField(source="get_conviction_display", read_only=True)
    confidence_display = serializers.CharField(source="get_confidence_display", read_only=True)
    inferred_stage_display = serializers.CharField(source="get_inferred_stage_display", read_only=True)
    company_name = serializers.CharField(source="startup.company_name", read_only=True)
    next_best_action = serializers.SerializerMethodField()
    top_program_readiness = serializers.SerializerMethodField()
    # Total number of assessments ever run for this startup (powers the
    # "Assessments run" stat on the dashboard — previously missing, causing '—')
    assessment_count = serializers.SerializerMethodField()

    class Meta:
        model = FundabilityAssessment
        fields = [
            "id",
            "company_name",
            "overall_score",
            "conviction",
            "conviction_display",
            "inferred_stage",
            "inferred_stage_display",
            "stage_confidence",
            "evidence_completeness_pct",
            "critical_gaps_count",
            "important_gaps_count",
            "strong_signals_count",
            "confidence",
            "confidence_display",
            "confidence_interval_low",
            "confidence_interval_high",
            "deck_contradictions",
            "assessed_at",
            "is_current",
            "assessment_count",
            "next_best_action",
            "top_program_readiness",
        ]
        read_only_fields = fields

    def get_assessment_count(self, obj) -> int:
        """Return the total number of assessments ever run for this startup."""
        return FundabilityAssessment.objects.filter(startup=obj.startup).count()

    def get_next_best_action(self, obj) -> dict | None:
        action = ImprovementAction.objects.filter(
            gap__assessment=obj,
            status="pending",
        ).select_related("gap").order_by("priority_rank").first()
        if not action:
            return None
        return {
            "id": str(action.id),
            "title": action.title,
            "impact": action.gap.impact,
            "severity": action.gap.severity,
            "estimated_score_delta": action.estimated_score_delta,
            "dimension_key": action.gap.dimension_key,
        }

    def get_top_program_readiness(self, obj) -> list:
        items = obj.program_readiness.order_by("-fit_score")[:3]
        return [
            {
                "program_name": pr.program_name,
                "fit_score": pr.fit_score,
                "readiness_score": pr.readiness_score,
                "recommendation": pr.recommendation,
            }
            for pr in items
        ]
