from __future__ import annotations

from rest_framework import serializers

from .models import EmailNotification, InAppNotification, Notification


class InAppNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model: type[InAppNotification] = InAppNotification
        fields: tuple[str, ...] = (
            "id",
            "dismissed_at",
            "pinned",
            "is_dismissed",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = ("id", "is_dismissed", "created_at", "updated_at")


class EmailNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model: type[EmailNotification] = EmailNotification
        fields: tuple[str, ...] = (
            "id",
            "status",
            "subject",
            "sent_at",
            "failed_at",
            "error_message",
            "retry_count",
            "created_at",
        )
        read_only_fields: tuple[str, ...] = (
            "id",
            "sent_at",
            "failed_at",
            "error_message",
            "retry_count",
            "created_at",
            "updated_at",
        )


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.BooleanField(read_only=True)
    in_app = InAppNotificationSerializer(read_only=True)
    email = EmailNotificationSerializer(read_only=True)

    class Meta:
        model: type[Notification] = Notification
        fields: tuple[str, ...] = (
            "id",
            "notification_type",
            "category",
            "title",
            "body",
            "data",
            "read_at",
            "is_read",
            "in_app",
            "email",
            "created_at",
            "updated_at",
        )
        read_only_fields: tuple[str, ...] = (
            "id",
            "user",
            "read_at",
            "is_read",
            "created_at",
            "updated_at",
        )
