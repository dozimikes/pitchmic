from __future__ import annotations

from rest_framework import serializers

from .models import Offer


class OfferSerializer(serializers.ModelSerializer):
    investor_name = serializers.CharField(source="investor.full_name", read_only=True)
    investor_company = serializers.CharField(source="investor.company_name", read_only=True)
    pitch_title = serializers.CharField(source="pitch.title", read_only=True)
    startup_name = serializers.CharField(source="pitch.startup.company_name", read_only=True)
    valid_transitions = serializers.SerializerMethodField()

    class Meta:
        model: type[Offer] = Offer
        fields: tuple[str, ...] = (
            "id",
            "investor",
            "investor_name",
            "investor_company",
            "pitch",
            "pitch_title",
            "startup_name",
            "status",
            "amount",
            "equity_pct",
            "message",
            "valuation",
            "terms",
            "sent_at",
            "responded_at",
            "expires_at",
            "valid_transitions",
            "created_at",
            "updated_at",
        )
        read_only_fields: tuple[str, ...] = (
            "id",
            "investor",
            "sent_at",
            "responded_at",
            "created_at",
            "updated_at",
        )

    def get_valid_transitions(self, obj: Offer) -> list[str]:
        return list(Offer.VALID_TRANSITIONS.get(obj.status, ()))

    def validate_status(self, value: str) -> str:
        if self.instance and value != self.instance.status:
            if not self.instance.can_transition(value):
                raise serializers.ValidationError(
                    f"Cannot transition from {self.instance.status} to {value}. "
                    f"Valid transitions: {list(Offer.VALID_TRANSITIONS.get(self.instance.status, ()))}"
                )
        return value

    def validate(self, attrs: dict) -> dict:
        if not self.instance:
            user = self.context.get("request").user
            pitch = attrs.get("pitch")
            if pitch and pitch.startup.user_id == user.id:
                raise serializers.ValidationError(
                    "You cannot make an offer on your own pitch."
                )
        return attrs
