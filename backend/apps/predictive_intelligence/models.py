"""
apps.predictive_intelligence.models
====================================

First-class subsystem for advanced predictive ML.

Architecture layers:
    FEATURE STORE  ── StartupFeatureSnapshot
    KNOWLEDGE GRAPH ── GraphEntity + GraphRelation
    TEMPORAL ML    ── VentureSurvivalForecast + StartupSnapshot
    TABULAR ML     ── VentureOutcomePrediction (multi-head)
    GRAPH ML       ── GraphEmbedding + LinkPredictionScore
    BAYESIAN       ── BayesianUpdateLog + PosteriorSnapshot
    UNCERTAINTY    ── CredibleInterval + UncertaintyDecomposition
    CALIBRATION    ── CalibrationRecord + ReliabilityCurveBin
    REGISTRY       ── ModelRegistry + ModelVersion + TrainingRun + EvaluationRun
    INVESTOR ML    ── InvestorIntentPrediction + BehavioralSequence
    ANOMALY        ── AnomalyDetectionRecord

Every prediction is reproducible:
    PredictionRun → ModelVersion → FeatureSetVersion → EvidenceSnapshot
"""
from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from apps.users.models import InvestorProfile, StartupProfile


_PROB_VALIDATORS = [
    MinValueValidator(0.0, message=_("Probability must be ≥ 0.")),
    MaxValueValidator(1.0, message=_("Probability must be ≤ 1.")),
]


# =========================================================================
# SECTION 1 — FEATURE STORE
# =========================================================================


FEATURE_SOURCE_CHOICES = [
    ("pitch_deck", "Pitch Deck Extraction"),
    ("forensics", "Forensic Audit / Verified Claim"),
    ("data_room", "Data Room Upload"),
    ("voice_interview", "Voice Interview Transcript"),
    ("public_api", "Public Market Data API"),
    ("investor_signal", "Investor Behavioral Telemetry"),
    ("manual_entry", "Manual Analyst Entry"),
    ("institutional_memory", "Digital Brain / Institutional Memory"),
    ("computed", "Derived / Computed Feature"),
]


class StartupFeatureSnapshot(models.Model):
    """
    Centralized temporal feature snapshot for predictive ML.

    Each row represents everything Pitchmic knew about a startup at
    `observed_at`.  Predictive models train only against historical
    snapshots to guarantee zero look-ahead leakage.

    Feature values are nullable so the store can record partial
    information; `confidence` per-feature is stored as JSON parallel
    arrays.
    """

    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="feature_snapshots",
        db_index=True,
    )

    # --- Temporal provenance (leakage prevention) --------------------------
    observed_at = models.DateTimeField(
        db_index=True,
        help_text=_("Point-in-time this feature state was observed / valid."),
    )
    feature_version = models.CharField(
        max_length=30,
        default="v1.0",
        help_text=_("Feature-set schema version."),
    )
    snapshot_hash = models.CharField(
        max_length=64,
        blank=True,
        help_text=_("SHA-256 of the feature payload for reproducibility."),
    )

    # --- Core unit-economics features --------------------------------------
    revenue_growth_pct = models.FloatField(null=True, blank=True)
    gross_margin_pct = models.FloatField(null=True, blank=True)
    net_revenue_retention_pct = models.FloatField(null=True, blank=True)
    burn_multiple = models.FloatField(null=True, blank=True)
    runway_months = models.FloatField(null=True, blank=True)
    customer_growth_pct = models.FloatField(null=True, blank=True)
    cac_payback_months = models.FloatField(null=True, blank=True)
    ltv_cac_ratio = models.FloatField(null=True, blank=True)
    monthly_arr_usd = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    # --- Founder / team features -------------------------------------------
    founder_experience_score = models.FloatField(
        null=True, blank=True, help_text=_("0–100 composite of prior exits, domain tenure, and pedigree.")
    )
    team_strength_score = models.FloatField(
        null=True, blank=True, help_text=_("0–100 composite of senior team completeness and advisor network.")
    )
    founder_market_fit_score = models.FloatField(null=True, blank=True)

    # --- Market / competitive features -------------------------------------
    market_growth_pct = models.FloatField(null=True, blank=True)
    competitive_pressure_score = models.FloatField(
        null=True, blank=True, help_text=_("0 (monopoly) → 100 (red ocean).")
    )
    moat_strength_score = models.FloatField(null=True, blank=True)
    tam_usd = models.DecimalField(max_digits=22, decimal_places=2, null=True, blank=True)

    # --- Funding / traction velocity ---------------------------------------
    funding_velocity_score = models.FloatField(
        null=True, blank=True, help_text=_("0–100 composite of round frequency, dilution efficiency, and investor tier.")
    )
    investor_quality_score = models.FloatField(
        null=True, blank=True, help_text=_("0–100 weighted by lead-investor brand, prior exits, and follow-on rate.")
    )
    investor_interest_score = models.FloatField(
        null=True, blank=True, help_text=_("0–100 composite of views, deck downloads, and intro requests.")
    )

    # --- Engagement / evidence quality -------------------------------------
    data_room_engagement_score = models.FloatField(
        null=True, blank=True, help_text=_("0–100 composite of doc views, depth, and recency.")
    )
    pitch_quality_score = models.FloatField(null=True, blank=True)
    evidence_coverage_pct = models.FloatField(
        null=True, blank=True, help_text=_("% of the 40 standard diligence dimensions that have a verified value.")
    )

    # --- Aggregate confidence ----------------------------------------------
    aggregate_confidence = models.FloatField(
        default=0.0,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 weighted average of per-feature confidence (how much we trust this snapshot)."),
    )

    # --- Per-feature confidence & source (parallel JSON arrays) ------------
    per_feature_confidence = models.JSONField(
        default=dict,
        help_text=_("{feature_key: 0..1} — per-feature data-quality weight."),
    )
    per_feature_source = models.JSONField(
        default=dict,
        help_text=_("{feature_key: source_code} — maps to FEATURE_SOURCE_CHOICES."),
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("startup feature snapshot")
        verbose_name_plural = _("startup feature snapshots")
        ordering = ["-observed_at"]
        indexes = [
            models.Index(fields=["startup", "observed_at", "feature_version"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["startup", "observed_at", "feature_version"],
                name="uq_feature_snapshot_startup_observed_version",
            )
        ]

    def __str__(self) -> str:
        return (
            f"FeatureSnap {self.startup.company_name} "
            f"@{self.observed_at.date().isoformat()} v{self.feature_version}"
        )


# =========================================================================
# SECTION 2 — HISTORICAL "TIME MACHINE" SNAPSHOTS (Backtesting)
# =========================================================================


class StartupHistoricalSnapshot(models.Model):
    """
    Full immutable state snapshot of a startup for point-in-time backtesting.

    This enables the evaluator to answer:
      "Could Pitchmic have predicted this unicorn using only information
       available on 2022-01-01?"

    The `state_json` blob contains the denormalised StartupProfile,
    its pitches, offers, dataroom metadata, investor engagement, and
    forensic reports — everything a model would have seen at `as_of`.
    """

    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="historical_snapshots",
        db_index=True,
    )
    as_of = models.DateTimeField(
        db_index=True,
        help_text=_("Historical reconstruction date (exclusive upper bound)."),
    )
    cohort_tag = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text=_("e.g. 'seed_2021_h1' for backtest cohort grouping."),
    )

    # --- Actual ground-truth outcomes (populated later for evaluation) -----
    actual_outcome_fundraising_24m = models.BooleanField(null=True, blank=True)
    actual_outcome_series_a_36m = models.BooleanField(null=True, blank=True)
    actual_outcome_series_b_60m = models.BooleanField(null=True, blank=True)
    actual_outcome_exit_84m = models.BooleanField(null=True, blank=True)
    actual_outcome_failure_60m = models.BooleanField(null=True, blank=True)
    actual_valuation_at_exit_usd = models.DecimalField(max_digits=22, decimal_places=2, null=True, blank=True)

    # --- State -------------------------------------------------------------
    state_json = models.JSONField(
        default=dict,
        help_text=_("Denormalised startup state as it existed at `as_of`."),
    )
    feature_snapshot = models.ForeignKey(
        StartupFeatureSnapshot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="historical_snapshots",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("startup historical snapshot")
        verbose_name_plural = _("startup historical snapshots")
        ordering = ["-as_of"]
        constraints = [
            models.UniqueConstraint(
                fields=["startup", "as_of"],
                name="uq_historical_snapshot_startup_asof",
            )
        ]

    def __str__(self) -> str:
        return f"HistSnapshot {self.startup.company_name} @ {self.as_of.date().isoformat()}"


# =========================================================================
# SECTION 3 — VENTURE OUTCOME PREDICTION (Multi-task multi-horizon)
# =========================================================================


class VentureOutcomePrediction(models.Model):
    """
    The ultimate probabilistic prediction object.

    Replaces the old "overall score" idea with a fully specified
    distribution over outcomes × horizons, with explicit Bayesian
    credible intervals and evidence-driven feature attribution.
    """

    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="venture_outcome_predictions",
        db_index=True,
    )

    # --- Provenance --------------------------------------------------------
    feature_snapshot = models.ForeignKey(
        StartupFeatureSnapshot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outcome_predictions",
    )
    model_version = models.ForeignKey(
        "ModelVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outcome_predictions",
    )
    prediction_run = models.ForeignKey(
        "PredictionRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outcome_predictions",
    )
    generated_at = models.DateTimeField(auto_now_add=True, db_index=True)

    # --- Head: Fundraising probability -------------------------------------
    fundraising_prob_12m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of next fundraising round within 12 months."),
    )
    fundraising_prob_24m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of next fundraising round within 24 months."),
    )
    fundraising_prob_36m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of next fundraising round within 36 months."),
    )

    # --- Head: Series milestones -------------------------------------------
    series_a_prob_12m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of Series A within 12 months."),
    )
    series_a_prob_24m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of Series A within 24 months."),
    )
    series_a_prob_36m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of Series A within 36 months."),
    )
    series_b_prob_36m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of Series B within 36 months."),
    )
    series_b_prob_60m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of Series B within 60 months."),
    )

    # --- Head: Growth -------------------------------------------------------
    high_growth_prob_24m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability: P($10M+ ARR within 24 months)."),
    )
    high_growth_prob_60m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability: P($100M+ valuation within 60 months)."),
    )
    revenue_forecast_12m_usd = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    revenue_forecast_24m_usd = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    revenue_forecast_36m_usd = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    # --- Head: Exit ---------------------------------------------------------
    exit_prob_60m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of any exit (acq/IPO) within 60 months."),
    )
    exit_prob_84m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of any exit (acq/IPO) within 84 months."),
    )
    exit_acquisition_prob_60m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of acquisition within 60 months."),
    )
    exit_ipo_prob_84m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of IPO within 84 months."),
    )

    # --- Head: Failure ------------------------------------------------------
    failure_prob_24m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of wind-down / failure within 24 months."),
    )
    failure_prob_60m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of wind-down / failure within 60 months."),
    )

    # --- Head: Unicorn ------------------------------------------------------
    unicorn_prob_36m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability: P(valuation ≥ $1B within 36 months)."),
    )
    unicorn_prob_60m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability: P(valuation ≥ $1B within 60 months)."),
    )
    unicorn_prob_84m = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability: P(valuation ≥ $1B within 84 months)."),
    )

    # --- Valuation forecast ------------------------------------------------
    valuation_median_24m_usd = models.DecimalField(max_digits=22, decimal_places=2, null=True, blank=True)
    valuation_median_60m_usd = models.DecimalField(max_digits=22, decimal_places=2, null=True, blank=True)
    valuation_median_84m_usd = models.DecimalField(max_digits=22, decimal_places=2, null=True, blank=True)

    # --- Bayesian uncertainty ----------------------------------------------
    confidence_tier = models.CharField(
        max_length=20,
        choices=[
            ("VERY_HIGH", "Very High"),
            ("HIGH", "High"),
            ("MODERATE", "Moderate"),
            ("SPECULATIVE", "Speculative"),
            ("DATA_SPARSE", "Data Sparse"),
        ],
        default="MODERATE",
    )
    overall_uncertainty_score = models.FloatField(
        default=1.0,
        help_text=_("Higher = more uncertain. Variance of the posterior × 100."),
    )
    evidence_coverage_pct = models.FloatField(
        default=0.0,
        validators=[MinValueValidator(0.0), MaxValueValidator(100.0)],
        help_text=_("0–100 percentage of diligence evidence dimensions that have verified values."),
    )

    # --- Explainability ----------------------------------------------------
    top_positive_drivers = models.JSONField(
        default=list,
        help_text=_("Ranked [{feature, contribution_pct, shap_value}] for the unicorn head."),
    )
    top_negative_drivers = models.JSONField(
        default=list,
        help_text=_("Ranked [{feature, contribution_pct, shap_value}] risk factors."),
    )
    feature_attribution = models.JSONField(
        default=dict,
        help_text=_("{outcome_head: {feature: contribution_pct}} full attribution matrix."),
    )
    explanation_narrative = models.TextField(blank=True)

    # --- Calibration flag --------------------------------------------------
    is_calibrated = models.BooleanField(
        default=False,
        help_text=_("True if these probabilities passed through Platt / isotonic calibration."),
    )

    class Meta:
        verbose_name = _("venture outcome prediction")
        verbose_name_plural = _("venture outcome predictions")
        ordering = ["-generated_at"]
        indexes = [
            models.Index(fields=["startup", "generated_at"]),
            models.Index(fields=["unicorn_prob_60m"]),
        ]

    def __str__(self) -> str:
        u = self.unicorn_prob_60m or 0.0
        return f"VentureForecast {self.startup.company_name} — 🦄60m={u * 100:.1f}%"


# =========================================================================
# SECTION 4 — VENTURE SURVIVAL ANALYSIS (Time-to-event)
# =========================================================================


class VentureSurvivalForecast(models.Model):
    """
    Parametric survival / hazard forecast for a milestone.

    Instead of a single probability, stores the cumulative CDF curve
    (Weibull / Cox PH) over horizon months so the frontend can render
    "P(Series A) by month" curves.
    """

    MILESTONE_CHOICES = [
        ("fundraising", "Next Fundraising Round"),
        ("series_a", "Series A Close"),
        ("series_b", "Series B Close"),
        ("ten_m_arr", "$10M ARR"),
        ("hundred_m_val", "$100M Valuation"),
        ("unicorn", "Unicorn ($1B Valuation)"),
        ("exit", "Exit (Acq/IPO)"),
        ("failure", "Failure / Wind-down"),
    ]

    prediction = models.ForeignKey(
        VentureOutcomePrediction,
        on_delete=models.CASCADE,
        related_name="survival_forecasts",
    )
    milestone = models.CharField(max_length=30, choices=MILESTONE_CHOICES, db_index=True)

    # --- Parametric fit ----------------------------------------------------
    model_type = models.CharField(
        max_length=20,
        choices=[
            ("weibull", "Weibull AFT"),
            ("cox_ph", "Cox Proportional Hazards"),
            ("log_normal", "Log-Normal"),
            ("kaplan_meier", "Kaplan-Meier (empirical)"),
        ],
        default="weibull",
    )
    weibull_lambda_months = models.FloatField(
        null=True, blank=True, help_text=_("Scale parameter λ in Weibull F(t)=1−exp(−(t/λ)^k).")
    )
    weibull_k_shape = models.FloatField(null=True, blank=True, help_text=_("Shape parameter k."))

    # --- CDF curve ---------------------------------------------------------
    cdf_curve_json = models.JSONField(
        default=list,
        help_text=_("[{horizon_months, probability, hazard_rate, ci_lower, ci_upper}]."),
    )
    median_time_months = models.FloatField(
        null=True, blank=True, help_text=_("Time at which CDF crosses 50%."),
    )
    expected_time_months = models.FloatField(null=True, blank=True)

    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("venture survival forecast")
        verbose_name_plural = _("venture survival forecasts")
        constraints = [
            models.UniqueConstraint(
                fields=["prediction", "milestone"],
                name="uq_survival_prediction_milestone",
            )
        ]

    def __str__(self) -> str:
        med = self.median_time_months or 0.0
        return f"Survival {self.prediction.startup.company_name} {self.milestone} median={med:.1f}m"


# =========================================================================
# SECTION 5 — BAYESIAN INFERENCE & UNCERTAINTY ENGINE PERSISTENCE
# =========================================================================


class BayesianUpdateLog(models.Model):
    """
    Auditable trace of every Bayesian evidence update that contributed
    to a posterior prediction.

    Pipeline:
        prior (α₀, β₀)
          → new evidence (claim / verified observation)
          → likelihood weight
          → posterior (α₁, β₁)
          → credible intervals
          → updated VentureOutcomePrediction
    """

    OUTCOME_CHOICES = [
        ("fundraising", "Fundraising"),
        ("series_a", "Series A"),
        ("series_b", "Series B"),
        ("high_growth", "High Growth"),
        ("exit", "Exit"),
        ("failure", "Failure"),
        ("unicorn", "Unicorn"),
    ]

    prediction = models.ForeignKey(
        VentureOutcomePrediction,
        on_delete=models.CASCADE,
        related_name="bayesian_updates",
    )
    outcome_head = models.CharField(max_length=30, choices=OUTCOME_CHOICES, db_index=True)
    step_order = models.PositiveIntegerField(default=0)

    # --- Prior -------------------------------------------------------------
    prior_alpha = models.FloatField()
    prior_beta = models.FloatField()
    prior_probability = models.FloatField(
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 prior probability (α₀/(α₀+β₀)) before this evidence."),
    )

    # --- Evidence ----------------------------------------------------------
    evidence_type = models.CharField(max_length=50, choices=FEATURE_SOURCE_CHOICES)
    evidence_ref = models.CharField(
        max_length=100,
        blank=True,
        help_text=_("Claim id, document url, or feature key that triggered this update."),
    )
    positive_weight_applied = models.FloatField(default=0.0)
    negative_weight_applied = models.FloatField(default=0.0)
    evidence_confidence = models.FloatField(
        default=1.0,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 trust in this evidence source."),
    )

    # --- Posterior ---------------------------------------------------------
    posterior_alpha = models.FloatField()
    posterior_beta = models.FloatField()
    posterior_probability = models.FloatField(
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 posterior probability after incorporating this evidence."),
    )
    ci_5_pct = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 lower bound of the 90% credible interval."),
    )
    ci_50_pct = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 posterior median."),
    )
    ci_95_pct = models.FloatField(
        null=True, blank=True, validators=_PROB_VALIDATORS,
        help_text=_("0–1 upper bound of the 90% credible interval."),
    )
    uncertainty_score = models.FloatField(default=0.0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("bayesian update log")
        verbose_name_plural = _("bayesian update logs")
        ordering = ["prediction", "outcome_head", "step_order"]

    def __str__(self) -> str:
        delta = (self.posterior_probability - self.prior_probability) * 100
        return (
            f"Bayes {self.prediction.startup.company_name}/{self.outcome_head} "
            f"Δ={delta:+.2f}pp step={self.step_order}"
        )


class UncertaintyDecomposition(models.Model):
    """
    Breaks the overall prediction uncertainty into sources so users
    understand *why* the model is uncertain.
    """

    prediction = models.OneToOneField(
        VentureOutcomePrediction,
        on_delete=models.CASCADE,
        related_name="uncertainty_decomposition",
    )

    # --- Sources (summing to overall_uncertainty_score) --------------------
    data_sparsity_contribution = models.FloatField(
        default=0.0, help_text=_("Uncertainty from missing / unverified features.")
    )
    evidence_conflict_contribution = models.FloatField(
        default=0.0, help_text=_("Uncertainty from contradictory evidence.")
    )
    model_epistemic_contribution = models.FloatField(
        default=0.0, help_text=_("Epistemic: model doesn't know this region of feature space.")
    )
    inherent_aleatoric_contribution = models.FloatField(
        default=0.0, help_text=_("Aleatoric: irreducible startup-level noise / luck.")
    )
    calibration_correction_contribution = models.FloatField(
        default=0.0, help_text=_("Additional uncertainty from calibration-adjusted fudge factors.")
    )

    # --- Reliability guidance ---------------------------------------------
    recommended_minimum_evidence_items = models.PositiveIntegerField(default=20)
    current_evidence_items = models.PositiveIntegerField(default=0)
    biggest_uncertainty_driver = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"UncDecomp {self.prediction.startup.company_name}"


# =========================================================================
# SECTION 6 — KNOWLEDGE GRAPH (Entity + Relationship persistence)
# =========================================================================


ENTITY_TYPE_CHOICES = [
    ("FOUNDER", "Founder"),
    ("STARTUP", "Startup"),
    ("INVESTOR", "Investor"),
    ("FUND", "Fund / Vehicle"),
    ("SECTOR", "Sector"),
    ("MARKET", "Market / Sub-vertical"),
    ("COMPETITOR", "Competitor"),
    ("CUSTOMER", "Reference Customer"),
    ("TECHNOLOGY", "Technology / Patent"),
    ("FUNDING_ROUND", "Funding Round"),
    ("ACQUISITION", "Acquisition Event"),
    ("EXECUTIVE", "Executive / Team Member"),
]


class GraphEntity(models.Model):
    """
    Persisted node in the Pitchmic Investment Knowledge Graph.

    Supports:
      • Graph embeddings (Node2Vec / GNN input)
      • Link-prediction scores ("which investor will fund this startup?")
      • Structural-unicorn queries ("which undiscovered startups
        resemble the subgraph topology of previous unicorns?")
    """

    entity_id = models.CharField(max_length=128, unique=True, db_index=True)
    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPE_CHOICES, db_index=True)
    label = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # --- Foreign-key resolvers for core domain objects --------------------
    startup_profile = models.ForeignKey(
        StartupProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="graph_nodes",
    )
    investor_profile = models.ForeignKey(
        InvestorProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="graph_nodes",
    )
    user_profile = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="graph_nodes",
    )

    # --- Graph-ML state ----------------------------------------------------
    embedding_vector = models.JSONField(
        default=list,
        blank=True,
        help_text=_("Pre-computed graph embedding (e.g. 128-dim Node2Vec)."),
    )
    embedding_version = models.CharField(max_length=20, blank=True)
    structural_unicorn_similarity = models.FloatField(
        null=True,
        blank=True,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 cosine similarity of this subgraph's structural fingerprint to the unicorn archetype."),
    )

    properties = models.JSONField(default=dict, help_text=_("Arbitrary typed attributes (sector, country, vintage…)."))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("knowledge graph entity")
        verbose_name_plural = _("knowledge graph entities")
        indexes = [
            models.Index(fields=["entity_type", "label"]),
        ]

    def __str__(self) -> str:
        return f"[{self.entity_type}] {self.label} ({self.entity_id})"


RELATION_TYPE_CHOICES = [
    ("FOUNDED", "Founder founded Startup"),
    ("EMPLOYS", "Startup employs Executive"),
    ("INVESTED_IN", "Investor / Fund invested in Startup"),
    ("LED_ROUND", "Investor led FundingRound"),
    ("PARTICIPATED_IN", "Investor participated in FundingRound"),
    ("OPERATES_IN", "Startup operates in Sector/Market"),
    ("COMPETES_WITH", "Startup competes with Startup"),
    ("HAS_CUSTOMER", "Startup has reference Customer"),
    ("USES_TECH", "Startup uses Technology"),
    ("HAS_ROUND", "Startup has FundingRound"),
    ("ACQUIRED", "Acquirer acquired Startup"),
    ("ACQUIRED_BY", "Startup acquired by Acquirer"),
    ("HAS_EXIT", "Startup has exit event"),
    ("MANAGES", "Fund managed by Investor (GP)"),
    ("SITS_ON_BOARD", "Investor sits on board of Startup"),
    ("CO_INVESTED_WITH", "Investor co-invested with Investor"),
    ("MENTORED_BY", "Founder mentored by Investor"),
    ("SPINOFF_OF", "Startup is spinoff of Startup"),
]


class GraphRelation(models.Model):
    """Persisted directed edge in the investment knowledge graph."""

    source = models.ForeignKey(
        GraphEntity,
        on_delete=models.CASCADE,
        related_name="outgoing_edges",
    )
    target = models.ForeignKey(
        GraphEntity,
        on_delete=models.CASCADE,
        related_name="incoming_edges",
    )
    relation_type = models.CharField(max_length=30, choices=RELATION_TYPE_CHOICES, db_index=True)

    weight = models.FloatField(
        default=1.0,
        help_text=_("Edge weight for GNN: confidence, round size, or investment amount normalised."),
    )
    occurred_at = models.DateField(
        null=True, blank=True, help_text=_("When the relationship started / event occurred.")
    )
    properties = models.JSONField(default=dict, help_text=_("{round_size_usd, equity_pct, board_seat, lead_order…}"))

    # --- Link prediction score --------------------------------------------
    predicted_by_gnn_probability = models.FloatField(
        null=True,
        blank=True,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 GNN-assigned probability that this edge should exist (synthetic edges)."),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("knowledge graph relation")
        verbose_name_plural = _("knowledge graph relations")
        indexes = [
            models.Index(fields=["source", "relation_type"]),
            models.Index(fields=["target", "relation_type"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "target", "relation_type"],
                condition=Q(occurred_at__isnull=True),
                name="uq_graph_relation_stro_null_date",
            ),
            models.UniqueConstraint(
                fields=["source", "target", "relation_type", "occurred_at"],
                condition=Q(occurred_at__isnull=False),
                name="uq_graph_relation_stro_with_date",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.source.label} ─[{self.relation_type}]→ {self.target.label}"


# =========================================================================
# SECTION 7 — INVESTOR INTENT / BEHAVIORAL SEQUENCE ML
# =========================================================================


BEHAVIOR_EVENT_CHOICES = [
    ("PROFILE_VIEW", "Viewed Startup Profile"),
    ("PITCH_VIEW", "Viewed Pitch Detail"),
    ("DECK_DOWNLOAD", "Downloaded Pitch Deck"),
    ("DATA_ROOM_ACCESS", "Accessed Data Room"),
    ("RETURN_VISIT", "Return Visit (≥2 visits in 7 days)"),
    ("SEARCH_IMPRESSION", "Appeared in Search Results"),
    ("SHORTLIST_ADD", "Added to Shortlist / Watchlist"),
    ("INTRO_REQUEST", "Requested Introduction"),
    ("MESSAGE_SENT", "Sent Message to Founder"),
    ("DILIGENCE_REQUEST", "Requested Due Diligence"),
    ("OFFER_MADE", "Made Offer / Term Sheet"),
    ("INVESTMENT", "Invested"),
]


class InvestorBehavioralSequence(models.Model):
    """
    Time-ordered investor behaviour events for a (investor, startup) pair.

    Feeds the investor-intent Markov / transformer sequence model.
    """

    investor = models.ForeignKey(
        InvestorProfile,
        on_delete=models.CASCADE,
        related_name="behavior_sequences",
        db_index=True,
    )
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="investor_behavior_sequences",
        db_index=True,
    )

    events_json = models.JSONField(
        default=list,
        help_text=_("Ordered [{event_type, occurred_at, metadata}]."),
    )
    window_start = models.DateTimeField(db_index=True)
    window_end = models.DateTimeField(db_index=True)
    total_events = models.PositiveIntegerField(default=0)

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("investor behavioral sequence")
        verbose_name_plural = _("investor behavioral sequences")
        constraints = [
            models.UniqueConstraint(
                fields=["investor", "startup"],
                name="uq_behavior_sequence_investor_startup",
            )
        ]

    def __str__(self) -> str:
        return (
            f"BehaviorSeq inv#{self.investor_id} → st#{self.startup_id} "
            f"({self.total_events} events)"
        )


class InvestorIntentPrediction(models.Model):
    """
    Investor intent forecast for a specific (investor, startup) pair.

    Predictions:
      P(interest), P(introduction requested), P(DD), P(offer), P(investment)
      — all within horizon_days.
    """

    HORIZON_CHOICES = [
        (7, "7 days"),
        (14, "14 days"),
        (30, "30 days"),
        (60, "60 days"),
        (90, "90 days"),
    ]

    investor = models.ForeignKey(
        InvestorProfile,
        on_delete=models.CASCADE,
        related_name="intent_predictions",
        db_index=True,
    )
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="investor_intent_predictions",
        db_index=True,
    )
    sequence = models.ForeignKey(
        InvestorBehavioralSequence,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intent_predictions",
    )
    horizon_days = models.PositiveSmallIntegerField(choices=HORIZON_CHOICES, default=30, db_index=True)
    model_version = models.ForeignKey(
        "ModelVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="investor_intent_predictions",
    )

    # --- Heads -------------------------------------------------------------
    p_interest = models.FloatField(
        default=0.0,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of actively interested / warm signal within horizon."),
    )
    p_introduction = models.FloatField(
        default=0.0,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of requesting an introduction within horizon."),
    )
    p_due_diligence = models.FloatField(
        default=0.0,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of opening due diligence within horizon."),
    )
    p_offer = models.FloatField(
        default=0.0,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of submitting term sheet / offer within horizon."),
    )
    p_investment = models.FloatField(
        default=0.0,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability of actually investing within horizon."),
    )

    intent_tier = models.CharField(
        max_length=30,
        choices=[
            ("COLD", "Cold"),
            ("WARM", "Warm"),
            ("HIGH_CONVICTION", "High Conviction"),
            ("IMMINENT_TERM_SHEET", "Imminent Term Sheet"),
        ],
        default="COLD",
    )
    progression_velocity = models.FloatField(default=0.0)
    recommended_next_action = models.TextField(blank=True)
    top_sequence_drivers = models.JSONField(default=list)

    generated_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _("investor intent prediction")
        verbose_name_plural = _("investor intent predictions")
        ordering = ["-p_investment"]
        indexes = [
            models.Index(fields=["investor", "generated_at"]),
            models.Index(fields=["startup", "p_offer"]),
        ]

    def __str__(self) -> str:
        return (
            f"IntentPred inv#{self.investor_id} → st#{self.startup_id} "
            f"P(invest)={self.p_investment:.2%}"
        )


# =========================================================================
# SECTION 8 — ANOMALY DETECTION PERSISTENCE
# =========================================================================


class AnomalyDetectionRecord(models.Model):
    """
    Persisted statistical anomaly audit for a metric claim.

    Output is always "Requires verification" (never "Fraud.") per
    the engineering policy.
    """

    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="anomaly_records",
        null=True,
        blank=True,
    )
    company_name = models.CharField(max_length=255, blank=True)

    metric_key = models.CharField(max_length=100, db_index=True)
    claimed_value = models.FloatField()
    sector_label = models.CharField(max_length=100, blank=True)

    # --- Peer distribution -------------------------------------------------
    peer_median = models.FloatField(null=True, blank=True)
    peer_p25 = models.FloatField(null=True, blank=True)
    peer_p75 = models.FloatField(null=True, blank=True)
    peer_p95 = models.FloatField(null=True, blank=True)
    peer_sample_size = models.PositiveIntegerField(null=True, blank=True)

    # --- Anomaly scoring ---------------------------------------------------
    anomaly_score = models.FloatField(
        default=0.0,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 normalised outlier score (Isolation Forest / robust z)."),
    )
    anomaly_severity = models.CharField(
        max_length=10,
        choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High"), ("CRITICAL", "Critical")],
        default="LOW",
    )
    detection_method = models.CharField(
        max_length=30,
        choices=[
            ("isolation_forest", "Isolation Forest"),
            ("local_outlier_factor", "Local Outlier Factor"),
            ("robust_zscore", "Robust Z-Score"),
            ("percentile_benchmark", "Sector Percentile Benchmark"),
            ("autoencoder", "Autoencoder Reconstruction Error"),
        ],
        default="percentile_benchmark",
    )
    is_anomaly = models.BooleanField(default=False)

    # --- Analyst outcome ---------------------------------------------------
    resolution_status = models.CharField(
        max_length=20,
        choices=[
            ("UNRESOLVED", "Unresolved"),
            ("VERIFIED", "Verified / Supported"),
            ("UPDATED", "Founder Provided Update"),
            ("DISPUTED", "Disputed / Contradicted"),
            ("EXPLAINED", "Context Explained"),
        ],
        default="UNRESOLVED",
        db_index=True,
    )
    resolution_notes = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_anomalies",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    explanation = models.TextField(blank=True)
    evidence_refs = models.JSONField(
        default=list,
        help_text=_("List of related claim ids / document references for the analyst triage view."),
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _("anomaly detection record")
        verbose_name_plural = _("anomaly detection records")
        ordering = ["-anomaly_score", "-created_at"]

    def __str__(self) -> str:
        name = self.company_name or (self.startup.company_name if self.startup else "Unknown")
        return f"Anomaly {name} {self.metric_key}={self.claimed_value} score={self.anomaly_score:.2f}"


# =========================================================================
# SECTION 9 — MODEL CALIBRATION ENGINE
# =========================================================================


class CalibrationRecord(models.Model):
    """
    Stores calibration parameters (Platt scaling coefficients / isotonic
    bins) for a specific ModelVersion × outcome_head.

    Raw model logits → calibrated probabilities via this record.
    """

    OUTCOME_HEAD_CHOICES = [
        ("fundraising_12m", "Fundraising 12m"),
        ("series_a_24m", "Series A 24m"),
        ("series_b_36m", "Series B 36m"),
        ("high_growth_24m", "High Growth 24m"),
        ("exit_60m", "Exit 60m"),
        ("failure_24m", "Failure 24m"),
        ("unicorn_60m", "Unicorn 60m"),
        ("investor_p_offer", "Investor P(Offer)"),
        ("investor_p_invest", "Investor P(Invest)"),
    ]

    model_version = models.ForeignKey(
        "ModelVersion",
        on_delete=models.CASCADE,
        related_name="calibrations",
    )
    outcome_head = models.CharField(max_length=30, choices=OUTCOME_HEAD_CHOICES, db_index=True)

    method = models.CharField(
        max_length=20,
        choices=[
            ("platt", "Platt Scaling"),
            ("isotonic", "Isotonic Regression"),
            ("beta", "Beta Calibration"),
            ("temperature", "Temperature Scaling"),
        ],
        default="platt",
    )

    # --- Platt scaling: σ(A·logit + B) ------------------------------------
    platt_A = models.FloatField(null=True, blank=True)
    platt_B = models.FloatField(null=True, blank=True)

    # --- Temperature: softmax(z / T) --------------------------------------
    temperature = models.FloatField(null=True, blank=True, default=1.0)

    # --- Isotonic bins -----------------------------------------------------
    isotonic_bins_json = models.JSONField(
        default=list,
        help_text=_("[{pred_low, pred_high, calibrated_prob, count}] for isotonic regression lookup."),
    )

    # --- Quality metrics ---------------------------------------------------
    brier_score = models.FloatField(null=True, blank=True, help_text=_("Lower is better (0=perfect)."))
    expected_calibration_error = models.FloatField(
        null=True, blank=True, help_text=_("ECE in pp (0–100)." )
    )
    max_calibration_error = models.FloatField(null=True, blank=True)
    reliability_curve_json = models.JSONField(
        default=list,
        help_text=_("[{bin_center, mean_predicted, fraction_positive, count}] for plotting."),
    )

    calibrated_on_cohort_size = models.PositiveIntegerField(default=0)
    calibrated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("calibration record")
        verbose_name_plural = _("calibration records")
        constraints = [
            models.UniqueConstraint(
                fields=["model_version", "outcome_head", "method"],
                name="uq_calibration_model_head_method",
            )
        ]

    def __str__(self) -> str:
        return f"Calib {self.model_version.name}/{self.outcome_head} [{self.method}]"


# =========================================================================
# SECTION 10 — MODEL REGISTRY & EXPERIMENTATION TRACKING
# =========================================================================


class ModelRegistry(models.Model):
    """
    Top-level "family" grouping for related models.

    e.g. "venture-outcome-multitask", "investor-intent-markov",
         "anomaly-isolation-forest", "knowledge-graph-gnn"
    """

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    family = models.CharField(
        max_length=40,
        choices=[
            ("tabular_ml", "Tabular ML (XGBoost/LightGBM)"),
            ("temporal_ml", "Temporal / Survival ML"),
            ("graph_ml", "Graph ML (GNN / Node2Vec)"),
            ("bayesian", "Bayesian / Probabilistic"),
            ("sequence_ml", "Sequence / Transformer / HMM"),
            ("anomaly_ml", "Anomaly / Outlier Detection"),
            ("calibration", "Calibration / Post-Hoc Adjustment"),
            ("ensemble", "Ensemble / Stacking"),
            ("heuristic", "Heuristic / Rule-Based"),
        ],
        db_index=True,
    )
    owner_team = models.CharField(max_length=100, default="venture-intelligence")
    documentation_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("model registry")
        verbose_name_plural = _("model registries")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"ModelRegistry::{self.name}"


class ModelVersion(models.Model):
    """
    Specific trained version of a model.  Every prediction links to one
    so results are reproducible.
    """

    STATUS_CHOICES = [
        ("STAGING", "Staging"),
        ("PRODUCTION", "Production (active)"),
        ("ARCHIVED", "Archived"),
        ("ABANDONED", "Abandoned"),
    ]

    registry = models.ForeignKey(
        ModelRegistry,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    semantic_version = models.CharField(max_length=30, help_text=_("e.g. '1.7.3'"))
    name = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="STAGING", db_index=True)
    is_active = models.BooleanField(default=False, db_index=True)

    # --- Artifact provenance ----------------------------------------------
    artifact_uri = models.CharField(
        max_length=500,
        blank=True,
        help_text=_("s3:// / gs:// / local path to the pickled / onnx model."),
    )
    artifact_hash = models.CharField(
        max_length=64,
        blank=True,
        help_text=_("SHA-256 of the artifact for integrity verification."),
    )
    framework = models.CharField(
        max_length=30,
        blank=True,
        help_text=_("xgboost, lightgbm, pytorch, sklearn, lifelines, custom…"),
    )
    feature_set_version = models.CharField(
        max_length=30,
        blank=True,
        help_text=_("Version of the feature schema this model expects."),
    )
    hyperparameters = models.JSONField(default=dict)
    training_cohort_definition = models.JSONField(
        default=dict,
        help_text=_("{min_startup_founded, max_prediction_date, sectors, stages} reproducible cohort spec."),
    )

    # --- Offline metrics ---------------------------------------------------
    baseline_metrics = models.JSONField(
        default=dict,
        help_text=_("{accuracy, auc_roc, f1, brier, ece, precision_top_10pct}…"),
    )
    fairness_metrics = models.JSONField(default=dict)

    deployed_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("model version")
        verbose_name_plural = _("model versions")
        constraints = [
            models.UniqueConstraint(
                fields=["registry", "semantic_version"],
                name="uq_modelversion_registry_semver",
            )
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.registry.name} v{self.semantic_version} [{self.status}]"


class TrainingRun(models.Model):
    """One training-job run that produced (or failed to produce) a ModelVersion."""

    model_version = models.OneToOneField(
        ModelVersion,
        on_delete=models.CASCADE,
        related_name="training_run",
        null=True,
        blank=True,
    )
    registry = models.ForeignKey(
        ModelRegistry,
        on_delete=models.CASCADE,
        related_name="training_runs",
    )
    run_id = models.CharField(max_length=64, unique=True, db_index=True)
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triggered_training_runs",
    )

    status = models.CharField(
        max_length=20,
        choices=[
            ("QUEUED", "Queued"),
            ("RUNNING", "Running"),
            ("COMPLETED", "Completed"),
            ("FAILED", "Failed"),
            ("CANCELLED", "Cancelled"),
        ],
        default="QUEUED",
        db_index=True,
    )
    dataset_version_tag = models.CharField(max_length=50, blank=True)
    data_snapshot_date = models.DateTimeField(
        null=True, blank=True, help_text=_("Upper-bound date used for training-data time-travel.")
    )
    train_sample_count = models.PositiveIntegerField(default=0)
    val_sample_count = models.PositiveIntegerField(default=0)
    test_sample_count = models.PositiveIntegerField(default=0)

    metrics_history_json = models.JSONField(
        default=list,
        help_text=_("Per-epoch / per-boosting-round metrics (loss, eval auc, lr…)."),
    )
    final_metrics = models.JSONField(default=dict)
    failure_reason = models.TextField(blank=True)

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    wall_clock_seconds = models.FloatField(null=True, blank=True)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("training run")
        verbose_name_plural = _("training runs")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"TrainRun {self.run_id} [{self.status}]"


class EvaluationRun(models.Model):
    """
    Backtest / evaluation run against a historical cohort.

    Critical for the "could we have predicted this unicorn?" guarantee.
    """

    STATUS_CHOICES = [
        ("QUEUED", "Queued"),
        ("RUNNING", "Running"),
        ("COMPLETED", "Completed"),
        ("FAILED", "Failed"),
    ]

    run_id = models.CharField(max_length=64, unique=True, db_index=True)
    model_version = models.ForeignKey(
        ModelVersion,
        on_delete=models.CASCADE,
        related_name="evaluations",
    )
    cohort_tag = models.CharField(max_length=50, db_index=True)
    as_of_date = models.DateTimeField(
        help_text=_("Upper-bound date for the time-machine: no post-date feature may leak in.")
    )
    lookahead_horizon_months = models.PositiveSmallIntegerField(
        default=24,
        help_text=_("How far ahead ground-truth labels are evaluated (e.g. 24 = Series A within 24m)."),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="QUEUED")
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triggered_eval_runs",
    )

    leakage_check_passed = models.BooleanField(
        null=True, blank=True, help_text=_("False if any feature post-dated as_of in the test set."),
    )
    leakage_details = models.JSONField(default=dict)

    # --- Overall cohort metrics -------------------------------------------
    cohort_size = models.PositiveIntegerField(default=0)
    positive_count = models.PositiveIntegerField(default=0)

    precision_at_top_10_pct = models.FloatField(null=True, blank=True)
    precision_at_top_25_pct = models.FloatField(null=True, blank=True)
    recall_at_top_10_pct = models.FloatField(null=True, blank=True)
    f1_at_optimal_threshold = models.FloatField(null=True, blank=True)
    auc_roc = models.FloatField(null=True, blank=True)
    auc_pr = models.FloatField(null=True, blank=True)
    brier_score = models.FloatField(null=True, blank=True)
    expected_calibration_error = models.FloatField(null=True, blank=True)

    # --- Per-quartile breakdown -------------------------------------------
    quartile_performance = models.JSONField(
        default=list,
        help_text=_("Per score-quartile: [{q, mean_pred, mean_actual, precision, recall}]."),
    )
    headwise_metrics = models.JSONField(
        default=dict,
        help_text=_("{outcome_head: {precision, recall, brier, auc_roc}}."),
    )
    per_prediction_outcomes = models.JSONField(
        default=list,
        help_text=_("Sampled [{startup_id, predicted, actual, features, error}].", ),
    )

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("evaluation run")
        verbose_name_plural = _("evaluation runs")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return (
            f"EvalRun {self.run_id} {self.cohort_tag} "
            f"(h={self.lookahead_horizon_months}m) — {self.status}"
        )


class PredictionRun(models.Model):
    """
    A batch (or on-demand) run that produced VentureOutcomePredictions.

    Every prediction object links back to here so the end-to-end
    pipeline is reproducible:
        PredictionRun → ModelVersion → FeatureSetVersion → TrainingRun
    """

    run_id = models.CharField(max_length=64, unique=True, db_index=True)
    model_version = models.ForeignKey(
        ModelVersion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prediction_runs",
    )
    feature_snapshot_version = models.CharField(max_length=30, blank=True)
    scope = models.CharField(
        max_length=20,
        choices=[
            ("SINGLE", "Single Startup (on-demand)"),
            ("SECTOR", "Sector Batch"),
            ("TENANT", "Tenant Portfolio"),
            ("FULL_REFRESH", "Full Platform Refresh"),
            ("BACKTEST", "Backtest Evaluation"),
        ],
        default="SINGLE",
    )
    startup_count = models.PositiveIntegerField(default=0)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prediction_runs",
    )

    status = models.CharField(
        max_length=20,
        choices=[
            ("QUEUED", "Queued"),
            ("RUNNING", "Running"),
            ("COMPLETED", "Completed"),
            ("FAILED", "Failed"),
            ("PARTIAL", "Partial"),
        ],
        default="QUEUED",
    )
    error_message = models.TextField(blank=True)

    calibration_applied = models.BooleanField(default=False)
    summary_statistics = models.JSONField(
        default=dict,
        help_text=_("{mean_unicorn_prob, median_uncertainty, sector_distribution}…"),
    )

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    wall_clock_seconds = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("prediction run")
        verbose_name_plural = _("prediction runs")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"PredRun {self.run_id} [{self.status}] × {self.startup_count}"


class Experiment(models.Model):
    """
    A-B / champion-challenger experiment comparing two ModelVersions.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    champion_model = models.ForeignKey(
        ModelVersion,
        on_delete=models.CASCADE,
        related_name="experiment_champion",
    )
    challenger_model = models.ForeignKey(
        ModelVersion,
        on_delete=models.CASCADE,
        related_name="experiment_challenger",
    )
    traffic_split_pct_challenger = models.FloatField(
        default=20.0, help_text=_("% of traffic routed to challenger (100-champion%).")
    )
    primary_metric = models.CharField(
        max_length=50,
        default="precision_at_top_10pct",
        help_text=_("Key metric used to declare winner."),
    )
    required_mde_pct = models.FloatField(
        default=5.0,
        help_text=_("Minimum detectable improvement on primary metric (relative %)."),
    )

    status = models.CharField(
        max_length=20,
        choices=[
            ("DRAFT", "Draft"),
            ("RUNNING", "Running"),
            ("CHAMPION_WINS", "Champion Retained"),
            ("CHALLENGER_WINS", "Challenger Promoted"),
            ("INCONCLUSIVE", "Inconclusive / No MDE"),
            ("STOPPED", "Stopped Early"),
        ],
        default="DRAFT",
        db_index=True,
    )

    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    final_results = models.JSONField(
        default=dict,
        help_text=_("{primary: {champion, challenger, delta, p_value, win_prob}, secondary: {...}}"),
    )

    winner_model = models.ForeignKey(
        ModelVersion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="experiment_winner",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="experiments_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("experiment")
        verbose_name_plural = _("experiments")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Experiment '{self.name}' [{self.status}]"


class PredictionFeedbackV2(models.Model):
    """
    Richer version of PredictionFeedback with explicit outcome-head
    targeting and reproducible evaluation metadata.
    """

    prediction = models.ForeignKey(
        VentureOutcomePrediction,
        on_delete=models.CASCADE,
        related_name="feedback_v2",
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="prediction_feedback_v2",
    )

    # --- Granular per-head ratings ----------------------------------------
    outcome_head = models.CharField(
        max_length=30,
        choices=[
            ("fundraising", "Fundraising"),
            ("series_a", "Series A"),
            ("unicorn", "Unicorn"),
            ("exit", "Exit"),
            ("failure", "Failure"),
            ("overall", "Overall Prediction"),
        ],
        default="overall",
    )
    accuracy_rating = models.PositiveSmallIntegerField(
        help_text=_("1–5: 1 = very wrong, 5 = very accurate."),
    )
    calibration_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text=_("1–5: 1 = way overconfident, 5 = well-calibrated probabilities."),
    )
    usefulness_rating = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text=_("1–5 usefulness to investment decision.")
    )

    # --- Analyst override --------------------------------------------------
    analyst_probability_override = models.FloatField(
        null=True,
        blank=True,
        validators=_PROB_VALIDATORS,
        help_text=_("0–1 probability. If the analyst overrides the model, store their corrected probability here."),
    )
    analyst_reasoning = models.TextField(blank=True)

    # --- Ground-truth closure ---------------------------------------------
    actual_outcome = models.CharField(max_length=50, blank=True)
    actual_outcome_date = models.DateField(null=True, blank=True)
    actual_value_usd = models.DecimalField(max_digits=22, decimal_places=2, null=True, blank=True)

    freeform_comment = models.TextField(blank=True)
    feedback_source = models.CharField(
        max_length=20,
        choices=[("investor", "Investor"), ("startup", "Startup"), ("admin", "Admin / Analyst")],
        default="investor",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("prediction feedback v2")
        verbose_name_plural = _("prediction feedback v2")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return (
            f"Feedback v2 {self.prediction.startup.company_name}/"
            f"{self.outcome_head} — rated {self.accuracy_rating}/5"
        )


# =========================================================================
# SECTION 11 — AI PROVIDER REGISTRY, CAPABILITIES, & USAGE LOG
# =========================================================================
#
# PitchMic = ML-native venture intelligence.  AI / LLMs are an AUXILIARY
# layer.  The models here track:
#   1. AICapability          — canonical registry + per-tenant runtime overrides
#   2. AIProviderUsageLog    — auditable token / cost / latency trail for every LLM call
#


class AICapability(models.Model):
    """
    Canonical registry of every AI-augmented / ML-only feature.

    Mirrors the in-code FEATURE_CAPABILITIES list in
    ``apps.predictive_intelligence.ai_gateway`` but adds runtime toggles
    (per-tenant / per-install overrides) and admin-editable documentation.

    ``tier`` — see ai_gateway.FEATURE_CAPABILITIES for semantics:
        ml_only  → Always active; no LLM involvement.
        ai_opt   → Uses LLM when available; heuristic fallback always present.
        ai_req   → Requires live LLM provider; disabled in pure-ML mode.
    """

    TIER_CHOICES = [
        ("ml_only", "ML Only (always active)"),
        ("ai_opt", "AI Optional (heuristic fallback)"),
        ("ai_req", "AI Required (pure-ML mode disabled)"),
    ]

    CATEGORY_CHOICES = [
        ("pitch_enrichment", "Pitch Enrichment"),
        ("due_diligence", "Due-Diligence Pipeline"),
        ("explanations", "ML Output Explanations"),
        ("deck_parsing", "Pitch-Deck Parsing"),
        ("voice_interview", "Voice Interview Analysis"),
        ("rag", "RAG / Institutional Memory"),
        ("graph_enrichment", "Knowledge-Graph Enrichment"),
        ("other", "Other"),
    ]

    key = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text=_("Stable dotted identifier, e.g. 'dd.forensic_audit'."),
    )
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES, db_index=True)
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, db_index=True)
    description = models.TextField(blank=True)

    # --- Runtime override (admin toggle) ----------------------------------
    admin_enabled = models.BooleanField(
        default=True,
        help_text=_("Admin kill-switch: when False this feature is off regardless of AI availability."),
    )

    # --- Component manifest -----------------------------------------------
    ml_components = models.JSONField(
        default=list,
        help_text=_("List of ML / heuristic module names that back this feature."),
    )
    ai_components = models.JSONField(
        default=list,
        help_text=_("List of LLM call sites used when AI is enabled."),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("AI capability")
        verbose_name_plural = _("AI capabilities")
        ordering = ["category", "key"]

    def __str__(self) -> str:
        return f"[{self.tier}] {self.category} · {self.key}"


class AIProviderUsageLog(models.Model):
    """
    Auditable usage log for every LLM / provider call routed through
    ``apps.predictive_intelligence.ai_gateway.ai_complete()``.

    Supports cost budgeting, per-tenant chargeback, and anomaly detection
    (e.g. sudden token-spend spikes).
    """

    PROVIDER_CHOICES = [
        ("noop", "NoOp (pure-ML mode)"),
        ("openai", "OpenAI"),
        ("gemini", "Google Gemini"),
        ("openrouter", "OpenRouter"),
        ("azure_openai", "Azure OpenAI"),
        ("local", "Local / Self-hosted"),
    ]

    call_id = models.CharField(max_length=64, unique=True, db_index=True)
    provider = models.CharField(max_length=30, choices=PROVIDER_CHOICES, db_index=True)
    model_name = models.CharField(max_length=100, blank=True, db_index=True)

    # --- Routing -----------------------------------------------------------
    feature_key = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text=_("AICapability.key of the caller, e.g. 'dd.managing_partner'."),
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_provider_calls",
    )
    startup_context = models.ForeignKey(
        StartupProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_usage_logs",
        help_text=_("Optional startup this call was scoped to."),
    )
    investor_context = models.ForeignKey(
        InvestorProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_usage_logs",
        help_text=_("Optional investor this call was scoped to."),
    )

    # --- Usage & cost ------------------------------------------------------
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.FloatField(default=0.0, help_text=_("End-to-end request latency."))
    cost_usd = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        default=0,
        help_text=_("Calculated via AIGateway.PRICING_PER_1K_TOKENS at call time."),
    )

    # --- Outcome -----------------------------------------------------------
    fallback_used = models.BooleanField(
        default=False,
        help_text=_("True when AI was disabled or failed; NoOp/Heuristic engaged."),
    )
    success = models.BooleanField(default=True, help_text=_("False if provider returned an error."))
    error_message = models.TextField(blank=True)

    # --- Traceability ------------------------------------------------------
    system_instruction_snippet = models.CharField(max_length=500, blank=True)
    prompt_snippet = models.CharField(max_length=1000, blank=True)
    response_snippet = models.CharField(max_length=1000, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _("AI provider usage log")
        verbose_name_plural = _("AI provider usage logs")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["provider", "created_at"]),
            models.Index(fields=["feature_key", "created_at"]),
        ]

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def __str__(self) -> str:
        return (
            f"AI {self.provider}/{self.model_name} "
            f"t={self.total_tokens} ${self.cost_usd} "
            f"{'FALLBACK ' if self.fallback_used else ''}{self.call_id[:8]}"
        )
