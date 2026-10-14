from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


# ─────────────────────────────────────────────────────────────────────────────
# 1. ProgramArchetype  (system-seeded templates)
# ─────────────────────────────────────────────────────────────────────────────

class ProgramArchetype(models.Model):
    """
    A named starting-point configuration for a common accelerator type.
    Programs pick an archetype during setup and can then customise every field.

    Six archetypes ship by default (see management command seed_archetypes):
        vc_accelerator | corporate | government | university | impact | pre_accelerator
    """

    ARCHETYPE_SLUG_CHOICES = [
        ("vc_accelerator",   _("VC / Venture-backed Accelerator")),
        ("corporate",        _("Corporate Accelerator")),
        ("government",       _("Government / Public Accelerator")),
        ("university",       _("University / Research Accelerator")),
        ("impact",           _("Impact / Nonprofit Accelerator")),
        ("pre_accelerator",  _("Pre-Accelerator / Founder Program")),
    ]

    slug = models.SlugField(unique=True, max_length=60)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_system_archetype = models.BooleanField(default=True)

    # ── Default scoring dimensions ───────────────────────────────────────────
    # Stored as:  [{name, label, weight, description, evidence_requirement}]
    # weight values across all dimensions must sum to 1.0
    default_scoring_dimensions = models.JSONField(
        _("default scoring dimensions"),
        default=list,
        help_text=_(
            "[{name: str, label: str, weight: float, description: str, "
            "evidence_requirement: none|optional|required}]"
        ),
    )

    # ── Default outcome weights ──────────────────────────────────────────────
    # Stored as:  {commercial: 0.3, funding: 0.4, ...}
    # Valid outcome types: commercial | financial | funding | employment |
    #                      impact | innovation | strategic | survival | export | community
    default_outcome_weights = models.JSONField(
        _("default outcome weights"),
        default=dict,
    )

    # ── Default workflow stages ──────────────────────────────────────────────
    # Ordered list of stage slugs relevant to this archetype
    default_workflow_stages = models.JSONField(
        _("default workflow stages"),
        default=list,
        help_text=_("[submission, eligibility, triage, review, interview, committee, decision]"),
    )

    # ── Default hard gates ───────────────────────────────────────────────────
    # Rules that must pass before moving to review:
    # [{gate, description, is_disqualifying}]
    default_hard_gates = models.JSONField(
        _("default hard gates"),
        default=list,
    )

    # ── Default milestone policy ─────────────────────────────────────────────
    default_milestone_policy = models.JSONField(
        _("default milestone policy"),
        default=dict,
        help_text=_("{overdue_warn_days: int, overdue_critical_days: int, evidence_required: bool}"),
    )

    # ── Default risk thresholds ──────────────────────────────────────────────
    default_risk_thresholds = models.JSONField(
        _("default risk thresholds"),
        default=dict,
        help_text=_(
            "{founder_engagement_min: float, milestone_completion_min: float, "
            "revenue_decline_warn_pct: float}"
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("program archetype")
        verbose_name_plural = _("program archetypes")
        ordering = ["slug"]

    def __str__(self) -> str:
        return f"Archetype: {self.name}"


# ─────────────────────────────────────────────────────────────────────────────
# 2. ProgramEvaluationPolicy  (versioned, typed, program-specific)
# ─────────────────────────────────────────────────────────────────────────────

class ProgramEvaluationPolicy(models.Model):
    """
    The typed, versioned evaluation config for a specific program.

    Every scoring, reviewer-assignment, milestone, intervention, and outcome
    computation must derive its parameters from the active policy version —
    never from hardcoded constants.

    A program may have multiple historical policy versions.
    Only one policy per program may be active (is_active=True) at a time.

    Versioning drives the Decision Ledger: every decision record captures
    the policy_version that was active when the decision was made.
    """

    program = models.ForeignKey(
        "accelerator.AcceleratorProgram",
        on_delete=models.CASCADE,
        related_name="evaluation_policies",
    )
    archetype = models.ForeignKey(
        ProgramArchetype,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="derived_policies",
        help_text=_("The archetype this policy was seeded from (for reference only)."),
    )

    version = models.CharField(
        _("policy version"),
        max_length=30,
        default="v1.0",
        help_text=_("e.g. '2027-v1' — used as the anchor in the Decision Ledger."),
    )
    is_active = models.BooleanField(
        _("active"),
        default=False,
        help_text=_("Only one policy per program should be active. Enforced by activate()."),
    )
    effective_from = models.DateTimeField(_("effective from"), null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_policies",
    )

    # ── Scoring dimensions ───────────────────────────────────────────────────
    # [{name, label, weight, description, evidence_requirement}]
    # weight values must sum to 1.0 — validated by clean()
    scoring_dimensions = models.JSONField(
        _("scoring dimensions"),
        default=list,
        help_text=_(
            "Ordered list of scoring dimensions for this program. "
            "weights must sum to 1.0. "
            "e.g. [{name: 'founder_quality', label: 'Founder Quality', "
            "weight: 0.25, description: '...', evidence_requirement: 'required'}]"
        ),
    )

    # ── Per-stage weight adjustments ─────────────────────────────────────────
    # {idea: {market: 0.10, founder_quality: 0.35}, seed: {traction: 0.25, ...}}
    stage_adjustments = models.JSONField(
        _("stage-based weight adjustments"),
        default=dict,
        blank=True,
    )

    # ── Per-sector weight adjustments ────────────────────────────────────────
    # {fintech: {regulatory_readiness: 0.15}, healthtech: {clinical_evidence: 0.20}}
    sector_adjustments = models.JSONField(
        _("sector-based weight adjustments"),
        default=dict,
        blank=True,
    )

    # ── Eligibility gates ────────────────────────────────────────────────────
    # Rules checked before any scoring:
    # [{gate, description, is_disqualifying, value}]
    hard_gates = models.JSONField(
        _("hard gates"),
        default=list,
        blank=True,
        help_text=_("Conditions that must pass before an application is eligible for scoring."),
    )

    # ── Review configuration ─────────────────────────────────────────────────
    min_reviewers_per_application = models.PositiveIntegerField(
        _("min reviewers per application"),
        default=2,
    )
    review_rounds = models.PositiveIntegerField(
        _("review rounds"),
        default=1,
    )
    reviewer_roles = models.JSONField(
        _("reviewer roles"),
        default=list,
        blank=True,
        help_text=_("[{role_name, required_expertise, min_count}]"),
    )

    # ── Interview policy ─────────────────────────────────────────────────────
    interview_policy = models.JSONField(
        _("interview policy"),
        default=dict,
        blank=True,
        help_text=_(
            "{enabled: bool, rounds: int, format: ai_voice|human_video|human_in_person, "
            "shortlist_pct: float, pre_interview_evidence_review: bool}"
        ),
    )

    # ── Decision / committee policy ──────────────────────────────────────────
    decision_policy = models.JSONField(
        _("decision policy"),
        default=dict,
        blank=True,
        help_text=_(
            "{committee_size: int, quorum: int, voting_method: majority|supermajority|consensus, "
            "allow_conditional_accept: bool, require_rationale: bool}"
        ),
    )

    # ── Diversity policy ─────────────────────────────────────────────────────
    diversity_policy = models.JSONField(
        _("diversity policy"),
        default=dict,
        blank=True,
        help_text=_(
            "{target_female_founders_pct: float, target_geography_distribution: dict, "
            "target_sector_distribution: dict}"
        ),
    )

    # ── Cohort constraints ───────────────────────────────────────────────────
    cohort_constraints = models.JSONField(
        _("cohort constraints"),
        default=dict,
        blank=True,
        help_text=_(
            "{min_cohort_size: int, max_cohort_size: int, "
            "max_same_sector_pct: float, max_same_geography_pct: float}"
        ),
    )

    # ── Milestone policy ─────────────────────────────────────────────────────
    milestone_policy = models.JSONField(
        _("milestone policy"),
        default=dict,
        blank=True,
        help_text=_(
            "{overdue_warn_days: int, overdue_critical_days: int, "
            "evidence_required: bool, adaptive_milestones: bool}"
        ),
    )

    # ── Risk thresholds ──────────────────────────────────────────────────────
    risk_thresholds = models.JSONField(
        _("risk thresholds"),
        default=dict,
        blank=True,
        help_text=_(
            "{founder_engagement_min: float, milestone_completion_min_pct: float, "
            "revenue_decline_warn_pct: float, checkin_gap_warn_days: int}"
        ),
    )

    # ── Outcome schema ───────────────────────────────────────────────────────
    # Defines what this program considers "success"
    # {commercial: 0.3, funding: 0.4, employment: 0.2, survival: 0.1}
    outcome_weights = models.JSONField(
        _("outcome weights"),
        default=dict,
        blank=True,
        help_text=_(
            "Relative weights for outcome types. "
            "Valid keys: commercial | financial | funding | employment | "
            "impact | innovation | strategic | survival | export | community"
        ),
    )

    # ── Evidence requirements ────────────────────────────────────────────────
    # Per-dimension minimum evidence level
    # {founder_quality: required, traction: optional, market: none}
    evidence_requirements = models.JSONField(
        _("evidence requirements"),
        default=dict,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("program evaluation policy")
        verbose_name_plural = _("program evaluation policies")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        status = "ACTIVE" if self.is_active else "inactive"
        return f"{self.program.name} — Policy {self.version} [{status}]"

    def clean(self) -> None:
        """Validate scoring dimension weights sum to 1.0 (within tolerance)."""
        from django.core.exceptions import ValidationError

        if self.scoring_dimensions:
            total = sum(d.get("weight", 0) for d in self.scoring_dimensions)
            if not (0.99 <= total <= 1.01):
                raise ValidationError(
                    f"Scoring dimension weights must sum to 1.0 (current sum: {total:.4f})."
                )

    def activate(self) -> None:
        """
        Mark this policy as active, deactivating all other policies for this program.
        Call this inside a transaction.
        """
        from django.db import transaction
        from django.utils import timezone

        with transaction.atomic():
            ProgramEvaluationPolicy.objects.filter(
                program=self.program, is_active=True
            ).exclude(pk=self.pk).update(is_active=False)
            self.is_active = True
            if not self.effective_from:
                self.effective_from = timezone.now()
            self.save(update_fields=["is_active", "effective_from"])

    # ── Convenience accessors ────────────────────────────────────────────────

    def get_dimension_weights(self) -> dict[str, float]:
        """Return {dimension_name: weight} mapping for quick lookups."""
        return {d["name"]: d.get("weight", 0.0) for d in self.scoring_dimensions}

    def get_adjusted_weights(self, stage: str = "", sector: str = "") -> dict[str, float]:
        """
        Return dimension weights after applying stage/sector adjustments.
        Adjustments are additive overrides — if a key is in the adjustment dict
        it replaces the base weight for that dimension.
        """
        weights = self.get_dimension_weights()
        if stage and stage in self.stage_adjustments:
            weights.update(self.stage_adjustments[stage])
        if sector and sector in self.sector_adjustments:
            weights.update(self.sector_adjustments[sector])
        return weights

    def compute_weighted_score(
        self,
        dimension_scores: dict[str, float],
        stage: str = "",
        sector: str = "",
    ) -> float:
        """
        Compute a single composite score from per-dimension scores (0–100 each)
        using the policy's dimension weights (with optional stage/sector adjustments).

        Returns a float in [0, 100].
        """
        weights = self.get_adjusted_weights(stage=stage, sector=sector)
        total = 0.0
        weight_used = 0.0
        for dim_name, weight in weights.items():
            if dim_name in dimension_scores:
                total += dimension_scores[dim_name] * weight
                weight_used += weight
        # Normalise if some dimensions were missing
        if weight_used > 0 and weight_used < 0.99:
            total = total / weight_used
        return round(total, 2)
