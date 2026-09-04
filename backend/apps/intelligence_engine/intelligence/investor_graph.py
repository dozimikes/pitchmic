"""
apps.intelligence_engine.intelligence.investor_graph
=====================================================
InvestorIntelligenceEngine — computes investor behavior intelligence.

Core distinction:
  InvestorThesis  = what an investor SAYS they invest in
  ObservedInvestment = what they ACTUALLY did

Pitchmic computes thesis_alignment_pct from both, so founders get a
reliable signal rather than self-reported marketing copy.

Outputs per investor:
  - thesis_alignment_pct   (observed vs stated)
  - momentum_score         (velocity + recency + consistency 0–100)
  - sector distribution    (actual deal counts, not stated)
  - geography distribution (actual deal counts)
  - stage distribution
  - average check size
  - lead vs follow ratio
  - co-investor clusters
  - recent activity flag
"""
from __future__ import annotations

import datetime
import logging
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from django.db.models import Avg, Count, Q
from django.utils import timezone

from apps.intelligence_engine.models_entities import (
    FundingRound,
    Investment,
    InvestorThesis,
    ObservedInvestment,
    Organization,
    PortfolioRelationship,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DTOs
# ---------------------------------------------------------------------------

@dataclass
class InvestorProfile:
    """Computed intelligence profile for a single investor organization."""
    organization_id: str
    organization_name: str
    org_type: str

    # Stated thesis
    stated_sectors: List[str] = field(default_factory=list)
    stated_geographies: List[str] = field(default_factory=list)
    stated_stages: List[str] = field(default_factory=list)
    stated_check_min: Optional[int] = None
    stated_check_max: Optional[int] = None

    # Observed behavior (derived from Investment records)
    observed_sector_dist: Dict[str, int] = field(default_factory=dict)
    observed_geo_dist: Dict[str, int] = field(default_factory=dict)
    observed_stage_dist: Dict[str, int] = field(default_factory=dict)
    observed_avg_check_usd: Optional[int] = None
    total_observed_deals: int = 0
    deals_last_12_months: int = 0
    deals_last_24_months: int = 0
    lead_deal_count: int = 0
    follow_deal_count: int = 0

    # Computed intelligence scores
    thesis_alignment_pct: float = 0.0
    momentum_score: float = 0.0        # 0–100
    activity_recency_score: float = 0.0
    sector_consistency_score: float = 0.0
    geographic_focus_score: float = 0.0

    # Labels
    activity_label: str = "unknown"    # "highly_active" | "active" | "moderate" | "inactive"
    lead_or_follow: str = "unknown"    # "lead" | "follow" | "both"

    # Co-investors (top 5 by shared deal count)
    top_co_investors: List[Dict[str, Any]] = field(default_factory=list)

    # Portfolio companies (recent)
    recent_portfolio: List[Dict[str, str]] = field(default_factory=list)

    computed_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__


@dataclass
class CoInvestorCluster:
    """Group of investors who frequently co-invest together."""
    anchor_investor: str
    cluster_members: List[Dict[str, Any]] = field(default_factory=list)
    shared_sectors: List[str] = field(default_factory=list)
    shared_geographies: List[str] = field(default_factory=list)
    cluster_strength: float = 0.0   # 0–1.0

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__


# ---------------------------------------------------------------------------
# InvestorIntelligenceEngine
# ---------------------------------------------------------------------------

class InvestorIntelligenceEngine:
    """
    Computes investor intelligence from Investment + InvestorThesis records.

    Key methods:
      build_investor_profile(org)    → InvestorProfile
      compute_thesis_alignment(org)  → float
      compute_momentum_score(org)    → float
      find_co_investors(org, top_n)  → List[CoInvestorCluster]
      rank_investors_for_startup(startup_profile) → ranked list
      recompute_all()                → bulk update InvestorThesis records
    """

    def build_investor_profile(self, org: Organization) -> InvestorProfile:
        """Build a full InvestorProfile for an organization."""
        now_str = timezone.now().isoformat()

        profile = InvestorProfile(
            organization_id=str(org.id),
            organization_name=org.name,
            org_type=org.org_type,
            computed_at=now_str,
        )

        # Load stated thesis
        try:
            thesis = org.stated_thesis
            profile.stated_sectors     = thesis.stated_sectors or []
            profile.stated_geographies = thesis.stated_geographies or []
            profile.stated_stages      = thesis.stated_stages or []
            profile.stated_check_min   = thesis.stated_check_min
            profile.stated_check_max   = thesis.stated_check_max
        except InvestorThesis.DoesNotExist:
            pass

        # Observed investments
        observed = ObservedInvestment.objects.filter(organization=org).order_by("-announced_date")
        profile.total_observed_deals = observed.count()

        if profile.total_observed_deals == 0:
            return profile

        cutoff_12 = (timezone.now() - datetime.timedelta(days=365)).date()
        cutoff_24 = (timezone.now() - datetime.timedelta(days=730)).date()

        profile.deals_last_12_months = observed.filter(
            announced_date__gte=cutoff_12
        ).count()
        profile.deals_last_24_months = observed.filter(
            announced_date__gte=cutoff_24
        ).count()

        # Distributions
        sector_counts:  Counter = Counter()
        geo_counts:     Counter = Counter()
        stage_counts:   Counter = Counter()
        amounts:        List[int] = []

        for obs in observed:
            if obs.startup_sector:
                sector_counts[obs.startup_sector.lower()] += 1
            if obs.startup_geography:
                geo_counts[obs.startup_geography.lower()] += 1
            if obs.startup_stage:
                stage_counts[obs.startup_stage.lower()] += 1
            if obs.amount_usd:
                amounts.append(obs.amount_usd)

        profile.observed_sector_dist = dict(sector_counts.most_common(15))
        profile.observed_geo_dist    = dict(geo_counts.most_common(15))
        profile.observed_stage_dist  = dict(stage_counts.most_common(10))
        profile.observed_avg_check_usd = (
            int(sum(amounts) / len(amounts)) if amounts else None
        )

        # Lead vs follow
        investments = Investment.objects.filter(investor=org)
        profile.lead_deal_count   = investments.filter(is_lead=True).count()
        profile.follow_deal_count = investments.filter(is_lead=False).count()
        total_inv = profile.lead_deal_count + profile.follow_deal_count
        if total_inv > 0:
            lead_ratio = profile.lead_deal_count / total_inv
            profile.lead_or_follow = (
                "lead" if lead_ratio >= 0.6
                else "follow" if lead_ratio <= 0.35
                else "both"
            )

        # Intelligence scores
        profile.thesis_alignment_pct    = self._compute_thesis_alignment(profile)
        profile.momentum_score          = self._compute_momentum(profile)
        profile.activity_recency_score  = self._compute_recency(profile)
        profile.sector_consistency_score = self._compute_sector_consistency(profile)
        profile.geographic_focus_score  = self._compute_geo_focus(profile)
        profile.activity_label          = self._activity_label(profile)

        # Top co-investors
        profile.top_co_investors = self._find_co_investors(org, top_n=5)

        # Recent portfolio (last 5 deals)
        profile.recent_portfolio = [
            {
                "company": obs.startup_name,
                "sector": obs.startup_sector,
                "stage": obs.startup_stage,
                "date": obs.announced_date.isoformat() if obs.announced_date else "",
            }
            for obs in observed.order_by("-announced_date")[:5]
        ]

        return profile

    # -----------------------------------------------------------------------
    # Thesis alignment
    # -----------------------------------------------------------------------

    def _compute_thesis_alignment(self, profile: InvestorProfile) -> float:
        """
        Alignment = what fraction of observed deals match stated thesis.
        Checks sector, geography, and stage simultaneously.
        Returns 0–100.
        """
        if profile.total_observed_deals == 0:
            return 0.0

        stated_sectors = {s.lower() for s in profile.stated_sectors}
        stated_geos    = {g.lower() for g in profile.stated_geographies}
        stated_stages  = {s.lower() for s in profile.stated_stages}

        # Global / "all" modifiers
        any_sector  = not stated_sectors or "all" in stated_sectors
        any_geo     = not stated_geos    or "global" in stated_geos or "pan-africa" in stated_geos
        any_stage   = not stated_stages  or "all" in stated_stages

        matching = 0
        total    = profile.total_observed_deals

        # Use ObservedInvestment records for alignment check
        observed = ObservedInvestment.objects.filter(
            organization_id=profile.organization_id
        )

        for obs in observed:
            sector_match = any_sector or any(
                s in obs.startup_sector.lower()
                for s in stated_sectors
                if obs.startup_sector
            )
            geo_match = any_geo or any(
                g in obs.startup_geography.lower()
                for g in stated_geos
                if obs.startup_geography
            )
            stage_match = any_stage or (obs.startup_stage.lower() in stated_stages)

            if sector_match and geo_match and stage_match:
                matching += 1

        return round((matching / total) * 100, 1) if total else 0.0

    # -----------------------------------------------------------------------
    # Momentum score (0–100)
    # -----------------------------------------------------------------------

    def _compute_momentum(self, profile: InvestorProfile) -> float:
        """
        Momentum = investment velocity + recency + consistency.

        Components:
          Velocity (40pts)  = deals in last 12 months vs historical average
          Recency  (35pts)  = how recently the last deal was
          Consistency (25pts) = how regular their cadence is
        """
        if profile.total_observed_deals == 0:
            return 0.0

        # Velocity (0–40): deals per year vs baseline of 4/yr
        deals_per_yr = profile.deals_last_12_months
        velocity = min(40.0, (deals_per_yr / 4.0) * 40.0)

        # Recency (0–35): based on deals in last 24 months
        recency = min(35.0, (profile.deals_last_24_months / 8.0) * 35.0)

        # Consistency (0–25): ratio of 12-month deals to 24-month deals
        if profile.deals_last_24_months > 0:
            cons_ratio = profile.deals_last_12_months / profile.deals_last_24_months
            consistency = min(25.0, cons_ratio * 25.0)
        else:
            consistency = 0.0

        raw = velocity + recency + consistency
        return round(min(100.0, raw), 1)

    def _compute_recency(self, profile: InvestorProfile) -> float:
        """Activity recency: 1.0 = very recent, 0.0 = no recent activity."""
        if profile.deals_last_12_months >= 6:
            return 1.0
        if profile.deals_last_12_months >= 3:
            return 0.80
        if profile.deals_last_12_months >= 1:
            return 0.55
        if profile.deals_last_24_months >= 1:
            return 0.30
        return 0.0

    def _compute_sector_consistency(self, profile: InvestorProfile) -> float:
        """
        Sector consistency: 1.0 = all deals in 1 sector, 0.0 = completely scattered.
        Uses HHI (Herfindahl-Hirschman Index) normalized to 0–1.
        """
        if not profile.observed_sector_dist:
            return 0.0
        total = sum(profile.observed_sector_dist.values())
        if total == 0:
            return 0.0
        hhi = sum((v / total) ** 2 for v in profile.observed_sector_dist.values())
        n   = len(profile.observed_sector_dist)
        hhi_norm = (hhi - 1 / n) / (1 - 1 / n) if n > 1 else 1.0
        return round(max(0.0, min(1.0, hhi_norm)), 3)

    def _compute_geo_focus(self, profile: InvestorProfile) -> float:
        """Geographic focus score using same HHI approach."""
        if not profile.observed_geo_dist:
            return 0.0
        total = sum(profile.observed_geo_dist.values())
        if total == 0:
            return 0.0
        hhi = sum((v / total) ** 2 for v in profile.observed_geo_dist.values())
        n   = len(profile.observed_geo_dist)
        hhi_norm = (hhi - 1 / n) / (1 - 1 / n) if n > 1 else 1.0
        return round(max(0.0, min(1.0, hhi_norm)), 3)

    def _activity_label(self, profile: InvestorProfile) -> str:
        m = profile.momentum_score
        if m >= 75:   return "highly_active"
        if m >= 50:   return "active"
        if m >= 25:   return "moderate"
        return "inactive"

    # -----------------------------------------------------------------------
    # Co-investor clusters
    # -----------------------------------------------------------------------

    def _find_co_investors(
        self, org: Organization, top_n: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Find investors who most frequently co-invest with this organization.
        Returns top_n by shared deal count.
        """
        # Get all rounds this investor participated in
        investor_round_ids = set(
            Investment.objects.filter(investor=org).values_list("round_id", flat=True)
        )
        if not investor_round_ids:
            return []

        # Find other investors in those same rounds
        co_inv_counts: Counter = Counter()
        co_inv_names: Dict[str, str] = {}

        co_investments = Investment.objects.filter(
            round_id__in=investor_round_ids
        ).exclude(investor=org).select_related("investor", "round")

        for inv in co_investments:
            inv_id = str(inv.investor_id)
            co_inv_counts[inv_id] += 1
            co_inv_names[inv_id] = inv.investor.name

        return [
            {
                "investor_id":   inv_id,
                "investor_name": co_inv_names[inv_id],
                "shared_deals":  count,
            }
            for inv_id, count in co_inv_counts.most_common(top_n)
        ]

    def find_co_investor_clusters(
        self, org: Organization, min_shared_deals: int = 2
    ) -> List[CoInvestorCluster]:
        """
        Build co-investor clusters: groups of investors that consistently
        co-invest with the anchor organization.
        """
        co_investors = self._find_co_investors(org, top_n=20)
        clusters: List[CoInvestorCluster] = []

        for co in co_investors:
            if co["shared_deals"] < min_shared_deals:
                continue
            try:
                co_org = Organization.objects.get(id=co["investor_id"])
            except Organization.DoesNotExist:
                continue

            # Find shared sectors and geographies
            shared_rounds = Investment.objects.filter(
                investor__in=[org, co_org]
            ).values_list("round_id", flat=True)

            # Get unique rounds where BOTH participated
            from django.db.models import Count as DjCount
            both_rounds = (
                Investment.objects.filter(round_id__in=shared_rounds)
                .values("round_id")
                .annotate(c=DjCount("id"))
                .filter(c__gte=2)
                .values_list("round_id", flat=True)
            )

            sector_counter:  Counter = Counter()
            geo_counter:     Counter = Counter()
            for r in FundingRound.objects.filter(id__in=both_rounds):
                if r.sector:
                    sector_counter[r.sector] += 1
                if r.geography:
                    geo_counter[r.geography] += 1

            cluster = CoInvestorCluster(
                anchor_investor=org.name,
                cluster_members=[co],
                shared_sectors=list(sector_counter.keys())[:5],
                shared_geographies=list(geo_counter.keys())[:5],
                cluster_strength=min(1.0, co["shared_deals"] / 10.0),
            )
            clusters.append(cluster)

        return clusters

    # -----------------------------------------------------------------------
    # Rank investors for a startup
    # -----------------------------------------------------------------------

    def rank_investors_for_startup(
        self,
        startup_sector: str,
        startup_geography: str,
        startup_stage: str,
        startup_raise_usd: Optional[int] = None,
        top_n: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Find the most relevant investors for a startup's profile.

        Scoring (100 pts):
          Observed sector match     : 30 pts
          Observed geography match  : 25 pts
          Observed stage match      : 20 pts
          Check size fit            : 15 pts
          Momentum / activity       : 10 pts
        """
        sector  = startup_sector.lower()
        geo     = startup_geography.lower()
        stage   = startup_stage.lower()

        # Filter investors with at least 1 observed investment
        orgs = Organization.objects.filter(
            org_type__in=["vc_firm", "accelerator", "corporate_vc", "angel"],
            observed_investments__isnull=False,
        ).distinct()

        results: List[Dict[str, Any]] = []

        for org in orgs:
            try:
                thesis = org.stated_thesis
            except InvestorThesis.DoesNotExist:
                thesis = None

            obs_qs = ObservedInvestment.objects.filter(organization=org)
            total  = obs_qs.count()
            if total == 0:
                continue

            # Observed sector score (30 pts)
            sector_deals = obs_qs.filter(startup_sector__icontains=sector).count()
            sector_score = min(30.0, (sector_deals / total) * 30.0 * 2)

            # Observed geography score (25 pts)
            geo_deals = obs_qs.filter(startup_geography__icontains=geo).count()
            # Also count Pan-Africa / Global as matching any African geo
            if "nigeria" in geo or "kenya" in geo or "africa" in geo:
                geo_deals += obs_qs.filter(
                    Q(startup_geography__icontains="pan-africa")
                    | Q(startup_geography__icontains="global")
                ).count()
            geo_score = min(25.0, (geo_deals / total) * 25.0 * 2)

            # Observed stage score (20 pts)
            stage_deals = obs_qs.filter(startup_stage__icontains=stage).count()
            stage_score = min(20.0, (stage_deals / total) * 20.0 * 2)

            # Check size fit (15 pts)
            check_score = 0.0
            if thesis and startup_raise_usd:
                mn = thesis.stated_check_min or 0
                mx = thesis.stated_check_max or 0
                if mn and mx and mn <= startup_raise_usd <= mx:
                    check_score = 15.0
                elif mn and startup_raise_usd >= mn * 0.5:
                    check_score = 8.0
                elif mx and startup_raise_usd <= mx * 1.5:
                    check_score = 8.0

            # Momentum score (10 pts)
            momentum_raw = thesis.momentum_score if thesis else 0.0
            momentum_pts = (momentum_raw / 100.0) * 10.0

            total_score = sector_score + geo_score + stage_score + check_score + momentum_pts

            if total_score < 10:
                continue

            results.append({
                "investor_id":       str(org.id),
                "investor_name":     org.name,
                "org_type":          org.org_type,
                "relevance_score":   round(total_score, 1),
                "sector_score":      round(sector_score, 1),
                "geo_score":         round(geo_score, 1),
                "stage_score":       round(stage_score, 1),
                "check_size_score":  round(check_score, 1),
                "momentum_score":    round(momentum_raw, 1),
                "total_deals":       total,
                "thesis_alignment":  thesis.thesis_alignment_pct if thesis else 0.0,
                "activity_label":    thesis.momentum_score > 50 if thesis else False,
                "website":           org.website,
                "application_url":   getattr(org, "application_url", ""),
            })

        results.sort(key=lambda x: -x["relevance_score"])
        return results[:top_n]

    # -----------------------------------------------------------------------
    # Bulk recompute all InvestorThesis
    # -----------------------------------------------------------------------

    def recompute_all_theses(self) -> Dict[str, int]:
        """
        Recompute thesis_alignment_pct and momentum_score for all investors
        with InvestorThesis records.  Called by periodic Celery task.
        """
        updated = errors = 0
        for thesis in InvestorThesis.objects.select_related("organization"):
            try:
                profile = self.build_investor_profile(thesis.organization)
                thesis.thesis_alignment_pct   = profile.thesis_alignment_pct
                thesis.momentum_score         = profile.momentum_score
                thesis.observed_sector_dist   = profile.observed_sector_dist
                thesis.observed_geo_dist      = profile.observed_geo_dist
                thesis.observed_stage_dist    = profile.observed_stage_dist
                thesis.observed_avg_check_usd = profile.observed_avg_check_usd
                thesis.total_observed_deals   = profile.total_observed_deals
                thesis.deals_last_12_months   = profile.deals_last_12_months
                thesis.last_computed          = timezone.now()
                thesis.save(update_fields=[
                    "thesis_alignment_pct", "momentum_score", "observed_sector_dist",
                    "observed_geo_dist", "observed_stage_dist", "observed_avg_check_usd",
                    "total_observed_deals", "deals_last_12_months", "last_computed",
                ])
                updated += 1
            except Exception as exc:
                logger.error("[investor_graph] recompute failed %s: %s",
                             thesis.organization.name, exc)
                errors += 1

        return {"updated": updated, "errors": errors}
