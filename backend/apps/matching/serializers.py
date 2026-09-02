from __future__ import annotations

from rest_framework import serializers

from .models import InvestorIntentSignal, MatchScore


class MatchScoreSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)
    investor_name = serializers.CharField(source="investor.full_name", read_only=True)

    class Meta:
        model = MatchScore
        fields = (
            "id",
            "startup",
            "startup_name",
            "investor",
            "investor_name",
            "compatibility_score",
            "industry_score",
            "stage_score",
            "ticket_size_score",
            "location_score",
            "semantic_score",
            "confidence_interval",
            "embedding_version",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class InvestorIntentSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvestorIntentSignal
        fields = (
            "id",
            "investor",
            "startup",
            "signal_type",
            "session_id",
            "time_spent_seconds",
            "metadata",
            "created_at",
        )
        read_only_fields = ("id", "investor", "created_at")

    def create(self, validated_data: dict) -> InvestorIntentSignal:
        # Always attach the requesting investor
        request = self.context.get("request")
        if request and hasattr(request.user, "investor_profile"):
            validated_data["investor"] = request.user.investor_profile
        return super().create(validated_data)
