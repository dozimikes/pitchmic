"""
apps.intelligence_engine.models_entities
=========================================
Entity models: Organization, Person, FundingRound, Investment,
InvestorThesis, ObservedInvestment, PortfolioRelationship.

Key design principle — stated thesis vs observed behavior:
  InvestorThesis     stores what an investor SAYS they invest in
  ObservedInvestment stores what they actually DID invest in

Pitchmic computes thesis_alignment_pct from these two data sets,
giving founders a much more reliable signal than a self-reported thesis.
"""
from __future__ import annotations

import uuid
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------

class Organization(models.Model):
    """
    Canonical organization record. Covers VCs, accelerators, corporates,
    government bodies, foundations — any entity that provides funding or
    runs programs.  Deduplicates across sources via slug.
    """

    class OrgType(models.TextChoices):
        VC_FIRM         = "vc_firm",       _("Venture Capital Firm")
        ACCELERATOR     = "accelerator",   _("Accelerator / Incubator")
        CORPORATE_VC    = "corporate_vc",  _("Corporate Venture / CVC")
        ANGEL_NETWORK   = "angel",         _("Angel Network / Syndicate")
        GOVERNMENT      = "government",    _("Government / DFI")
        FOUNDATION      = "foundation",    _("Foundation / NGO")
        FAMILY_OFFICE   = "family_office", _("Family Office")
        STARTUP         = "startup",       _("Startup / Portfolio Company")
        MEDIA           = "media",         _("Media / News")
        OTHER           = "other",         _("Other")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name            = models.CharField(max_length=255, db_index=True)
    slug            = models.SlugField(max_length=255, unique=True)
    org_type        = models.CharField(max_length=32, choices=OrgType.choices, db_index=True)
    description     = models.TextField(blank=True)
    website         = models.URLField(max_length=512, blank=True)
    linkedin_url    = models.URLField(max_length=512, blank=True)
    crunchbase_url  = models.URLField(max_length=512, blank=True)
    twitter_handle  = models.CharField(max_length=128, blank=True)

    # Geography
    country         = models.CharField(max_length=4, blank=True,   help_text=_("ISO 3166-1 alpha-2"))
    city            = models.CharField(max_length=128, blank=True)
    headquarters    = models.CharField(max_length=255, blank=True)
    operating_geographies = models.JSONField(default=list, blank=True,
                                              help_text=_("Countries/regions where active"))

    # Fund / AUM data (where applicable)
    total_aum_usd   = models.BigIntegerField(null=True, blank=True,
                                              help_text=_("Total assets under management in USD"))
    current_fund_size_usd = models.BigIntegerField(null=True, blank=True)
    fund_number     = models.CharField(max_length=32, blank=True, help_text=_("e.g. 'Fund III'"))
    founded_year    = models.PositiveSmallIntegerField(null=True, blank=True)

    # Provenance / verification
    verified        = models.BooleanField(default=False)
    source_url      = models.URLField(max_length=512, blank=True)
    confidence      = models.FloatField(default=0.80)
    data_sources    = models.JSONField(default=list, blank=True,
                                       help_text=_("List of source URLs that contributed data"))

    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["org_type", "country"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.org_type})"


# ---------------------------------------------------------------------------
# Person
# ---------------------------------------------------------------------------

class Person(models.Model):
    """
    Canonical person record — founders, partners, investors, advisors.
    """

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name       = models.CharField(max_length=255, db_index=True)
    slug            = models.SlugField(max_length=255, unique=True)
    role            = models.CharField(max_length=128, blank=True,
                                       help_text=_("e.g. 'General Partner', 'Founder & CEO'"))
    organization    = models.ForeignKey(Organization, on_delete=models.SET_NULL,
                                        null=True, blank=True, related_name="people")
    linkedin_url    = models.URLField(max_length=512, blank=True)
    twitter_handle  = models.CharField(max_length=128, blank=True)
    bio_summary     = models.TextField(blank=True)
    location        = models.CharField(max_length=255, blank=True)
    verified        = models.BooleanField(default=False)
    confidence      = models.FloatField(default=0.70)
    source_url      = models.URLField(max_length=512, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self) -> str:
        return f"{self.full_name} @ {self.organization.name if self.organization else '?'}"


# ---------------------------------------------------------------------------
# InvestorThesis — what an investor SAYS they invest in
# ---------------------------------------------------------------------------

class InvestorThesis(models.Model):
    """
    Stated investment thesis for an organization (VC fund / accelerator).
    Populated from their website, FAQ, About page, pitch deck, etc.
    Compared against ObservedInvestment to compute thesis_alignment_pct.
    """

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization        = models.OneToOneField(Organization, on_delete=models.CASCADE,
                                               related_name="stated_thesis")

    # Stated preferences
    stated_sectors      = models.JSONField(default=list, help_text=_("Self-reported focus sectors"))
    stated_geographies  = models.JSONField(default=list, help_text=_("Self-reported target geographies"))
    stated_stages       = models.JSONField(default=list, help_text=_("Self-reported target stages"))
    stated_check_min    = models.BigIntegerField(null=True, blank=True, help_text=_("Stated min check size USD"))
    stated_check_max    = models.BigIntegerField(null=True, blank=True, help_text=_("Stated max check size USD"))
    thesis_text         = models.TextField(blank=True, help_text=_("Full thesis statement from website"))
    equity_preference   = models.CharField(max_length=255, blank=True,
                                           help_text=_("Typical equity terms e.g. '7-10% SAFE'"))

    # Observed alignment (recomputed periodically from ObservedInvestment)
    thesis_alignment_pct    = models.FloatField(default=0.0,
                                                 help_text=_("% of observed investments that match stated thesis"))
    observed_sector_dist    = models.JSONField(default=dict,
                                               help_text=_("{'fintech': 14, 'healthtech': 5} — actual counts"))
    observed_geo_dist       = models.JSONField(default=dict)
    observed_stage_dist     = models.JSONField(default=dict)
    observed_avg_check_usd  = models.BigIntegerField(null=True, blank=True)
    total_observed_deals    = models.PositiveIntegerField(default=0)
    deals_last_12_months    = models.PositiveIntegerField(default=0)

    # Momentum score (0–100)
    momentum_score          = models.FloatField(default=0.0,
                                                 help_text=_("Investment velocity + recency + consistency"))

    # Provenance
    source_url      = models.URLField(max_length=512, blank=True)
    confidence      = models.FloatField(default=0.70)
    last_computed   = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Investor Thesis"
        verbose_name_plural = "Investor Theses"

    def __str__(self) -> str:
        return f"Thesis: {self.organization.name} (alignment={self.thesis_alignment_pct:.0f}%)"


# ---------------------------------------------------------------------------
# FundingRound
# ---------------------------------------------------------------------------

class FundingRound(models.Model):
    """
    A verified funding event for a startup.
    Sources: Crunchbase, TechCrunch, official press releases, SEC filings.
    """

    class RoundType(models.TextChoices):
        PRE_SEED    = "pre_seed",   _("Pre-Seed")
        SEED        = "seed",       _("Seed")
        SERIES_A    = "series_a",   _("Series A")
        SERIES_B    = "series_b",   _("Series B")
        SERIES_C    = "series_c",   _("Series C")
        SERIES_D    = "series_d",   _("Series D+")
        BRIDGE      = "bridge",     _("Bridge / Convertible")
        GRANT       = "grant",      _("Grant")
        ACCELERATOR = "accelerator",_("Accelerator")
        DEBT        = "debt",       _("Venture Debt")
        IPO         = "ipo",        _("IPO / Public Market")
        UNKNOWN     = "unknown",    _("Unknown")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup         = models.ForeignKey(Organization, on_delete=models.CASCADE,
                                        related_name="funding_rounds",
                                        limit_choices_to={"org_type": "startup"})
    round_type      = models.CharField(max_length=32, choices=RoundType.choices, db_index=True)
    amount_usd      = models.BigIntegerField(null=True, blank=True)
    currency        = models.CharField(max_length=8, default="USD")
    valuation_usd   = models.BigIntegerField(null=True, blank=True, help_text=_("Post-money valuation"))

    announced_date  = models.DateField(null=True, blank=True, db_index=True)
    closing_date    = models.DateField(null=True, blank=True)

    lead_investor   = models.ForeignKey(Organization, on_delete=models.SET_NULL,
                                        null=True, blank=True, related_name="led_rounds")
    lead_investor_name = models.CharField(max_length=255, blank=True,
                                           help_text=_("Raw name if not resolved to Organization"))

    # Co-investors as JSON list of names (resolved separately)
    co_investor_names = models.JSONField(default=list)

    geography       = models.CharField(max_length=128, blank=True)
    sector          = models.CharField(max_length=128, blank=True)
    round_number    = models.PositiveSmallIntegerField(default=1)
    is_equity       = models.BooleanField(default=True)

    # Provenance
    source_url      = models.URLField(max_length=512, blank=True)
    source_type     = models.CharField(max_length=32, blank=True,
                                       help_text=_("official_pr | crunchbase | techcrunch | sec_filing"))
    confidence      = models.FloatField(default=0.75, db_index=True)
    evidence_snippet = models.TextField(blank=True)

    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-announced_date"]
        indexes = [
            models.Index(fields=["startup", "round_type"]),
            models.Index(fields=["announced_date"]),
            models.Index(fields=["lead_investor"]),
        ]

    def __str__(self) -> str:
        amt = f"${self.amount_usd:,}" if self.amount_usd else "undisclosed"
        return f"{self.startup.name} {self.round_type} {amt} ({self.announced_date})"


# ---------------------------------------------------------------------------
# Investment — individual investor → round participation
# ---------------------------------------------------------------------------

class Investment(models.Model):
    """
    Records a single investor's participation in a FundingRound.
    Enables building the Investor Intelligence Graph.
    """

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    investor        = models.ForeignKey(Organization, on_delete=models.CASCADE,
                                        related_name="investments")
    round           = models.ForeignKey(FundingRound, on_delete=models.CASCADE,
                                        related_name="investments")
    is_lead         = models.BooleanField(default=False)
    investment_amount_usd = models.BigIntegerField(null=True, blank=True)
    equity_pct      = models.FloatField(null=True, blank=True)

    # Provenance
    source_url      = models.URLField(max_length=512, blank=True)
    confidence      = models.FloatField(default=0.75)
    evidence_snippet = models.TextField(blank=True)

    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["investor", "round"]]
        ordering = ["-round__announced_date"]

    def __str__(self) -> str:
        lead_flag = " [LEAD]" if self.is_lead else ""
        return f"{self.investor.name}{lead_flag} → {self.round}"


# ---------------------------------------------------------------------------
# ObservedInvestment — actual investment behavior (vs stated thesis)
# ---------------------------------------------------------------------------

class ObservedInvestment(models.Model):
    """
    Denormalized record of an organization's observed investment behavior.
    Pre-aggregated for fast thesis-alignment queries.

    Populated by InvestorIntelligenceEngine from Investment records.
    """

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization    = models.ForeignKey(Organization, on_delete=models.CASCADE,
                                        related_name="observed_investments")
    investment      = models.ForeignKey(Investment, on_delete=models.CASCADE,
                                        related_name="observation")
    startup_name    = models.CharField(max_length=255)
    startup_sector  = models.CharField(max_length=128, blank=True, db_index=True)
    startup_geography = models.CharField(max_length=128, blank=True, db_index=True)
    startup_stage   = models.CharField(max_length=64, blank=True, db_index=True)
    round_type      = models.CharField(max_length=32, blank=True)
    amount_usd      = models.BigIntegerField(null=True, blank=True)
    announced_date  = models.DateField(null=True, blank=True, db_index=True)
    months_since    = models.PositiveSmallIntegerField(default=0,
                                                        help_text=_("Months since investment announcement"))
    is_recent       = models.BooleanField(default=True,
                                           help_text=_("True if within last 24 months"))

    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-announced_date"]
        indexes = [
            models.Index(fields=["organization", "startup_sector"]),
            models.Index(fields=["organization", "startup_geography"]),
            models.Index(fields=["organization", "startup_stage"]),
            models.Index(fields=["organization", "-announced_date"]),
        ]

    def __str__(self) -> str:
        return f"{self.organization.name} → {self.startup_name} ({self.startup_stage})"


# ---------------------------------------------------------------------------
# PortfolioRelationship
# ---------------------------------------------------------------------------

class PortfolioRelationship(models.Model):
    """
    Explicit investor → portfolio company relationship with metadata.
    Enables co-investor cluster analysis.
    """

    class RelationshipType(models.TextChoices):
        LEAD_INVESTOR   = "lead",   _("Lead Investor")
        CO_INVESTOR     = "co",     _("Co-investor")
        BOARD_MEMBER    = "board",  _("Board Member")
        ADVISOR         = "advisor",_("Advisor")
        ACQUIRER        = "acq",    _("Acquirer")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    investor        = models.ForeignKey(Organization, on_delete=models.CASCADE,
                                        related_name="portfolio_relationships")
    portfolio_company = models.ForeignKey(Organization, on_delete=models.CASCADE,
                                           related_name="investor_relationships")
    relationship_type = models.CharField(max_length=16, choices=RelationshipType.choices)
    started_at      = models.DateField(null=True, blank=True)
    ended_at        = models.DateField(null=True, blank=True)
    is_active       = models.BooleanField(default=True)
    source_url      = models.URLField(max_length=512, blank=True)
    confidence      = models.FloatField(default=0.80)

    class Meta:
        unique_together = [["investor", "portfolio_company", "relationship_type"]]
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"{self.investor.name} --[{self.relationship_type}]--> {self.portfolio_company.name}"
