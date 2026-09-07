"""
apps.fundability.engine
========================
Fundability Engine — the central intelligence layer for Pitchmic.

Architecture principle: Evidence before inference.
  - The startup is the source of truth.
  - AI/ML interprets evidence; it does not manufacture startup facts.
  - Stage expectations vary by stage, sector, and business model.
  - A pre-revenue startup is never punished for lacking ARR.

Flow:
  StartupProfile  →  Collect evidence signals
                  →  Infer stage from evidence
                  →  Apply stage-conditioned expectations
                  →  Score 8 dimensions
                  →  Produce gaps + improvement actions
                  →  Return FundabilityAssessment
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.users.models import StartupProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stage classification thresholds
# ---------------------------------------------------------------------------

STAGE_THRESHOLDS = {
    # (min_product_maturity_score, min_traction_signal, label)
    "idea": {
        "label": "idea",
        "display": "Idea / Concept",
        "expected_dimensions": {
            "problem": True,
            "solution": False,
            "market": True,
            "team": True,
            "traction": False,
            "business_model": False,
            "defensibility": False,
            "fundraising": False,
        },
    },
    "pre_seed": {
        "label": "pre_seed",
        "display": "Pre-Seed",
        "expected_dimensions": {
            "problem": True,
            "solution": True,
            "market": True,
            "team": True,
            "traction": False,   # Not required — pilot/waitlist is a bonus
            "business_model": True,
            "defensibility": False,
            "fundraising": True,
        },
    },
    "seed": {
        "label": "seed",
        "display": "Seed",
        "expected_dimensions": {
            "problem": True,
            "solution": True,
            "market": True,
            "team": True,
            "traction": True,
            "business_model": True,
            "defensibility": True,
            "fundraising": True,
        },
    },
    "series_a": {
        "label": "series_a",
        "display": "Series A",
        "expected_dimensions": {
            "problem": True,
            "solution": True,
            "market": True,
            "team": True,
            "traction": True,
            "business_model": True,
            "defensibility": True,
            "fundraising": True,
        },
    },
    "series_b_plus": {
        "label": "series_b_plus",
        "display": "Series B+",
        "expected_dimensions": {
            "problem": True,
            "solution": True,
            "market": True,
            "team": True,
            "traction": True,
            "business_model": True,
            "defensibility": True,
            "fundraising": True,
        },
    },
}

# Dimension weights per stage (sum to 100)
DIMENSION_WEIGHTS: dict[str, dict[str, float]] = {
    "idea": {
        "problem": 30.0,
        "solution": 20.0,
        "market": 15.0,
        "team": 25.0,
        "traction": 0.0,
        "business_model": 5.0,
        "defensibility": 0.0,
        "fundraising": 5.0,
    },
    "pre_seed": {
        "problem": 20.0,
        "solution": 20.0,
        "market": 15.0,
        "team": 20.0,
        "traction": 5.0,
        "business_model": 10.0,
        "defensibility": 5.0,
        "fundraising": 5.0,
    },
    "seed": {
        "problem": 12.0,
        "solution": 18.0,
        "market": 12.0,
        "team": 15.0,
        "traction": 20.0,
        "business_model": 12.0,
        "defensibility": 6.0,
        "fundraising": 5.0,
    },
    "series_a": {
        "problem": 8.0,
        "solution": 12.0,
        "market": 10.0,
        "team": 12.0,
        "traction": 28.0,
        "business_model": 15.0,
        "defensibility": 10.0,
        "fundraising": 5.0,
    },
    "series_b_plus": {
        "problem": 5.0,
        "solution": 10.0,
        "market": 10.0,
        "team": 10.0,
        "traction": 30.0,
        "business_model": 20.0,
        "defensibility": 10.0,
        "fundraising": 5.0,
    },
}

DIMENSION_NAMES: dict[str, str] = {
    "problem": "Problem Validation",
    "solution": "Solution / Product",
    "market": "Market",
    "team": "Founder & Team",
    "traction": "Traction",
    "business_model": "Business Model",
    "defensibility": "Defensibility",
    "fundraising": "Fundraising Readiness",
}


# ---------------------------------------------------------------------------
# Evidence signal collector
# ---------------------------------------------------------------------------

@dataclass
class EvidenceSignals:
    """Structured snapshot of what the startup has demonstrated."""

    # Identity / maturity signals
    has_legal_entity: bool = False
    has_live_product: bool = False
    has_mvp: bool = False
    has_paying_customers: bool = False
    has_revenue: bool = False
    has_mrr_data: bool = False
    has_retention_data: bool = False
    has_growth_data: bool = False
    has_institutional_funding: bool = False

    # Team signals
    founder_count: int = 0
    has_technical_founder: bool = False
    has_domain_expert: bool = False

    # Problem / market signals
    has_problem_statement: bool = False
    has_customer_segment: bool = False
    has_tam_estimate: bool = False
    has_market_evidence: bool = False

    # Traction metrics
    customer_count: int = 0
    mau: int = 0
    mrr_usd: float = 0.0
    arr_usd: float = 0.0
    growth_rate_pct: float = 0.0
    retention_pct: float = 0.0
    has_pilots_or_loi: bool = False
    has_waitlist: bool = False
    has_partnerships: bool = False

    # Financial signals
    has_financial_snapshot: bool = False
    has_burn_data: bool = False
    has_runway_data: bool = False
    runway_months: float = 0.0
    has_unit_economics: bool = False

    # Fundraising signals
    has_fundraising_campaign: bool = False
    target_amount_usd: float = 0.0
    has_clear_use_of_funds: bool = False
    has_previous_funding: bool = False
    previous_funding_usd: float = 0.0

    # Evidence vault
    total_evidence_items: int = 0
    verified_evidence_items: int = 0
    observed_evidence_items: int = 0
    evidence_items_by_dimension: dict = field(default_factory=dict)

    # Deck forensics (populated if deck was analyzed)
    has_deck_analysis: bool = False
    deck_fundability_score: float = 0.0
    deck_contradictions: list = field(default_factory=list)
    deck_dimension_scores: dict = field(default_factory=dict)
    deck_missing_slides: list = field(default_factory=list)


def _has_substantive_founder_data(startup: StartupProfile) -> tuple[bool, list[str]]:
    """Return whether the startup has real founder-provided data worth assessing.

    Only explicit founder-entered inputs are considered. Derived defaults, empty
    placeholders, and generic metadata (for example a bare location string or a
    blank company name) do not qualify as sufficient evidence.
    """
    missing: list[str] = []

    description = (startup.description or "").strip()
    if len(description) < 80:
        missing.append("a problem or company description of at least 80 characters")

    target_market = (startup.target_market or "").strip()
    if len(target_market) < 20:
        missing.append("a specific target market or customer segment")

    product = getattr(startup, "product_profile", None)
    product_fields = 0
    if product is not None:
        if (product.problem_statement or "").strip():
            product_fields += 1
        if (product.solution_description or "").strip():
            product_fields += 1
        if (product.target_customer_description or "").strip():
            product_fields += 1
        if product.product_status:
            product_fields += 1
    if product_fields < 2:
        missing.append("product details such as the problem, solution, or target customer")

    founder_profiles = startup.founder_profiles.count()
    if founder_profiles == 0:
        missing.append("at least one founder profile")

    trusted_evidence = startup.evidence_vault.filter(
        status__in=[
            "verified",
            "observed",
            "supported",
        ]
    ).count()
    if trusted_evidence == 0:
        missing.append("at least one supported or verified evidence item")

    return len(missing) == 0, missing


def _collect_signals(startup: StartupProfile) -> EvidenceSignals:
    """
    Collect all available evidence signals from the startup's profile and
    related domain objects. No inference or scoring here — only fact gathering.
    """
    from apps.startups.models import (
        StartupEvidence,
        StartupFinancialSnapshot,
        StartupFundingRound,
        FundraisingCampaign,
    )
    from apps.fundability.models import EvidenceVaultItem

    sig = EvidenceSignals()

    # ---- Identity ----------------------------------------------------------
    sig.has_legal_entity = bool(startup.location or startup.address)

    # ---- Team ---------------------------------------------------------------
    team = list(startup.team_members.all())
    sig.founder_count = len(team)

    for m in team:
        role_lower = (m.role or "").lower()
        bio_lower = (m.bio or "").lower()
        if any(k in role_lower for k in ["cto", "tech", "engineer", "developer", "architect"]):
            sig.has_technical_founder = True
        if any(k in bio_lower + role_lower for k in ["domain", "expert", "industry", "sector"]):
            sig.has_domain_expert = True

    # ---- Problem / market ---------------------------------------------------
    sig.has_problem_statement = bool(startup.description and len(startup.description) > 40)
    sig.has_customer_segment = bool(startup.target_market)
    sig.has_tam_estimate = bool(startup.tam and startup.tam > 0)
    sig.has_market_evidence = bool(startup.sam and startup.sam > 0)

    # ---- Product maturity ---------------------------------------------------
    # Infer from profile fields — richer signals come from sub-profiles
    revenue = float(startup.current_revenue or 0)
    customers = startup.customer_count or 0
    mau = startup.monthly_active_users or 0

    sig.has_revenue = revenue > 0
    sig.has_paying_customers = customers > 0
    sig.has_live_product = sig.has_revenue or customers > 0 or mau > 0

    # Check ProductProfile if available
    try:
        pp = startup.product_profile
        sig.has_mvp = pp.product_status in ["mvp", "beta", "live", "scaling"]
        if not sig.has_live_product:
            sig.has_live_product = pp.product_status in ["beta", "live", "scaling"]
    except Exception:
        pass

    # ---- Traction -----------------------------------------------------------
    sig.customer_count = customers
    sig.mau = mau
    sig.mrr_usd = float(startup.current_revenue or 0) / 12.0 if revenue > 0 else 0.0

    if startup.revenue_growth_rate and startup.revenue_growth_rate > 0:
        sig.has_growth_data = True
        sig.growth_rate_pct = float(startup.revenue_growth_rate)

    # Richer traction from TractionMetric sub-profile
    try:
        metrics = startup.traction_metrics.all()
        for m in metrics:
            if m.metric_type == "mrr" and m.value:
                sig.mrr_usd = float(m.value)
                sig.has_mrr_data = True
            if m.metric_type == "arr" and m.value:
                sig.arr_usd = float(m.value)
            if m.metric_type in ["retention", "nrr"] and m.value:
                sig.retention_pct = float(m.value)
                sig.has_retention_data = True
            if m.metric_type == "growth_rate" and m.value:
                sig.growth_rate_pct = float(m.value)
                sig.has_growth_data = True
            if m.metric_type == "pilots" and m.value and float(m.value) > 0:
                sig.has_pilots_or_loi = True
            if m.metric_type == "waitlist" and m.value and float(m.value) > 0:
                sig.has_waitlist = True
            if m.metric_type == "partnerships" and m.value and float(m.value) > 0:
                sig.has_partnerships = True
    except Exception:
        pass

    # ---- Financials ---------------------------------------------------------
    try:
        financial_snapshots = list(startup.financial_snapshots.order_by("-recorded_at")[:1])
        if financial_snapshots:
            snap = financial_snapshots[0]
            sig.has_financial_snapshot = True
            sig.has_burn_data = float(snap.net_burn_monthly_usd or 0) > 0
            sig.has_runway_data = snap.runway_months > 0
            sig.runway_months = float(snap.runway_months)
            sig.has_unit_economics = bool(snap.cac_usd and snap.ltv_usd)
    except Exception:
        pass

    # Fallback to profile-level fields
    if not sig.has_burn_data:
        sig.has_burn_data = bool(startup.burn_rate and startup.burn_rate > 0)
    if not sig.has_runway_data:
        sig.has_runway_data = bool(startup.runway_months and startup.runway_months > 0)
        sig.runway_months = float(startup.runway_months or 0)

    # ---- Funding history ----------------------------------------------------
    try:
        rounds = list(startup.funding_rounds.all())
        if rounds:
            sig.has_previous_funding = True
            sig.previous_funding_usd = sum(float(r.amount_usd or 0) for r in rounds)
            for r in rounds:
                if r.round_type in ["seed", "series_a", "series_b"]:
                    sig.has_institutional_funding = True
    except Exception:
        pass

    # ---- Fundraising campaign -----------------------------------------------
    try:
        campaign = startup.fundraising_campaign
        sig.has_fundraising_campaign = True
        sig.target_amount_usd = float(campaign.target_amount_usd or 0)
        sig.has_clear_use_of_funds = bool(campaign.terms_summary and len(campaign.terms_summary) > 30)
    except Exception:
        pass

    # ---- Evidence vault -----------------------------------------------------
    try:
        vault_items = list(startup.evidence_vault.all())
        sig.total_evidence_items = len(vault_items)
        sig.verified_evidence_items = sum(
            1 for v in vault_items if v.status in ["verified", "observed"]
        )
        sig.observed_evidence_items = sum(
            1 for v in vault_items if v.status == "observed"
        )
        dim_counts: dict[str, int] = {}
        for v in vault_items:
            dim_counts[v.dimension_tag] = dim_counts.get(v.dimension_tag, 0) + 1
        sig.evidence_items_by_dimension = dim_counts
    except Exception:
        pass

    # ---- Deck analysis (most recent) ----------------------------------------
    try:
        from apps.intelligence.models import PitchDeckForensicAnalysis
        deck_analysis = PitchDeckForensicAnalysis.objects.filter(
            startup=startup
        ).order_by("-analyzed_at").first()
        if not deck_analysis:
            deck_analysis = PitchDeckForensicAnalysis.objects.filter(
                pitch__startup_profile=startup
            ).order_by("-analyzed_at").first()
        if deck_analysis:
            sig.has_deck_analysis = True
            sig.deck_fundability_score = float(deck_analysis.fundability_score or 0)
            sig.deck_contradictions = deck_analysis.forensic_flags or []
            # Try to extract dimension scores if stored
            audit = deck_analysis.unit_economics_audit or {}
            sig.deck_dimension_scores = audit.get("dimension_scores", {})
            sig.deck_missing_slides = audit.get("missing_slides", [])
    except Exception:
        pass

    return sig


# ---------------------------------------------------------------------------
# Stage inference
# ---------------------------------------------------------------------------

def _infer_stage(sig: EvidenceSignals, declared_stage: str) -> tuple[str, float, str]:
    """
    Infer the evidence-based stage from collected signals.

    Returns: (inferred_stage_label, confidence_0_to_1, rationale_text)

    Principle: Never punish a startup for lacking evidence that is not
    appropriate for its actual stage.
    """
    evidence_points = 0
    rationale_parts = []

    if sig.has_institutional_funding:
        evidence_points += 4
        rationale_parts.append("Has institutional funding")

    if sig.has_revenue and sig.mrr_usd >= 20_000:
        evidence_points += 4
        rationale_parts.append(f"${sig.mrr_usd:,.0f} MRR")
    elif sig.has_revenue and sig.mrr_usd > 0:
        evidence_points += 3
        rationale_parts.append(f"Early revenue (${sig.mrr_usd:,.0f} MRR)")

    if sig.has_retention_data and sig.retention_pct >= 70:
        evidence_points += 3
        rationale_parts.append(f"{sig.retention_pct:.0f}% retention data")

    if sig.has_growth_data and sig.growth_rate_pct >= 20:
        evidence_points += 2
        rationale_parts.append(f"{sig.growth_rate_pct:.0f}% growth rate")

    if sig.customer_count >= 100:
        evidence_points += 3
        rationale_parts.append(f"{sig.customer_count} customers")
    elif sig.customer_count >= 10:
        evidence_points += 2
        rationale_parts.append(f"{sig.customer_count} early customers")

    if sig.has_live_product:
        evidence_points += 2
        rationale_parts.append("Live product")
    elif sig.has_mvp:
        evidence_points += 1
        rationale_parts.append("MVP built")

    if sig.has_pilots_or_loi:
        evidence_points += 1
        rationale_parts.append("Active pilots / LOIs")

    if sig.has_problem_statement and sig.has_customer_segment:
        evidence_points += 1
        rationale_parts.append("Clear problem and customer segment")

    # Map evidence points to stage
    if evidence_points >= 12:
        inferred = "series_a"
        confidence = 0.85
    elif evidence_points >= 8:
        inferred = "seed"
        confidence = 0.80
    elif evidence_points >= 4:
        inferred = "pre_seed"
        confidence = 0.75
    elif evidence_points >= 2:
        inferred = "pre_seed"
        confidence = 0.65
    else:
        inferred = "idea"
        confidence = 0.70

    rationale = "Evidence-based stage assessment. " + "; ".join(rationale_parts) if rationale_parts else (
        "Insufficient evidence to determine stage beyond concept-level."
    )

    # If inferred matches declared, boost confidence
    if inferred == declared_stage:
        confidence = min(1.0, confidence + 0.10)

    return inferred, confidence, rationale


# ---------------------------------------------------------------------------
# 8-dimension scoring (evidence-conditioned, stage-aware)
# ---------------------------------------------------------------------------

def _score_dimensions(
    sig: EvidenceSignals,
    inferred_stage: str,
    startup: StartupProfile,
) -> dict[str, dict]:
    """
    Score each of the 8 fundability dimensions based on collected signals.
    Scores are conditioned on the inferred stage — a pre-revenue startup is
    not penalised for lacking ARR if it is at the pre-seed stage.

    Returns: dict of {dimension_key: {score, evidence_state, confidence_pct,
                                       positive_signals, missing_evidence,
                                       stage_concern, justifications}}
    """
    weights = DIMENSION_WEIGHTS.get(inferred_stage, DIMENSION_WEIGHTS["pre_seed"])
    results: dict[str, dict] = {}

    # ---- 1. Problem Validation -----------------------------------------------
    problem_score = 30.0
    problem_pos: list[str] = []
    problem_miss: list[str] = []
    if sig.has_problem_statement:
        problem_score += 25.0
        problem_pos.append("Problem statement defined")
    else:
        problem_miss.append("Clear problem statement with evidence of customer pain")
    if sig.has_customer_segment:
        problem_score += 20.0
        problem_pos.append("Target customer segment identified")
    else:
        problem_miss.append("Target customer segment definition")
    vault_dim = sig.evidence_items_by_dimension.get("problem", 0)
    if vault_dim >= 2:
        problem_score += 15.0
        problem_pos.append(f"{vault_dim} pieces of problem evidence in vault")
    elif vault_dim == 1:
        problem_score += 8.0
        problem_pos.append("Problem evidence supplied")
    else:
        problem_miss.append("Customer interview or market research evidence")
    problem_score = min(100.0, max(20.0, problem_score))
    results["problem"] = {
        "raw_score": round(problem_score, 1),
        "weight_pct": weights["problem"],
        "weighted_contribution": round(problem_score * weights["problem"] / 100, 2),
        "evidence_state": "verified_empirical" if vault_dim >= 2 else (
            "supported" if vault_dim == 1 else "founder_claimed" if sig.has_problem_statement else "unavailable"
        ),
        "confidence_pct": min(90, 40 + vault_dim * 15 + (25 if sig.has_customer_segment else 0)),
        "positive_signals": problem_pos,
        "missing_evidence": problem_miss,
        "stage_concern": "acceptable",
        "justifications": ["Evaluates whether the problem is clear, specific, and supported by customer evidence."],
    }

    # ---- 2. Solution / Product -----------------------------------------------
    solution_score = 25.0
    solution_pos: list[str] = []
    solution_miss: list[str] = []
    if sig.has_live_product:
        solution_score += 30.0
        solution_pos.append("Live product in market")
    elif sig.has_mvp:
        solution_score += 20.0
        solution_pos.append("MVP built and testable")
    else:
        solution_miss.append("Working product or MVP")
    vault_dim = sig.evidence_items_by_dimension.get("solution", 0)
    if vault_dim >= 1:
        solution_score += 15.0
        solution_pos.append("Product evidence in vault")
    else:
        solution_miss.append("Product demo, screenshots, or technical architecture evidence")
    if sig.has_technical_founder:
        solution_score += 10.0
        solution_pos.append("Technical founder on team")
    else:
        solution_miss.append("Technical leadership or CTO-equivalent")
    solution_score = min(100.0, max(20.0, solution_score))
    results["solution"] = {
        "raw_score": round(solution_score, 1),
        "weight_pct": weights["solution"],
        "weighted_contribution": round(solution_score * weights["solution"] / 100, 2),
        "evidence_state": "supported" if sig.has_live_product else (
            "founder_claimed" if sig.has_mvp else "unavailable"
        ),
        "confidence_pct": 70 if sig.has_live_product else (50 if sig.has_mvp else 30),
        "positive_signals": solution_pos,
        "missing_evidence": solution_miss,
        "stage_concern": "acceptable" if inferred_stage in ["idea", "pre_seed"] or sig.has_live_product else "moderate_concern",
        "justifications": ["Evaluates product maturity, technical capability, and differentiation."],
    }

    # ---- 3. Market -----------------------------------------------------------
    market_score = 30.0
    market_pos: list[str] = []
    market_miss: list[str] = []
    if sig.has_tam_estimate:
        market_score += 20.0
        market_pos.append(f"TAM estimate provided (${float(startup.tam or 0):,.0f})")
    else:
        market_miss.append("Total Addressable Market (TAM) estimate with evidence")
    if sig.has_market_evidence:
        market_score += 15.0
        market_pos.append("SAM / market segmentation defined")
    vault_dim = sig.evidence_items_by_dimension.get("market", 0)
    if vault_dim >= 1:
        market_score += 15.0
        market_pos.append("Market evidence in vault")
    else:
        market_miss.append("Independent market research or report supporting market size")
    market_score = min(100.0, max(20.0, market_score))
    results["market"] = {
        "raw_score": round(market_score, 1),
        "weight_pct": weights["market"],
        "weighted_contribution": round(market_score * weights["market"] / 100, 2),
        "evidence_state": "verified_empirical" if vault_dim >= 2 else (
            "supported" if (sig.has_tam_estimate and vault_dim >= 1) else (
                "founder_claimed" if sig.has_tam_estimate else "unavailable"
            )
        ),
        "confidence_pct": 60 if sig.has_tam_estimate else 35,
        "positive_signals": market_pos,
        "missing_evidence": market_miss,
        "stage_concern": "acceptable",
        "justifications": ["Evaluates TAM/SAM/SOM estimates, market evidence, and expansion potential."],
    }

    # ---- 4. Founder & Team ---------------------------------------------------
    team_score = 30.0
    team_pos: list[str] = []
    team_miss: list[str] = []
    if sig.founder_count >= 2:
        team_score += 20.0
        team_pos.append(f"{sig.founder_count} team members profiled")
    elif sig.founder_count == 1:
        team_score += 10.0
        team_pos.append("Founder profile present")
        team_miss.append("Co-founder or key team member profiles")
    else:
        team_miss.append("Founder profile and team information")
    if sig.has_technical_founder:
        team_score += 15.0
        team_pos.append("Technical leader identified")
    else:
        team_miss.append("Technical leadership (CTO or equivalent)")
    if sig.has_domain_expert:
        team_score += 10.0
        team_pos.append("Domain expertise on team")
    vault_dim = sig.evidence_items_by_dimension.get("team", 0)
    if vault_dim >= 1:
        team_score += 10.0
        team_pos.append("Team credentials in evidence vault")
    team_score = min(100.0, max(20.0, team_score))
    results["team"] = {
        "raw_score": round(team_score, 1),
        "weight_pct": weights["team"],
        "weighted_contribution": round(team_score * weights["team"] / 100, 2),
        "evidence_state": "supported" if sig.founder_count >= 2 else "founder_claimed",
        "confidence_pct": 65 if sig.founder_count >= 2 else 40,
        "positive_signals": team_pos,
        "missing_evidence": team_miss,
        "stage_concern": "acceptable",
        "justifications": ["Evaluates founder-market fit, team completeness, and execution capability."],
    }

    # ---- 5. Traction ---------------------------------------------------------
    traction_score = 20.0
    traction_pos: list[str] = []
    traction_miss: list[str] = []
    stage_concern = "acceptable"

    # Pre-seed/idea: traction absence is NOT penalised — only validate if present
    is_early_stage = inferred_stage in ["idea", "pre_seed"]

    if sig.has_revenue and sig.mrr_usd >= 10_000:
        traction_score += 35.0
        traction_pos.append(f"${sig.mrr_usd:,.0f} MRR")
    elif sig.has_revenue and sig.mrr_usd > 0:
        traction_score += 20.0
        traction_pos.append(f"Early revenue (${sig.mrr_usd:,.0f} MRR)")
    elif not is_early_stage:
        traction_miss.append("Revenue evidence (MRR / ARR)")
        stage_concern = "material_concern"

    if sig.customer_count >= 50:
        traction_score += 20.0
        traction_pos.append(f"{sig.customer_count} customers")
    elif sig.customer_count >= 10:
        traction_score += 12.0
        traction_pos.append(f"{sig.customer_count} early customers")
    elif sig.customer_count > 0:
        traction_score += 5.0
        traction_pos.append(f"{sig.customer_count} customer(s)")

    if sig.has_retention_data:
        traction_score += 15.0
        traction_pos.append(f"Retention data ({sig.retention_pct:.0f}%)")
    elif not is_early_stage:
        traction_miss.append("Cohort retention data (30/60/90-day)")

    if sig.has_growth_data and sig.growth_rate_pct >= 10:
        traction_score += 10.0
        traction_pos.append(f"{sig.growth_rate_pct:.0f}% growth rate")

    if sig.has_pilots_or_loi:
        traction_score += 8.0
        traction_pos.append("Active pilots or LOIs")

    if sig.has_waitlist:
        traction_score += 5.0
        traction_pos.append("Waitlist / demand signal")

    vault_dim = sig.evidence_items_by_dimension.get("traction", 0)
    if vault_dim >= 1:
        traction_score += 8.0
        traction_pos.append(f"{vault_dim} traction evidence item(s) in vault")
    elif not is_early_stage:
        traction_miss.append("Analytics export or verified traction evidence")

    if is_early_stage and not traction_pos:
        traction_pos.append("Pre-revenue stage — traction evidence not required yet")

    traction_score = min(100.0, max(15.0, traction_score))
    results["traction"] = {
        "raw_score": round(traction_score, 1),
        "weight_pct": weights["traction"],
        "weighted_contribution": round(traction_score * weights["traction"] / 100, 2),
        "evidence_state": "verified_empirical" if vault_dim >= 2 else (
            "supported" if (sig.has_revenue and vault_dim >= 1) else (
                "founder_claimed" if sig.has_revenue else "unavailable"
            )
        ),
        "confidence_pct": 75 if vault_dim >= 2 else (55 if sig.has_revenue else 25),
        "positive_signals": traction_pos,
        "missing_evidence": traction_miss,
        "stage_concern": stage_concern,
        "justifications": ["Evaluates paying customers, MRR, retention, and growth evidence."],
    }

    # ---- 6. Business Model ---------------------------------------------------
    bm_score = 30.0
    bm_pos: list[str] = []
    bm_miss: list[str] = []
    try:
        bm_profile = startup.business_model_profile
        if bm_profile.revenue_model:
            bm_score += 20.0
            bm_pos.append(f"Revenue model: {bm_profile.revenue_model}")
        else:
            bm_miss.append("Defined revenue model (SaaS, transactional, marketplace, etc.)")
        if bm_profile.pricing_model:
            bm_score += 10.0
            bm_pos.append("Pricing model defined")
        else:
            bm_miss.append("Pricing model and tier structure")
        if bm_profile.customer_type:
            bm_score += 10.0
            bm_pos.append(f"Customer type: {bm_profile.customer_type}")
    except Exception:
        bm_miss.append("Revenue model and pricing structure")
        bm_miss.append("Unit economics (CAC / LTV)")

    if sig.has_unit_economics:
        bm_score += 20.0
        bm_pos.append("CAC and LTV data available")
    elif not is_early_stage:
        bm_miss.append("Unit economics (Customer Acquisition Cost vs Lifetime Value)")

    vault_dim = sig.evidence_items_by_dimension.get("business_model", 0)
    if vault_dim >= 1:
        bm_score += 10.0
        bm_pos.append("Business model evidence in vault")

    bm_score = min(100.0, max(20.0, bm_score))
    results["business_model"] = {
        "raw_score": round(bm_score, 1),
        "weight_pct": weights["business_model"],
        "weighted_contribution": round(bm_score * weights["business_model"] / 100, 2),
        "evidence_state": "supported" if bm_pos else "founder_claimed",
        "confidence_pct": 60 if sig.has_unit_economics else 40,
        "positive_signals": bm_pos,
        "missing_evidence": bm_miss,
        "stage_concern": "acceptable" if is_early_stage else (
            "moderate_concern" if not sig.has_unit_economics else "acceptable"
        ),
        "justifications": ["Evaluates revenue model clarity, pricing, unit economics, and monetization path."],
    }

    # ---- 7. Defensibility ----------------------------------------------------
    def_score = 30.0
    def_pos: list[str] = []
    def_miss: list[str] = []
    if startup.patent_count and startup.patent_count > 0:
        def_score += 20.0
        def_pos.append(f"{startup.patent_count} patent(s) filed or granted")
    vault_dim = sig.evidence_items_by_dimension.get("defensibility", 0)
    if vault_dim >= 1:
        def_score += 15.0
        def_pos.append("Defensibility evidence in vault")
    else:
        def_miss.append("IP, technical moat, or competitive differentiation evidence")
    if sig.has_technical_founder:
        def_score += 10.0
        def_pos.append("Technical founder provides execution moat")
    if sig.has_partnerships:
        def_score += 10.0
        def_pos.append("Strategic partnerships established")
    if not def_pos:
        def_miss.append("Explanation of what prevents competitors from copying the product")

    def_score = min(100.0, max(20.0, def_score))
    results["defensibility"] = {
        "raw_score": round(def_score, 1),
        "weight_pct": weights["defensibility"],
        "weighted_contribution": round(def_score * weights["defensibility"] / 100, 2),
        "evidence_state": "supported" if vault_dim >= 1 else "founder_claimed",
        "confidence_pct": 50 if vault_dim >= 1 else 35,
        "positive_signals": def_pos,
        "missing_evidence": def_miss,
        "stage_concern": "acceptable" if is_early_stage else "moderate_concern",
        "justifications": ["Evaluates IP, technical moat, network effects, and competitive barriers."],
    }

    # ---- 8. Fundraising Readiness --------------------------------------------
    fr_score = 20.0
    fr_pos: list[str] = []
    fr_miss: list[str] = []
    if sig.has_fundraising_campaign:
        fr_score += 25.0
        fr_pos.append(f"Fundraising campaign active (${sig.target_amount_usd:,.0f} target)")
    else:
        fr_miss.append("Define the current fundraising round and target amount")
    if sig.has_clear_use_of_funds:
        fr_score += 20.0
        fr_pos.append("Use of funds documented")
    else:
        fr_miss.append("Clear use-of-funds breakdown tied to specific milestones")
    if sig.has_runway_data and sig.runway_months >= 12:
        fr_score += 15.0
        fr_pos.append(f"{sig.runway_months:.0f} months runway")
    elif sig.has_runway_data and sig.runway_months > 0:
        fr_score += 8.0
        fr_pos.append(f"{sig.runway_months:.0f} months runway")
        if sig.runway_months < 6:
            fr_miss.append("Critical: Less than 6 months runway — fundraise urgently or reduce burn")
    if sig.has_previous_funding:
        fr_score += 10.0
        fr_pos.append(f"${sig.previous_funding_usd:,.0f} raised previously")
    vault_dim = sig.evidence_items_by_dimension.get("fundraising", 0)
    if vault_dim >= 1:
        fr_score += 10.0
        fr_pos.append("Fundraising evidence in vault")

    fr_score = min(100.0, max(15.0, fr_score))
    results["fundraising"] = {
        "raw_score": round(fr_score, 1),
        "weight_pct": weights["fundraising"],
        "weighted_contribution": round(fr_score * weights["fundraising"] / 100, 2),
        "evidence_state": "supported" if sig.has_fundraising_campaign else "founder_claimed",
        "confidence_pct": 65 if sig.has_fundraising_campaign else 30,
        "positive_signals": fr_pos,
        "missing_evidence": fr_miss,
        "stage_concern": "material_concern" if (sig.has_runway_data and sig.runway_months < 6) else "acceptable",
        "justifications": ["Evaluates fundraising clarity, use of funds, valuation rationale, and runway."],
    }

    return results


# ---------------------------------------------------------------------------
# Gap detection
# ---------------------------------------------------------------------------

SEVERITY_MAP = {
    "idea": {"critical_threshold": 35, "high_threshold": 55},
    "pre_seed": {"critical_threshold": 40, "high_threshold": 60},
    "seed": {"critical_threshold": 50, "high_threshold": 65},
    "series_a": {"critical_threshold": 60, "high_threshold": 75},
    "series_b_plus": {"critical_threshold": 65, "high_threshold": 80},
}

GAP_WHY_IT_MATTERS: dict[str, str] = {
    "problem": "Investors need evidence the problem is real, not assumed. Without customer validation, the product risks building for a non-existent need.",
    "solution": "A working product demonstrates execution capability. Without it, the investment is entirely a bet on the team's ability to build.",
    "market": "Investors need to understand the size of the prize. Unsupported market claims are one of the most common rejection triggers.",
    "team": "At early stage, the team is often the primary investment thesis. Gaps in team completeness are frequently cited in rejection feedback.",
    "traction": "Traction is the clearest signal of product-market fit. Insufficient traction evidence forces investors to take the founder's word for it.",
    "business_model": "A clear revenue model and unit economics show the path to profitability. Without it, the startup's commercial viability is unclear.",
    "defensibility": "Investors want to know why competitors cannot simply copy the product. Without a moat, returns are at risk.",
    "fundraising": "A clear fundraising strategy with defined milestones justifies the ask. Vague use-of-funds is a common accelerator rejection reason.",
}


SUPPRESSED_BASELINE_GAP_TITLES = frozenset({
    "Target customer segment definition",
    "Customer interview or market research evidence",
    "Working product or MVP",
})


def _detect_gaps(
    dimension_results: dict[str, dict],
    inferred_stage: str,
    sig: EvidenceSignals,
) -> list[dict]:
    """
    Identify fundability gaps from dimension scores and evidence signals.
    Returns a prioritised list of gap dicts.

    Generic template baseline titles (for example "Working product or MVP") are
    intentionally suppressed from the standalone gaps list so they never render
    as hardcoded-looking / demo-style rows. They are still visible per-dimension
    under the "missing evidence" section of the Dimensions tab when the
    corresponding signal is genuinely absent.
    """
    thresholds = SEVERITY_MAP.get(inferred_stage, SEVERITY_MAP["pre_seed"])
    gaps: list[dict] = []
    rank = 1

    for dim_key, dim_data in dimension_results.items():
        score = dim_data["raw_score"]
        weight = dim_data["weight_pct"]
        missing = dim_data["missing_evidence"]
        stage_concern = dim_data.get("stage_concern", "acceptable")

        if not missing and score >= thresholds["high_threshold"]:
            continue  # No gaps in this dimension

        # Determine severity
        if score < thresholds["critical_threshold"] or stage_concern == "material_concern":
            severity = "critical"
        elif score < thresholds["high_threshold"] or missing:
            severity = "high" if weight >= 15 else "medium"
        else:
            severity = "low"

        if not missing:
            continue  # Score is okay and nothing is explicitly missing

        for miss_item in missing:
            if miss_item in SUPPRESSED_BASELINE_GAP_TITLES:
                continue
            gaps.append({
                "dimension_key": dim_key,
                "title": miss_item,
                "description": f"Missing: {miss_item}",
                "severity": severity,
                "current_state": "; ".join(dim_data["positive_signals"]) or "No evidence provided",
                "expected_state": miss_item,
                "why_it_matters": GAP_WHY_IT_MATTERS.get(dim_key, ""),
                "evidence_required": miss_item,
                "impact": "critical" if severity == "critical" else "high" if severity == "high" else "medium",
                "effort": "low" if "define" in miss_item.lower() else "medium",
                "priority_rank": rank,
            })
            rank += 1

    # Also add deck contradiction gaps
    if sig.deck_contradictions:
        gaps.insert(0, {
            "dimension_key": "fundraising",
            "title": "Resolve deck vs profile contradictions",
            "description": (
                f"{len(sig.deck_contradictions)} contradiction(s) detected between your pitch deck "
                "and startup profile. Investors reviewing both will notice discrepancies."
            ),
            "severity": "critical",
            "current_state": f"{len(sig.deck_contradictions)} contradiction(s) detected",
            "expected_state": "Consistent figures across all materials",
            "why_it_matters": "Inconsistent data across materials is a critical red flag for investors and accelerators. It raises questions about founder integrity and data quality.",
            "evidence_required": "Reconcile all metrics between pitch deck and startup profile",
            "impact": "critical",
            "effort": "low",
            "priority_rank": 0,
        })
        # Re-rank
        for i, g in enumerate(gaps):
            g["priority_rank"] = i

    return gaps


# ---------------------------------------------------------------------------
# Improvement action generation
# ---------------------------------------------------------------------------

ACTION_TEMPLATES: dict[str, list[dict]] = {
    "problem": [
        {
            "action_type": "collect",
            "title": "Conduct and document customer discovery interviews",
            "description": "Conduct at least 5 structured customer discovery interviews. Document the problem, frequency, current workarounds, and willingness to pay.",
            "why_investors_care": "Customer quotes and evidence shift the problem from founder assumption to market reality.",
            "how_to_obtain": "Use tools like Notion, Dovetail, or Loom to record and document interviews. Ask: How do you currently solve this? What does it cost you?",
            "target_milestone": "5 documented customer discovery interviews with verbatim quotes",
            "reassess_after": "After completing interviews and adding evidence to vault",
            "estimated_score_delta": 6.0,
        },
    ],
    "solution": [
        {
            "action_type": "create",
            "title": "Build and demonstrate working MVP",
            "description": "Move from concept to working MVP. Even a no-code or prototype version demonstrates execution capability.",
            "why_investors_care": "A live product dramatically reduces technical and product execution risk.",
            "how_to_obtain": "Use Bubble, Webflow, Glide, or your own stack to build the core value proposition",
            "target_milestone": "Working demo or MVP accessible to external users",
            "reassess_after": "After MVP is live and first users onboarded",
            "estimated_score_delta": 8.0,
        },
    ],
    "market": [
        {
            "action_type": "verify",
            "title": "Provide independent market size evidence",
            "description": "Replace founder-estimated TAM with a third-party source: industry report, government data, or bottom-up calculation from known segment sizes.",
            "why_investors_care": "TAM claims without sources are routinely challenged in investor Q&A.",
            "how_to_obtain": "Use Statista, IBISWorld, World Bank, or industry association data. Build a bottom-up TAM from your SAM.",
            "target_milestone": "TAM supported by at least one independent source in evidence vault",
            "reassess_after": "After market evidence is uploaded to vault",
            "estimated_score_delta": 4.0,
        },
    ],
    "team": [
        {
            "action_type": "collect",
            "title": "Complete founder and team profiles",
            "description": "Add detailed bios, LinkedIn profiles, relevant experience, and previous startup history for each founder and key team member.",
            "why_investors_care": "At early stage, the team IS the investment thesis. Sparse profiles increase risk perception.",
            "how_to_obtain": "Add each team member with role, bio, LinkedIn, and key credentials in the Founders section",
            "target_milestone": "All founders and key team members profiled with linked credentials",
            "reassess_after": "After team profiles are complete",
            "estimated_score_delta": 5.0,
        },
    ],
    "traction": [
        {
            "action_type": "measure",
            "title": "Instrument product analytics and collect cohort retention data",
            "description": "Add analytics tracking (Mixpanel, Amplitude, or custom) and measure 30/60/90-day user retention.",
            "why_investors_care": "Retention cohorts are the clearest signal of real product-market fit.",
            "how_to_obtain": "Integrate an analytics SDK. Export cohort retention after 30/60/90 days. Upload the export as evidence.",
            "target_milestone": "3+ months of cohort retention data with at least 50 users",
            "reassess_after": "After 3 cohorts of retention data exist",
            "estimated_score_delta": 8.0,
        },
    ],
    "business_model": [
        {
            "action_type": "create",
            "title": "Define and document your revenue model and unit economics",
            "description": "Write a clear revenue model: how you charge, how much, and for whom. Add CAC and LTV estimates even if modelled.",
            "why_investors_care": "Without a clear revenue model, investors cannot evaluate commercial viability.",
            "how_to_obtain": "Complete the Business Model section. Add a pricing page or financial model as evidence.",
            "target_milestone": "Documented revenue model, pricing tiers, and unit economics estimates",
            "reassess_after": "After business model section is complete",
            "estimated_score_delta": 5.0,
        },
    ],
    "defensibility": [
        {
            "action_type": "validate",
            "title": "Document your competitive differentiation and moat",
            "description": "Write a clear explanation of what makes your product defensible: proprietary data, network effects, IP, switching costs, or speed of execution.",
            "why_investors_care": "Investors want to know why they should not worry about a well-funded competitor copying you.",
            "how_to_obtain": "Add a defensibility statement. If applicable, file or document any IP.",
            "target_milestone": "Documented competitive differentiation with at least one defensibility signal",
            "reassess_after": "After defensibility evidence is in vault",
            "estimated_score_delta": 3.0,
        },
    ],
    "fundraising": [
        {
            "action_type": "create",
            "title": "Define fundraising round with clear use of funds and milestones",
            "description": "Set up your fundraising campaign with target amount, instrument, use of funds, and the specific milestone capital will achieve.",
            "why_investors_care": "Investors evaluate whether the ask size is justified by the intended use and milestone. Vague use-of-funds is a common rejection reason.",
            "how_to_obtain": "Complete the Fundraising section. Be specific: '$300k will hire 2 engineers and reach $15k MRR in 9 months'.",
            "target_milestone": "Fundraising round configured with target, instrument, use-of-funds, and milestone",
            "reassess_after": "After fundraising profile is complete",
            "estimated_score_delta": 4.0,
        },
    ],
}


def _generate_actions(gaps: list[dict]) -> list[dict]:
    """Convert gaps into actionable improvement items."""
    actions: list[dict] = []
    rank = 0
    used_templates: set[str] = set()

    for gap in gaps:
        dim_key = gap["dimension_key"]
        templates = ACTION_TEMPLATES.get(dim_key, [])

        for tmpl in templates:
            key = f"{dim_key}:{tmpl['title']}"
            if key in used_templates:
                continue
            used_templates.add(key)
            actions.append({
                **tmpl,
                "gap_title": gap["title"],
                "gap_severity": gap["severity"],
                "priority_rank": rank,
            })
            rank += 1

    return actions


# ---------------------------------------------------------------------------
# Evidence completeness
# ---------------------------------------------------------------------------

EXPECTED_EVIDENCE_BY_STAGE: dict[str, list[str]] = {
    "idea": ["problem", "team"],
    "pre_seed": ["problem", "solution", "market", "team", "fundraising"],
    "seed": ["problem", "solution", "market", "team", "traction", "business_model", "fundraising"],
    "series_a": ["problem", "solution", "market", "team", "traction", "business_model", "defensibility", "fundraising", "financials"],
    "series_b_plus": ["problem", "solution", "market", "team", "traction", "business_model", "defensibility", "fundraising", "financials"],
}


def _compute_evidence_completeness(sig: EvidenceSignals, inferred_stage: str) -> int:
    expected_dims = EXPECTED_EVIDENCE_BY_STAGE.get(inferred_stage, EXPECTED_EVIDENCE_BY_STAGE["pre_seed"])
    if not expected_dims:
        return 0
    covered = sum(1 for d in expected_dims if sig.evidence_items_by_dimension.get(d, 0) > 0)
    return round((covered / len(expected_dims)) * 100)


# ---------------------------------------------------------------------------
# Main engine entry point
# ---------------------------------------------------------------------------

def run_fundability_assessment(startup: StartupProfile) -> "FundabilityAssessment":
    """
    Run a full fundability assessment for the given startup.

    Only founder-provided and explicitly supported evidence is eligible. The
    engine must not score a startup based on empty defaults, weak placeholders, or
    inferred metadata with no founder input.
    """
    valid, missing = _has_substantive_founder_data(startup)
    if not valid:
        raise ValueError(
            "Fundability assessment requires founder-provided startup data. "
            "Please complete the profile, product details, founder information, and at least one supported evidence item. Missing: "
            + "; ".join(missing)
        )

    from apps.fundability.models import (
        FundabilityAssessment,
        FundabilityDimension,
        FundabilityGap,
        ImprovementAction,
        ProgramReadiness,
    )

    # 1. Collect evidence signals
    sig = _collect_signals(startup)

    # 2. Infer stage
    declared_stage = (getattr(startup, "funding_stage", None) or "pre_seed").replace("-", "_")
    inferred_stage, stage_confidence, stage_rationale = _infer_stage(sig, declared_stage)

    # 3. Score 8 dimensions
    dimension_results = _score_dimensions(sig, inferred_stage, startup)

    # 4. Compute overall weighted score
    total_weighted = sum(d["weighted_contribution"] for d in dimension_results.values())
    overall_score = round(min(100.0, max(0.0, total_weighted)), 1)

    # 5. Apply deck forensics adjustment (if deck was analyzed, blend in)
    if sig.has_deck_analysis and sig.deck_fundability_score > 0:
        overall_score = round(overall_score * 0.65 + sig.deck_fundability_score * 0.35, 1)

    # 6. Confidence interval (±10 if low evidence, ±5 if medium, ±3 if high)
    evidence_coverage = sig.verified_evidence_items / max(sig.total_evidence_items, 1)
    if evidence_coverage < 0.3:
        ci_range = 10.0
        confidence_label = "low"
    elif evidence_coverage < 0.7:
        ci_range = 7.0
        confidence_label = "medium"
    else:
        ci_range = 4.0
        confidence_label = "high"

    # 7. Conviction band
    if overall_score >= 85:
        conviction = "exceptional"
    elif overall_score >= 70:
        conviction = "strong"
    elif overall_score >= 55:
        conviction = "promising"
    elif overall_score >= 40:
        conviction = "speculative"
    else:
        conviction = "weak"

    # 8. Bull / bear thesis
    top_dims = sorted(dimension_results.items(), key=lambda x: x[1]["raw_score"], reverse=True)
    bottom_dims = sorted(dimension_results.items(), key=lambda x: x[1]["raw_score"])
    strong_names = [DIMENSION_NAMES[k] for k, _ in top_dims[:2] if _["raw_score"] >= 60]
    weak_names = [DIMENSION_NAMES[k] for k, _ in bottom_dims[:2] if _["raw_score"] < 55]

    bull_thesis = (
        f"Strongest signals: {', '.join(strong_names)}. "
        if strong_names else "Insufficient evidence to build a conviction bull case."
    )
    bear_thesis = (
        f"Primary concerns: {', '.join(weak_names)}. Evidence quality needs to improve before institutional investors will engage."
        if weak_names else "No critical bear case identified from current evidence."
    )

    # 9. Evidence completeness
    evidence_completeness_pct = _compute_evidence_completeness(sig, inferred_stage)

    # 10. Detect gaps
    gaps = _detect_gaps(dimension_results, inferred_stage, sig)
    critical_count = sum(1 for g in gaps if g["severity"] == "critical")
    important_count = sum(1 for g in gaps if g["severity"] in ["high", "medium"])
    strong_signals_count = sum(
        len(d["positive_signals"]) for d in dimension_results.values()
    )

    # 11. Generate improvement actions
    actions = _generate_actions(gaps)

    # 12. Program readiness (lightweight)
    program_readiness_items = _compute_program_readiness(overall_score, inferred_stage, gaps, sig)

    # -------------------------------------------------------------------------
    # Persist everything atomically
    # -------------------------------------------------------------------------
    with transaction.atomic():
        assessment = FundabilityAssessment.objects.create(
            startup=startup,
            declared_stage=declared_stage if declared_stage in dict(FundabilityAssessment.StageLabel.choices) else "pre_seed",
            inferred_stage=inferred_stage,
            stage_confidence=stage_confidence,
            stage_rationale=stage_rationale,
            overall_score=overall_score,
            conviction=conviction,
            confidence=confidence_label,
            confidence_interval_low=max(0.0, overall_score - ci_range),
            confidence_interval_high=min(100.0, overall_score + ci_range),
            evidence_completeness_pct=evidence_completeness_pct,
            bull_thesis=bull_thesis,
            bear_thesis=bear_thesis,
            critical_gaps_count=critical_count,
            important_gaps_count=important_count,
            strong_signals_count=strong_signals_count,
            deck_contradictions=sig.deck_contradictions,
            sector=getattr(startup, "industry", "") or "",
            target_funding_type="accelerator",
            target_amount_usd=getattr(startup, "total_funding_raised", None),
            is_current=True,
        )

        # Dimensions
        for dim_key, dim_data in dimension_results.items():
            FundabilityDimension.objects.create(
                assessment=assessment,
                dimension_key=dim_key,
                dimension_name=DIMENSION_NAMES[dim_key],
                raw_score=dim_data["raw_score"],
                weight_pct=dim_data["weight_pct"],
                weighted_contribution=dim_data["weighted_contribution"],
                evidence_state=dim_data["evidence_state"],
                confidence_pct=dim_data["confidence_pct"],
                stage_concern=dim_data["stage_concern"],
                positive_signals=dim_data["positive_signals"],
                missing_evidence=dim_data["missing_evidence"],
                justifications=dim_data["justifications"],
                recommended_actions=dim_data.get("recommended_actions", []),
            )

        # Gaps
        gap_objects: list[FundabilityGap] = []
        for gap_data in gaps:
            fg = FundabilityGap.objects.create(
                assessment=assessment,
                startup=startup,
                dimension_key=gap_data["dimension_key"],
                title=gap_data["title"],
                description=gap_data["description"],
                severity=gap_data["severity"],
                current_state=gap_data["current_state"],
                expected_state=gap_data["expected_state"],
                why_it_matters=gap_data["why_it_matters"],
                evidence_required=gap_data["evidence_required"],
                impact=gap_data["impact"],
                effort=gap_data["effort"],
                priority_rank=gap_data["priority_rank"],
            )
            gap_objects.append(fg)

        # Improvement actions
        gap_index: dict[int, FundabilityGap] = {g.priority_rank: g for g in gap_objects}
        for action_data in actions:
            matching_gap = next(
                (g for g in gap_objects if action_data.get("gap_title") in g.title or g.dimension_key == action_data.get("dimension_key") or True),
                gap_objects[0] if gap_objects else None,
            )
            if not matching_gap:
                continue
            # Find gap matching this action's dimension
            dim_gap = next(
                (g for g in gap_objects if g.dimension_key == list(ACTION_TEMPLATES.keys())[
                    min(action_data["priority_rank"], len(ACTION_TEMPLATES) - 1)
                ]),
                matching_gap,
            )
            # Use the gap that matches this action's dim_key via template lookup
            action_dim = next(
                (dk for dk, templates in ACTION_TEMPLATES.items()
                 for t in templates if t["title"] == action_data["title"]),
                None,
            )
            best_gap = next(
                (g for g in gap_objects if g.dimension_key == action_dim),
                matching_gap,
            )
            ImprovementAction.objects.create(
                gap=best_gap,
                startup=startup,
                action_type=action_data["action_type"],
                title=action_data["title"],
                description=action_data["description"],
                why_investors_care=action_data.get("why_investors_care", ""),
                evidence_missing=action_data.get("evidence_missing", ""),
                how_to_obtain=action_data.get("how_to_obtain", ""),
                target_milestone=action_data.get("target_milestone", ""),
                reassess_after=action_data.get("reassess_after", ""),
                estimated_score_delta=action_data.get("estimated_score_delta", 0.0),
                priority_rank=action_data["priority_rank"],
            )

        # Program readiness
        for pr_data in program_readiness_items:
            ProgramReadiness.objects.create(
                assessment=assessment,
                startup=startup,
                **pr_data,
            )

    logger.info(
        "Fundability assessment complete for %s: score=%.1f conviction=%s gaps=%d",
        startup.company_name,
        overall_score,
        conviction,
        len(gaps),
    )
    return assessment


# ---------------------------------------------------------------------------
# Program readiness helper
# ---------------------------------------------------------------------------

# Stage adjacency map: given a program's declared stage_focus, which startup
# inferred stages are considered a "strong" match vs "moderate" match.
_STAGE_BIAS: dict[str, list[str]] = {
    "idea":     ["idea"],
    "pre_seed": ["idea", "pre_seed"],
    "seed":     ["pre_seed", "seed"],
    "series_a": ["seed", "series_a"],
    "any":      ["idea", "pre_seed", "seed", "series_a", "series_b_plus"],
}


def _load_programs() -> list[dict]:
    """
    Load active AcceleratorProgram records from the database.
    Returns an empty list when no programs are configured — callers must
    handle the empty-list case gracefully.
    """
    try:
        from apps.accelerator.models import AcceleratorProgram  # local import avoids circular dependency
        programs = AcceleratorProgram.objects.filter(is_active=True).values(
            "id", "name", "stage_focus", "workflow_style"
        )
        result = []
        for p in programs:
            stage_focus = p["stage_focus"] or "any"
            result.append({
                "name": p["name"],
                "program_type": "accelerator",
                "stage_bias": _STAGE_BIAS.get(stage_focus, _STAGE_BIAS["any"]),
            })
        return result
    except Exception:
        logger.warning("Could not load AcceleratorProgram records for program readiness; returning empty list.")
        return []


def _compute_program_readiness(
    overall_score: float,
    inferred_stage: str,
    gaps: list[dict],
    sig: EvidenceSignals,
) -> list[dict]:
    results = []
    critical_gaps = [g for g in gaps if g["severity"] == "critical"]

    for prog in _load_programs():
        stage_match = inferred_stage in prog["stage_bias"]
        stage_bonus = 5 if stage_match else -10

        fit = min(100, max(20, int(overall_score * 0.85 + stage_bonus)))
        readiness = min(100, max(15, int(overall_score * 0.9 - len(critical_gaps) * 8 + stage_bonus)))

        if readiness >= 70:
            recommendation = "apply_now" if fit >= 75 else "strong_match"
        elif readiness >= 50:
            recommendation = "fix_first"
        else:
            recommendation = "not_yet"

        top_gap = critical_gaps[0]["title"] if critical_gaps else (
            gaps[0]["title"] if gaps else "No critical gaps"
        )

        results.append({
            "program_name": prog["name"],
            "program_type": prog["program_type"],
            "fit_score": fit,
            "readiness_score": readiness,
            "evidence_gaps_count": len(critical_gaps),
            "fit_rationale": (
                f"Stage alignment: {'strong' if stage_match else 'moderate'}. "
                f"Overall readiness: {readiness}/100."
            ),
            "top_gap": top_gap,
            "recommendation": recommendation,
        })

    return sorted(results, key=lambda x: x["fit_score"], reverse=True)
