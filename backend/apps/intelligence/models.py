"""
apps.intelligence.models
========================
Models for the AI due-diligence and prediction infrastructure.

StartupSuccessPrediction  - Full multi-dimensional prediction (mirrors
                            FundraisingPrediction but richer; populated by the
                            multi-agent pipeline rather than the heuristic engine).

DueDiligenceReport        - Generated IC memo produced by the agent pipeline.
                            Stores each section separately plus citations.

PredictionFeedback        - User-provided ratings on prediction quality; drives
                            continuous model improvement.

ModelPerformanceTracker   - Tracks deployed model versions, accuracy metrics,
                            and data drift scores over time.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.users.models import InvestorProfile, StartupProfile

if TYPE_CHECKING:
    from django.db.models import QuerySet

logger = logging.getLogger(__name__)


class InstitutionalMemoryEntryManager(models.Manager["InstitutionalMemoryEntry"]):
    """Custom manager enforcing tenant-scoped access to InstitutionalMemoryEntry."""

    def for_tenant(self, tenant_id: Any) -> "QuerySet[InstitutionalMemoryEntry]":
        """
        Return a queryset filtered to the given *tenant_id*.

        Raises ``ValueError`` when *tenant_id* is missing, blank, or clearly
        invalid so that accidental cross-tenant reads are prevented at the
        queryset construction stage rather than silently returning all rows.
        """
        if tenant_id is None:
            logger.error("sec.tenant.for_tenant.none")
            raise ValueError("for_tenant() requires a non-None tenant_id")
        tenant_str = str(tenant_id).strip()
        if not tenant_str:
            logger.error("sec.tenant.for_tenant.blank")
            raise ValueError("for_tenant() requires a non-blank tenant_id")
        if len(tenant_str) > 100:
            logger.error("sec.tenant.for_tenant.toolong", length=len(tenant_str))
            raise ValueError("for_tenant() tenant_id exceeds 100 characters")
        return self.filter(tenant_id=tenant_str)


class StartupSuccessPrediction(models.Model):
    """
    Comprehensive startup intelligence report - populated by the multi-agent
    due-diligence pipeline when running with LLM backends, and by the heuristic
    engine as a fallback.
    """

    startup: models.OneToOneField = models.OneToOneField(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="intelligence_prediction",
    )

    #  Core success 
    success_probability: models.FloatField = models.FloatField(default=0.0)
    confidence_interval_lower: models.FloatField = models.FloatField(default=0.0)
    confidence_interval_upper: models.FloatField = models.FloatField(default=1.0)

    #  Exit prediction 
    exit_prediction: models.JSONField = models.JSONField(default=dict)

    #  Investor ROI 
    investor_roi: models.JSONField = models.JSONField(default=dict)

    #  Market potential 
    market_potential: models.JSONField = models.JSONField(default=dict)

    #  Scalability (0–1 per dimension) 
    scalability_score: models.FloatField = models.FloatField(default=0.0)
    uniqueness_score: models.FloatField = models.FloatField(default=0.0)

    #  Growth trajectory 
    growth_trajectory: models.JSONField = models.JSONField(default=dict)

    #  Risk profile 
    risk_profile: models.JSONField = models.JSONField(default=dict)

    #  Comparable startups 
    benchmarks: models.JSONField = models.JSONField(default=dict)

    #  Founder DNA analysis 
    founder_dna: models.JSONField = models.JSONField(
        default=dict,
        help_text=_("Big-5 traits, entrepreneur indicators, red flags"),
    )

    #  Competitive intelligence 
    competitive_intelligence: models.JSONField = models.JSONField(
        default=dict,
        help_text=_("Competitive landscape, moat analysis, threat predictions"),
    )

    #  Explainability 
    top_features: models.JSONField = models.JSONField(default=list)
    explanation: models.TextField = models.TextField(blank=True)

    #  Pipeline provenance 
    model_version: models.CharField = models.CharField(max_length=30, default="v1")
    pipeline_type: models.CharField = models.CharField(
        max_length=30,
        default="heuristic",
        choices=[
            ("heuristic", "Heuristic Engine"),
            ("ml_ensemble", "ML Ensemble"),
            ("agent_pipeline", "Multi-Agent Pipeline"),
        ],
    )

    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("startup success prediction")
        verbose_name_plural = _("startup success predictions")

    def __str__(self) -> str:
        return f"Intelligence: {self.startup.company_name} ({self.success_probability:.2f})"


class DueDiligenceReport(models.Model):
    """
    Structured IC-ready memo generated by the multi-agent pipeline.
    Sections are stored as rich JSON so the frontend can render them
    with citations, confidence badges, and drill-down.
    """

    STATUS_CHOICES = [
        ("pending", _("Pending")),
        ("running", _("Running")),
        ("complete", _("Complete")),
        ("failed", _("Failed")),
    ]

    VERDICT_CHOICES = [
        ("invest", _("Invest")),
        ("pass", _("Pass")),
        ("monitor", _("Monitor")),
        ("needs_info", _("Needs More Information")),
    ]

    startup: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="due_diligence_reports",
    )
    requested_by: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_reports",
    )

    #  Pipeline state 
    status: models.CharField = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True
    )
    verdict: models.CharField = models.CharField(
        max_length=20, choices=VERDICT_CHOICES, blank=True
    )
    overall_score: models.FloatField = models.FloatField(null=True, blank=True)

    #  Report sections (populated by agents) 
    forensic_analysis: models.JSONField = models.JSONField(
        default=dict,
        help_text=_("Forensic Auditor output: unit economics, red flags, founder signals"),
    )
    market_analysis: models.JSONField = models.JSONField(
        default=dict,
        help_text=_("Market Strategist output: TAM/SAM, competition, regulatory"),
    )
    investment_memo: models.TextField = models.TextField(
        blank=True,
        help_text=_("Full IC memo text with inline citations"),
    )
    citations: models.JSONField = models.JSONField(
        default=list,
        help_text=_("Source citations referenced in the memo"),
    )

    #  Bull / Bear debate 
    bull_arguments: models.JSONField = models.JSONField(default=list)
    bear_arguments: models.JSONField = models.JSONField(default=list)

    #  Scorecard 
    scorecard: models.JSONField = models.JSONField(
        default=dict,
        help_text=_("Sieve-style 7-dimension scorecard"),
    )

    #  Timing 
    started_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)
    completed_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("due diligence report")
        verbose_name_plural = _("due diligence reports")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"DD Report: {self.startup.company_name} [{self.status}]"


class PredictionFeedback(models.Model):
    """User-supplied ratings on prediction accuracy."""

    prediction: models.ForeignKey = models.ForeignKey(
        StartupSuccessPrediction,
        on_delete=models.CASCADE,
        related_name="feedback",
    )
    user: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="prediction_feedback",
    )

    accuracy_rating: models.PositiveSmallIntegerField = models.PositiveSmallIntegerField(
        help_text=_("1–5 rating of prediction accuracy"),
    )
    helpfulness_score: models.PositiveSmallIntegerField = models.PositiveSmallIntegerField(
        help_text=_("1–5 rating of prediction usefulness"),
    )

    actual_outcome: models.CharField = models.CharField(max_length=50, blank=True)
    actual_exit_type: models.CharField = models.CharField(max_length=50, blank=True)
    actual_exit_value: models.DecimalField = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )

    comment: models.TextField = models.TextField(blank=True)
    feedback_source: models.CharField = models.CharField(
        max_length=20,
        choices=[("investor", "Investor"), ("startup", "Startup"), ("admin", "Admin")],
        default="investor",
    )

    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("prediction feedback")
        verbose_name_plural = _("prediction feedback")
        ordering = ["-created_at"]


class ModelPerformanceTracker(models.Model):
    """
    Track each deployed model version's accuracy, precision/recall, and drift.
    Populated by the nightly evaluation pipeline.
    """

    model_version: models.CharField = models.CharField(max_length=30)
    model_type: models.CharField = models.CharField(
        max_length=50,
        choices=[
            ("heuristic", "Heuristic"),
            ("xgboost", "XGBoost"),
            ("dnn", "Deep Neural Network"),
            ("ensemble", "Ensemble"),
            ("agent_pipeline", "Agent Pipeline"),
        ],
    )

    accuracy: models.FloatField = models.FloatField(default=0.0)
    precision: models.FloatField = models.FloatField(default=0.0)
    recall: models.FloatField = models.FloatField(default=0.0)
    f1_score: models.FloatField = models.FloatField(default=0.0)
    auc_roc: models.FloatField = models.FloatField(default=0.0)

    training_data_size: models.PositiveIntegerField = models.PositiveIntegerField(default=0)
    validation_data_size: models.PositiveIntegerField = models.PositiveIntegerField(default=0)

    is_active: models.BooleanField = models.BooleanField(default=False, db_index=True)

    data_drift_score: models.FloatField = models.FloatField(null=True, blank=True)
    prediction_drift_score: models.FloatField = models.FloatField(null=True, blank=True)

    deployed_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    notes: models.TextField = models.TextField(blank=True)

    class Meta:
        verbose_name = _("model performance tracker")
        verbose_name_plural = _("model performance trackers")
        ordering = ["-deployed_at"]

    def __str__(self) -> str:
        return f"{self.model_type} v{self.model_version} (active={self.is_active})"


class PitchDeckForensicAnalysis(models.Model):
    """
    Forensic analysis and assumption stress-testing for pitch decks.
    """

    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="forensic_deck_analyses",
        null=True,
        blank=True,
    )
    company_name = models.CharField(max_length=200)
    fundability_score = models.FloatField(default=0.0)
    unit_economics_audit = models.JSONField(default=dict)
    competitor_benchmarks = models.JSONField(default=list)
    verified_claims = models.JSONField(default=list)
    bull_thesis = models.TextField(blank=True)
    bear_thesis = models.TextField(blank=True)
    missing_critical_slides = models.JSONField(default=list)
    raw_extraction = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("pitch deck forensic analysis")
        verbose_name_plural = _("pitch deck forensic analyses")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Forensics: {self.company_name} ({self.fundability_score:.1f})"


class StealthFounderSignal(models.Model):
    """
    Early signal aggregated across GitHub, Domain Registrars, Patents, or Emerging Registries.
    """

    source = models.CharField(max_length=50)  # github, domain_registrar, uspto_patents, registry_cac, etc.
    founder_name = models.CharField(max_length=200)
    company_name = models.CharField(max_length=200, blank=True)
    signal_type = models.CharField(max_length=100)
    confidence = models.FloatField(default=0.5)
    jurisdiction = models.CharField(max_length=50, default="GLOBAL")
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("stealth founder signal")
        verbose_name_plural = _("stealth founder signals")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Signal: [{self.source}] {self.founder_name} - {self.signal_type}"


class InstitutionalMemoryEntry(models.Model):
    """
    Firm-specific digital brain entry capturing deal memos, partner debates, and post-mortems.

    All reads MUST go through ``InstitutionalMemoryEntry.objects.for_tenant(tenant_id)``
    to prevent cross-tenant data leakage.  Direct ``.objects.all()`` / ``.objects.filter()``
    without a tenant scope are considered security bugs.
    """

    objects = InstitutionalMemoryEntryManager()

    tenant_id = models.CharField(max_length=100, default="default_fund", db_index=True)
    company_name = models.CharField(max_length=200, db_index=True)
    source_type = models.CharField(max_length=50)  # ic_memo, partner_note, pitch_deck, post_mortem, thesis
    summary = models.TextField()
    content_text = models.TextField()
    tags = models.JSONField(default=list)
    verdict = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("institutional memory entry")
        verbose_name_plural = _("institutional memory entries")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Brain [{self.tenant_id}]: {self.company_name} ({self.source_type})"

    def assert_tenant(self, tenant_id: Any) -> None:
        """Raise :class:`ValueError` if this entry does not belong to *tenant_id*."""
        if tenant_id is None:
            raise ValueError("assert_tenant() requires a non-None tenant_id")
        expected = str(tenant_id).strip()
        if not expected:
            raise ValueError("assert_tenant() requires a non-blank tenant_id")
        if self.tenant_id != expected:
            logger.error(
                "sec.tenant.mismatch",
                entry_id=self.pk,
                entry_tenant=self.tenant_id,
                expected_tenant=expected,
            )
            raise ValueError(
                f"InstitutionalMemoryEntry pk={self.pk} belongs to tenant "
                f"'{self.tenant_id}', not '{expected}'"
            )


class EnterpriseTenant(models.Model):
    """
    Enterprise VC tenant organization (e.g. Antler Global, Y Combinator, Norrsken22).
    """

    TIER_STARTER = "starter"
    TIER_PRO = "pro"
    TIER_ENTERPRISE = "enterprise"

    TIER_CHOICES = [
        (TIER_STARTER, _("Starter ($10K/mo - 50 deals)")),
        (TIER_PRO, _("Professional ($25K/mo - 200 deals)")),
        (TIER_ENTERPRISE, _("Enterprise ($50K/mo - Unlimited)")),
    ]

    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, default=TIER_PRO)
    monthly_deal_quota = models.IntegerField(default=200, help_text=_("-1 indicates unlimited deals"))
    current_month_usage = models.IntegerField(default=0)
    webhook_url = models.URLField(blank=True, help_text=_("CRM/Hub callback URL for instant triaging"))
    contact_email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("enterprise tenant")
        verbose_name_plural = _("enterprise tenants")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.tier.upper()})"

    @property
    def has_quota(self) -> bool:
        if self.monthly_deal_quota == -1:
            return True
        return self.current_month_usage < self.monthly_deal_quota

    def record_deal_usage(self) -> bool:
        if not self.has_quota:
            return False
        self.current_month_usage += 1
        self.save(update_fields=["current_month_usage"])
        return True


class TenantAPIKey(models.Model):
    """
    Hashed API Key for B2B programmatic integrations.
    """

    tenant = models.ForeignKey(EnterpriseTenant, on_delete=models.CASCADE, related_name="api_keys")
    name = models.CharField(max_length=100, default="Production Key")
    key_prefix = models.CharField(max_length=12, db_index=True)
    key_hash = models.CharField(max_length=128, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("tenant API key")
        verbose_name_plural = _("tenant API keys")

    def __str__(self) -> str:
        return f"{self.tenant.name} - {self.name} ({self.key_prefix}...)"


class TenantUsageLog(models.Model):
    """
    Granular request metering for enterprise billing and audit trails.
    """

    tenant = models.ForeignKey(EnterpriseTenant, on_delete=models.CASCADE, related_name="usage_logs")
    endpoint = models.CharField(max_length=255)
    action_type = models.CharField(max_length=50)  # triage, forensics, brain_query, stealth_search
    status_code = models.IntegerField(default=200)
    metadata = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _("tenant usage log")
        verbose_name_plural = _("tenant usage logs")
        ordering = ["-timestamp"]


class VoiceInterviewSession(models.Model):
    """
    Automated voice-first AI founder screening session.
    """

    STAGE_PRE_SEED = "pre_seed"
    STAGE_SEED = "seed"
    STAGE_SERIES_A = "series_a"

    STAGE_CHOICES = [
        (STAGE_PRE_SEED, _("Pre-Seed (Founder Grit, Vision, Spike)")),
        (STAGE_SEED, _("Seed (Traction, Unit Economics, Moat)")),
        (STAGE_SERIES_A, _("Series A (Scale, Retention, Leadership)")),
    ]

    STATUS_SCHEDULED = "scheduled"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = [
        (STATUS_SCHEDULED, _("Scheduled")),
        (STATUS_IN_PROGRESS, _("In Progress")),
        (STATUS_COMPLETED, _("Completed")),
        (STATUS_FAILED, _("Failed")),
    ]

    startup = models.ForeignKey(StartupProfile, on_delete=models.CASCADE, related_name="voice_interviews")
    interviewer_persona = models.CharField(max_length=100, default="Sam (Venture Partner AI)")
    stage = models.CharField(max_length=30, choices=STAGE_CHOICES, default=STAGE_PRE_SEED)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_SCHEDULED)
    duration_seconds = models.IntegerField(default=0)
    transcript = models.JSONField(default=list, help_text=_("List of {'speaker': str, 'text': str, 'timestamp': float}"))
    debrief_scorecard = models.JSONField(default=dict, help_text=_("AI Partner debrief with scores and flags"))
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("voice interview session")
        verbose_name_plural = _("voice interview sessions")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Voice Interview: {self.startup.company_name} ({self.stage}) - {self.status}"




# ---------------------------------------------------------------------------
# Institutional-Grade Intelligence ORM Persistence Models
# ---------------------------------------------------------------------------

class IntelligenceRun(models.Model):
    """Immutable audit record of every intelligence pipeline execution."""

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("RUNNING", "Running"),
        ("COMPLETED", "Completed"),
        ("FAILED", "Failed"),
    ]

    run_id = models.CharField(max_length=64, unique=True, db_index=True)
    tenant = models.ForeignKey(EnterpriseTenant, on_delete=models.SET_NULL, null=True, blank=True, related_name="runs")
    subject_type = models.CharField(max_length=50, default="PITCH_DECK")
    subject_id = models.CharField(max_length=64, default="")
    pipeline_version = models.CharField(max_length=20, default="v2.4")
    model_version = models.CharField(max_length=50, default="bayesian-multitask-v2")
    prompt_version = models.CharField(max_length=20, default="v2.1")
    input_snapshot_hash = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="COMPLETED")
    cost_usd = models.DecimalField(max_digits=8, decimal_places=6, default=0.0)
    runtime_ms = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Run {self.run_id} [{self.pipeline_version}] - {self.status}"


class IntelligenceArtifact(models.Model):
    """Versioned intelligence output snapshot with score ledger and provenance."""

    run = models.ForeignKey(IntelligenceRun, on_delete=models.CASCADE, related_name="artifacts")
    artifact_type = models.CharField(max_length=50, default="FORENSIC_UNDERWRITING")
    version_number = models.PositiveIntegerField(default=1)
    overall_score = models.FloatField(default=0.0)
    evidence_coverage_pct = models.FloatField(default=0.0)
    evidence_ledger_hash = models.CharField(max_length=64, blank=True)
    delta_explanation = models.TextField(blank=True)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version_number"]

    def __str__(self):
        return f"Artifact v{self.version_number} (Score: {self.overall_score}) - Run {self.run.run_id}"


class EvidenceClaimRecord(models.Model):
    """Persisted individual claim extracted from documents or disclosures."""

    claim_id = models.CharField(max_length=64, unique=True, db_index=True)
    startup = models.ForeignKey(StartupProfile, on_delete=models.CASCADE, related_name="evidence_claims", null=True, blank=True)
    subject = models.CharField(max_length=100, default="")
    metric_key = models.CharField(max_length=100, db_index=True)
    claimed_value = models.JSONField(default=dict)
    raw_text = models.TextField(blank=True)
    source_type = models.CharField(max_length=50, default="PITCH_DECK")
    source_locator = models.CharField(max_length=100, blank=True)
    data_classification = models.CharField(max_length=30, default="CONFIDENTIAL")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Claim: {self.metric_key} in {self.source_locator}"


class ClaimVerificationRecord(models.Model):
    """Auditable verification status linking a claim to empirical observations."""

    VERIFICATION_STATUS_CHOICES = [
        ("VERIFIED", "Verified"),
        ("CONTRADICTED", "Contradicted"),
        ("UNVERIFIED", "Unverified"),
        ("INSUFFICIENT_EVIDENCE", "Insufficient Evidence"),
    ]

    claim = models.OneToOneField(EvidenceClaimRecord, on_delete=models.CASCADE, related_name="verification")
    status = models.CharField(max_length=30, choices=VERIFICATION_STATUS_CHOICES, default="UNVERIFIED")
    verified_value = models.JSONField(null=True, blank=True)
    delta_percentage = models.FloatField(null=True, blank=True)
    confidence_score = models.FloatField(default=1.0)
    verification_notes = models.TextField(blank=True)
    verified_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Verification: {self.claim.metric_key} -> {self.status}"


class VentureOutcomeRecord(models.Model):
    """Persisted multi-task venture outcome forecast with Bayesian credible intervals."""

    company_name = models.CharField(max_length=255)
    stage = models.CharField(max_length=50, default="seed")
    sector = models.CharField(max_length=100, default="enterprise_saas")
    overall_fundability_score = models.FloatField(default=75.0)

    # Multi-Task Head Probabilities (%)
    series_a_18m_prob = models.FloatField(default=0.0)
    series_b_36m_prob = models.FloatField(default=0.0)
    ten_m_arr_5y_prob = models.FloatField(default=0.0)
    hundred_m_val_5y_prob = models.FloatField(default=0.0)
    unicorn_one_b_prob = models.FloatField(default=0.0)

    # Uncertainty & Intervals
    confidence_tier = models.CharField(max_length=30, default="HIGH")
    evidence_coverage_pct = models.FloatField(default=80.0)
    uncertainty_score = models.FloatField(default=1.0)
    credible_interval_5 = models.FloatField(default=0.0)
    credible_interval_50 = models.FloatField(default=0.0)
    credible_interval_95 = models.FloatField(default=0.0)

    # Survival & Drivers (JSON)
    survival_curve_json = models.JSONField(default=list)
    primary_positive_drivers = models.JSONField(default=list)
    primary_uncertainty_drivers = models.JSONField(default=list)
    anomaly_audit_reports = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Outcome Forecast: {self.company_name} (Unicorn Prob: {self.unicorn_one_b_prob}%)"


class Cohort(models.Model):
    """Accelerator or fund cohort program (e.g. Antler East Africa Cohort 12)."""

    name = models.CharField(_("cohort name"), max_length=255)
    organization_name = models.CharField(_("organization"), max_length=255, default="Antler Hub")
    program_cycle = models.CharField(_("cycle"), max_length=100, default="2026-Q1")
    target_startups_count = models.IntegerField(default=50)
    is_active = models.BooleanField(default=True)
    custom_rubric_config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("cohort")
        verbose_name_plural = _("cohorts")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.organization_name} - {self.name} ({self.program_cycle})"


class CohortApplication(models.Model):
    """An inbound startup pitch application submitted to an accelerator cohort."""

    STATUS_CHOICES = [
        ("INBOUND", _("Inbound")),
        ("SCREENING", _("Screening")),
        ("ADVANCED", _("Advanced")),
        ("SHORTLISTED", _("Shortlisted")),
        ("REJECTED", _("Rejected")),
    ]

    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="applications")
    startup = models.ForeignKey(StartupProfile, on_delete=models.CASCADE, null=True, blank=True, related_name="cohort_applications")
    company_name = models.CharField(max_length=255)
    sector = models.CharField(max_length=100, default="fintech")
    hub = models.CharField(max_length=100, default="Lagos, Nigeria")
    ask_amount_usd = models.DecimalField(max_digits=12, decimal_places=2, default=100000.00)
    declared_stage = models.CharField(max_length=50, default="pre_seed")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="INBOUND")

    # Scored values from the Pan-African 8-Pillar engine
    fundability_score = models.FloatField(default=0.0)
    decile_rank = models.CharField(max_length=50, default="Top 10%")
    forensic_flags = models.JSONField(default=list, blank=True)
    pillar_scores = models.JSONField(default=dict, blank=True)
    external_sync_id = models.CharField(max_length=255, blank=True, null=True, help_text=_("Antler Hub or external CRM ID"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("cohort application")
        verbose_name_plural = _("cohort applications")
        ordering = ["-fundability_score", "-created_at"]

    def __str__(self) -> str:
        return f"{self.company_name} [{self.status}] - Score: {self.fundability_score}"


class ICMemoVote(models.Model):
    """Partner consensus voting and annotations on an Investment Committee memo."""

    VOTE_CHOICES = [
        ("YES", _("Yes (High Conviction)")),
        ("CONDITIONAL", _("Conditional Yes")),
        ("PASS", _("Pass")),
    ]

    report = models.ForeignKey(DueDiligenceReport, on_delete=models.CASCADE, related_name="partner_votes")
    voter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ic_votes")
    vote = models.CharField(max_length=20, choices=VOTE_CHOICES, default="YES")
    conviction_score = models.IntegerField(default=8, help_text=_("1-10 conviction scale"))
    partner_role = models.CharField(max_length=50, default="General Partner")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("IC memo vote")
        verbose_name_plural = _("IC memo votes")
        unique_together = [["report", "voter"]]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Vote: {self.voter.email} on {self.report.title} -> {self.vote}"


class FundingEvent(models.Model):
    """
    Demo Days, Syndicate Pitch Nights, or Cohort Funding Events hosted by Accelerators/Funds.
    """
    EVENT_TYPES = [
        ("demo_day", _("Demo Day")),
        ("pitch_night", _("Pitch Night")),
        ("syndicate_round", _("Syndicate Funding Round")),
        ("investor_preview", _("Investor Preview")),
    ]
    STATUS_CHOICES = [
        ("upcoming", _("Upcoming")),
        ("live", _("Live Now")),
        ("completed", _("Completed")),
        ("cancelled", _("Cancelled")),
    ]

    title = models.CharField(_("event title"), max_length=255)
    event_type = models.CharField(_("event type"), max_length=50, choices=EVENT_TYPES, default="demo_day")
    cohort = models.ForeignKey(Cohort, on_delete=models.SET_NULL, null=True, blank=True, related_name="funding_events")
    organizer_name = models.CharField(_("organizer"), max_length=255, default="Accelerator Partner")
    event_date = models.DateTimeField(_("event date"))
    location = models.CharField(_("location"), max_length=255, default="Virtual (Live Stream)")
    target_commitment_usd = models.DecimalField(_("target commitment USD"), max_digits=15, decimal_places=2, default=500000.00)
    total_committed_usd = models.DecimalField(_("total committed USD"), max_digits=15, decimal_places=2, default=0.00)
    description = models.TextField(_("description"), blank=True)
    status = models.CharField(_("status"), max_length=20, choices=STATUS_CHOICES, default="upcoming")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("funding event")
        verbose_name_plural = _("funding events")
        ordering = ["event_date"]

    def __str__(self) -> str:
        return f"{self.title} ({self.get_event_type_display()}) - {self.event_date.strftime('%Y-%m-%d')}"


