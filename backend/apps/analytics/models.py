"""
apps.analytics.models
======================
Three model families:

FundraisingPrediction     — ML-generated multi-horizon prediction of a startup's
                            fundraising trajectory, success probability, exit type,
                            and investor ROI.  Re-run nightly by Celery beat.

InvestorBehaviorAnalysis  — Aggregate behavioural profile of an investor:
                            response rates, preferred stages, risk appetite, etc.
                            Derived from InvestorIntentSignal data.

UserBehaviorEvent         — Raw event stream for both roles.  Low-overhead
                            append-only log used as ML training data and for
                            real-time personalisation.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.users.models import InvestorProfile, StartupProfile


class FundraisingPrediction(models.Model):
    """
    Comprehensive ML-generated prediction for a startup.
    Stored as one row per startup (updated in-place on each nightly run).
    """

    startup: models.OneToOneField = models.OneToOneField(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="fundraising_prediction",
    )

    #  Core success metrics 
    success_probability: models.FloatField = models.FloatField(
        _("success probability"),
        help_text=_("Overall likelihood of a successful funding round (0–1)"),
    )
    confidence_lower: models.FloatField = models.FloatField(
        _("confidence interval lower"), default=0.0
    )
    confidence_upper: models.FloatField = models.FloatField(
        _("confidence interval upper"), default=1.0
    )

    #  Fundraising timeline 
    predicted_time_to_fundraise_days: models.PositiveIntegerField = (
        models.PositiveIntegerField(
            _("predicted days to close funding"),
            null=True,
            blank=True,
        )
    )
    predicted_amount_raised: models.DecimalField = models.DecimalField(
        _("predicted amount raised (USD)"),
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
    )
    predicted_investor_match_count: models.PositiveIntegerField = (
        models.PositiveIntegerField(_("predicted investor match count"), null=True, blank=True)
    )

    #  Exit prediction (rich JSON) 
    exit_prediction: models.JSONField = models.JSONField(
        _("exit prediction"),
        default=dict,
        help_text=_(
            "Keys: exit_type, exit_probability, timeline_years, "
            "valuation_floor, valuation_ceiling, acquirer_match"
        ),
    )

    #  Investor ROI (JSON with Monte Carlo result) 
    investor_roi: models.JSONField = models.JSONField(
        _("investor ROI"),
        default=dict,
        help_text=_(
            "Keys: expected_roi_3yr, expected_roi_5yr, expected_roi_10yr, "
            "best_case, worst_case, median_case, probability_positive_roi"
        ),
    )

    #  Market potential 
    market_potential: models.JSONField = models.JSONField(
        _("market potential"),
        default=dict,
        help_text=_(
            "Keys: tam_growth_rate, sam_penetration, market_cap_prediction, "
            "disruption_potential, moat_strength"
        ),
    )

    #  Growth trajectory 
    growth_trajectory: models.JSONField = models.JSONField(
        _("growth trajectory"),
        default=dict,
        help_text=_(
            "Keys: growth_phase, projected_y1_growth, projected_y2_growth, "
            "hockey_stick_year, growth_velocity, requires_funding, funding_gap"
        ),
    )

    #  Risk profile 
    risk_profile: models.JSONField = models.JSONField(
        _("risk profile"),
        default=dict,
        help_text=_(
            "Keys: overall_risk, technical_risk, market_risk, "
            "team_risk, financial_risk, execution_risk, mitigations"
        ),
    )

    #  Benchmarks against comparable startups 
    benchmarks: models.JSONField = models.JSONField(
        _("benchmarks"),
        default=dict,
        help_text=_("Similar successful/failed startups, peer percentile"),
    )

    #  Health radar scores (0–100) 
    scalability_score: models.FloatField = models.FloatField(
        _("scalability score"), default=0.0
    )
    uniqueness_score: models.FloatField = models.FloatField(
        _("uniqueness score"), default=0.0
    )
    team_score: models.FloatField = models.FloatField(_("team score"), default=0.0)
    product_score: models.FloatField = models.FloatField(_("product score"), default=0.0)
    market_score: models.FloatField = models.FloatField(_("market score"), default=0.0)
    traction_score: models.FloatField = models.FloatField(_("traction score"), default=0.0)

    #  Explainability 
    top_features: models.JSONField = models.JSONField(
        _("top SHAP features"),
        default=list,
        help_text=_('[{"feature": "team_size", "importance": 0.3, "direction": "positive"}]'),
    )
    explanation: models.TextField = models.TextField(
        _("human-readable explanation"), blank=True
    )

    #  Model provenance 
    model_version: models.CharField = models.CharField(
        _("model version"), max_length=20, default="v1"
    )
    confidence_score: models.FloatField = models.FloatField(
        _("overall confidence score"), default=0.0
    )

    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("fundraising prediction")
        verbose_name_plural = _("fundraising predictions")

    def __str__(self) -> str:
        return f"Prediction for {self.startup.company_name} (p={self.success_probability:.2f})"


class InvestorBehaviorAnalysis(models.Model):
    """
    Aggregated behavioural profile derived from intent signals.
    Updated weekly by Celery beat.
    """

    investor: models.OneToOneField = models.OneToOneField(
        InvestorProfile,
        on_delete=models.CASCADE,
        related_name="behavior_analysis",
    )

    # Engagement metrics
    avg_time_on_pitch_seconds: models.FloatField = models.FloatField(default=0.0)
    view_to_offer_conversion_rate: models.FloatField = models.FloatField(
        _("view → offer rate"), default=0.0
    )
    total_pitches_viewed: models.PositiveIntegerField = models.PositiveIntegerField(default=0)
    total_offers_sent: models.PositiveIntegerField = models.PositiveIntegerField(default=0)
    total_offers_accepted: models.PositiveIntegerField = models.PositiveIntegerField(default=0)

    # Stage / size preferences (derived)
    preferred_funding_stages: models.JSONField = models.JSONField(default=list)
    avg_offer_amount: models.DecimalField = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True
    )

    # Temporal patterns
    peak_activity_hours: models.JSONField = models.JSONField(
        default=list,
        help_text=_("List of hours (0-23) where investor is most active"),
    )
    avg_response_time_hours: models.FloatField = models.FloatField(default=0.0)

    # ML-derived personality scores (0–1)
    risk_tolerance_score: models.FloatField = models.FloatField(default=0.5)
    innovation_appetite: models.FloatField = models.FloatField(default=0.5)
    industry_affinity: models.JSONField = models.JSONField(
        default=dict,
        help_text=_('{"fintech": 0.8, "saas": 0.6}'),
    )

    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("investor behavior analysis")
        verbose_name_plural = _("investor behavior analyses")

    def __str__(self) -> str:
        return f"Behavior: {self.investor.full_name}"


class UserBehaviorEvent(models.Model):
    """
    Append-only event log for all user interactions.
    Drives ML training, personalisation, and the investment heatmap.
    """

    EVENT_CHOICES = [
        ("pitch_view", "Pitch View"),
        ("pitch_like", "Pitch Like"),
        ("pitch_save", "Pitch Save"),
        ("offer_draft", "Offer Draft"),
        ("offer_sent", "Offer Sent"),
        ("offer_accepted", "Offer Accepted"),
        ("profile_view", "Profile View"),
        ("search_query", "Search Query"),
        ("filter_use", "Filter Use"),
        ("notification_click", "Notification Click"),
        ("dataroom_view", "Data Room View"),
        ("outreach_click", "Outreach Click"),
        ("prediction_view", "Prediction View"),
    ]

    user: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="behavior_events",
    )
    event_type: models.CharField = models.CharField(
        max_length=30, choices=EVENT_CHOICES, db_index=True
    )
    session_id: models.CharField = models.CharField(max_length=64, blank=True, db_index=True)
    object_id: models.PositiveIntegerField = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=_("PK of the related object (pitch_id, startup_id, etc.)"),
    )
    object_type: models.CharField = models.CharField(
        max_length=50, blank=True, help_text=_("Model name of the related object")
    )
    metadata: models.JSONField = models.JSONField(default=dict, blank=True)
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _("user behavior event")
        verbose_name_plural = _("user behavior events")
        indexes = [
            models.Index(fields=["user", "event_type", "-created_at"]),
            models.Index(fields=["event_type", "-created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user.email} – {self.event_type} @ {self.created_at:%Y-%m-%d %H:%M}"
