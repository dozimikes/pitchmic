from __future__ import annotations

from rest_framework import serializers

from .models import OutreachCampaign, OutreachMessage


class OutreachMessageSerializer(serializers.ModelSerializer):
    investor_name = serializers.CharField(source="investor.full_name", read_only=True)

    class Meta:
        model = OutreachMessage
        fields = (
            "id",
            "campaign",
            "investor",
            "investor_name",
            "subject",
            "body",
            "personalization_data",
            "status",
            "sent_at",
            "opened_at",
            "replied_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "campaign", "investor", "sent_at", "opened_at", "replied_at", "created_at", "updated_at")


class OutreachCampaignSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)
    response_rate = serializers.FloatField(read_only=True)
    messages_count = serializers.SerializerMethodField()

    class Meta:
        model = OutreachCampaign
        fields = (
            "id",
            "startup",
            "startup_name",
            "name",
            "description",
            "target_industries",
            "target_investor_types",
            "target_stages",
            "target_locations",
            "min_ticket_size",
            "max_ticket_size",
            "min_compatibility_score",
            "subject_template",
            "body_template",
            "max_outreach_per_day",
            "pause_on_interest",
            "schedule",
            "status",
            "total_reached",
            "positive_responses",
            "meetings_scheduled",
            "response_rate",
            "messages_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "startup", "status", "total_reached",
            "positive_responses", "meetings_scheduled", "response_rate",
            "messages_count", "created_at", "updated_at",
        )

    def get_messages_count(self, obj) -> int:
        return obj.messages.count()
