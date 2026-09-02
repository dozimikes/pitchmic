from __future__ import annotations

from rest_framework import serializers

from .models import Activity


class ActivitySerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True)
    actor_first_name = serializers.CharField(source="actor.first_name", read_only=True)
    actor_last_name = serializers.CharField(source="actor.last_name", read_only=True)
    actor_role = serializers.CharField(source="actor.role", read_only=True)
    target_str = serializers.SerializerMethodField()
    action_object_str = serializers.SerializerMethodField()

    class Meta:
        model: type[Activity] = Activity
        fields: tuple[str, ...] = (
            "id",
            "actor",
            "actor_email",
            "actor_first_name",
            "actor_last_name",
            "actor_role",
            "verb",
            "target_content_type",
            "target_object_id",
            "target_str",
            "action_object_content_type",
            "action_object_object_id",
            "action_object_str",
            "metadata",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = ("id", "created_at")

    def get_target_str(self, obj: Activity) -> str | None:
        if obj.target:
            return str(obj.target)
        return None

    def get_action_object_str(self, obj: Activity) -> str | None:
        if obj.action_object:
            return str(obj.action_object)
        return None
