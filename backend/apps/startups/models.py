"""
backend.apps.startups.models
============================
Canonical Venture Intelligence domain models for PitchMic.
Establishes the four canonical layers:
1. Venture Identity (backed by StartupProfile as identity anchor)
2. Venture Evidence & Claims (StartupClaim, StartupEvidence)
3. Venture Intelligence (StartupMaturityAssessment, StartupContextualAssessment)
4. Venture Transactions (StartupFinancialSnapshot, StartupFundingRound, StartupCustomerSegment, FundraisingCampaign)
"""
from __future__ import annotations

import uuid
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.users.models import StartupProfile


class StartupClaim(models.Model):
    """
    First-class claim entity representing facts declared by the founder,
    documentarily verified by due diligence, or observed through data pipelines.
    """

    class ClaimType(models.TextChoices):
        METRIC = "metric", _("Metric / KPI")
        TRACTION = "traction", _("Traction / Growth")
        MARKET = "market", _("Market Size & TAM")
        PRODUCT = "product", _("Product Defensibility")
        TEAM = "team", _("Team & Track Record")
        REGULATORY = "regulatory", _("Regulatory & IP")
        FINANCIAL = "financial", _("Financials & Margins")

    class SourceType(models.TextChoices):
        PITCH_DECK = "pitch_deck", _("Pitch Deck")
        APPLICATION = "application", _("Cohort Application")
        INTERVIEW = "interview", _("Audio / Diligence Interview")
        DATAROOM = "dataroom", _("DataRoom Vault Document")
        FINANCIAL_MODEL = "financial_model", _("Financial Model")
        PUBLIC_SOURCE = "public_source", _("Public Registry / Web")
        CONNECTED_API = "connected_api", _("Connected Accounting / Stripe API")

    class Status(models.TextChoices):
        DECLARED = "declared", _("Declared (Unverified)")
        UNDER_REVIEW = "under_review", _("Under Review")
        VERIFIED = "verified", _("Documentarily Verified")
        DISPUTED = "disputed", _("Disputed / Inconsistent")
        REFUTED = "refuted", _("Refuted")

    class Materiality(models.TextChoices):
        CRITICAL = "critical", _("Critical Diligence Factor")
        HIGH = "high", _("High Impact")
        MEDIUM = "medium", _("Medium Impact")
        LOW = "low", _("Low Impact")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="claims",
    )
    claim_type = models.CharField(
        max_length=32,
        choices=ClaimType.choices,
        default=ClaimType.TRACTION,
    )
    statement = models.CharField(
        max_length=500,
        help_text=_("The specific claim statement made about the venture"),
    )
    source_type = models.CharField(
        max_length=32,
        choices=SourceType.choices,
        default=SourceType.PITCH_DECK,
    )
    source_document = models.CharField(max_length=255, blank=True)
    materiality = models.CharField(
        max_length=16,
        choices=Materiality.choices,
        default=Materiality.HIGH,
    )

    # Separation of declared vs verified vs observed values
    declared_value = models.CharField(
        max_length=128,
        help_text=_("Raw value claimed by founder (e.g. '100 active customers')"),
    )
    verified_value = models.CharField(
        max_length=128,
        blank=True,
        help_text=_("Value proven by verified evidence documents (e.g. '73 customers')"),
    )
    observed_value = models.CharField(
        max_length=128,
        blank=True,
        help_text=_("Value observed via machine telemetry / live API (e.g. '81 customers')"),
    )
    normalized_value = models.FloatField(null=True, blank=True)

    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.DECLARED,
    )
    confidence = models.FloatField(
        default=0.5,
        help_text=_("Verification confidence score between 0.0 and 1.0"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["startup", "claim_type"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"{self.startup.company_name} - {self.claim_type}: {self.statement[:40]}"


class StartupEvidence(models.Model):
    """
    Evidence record verifying or cross-referencing startup claims.
    Reusable across pitch decks, accelerator applications, and investor diligence.
    """

    class SourceType(models.TextChoices):
        PITCH_DECK = "pitch_deck", _("Pitch Deck Slide")
        DATAROOM_DOC = "dataroom_doc", _("Encrypted DataRoom Document")
        INVOICE = "invoice", _("Customer Invoice / Bank Statement")
        CONTRACT = "contract", _("Commercial Contract / Agreement")
        CAP_TABLE = "cap_table", _("Official Cap Table / Certificate")
        API_TELEMETRY = "api_telemetry", _("Connected Live Telemetry (Stripe/Paddle)")
        PUBLIC_REGISTRY = "public_registry", _("Corporate Registry / CAC / SEC")

    class VerificationStatus(models.TextChoices):
        UNVERIFIED = "unverified", _("Unverified")
        DOCUMENTARY = "documentary", _("Documentary Evidence Provided")
        THIRD_PARTY_VERIFIED = "third_party_verified", _("Third-Party Verified")
        MACHINE_OBSERVED = "machine_observed", _("Machine-Observed & Reconciled")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="evidence_records",
    )
    claim = models.ForeignKey(
        StartupClaim,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supporting_evidence",
    )
    source_type = models.CharField(
        max_length=32,
        choices=SourceType.choices,
        default=SourceType.DATAROOM_DOC,
    )
    title = models.CharField(max_length=255)
    document_url = models.URLField(blank=True)
    external_source = models.CharField(max_length=255, blank=True)
    verification_status = models.CharField(
        max_length=32,
        choices=VerificationStatus.choices,
        default=VerificationStatus.DOCUMENTARY,
    )
    confidence = models.FloatField(default=0.7)
    verifier_name = models.CharField(max_length=128, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Evidence: {self.title} ({self.startup.company_name})"


class StartupMaturityAssessment(models.Model):
    """
    Multi-dimensional maturity object that separates operational/product maturity
    from fundraising stage.
    """

    class MaturityLevel(models.TextChoices):
        CONCEPT = "concept", _("Concept / Ideation")
        PILOT_READY = "pilot_ready", _("Pilot-Ready")
        EARLY_VALIDATION = "early_validation", _("Early Validation")
        COMMERCIAL_SCALE = "commercial_scale", _("Commercial Scale")
        MATURE = "mature", _("Institutional / Mature")

    class FinancingStage(models.TextChoices):
        PRE_SEED = "pre_seed", _("Pre-Seed")
        SEED = "seed", _("Seed")
        SERIES_A = "series_a", _("Series A")
        SERIES_B = "series_b", _("Series B")
        GROWTH = "growth", _("Growth")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="maturity_assessments",
    )

    # Stage separation
    declared_financing_stage = models.CharField(
        max_length=24,
        choices=FinancingStage.choices,
        default=FinancingStage.PRE_SEED,
    )
    inferred_financing_stage = models.CharField(
        max_length=24,
        choices=FinancingStage.choices,
        default=FinancingStage.PRE_SEED,
    )
    stage_confidence = models.FloatField(default=0.85)

    # 8-dimension maturity scores (0 - 100)
    product_score = models.IntegerField(default=50)
    commercial_score = models.IntegerField(default=50)
    revenue_score = models.IntegerField(default=50)
    operational_score = models.IntegerField(default=50)
    market_score = models.IntegerField(default=50)
    regulatory_score = models.IntegerField(default=50)
    execution_score = models.IntegerField(default=50)
    evidence_score = models.IntegerField(default=50)

    # Qualitative maturity descriptors
    product_maturity = models.CharField(
        max_length=24,
        choices=MaturityLevel.choices,
        default=MaturityLevel.PILOT_READY,
    )
    commercial_maturity = models.CharField(
        max_length=24,
        choices=MaturityLevel.choices,
        default=MaturityLevel.EARLY_VALIDATION,
    )
    revenue_maturity = models.CharField(
        max_length=24,
        choices=MaturityLevel.choices,
        default=MaturityLevel.EARLY_VALIDATION,
    )
    operational_maturity = models.CharField(
        max_length=24,
        choices=MaturityLevel.choices,
        default=MaturityLevel.PILOT_READY,
    )
    evidence_maturity = models.CharField(
        max_length=24,
        choices=MaturityLevel.choices,
        default=MaturityLevel.EARLY_VALIDATION,
    )

    overall_maturity = models.CharField(
        max_length=24,
        choices=MaturityLevel.choices,
        default=MaturityLevel.EARLY_VALIDATION,
    )
    overall_score = models.IntegerField(default=65)
    confidence = models.FloatField(default=0.8)
    model_version = models.CharField(max_length=32, default="v2.4-canonical")
    assessed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assessed_at"]

    def __str__(self) -> str:
        return f"{self.startup.company_name} Maturity: {self.overall_maturity} ({self.overall_score}/100)"


class StartupFinancialSnapshot(models.Model):
    """
    Structured periodic financial data with evidence provenance.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="financial_snapshots",
    )
    period_label = models.CharField(
        max_length=32,
        help_text=_("e.g. 'Q1 2026', 'Q4 2025', 'FY 2025'"),
    )
    revenue_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    gross_profit_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    gross_margin_pct = models.FloatField(default=0.0)
    operating_expenses_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    net_burn_monthly_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    cash_balance_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    runway_months = models.FloatField(default=12.0)
    customers_count = models.IntegerField(default=0)
    cac_usd = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ltv_usd = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    arpu_usd = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    churn_rate_pct = models.FloatField(default=0.0)
    retention_rate_pct = models.FloatField(default=95.0)
    evidence = models.ForeignKey(
        StartupEvidence,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_financials",
    )
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]

    def __str__(self) -> str:
        return f"{self.startup.company_name} Financials: {self.period_label} (${self.revenue_usd})"


class StartupFundingRound(models.Model):
    """
    Structured funding history tracking past and current financing rounds.
    """

    class RoundType(models.TextChoices):
        PRE_SEED = "pre_seed", _("Pre-Seed")
        SEED = "seed", _("Seed")
        SERIES_A = "series_a", _("Series A")
        SERIES_B = "series_b", _("Series B")
        BRIDGE = "bridge", _("Bridge / Convertible Note")
        GRANT = "grant", _("Non-Dilutive Grant")

    class Instrument(models.TextChoices):
        SAFE = "safe", _("Post-Money SAFE")
        CONVERTIBLE_NOTE = "convertible_note", _("Convertible Promissory Note")
        PRICED_EQUITY = "priced_equity", _("Priced Preferred Stock")
        GRANT = "grant", _("Grant Agreement")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="funding_rounds",
    )
    round_type = models.CharField(
        max_length=24,
        choices=RoundType.choices,
        default=RoundType.PRE_SEED,
    )
    instrument = models.CharField(
        max_length=24,
        choices=Instrument.choices,
        default=Instrument.SAFE,
    )
    amount_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    valuation_post_money_usd = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
    )
    announced_date = models.DateField(null=True, blank=True)
    close_date = models.DateField(null=True, blank=True)
    investors_summary = models.CharField(max_length=500, blank=True)
    lead_investor_name = models.CharField(max_length=255, blank=True)
    evidence = models.ForeignKey(
        StartupEvidence,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_funding_rounds",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-announced_date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.startup.company_name} - {self.round_type}: ${self.amount_usd}"


class StartupCustomerSegment(models.Model):
    """
    Structured customer telemetry for diligence underwriting.
    """

    class SegmentType(models.TextChoices):
        ENTERPRISE = "enterprise", _("Enterprise (B2B)")
        MID_MARKET = "mid_market", _("Mid-Market")
        SMB = "smb", _("Small & Medium Business")
        B2C = "b2c", _("Consumer (B2C)")
        GOVERNMENT = "government", _("Government & Public Sector")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="customer_segments",
    )
    segment_type = models.CharField(
        max_length=24,
        choices=SegmentType.choices,
        default=SegmentType.ENTERPRISE,
    )
    customer_count = models.IntegerField(default=0)
    average_contract_value_usd = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    retention_rate_pct = models.FloatField(default=90.0)
    geography = models.CharField(max_length=128, default="North America & Global")
    evidence = models.ForeignKey(
        StartupEvidence,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_customer_segments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-customer_count"]

    def __str__(self) -> str:
        return f"{self.startup.company_name} - {self.segment_type}: {self.customer_count} customers"


class FundraisingCampaign(models.Model):
    """
    Live fundraising state tracking the active round, committed capital, and terms.
    """

    class Status(models.TextChoices):
        PREPARING = "preparing", _("Preparing Materials")
        ACTIVE = "active", _("Actively Raising")
        CLOSING = "closing", _("Closing Round")
        COMPLETED = "completed", _("Round Closed")
        PAUSED = "paused", _("Fundraising Paused")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.OneToOneField(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="fundraising_campaign",
    )
    round_name = models.CharField(max_length=64, default="Pre-Seed Round")
    target_amount_usd = models.DecimalField(max_digits=14, decimal_places=2, default=500000.00)
    amount_committed_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    amount_raised_usd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    valuation_cap_usd = models.DecimalField(max_digits=14, decimal_places=2, default=4000000.00)
    instrument = models.CharField(
        max_length=32,
        default="Post-Money SAFE",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    target_close_date = models.DateField(null=True, blank=True)
    terms_summary = models.TextField(
        default="Standard Post-Money SAFE with MFN and Information Rights for major investors.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.startup.company_name} Campaign: ${self.target_amount_usd} ({self.status})"


class StartupContextualAssessment(models.Model):
    """
    Contextual fundability fit assessments for specific investor or accelerator archetypes.
    """

    class EvaluatorType(models.TextChoices):
        VC_FUND = "vc_fund", _("Institutional VC Fund")
        ACCELERATOR = "accelerator", _("Accelerator Cohort")
        ANGEL_SYNDICATE = "angel_syndicate", _("Angel Syndicate")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="contextual_assessments",
    )
    evaluator_type = models.CharField(
        max_length=24,
        choices=EvaluatorType.choices,
        default=EvaluatorType.VC_FUND,
    )
    evaluator_name = models.CharField(max_length=128)
    fit_score = models.IntegerField(
        help_text=_("Fit score between 0 and 100 for this specific mandate or cohort"),
    )
    primary_conviction = models.CharField(max_length=255)
    primary_concern = models.CharField(max_length=255)
    confidence = models.FloatField(default=0.85)
    assessed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fit_score"]

    def __str__(self) -> str:
        return f"{self.evaluator_name} Fit: {self.fit_score}% for {self.startup.company_name}"
