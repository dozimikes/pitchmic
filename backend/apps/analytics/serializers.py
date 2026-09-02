from __future__ import annotations

from rest_framework import serializers

from .models import FundraisingPrediction, InvestorBehaviorAnalysis, UserBehaviorEvent


class FundraisingPredictionSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)

    class Meta:
        model = FundraisingPrediction
        fields = (
            "id",
            "startup",
            "startup_name",
            "success_probability",
            "confidence_lower",
            "confidence_upper",
            "predicted_time_to_fundraise_days",
            "predicted_amount_raised",
            "predicted_investor_match_count",
            "exit_prediction",
            "investor_roi",
            "market_potential",
            "growth_trajectory",
            "risk_profile",
            "benchmarks",
            "scalability_score",
            "uniqueness_score",
            "team_score",
            "product_score",
            "market_score",
            "traction_score",
            "top_features",
            "explanation",
            "model_version",
            "confidence_score",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class InvestorBehaviorAnalysisSerializer(serializers.ModelSerializer):
    investor_name = serializers.CharField(source="investor.full_name", read_only=True)

    class Meta:
        model = InvestorBehaviorAnalysis
        fields = (
            "id",
            "investor",
            "investor_name",
            "avg_time_on_pitch_seconds",
            "view_to_offer_conversion_rate",
            "total_pitches_viewed",
            "total_offers_sent",
            "total_offers_accepted",
            "preferred_funding_stages",
            "avg_offer_amount",
            "peak_activity_hours",
            "avg_response_time_hours",
            "risk_tolerance_score",
            "innovation_appetite",
            "industry_affinity",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class UserBehaviorEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserBehaviorEvent
        fields = (
            "id",
            "event_type",
            "session_id",
            "object_id",
            "object_type",
            "metadata",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def create(self, validated_data):
        request = self.context.get("request")
        if request:
            validated_data["user"] = request.user
        return super().create(validated_data)
