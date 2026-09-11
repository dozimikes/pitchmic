"""
apps.intelligence_engine.models_opportunities
==============================================
Extended opportunity models with full lifecycle, per-field evidence,
funding path graph, and startup readiness/eligibility tracking.

Key difference from matching.FundingOpportunity:
  - Every field has its own evidence chain (DeadlineEvidence, etc.)
  - Status follows a proper lifecycle (DISCOVERED → VERIFIED → OPEN → CLOSED)
  - Freshness is a calculated score, not just a timestamp
  - ReadinessBlocker explains exactly WHY a startup can't apply yet
  - FundingPath builds the multi-step financing route
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.intelligence_engine.models_entities import Organization


# ---------------------------------------------------------------------------
# OpportunityLifecycle
# ---------------------------------------------------------------------------

class OpportunityLifecycle(models.Model):
    """
    The canonical opportunity record in the intelligence engine.
    Replaces (and enriches) matching.FundingOpportunity.

    Status lifecycle:
      DISCOVERED → UNVERIFIED → VERIFIED → OPENING_SOON → OPEN
        → DEADLINE_APPROACHING → CLOSED → ARCHIVED

    Every status transition is recorded in ChangeEvent with the evidence
    that triggered the transition.
    """

    class LifecycleStatus(models.TextChoices):
        DISCOVERED           = "discovered",    _("Discovered - not yet verified")
        UNVERIFIED           = "unverified",    _("Unverified - insufficient evidence")
        VERIFIED             = "verified",      _("Verified - confirmed active program")
        OPENING_SOON         = "opening_soon",  _("Opening Soon - announced but not yet open")
        OPEN                 = "open",          _("Open - applications accepted")
        DEADLINE_APPROACHING = "closing",       _("Deadline Approaching (< 21 days)")
        ROLLING              = "rolling",       _("Rolling - no fixed deadline")
        CLOSED               = "closed",        _("Closed - past deadline")
        PAUSED               = "paused",        _("Paused - temporarily suspended")
        ARCHIVED             = "archived",      _("Archived - historical record")
        UNKNOWN              = "unknown",       _("Unknown - insufficient signal")

    class OpportunityType(models.TextChoices):
        ACCELERATOR     = "accelerator",    _("Accelerator Cohort")
        PRE_SEED_FUND   = "pre_seed_fund",  _("Pre-Seed Institutional Fund")
        SEED_FUND       = "seed_fund",      _("Seed Fund")
        SERIES_A_FUND   = "series_a_fund",  _("Series A Fund")
        GRANT           = "grant",          _("Non-Dilutive Grant")
        COMPETITION     = "competition",    _("Startup Competition")
        FELLOWSHIP      = "fellowship",     _("Fellowship Program")
        VENTURE_DEBT    = "venture_debt",   _("Venture Debt / Revenue Share")
        CORPORATE_PROG  = "corporate",      _("Corporate Innovation Program")
        GOVERNMENT_FUND = "government",     _("Government Fund / DFI")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Canonical slug links to matching.FundingOpportunity for backwards compat
    slug            = models.SlugField(max_length=255, unique=True)
    title           = models.CharField(max_length=512)
    organization    = models.ForeignKey(Organization, on_delete=models.CASCADE,
                                        related_name="opportunities", null=True, blank=True)
    organization_name = models.CharField(max_length=255, db_index=True,
                                          help_text=_("Denormalized for queries"))
    source          = models.ForeignKey(
        "intelligence_engine.SourceRegistry",
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="opportunity_lifecycles",
    )

    # Classification
    opportunity_type = models.CharField(max_length=32, choices=OpportunityType.choices,
                                        db_index=True)
    lifecycle_status = models.CharField(max_length=24, choices=LifecycleStatus.choices,
                                        default=LifecycleStatus.DISCOVERED, db_index=True)

    # Targeting
    target_stages       = models.JSONField(default=list)
    target_geographies  = models.JSONField(default=list)
    target_sectors      = models.JSONField(default=list)
    is_global           = models.BooleanField(default=False)
    is_rolling          = models.BooleanField(default=False)

    # Capital terms (best-known values - see DeadlineEvidence for per-field evidence)
    funding_min_usd     = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    funding_max_usd     = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    equity_terms        = models.CharField(max_length=255, blank=True)
    is_equity_free      = models.BooleanField(default=False)

    # Dates (best-known values)
    application_open_date   = models.DateField(null=True, blank=True)
    application_deadline    = models.DateField(null=True, blank=True, db_index=True)
    cohort_start_date       = models.DateField(null=True, blank=True)

    # Descriptions
    description         = models.TextField(blank=True)
    key_benefits        = models.JSONField(default=list)
    eligibility_criteria = models.JSONField(default=list)
    evidence_requirements = models.JSONField(default=list)
    application_url     = models.URLField(max_length=512, blank=True)

    # Freshness scoring (0.0–1.0)
    # Freshness = source_reliability × recency_factor × evidence_quality × change_stability
    freshness_score     = models.FloatField(default=0.0, db_index=True,
                                             help_text=_("Composite freshness 0–1.0"))
    source_reliability  = models.FloatField(default=0.80)
    recency_factor      = models.FloatField(default=0.50)
    evidence_quality    = models.FloatField(default=0.50)
    change_stability    = models.FloatField(default=0.80,
                                             help_text=_("1.0 = stable, decreases with frequent changes"))

    # Verification provenance
    last_verified_at    = models.DateTimeField(null=True, blank=True)
    last_fetched_at     = models.DateTimeField(null=True, blank=True)
    last_fetched_from   = models.URLField(max_length=512, blank=True)
    overall_confidence  = models.FloatField(default=0.0)
    version_count       = models.PositiveIntegerField(default=1)

    # Evidence audit (JSON blob linking to FactEvidence PKs per field)
    field_evidence_map  = models.JSONField(default=dict, blank=True,
                                            help_text=_(
                                                "Maps field names to evidence IDs: "
                                                "{'deadline': 'uuid', 'status': 'uuid', ...}"
                                            ))

    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-application_deadline", "-created_at"]
        indexes = [
            models.Index(fields=["lifecycle_status", "organization_name"]),
            models.Index(fields=["freshness_score"]),
            models.Index(fields=["application_deadline"]),
        ]
        verbose_name = "Opportunity Lifecycle"
        verbose_name_plural = "Opportunity Lifecycles"

    def __str__(self) -> str:
        return f"{self.title} [{self.lifecycle_status}]"

    def compute_freshness(self) -> float:
        """
        Freshness = source_reliability × recency_factor × evidence_quality × change_stability
        """
        if not self.last_fetched_at:
            self.recency_factor = 0.0
        else:
            from datetime import timedelta
            hours_ago = (timezone.now() - self.last_fetched_at).total_seconds() / 3600
            # Decay function: full freshness for 0–6h, decays to 0 by 168h (7 days)
            self.recency_factor = max(0.0, 1.0 - (hours_ago / 168.0))

        score = (
            self.source_reliability
            * self.recency_factor
            * self.evidence_quality
            * self.change_stability
        )
        self.freshness_score = round(min(1.0, max(0.0, score)), 4)
        return self.freshness_score

    @property
    def freshness_label(self) -> str:
        s = self.freshness_score
        if s >= 0.80: return "verified_fresh"
        if s >= 0.60: return "recent"
        if s >= 0.40: return "aging"
        if s >= 0.20: return "stale"
        return "unknown"

    @property
    def days_until_deadline(self) -> int | None:
        if not self.application_deadline:
            return None
        return max(0, (self.application_deadline - timezone.now().date()).days)


# ---------------------------------------------------------------------------
# DeadlineEvidence - per-field provenance for the deadline (and other dates)
# ---------------------------------------------------------------------------

class DeadlineEvidence(models.Model):
    """
    Stores every source that reported a deadline (or open/start date) for
    an opportunity.  Multiple records may exist - one per source.
    The canonical value in OpportunityLifecycle is chosen via conflict resolution.
    """

    class DateField(models.TextChoices):
        DEADLINE    = "deadline",   _("Application Deadline")
        OPEN_DATE   = "open",       _("Application Open Date")
        COHORT_START = "cohort",    _("Cohort / Program Start")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity     = models.ForeignKey(OpportunityLifecycle, on_delete=models.CASCADE,
                                        related_name="deadline_evidence")
    date_field      = models.CharField(max_length=16, choices=DateField.choices,
                                       default=DateField.DEADLINE)
    value           = models.DateField(null=True, blank=True)
    source_url      = models.URLField(max_length=512)
    source_type     = models.CharField(max_length=32,
                                       help_text=_("official_website | rss | news | social"))
    source_tier     = models.CharField(max_length=4, default="T1")
    evidence_snippet = models.TextField(blank=True,
                                        help_text=_("Exact text from source: 'Deadline: October 31, 2026'"))
    extraction_method = models.CharField(max_length=64)
    confidence      = models.FloatField()
    retrieved_at    = models.DateTimeField()
    is_canonical    = models.BooleanField(default=False,
                                          help_text=_("True = this record is the authoritative value"))

    class Meta:
        ordering = ["-confidence", "-retrieved_at"]
        indexes = [
            models.Index(fields=["opportunity", "date_field"]),
        ]

    def __str__(self) -> str:
        return f"{self.date_field}={self.value} conf={self.confidence:.2f} [{self.source_tier}]"


# ---------------------------------------------------------------------------
# OpportunityRequirement - granular eligibility / evidence requirements
# ---------------------------------------------------------------------------

class OpportunityRequirement(models.Model):
    """
    A single requirement for an opportunity - e.g. "minimum 2 founders",
    "must be incorporated in Africa", "requires $10K MRR".

    Used by ReadinessEngine to compute a startup's gap analysis.
    """

    class RequirementType(models.TextChoices):
        GEOGRAPHY       = "geography",    _("Geographic Requirement")
        STAGE           = "stage",        _("Stage Requirement")
        SECTOR          = "sector",       _("Sector Requirement")
        TEAM_SIZE       = "team_size",    _("Team Size Requirement")
        REVENUE         = "revenue",      _("Revenue Requirement")
        INCORPORATION   = "incorporation",_("Legal Incorporation")
        PRODUCT_STAGE   = "product",      _("Product Maturity")
        TRACTION        = "traction",     _("Customer / Traction Proof")
        DOCUMENTATION   = "docs",         _("Document / Evidence Required")
        TIME_COMMITMENT = "time",         _("Time / Relocation Commitment")
        FUNDING_HISTORY = "funding_hist", _("Prior Funding History")
        OTHER           = "other",        _("Other")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity     = models.ForeignKey(OpportunityLifecycle, on_delete=models.CASCADE,
                                        related_name="requirements")
    requirement_type = models.CharField(max_length=32, choices=RequirementType.choices,
                                        db_index=True)
    description     = models.TextField(help_text=_("Human-readable requirement text"))
    # Machine-readable constraint
    constraint_key  = models.CharField(max_length=128, blank=True,
                                       help_text=_("e.g. 'min_mrr_usd', 'min_founders', 'geography_match'"))
    constraint_value = models.JSONField(null=True, blank=True,
                                        help_text=_("Typed value for algorithmic checking"))
    is_mandatory    = models.BooleanField(default=True)
    is_blocking     = models.BooleanField(default=False,
                                          help_text=_("True = disqualifier if not met"))
    weight          = models.FloatField(default=1.0,
                                        help_text=_("Importance weight for readiness score 0–2.0"))

    # Provenance
    source_url      = models.URLField(max_length=512, blank=True)
    evidence_snippet = models.TextField(blank=True)
    confidence      = models.FloatField(default=0.75)
    extracted_at    = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-is_blocking", "-weight"]

    def __str__(self) -> str:
        flag = "[BLOCKING] " if self.is_blocking else ""
        return f"{flag}{self.requirement_type}: {self.description[:80]}"


# ---------------------------------------------------------------------------
# FundingPath - multi-step financing pathway for a startup
# ---------------------------------------------------------------------------

class FundingPath(models.Model):
    """
    A recommended financing pathway for a specific startup.

    Example:
      Step 1: Antler Nigeria (pre-seed, 3 months away)
      Step 2: Launch Africa pre-seed (6 months away)
      Step 3: YC W2027 (12 months away)

    Computed by FundingPathEngine from the startup's current profile +
    active opportunities in the opportunity graph.
    """

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup_id      = models.UUIDField(db_index=True,
                                       help_text=_("References StartupProfile.id"))
    startup_name    = models.CharField(max_length=255, blank=True)
    path_label      = models.CharField(max_length=255, blank=True,
                                       help_text=_("e.g. 'Aggressive 12-month path'"))
    total_steps     = models.PositiveSmallIntegerField(default=0)
    total_potential_usd = models.BigIntegerField(default=0,
                                                  help_text=_("Sum of max funding across path steps"))
    horizon_months  = models.PositiveSmallIntegerField(default=18)
    computed_at     = models.DateTimeField(default=timezone.now)
    is_active       = models.BooleanField(default=True)

    class Meta:
        ordering = ["-computed_at"]
        indexes = [models.Index(fields=["startup_id"])]

    def __str__(self) -> str:
        return f"Path for {self.startup_name or self.startup_id} ({self.total_steps} steps)"


class FundingPathStep(models.Model):
    """A single step in a FundingPath."""

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    path            = models.ForeignKey(FundingPath, on_delete=models.CASCADE,
                                        related_name="steps")
    step_number     = models.PositiveSmallIntegerField()
    opportunity     = models.ForeignKey(OpportunityLifecycle, on_delete=models.CASCADE,
                                        related_name="path_steps", null=True, blank=True)
    opportunity_title = models.CharField(max_length=512, blank=True)
    opportunity_type  = models.CharField(max_length=32, blank=True)
    estimated_funding_usd = models.BigIntegerField(null=True, blank=True)
    estimated_months_from_now = models.PositiveSmallIntegerField(default=0)
    match_score     = models.FloatField(default=0.0)
    readiness_pct   = models.FloatField(default=0.0)
    rationale       = models.TextField(blank=True)

    class Meta:
        ordering = ["step_number"]
        unique_together = [["path", "step_number"]]

    def __str__(self) -> str:
        return f"Step {self.step_number}: {self.opportunity_title or '?'} (~{self.estimated_months_from_now}mo)"


# ---------------------------------------------------------------------------
# ReadinessBlocker - why a startup can't apply to an opportunity yet
# ---------------------------------------------------------------------------

class ReadinessBlocker(models.Model):
    """
    A specific gap between a startup's current state and an opportunity's
    requirements.  Computed by ReadinessEngine.  Powers the
    "Application readiness: 61%" UI with specific blocking items.
    """

    class BlockerType(models.TextChoices):
        GEOGRAPHY       = "geography",    _("Geographic mismatch")
        STAGE           = "stage",        _("Stage too early or too late")
        SECTOR          = "sector",       _("Sector not targeted")
        TEAM_SIZE       = "team_size",    _("Insufficient team size")
        REVENUE         = "revenue",      _("Below revenue threshold")
        INCORPORATION   = "incorporation",_("Not incorporated in eligible jurisdiction")
        PRODUCT_STAGE   = "product",      _("Product not mature enough")
        EVIDENCE_GAP    = "evidence",     _("Missing evidence / documentation")
        FUNDING_HISTORY = "funding",      _("Funding history incompatible")
        DEADLINE_PASSED = "deadline",     _("Deadline already passed")
        OTHER           = "other",        _("Other requirement not met")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity     = models.ForeignKey(OpportunityLifecycle, on_delete=models.CASCADE,
                                        related_name="readiness_blockers")
    startup_id      = models.UUIDField(db_index=True)

    requirement     = models.ForeignKey(OpportunityRequirement, on_delete=models.CASCADE,
                                        null=True, blank=True)
    requirement_type = models.CharField(max_length=32, choices=BlockerType.choices)
    description     = models.TextField(help_text=_("Human-readable explanation of the gap"))
    is_blocking     = models.BooleanField(default=True,
                                          help_text=_("True = hard disqualifier; False = soft gap"))
    resolution_hint = models.TextField(blank=True,
                                       help_text=_("Actionable advice to resolve this blocker"))
    weight          = models.FloatField(default=1.0)
    estimated_days_to_resolve = models.PositiveIntegerField(null=True, blank=True,
                                                             help_text=_("Rough estimate to fix this gap"))
    computed_at     = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-is_blocking", "-weight"]
        indexes = [
            models.Index(fields=["startup_id", "opportunity"]),
        ]

    def __str__(self) -> str:
        flag = "[BLOCKING] " if self.is_blocking else "[SOFT] "
        return f"{flag}{self.requirement_type}: {self.description[:80]}"


# ---------------------------------------------------------------------------
# StartupReadinessScore - cached readiness assessment per startup per opportunity
# ---------------------------------------------------------------------------

class StartupReadinessScore(models.Model):
    """
    Cached result of ReadinessEngine.assess(startup, opportunity).
    Stores overall readiness %, blocking count, soft-gap count,
    and the recommended actions list.
    """

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup_id      = models.UUIDField(db_index=True)
    opportunity     = models.ForeignKey(OpportunityLifecycle, on_delete=models.CASCADE,
                                        related_name="readiness_scores")

    readiness_pct   = models.FloatField(default=0.0,
                                         help_text=_("0–100% application readiness"))
    hard_blockers   = models.PositiveSmallIntegerField(default=0)
    soft_gaps       = models.PositiveSmallIntegerField(default=0)
    met_requirements = models.PositiveSmallIntegerField(default=0)
    total_requirements = models.PositiveSmallIntegerField(default=0)

    # What they have ✓
    strengths       = models.JSONField(default=list)
    # What's missing ✗
    blockers        = models.JSONField(default=list,
                                       help_text=_("List of blocking requirement descriptions"))
    soft_gap_list   = models.JSONField(default=list,
                                       help_text=_("Non-blocking gaps"))
    # Ordered action plan
    recommended_actions = models.JSONField(default=list)

    verdict         = models.CharField(max_length=64, blank=True,
                                       help_text=_("ready | nearly_ready | not_ready | disqualified"))

    computed_at     = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        unique_together = [["startup_id", "opportunity"]]
        ordering = ["-readiness_pct"]

    def __str__(self) -> str:
        return f"Readiness {self.readiness_pct:.0f}% - {self.opportunity.title[:60]}"
