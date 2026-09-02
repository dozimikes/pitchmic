from __future__ import annotations

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils.translation import gettext_lazy as _


class Activity(models.Model):
    VERB_PITCH_CREATED: str = "pitch_created"
    VERB_PITCH_UPDATED: str = "pitch_updated"
    VERB_PITCH_LIKED: str = "pitch_liked"
    VERB_OFFER_MADE: str = "offer_made"
    VERB_OFFER_ACCEPTED: str = "offer_accepted"
    VERB_OFFER_REJECTED: str = "offer_rejected"
    VERB_OFFER_NEGOTIATING: str = "offer_negotiating"
    VERB_STARTUP_JOINED: str = "startup_joined"
    VERB_INVESTOR_JOINED: str = "investor_joined"
    VERB_TEAM_MEMBER_ADDED: str = "team_member_added"

    VERB_CHOICES: tuple[tuple[str, str], ...] = (
        (VERB_PITCH_CREATED, _("Created a pitch")),
        (VERB_PITCH_UPDATED, _("Updated a pitch")),
        (VERB_PITCH_LIKED, _("Liked a pitch")),
        (VERB_OFFER_MADE, _("Made an offer")),
        (VERB_OFFER_ACCEPTED, _("Accepted an offer")),
        (VERB_OFFER_REJECTED, _("Rejected an offer")),
        (VERB_OFFER_NEGOTIATING, _("Started negotiating")),
        (VERB_STARTUP_JOINED, _("Startup joined")),
        (VERB_INVESTOR_JOINED, _("Investor joined")),
        (VERB_TEAM_MEMBER_ADDED, _("Added team member")),
    )

    actor: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="activities",
        verbose_name=_("actor"),
    )
    verb: models.CharField = models.CharField(
        _("verb"),
        max_length=50,
        choices=VERB_CHOICES,
        db_index=True,
    )
    target_content_type: models.ForeignKey = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="activity_targets",
        null=True,
        blank=True,
        verbose_name=_("target content type"),
    )
    target_object_id: models.PositiveIntegerField = models.PositiveIntegerField(
        _("target object id"),
        null=True,
        blank=True,
    )
    target = GenericForeignKey("target_content_type", "target_object_id")

    action_object_content_type: models.ForeignKey = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="action_objects",
        null=True,
        blank=True,
        verbose_name=_("action object content type"),
    )
    action_object_object_id: models.PositiveIntegerField = models.PositiveIntegerField(
        _("action object id"),
        null=True,
        blank=True,
    )
    action_object = GenericForeignKey(
        "action_object_content_type",
        "action_object_object_id",
    )

    metadata: models.JSONField = models.JSONField(
        _("metadata"),
        default=dict,
        blank=True,
        help_text=_("Additional metadata about the activity"),
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name: str = _("activity")
        verbose_name_plural: str = _("activities")
        ordering: tuple[str, ...] = ("-created_at",)
        indexes: list[models.Index] = [
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["verb", "-created_at"]),
            models.Index(fields=["target_content_type", "target_object_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.actor.email} {self.verb} {self.target or ''}"
