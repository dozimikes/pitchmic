"""
apps.accelerator.program_runtime
=================================
Program Runtime (Phase 1)

The ProgramRuntime reads the active ProgramEvaluationPolicy for a program
and exposes a clean, typed interface for every other service to consume.

No service downstream of the runtime should read scoring weights, workflow
stages, risk thresholds, or outcome definitions from anywhere other than here.
This is what makes Pitchmic policy-aware rather than opinion-aware.

Usage:
    runtime = ProgramRuntime(program)
    weights = runtime.get_dimension_weights()
    score   = runtime.compute_weighted_score({"founder_quality": 82, "market": 76})
"""
from __future__ import annotations

import logging
from functools import cached_property
from typing import TYPE_CHECKING, Any

from django.core.exceptions import ObjectDoesNotExist

if TYPE_CHECKING:
    from apps.accelerator.models import AcceleratorProgram
    from apps.accelerator.program_policy import ProgramEvaluationPolicy

logger = logging.getLogger(__name__)


# ─── Defaults (used when no policy exists yet) ────────────────────────────────

_DEFAULT_SCORING_DIMENSIONS = [
    {"name": "founder_quality", "label": "Founder Quality",  "weight": 0.35,
     "description": "Founder background, domain expertise, and execution history."},
    {"name": "market",          "label": "Market",           "weight": 0.25,
     "description": "Market size, growth, and competitive dynamics."},
    {"name": "traction",        "label": "Traction",         "weight": 0.20,
     "description": "Revenue, customers, and product validation."},
    {"name": "financials",      "label": "Financials",       "weight": 0.15,
     "description": "Unit economics, runway, and financial health."},
    {"name": "product",         "label": "Product",          "weight": 0.05,
     "description": "Product differentiation and technical moat."},
]

_DEFAULT_MILESTONE_POLICY = {
    "overdue_warn_days": 7,
    "overdue_critical_days": 14,
    "evidence_required": False,
    "adaptive_milestones": False,
}

_DEFAULT_RISK_THRESHOLDS = {
    "founder_engagement_min": 0.4,
    "milestone_completion_min_pct": 0.6,
    "revenue_decline_warn_pct": -0.20,
    "checkin_gap_warn_days": 14,
}

_DEFAULT_WORKFLOW_STAGES = [
    "DRAFT", "SUBMITTED", "SCREENING", "SHORTLISTED",
    "INTERVIEW_INVITED", "INTERVIEW_COMPLETE",
    "COMMITTEE_REVIEW", "ACCEPTED", "REJECTED",
]

_DEFAULT_OUTCOME_WEIGHTS = {
    "funding": 0.4,
    "commercial": 0.3,
    "survival": 0.2,
    "employment": 0.1,
}


# ─── ProgramRuntime ───────────────────────────────────────────────────────────

class ProgramRuntime:
    """
    The single authoritative source of behavioral configuration for a program.

    All downstream services (scoring, reviewer assignment, cohort intelligence,
    intervention engine, milestone tracker, outcome engine) must consult the
    runtime rather than hard-coding assumptions about what "accelerator" means.

    The runtime is intentionally lightweight — it reads the policy and exposes
    it through a clean interface. Heavy computation lives in dedicated service
    modules that accept a ProgramRuntime instance.
    """

    def __init__(self, program: AcceleratorProgram) -> None:
        self.program = program
        self._policy: ProgramEvaluationPolicy | None = None

    @cached_property
    def policy(self) -> ProgramEvaluationPolicy | None:
        """Return the active evaluation policy, or None if none exists."""
        from django.core.exceptions import MultipleObjectsReturned
        try:
            return self.program.evaluation_policies.get(is_active=True)
        except ObjectDoesNotExist:
            logger.warning(
                "program_runtime.no_active_policy program_id=%s — using defaults",
                self.program.pk,
            )
            return None
        except MultipleObjectsReturned:
            # Data integrity: multiple active policies — pick the newest
            logger.warning(
                "program_runtime.multiple_active_policies program_id=%s — picking newest",
                self.program.pk,
            )
            return self.program.evaluation_policies.filter(is_active=True).order_by("-created_at").first()
        except Exception:
            logger.exception(
                "program_runtime.policy_fetch_error program_id=%s", self.program.pk
            )
            return None

    # ── Core scoring interface ────────────────────────────────────────────────

    def get_scoring_dimensions(self) -> list[dict[str, Any]]:
        """Return the ordered list of scoring dimension definitions."""
        if self.policy and self.policy.scoring_dimensions:
            return self.policy.scoring_dimensions
        if self.program.archetype and self.program.archetype.default_scoring_dimensions:
            return self.program.archetype.default_scoring_dimensions
        return _DEFAULT_SCORING_DIMENSIONS

    def get_dimension_weights(self, stage: str = "", sector: str = "") -> dict[str, float]:
        """
        Return {dimension_name: weight} for all dimensions.
        Applies stage/sector adjustments from the policy when provided.
        """
        if self.policy:
            return self.policy.get_adjusted_weights(stage=stage, sector=sector)
        dims = self.get_scoring_dimensions()
        return {d["name"]: d.get("weight", 0.0) for d in dims}

    def compute_weighted_score(
        self,
        dimension_scores: dict[str, float],
        stage: str = "",
        sector: str = "",
    ) -> float:
        """
        Compute a composite score (0–100) from per-dimension scores using
        the program's active policy weights.

        This is the ONLY place in Pitchmic where a composite score is computed
        from raw dimension scores. All other code calls this method.
        """
        if self.policy:
            return self.policy.compute_weighted_score(
                dimension_scores, stage=stage, sector=sector
            )
        # Fallback: use defaults
        weights = self.get_dimension_weights()
        total = 0.0
        weight_used = 0.0
        for name, weight in weights.items():
            if name in dimension_scores:
                total += dimension_scores[name] * weight
                weight_used += weight
        if weight_used > 0 and weight_used < 0.99:
            total = total / weight_used
        return round(total, 2)

    # ── Workflow configuration ────────────────────────────────────────────────

    def get_workflow_stages(self) -> list[str]:
        """Return the ordered list of workflow stage slugs for this program."""
        if self.policy and self.policy.program.workflow_config:
            stages = self.policy.program.workflow_config.get("stages")
            if stages:
                return stages
        return _DEFAULT_WORKFLOW_STAGES

    # ── Review configuration ──────────────────────────────────────────────────

    def get_min_reviewers(self) -> int:
        return self.policy.min_reviewers_per_application if self.policy else 2

    def get_review_rounds(self) -> int:
        return self.policy.review_rounds if self.policy else 1

    def get_reviewer_roles(self) -> list[dict[str, Any]]:
        return (self.policy.reviewer_roles if self.policy else []) or []

    # ── Interview configuration ───────────────────────────────────────────────

    def get_interview_policy(self) -> dict[str, Any]:
        if self.policy and self.policy.interview_policy:
            return self.policy.interview_policy
        return {
            "enabled": True,
            "rounds": 1,
            "format": "ai_voice",
            "shortlist_pct": 0.30,
            "pre_interview_evidence_review": True,
        }

    # ── Decision configuration ────────────────────────────────────────────────

    def get_decision_policy(self) -> dict[str, Any]:
        if self.policy and self.policy.decision_policy:
            return self.policy.decision_policy
        return {
            "committee_size": 5,
            "quorum": 3,
            "voting_method": "majority",
            "allow_conditional_accept": True,
            "require_rationale": True,
        }

    # ── Milestone configuration ───────────────────────────────────────────────

    def get_milestone_policy(self) -> dict[str, Any]:
        if self.policy and self.policy.milestone_policy:
            return self.policy.milestone_policy
        if self.program.archetype and self.program.archetype.default_milestone_policy:
            return self.program.archetype.default_milestone_policy
        return _DEFAULT_MILESTONE_POLICY

    def get_overdue_warn_days(self) -> int:
        return self.get_milestone_policy().get("overdue_warn_days", 7)

    def get_overdue_critical_days(self) -> int:
        return self.get_milestone_policy().get("overdue_critical_days", 14)

    def milestones_require_evidence(self) -> bool:
        return self.get_milestone_policy().get("evidence_required", False)

    # ── Risk thresholds ───────────────────────────────────────────────────────

    def get_risk_thresholds(self) -> dict[str, Any]:
        if self.policy and self.policy.risk_thresholds:
            return self.policy.risk_thresholds
        if self.program.archetype and self.program.archetype.default_risk_thresholds:
            return self.program.archetype.default_risk_thresholds
        return _DEFAULT_RISK_THRESHOLDS

    def get_founder_engagement_min(self) -> float:
        return self.get_risk_thresholds().get("founder_engagement_min", 0.4)

    def get_milestone_completion_min(self) -> float:
        return self.get_risk_thresholds().get("milestone_completion_min_pct", 0.6)

    def get_revenue_decline_threshold(self) -> float:
        return self.get_risk_thresholds().get("revenue_decline_warn_pct", -0.20)

    def get_checkin_gap_warn_days(self) -> int:
        return self.get_risk_thresholds().get("checkin_gap_warn_days", 14)

    # ── Outcome schema ────────────────────────────────────────────────────────

    def get_outcome_weights(self) -> dict[str, float]:
        if self.policy and self.policy.outcome_weights:
            return self.policy.outcome_weights
        if self.program.archetype and self.program.archetype.default_outcome_weights:
            return self.program.archetype.default_outcome_weights
        return _DEFAULT_OUTCOME_WEIGHTS

    def get_primary_outcome_types(self) -> list[str]:
        """Return outcome types sorted by weight descending."""
        return sorted(
            self.get_outcome_weights().keys(),
            key=lambda k: self.get_outcome_weights()[k],
            reverse=True,
        )

    # ── Cohort constraints ────────────────────────────────────────────────────

    def get_cohort_constraints(self) -> dict[str, Any]:
        if self.policy and self.policy.cohort_constraints:
            return self.policy.cohort_constraints
        return {
            "min_cohort_size": 5,
            "max_cohort_size": self.program.target_cohort_size,
            "max_same_sector_pct": 0.40,
            "max_same_geography_pct": 0.60,
        }

    # ── Hard gates ────────────────────────────────────────────────────────────

    def get_hard_gates(self) -> list[dict[str, Any]]:
        if self.policy and self.policy.hard_gates:
            return self.policy.hard_gates
        if self.program.archetype and self.program.archetype.default_hard_gates:
            return self.program.archetype.default_hard_gates
        return []

    def evaluate_hard_gates(self, application_data: dict[str, Any]) -> dict[str, Any]:
        """
        Evaluate hard gates against application data.
        Returns: {passed: bool, gate_results: [{gate, passed, reason}]}
        """
        gates = self.get_hard_gates()
        results = []
        all_passed = True

        for gate in gates:
            gate_name = gate.get("gate", "")
            required_value = gate.get("value")
            is_disqualifying = gate.get("is_disqualifying", True)
            actual_value = application_data.get(gate_name)

            passed = True
            reason = ""

            if required_value is not None:
                if isinstance(required_value, bool):
                    passed = bool(actual_value) == required_value
                elif isinstance(required_value, (int, float)):
                    passed = actual_value is not None and actual_value >= required_value
                else:
                    passed = str(actual_value) == str(required_value)

            if not passed and is_disqualifying:
                all_passed = False
                reason = gate.get("failure_message", f"Failed gate: {gate_name}")

            results.append({
                "gate": gate_name,
                "description": gate.get("description", ""),
                "passed": passed,
                "reason": reason,
                "is_disqualifying": is_disqualifying,
            })

        return {"passed": all_passed, "gate_results": results}

    # ── Policy identity ───────────────────────────────────────────────────────

    def get_policy_version(self) -> str:
        """Return the active policy version string for use in Decision Ledger records."""
        return self.policy.version if self.policy else "default"

    def get_program_type(self) -> str:
        """Return the program type from the program model."""
        return getattr(self.program, "program_type", "vc_accelerator")

    def get_archetype_slug(self) -> str:
        """Return the archetype slug of the active policy's archetype."""
        if self.policy and self.policy.archetype:
            return self.policy.archetype.slug
        return "vc_accelerator"

    def to_context_dict(self) -> dict[str, Any]:
        """
        Serialise the runtime config for logging, debugging, and the Decision Ledger snapshot.
        """
        return {
            "program_id": self.program.pk,
            "program_name": self.program.name,
            "program_type": self.get_program_type(),
            "policy_version": self.get_policy_version(),
            "archetype": self.get_archetype_slug(),
            "scoring_dimensions": self.get_scoring_dimensions(),
            "milestone_policy": self.get_milestone_policy(),
            "risk_thresholds": self.get_risk_thresholds(),
            "outcome_weights": self.get_outcome_weights(),
        }
