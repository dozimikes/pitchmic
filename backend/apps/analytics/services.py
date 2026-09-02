"""
apps.analytics.services
========================
Rule-based / heuristic prediction engine.

This service produces FundraisingPrediction data using structured startup
fields (financial metrics, traction, team size, market data).  It is
intentionally dependency-free — no heavy ML libraries required at runtime.

When the full ML service (ml/ FastAPI container) is running, the Celery task
can delegate to it via HTTP.  This module serves as the reliable fallback and
default for the MVP.

Scoring method
--------------
Each dimension is scored 0–100, then normalised to 0–1.  Weights reflect
academic consensus on startup success factors:
  Team (35%), Market (25%), Traction (20%), Financials (15%), Product (5%)
"""
from __future__ import annotations

import logging
import math
import random
from decimal import Decimal

logger = logging.getLogger(__name__)


def _safe_float(value) -> float:
    """Convert Decimal / str / None to float gracefully."""
    try:
        return float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


class StartupScoringEngine:
    """
    Deterministic, rule-based scoring engine used for the MVP.
    Produces all sub-scores and a weighted composite success probability.
    """

    # Dimension weights (must sum to 1.0)
    WEIGHTS = {
        "team": 0.35,
        "market": 0.25,
        "traction": 0.20,
        "financials": 0.15,
        "product": 0.05,
    }

    def score(self, startup) -> dict:
        """
        Entry point.  Returns a fully-populated dict ready to be written
        into a FundraisingPrediction row.
        """
        team_score = self._score_team(startup)
        market_score = self._score_market(startup)
        traction_score = self._score_traction(startup)
        financial_score = self._score_financials(startup)
        product_score = self._score_product(startup)

        success_prob = round(
            self.WEIGHTS["team"] * team_score
            + self.WEIGHTS["market"] * market_score
            + self.WEIGHTS["traction"] * traction_score
            + self.WEIGHTS["financials"] * financial_score
            + self.WEIGHTS["product"] * product_score,
            4,
        )
        # Confidence narrows as more data is available
        data_completeness = self._data_completeness(startup)
        margin = round(0.25 * (1 - data_completeness), 4)

        exit_pred = self._predict_exit(startup, success_prob)
        roi = self._predict_roi(success_prob, startup)
        market_pot = self._predict_market_potential(startup)
        growth = self._predict_growth(startup)
        risk = self._predict_risk(startup, success_prob)

        features = self._top_features(
            team=team_score,
            market=market_score,
            traction=traction_score,
            financials=financial_score,
            product=product_score,
        )

        explanation = self._explain(startup, success_prob, features)

        return {
            "success_probability": success_prob,
            "confidence_lower": max(0.0, round(success_prob - margin, 4)),
            "confidence_upper": min(1.0, round(success_prob + margin, 4)),
            "team_score": round(team_score * 100, 1),
            "market_score": round(market_score * 100, 1),
            "traction_score": round(traction_score * 100, 1),
            "product_score": round(product_score * 100, 1),
            "scalability_score": round((market_score * 0.5 + financial_score * 0.5) * 100, 1),
            "uniqueness_score": round(product_score * 100, 1),
            "exit_prediction": exit_pred,
            "investor_roi": roi,
            "market_potential": market_pot,
            "growth_trajectory": growth,
            "risk_profile": risk,
            "benchmarks": self._benchmarks(startup, success_prob),
            "top_features": features,
            "explanation": explanation,
            "confidence_score": round(data_completeness, 4),
            "model_version": "heuristic-v1",
        }

    #  dimension scorers (returns 0–1) 

    def _score_team(self, startup) -> float:
        score = 0.0
        members = list(startup.team_members.all())
        # Team size
        n = len(members)
        score += min(n / 4, 1.0) * 0.4
        # Founder data completeness
        founders = [m for m in members if "founder" in (m.role or "").lower()]
        if founders:
            f = founders[0]
            if f.linkedin:
                score += 0.2
            if f.bio and len(f.bio) > 50:
                score += 0.2
        # Company age
        if startup.founded_year:
            age = 2026 - startup.founded_year
            score += min(age / 5, 1.0) * 0.2
        return min(score, 1.0)

    def _score_market(self, startup) -> float:
        score = 0.0
        if startup.tam:
            # TAM > $1B scores full points
            score += min(_safe_float(startup.tam) / 1e9, 1.0) * 0.4
        if startup.market_growth_rate:
            # Growth > 30% CAGR scores full
            score += min(_safe_float(startup.market_growth_rate) / 30, 1.0) * 0.4
        if startup.target_market:
            score += 0.2
        return min(score, 1.0)

    def _score_traction(self, startup) -> float:
        score = 0.0
        if startup.customer_count:
            score += min(_safe_float(startup.customer_count) / 1000, 1.0) * 0.3
        if startup.monthly_active_users:
            score += min(_safe_float(startup.monthly_active_users) / 10000, 1.0) * 0.3
        if startup.current_revenue:
            score += min(_safe_float(startup.current_revenue) / 1_000_000, 1.0) * 0.4
        return min(score, 1.0)

    def _score_financials(self, startup) -> float:
        score = 0.0
        if startup.runway_months:
            score += min(_safe_float(startup.runway_months) / 24, 1.0) * 0.3
        if startup.gross_margin is not None:
            score += min(_safe_float(startup.gross_margin) / 80, 1.0) * 0.3
        if startup.customer_lifetime_value and startup.customer_acquisition_cost:
            ltv = _safe_float(startup.customer_lifetime_value)
            cac = _safe_float(startup.customer_acquisition_cost)
            if cac > 0:
                ratio = ltv / cac
                score += min(ratio / 5, 1.0) * 0.4
        return min(score, 1.0)

    def _score_product(self, startup) -> float:
        score = 0.0
        if startup.github_url:
            score += 0.2
        if startup.patent_count:
            score += min(startup.patent_count / 3, 1.0) * 0.4
        if startup.press_coverage_count:
            score += min(startup.press_coverage_count / 10, 1.0) * 0.2
        if startup.awards_count:
            score += min(startup.awards_count / 3, 1.0) * 0.2
        return min(score, 1.0)

    def _data_completeness(self, startup) -> float:
        """Fraction of ML fields that have non-null values."""
        fields = [
            startup.tam, startup.sam, startup.current_revenue,
            startup.gross_margin, startup.burn_rate, startup.runway_months,
            startup.customer_count, startup.monthly_active_users,
            startup.funding_stage, startup.market_growth_rate,
        ]
        filled = sum(1 for f in fields if f is not None and f != 0 and f != "")
        return filled / len(fields)

    #  prediction builders 

    def _predict_exit(self, startup, success_prob: float) -> dict:
        if success_prob >= 0.7:
            exit_type = "Acquisition"
            timeline = round(4.5 + (1 - success_prob) * 3, 1)
        elif success_prob >= 0.45:
            exit_type = "Bootstrapped_Success"
            timeline = round(6 + (1 - success_prob) * 4, 1)
        else:
            exit_type = "Failure"
            timeline = None

        tam = _safe_float(startup.tam) if startup.tam else 0
        floor_val = round(tam * success_prob * 0.05) if tam else None
        ceiling_val = round(tam * success_prob * 0.3) if tam else None

        return {
            "exit_type": exit_type,
            "exit_probability": round(success_prob, 4),
            "timeline_years": timeline,
            "valuation_floor": floor_val,
            "valuation_ceiling": ceiling_val,
            "probabilities": {
                "Acquisition": round(success_prob * 0.6, 4),
                "IPO": round(success_prob * 0.1, 4),
                "Bootstrapped_Success": round(success_prob * 0.3, 4),
                "Failure": round(1 - success_prob, 4),
            },
        }

    def _predict_roi(self, success_prob: float, startup) -> dict:
        base_roi = 1.0 + (success_prob * 8)  # 1x–9x range
        # Simple Monte Carlo approximation with math (no numpy)
        results = [
            base_roi * (0.6 + 0.8 * (i / 999))
            for i in range(1000)
        ]
        results.sort()
        return {
            "expected_roi_3yr": round(base_roi * 0.5, 2),
            "expected_roi_5yr": round(base_roi, 2),
            "expected_roi_10yr": round(base_roi * 2.2, 2),
            "best_case": round(results[949], 2),
            "worst_case": round(results[49], 2),
            "median_case": round(results[499], 2),
            "risk_adjusted_roi": round(base_roi * success_prob, 2),
            "probability_positive_roi": round(success_prob * 0.95 + 0.05, 4),
        }

    def _predict_market_potential(self, startup) -> dict:
        tam = _safe_float(startup.tam) if startup.tam else 0
        market_cap = round(tam * 0.05) if tam else None
        return {
            "tam_growth_rate": _safe_float(startup.market_growth_rate) if startup.market_growth_rate else None,
            "market_cap_prediction": market_cap,
            "market_cap_timeline": "7 years" if market_cap else None,
            "disruption_potential": round(
                (1 if startup.patent_count else 0) * 0.3
                + (1 if startup.github_url else 0) * 0.2
                + 0.5,
                2,
            ),
            "moat_strength": (
                "strong" if startup.patent_count and startup.patent_count >= 2
                else "moderate" if startup.patent_count
                else "weak"
            ),
        }

    def _predict_growth(self, startup) -> dict:
        revenue_growth = _safe_float(startup.revenue_growth_rate) if startup.revenue_growth_rate else 0
        if revenue_growth >= 2.0:
            phase = "hypergrowth"
        elif revenue_growth >= 1.0:
            phase = "fast_growth"
        elif revenue_growth > 0:
            phase = "growth"
        else:
            phase = "early_stage"

        return {
            "growth_phase": phase,
            "projected_y1_growth": round(revenue_growth, 2) if revenue_growth else None,
            "projected_y2_growth": round(revenue_growth * 0.75, 2) if revenue_growth else None,
            "projected_y3_growth": round(revenue_growth * 0.55, 2) if revenue_growth else None,
            "hockey_stick_year": 2 if phase in ("hypergrowth", "fast_growth") else 3,
            "growth_velocity": "high" if revenue_growth >= 1.5 else "medium" if revenue_growth >= 0.5 else "low",
            "requires_funding": (startup.runway_months or 24) < 18,
            "funding_gap": (
                float(startup.burn_rate) * 18 - float(startup.total_funding_raised or 0)
                if startup.burn_rate
                else None
            ),
        }

    def _predict_risk(self, startup, success_prob: float) -> dict:
        risk_level = (
            "low" if success_prob >= 0.7
            else "medium_low" if success_prob >= 0.55
            else "medium" if success_prob >= 0.40
            else "high"
        )
        mitigations = []
        if not startup.runway_months or startup.runway_months < 12:
            mitigations.append("Extend runway: prioritise revenue or bridge funding")
        if not startup.customer_count:
            mitigations.append("Demonstrate product-market fit with paying customers")
        if len(list(startup.team_members.all())) < 2:
            mitigations.append("Hire a co-founder or key technical lead")
        if not startup.tam:
            mitigations.append("Quantify total addressable market with cited research")

        return {
            "overall_risk": risk_level,
            "technical_risk": "low" if startup.github_url else "medium",
            "market_risk": "low" if startup.market_growth_rate and startup.market_growth_rate > 15 else "medium",
            "team_risk": "low" if len(list(startup.team_members.all())) >= 3 else "medium",
            "financial_risk": "low" if (startup.runway_months or 0) >= 18 else "high",
            "execution_risk": risk_level,
            "mitigations": mitigations,
        }

    def _benchmarks(self, startup, success_prob: float) -> dict:
        industry = (startup.industry or startup.niche or "General").split(",")[0].strip()
        benchmarks_db = {
            "SaaS": {"success_rate": 0.12, "avg_exit_value": 50_000_000, "time_to_exit": 5.2},
            "FinTech": {"success_rate": 0.15, "avg_exit_value": 75_000_000, "time_to_exit": 4.8},
            "Healthcare": {"success_rate": 0.09, "avg_exit_value": 120_000_000, "time_to_exit": 6.5},
            "General": {"success_rate": 0.10, "avg_exit_value": 40_000_000, "time_to_exit": 5.5},
        }
        bench = benchmarks_db.get(industry, benchmarks_db["General"])
        percentile = min(99, max(1, int(success_prob / bench["success_rate"] * 50)))

        return {
            "industry": industry,
            "industry_success_rate": bench["success_rate"],
            "industry_avg_exit_value": bench["avg_exit_value"],
            "peer_group_percentile": percentile,
            "category_ranking": (
                "top_10_percent" if percentile >= 90
                else "top_25_percent" if percentile >= 75
                else "average"
            ),
            "similar_startups": [],  # populated by ML service in production
        }

    def _top_features(self, **scores: float) -> list[dict]:
        items = sorted(scores.items(), key=lambda x: -x[1])
        return [
            {"feature": k, "importance": round(v, 3), "direction": "positive" if v >= 0.5 else "neutral"}
            for k, v in items[:5]
        ]

    def _explain(self, startup, success_prob: float, features: list[dict]) -> str:
        top = features[0]["feature"] if features else "team"
        level = "strong" if success_prob >= 0.65 else "moderate" if success_prob >= 0.45 else "early-stage"
        return (
            f"{startup.company_name} shows a {level} fundraising profile with a "
            f"{success_prob * 100:.0f}% predicted success probability. "
            f"The most influential factor is {top}. "
            f"Key improvements: {'  '.join(f['feature'] for f in features if f['importance'] < 0.5)[:200] or 'continue current trajectory'}."
        )
