from __future__ import annotations

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.users.models import StartupProfile


# ---------------------------------------------------------------------------
# Evidence Vault
# ---------------------------------------------------------------------------

class EvidenceVaultItem(models.Model):
    """
    A single piece of evidence supporting a specific claim or fundability
    dimension. Every important fact in the startup's profile should be
    traceable to one or more vault items.

    Evidence status hierarchy:
        DECLARED    → Founder stated it; no document provided
        SUPPORTED   → Reasonable third-party or contextual support
        VERIFIED    → Document or API evidence supplied by founder
        OBSERVED    → Machine-observed via connected API / telemetry
        CONTRADICTED→ Evidence conflicts with another source
        OUTDATED    → Evidence is older than 6 months
        UNSUPPORTED → No evidence found despite claim
    """

    class EvidenceType(models.TextChoices):
        DOCUMENT = "document", _("Document / File")
        METRIC = "metric", _("Metric / KPI Record")
        CUSTOMER_RECORD = "customer_record", _("Customer Record")
        FINANCIAL_RECORD = "financial_record", _("Financial Record")
        ANALYTICS = "analytics", _("Product Analytics Export")
        CONTRACT = "contract", _("Signed Contract / LOI")
        REGISTRATION = "registration", _("Corporate Registration")
        IP = "ip", _("Intellectual Property")
        PRESS = "press", _("Press / Media Coverage")
        PARTNERSHIP = "partnership", _("Partnership Agreement")
        FOUNDER_ASSERTION = "founder_assertion", _("Founder Assertion")
        EXTERNAL_SOURCE = "external_source", _("External Source / Report")

    class EvidenceStatus(models.TextChoices):
        DECLARED = "declared", _("Declared")
        SUPPORTED = "supported", _("Supported")
        VERIFIED = "verified", _("Verified")
        OBSERVED = "observed", _("Machine Observed")
        CONTRADICTED = "contradicted", _("Contradicted")
        OUTDATED = "outdated", _("Outdated")
        UNSUPPORTED = "unsupported", _("Unsupported")

    class DimensionTag(models.TextChoices):
        PROBLEM = "problem", _("Problem Validation")
        SOLUTION = "solution", _("Solution / Product")
        MARKET = "market", _("Market")
        TEAM = "team", _("Team & Founder")
        TRACTION = "traction", _("Traction")
        BUSINESS_MODEL = "business_model", _("Business Model")
        DEFENSIBILITY = "defensibility", _("Defensibility")
        FUNDRAISING = "fundraising", _("Fundraising Readiness")
        FINANCIALS = "financials", _("Financials")
        GENERAL = "general", _("General")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="evidence_vault",
    )

    title = models.CharField(_("title"), max_length=255)
    description = models.TextField(_("description"), blank=True)
    evidence_type = models.CharField(
        _("evidence type"), max_length=32,
        choices=EvidenceType.choices,
        default=EvidenceType.DOCUMENT,
    )
    dimension_tag = models.CharField(
        _("dimension"), max_length=32,
        choices=DimensionTag.choices,
        default=DimensionTag.GENERAL,
    )

    # The claim this evidence supports (plain-text; may also link to StartupClaim)
    claim_description = models.CharField(
        _("claim supported"), max_length=500, blank=True,
        help_text=_("e.g. '500 paying customers', '$20k MRR'"),
    )

    # File / URL
    file_url = models.URLField(_("file URL"), blank=True)
    external_url = models.URLField(_("external URL"), blank=True)

    # Provenance
    status = models.CharField(
        _("status"), max_length=20,
        choices=EvidenceStatus.choices,
        default=EvidenceStatus.DECLARED,
        db_index=True,
    )
    source_name = models.CharField(
        _("source"), max_length=128, blank=True,
        help_text=_("e.g. 'Stripe export', 'Bank statement', 'CAC registration'"),
    )
    observed_date = models.DateField(_("observed / created date"), null=True, blank=True)
    confidence = models.FloatField(_("confidence"), default=0.5)

    # Contradiction tracking
    contradicts_claim = models.CharField(
        _("contradicts claim"), max_length=500, blank=True,
        help_text=_("If this evidence contradicts another claim, describe it here"),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("evidence vault item")
        verbose_name_plural = _("evidence vault items")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["startup", "dimension_tag"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"[{self.status.upper()}] {self.startup.company_name} – {self.title}"


# ---------------------------------------------------------------------------
# Fundability Assessment
# ---------------------------------------------------------------------------

class FundabilityAssessment(models.Model):
    """
    The central fundability intelligence record for a startup.

    Computed from:
        - Startup structured profile data
        - Evidence vault completeness
        - Deck forensics (if deck uploaded)
        - Stage expectations for the startup's inferred stage
        - Business model and sector context

    The score is a summary. The gaps and improvement actions are the product.
    """

    class EvidenceConviction(models.TextChoices):
        EXCEPTIONAL = "exceptional", _("Exceptional - High Conviction")
        STRONG = "strong", _("Strong - Investable")
        PROMISING = "promising", _("Promising - Diligence Required")
        SPECULATIVE = "speculative", _("Speculative - Significant Gaps")
        WEAK = "weak", _("Weak - Insufficient Evidence")

    class StageLabel(models.TextChoices):
        IDEA = "idea", _("Idea / Concept")
        PRE_SEED = "pre_seed", _("Pre-Seed")
        SEED = "seed", _("Seed")
        SERIES_A = "series_a", _("Series A")
        SERIES_B_PLUS = "series_b_plus", _("Series B+")

    class Confidence(models.TextChoices):
        HIGH = "high", _("High")
        MEDIUM = "medium", _("Medium")
        LOW = "low", _("Low - Insufficient Data")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="fundability_assessments",
    )

    # Stage
    declared_stage = models.CharField(
        max_length=24, choices=StageLabel.choices, default=StageLabel.PRE_SEED,
    )
    inferred_stage = models.CharField(
        max_length=24, choices=StageLabel.choices, default=StageLabel.PRE_SEED,
    )
    stage_confidence = models.FloatField(default=0.8)
    stage_rationale = models.TextField(blank=True)

    # Overall readiness
    overall_score = models.FloatField(
        default=0.0,
        help_text=_("0–100 overall fundability readiness score"),
    )
    conviction = models.CharField(
        max_length=20, choices=EvidenceConviction.choices,
        default=EvidenceConviction.SPECULATIVE,
    )
    confidence = models.CharField(
        max_length=10, choices=Confidence.choices, default=Confidence.LOW,
    )
    confidence_interval_low = models.FloatField(default=0.0)
    confidence_interval_high = models.FloatField(default=0.0)

    # Evidence completeness
    evidence_completeness_pct = models.IntegerField(
        default=0,
        help_text=_("% of expected evidence items that have been provided"),
    )

    # Thesis
    bull_thesis = models.TextField(blank=True)
    bear_thesis = models.TextField(blank=True)

    # Counts (denormalised for dashboard performance)
    critical_gaps_count = models.IntegerField(default=0)
    important_gaps_count = models.IntegerField(default=0)
    strong_signals_count = models.IntegerField(default=0)

    # Deck cross-check
    deck_contradictions = models.JSONField(
        default=list, blank=True,
        help_text=_("List of contradictions detected between deck and startup profile"),
    )

    # Context
    sector = models.CharField(max_length=100, blank=True)
    target_funding_type = models.CharField(
        max_length=50, blank=True,
        help_text=_("accelerator / angel / seed_vc / grant"),
    )
    target_amount_usd = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
    )

    # Versioning - every re-assessment creates a new record
    methodology_version = models.CharField(max_length=20, default="v1.0")
    assessed_at = models.DateTimeField(auto_now_add=True)
    is_current = models.BooleanField(
        default=True,
        help_text=_("Only the most recent assessment is current"),
    )

    class Meta:
        verbose_name = _("fundability assessment")
        verbose_name_plural = _("fundability assessments")
        ordering = ["-assessed_at"]
        indexes = [
            models.Index(fields=["startup", "is_current"]),
        ]

    def __str__(self) -> str:
        return (
            f"{self.startup.company_name} | Fundability {self.overall_score:.0f}/100 "
            f"({self.conviction}) [{self.assessed_at.date()}]"
        )

    def save(self, *args, **kwargs):
        if self.is_current:
            # Mark all previous assessments for this startup as not current
            FundabilityAssessment.objects.filter(
                startup=self.startup, is_current=True
            ).exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Fundability Dimensions
# ---------------------------------------------------------------------------

class FundabilityDimension(models.Model):
    """
    Per-dimension breakdown of the overall fundability assessment.
    Each dimension carries its own score, evidence state, signals, and gaps.

    Dimensions:
        1. Problem Validation
        2. Solution / Product
        3. Market
        4. Founder & Team
        5. Traction
        6. Business Model
        7. Defensibility
        8. Fundraising Readiness
    """

    class DimensionKey(models.TextChoices):
        PROBLEM = "problem", _("Problem Validation")
        SOLUTION = "solution", _("Solution / Product")
        MARKET = "market", _("Market")
        TEAM = "team", _("Founder & Team")
        TRACTION = "traction", _("Traction")
        BUSINESS_MODEL = "business_model", _("Business Model")
        DEFENSIBILITY = "defensibility", _("Defensibility")
        FUNDRAISING = "fundraising", _("Fundraising Readiness")

    class EvidenceState(models.TextChoices):
        VERIFIED_EMPIRICAL = "verified_empirical", _("Verified - Empirical Evidence")
        SUPPORTED = "supported", _("Supported - Contextual Evidence")
        FOUNDER_CLAIMED = "founder_claimed", _("Founder-Claimed - Unverified")
        UNAVAILABLE = "unavailable", _("Unavailable - Not Provided")

    class StageConcern(models.TextChoices):
        ACCEPTABLE = "acceptable", _("Acceptable for Stage")
        MODERATE = "moderate_concern", _("Moderate Concern")
        MATERIAL = "material_concern", _("Material Concern")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(
        FundabilityAssessment,
        on_delete=models.CASCADE,
        related_name="dimensions",
    )
    dimension_key = models.CharField(
        max_length=24, choices=DimensionKey.choices,
    )
    dimension_name = models.CharField(max_length=64)

    # Scoring
    raw_score = models.FloatField(default=50.0)
    weight_pct = models.FloatField(default=12.5)
    weighted_contribution = models.FloatField(default=0.0)

    # Evidence quality
    evidence_state = models.CharField(
        max_length=24, choices=EvidenceState.choices,
        default=EvidenceState.FOUNDER_CLAIMED,
    )
    confidence_pct = models.IntegerField(default=50)
    stage_concern = models.CharField(
        max_length=24, choices=StageConcern.choices,
        default=StageConcern.ACCEPTABLE,
    )

    # Narrative signals (stored as JSON arrays)
    positive_signals = models.JSONField(default=list, blank=True)
    missing_evidence = models.JSONField(default=list, blank=True)
    justifications = models.JSONField(default=list, blank=True)
    recommended_actions = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = _("fundability dimension")
        verbose_name_plural = _("fundability dimensions")
        unique_together = [["assessment", "dimension_key"]]
        ordering = ["dimension_key"]

    def __str__(self) -> str:
        return f"{self.dimension_name}: {self.raw_score:.0f}/100 [{self.evidence_state}]"


# ---------------------------------------------------------------------------
# Fundability Gaps
# ---------------------------------------------------------------------------

class FundabilityGap(models.Model):
    """
    A specific, actionable gap identified in the fundability assessment.

    A gap is more important than a score.
    The score is the summary; the gap is the explanation.
    """

    class Severity(models.TextChoices):
        CRITICAL = "critical", _("Critical - Must Fix Before Applying")
        HIGH = "high", _("High - Significantly Affects Readiness")
        MEDIUM = "medium", _("Medium - Should Improve")
        LOW = "low", _("Low - Minor Enhancement")

    class GapStatus(models.TextChoices):
        OPEN = "open", _("Open")
        IN_PROGRESS = "in_progress", _("In Progress")
        RESOLVED = "resolved", _("Resolved")
        ACCEPTED = "accepted", _("Accepted Risk")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(
        FundabilityAssessment,
        on_delete=models.CASCADE,
        related_name="gaps",
    )
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="fundability_gaps",
    )

    dimension_key = models.CharField(
        max_length=24,
        choices=FundabilityDimension.DimensionKey.choices,
    )
    title = models.CharField(_("gap title"), max_length=255)
    description = models.TextField(_("description"))

    severity = models.CharField(
        max_length=12, choices=Severity.choices, default=Severity.HIGH, db_index=True,
    )
    status = models.CharField(
        max_length=16, choices=GapStatus.choices, default=GapStatus.OPEN, db_index=True,
    )

    # What is currently present vs what is expected
    current_state = models.CharField(max_length=500, blank=True)
    expected_state = models.CharField(max_length=500, blank=True)

    # Why this matters to an investor / accelerator
    why_it_matters = models.TextField(blank=True)

    # Evidence that would close this gap
    evidence_required = models.CharField(max_length=500, blank=True)

    # Effort and impact estimates
    impact = models.CharField(
        max_length=12,
        choices=[("critical", "Critical"), ("high", "High"), ("medium", "Medium"), ("low", "Low")],
        default="high",
    )
    effort = models.CharField(
        max_length=12,
        choices=[("high", "High"), ("medium", "Medium"), ("low", "Low")],
        default="medium",
    )

    priority_rank = models.IntegerField(
        default=0,
        help_text=_("Lower = higher priority. 1 = fix first."),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("fundability gap")
        verbose_name_plural = _("fundability gaps")
        ordering = ["priority_rank", "severity"]
        indexes = [
            models.Index(fields=["startup", "status"]),
            models.Index(fields=["severity"]),
        ]

    def __str__(self) -> str:
        return f"[{self.severity.upper()}] {self.title}"


# ---------------------------------------------------------------------------
# Improvement Actions
# ---------------------------------------------------------------------------

class ImprovementAction(models.Model):
    """
    A concrete, executable action that turns a fundability gap into a resolved signal.

    Connects:
        Gap → Why investors care → Evidence missing → How to obtain → Target milestone
    """

    class ActionType(models.TextChoices):
        CREATE = "create", _("Create / Build")
        COLLECT = "collect", _("Collect / Gather Data")
        VERIFY = "verify", _("Verify / Document")
        RESOLVE = "resolve", _("Resolve Contradiction")
        IMPROVE = "improve", _("Improve / Strengthen")
        MEASURE = "measure", _("Instrument & Measure")
        VALIDATE = "validate", _("Validate with Customers")
        REWRITE = "rewrite", _("Rewrite / Clarify")

    class ActionStatus(models.TextChoices):
        PENDING = "pending", _("Pending")
        IN_PROGRESS = "in_progress", _("In Progress")
        COMPLETED = "completed", _("Completed")
        SKIPPED = "skipped", _("Skipped")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    gap = models.ForeignKey(
        FundabilityGap,
        on_delete=models.CASCADE,
        related_name="actions",
    )
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="improvement_actions",
    )

    action_type = models.CharField(
        max_length=16, choices=ActionType.choices, default=ActionType.COLLECT,
    )
    title = models.CharField(_("action title"), max_length=255)
    description = models.TextField(_("what to do"))

    # Investor framing
    why_investors_care = models.TextField(blank=True)
    evidence_missing = models.CharField(max_length=500, blank=True)
    how_to_obtain = models.TextField(blank=True)

    # Milestone / reassessment
    target_milestone = models.CharField(max_length=500, blank=True)
    reassess_after = models.CharField(
        max_length=255, blank=True,
        help_text=_("e.g. 'After 3 cohort months of data exist'"),
    )

    # Progress
    status = models.CharField(
        max_length=16, choices=ActionStatus.choices, default=ActionStatus.PENDING,
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completion_notes = models.TextField(blank=True)

    # Estimated impact on fundability score if completed
    estimated_score_delta = models.FloatField(
        default=0.0,
        help_text=_("Estimated improvement to overall fundability readiness if this action is completed"),
    )

    priority_rank = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("improvement action")
        verbose_name_plural = _("improvement actions")
        ordering = ["priority_rank", "-estimated_score_delta"]

    def __str__(self) -> str:
        return f"[{self.action_type.upper()}] {self.title} ({self.status})"


# ---------------------------------------------------------------------------
# Program Readiness (lightweight - full program intelligence is P1)
# ---------------------------------------------------------------------------

class ProgramReadiness(models.Model):
    """
    Per-program readiness score for a startup.
    Lightweight record - full Application Intelligence is a P1 feature.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(
        FundabilityAssessment,
        on_delete=models.CASCADE,
        related_name="program_readiness",
    )
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="program_readiness_records",
    )

    program_name = models.CharField(max_length=128)
    program_type = models.CharField(
        max_length=32,
        choices=[
            ("accelerator", "Accelerator"),
            ("seed_vc", "Seed VC"),
            ("angel", "Angel"),
            ("grant", "Grant"),
            ("other", "Other"),
        ],
        default="accelerator",
    )

    fit_score = models.IntegerField(default=50)
    readiness_score = models.IntegerField(default=50)
    evidence_gaps_count = models.IntegerField(default=0)

    fit_rationale = models.TextField(blank=True)
    top_gap = models.CharField(max_length=255, blank=True)
    recommendation = models.CharField(
        max_length=32,
        choices=[
            ("apply_now", "Apply Now"),
            ("fix_first", "Fix Gaps First"),
            ("not_yet", "Not Yet Ready"),
            ("strong_match", "Strong Match"),
        ],
        default="fix_first",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("program readiness")
        verbose_name_plural = _("program readiness records")
        ordering = ["-fit_score"]

    def __str__(self) -> str:
        return f"{self.program_name}: Fit {self.fit_score} / Readiness {self.readiness_score}"
