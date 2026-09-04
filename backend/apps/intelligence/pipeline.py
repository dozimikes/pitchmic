"""
apps.intelligence.pipeline
===========================
Multi-agent due diligence pipeline.

Architecture
------------
Stage 1: ForensicAuditor   - extract financial DNA, red flags, founder signals
Stage 2: MarketStrategist  - competitive landscape, TAM validation, timing
Stage 3: ManagingPartner   - synthesise Stage 1+2, run bull/bear debate
Stage 4: MemoGenerator     - produce cited IC memo from all prior outputs

Each stage is implemented as a pure function that receives structured data and
returns a dict.  When an LLM API key is configured (OPENAI_API_KEY or
GOOGLE_GEMINI_API_KEY) the stage makes a real API call; otherwise it falls back
to a deterministic heuristic so the pipeline always completes.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict
from typing import Any, Optional

logger = logging.getLogger(__name__)

#  LLM client helpers (routed through predictive_intelligence AI gateway)

def _call_llm(prompt: str, model: Optional[str] = None, max_tokens: int = 1200) -> str:
    """
    Attempt an LLM call through the centralized AI gateway.
    Returns the raw text response or raises RuntimeError if AI unavailable.
    """
    from apps.predictive_intelligence.ai_gateway import ai_complete, is_ai_enabled

    if not is_ai_enabled():
        raise RuntimeError("AI features disabled; use heuristic fallback path")

    response = ai_complete(
        prompt,
        max_tokens=max_tokens,
        temperature=0.2,
        json_mode=True,
        model=model,
    )
    if response.fallback:
        msg = response.error or "AI provider returned fallback response"
        raise RuntimeError(msg)
    return response.text


def _llm_available() -> bool:
    """True iff the centralized gateway reports AI enabled + available."""
    from apps.predictive_intelligence.ai_gateway import is_ai_enabled
    return is_ai_enabled()


#  Stage helpers 

def _startup_context(startup) -> dict[str, Any]:
    """Build a serialisable snapshot of the startup for prompt injection."""
    pitches = [
        {
            "title": p.title,
            "problem": p.problem,
            "solution": p.solution,
            "asking_amount": str(p.asking_amount or ""),
            "equity_offered": str(p.equity_offered or ""),
            "traction": p.traction,
            "business_model": p.business_model,
        }
        for p in startup.pitches.filter(is_draft=False)[:3]
    ]
    team = [
        {"name": m.name, "role": m.role, "bio": m.bio[:200] if m.bio else ""}
        for m in startup.team_members.all()[:6]
    ]
    return {
        "company_name": startup.company_name,
        "industry": startup.industry or startup.niche,
        "location": startup.location,
        "funding_stage": startup.funding_stage,
        "founded_year": startup.founded_year,
        "current_revenue": str(startup.current_revenue or ""),
        "gross_margin": startup.gross_margin,
        "burn_rate": str(startup.burn_rate or ""),
        "runway_months": startup.runway_months,
        "cac": str(startup.customer_acquisition_cost or ""),
        "ltv": str(startup.customer_lifetime_value or ""),
        "tam": str(startup.tam or ""),
        "market_growth_rate": startup.market_growth_rate,
        "customer_count": startup.customer_count,
        "patent_count": startup.patent_count,
        "pitches": pitches,
        "team": team,
    }


#  Stage 1: Forensic Auditor 

def forensic_audit(startup) -> dict:
    """Extract unit economics, red flags, and founder signals."""
    from apps.predictive_intelligence.ai_gateway import is_feature_enabled

    ctx = _startup_context(startup)

    if _llm_available() and is_feature_enabled("dd.forensic_audit"):
        prompt = f"""
You are a Forensic Auditor reviewing a startup for venture investment.
Respond ONLY with valid JSON matching this schema exactly:
{{
  "unit_economics": {{"cac": number|null, "ltv": number|null, "gross_margin": number|null,
                       "burn_rate": number|null, "runway_months": number|null}},
  "red_flags": ["string"],
  "founder_signals": {{"experience_score": 0-10, "domain_expertise": 0-10, "team_completeness": 0-10}},
  "financial_health": "strong|moderate|weak|insufficient_data",
  "summary": "string (max 200 words)"
}}

Startup data:
{json.dumps(ctx, indent=2)}
"""
        try:
            text = _call_llm(prompt, max_tokens=800)
            result = json.loads(text)
            logger.info("ForensicAuditor LLM call succeeded for startup=%s", startup.pk)
            return result
        except Exception as exc:
            logger.warning("ForensicAuditor LLM fallback: %s", exc)

    # Heuristic fallback augmented with PitchDeckForensicsService
    from apps.intelligence.forensics import PitchDeckForensicsService
    forensic_srv = PitchDeckForensicsService()
    deck_text = " ".join([p.get("problem", "") + " " + p.get("solution", "") for p in ctx.get("pitches", [])])
    forensic_report = forensic_srv.analyze_deck_content(
        company_name=startup.company_name,
        deck_text=deck_text or f"{startup.company_name} in {startup.industry}",
        structured_metrics={
            "cac": float(startup.customer_acquisition_cost) if startup.customer_acquisition_cost else None,
            "ltv": float(startup.customer_lifetime_value) if startup.customer_lifetime_value else None,
            "gross_margin": startup.gross_margin,
            "burn_rate": float(startup.burn_rate) if startup.burn_rate else None,
            "runway_months": startup.runway_months,
            "current_revenue": float(startup.current_revenue) if startup.current_revenue else None,
            "industry": startup.industry,
        },
    )

    red_flags = list(forensic_report.unit_economics.anomalies)
    if not startup.runway_months or startup.runway_months < 12:
        red_flags.append("Low runway (< 12 months)")
    if not startup.customer_count:
        red_flags.append("No paying customers disclosed")
    if not startup.gross_margin:
        red_flags.append("Gross margin not provided")
    if len(list(startup.team_members.all())) < 2:
        red_flags.append("Solo founder - no co-founder")

    health = (
        "strong" if startup.current_revenue and (startup.runway_months or 0) >= 18 and forensic_report.unit_economics.is_mathematically_coherent
        else "moderate" if startup.current_revenue
        else "insufficient_data"
    )

    return {
        "unit_economics": {
            "cac": float(startup.customer_acquisition_cost) if startup.customer_acquisition_cost else None,
            "ltv": float(startup.customer_lifetime_value) if startup.customer_lifetime_value else None,
            "gross_margin": startup.gross_margin,
            "burn_rate": float(startup.burn_rate) if startup.burn_rate else None,
            "runway_months": startup.runway_months,
            "cac_ltv_ratio": forensic_report.unit_economics.cac_ltv_ratio,
            "is_mathematically_coherent": forensic_report.unit_economics.is_mathematically_coherent,
        },
        "red_flags": red_flags,
        "founder_signals": {
            "experience_score": 7,
            "domain_expertise": 6,
            "team_completeness": min(10, len(list(startup.team_members.all())) * 2),
        },
        "financial_health": health,
        "verified_claims": [asdict(c) if hasattr(c, "__dataclass_fields__") else c for c in forensic_report.verified_claims],
        "summary": f"{startup.company_name} has {len(red_flags)} red flags identified. Financial health: {health}.",
    }


#  Stage 2: Market Strategist 

def market_strategy(startup, forensic: dict) -> dict:
    """Analyse competitive landscape, market sizing, and timing."""
    from apps.predictive_intelligence.ai_gateway import is_feature_enabled

    ctx = _startup_context(startup)

    if _llm_available() and is_feature_enabled("dd.market_strategist"):
        prompt = f"""
You are a Market Strategist evaluating a startup for venture investment.
Respond ONLY with valid JSON matching this schema exactly:
{{
  "market_size_validation": {{"tam_estimate": number|null, "sam_estimate": number|null,
                              "growth_rate_pct": number|null, "confidence": "high|medium|low"}},
  "competitive_positioning": {{"direct_competitors": ["string"], "differentiation_score": 0-10,
                               "moat_type": "string", "moat_strength": "strong|moderate|weak"}},
  "market_timing": {{"score": 0-10, "rationale": "string"}},
  "regulatory_risks": ["string"],
  "market_verdict": "attractive|neutral|unattractive",
  "summary": "string (max 200 words)"
}}

Startup data:
{json.dumps(ctx, indent=2)}

Forensic audit output:
{json.dumps(forensic, indent=2)}
"""
        try:
            text = _call_llm(prompt, max_tokens=900)
            result = json.loads(text)
            logger.info("MarketStrategist LLM call succeeded for startup=%s", startup.pk)
            return result
        except Exception as exc:
            logger.warning("MarketStrategist LLM fallback: %s", exc)

    # Heuristic fallback
    return {
        "market_size_validation": {
            "tam_estimate": float(startup.tam) if startup.tam else None,
            "sam_estimate": float(startup.sam) if startup.sam else None,
            "growth_rate_pct": startup.market_growth_rate,
            "confidence": "medium" if startup.tam else "low",
        },
        "competitive_positioning": {
            "direct_competitors": [],
            "differentiation_score": 6,
            "moat_type": "technology" if startup.patent_count else "brand",
            "moat_strength": "strong" if (startup.patent_count or 0) >= 2 else "moderate",
        },
        "market_timing": {"score": 7, "rationale": "Market conditions are broadly favourable."},
        "regulatory_risks": [],
        "market_verdict": "attractive" if startup.tam else "neutral",
        "summary": f"Market analysis for {startup.company_name} based on available data.",
    }


#  Stage 3: Managing Partner (Synthesis) 

def managing_partner_synthesis(startup, forensic: dict, market: dict) -> dict:
    """Synthesise auditor + strategist outputs, run bull/bear debate."""
    from apps.predictive_intelligence.ai_gateway import is_feature_enabled

    ctx = _startup_context(startup)

    if _llm_available() and is_feature_enabled("dd.managing_partner"):
        prompt = f"""
You are a Managing Partner at a venture capital firm making a final investment decision.
Respond ONLY with valid JSON matching this schema exactly:
{{
  "verdict": "invest|pass|monitor|needs_info",
  "overall_score": 0-100,
  "bull_arguments": ["string"],
  "bear_arguments": ["string"],
  "recommended_check_size": number|null,
  "recommended_terms": "string",
  "due_diligence_gaps": ["string"],
  "summary": "string (max 300 words)"
}}

Startup data:
{json.dumps(ctx, indent=2)}
Forensic audit:
{json.dumps(forensic, indent=2)}
Market strategy:
{json.dumps(market, indent=2)}
"""
        try:
            text = _call_llm(prompt, max_tokens=1000)
            result = json.loads(text)
            return result
        except Exception as exc:
            logger.warning("ManagingPartner LLM fallback: %s", exc)

    # Heuristic fallback
    red_flags = forensic.get("red_flags", [])
    market_verdict = market.get("market_verdict", "neutral")
    fin_health = forensic.get("financial_health", "insufficient_data")

    score = 50
    if fin_health == "strong":
        score += 20
    elif fin_health == "moderate":
        score += 10
    if market_verdict == "attractive":
        score += 15
    score -= len(red_flags) * 5

    verdict = "invest" if score >= 70 else "monitor" if score >= 50 else "pass"

    return {
        "verdict": verdict,
        "overall_score": max(0, min(100, score)),
        "bull_arguments": [
            f"{startup.company_name} operates in an {market_verdict} market",
            f"Financial health is {fin_health}",
        ],
        "bear_arguments": red_flags[:3],
        "recommended_check_size": None,
        "recommended_terms": "Seed terms with standard pro-rata rights",
        "due_diligence_gaps": ["Customer reference calls", "Technical architecture review"],
        "summary": f"Verdict: {verdict}. Overall score: {score}/100. {len(red_flags)} red flags identified.",
    }


#  Stage 4: IC Memo Generator 

def generate_ic_memo(startup, forensic: dict, market: dict, partner: dict) -> str:
    """Generate a full Investment Committee memo."""
    company = startup.company_name
    verdict = partner.get("verdict", "pass").upper()
    score = partner.get("overall_score", 50)
    bulls = "\n".join(f"• {a}" for a in partner.get("bull_arguments", []))
    bears = "\n".join(f"• {a}" for a in partner.get("bear_arguments", []))
    gaps = "\n".join(f"• {g}" for g in partner.get("due_diligence_gaps", []))
    unit = forensic.get("unit_economics", {})
    market_pos = market.get("competitive_positioning", {})

    return f"""
INVESTMENT COMMITTEE MEMO - {company.upper()}
{'=' * 60}
VERDICT: {verdict}  |  OVERALL SCORE: {score}/100

EXECUTIVE SUMMARY
-----------------
{partner.get('summary', 'No summary available.')}

TEAM ASSESSMENT
---------------
Founder signals: Experience {forensic.get('founder_signals', {}).get('experience_score', 'N/A')}/10,
Domain expertise {forensic.get('founder_signals', {}).get('domain_expertise', 'N/A')}/10,
Team completeness {forensic.get('founder_signals', {}).get('team_completeness', 'N/A')}/10.

UNIT ECONOMICS
--------------
• CAC:           ${unit.get('cac', 'N/A')}
• LTV:           ${unit.get('ltv', 'N/A')}
• Gross Margin:  {unit.get('gross_margin', 'N/A')}%
• Burn Rate:     ${unit.get('burn_rate', 'N/A')}/month
• Runway:        {unit.get('runway_months', 'N/A')} months

MARKET ANALYSIS
---------------
{market.get('summary', 'No market analysis available.')}
Moat: {market_pos.get('moat_type', 'N/A')} ({market_pos.get('moat_strength', 'N/A')})
Market timing score: {market.get('market_timing', {}).get('score', 'N/A')}/10

BULL CASE
---------
{bulls or 'None identified.'}

BEAR CASE
---------
{bears or 'None identified.'}

DUE DILIGENCE GAPS
------------------
{gaps or 'None.'}

FINANCIAL HEALTH: {forensic.get('financial_health', 'N/A').upper()}
RED FLAGS: {', '.join(forensic.get('red_flags', [])) or 'None'}

RECOMMENDATION: {partner.get('recommended_terms', 'N/A')}
""".strip()


#  Pipeline entry point 

def run_due_diligence(startup) -> dict:
    """
    Execute the full 4-stage pipeline and return a dict suitable for writing
    into a DueDiligenceReport instance.
    """
    from django.utils import timezone

    stage1 = forensic_audit(startup)
    stage2 = market_strategy(startup, stage1)
    stage3 = managing_partner_synthesis(startup, stage1, stage2)
    memo = generate_ic_memo(startup, stage1, stage2, stage3)

    scorecard = {
        "innovators": stage1.get("founder_signals", {}).get("experience_score", 5),
        "market": int(stage2.get("market_size_validation", {}).get("tam_estimate", 0) / 1e8) if stage2.get("market_size_validation", {}).get("tam_estimate") else 5,
        "product": stage1.get("founder_signals", {}).get("domain_expertise", 5),
        "financials": 8 if stage1.get("financial_health") == "strong" else 5 if stage1.get("financial_health") == "moderate" else 2,
        "timing": stage2.get("market_timing", {}).get("score", 5),
        "competitive_moat": {"strong": 9, "moderate": 6, "weak": 3}.get(stage2.get("competitive_positioning", {}).get("moat_strength", "moderate"), 5),
        "execution": stage3.get("overall_score", 50) // 10,
    }

    return {
        "status": "complete",
        "verdict": stage3.get("verdict", "pass"),
        "overall_score": stage3.get("overall_score", 50) / 100.0,
        "forensic_analysis": stage1,
        "market_analysis": stage2,
        "investment_memo": memo,
        "citations": [],  # populated when RAG is configured
        "bull_arguments": stage3.get("bull_arguments", []),
        "bear_arguments": stage3.get("bear_arguments", []),
        "scorecard": scorecard,
        "completed_at": timezone.now(),
    }
