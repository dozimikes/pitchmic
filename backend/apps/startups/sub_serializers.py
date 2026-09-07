"""
apps.startups.sub_serializers
==============================
Serializers for the startup sub-profile models (task #6).
"""
from __future__ import annotations

from rest_framework import serializers

from apps.startups.sub_models import (
    BusinessModelProfile,
    FounderProfile,
    MarketProfile,
    ProductProfile,
    TractionMetric,
)


class FounderProfileSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    commitment_display = serializers.CharField(source="get_commitment_display", read_only=True)

    class Meta:
        model = FounderProfile
        fields = [
            "id", "startup", "full_name", "role", "role_display",
            "commitment", "commitment_display", "linkedin_url", "is_primary",
            "education_summary", "previous_companies", "previous_exits",
            "years_industry_experience", "technical_capability",
            "commercial_capability", "domain_expertise",
            "founder_market_fit_description", "responsibilities",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "startup", "created_at", "updated_at"]


class ProductProfileSerializer(serializers.ModelSerializer):
    product_status_display = serializers.CharField(source="get_product_status_display", read_only=True)
    tech_differentiator_display = serializers.CharField(source="get_tech_differentiator_display", read_only=True)

    class Meta:
        model = ProductProfile
        fields = [
            "id", "startup", "problem_statement", "target_customer_description",
            "customer_pain_frequency", "current_alternatives", "solution_description",
            "product_status", "product_status_display", "demo_url",
            "tech_differentiator", "tech_differentiator_display",
            "differentiator_description", "moat_description",
            "has_filed_ip", "ip_description",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "startup", "created_at", "updated_at"]


class MarketProfileSerializer(serializers.ModelSerializer):
    tam_evidence_source_display = serializers.CharField(source="get_tam_evidence_source_display", read_only=True)

    class Meta:
        model = MarketProfile
        fields = [
            "id", "startup", "tam_usd", "sam_usd", "som_usd",
            "market_growth_rate_pct", "tam_evidence_source",
            "tam_evidence_source_display", "tam_source_citation",
            "market_sizing_methodology", "primary_geography",
            "expansion_geography", "direct_competitors",
            "indirect_competitors", "competitive_advantage",
            "regulatory_notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "startup", "created_at", "updated_at"]


class BusinessModelProfileSerializer(serializers.ModelSerializer):
    revenue_model_display = serializers.CharField(source="get_revenue_model_display", read_only=True)
    customer_type_display = serializers.CharField(source="get_customer_type_display", read_only=True)
    sales_model_display = serializers.CharField(source="get_sales_model_display", read_only=True)
    cac_ltv_ratio = serializers.SerializerMethodField()

    class Meta:
        model = BusinessModelProfile
        fields = [
            "id", "startup", "revenue_model", "revenue_model_display",
            "revenue_model_description", "customer_type", "customer_type_display",
            "sales_model", "sales_model_display", "pricing_model",
            "average_contract_value_usd", "cac_usd", "ltv_usd",
            "cac_ltv_ratio", "gross_margin_pct", "payback_months",
            "unit_economics_are_modelled", "path_to_profitability",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "startup", "cac_ltv_ratio", "created_at", "updated_at"]

    def get_cac_ltv_ratio(self, obj) -> float | None:
        if obj.cac_usd and obj.ltv_usd and float(obj.cac_usd) > 0:
            return round(float(obj.ltv_usd) / float(obj.cac_usd), 2)
        return None


class TractionMetricSerializer(serializers.ModelSerializer):
    metric_type_display = serializers.CharField(source="get_metric_type_display", read_only=True)
    evidence_status_display = serializers.CharField(source="get_evidence_status_display", read_only=True)

    class Meta:
        model = TractionMetric
        fields = [
            "id", "startup", "metric_type", "metric_type_display",
            "value", "unit", "period_label", "period_start", "period_end",
            "evidence_status", "evidence_status_display",
            "evidence_source_description", "evidence_file_url",
            "notes", "created_at",
        ]
        read_only_fields = ["id", "startup", "created_at"]
