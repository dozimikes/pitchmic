from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.pitches.models import Pitch
from apps.users.models import InvestorProfile


class Offer(models.Model):
    STATUS_DRAFT: str = "draft"
    STATUS_SENT: str = "sent"
    STATUS_ACCEPTED: str = "accepted"
    STATUS_REJECTED: str = "rejected"
    STATUS_NEGOTIATING: str = "negotiating"
    STATUS_WITHDRAWN: str = "withdrawn"
    STATUS_EXPIRED: str = "expired"
    STATUS_CHOICES: tuple[tuple[str, str], ...] = (
        (STATUS_DRAFT, _("Draft")),
        (STATUS_SENT, _("Sent")),
        (STATUS_ACCEPTED, _("Accepted")),
        (STATUS_REJECTED, _("Rejected")),
        (STATUS_NEGOTIATING, _("Negotiating")),
        (STATUS_WITHDRAWN, _("Withdrawn")),
        (STATUS_EXPIRED, _("Expired")),
    )

    VALID_TRANSITIONS: dict[str, tuple[str, ...]] = {
        STATUS_DRAFT: (STATUS_SENT, STATUS_WITHDRAWN),
        STATUS_SENT: (STATUS_ACCEPTED, STATUS_REJECTED, STATUS_NEGOTIATING, STATUS_WITHDRAWN, STATUS_EXPIRED),
        STATUS_NEGOTIATING: (STATUS_ACCEPTED, STATUS_REJECTED, STATUS_SENT, STATUS_WITHDRAWN, STATUS_EXPIRED),
        STATUS_ACCEPTED: (),
        STATUS_REJECTED: (STATUS_SENT, STATUS_NEGOTIATING),
        STATUS_WITHDRAWN: (STATUS_DRAFT,),
        STATUS_EXPIRED: (STATUS_DRAFT,),
    }

    investor: models.ForeignKey = models.ForeignKey(
        InvestorProfile,
        on_delete=models.CASCADE,
        related_name="offers_made",
    )
    pitch: models.ForeignKey = models.ForeignKey(
        Pitch,
        on_delete=models.CASCADE,
        related_name="offers",
    )
    status: models.CharField = models.CharField(
        _("status"),
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
        db_index=True,
    )
    amount: models.DecimalField = models.DecimalField(
        _("investment amount"),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    equity_pct: models.DecimalField = models.DecimalField(
        _("equity percentage"),
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    message: models.TextField = models.TextField(_("message"), blank=True)
    valuation: models.DecimalField = models.DecimalField(
        _("pre-money valuation"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    terms: models.TextField = models.TextField(_("terms and conditions"), blank=True)
    sent_at: models.DateTimeField = models.DateTimeField(
        _("sent at"),
        null=True,
        blank=True,
    )
    responded_at: models.DateTimeField = models.DateTimeField(
        _("responded at"),
        null=True,
        blank=True,
    )
    expires_at: models.DateTimeField = models.DateTimeField(
        _("expires at"),
        null=True,
        blank=True,
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("offer")
        verbose_name_plural: str = _("offers")
        ordering: tuple[str, ...] = ("-created_at",)
        constraints: list[models.UniqueConstraint] = [
            models.UniqueConstraint(
                fields=["investor", "pitch", "status"],
                condition=models.Q(status="draft") | models.Q(status="sent") | models.Q(status="negotiating"),
                name="unique_active_offer_per_investor_pitch",
                violation_error_message="An active offer already exists for this pitch.",
            ),
        ]
        indexes: list[models.Index] = [
            models.Index(fields=["investor", "status", "-created_at"]),
            models.Index(fields=["pitch", "status", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Offer #{self.pk} - {self.investor} to {self.pitch} ({self.status})"

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        # Snapshot status at load time so signal handlers can detect transitions
        self._loaded_status: str = self.status

    def save(self, *args, **kwargs) -> None:
        super().save(*args, **kwargs)
        # Update snapshot after save so subsequent saves don't re-fire
        self._loaded_status = self.status

    def can_transition(self, new_status: str) -> bool:
        return new_status in self.VALID_TRANSITIONS.get(self.status, ())

    def transition_to(self, new_status: str) -> bool:
        from django.utils import timezone

        if not self.can_transition(new_status):
            raise ValueError(
                f"Cannot transition from {self.status} to {new_status}"
            )
        self.status = new_status
        if new_status == self.STATUS_SENT:
            self.sent_at = timezone.now()
        if new_status in (self.STATUS_ACCEPTED, self.STATUS_REJECTED):
            self.responded_at = timezone.now()
        return True
