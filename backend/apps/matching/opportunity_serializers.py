"""
backend.apps.matching.opportunity_serializers
==============================================
Serializers for FundingSource, FundingOpportunity, and StartupOpportunityMatch.
"""
from __future__ import annotations

from rest_framework import serializers
from apps.matching.models_opportunity import (
    FundingSource,
    FundingOpportunity,
    OpportunityVersion,
    StartupOpportunityMatch,
)


class FundingSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = FundingSource
        fields = [
            "id",
            "name",
            "organization",
            "source_type",
            "base_url",
            "application_url",
            "monitoring_method",
            "crawl_frequency",
            "trust_level",
            "trust_score",
            "active",
            "last_checked_at",
            "last_success_at",
        ]
        read_only_fields = ["id", "last_checked_at", "last_success_at"]


class OpportunityVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OpportunityVersion
        fields = [
            "id",
            "version_number",
            "status",
            "deadline",
            "funding_amount_max_usd",
            "changed_fields",
            "recorded_at",
        ]
        read_only_fields = ["id", "recorded_at"]


class FundingOpportunitySerializer(serializers.ModelSerializer):
    source = FundingSourceSerializer(read_only=True)
    versions = OpportunityVersionSerializer(many=True, read_only=True)

    class Meta:
        model = FundingOpportunity
        fields = [
            "id",
            "source",
            "title",
            "slug",
            "opportunity_type",
            "status",
            "target_stage",
            "target_geographies",
            "target_sectors",
            "funding_amount_min_usd",
            "funding_amount_max_usd",
            "equity_percentage_taken",
            "application_open_date",
            "application_deadline",
            "cohort_start_date",
            "is_rolling",
            "source_confidence",
            "verified_freshness",
            "description",
            "key_benefits",
            "eligibility_criteria",
            "evidence_requirements",
            "version_count",
            "versions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class StartupOpportunityMatchSerializer(serializers.ModelSerializer):
    opportunity = FundingOpportunitySerializer(read_only=True)

    class Meta:
        model = StartupOpportunityMatch
        fields = [
            "id",
            "startup",
            "opportunity",
            "overall_match_score",
            "stage_fit",
            "geography_fit",
            "sector_fit",
            "funding_fit",
            "business_model_fit",
            "product_maturity_fit",
            "evidence_readiness_fit",
            "evidence_gaps",
            "positive_convictions",
            "is_saved_to_pipeline",
            "pipeline_stage",
            "computed_at",
        ]
        read_only_fields = ["id", "computed_at"]
