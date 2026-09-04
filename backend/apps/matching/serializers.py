from __future__ import annotations

from rest_framework import serializers

from .models import InvestorIntentSignal, MatchScore


class MatchScoreSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)
    investor_name = serializers.CharField(source="investor.full_name", read_only=True)
    investor_firm = serializers.CharField(source="investor.company_name", read_only=True)
    industry = serializers.CharField(source="startup.industry", read_only=True)
    location = serializers.CharField(source="startup.location", read_only=True)
    funding_stage = serializers.CharField(source="startup.funding_stage", read_only=True)
    logo_url = serializers.CharField(source="startup.logo_url", read_only=True)
    pitch_id = serializers.SerializerMethodField()
    pitch_title = serializers.SerializerMethodField()
    asking_amount = serializers.SerializerMethodField()

    class Meta:
        model = MatchScore
        fields = (
            "id",
            "startup",
            "startup_name",
            "investor",
            "investor_name",
            "investor_firm",
            "industry",
            "location",
            "funding_stage",
            "logo_url",
            "pitch_id",
            "pitch_title",
            "asking_amount",
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

    def get_pitch_id(self, obj: MatchScore) -> int | None:
        p = obj.startup.pitches.filter(is_draft=False).first()
        if not p:
            p = obj.startup.pitches.first()
        return p.id if p else None

    def get_pitch_title(self, obj: MatchScore) -> str:
        p = obj.startup.pitches.filter(is_draft=False).first()
        if not p:
            p = obj.startup.pitches.first()
        return p.title if p else obj.startup.company_name

    def get_asking_amount(self, obj: MatchScore) -> str | None:
        p = obj.startup.pitches.filter(is_draft=False).first()
        if not p:
            p = obj.startup.pitches.first()
        return str(p.asking_amount) if (p and p.asking_amount) else None


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
