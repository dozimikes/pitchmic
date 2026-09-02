from __future__ import annotations

from django.contrib import admin

from .models import EmailNotification, InAppNotification, Notification


class InAppNotificationInline(admin.StackedInline):
    model = InAppNotification
    can_delete = False
    extra = 0
    fields: tuple[str, ...] = ("dismissed_at", "pinned")


class EmailNotificationInline(admin.StackedInline):
    model = EmailNotification
    can_delete = False
    extra = 0
    fields: tuple[str, ...] = (
        "status",
        "subject",
        "sent_at",
        "failed_at",
        "error_message",
        "retry_count",
    )
    readonly_fields: tuple[str, ...] = (
        "sent_at",
        "failed_at",
        "error_message",
        "retry_count",
    )


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "id",
        "user",
        "notification_type",
        "category",
        "title",
        "is_read",
        "read_at",
        "created_at",
    )
    list_filter: tuple[str, ...] = (
        "notification_type",
        "category",
        ("read_at", admin.EmptyFieldListFilter),
        "created_at",
    )
    search_fields: tuple[str, ...] = (
        "user__email",
        "user__first_name",
        "user__last_name",
        "title",
        "body",
        "data",
    )
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
    raw_id_fields: tuple[str, ...] = ("user",)
    date_hierarchy: str = "created_at"
    inlines: tuple = (InAppNotificationInline, EmailNotificationInline)
    actions: tuple[str, ...] = ("mark_as_read", "mark_as_unread")

    @admin.display(boolean=True, description="Read")
    def is_read(self, obj: Notification) -> bool:
        return obj.is_read

    @admin.action(description="Mark selected notifications as read")
    def mark_as_read(self, request, queryset) -> None:
        from django.utils import timezone

        updated = queryset.filter(read_at__isnull=True).update(
            read_at=timezone.now(),
            updated_at=timezone.now(),
        )
        self.message_user(request, f"{updated} notification(s) marked as read.")

    @admin.action(description="Mark selected notifications as unread")
    def mark_as_unread(self, request, queryset) -> None:
        from django.utils import timezone

        updated = queryset.filter(read_at__isnull=False).update(
            read_at=None,
            updated_at=timezone.now(),
        )
        self.message_user(request, f"{updated} notification(s) marked as unread.")


@admin.register(InAppNotification)
class InAppNotificationAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "id",
        "notification",
        "pinned",
        "is_dismissed",
        "dismissed_at",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("pinned", ("dismissed_at", admin.EmptyFieldListFilter), "created_at")
    search_fields: tuple[str, ...] = ("notification__title", "notification__body")
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
    raw_id_fields: tuple[str, ...] = ("notification",)
    date_hierarchy: str = "created_at"

    @admin.display(boolean=True, description="Dismissed")
    def is_dismissed(self, obj: InAppNotification) -> bool:
        return obj.is_dismissed


@admin.register(EmailNotification)
class EmailNotificationAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "id",
        "notification",
        "status",
        "subject",
        "sent_at",
        "retry_count",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("status", "sent_at", "failed_at", "created_at")
    search_fields: tuple[str, ...] = (
        "notification__title",
        "notification__body",
        "subject",
        "error_message",
    )
    readonly_fields: tuple[str, ...] = (
        "sent_at",
        "failed_at",
        "error_message",
        "retry_count",
        "created_at",
        "updated_at",
    )
    raw_id_fields: tuple[str, ...] = ("notification",)
    date_hierarchy: str = "created_at"
