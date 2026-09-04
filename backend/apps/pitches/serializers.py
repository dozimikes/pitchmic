from __future__ import annotations

from rest_framework import serializers

from .models import Pitch, PitchAttachment, PitchLike


class PitchAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model: type[PitchAttachment] = PitchAttachment
        fields: tuple[str, ...] = (
            "id",
            "file_name",
            "file_url",
            "file_type",
            "file_size",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = ("id", "created_at", "updated_at")


class PitchLikeSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model: type[PitchLike] = PitchLike
        fields: tuple[str, ...] = (
            "id",
            "pitch",
            "user",
            "user_email",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = ("id", "user", "created_at")


class PitchListSerializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)
    startup_id = serializers.IntegerField(source="startup.id", read_only=True)
    # Both annotated on the queryset in PitchViewSet.get_queryset() - no extra DB hits
    like_count = serializers.IntegerField(read_only=True)
    offers_count = serializers.IntegerField(read_only=True)
    is_liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model: type[Pitch] = Pitch
        fields: tuple[str, ...] = (
            "id",
            "startup",
            "startup_id",
            "startup_name",
            "title",
            "description",
            "cover_image_url",
            "image_url",
            "tags",
            "is_featured",
            "asking_amount",
            "equity_offered",
            "pitched_at",
            "is_draft",
            "like_count",
            "is_liked_by_me",
            "offers_count",
            "created_at",
            "updated_at",
        )
        read_only_fields: tuple[str, ...] = (
            "id",
            "startup",
            "like_count",
            "offers_count",
            "created_at",
            "updated_at",
        )

    def get_is_liked_by_me(self, obj: Pitch) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        # user_likes is populated by the Prefetch(to_attr="user_likes") in get_queryset()
        # Falls back to a DB query when the serializer is used outside of PitchViewSet
        user_likes = getattr(obj, "user_likes", None)
        if user_likes is not None:
            return len(user_likes) > 0
        return obj.likes.filter(user=request.user).exists()


class PitchSerializer(serializers.ModelSerializer):
    attachments = PitchAttachmentSerializer(many=True, required=False)
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)
    # Annotated on the queryset - plain IntegerField, no extra DB hit
    like_count = serializers.IntegerField(read_only=True)
    offers_count = serializers.IntegerField(read_only=True)
    is_liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model: type[Pitch] = Pitch
        fields: tuple[str, ...] = (
            "id",
            "startup",
            "startup_name",
            "title",
            "description",
            "problem",
            "solution",
            "market_size",
            "business_model",
            "traction",
            "use_of_funds",
            "tags",
            "cover_image_url",
            "is_featured",
            "image_url",
            "video_url",
            "deck_url",
            "asking_amount",
            "equity_offered",
            "pitched_at",
            "is_draft",
            "attachments",
            "like_count",
            "is_liked_by_me",
            "offers_count",
            "created_at",
            "updated_at",
        )
        read_only_fields: tuple[str, ...] = (
            "id",
            "startup",
            "like_count",
            "offers_count",
            "created_at",
            "updated_at",
        )

    def get_is_liked_by_me(self, obj: Pitch) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        # user_likes is populated by the Prefetch(to_attr="user_likes") in get_queryset()
        user_likes = getattr(obj, "user_likes", None)
        if user_likes is not None:
            return len(user_likes) > 0
        return obj.likes.filter(user=request.user).exists()

    def get_offers_count(self, obj: Pitch) -> int:
        # Fallback for contexts where the queryset annotation is not present
        offers_count = getattr(obj, "offers_count", None)
        if offers_count is not None:
            return int(offers_count)
        return obj.offers.count()

    def create(self, validated_data: dict) -> Pitch:
        attachments_data = validated_data.pop("attachments", [])
        pitch: Pitch = Pitch.objects.create(**validated_data)
        for attachment_data in attachments_data:
            PitchAttachment.objects.create(pitch=pitch, **attachment_data)
        return pitch

    def update(self, instance: Pitch, validated_data: dict) -> Pitch:
        attachments_data = validated_data.pop("attachments", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if attachments_data is not None:
            instance.attachments.all().delete()
            for attachment_data in attachments_data:
                PitchAttachment.objects.create(pitch=instance, **attachment_data)

        return instance
