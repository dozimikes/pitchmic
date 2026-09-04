"""
apps.matching.models
=====================
AI-powered matching engine models.

MatchScore      - persisted compatibility scores between startups and investors,
                  refreshed nightly by the Celery beat task update_all_match_scores.

InvestorIntentSignal - granular behavioural events (views, likes, offers …) used as
                  training data for the recommendation model and live feed ranking.
"""
from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.users.models import InvestorProfile, StartupProfile


class MatchScore(models.Model):
    """
    Multi-dimensional compatibility score between a startup and an investor.
    Scores range 0–1 and are computed by the MatchmakingService.
    """

    startup: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="match_scores",
    )
    investor: models.ForeignKey = models.ForeignKey(
        InvestorProfile,
        on_delete=models.CASCADE,
        related_name="match_scores",
    )

    # ---------- Dimensional scores ----------
    compatibility_score: models.FloatField = models.FloatField(
        _("overall compatibility"),
        help_text=_("Weighted composite of all dimension scores (0–1)"),
    )
    industry_score: models.FloatField = models.FloatField(_("industry match"), default=0.0)
    stage_score: models.FloatField = models.FloatField(_("funding stage match"), default=0.0)
    ticket_size_score: models.FloatField = models.FloatField(_("ticket size match"), default=0.0)
    location_score: models.FloatField = models.FloatField(_("location match"), default=0.0)
    semantic_score: models.FloatField = models.FloatField(
        _("semantic similarity"),
        default=0.0,
        help_text=_("Cosine similarity between startup and investor embeddings"),
    )

    # ---------- ML metadata ----------
    embedding_version: models.CharField = models.CharField(
        _("embedding model version"),
        max_length=30,
        default="v1",
    )
    confidence_interval: models.JSONField = models.JSONField(
        _("confidence interval"),
        default=dict,
        help_text=_('{"lower": 0.62, "upper": 0.78}'),
    )

    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("match score")
        verbose_name_plural = _("match scores")
        unique_together = [["startup", "investor"]]
        indexes = [
            models.Index(fields=["startup", "-compatibility_score"]),
            models.Index(fields=["investor", "-compatibility_score"]),
        ]
        ordering = ["-compatibility_score"]

    def __str__(self) -> str:
        return (
            f"{self.startup.company_name} ↔ {self.investor.full_name} "
            f"({self.compatibility_score:.2f})"
        )


class InvestorIntentSignal(models.Model):
    """
    Every investor interaction with a startup/pitch is recorded here
    as a training signal for the recommendation model.
    """

    SIGNAL_CHOICES = [
        ("view", _("Viewed Pitch")),
        ("like", _("Liked Pitch")),
        ("save", _("Saved Pitch")),
        ("offer_draft", _("Started Offer")),
        ("offer_sent", _("Sent Offer")),
        ("offer_accepted", _("Accepted Offer")),
        ("offer_rejected", _("Rejected Offer")),
        ("profile_view", _("Viewed Startup Profile")),
        ("dataroom_access", _("Accessed Data Room")),
    ]

    investor: models.ForeignKey = models.ForeignKey(
        InvestorProfile,
        on_delete=models.CASCADE,
        related_name="intent_signals",
    )
    startup: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="intent_signals",
    )
    signal_type: models.CharField = models.CharField(
        _("signal type"),
        max_length=30,
        choices=SIGNAL_CHOICES,
        db_index=True,
    )
    session_id: models.CharField = models.CharField(
        _("session ID"),
        max_length=64,
        blank=True,
        db_index=True,
    )
    time_spent_seconds: models.PositiveIntegerField = models.PositiveIntegerField(
        _("time spent (seconds)"),
        null=True,
        blank=True,
    )
    metadata: models.JSONField = models.JSONField(
        _("metadata"),
        default=dict,
        blank=True,
        help_text=_("Extra context: pitch_id, scroll_depth, etc."),
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _("investor intent signal")
        verbose_name_plural = _("investor intent signals")
        indexes = [
            models.Index(fields=["investor", "startup", "-created_at"]),
            models.Index(fields=["signal_type", "-created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.investor} → {self.startup} [{self.signal_type}]"


# Expose Opportunity Intelligence models
from apps.matching.models_opportunity import (  # noqa: E402
    FundingSource,
    FundingOpportunity,
    OpportunityVersion,
    StartupOpportunityMatch,
)
