from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.users.models import StartupProfile


class Pitch(models.Model):
    startup: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="pitches",
    )
    title: models.CharField = models.CharField(_("title"), max_length=255)
    description: models.TextField = models.TextField(_("description"), blank=True)
    # --- Extended narrative fields (T2-3 migration) ---
    problem: models.TextField = models.TextField(_("problem"), blank=True)
    solution: models.TextField = models.TextField(_("solution"), blank=True)
    market_size: models.TextField = models.TextField(_("market size"), blank=True)
    business_model: models.TextField = models.TextField(_("business model"), blank=True)
    traction: models.TextField = models.TextField(_("traction"), blank=True)
    use_of_funds: models.TextField = models.TextField(_("use of funds"), blank=True)
    tags: models.JSONField = models.JSONField(
        _("tags"),
        default=list,
        blank=True,
        help_text=_("List of tag strings, e.g. ['saas', 'b2b']"),
    )
    cover_image_url: models.URLField = models.URLField(_("cover image URL"), blank=True)
    is_featured: models.BooleanField = models.BooleanField(
        _("is featured"),
        default=False,
        db_index=True,
    )
    # --- Media / financials ---
    image_url: models.URLField = models.URLField(_("image URL"), blank=True)
    video_url: models.URLField = models.URLField(_("video URL"), blank=True)
    deck_url: models.URLField = models.URLField(_("pitch deck URL"), blank=True)
    asking_amount: models.DecimalField = models.DecimalField(
        _("asking amount"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    equity_offered: models.DecimalField = models.DecimalField(
        _("equity offered %"),
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    pitched_at: models.DateTimeField = models.DateTimeField(
        _("pitched at"),
        null=True,
        blank=True,
        db_index=True,
    )
    is_draft: models.BooleanField = models.BooleanField(
        _("is draft"),
        default=True,
        help_text=_("Whether this pitch is still a draft"),
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("pitch")
        verbose_name_plural: str = _("pitches")
        ordering: tuple[str, ...] = ("-pitched_at", "-created_at")
        indexes: list[models.Index] = [
            models.Index(fields=["startup", "-created_at"]),
        ]

    def __str__(self) -> str:
        return self.title

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        # Snapshot is_draft at load time so signal handlers can detect publication
        self._loaded_is_draft: bool = self.is_draft

    def save(self, *args, **kwargs) -> None:
        super().save(*args, **kwargs)
        self._loaded_is_draft = self.is_draft

    @property
    def like_count(self) -> int:
        return self.__dict__.get("like_count") if "like_count" in self.__dict__ else self.likes.count()

    @like_count.setter
    def like_count(self, value) -> None:
        self.__dict__["like_count"] = value


class PitchAttachment(models.Model):
    pitch: models.ForeignKey = models.ForeignKey(
        Pitch,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file_name: models.CharField = models.CharField(_("file name"), max_length=255)
    file_url: models.URLField = models.URLField(_("file URL"))
    file_type: models.CharField = models.CharField(
        _("file type"),
        max_length=100,
        blank=True,
        help_text=_("MIME type of the attachment"),
    )
    file_size: models.PositiveIntegerField = models.PositiveIntegerField(
        _("file size (bytes)"),
        null=True,
        blank=True,
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("pitch attachment")
        verbose_name_plural: str = _("pitch attachments")
        ordering: tuple[str, ...] = ("-created_at",)

    def __str__(self) -> str:
        return self.file_name


class PitchLike(models.Model):
    pitch: models.ForeignKey = models.ForeignKey(
        Pitch,
        on_delete=models.CASCADE,
        related_name="likes",
    )
    user: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pitch_likes",
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name: str = _("pitch like")
        verbose_name_plural: str = _("pitch likes")
        ordering: tuple[str, ...] = ("-created_at",)
        constraints: list[models.UniqueConstraint] = [
            models.UniqueConstraint(
                fields=["pitch", "user"],
                name="unique_pitch_like",
                violation_error_message="You have already liked this pitch.",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user.email} likes {self.pitch.title}"
