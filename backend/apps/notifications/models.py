from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Notification(models.Model):
    TYPE_INFO: str = "info"
    TYPE_SUCCESS: str = "success"
    TYPE_WARNING: str = "warning"
    TYPE_ERROR: str = "error"
    TYPE_CHOICES: tuple[tuple[str, str], ...] = (
        (TYPE_INFO, _("Info")),
        (TYPE_SUCCESS, _("Success")),
        (TYPE_WARNING, _("Warning")),
        (TYPE_ERROR, _("Error")),
    )

    CATEGORY_NEW_OFFER: str = "new_offer"
    CATEGORY_OFFER_UPDATED: str = "offer_updated"
    CATEGORY_NEW_PITCH: str = "new_pitch"
    CATEGORY_NEW_LIKE: str = "new_like"
    CATEGORY_SYSTEM: str = "system"
    CATEGORY_CHOICES: tuple[tuple[str, str], ...] = (
        (CATEGORY_NEW_OFFER, _("New Offer")),
        (CATEGORY_OFFER_UPDATED, _("Offer Updated")),
        (CATEGORY_NEW_PITCH, _("New Pitch")),
        (CATEGORY_NEW_LIKE, _("New Like")),
        (CATEGORY_SYSTEM, _("System")),
    )

    user: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        verbose_name=_("user"),
    )
    notification_type: models.CharField = models.CharField(
        _("notification type"),
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_INFO,
    )
    category: models.CharField = models.CharField(
        _("category"),
        max_length=50,
        choices=CATEGORY_CHOICES,
        default=CATEGORY_SYSTEM,
    )
    title: models.CharField = models.CharField(_("title"), max_length=255)
    body: models.TextField = models.TextField(_("body"), blank=True)
    data: models.JSONField = models.JSONField(
        _("data"),
        default=dict,
        blank=True,
        help_text=_("Additional structured data for the notification"),
    )
    read_at: models.DateTimeField = models.DateTimeField(
        _("read at"),
        null=True,
        blank=True,
        db_index=True,
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("notification")
        verbose_name_plural: str = _("notifications")
        ordering: tuple[str, ...] = ("-created_at",)
        indexes: list[models.Index] = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["user", "read_at", "-created_at"]),
            models.Index(fields=["category", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"[{self.get_notification_type_display()}] {self.title} ({self.user.email})"

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def mark_as_read(self) -> None:
        from django.utils import timezone

        if not self.is_read:
            self.read_at = timezone.now()
            self.save(update_fields=["read_at", "updated_at"])

    def mark_as_unread(self) -> None:
        if self.is_read:
            self.read_at = None
            self.save(update_fields=["read_at", "updated_at"])


class InAppNotification(models.Model):
    notification: models.OneToOneField = models.OneToOneField(
        Notification,
        on_delete=models.CASCADE,
        related_name="in_app",
        verbose_name=_("notification"),
    )
    dismissed_at: models.DateTimeField = models.DateTimeField(
        _("dismissed at"),
        null=True,
        blank=True,
    )
    pinned: models.BooleanField = models.BooleanField(
        _("pinned"),
        default=False,
        help_text=_("Whether this notification is pinned to the top"),
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("in-app notification")
        verbose_name_plural: str = _("in-app notifications")
        ordering: tuple[str, ...] = ("-pinned", "-created_at")

    def __str__(self) -> str:
        return f"InApp: {self.notification.title}"

    @property
    def is_dismissed(self) -> bool:
        return self.dismissed_at is not None


class EmailNotification(models.Model):
    STATUS_PENDING: str = "pending"
    STATUS_SENT: str = "sent"
    STATUS_FAILED: str = "failed"
    STATUS_CHOICES: tuple[tuple[str, str], ...] = (
        (STATUS_PENDING, _("Pending")),
        (STATUS_SENT, _("Sent")),
        (STATUS_FAILED, _("Failed")),
    )

    notification: models.OneToOneField = models.OneToOneField(
        Notification,
        on_delete=models.CASCADE,
        related_name="email",
        verbose_name=_("notification"),
    )
    status: models.CharField = models.CharField(
        _("status"),
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    subject: models.CharField = models.CharField(_("subject"), max_length=255, blank=True)
    html_body: models.TextField = models.TextField(_("HTML body"), blank=True)
    plain_body: models.TextField = models.TextField(_("plain text body"), blank=True)
    sent_at: models.DateTimeField = models.DateTimeField(
        _("sent at"),
        null=True,
        blank=True,
    )
    failed_at: models.DateTimeField = models.DateTimeField(
        _("failed at"),
        null=True,
        blank=True,
    )
    error_message: models.TextField = models.TextField(_("error message"), blank=True)
    retry_count: models.PositiveIntegerField = models.PositiveIntegerField(
        _("retry count"),
        default=0,
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("email notification")
        verbose_name_plural: str = _("email notifications")
        ordering: tuple[str, ...] = ("-created_at",)

    def __str__(self) -> str:
        return f"Email [{self.get_status_display()}]: {self.notification.title}"
