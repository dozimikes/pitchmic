from __future__ import annotations

import uuid
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.users.models import StartupProfile


class FundingSource(models.Model):
    """
    Registry of monitored funding institutions, accelerators, and grant portals.
    """

    class SourceType(models.TextChoices):
        ACCELERATOR = "accelerator", _("Accelerator Program")
        VC_FIRM = "vc_firm", _("Venture Capital Firm")
        GRANT_PORTAL = "grant_portal", _("Non-Dilutive Grant Portal")
        CORPORATE_VENTURE = "corporate_venture", _("Corporate Venture / Innovation")
        DFI_FOUNDATION = "dfi_foundation", _("DFI / Foundation Program")

    class MonitoringMethod(models.TextChoices):
        WEB = "web", _("Web Page Monitoring")
        API = "api", _("Direct API Feed")
        RSS = "rss", _("RSS / Atom Feed")
        SITEMAP = "sitemap", _("Sitemap Change Detection")

    class CrawlFrequency(models.TextChoices):
        HOURLY_1 = "1h", _("Every 1 Hour (High Priority / Open Application)")
        HOURS_6 = "6h", _("Every 6 Hours (Standard Cohort Monitoring)")
        DAILY_24 = "24h", _("Every 24 Hours (Program Overview)")
        WEEKLY_7D = "7d", _("Every 7 Days (Closed / Dormant Source)")

    class TrustLevel(models.TextChoices):
        OFFICIAL_WEBSITE = "official_website", _("Tier-1 Official Source (0.98)")
        VERIFIED_PARTNER = "verified_partner", _("Verified Ecosystem Partner (0.90)")
        REPUTABLE_DATABASE = "reputable_database", _("Reputable Ecosystem Database (0.75)")
        NEWS_SOURCE = "news_source", _("Venture News / Announcement (0.65)")
        UNVERIFIED = "unverified", _("Unverified Discovery (0.30)")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text=_("e.g. 'Antler Africa', 'Visa Accelerator Africa'"))
    organization = models.CharField(max_length=255, help_text=_("e.g. 'Antler', 'Visa', 'Google'"))
    source_type = models.CharField(
        max_length=32,
        choices=SourceType.choices,
        default=SourceType.ACCELERATOR,
    )
    base_url = models.URLField(max_length=512)
    application_url = models.URLField(max_length=512, blank=True)
    monitoring_method = models.CharField(
        max_length=16,
        choices=MonitoringMethod.choices,
        default=MonitoringMethod.WEB,
    )
    crawl_frequency = models.CharField(
        max_length=16,
        choices=CrawlFrequency.choices,
        default=CrawlFrequency.HOURS_6,
    )
    trust_level = models.CharField(
        max_length=32,
        choices=TrustLevel.choices,
        default=TrustLevel.OFFICIAL_WEBSITE,
    )
    trust_score = models.FloatField(default=0.98)
    active = models.BooleanField(default=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_page_hash = models.CharField(max_length=64, blank=True, help_text=_("SHA256 hash for change detection"))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.source_type} - {self.trust_level})"


class FundingOpportunity(models.Model):
    """
    Normalized funding opportunity actively monitored, verified, and deduplicated.
    """

    class OpportunityType(models.TextChoices):
        ACCELERATOR = "accelerator", _("Accelerator Cohort")
        PRE_SEED_FUND = "pre_seed_fund", _("Pre-Seed Institutional Fund")
        SEED_FUND = "seed_fund", _("Seed Institutional Fund")
        GRANT = "grant", _("Non-Dilutive Grant")
        VENTURE_DEBT = "venture_debt", _("Venture Debt / Revenue Share")

    class Status(models.TextChoices):
        OPEN = "OPEN", _("Applications Open")
        CLOSING_SOON = "CLOSING_SOON", _("Closing Soon (< 21 Days)")
        CLOSED = "CLOSED", _("Applications Closed")
        UPCOMING = "UPCOMING", _("Upcoming Cohort Announced")
        ROLLING = "ROLLING", _("Rolling Applications")
        PAUSED = "PAUSED", _("Temporarily Paused")
        PREDICTED = "PREDICTED", _("Predicted Cohort Cycle")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.ForeignKey(
        FundingSource,
        on_delete=models.CASCADE,
        related_name="opportunities",
    )
    title = models.CharField(max_length=255, help_text=_("e.g. 'Antler Nigeria Cohort 2026'"))
    slug = models.SlugField(max_length=255, unique=True)
    opportunity_type = models.CharField(
        max_length=32,
        choices=OpportunityType.choices,
        default=OpportunityType.ACCELERATOR,
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.OPEN,
    )

    # Targeting criteria
    target_stage = models.CharField(max_length=32, default="pre_seed")
    target_geographies = models.JSONField(
        default=list,
        help_text=_("List of eligible countries/regions, e.g. ['Nigeria', 'Pan-Africa', 'Global']"),
    )
    target_sectors = models.JSONField(
        default=list,
        help_text=_("List of targeted industry sectors, e.g. ['fintech', 'saas', 'cleantech']"),
    )

    # Capital & Terms
    funding_amount_min_usd = models.DecimalField(max_digits=12, decimal_places=2, default=50000.00)
    funding_amount_max_usd = models.DecimalField(max_digits=12, decimal_places=2, default=250000.00)
    equity_percentage_taken = models.CharField(max_length=64, default="0-7% equity or SAFE")

    # Timing
    application_open_date = models.DateField(null=True, blank=True)
    application_deadline = models.DateField(null=True, blank=True)
    cohort_start_date = models.DateField(null=True, blank=True)
    is_rolling = models.BooleanField(default=False)

    # Zero-Fake-AI Provenance & Freshness
    source_confidence = models.FloatField(default=0.98)
    verified_freshness = models.DateTimeField(auto_now=True)
    source_quote_evidence = models.TextField(blank=True, help_text=_("Exact text extracted from official source"))

    # Descriptions & Requirements
    description = models.TextField()
    key_benefits = models.JSONField(
        default=list,
        help_text=_("List of benefits, e.g. ['$100K investment', '3-month residency', 'Demo Day access']"),
    )
    eligibility_criteria = models.JSONField(
        default=list,
        help_text=_("Eligibility checklist items"),
    )
    evidence_requirements = models.JSONField(
        default=list,
        help_text=_("List of documents/proof required, e.g. ['Customer validation', 'Cap table']"),
    )

    version_count = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-application_deadline", "-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["opportunity_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.status}) - {self.source.name}"


class OpportunityVersion(models.Model):
    """
    Historical snapshot preserved whenever a change in status, deadline, or funding is detected.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey(
        FundingOpportunity,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number = models.IntegerField(default=1)
    status = models.CharField(max_length=24)
    deadline = models.DateField(null=True, blank=True)
    funding_amount_max_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    changed_fields = models.JSONField(
        default=list,
        help_text=_("List of fields that changed in this version, e.g. ['status', 'deadline']"),
    )
    raw_content_snippet = models.TextField(blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version_number"]

    def __str__(self) -> str:
        return f"{self.opportunity.title} v{self.version_number} ({self.recorded_at.date()})"


class StartupOpportunityMatch(models.Model):
    """
    Calculated compatibility between a specific startup and an active funding opportunity.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="opportunity_matches",
    )
    opportunity = models.ForeignKey(
        FundingOpportunity,
        on_delete=models.CASCADE,
        related_name="startup_matches",
    )
    overall_match_score = models.IntegerField(
        default=85,
        help_text=_("Composite match score 0-100%"),
    )

    # 7-Dimension Breakdown (scores 0-100)
    stage_fit = models.IntegerField(default=95)
    geography_fit = models.IntegerField(default=100)
    sector_fit = models.IntegerField(default=90)
    funding_fit = models.IntegerField(default=90)
    business_model_fit = models.IntegerField(default=85)
    product_maturity_fit = models.IntegerField(default=80)
    evidence_readiness_fit = models.IntegerField(default=75)

    # Actionable gap analysis
    evidence_gaps = models.JSONField(
        default=list,
        help_text=_("Identified diligence/evidence weaknesses, e.g. ['Customer validation invoices missing']"),
    )
    positive_convictions = models.JSONField(
        default=list,
        help_text=_("Strengths driving the positive match score"),
    )

    is_saved_to_pipeline = models.BooleanField(default=False)
    pipeline_stage = models.CharField(max_length=32, blank=True, default="outreach")

    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [["startup", "opportunity"]]
        ordering = ["-overall_match_score"]

    def __str__(self) -> str:
        return f"{self.startup.company_name} ↔ {self.opportunity.title}: {self.overall_match_score}%"
