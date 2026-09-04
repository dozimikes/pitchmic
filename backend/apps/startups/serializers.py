from __future__ import annotations

from rest_framework import serializers
from apps.startups.models import (
    StartupClaim,
    StartupEvidence,
    StartupMaturityAssessment,
    StartupFinancialSnapshot,
    StartupFundingRound,
    StartupCustomerSegment,
    FundraisingCampaign,
    StartupContextualAssessment,
)


class StartupEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = StartupEvidence
        fields = [
            "id",
            "startup",
            "claim",
            "source_type",
            "title",
            "document_url",
            "external_source",
            "verification_status",
            "confidence",
            "verifier_name",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class StartupClaimSerializer(serializers.ModelSerializer):
    supporting_evidence = StartupEvidenceSerializer(many=True, read_only=True)

    class Meta:
        model = StartupClaim
        fields = [
            "id",
            "startup",
            "claim_type",
            "statement",
            "source_type",
            "source_document",
            "materiality",
            "declared_value",
            "verified_value",
            "observed_value",
            "normalized_value",
            "status",
            "confidence",
            "supporting_evidence",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class StartupMaturityAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StartupMaturityAssessment
        fields = [
            "id",
            "startup",
            "declared_financing_stage",
            "inferred_financing_stage",
            "stage_confidence",
            "product_score",
            "commercial_score",
            "revenue_score",
            "operational_score",
            "market_score",
            "regulatory_score",
            "execution_score",
            "evidence_score",
            "product_maturity",
            "commercial_maturity",
            "revenue_maturity",
            "operational_maturity",
            "evidence_maturity",
            "overall_maturity",
            "overall_score",
            "confidence",
            "model_version",
            "assessed_at",
        ]
        read_only_fields = ["id", "assessed_at"]


class StartupFinancialSnapshotSerializer(serializers.ModelSerializer):
    evidence_title = serializers.ReadOnlyField(source="evidence.title")

    class Meta:
        model = StartupFinancialSnapshot
        fields = [
            "id",
            "startup",
            "period_label",
            "revenue_usd",
            "gross_profit_usd",
            "gross_margin_pct",
            "operating_expenses_usd",
            "net_burn_monthly_usd",
            "cash_balance_usd",
            "runway_months",
            "customers_count",
            "cac_usd",
            "ltv_usd",
            "arpu_usd",
            "churn_rate_pct",
            "retention_rate_pct",
            "evidence",
            "evidence_title",
            "recorded_at",
        ]
        read_only_fields = ["id", "recorded_at"]


class StartupFundingRoundSerializer(serializers.ModelSerializer):
    class Meta:
        model = StartupFundingRound
        fields = [
            "id",
            "startup",
            "round_type",
            "instrument",
            "amount_usd",
            "valuation_post_money_usd",
            "announced_date",
            "close_date",
            "investors_summary",
            "lead_investor_name",
            "evidence",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class StartupCustomerSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StartupCustomerSegment
        fields = [
            "id",
            "startup",
            "segment_type",
            "customer_count",
            "average_contract_value_usd",
            "retention_rate_pct",
            "geography",
            "evidence",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class FundraisingCampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = FundraisingCampaign
        fields = [
            "id",
            "startup",
            "round_name",
            "target_amount_usd",
            "amount_committed_usd",
            "amount_raised_usd",
            "valuation_cap_usd",
            "instrument",
            "status",
            "target_close_date",
            "terms_summary",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]


class StartupContextualAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StartupContextualAssessment
        fields = [
            "id",
            "startup",
            "evaluator_type",
            "evaluator_name",
            "fit_score",
            "primary_conviction",
            "primary_concern",
            "confidence",
            "assessed_at",
        ]
        read_only_fields = ["id", "assessed_at"]
