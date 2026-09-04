"""
apps.investors.services.thesis_engine
=====================================
Dynamic Thesis Evaluation Engine.
Mathematically evaluates any StartupProfile against an institutional InvestmentMandate:
- Geography Fit (ISO codes & expansion regions)
- Sector taxonomy matching
- Stage fit & Conflict detection (declared vs inferred)
- Ticket & ask bracket fit
- Business model & founder preferences
- Hard exclusion scanning (crypto speculative, gambling, weapons, etc.)
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List
from django.utils.translation import gettext_lazy as _

from apps.users.models import StartupProfile
from apps.investors.models import InvestmentFund, InvestmentMandate


COUNTRY_REGION_MAP: Dict[str, List[str]] = {
    "west_africa": ["NG", "GH", "SN", "CI", "NIGERIA", "GHANA", "SENEGAL", "IVORY COAST"],
    "east_africa": ["KE", "RW", "UG", "TZ", "ET", "KENYA", "RWANDA", "UGANDA", "TANZANIA", "ETHIOPIA"],
    "southern_africa": ["ZA", "ZW", "BW", "NA", "SOUTH AFRICA", "ZIMBABWE", "BOTSWANA", "NAMIBIA"],
    "north_africa": ["EG", "MA", "TN", "DZ", "EGYPT", "MOROCCO", "TUNISIA", "ALGERIA"],
}

SECTOR_TAXONOMY: Dict[str, List[str]] = {
    "fintech": ["fintech", "payments", "banking", "credit", "lending", "neobank", "remittance", "defi"],
    "logistics": ["logistics", "supply_chain", "mobility", "freight", "transport", "delivery"],
    "b2b_saas": ["b2b", "saas", "software", "enterprise", "productivity", "infrastructure"],
    "healthtech": ["healthtech", "health", "biotech", "telemedicine", "pharma"],
    "climate": ["climate", "cleantech", "energy", "solar", "waste", "carbon", "agritech", "agriculture"],
    "ai": ["ai", "artificial intelligence", "machine learning", "deeptech"],
}


def normalize_string(val: str) -> str:
    return str(val or "").strip().lower()


def evaluate_mandate_fit(
    startup: StartupProfile,
    mandate: InvestmentMandate,
    target_ask_usd: Decimal | float = Decimal("500000"),
) -> Dict[str, Any]:
    """
    Executes a multi-pillar institutional evaluation of a startup against a fund mandate.
    Returns:
      overall_fit_score: float (0 - 100)
      breakdown: dict with sub-dimension percentages
      inferred_stage: str
      stage_conflict_detected: bool
      stage_conflict_notes: str
      critical_risks: list of str warnings
      is_auto_pass: bool
    """
    fund: InvestmentFund = mandate.fund
    critical_risks: List[str] = []
    is_auto_pass = False

    # 1. Hard Exclusion Check
    startup_text = f"{startup.company_name} {startup.industry} {getattr(startup, 'bio', '')}".lower()
    exclusion_list = mandate.exclusion_list or []
    for excluded in exclusion_list:
        if normalize_string(excluded) in startup_text:
            critical_risks.append(f"Hard Exclusion Triggered: Sector or keywords match excluded domain '{excluded}'.")
            is_auto_pass = True

    # 2. Geography Fit (Weight: 20%)
    location = normalize_string(startup.location)
    geo_whitelist = [normalize_string(g) for g in (mandate.geography_whitelist or [])]
    geo_score = 0.0

    if not geo_whitelist:
        geo_score = 100.0
    else:
        # Direct match or regional expansion match
        direct_match = any(g in location for g in geo_whitelist)
        if direct_match:
            geo_score = 100.0
        else:
            # Check regional groupings
            regional_match = False
            for region, countries in COUNTRY_REGION_MAP.items():
                if any(normalize_string(c) in location for c in countries):
                    if any(normalize_string(c) in geo_whitelist for c in countries):
                        geo_score = 80.0
                        regional_match = True
                        break
            if not regional_match:
                geo_score = 35.0
                critical_risks.append(f"Geographic mismatch: Startup location '{startup.location}' is outside fund whitelist.")

    # 3. Sector Fit (Weight: 25%)
    sector_whitelist = [normalize_string(s) for s in (mandate.sector_whitelist or [])]
    startup_industry = normalize_string(startup.industry)
    sector_score = 0.0

    if not sector_whitelist:
        sector_score = 100.0
    else:
        # Check taxonomy keywords
        matched_sectors = []
        for whitelist_sector in sector_whitelist:
            taxonomy_keys = SECTOR_TAXONOMY.get(whitelist_sector, [whitelist_sector])
            if any(k in startup_industry or k in startup_text for k in taxonomy_keys):
                matched_sectors.append(whitelist_sector)
        
        if matched_sectors:
            sector_score = 95.0
        else:
            sector_score = 30.0
            critical_risks.append(f"Sector mismatch: Industry '{startup.industry}' does not align with target sectors.")

    # 4. Stage Fit & Conflict Detection (Weight: 20%)
    declared_stage = normalize_string(startup.funding_stage or "pre_seed")
    revenue = float(startup.current_revenue or 0.0)
    customer_count = startup.customer_count or 0
    total_funding = float(startup.total_funding_raised or 0.0)

    # Infer empirical stage from verified traction metrics
    if revenue >= 50_000 or total_funding >= 1_500_000 or customer_count >= 500:
        inferred_stage = "series_a"
    elif revenue >= 10_000 or total_funding >= 300_000 or customer_count >= 50:
        inferred_stage = "seed"
    else:
        inferred_stage = "pre_seed"

    stage_conflict = False
    stage_conflict_notes = ""
    if declared_stage in ["seed", "series_a"] and inferred_stage == "pre_seed":
        stage_conflict = True
        stage_conflict_notes = (
            f"Founder declared {declared_stage.upper()} stage, but verified revenue (${revenue:,.0f}/mo) "
            f"and metrics reflect pilot-stage Pre-Seed traction."
        )
        critical_risks.append(f"Stage Conflict: {stage_conflict_notes}")

    stage_rules = [normalize_string(s) for s in (mandate.stage_rules or [])]
    if not stage_rules or inferred_stage in stage_rules or declared_stage in stage_rules:
        stage_score = 90.0 if not stage_conflict else 70.0
    else:
        stage_score = 40.0
        critical_risks.append(f"Stage mismatch: Mandate targets {stage_rules}, company is {inferred_stage}.")

    # 5. Check Size & Ticket Bracket Fit (Weight: 15%)
    ask_usd = Decimal(str(target_ask_usd))
    min_check = fund.min_check_size_usd
    max_check = fund.max_check_size_usd

    if min_check <= ask_usd <= max_check:
        check_score = 95.0
    elif ask_usd < min_check:
        # Smaller ask than minimum ticket
        ratio = float(ask_usd / min_check) if min_check else 1.0
        check_score = max(50.0, round(ratio * 90.0, 1))
    else:
        # Larger ask than maximum check
        ratio = float(max_check / ask_usd) if ask_usd else 1.0
        check_score = max(40.0, round(ratio * 90.0, 1))

    # 6. Business Model & Revenue Compliance (Weight: 10%)
    bmodel_score = 85.0
    if not mandate.pre_revenue_allowed and revenue <= 0:
        bmodel_score = 25.0
        critical_risks.append("Pre-revenue companies excluded by fund mandate.")
    elif revenue > 0 and revenue >= float(mandate.min_revenue_usd):
        bmodel_score = 95.0

    # 7. Founder Profile Alignment (Weight: 10%)
    founder_prefs = mandate.founder_preferences or {}
    founder_score = 80.0
    if founder_prefs.get("technical_founder_preferred") or founder_prefs.get("technical_founder_required"):
        # Look for engineering / CTO / technical indicators
        has_tech = any(k in startup_text for k in ["cto", "engineer", "software", "tech", "technical"])
        founder_score = 92.0 if has_tech else 68.0

    # Overall Weighted Calculation
    weights = {
        "geography_fit": (geo_score, 0.20),
        "sector_fit": (sector_score, 0.25),
        "stage_fit": (stage_score, 0.20),
        "check_size_fit": (check_score, 0.15),
        "business_model_fit": (bmodel_score, 0.10),
        "founder_fit": (founder_score, 0.10),
    }

    overall_fit = sum(val * w for val, w in weights.values())
    if is_auto_pass:
        overall_fit = min(overall_fit, 25.0)

    breakdown = {
        "geography_fit": round(geo_score, 1),
        "sector_fit": round(sector_score, 1),
        "stage_fit": round(stage_score, 1),
        "check_size_fit": round(check_score, 1),
        "business_model_fit": round(bmodel_score, 1),
        "founder_fit": round(founder_score, 1),
    }

    return {
        "overall_fit_score": round(overall_fit, 1),
        "breakdown": breakdown,
        "declared_stage": declared_stage,
        "inferred_stage": inferred_stage,
        "stage_conflict_detected": stage_conflict,
        "stage_conflict_notes": stage_conflict_notes,
        "critical_risks": critical_risks,
        "is_auto_pass": is_auto_pass or overall_fit < 50.0,
    }
