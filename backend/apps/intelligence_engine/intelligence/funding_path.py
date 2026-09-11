"""
apps.intelligence_engine.intelligence.funding_path
===================================================
FundingPathEngine - builds a startup-specific multi-step financing pathway.

Instead of showing a flat list of 500 opportunities, Pitchmic builds:

         NOW
          │
       Startup
          │
     Pre-seed stage
          │
   ┌──────┴──────┐
   ↓             ↓
Antler NG    Future Africa
(3 mo)       (6 mo)
   │             │
   └──────┬──────┘
          ↓
     Seed stage
          │
   ┌──────┴──────┐
   ↓             ↓
YC W2027     Techstars
(12 mo)      (14 mo)
          │
          ↓
     Series A
          │
      VC Fund Y

Algorithm:
  1. Load all active OpportunityLifecycle records
  2. Compute ReadinessScore for each (via ReadinessEngine)
  3. Score: match_score × readiness_weight × timing_weight × funding_fit
  4. Build ordered path: best opportunity per stage, ordered by timeline
  5. Persist as FundingPath + FundingPathStep records
"""
from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Dict, List, Optional

from django.utils import timezone

from apps.intelligence_engine.models_opportunities import (
    FundingPath,
    FundingPathStep,
    OpportunityLifecycle,
    StartupReadinessScore,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stage ordering for path construction
# ---------------------------------------------------------------------------
_STAGE_ORDER = {
    "idea":     0,
    "pre_seed": 1,
    "seed":     2,
    "series_a": 3,
    "series_b": 4,
    "all":      1,   # treat "all" as early-stage compatible
}

_COMPATIBLE_STAGES: Dict[str, List[str]] = {
    "pre_seed": ["pre_seed", "seed", "all"],
    "seed":     ["seed", "series_a", "all"],
    "series_a": ["series_a", "series_b", "all"],
    "idea":     ["pre_seed", "all"],
}

_STAGE_LABEL = {
    "pre_seed": "Pre-Seed",
    "seed":     "Seed",
    "series_a": "Series A",
    "series_b": "Series B+",
    "all":      "Any Stage",
}

# Maximum funding path steps to show
_MAX_PATH_STEPS = 6

# Minimum readiness to include in the path (0–100%)
_MIN_READINESS_FOR_PATH = 30.0

# Funding fit: startup raise target within this multiplier of opportunity range
_FUNDING_FIT_TOLERANCE = 2.5


@dataclass
class PathCandidate:
    opportunity:      OpportunityLifecycle
    readiness_pct:    float
    match_score:      float         # 0–100 composite
    timing_score:     float         # 0–1.0 based on deadline proximity
    funding_fit:      float         # 0–1.0 based on raise target vs opp range
    overall_score:    float         # final ranking score
    months_from_now:  int
    rationale:        str


# ---------------------------------------------------------------------------
# FundingPathEngine
# ---------------------------------------------------------------------------

class FundingPathEngine:
    """
    Builds and persists a startup-specific FundingPath with ordered steps.
    """

    def build_path(
        self,
        startup_id: Any,
        startup_name: str,
        current_stage: str,
        startup_sector: str,
        startup_geography: str,
        target_raise_usd: Optional[int] = None,
        horizon_months: int = 18,
        label: str = "",
    ) -> FundingPath:
        """
        Build a FundingPath for the given startup profile.
        Persists FundingPath + FundingPathStep records.
        Returns the FundingPath instance.
        """
        candidates = self._score_candidates(
            current_stage=current_stage,
            startup_sector=startup_sector,
            startup_geography=startup_geography,
            target_raise_usd=target_raise_usd,
            horizon_months=horizon_months,
            startup_id=startup_id,
        )

        # Deactivate previous paths for this startup
        FundingPath.objects.filter(startup_id=startup_id, is_active=True).update(is_active=False)

        path = FundingPath.objects.create(
            startup_id=startup_id,
            startup_name=startup_name,
            path_label=label or f"{current_stage.replace('_',' ').title()} Pathway",
            total_steps=min(len(candidates), _MAX_PATH_STEPS),
            total_potential_usd=sum(
                int(c.opportunity.funding_max_usd or 0)
                for c in candidates[:_MAX_PATH_STEPS]
            ),
            horizon_months=horizon_months,
            is_active=True,
        )

        for i, candidate in enumerate(candidates[:_MAX_PATH_STEPS], start=1):
            FundingPathStep.objects.create(
                path=path,
                step_number=i,
                opportunity=candidate.opportunity,
                opportunity_title=candidate.opportunity.title,
                opportunity_type=candidate.opportunity.opportunity_type,
                estimated_funding_usd=int(
                    candidate.opportunity.funding_max_usd or 0
                ),
                estimated_months_from_now=candidate.months_from_now,
                match_score=round(candidate.match_score, 1),
                readiness_pct=round(candidate.readiness_pct, 1),
                rationale=candidate.rationale,
            )

        logger.info(
            "[funding_path] built path for %s (%s): %d steps, potential=$%s",
            startup_name, current_stage, path.total_steps, path.total_potential_usd,
        )
        return path

    def get_path(self, startup_id: Any) -> Optional[FundingPath]:
        return (
            FundingPath.objects.filter(startup_id=startup_id, is_active=True)
            .prefetch_related("steps__opportunity")
            .order_by("-computed_at")
            .first()
        )

    def path_to_dict(self, path: FundingPath) -> Dict[str, Any]:
        steps = []
        for step in path.steps.all().order_by("step_number"):
            opp = step.opportunity
            steps.append({
                "step":                    step.step_number,
                "opportunity_id":          str(opp.id) if opp else "",
                "title":                   step.opportunity_title,
                "type":                    step.opportunity_type,
                "status":                  opp.lifecycle_status if opp else "unknown",
                "funding_max_usd":         step.estimated_funding_usd,
                "deadline":                (
                    opp.application_deadline.isoformat()
                    if opp and opp.application_deadline else None
                ),
                "estimated_months_away":   step.estimated_months_from_now,
                "match_score":             step.match_score,
                "readiness_pct":           step.readiness_pct,
                "rationale":               step.rationale,
                "application_url":         opp.application_url if opp else "",
                "freshness_score":         opp.freshness_score if opp else 0,
                "freshness_label":         opp.freshness_label if opp else "unknown",
            })
        return {
            "path_id":              str(path.id),
            "startup_id":           str(path.startup_id),
            "startup_name":         path.startup_name,
            "label":                path.path_label,
            "total_steps":          path.total_steps,
            "total_potential_usd":  path.total_potential_usd,
            "horizon_months":       path.horizon_months,
            "computed_at":          path.computed_at.isoformat(),
            "steps":                steps,
        }

    # -----------------------------------------------------------------------
    # Candidate scoring
    # -----------------------------------------------------------------------

    def _score_candidates(
        self,
        current_stage: str,
        startup_sector: str,
        startup_geography: str,
        target_raise_usd: Optional[int],
        horizon_months: int,
        startup_id: Any,
    ) -> List[PathCandidate]:
        today = datetime.date.today()
        compatible = _COMPATIBLE_STAGES.get(current_stage.lower(), ["all"])

        active_opps = OpportunityLifecycle.objects.filter(
            lifecycle_status__in=[
                OpportunityLifecycle.LifecycleStatus.OPEN,
                OpportunityLifecycle.LifecycleStatus.ROLLING,
                OpportunityLifecycle.LifecycleStatus.OPENING_SOON,
                OpportunityLifecycle.LifecycleStatus.DEADLINE_APPROACHING,
                OpportunityLifecycle.LifecycleStatus.VERIFIED,
            ]
        ).select_related("source")

        candidates: List[PathCandidate] = []

        for opp in active_opps:
            # Stage filter
            opp_stages = [s.lower() for s in (opp.target_stages or [])]
            if opp_stages and "all" not in opp_stages:
                if not any(s in compatible for s in opp_stages):
                    continue

            # Compute component scores
            sector_score = self._sector_score(startup_sector, opp)
            geo_score    = self._geo_score(startup_geography, opp)
            funding_fit  = self._funding_fit(target_raise_usd, opp)
            timing_score, months_away = self._timing_score(opp, today, horizon_months)

            # Skip opportunities beyond the horizon
            if months_away > horizon_months:
                continue

            # Load readiness if pre-computed
            readiness_pct = self._get_readiness(startup_id, opp)

            if readiness_pct < _MIN_READINESS_FOR_PATH:
                continue

            # Composite match score (0–100)
            match_score = (
                sector_score  * 0.30 +
                geo_score     * 0.25 +
                funding_fit   * 0.20 +
                readiness_pct * 0.15 +
                timing_score  * 0.10
            )

            overall = match_score * 0.75 + timing_score * 25.0

            rationale = self._build_rationale(
                opp, sector_score, geo_score, funding_fit,
                readiness_pct, timing_score, months_away,
            )

            candidates.append(PathCandidate(
                opportunity=opp,
                readiness_pct=readiness_pct,
                match_score=match_score,
                timing_score=timing_score,
                funding_fit=funding_fit,
                overall_score=overall,
                months_from_now=months_away,
                rationale=rationale,
            ))

        # Sort by overall score descending, then by timeline
        candidates.sort(key=lambda c: (-c.overall_score, c.months_from_now))

        # Deduplicate: prefer one step per primary stage bucket
        return self._deduplicate_path(candidates, current_stage)

    def _sector_score(self, startup_sector: str, opp: OpportunityLifecycle) -> float:
        sectors = [s.lower() for s in (opp.target_sectors or [])]
        if "all" in sectors:
            return 90.0
        sec = startup_sector.lower()
        if any(sec in s or s in sec for s in sectors):
            return 95.0
        # Fuzzy match: fintech → fin, saas → saas
        related = {
            "fintech": ["fin", "pay", "bank"],
            "healthtech": ["health", "med"],
            "edtech": ["edu", "learn"],
            "cleantech": ["clean", "energy", "climate"],
            "b2b_saas": ["saas", "b2b"],
        }
        for sector_key, keywords in related.items():
            if sector_key in sec or any(kw in sec for kw in keywords):
                if any(sector_key in s or any(kw in s for kw in keywords) for s in sectors):
                    return 80.0
        return 50.0

    def _geo_score(self, startup_geography: str, opp: OpportunityLifecycle) -> float:
        if opp.is_global:
            return 100.0
        geos = [g.lower() for g in (opp.target_geographies or [])]
        if not geos:
            return 80.0
        geo = startup_geography.lower()
        if any(geo in g or g in geo for g in geos):
            return 100.0
        if any(g in ("global", "pan-africa", "pan africa", "worldwide") for g in geos):
            return 95.0
        return 60.0

    def _funding_fit(self, target_raise: Optional[int], opp: OpportunityLifecycle) -> float:
        if not target_raise:
            return 70.0
        lo = float(opp.funding_min_usd or 0)
        hi = float(opp.funding_max_usd or 0)
        if lo == 0 and hi == 0:
            return 70.0
        if lo <= target_raise <= hi:
            return 100.0
        if hi > 0 and target_raise <= hi * _FUNDING_FIT_TOLERANCE:
            return 75.0
        if lo > 0 and target_raise >= lo / _FUNDING_FIT_TOLERANCE:
            return 75.0
        return 40.0

    def _timing_score(
        self, opp: OpportunityLifecycle, today: datetime.date, horizon_months: int
    ) -> tuple[float, int]:
        """Returns (timing_score 0–100, months_from_now)."""
        if opp.is_rolling or opp.lifecycle_status == OpportunityLifecycle.LifecycleStatus.ROLLING:
            return 85.0, 1   # rolling = always available, ~1 month timeline

        deadline = opp.application_deadline
        if not deadline:
            # No deadline known - assume it's upcoming within horizon
            return 60.0, int(horizon_months * 0.5)

        days_left = (deadline - today).days
        if days_left < 0:
            return 0.0, 999  # closed

        months_left = max(1, days_left // 30)

        if days_left <= 21:
            return 95.0, months_left     # closing soon - high urgency
        if days_left <= 60:
            return 85.0, months_left
        if days_left <= 120:
            return 75.0, months_left
        return 60.0, months_left

    def _get_readiness(self, startup_id: Any, opp: OpportunityLifecycle) -> float:
        """Load pre-computed readiness or default to 60%."""
        try:
            score = StartupReadinessScore.objects.get(
                startup_id=startup_id, opportunity=opp
            )
            return score.readiness_pct
        except StartupReadinessScore.DoesNotExist:
            return 60.0

    def _deduplicate_path(
        self, candidates: List[PathCandidate], current_stage: str
    ) -> List[PathCandidate]:
        """
        Keep at most 2 candidates per opportunity_type to ensure path diversity.
        Rolling funds count once.
        """
        type_counts: Dict[str, int] = {}
        seen_ids: set = set()
        result: List[PathCandidate] = []

        for c in candidates:
            opp_id = str(c.opportunity.id)
            if opp_id in seen_ids:
                continue
            opp_type = c.opportunity.opportunity_type
            count = type_counts.get(opp_type, 0)
            if count >= 2:
                continue
            type_counts[opp_type] = count + 1
            seen_ids.add(opp_id)
            result.append(c)
            if len(result) >= _MAX_PATH_STEPS:
                break

        return result

    def _build_rationale(
        self,
        opp: OpportunityLifecycle,
        sector_score: float,
        geo_score: float,
        funding_fit: float,
        readiness_pct: float,
        timing_score: float,
        months_away: int,
    ) -> str:
        parts = []
        if sector_score >= 90:
            parts.append("sector match")
        if geo_score >= 95:
            parts.append("geography eligible")
        if funding_fit >= 90:
            parts.append("funding range fit")
        if readiness_pct >= 80:
            parts.append("high application readiness")
        elif readiness_pct >= 60:
            parts.append("moderate readiness")
        if opp.is_rolling:
            parts.append("rolling applications")
        elif months_away <= 2:
            parts.append("deadline approaching - apply now")
        elif months_away <= 6:
            parts.append(f"deadline in ~{months_away} months")

        freshness = opp.freshness_label
        if freshness == "verified_fresh":
            parts.append("live-verified data")
        elif freshness == "stale":
            parts.append("data may be stale - verify deadline")

        return "; ".join(parts) if parts else "Matched on overall profile"
