from __future__ import annotations

from rest_framework import serializers

from .models import DataRoomAccess, DataRoomDocument


class DataRoomDocumentSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)

    class Meta:
        model = DataRoomDocument
        fields = (
            "id",
            "startup",
            "startup_name",
            "name",
            "description",
            "file_url",
            "file_type",
            "file_size_bytes",
            "category",
            "is_active",
            "version",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "startup", "created_at", "updated_at")


class DataRoomAccessSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)
    investor_name = serializers.CharField(source="investor.full_name", read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = DataRoomAccess
        fields = (
            "id",
            "startup",
            "startup_name",
            "investor",
            "investor_name",
            "status",
            "is_active",
            "access_expires_at",
            "can_view_pitch_deck",
            "can_view_financials",
            "can_view_legal",
            "can_view_technical",
            "can_view_market_research",
            "can_view_team",
            "can_view_product",
            "nda_required",
            "nda_signed_at",
            "nda_version",
            "view_log",
            "watermark_text",
            "granted_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "startup", "investor", "status", "is_active",
            "nda_signed_at", "view_log", "granted_at", "updated_at",
        )


class DataRoomAccessGrantSerializer(serializers.Serializer):
    """Used by startup to grant access to an investor."""
    investor_id = serializers.IntegerField()
    access_hours = serializers.IntegerField(default=48, min_value=1, max_value=720)
    nda_required = serializers.BooleanField(default=True)
    can_view_financials = serializers.BooleanField(default=False)
    can_view_legal = serializers.BooleanField(default=False)
    can_view_technical = serializers.BooleanField(default=False)


class NDAsignSerializer(serializers.Serializer):
    """Investor signs the NDA to unlock sensitive sections."""
    nda_version = serializers.CharField(max_length=20, default="v1.0")
    agreed = serializers.BooleanField()

    def validate_agreed(self, v):
        if not v:
            raise serializers.ValidationError("You must agree to the NDA to proceed.")
        return v
