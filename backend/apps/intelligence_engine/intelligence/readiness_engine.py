"""
apps.intelligence_engine.intelligence.readiness_engine
=======================================================
ReadinessEngine - computes a startup's application readiness for each
opportunity with specific blocking requirements and a readiness score.

Output per startup × opportunity:
  readiness_pct         0–100%
  hard_blockers         disqualifying requirements not met
  soft_gaps             non-blocking gaps
  met_requirements      requirements already satisfied
  strengths             explicit positive signals
  recommended_actions   ordered list of what to fix
  verdict               ready | nearly_ready | not_ready | disqualified

The engine maps startup profile attributes to requirement constraints.
Every gap has a resolution_hint so founders know EXACTLY what to do.
"""
from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from django.utils import timezone

from apps.intelligence_engine.models_opportunities import (
    OpportunityLifecycle,
    OpportunityRequirement,
    ReadinessBlocker,
    StartupReadinessScore,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Readiness assessment DTO
# ---------------------------------------------------------------------------

@dataclass
class ReadinessAssessment:
    """Full readiness assessment for one startup × opportunity pair."""
    startup_id:            str
    opportunity_id:        str
    opportunity_title:     str
    readiness_pct:         float
    hard_blockers:         int
    soft_gaps:             int
    met_requirements:      int
    total_requirements:    int
    strengths:             List[str] = field(default_factory=list)
    blockers:              List[Dict[str, str]] = field(default_factory=list)
    soft_gap_list:         List[Dict[str, str]] = field(default_factory=list)
    recommended_actions:   List[str] = field(default_factory=list)
    verdict:               str = "not_ready"
    computed_at:           str = ""

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__


# ---------------------------------------------------------------------------
# ReadinessEngine
# ---------------------------------------------------------------------------

class ReadinessEngine:
    """
    Assesses a startup's readiness to apply to a specific opportunity.

    Usage::
        engine = ReadinessEngine()
        assessment = engine.assess(startup_profile, opportunity)
    """

    def assess(
        self,
        startup: Any,
        opportunity: OpportunityLifecycle,
        persist: bool = True,
    ) -> ReadinessAssessment:
        """
        Compute readiness assessment for a startup × opportunity pair.
        startup is a StartupProfile-like object with standard fields.
        """
        now = timezone.now()
        assessment = ReadinessAssessment(
            startup_id=str(getattr(startup, "id", "")),
            opportunity_id=str(opportunity.id),
            opportunity_title=opportunity.title,
            computed_at=now.isoformat(),
        )

        checks = self._run_checks(startup, opportunity)
        blockers     = [c for c in checks if c["is_blocking"] and not c["met"]]
        soft_gaps    = [c for c in checks if not c["is_blocking"] and not c["met"]]
        met          = [c for c in checks if c["met"]]

        assessment.hard_blockers      = len(blockers)
        assessment.soft_gaps          = len(soft_gaps)
        assessment.met_requirements   = len(met)
        assessment.total_requirements = len(checks)

        assessment.strengths = [c["description"] for c in met if c.get("is_strength")]
        assessment.blockers  = [
            {"requirement": c["description"], "hint": c["hint"]}
            for c in blockers
        ]
        assessment.soft_gap_list = [
            {"requirement": c["description"], "hint": c["hint"]}
            for c in soft_gaps
        ]

        assessment.readiness_pct   = self._compute_readiness_pct(checks)
        assessment.verdict         = self._compute_verdict(assessment)
        assessment.recommended_actions = self._build_action_plan(blockers, soft_gaps)

        if persist:
            self._persist(assessment, opportunity)
            self._persist_blockers(assessment, opportunity, blockers + soft_gaps)

        return assessment

    def assess_all_active(
        self, startup: Any, limit: int = 30
    ) -> List[ReadinessAssessment]:
        """Assess readiness across all active opportunities. Returns sorted list."""
        opps = OpportunityLifecycle.objects.filter(
            lifecycle_status__in=[
                OpportunityLifecycle.LifecycleStatus.OPEN,
                OpportunityLifecycle.LifecycleStatus.ROLLING,
                OpportunityLifecycle.LifecycleStatus.DEADLINE_APPROACHING,
                OpportunityLifecycle.LifecycleStatus.OPENING_SOON,
                OpportunityLifecycle.LifecycleStatus.VERIFIED,
            ]
        ).select_related("source")[:limit * 2]

        results = []
        for opp in opps:
            try:
                assessment = self.assess(startup, opp, persist=True)
                results.append(assessment)
            except Exception as exc:
                logger.error("[readiness] failed %s: %s", opp.slug, exc, exc_info=True)

        results.sort(key=lambda a: -a.readiness_pct)
        return results[:limit]

    # -----------------------------------------------------------------------
    # Check runners
    # -----------------------------------------------------------------------

    def _run_checks(
        self, startup: Any, opp: OpportunityLifecycle
    ) -> List[Dict[str, Any]]:
        """
        Run all requirement checks against the startup profile.
        Returns list of check dicts with keys:
          description, is_blocking, met, hint, is_strength, weight
        """
        checks = []

        # 1. Deadline check (hard blocker)
        checks.append(self._check_deadline(opp))

        # 2. Geography
        checks.append(self._check_geography(startup, opp))

        # 3. Stage
        checks.append(self._check_stage(startup, opp))

        # 4. Sector
        checks.append(self._check_sector(startup, opp))

        # 5. Team size (soft if known)
        checks.append(self._check_team_size(startup, opp))

        # 6. Revenue requirement
        checks.append(self._check_revenue(startup, opp))

        # 7. Product maturity
        checks.append(self._check_product_maturity(startup, opp))

        # 8. Evidence / data room
        checks.append(self._check_evidence(startup, opp))

        # 9. Incorporation
        checks.append(self._check_incorporation(startup, opp))

        # 10. OpportunityRequirement model records (from extraction)
        model_reqs = OpportunityRequirement.objects.filter(opportunity=opp)
        for req in model_reqs:
            checks.append(self._check_model_requirement(startup, req))

        return [c for c in checks if c is not None]

    def _check_deadline(self, opp: OpportunityLifecycle) -> Dict[str, Any]:
        if opp.is_rolling:
            return self._met("Rolling applications - apply any time", weight=2.0, is_strength=True)

        if opp.lifecycle_status == OpportunityLifecycle.LifecycleStatus.CLOSED:
            return self._blocked(
                "Applications are currently closed",
                hint="Monitor for next cohort announcement",
                weight=3.0,
            )

        if opp.application_deadline:
            today = datetime.date.today()
            days  = (opp.application_deadline - today).days
            if days < 0:
                return self._blocked(
                    f"Deadline passed ({opp.application_deadline})",
                    hint="Apply to the next cohort cycle",
                    weight=3.0,
                )
            if days <= 7:
                return self._soft_gap(
                    f"Deadline in {days} day(s) - extremely tight window",
                    hint="Submit immediately if you qualify",
                    weight=2.0,
                )
            if days <= 21:
                return self._met(
                    f"Deadline in {days} days - act now",
                    weight=2.0, is_strength=False,
                )
            return self._met(f"Deadline: {opp.application_deadline} ({days} days)", weight=1.0)

        # Unknown deadline
        return self._soft_gap(
            "Application deadline not yet confirmed",
            hint="Check official program page for deadline update",
            weight=1.0,
        )

    def _check_geography(self, startup: Any, opp: OpportunityLifecycle) -> Dict[str, Any]:
        if opp.is_global:
            return self._met("Geography: Open globally", is_strength=True)

        location = (getattr(startup, "location", "") or "").lower()
        geos = [g.lower() for g in (opp.target_geographies or [])]

        if not geos:
            return self._met("Geography: No restriction specified")

        if any("global" in g or "pan-africa" in g or "pan africa" in g for g in geos):
            return self._met("Geography: Pan-Africa / Global eligible", is_strength=True)

        if location and any(g in location or location in g for g in geos):
            return self._met(f"Geography: {startup.location} is eligible", is_strength=True)

        if not location:
            return self._soft_gap(
                "Location not set on profile",
                hint="Add your startup location to verify geographic eligibility",
                weight=1.5,
            )

        target_display = ", ".join(opp.target_geographies[:3])
        return self._blocked(
            f"Geographic mismatch: {startup.location or 'unknown'} vs required {target_display}",
            hint=f"This program targets {target_display}. Consider programs open to your region.",
            weight=2.5,
        )

    def _check_stage(self, startup: Any, opp: OpportunityLifecycle) -> Dict[str, Any]:
        stages = [s.lower() for s in (opp.target_stages or [])]
        if not stages or "all" in stages:
            return self._met("Stage: No restriction", is_strength=True)

        startup_stage = (getattr(startup, "funding_stage", "") or "pre_seed").lower()

        if startup_stage in stages:
            return self._met(
                f"Stage: {startup_stage.replace('_',' ').title()} matches",
                is_strength=True,
            )

        # Adjacent stages are soft gaps not hard blockers
        adjacent = {
            "pre_seed": ["seed"],
            "seed":     ["pre_seed", "series_a"],
            "series_a": ["seed"],
        }
        if startup_stage in adjacent.get(stages[0], []):
            return self._soft_gap(
                f"Stage: {startup_stage} is adjacent to target {stages[0]} - may still qualify",
                hint="Apply anyway with a strong growth trajectory - some programs accept adjacent stages",
                weight=1.5,
            )

        return self._blocked(
            f"Stage mismatch: you are {startup_stage}, program targets {', '.join(stages)}",
            hint="Focus on programs matching your current stage",
            weight=2.0,
        )

    def _check_sector(self, startup: Any, opp: OpportunityLifecycle) -> Dict[str, Any]:
        sectors = [s.lower() for s in (opp.target_sectors or [])]
        if not sectors or "all" in sectors:
            return self._met("Sector: All sectors eligible", is_strength=True)

        industry = (getattr(startup, "industry", "") or "").lower()
        if not industry:
            return self._soft_gap(
                "Industry not set on profile",
                hint="Add your startup industry to verify sector eligibility",
                weight=1.0,
            )

        if any(industry in s or s in industry for s in sectors):
            return self._met(f"Sector: {industry} is targeted", is_strength=True)

        # Fuzzy match
        related = {
            "fintech": ["fin", "pay", "bank", "insurance"],
            "healthtech": ["health", "med", "pharma", "wellness"],
            "edtech": ["edu", "learn", "training", "school"],
            "cleantech": ["clean", "energy", "solar", "climate", "green"],
            "b2b_saas": ["saas", "b2b", "enterprise"],
        }
        for canonical, keywords in related.items():
            if canonical in sectors or any(kw in s for s in sectors for kw in keywords):
                if any(kw in industry for kw in keywords):
                    return self._soft_gap(
                        f"Sector: {industry} is adjacent to targeted {canonical}",
                        hint="Apply if your product serves the target sector use case",
                        weight=1.0,
                    )

        return self._blocked(
            f"Sector mismatch: {industry} vs required {', '.join(sectors[:3])}",
            hint="Focus on programs targeting your sector",
            weight=1.5,
        )

    def _check_team_size(self, startup: Any, opp: OpportunityLifecycle) -> Optional[Dict[str, Any]]:
        founders = getattr(startup, "founder_count", None) or getattr(startup, "team_size", None)
        if founders is None:
            return None   # unknown - skip check

        # Accelerators typically want 2+ founders
        if opp.opportunity_type == OpportunityLifecycle.OpportunityType.ACCELERATOR:
            if founders >= 2:
                return self._met(f"Team: {founders} founders (meets typical minimum)", is_strength=True)
            return self._soft_gap(
                f"Team size: {founders} founder - many accelerators prefer 2+",
                hint="Consider bringing on a co-founder before applying",
                weight=1.5,
            )
        return None

    def _check_revenue(self, startup: Any, opp: OpportunityLifecycle) -> Optional[Dict[str, Any]]:
        mrr = getattr(startup, "monthly_revenue", None) or getattr(startup, "mrr_usd", None)
        stage = (getattr(startup, "funding_stage", "") or "pre_seed").lower()

        # Pre-seed funds generally don't require revenue
        pre_rev_stages = ["pre_seed", "idea"]
        if stage in pre_rev_stages:
            return None

        # Seed stage with seed fund - check if revenue is expected
        if opp.opportunity_type in (
            OpportunityLifecycle.OpportunityType.SEED_FUND,
            OpportunityLifecycle.OpportunityType.SERIES_A_FUND,
        ):
            if mrr is not None and mrr > 0:
                return self._met(f"Revenue: ${mrr:,.0f}/mo MRR verified", is_strength=True)
            if mrr == 0 or mrr is None:
                return self._soft_gap(
                    "No revenue recorded - seed funds typically require early traction",
                    hint="Document any pilot customers, LOIs, or pre-revenue traction",
                    weight=1.5,
                )
        return None

    def _check_product_maturity(self, startup: Any, opp: OpportunityLifecycle) -> Optional[Dict[str, Any]]:
        # Check maturity_assessments if available
        maturity = getattr(startup, "maturity_assessments", None)
        if maturity is None:
            return None

        latest = None
        try:
            latest = maturity.order_by("-assessed_at").first()
        except Exception:
            return None

        if latest is None:
            return self._soft_gap(
                "No product maturity assessment on record",
                hint="Complete your product maturity assessment in your startup profile",
                weight=1.0,
            )

        score = getattr(latest, "product_score", None)
        if score is None:
            return None

        if opp.opportunity_type == OpportunityLifecycle.OpportunityType.ACCELERATOR and score < 50:
            return self._soft_gap(
                f"Product maturity score ({score:.0f}/100) is below accelerator expectations",
                hint="Strengthen your MVP or prototype before applying",
                weight=1.5,
            )
        return self._met(
            f"Product maturity score: {score:.0f}/100",
            is_strength=score >= 70,
        )

    def _check_evidence(self, startup: Any, opp: OpportunityLifecycle) -> Optional[Dict[str, Any]]:
        ev = getattr(startup, "evidence_records", None)
        if ev is None:
            return None

        try:
            count = ev.count()
        except Exception:
            return None

        reqs = opp.evidence_requirements or []
        if not reqs:
            return None

        if count >= 3:
            return self._met(
                f"Evidence data room: {count} verified records",
                is_strength=True,
            )
        if count == 0:
            return self._soft_gap(
                "No evidence records in data room",
                hint=f"Upload: {', '.join(reqs[:3])}",
                weight=1.5,
            )
        return self._soft_gap(
            f"Evidence data room: {count} record(s) - more recommended",
            hint=f"Add: {', '.join(reqs[:2])}",
            weight=1.0,
        )

    def _check_incorporation(self, startup: Any, opp: OpportunityLifecycle) -> Optional[Dict[str, Any]]:
        incorporated = getattr(startup, "is_incorporated", None)
        if incorporated is None:
            return None
        if incorporated:
            return self._met("Incorporated entity confirmed", is_strength=True)
        # Grants and funds often require incorporation
        if opp.opportunity_type in (
            OpportunityLifecycle.OpportunityType.GRANT,
            OpportunityLifecycle.OpportunityType.SEED_FUND,
        ):
            return self._soft_gap(
                "Not yet incorporated",
                hint="Incorporate before submitting - most grant and fund programs require a legal entity",
                weight=2.0,
            )
        return None

    def _check_model_requirement(
        self, startup: Any, req: OpportunityRequirement
    ) -> Optional[Dict[str, Any]]:
        """
        Check a model-level OpportunityRequirement against the startup profile.
        Uses constraint_key for programmatic checks where possible.
        """
        key = req.constraint_key or ""
        val = req.constraint_value

        if key == "min_mrr_usd" and val is not None:
            mrr = getattr(startup, "monthly_revenue", None) or 0
            if mrr >= float(val):
                return self._met(f"Revenue: ${mrr:,.0f} MRR meets minimum ${val:,.0f}", is_strength=True)
            return self._blocked(
                f"Below revenue minimum: ${mrr:,.0f} MRR vs required ${val:,.0f}",
                hint=f"Grow MRR to ${val:,.0f} before applying",
                weight=req.weight * (2.0 if req.is_blocking else 1.0),
            )

        if key == "min_founders" and val is not None:
            count = getattr(startup, "founder_count", 1) or 1
            if count >= int(val):
                return self._met(f"Team: {count} founder(s) meets minimum {val}", is_strength=True)
            return self._soft_gap(
                f"Team size: {count} founder(s), minimum required: {val}",
                hint="Consider bringing on a co-founder",
                weight=req.weight,
            )

        if key == "geography_match" and val:
            location = (getattr(startup, "location", "") or "").lower()
            required = str(val).lower()
            if required in location or location in required:
                return self._met(f"Location meets requirement: {val}", is_strength=True)
            if req.is_blocking:
                return self._blocked(
                    req.description,
                    hint=f"Required geography: {val}",
                    weight=req.weight,
                )
            return self._soft_gap(
                req.description,
                hint=f"Required geography: {val}",
                weight=req.weight,
            )

        # Generic: return as soft gap (we can't auto-evaluate)
        return self._soft_gap(
            req.description,
            hint="Verify this requirement against your current profile",
            weight=req.weight,
        )

    # -----------------------------------------------------------------------
    # Scoring
    # -----------------------------------------------------------------------

    def _compute_readiness_pct(self, checks: List[Dict[str, Any]]) -> float:
        if not checks:
            return 0.0

        total_weight  = sum(c.get("weight", 1.0) for c in checks)
        earned_weight = sum(
            c.get("weight", 1.0) for c in checks if c.get("met")
        )
        # Hard blockers penalize heavily
        blocker_penalty = sum(
            c.get("weight", 1.0) * 0.5
            for c in checks
            if c.get("is_blocking") and not c.get("met")
        )

        if total_weight == 0:
            return 0.0

        raw = (earned_weight / total_weight) * 100 - blocker_penalty * 10
        return round(max(0.0, min(100.0, raw)), 1)

    def _compute_verdict(self, a: ReadinessAssessment) -> str:
        if a.hard_blockers >= 2:
            return "disqualified"
        if a.hard_blockers == 1:
            return "not_ready"
        if a.readiness_pct >= 80:
            return "ready"
        if a.readiness_pct >= 55:
            return "nearly_ready"
        return "not_ready"

    def _build_action_plan(
        self,
        blockers: List[Dict],
        soft_gaps: List[Dict],
    ) -> List[str]:
        """Priority-ordered action list."""
        actions: List[str] = []
        for item in blockers:
            hint = item.get("hint", "")
            if hint:
                actions.append(f"[REQUIRED] {hint}")
        for item in soft_gaps[:3]:
            hint = item.get("hint", "")
            if hint:
                actions.append(f"[RECOMMENDED] {hint}")
        return actions[:6]

    # -----------------------------------------------------------------------
    # Persistence
    # -----------------------------------------------------------------------

    def _persist(
        self, assessment: ReadinessAssessment, opp: OpportunityLifecycle
    ) -> None:
        try:
            StartupReadinessScore.objects.update_or_create(
                startup_id=assessment.startup_id,
                opportunity=opp,
                defaults={
                    "readiness_pct":      assessment.readiness_pct,
                    "hard_blockers":      assessment.hard_blockers,
                    "soft_gaps":          assessment.soft_gaps,
                    "met_requirements":   assessment.met_requirements,
                    "total_requirements": assessment.total_requirements,
                    "strengths":          assessment.strengths,
                    "blockers":           [b["requirement"] for b in assessment.blockers],
                    "soft_gap_list":      [s["requirement"] for s in assessment.soft_gap_list],
                    "recommended_actions": assessment.recommended_actions,
                    "verdict":            assessment.verdict,
                },
            )
        except Exception as exc:
            logger.error("[readiness] persist failed: %s", exc)

    def _persist_blockers(
        self,
        assessment: ReadinessAssessment,
        opp: OpportunityLifecycle,
        gaps: List[Dict],
    ) -> None:
        try:
            # Clear stale blockers first
            ReadinessBlocker.objects.filter(
                opportunity=opp,
                startup_id=assessment.startup_id,
            ).delete()

            for gap in gaps[:10]:
                ReadinessBlocker.objects.create(
                    opportunity=opp,
                    startup_id=assessment.startup_id,
                    requirement_type=ReadinessBlocker.BlockerType.OTHER,
                    description=gap.get("description", "")[:500],
                    is_blocking=gap.get("is_blocking", False),
                    resolution_hint=gap.get("hint", "")[:500],
                    weight=gap.get("weight", 1.0),
                )
        except Exception as exc:
            logger.error("[readiness] persist_blockers failed: %s", exc)

    # -----------------------------------------------------------------------
    # Check builders
    # -----------------------------------------------------------------------

    @staticmethod
    def _met(description: str, weight: float = 1.0, is_strength: bool = False) -> Dict:
        return {
            "description": description, "met": True, "is_blocking": False,
            "weight": weight, "hint": "", "is_strength": is_strength,
        }

    @staticmethod
    def _blocked(description: str, hint: str, weight: float = 2.0) -> Dict:
        return {
            "description": description, "met": False, "is_blocking": True,
            "weight": weight, "hint": hint, "is_strength": False,
        }

    @staticmethod
    def _soft_gap(description: str, hint: str, weight: float = 1.0) -> Dict:
        return {
            "description": description, "met": False, "is_blocking": False,
            "weight": weight, "hint": hint, "is_strength": False,
        }
