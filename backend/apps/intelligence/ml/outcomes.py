from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .anomalies import AnomalyDetectionEngine, MetricAnomalyReport
from .bayesian import BayesianUpdateEngine, ProbabilisticBelief
from .survival import SurvivalAnalysisEngine, SurvivalCurvePoint


@dataclass
class UnicornProbabilityProfile:
    company_name: str
    stage: str
    sector: str
    overall_fundability_score: float

    # Multi-task outcome probabilities (%)
    series_a_18m_probability: float
    series_b_36m_probability: float
    ten_m_arr_5y_probability: float
    hundred_m_valuation_5y_probability: float
    unicorn_one_b_valuation_probability: float

    # Bayesian Uncertainty & Credible Intervals
    bayesian_belief: ProbabilisticBelief
    confidence_tier: str  # "VERY_HIGH", "HIGH", "MODERATE", "SPECULATIVE"
    evidence_coverage_percentage: float
    prediction_uncertainty_score: float

    # Survival Curve
    survival_curve: List[SurvivalCurvePoint]

    # Explainability & Evidence Lineage
    primary_positive_drivers: List[str]
    primary_uncertainty_drivers: List[str]
    anomaly_audit_reports: List[MetricAnomalyReport]

    generated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class VentureOutcomePredictor:
    """
    Multi-Task Venture Outcome & Unicorn Forecast Engine.
    Jointly predicts:
    1. Series A in 18 Months
    2. Series B in 36 Months
    3. $10M ARR in 5 Years
    4. $100M Valuation in 5 Years
    5. Unicorn $1B Outcome Probability with Bayesian Credible Intervals
    """

    @classmethod
    def predict_venture_outcomes(
        cls,
        company_name: str,
        stage: str = "seed",
        sector: str = "enterprise_saas",
        base_fundability_score: float = 75.0,
        claimed_metrics: Optional[Dict[str, float]] = None,
        verified_evidence_ratio: float = 0.8,
        team_founder_spike: float = 80.0,
        moat_score: float = 70.0,
    ) -> UnicornProbabilityProfile:
        metrics = claimed_metrics or {
            "mom_growth_pct": 18.0,
            "gross_margin_pct": 75.0,
            "net_revenue_retention_pct": 120.0,
            "cac_payback_months": 11.0,
        }

        # 1. Initialize Bayesian prior & update with verified evidence
        belief = BayesianUpdateEngine.initialize_belief(stage=stage, sector=sector)
        pos_weight = (base_fundability_score / 20.0) * verified_evidence_ratio
        neg_weight = ((100.0 - base_fundability_score) / 25.0) + (1.0 - verified_evidence_ratio) * 4.0

        updated_belief = BayesianUpdateEngine.update_belief(
            belief=belief,
            positive_evidence_weight=pos_weight,
            negative_evidence_weight=neg_weight,
            evidence_confidence=verified_evidence_ratio,
        )

        # 2. Check metric anomalies
        anomaly_reports = []
        for k, v in metrics.items():
            rep = AnomalyDetectionEngine.audit_metric(k, v, sector)
            if rep.is_anomaly:
                anomaly_reports.append(rep)

        # 3. Calculate survival curve
        survival_curve = SurvivalAnalysisEngine.calculate_fundraising_survival_curve(
            stage=stage,
            traction_velocity_score=base_fundability_score,
            runway_months=16.0,
        )

        # 4. Multi-Task Outcome Heads
        post_p = updated_belief.posterior_probability

        series_a_prob = round(
            min(95.0, max(5.0, (base_fundability_score * 0.45) + (post_p * 60.0) + (team_founder_spike * 0.20))),
            1,
        )
        series_b_prob = round(min(90.0, max(3.0, series_a_prob * 0.72)), 1)
        ten_m_arr_prob = round(
            min(85.0, max(2.0, (base_fundability_score * 0.40) + (moat_score * 0.35))),
            1,
        )
        hundred_m_val_prob = round(min(75.0, max(1.5, ten_m_arr_prob * 0.55)), 1)

        # Unicorn $1B probability is long-tailed power law: typical baseline 1% to 12%
        unicorn_prob = round(
            min(25.0, max(0.5, (hundred_m_val_prob * 0.25) * (team_founder_spike / 80.0))),
            2,
        )

        # 5. Explainability drivers
        pos_drivers = []
        if verified_evidence_ratio >= 0.7:
            pos_drivers.append(f"High verified evidence coverage ({round(verified_evidence_ratio * 100)}%)")
        if team_founder_spike >= 75.0:
            pos_drivers.append("Strong founder-market fit & technical execution spike")
        if base_fundability_score >= 70.0:
            pos_drivers.append("Disciplined unit economics & defensible GTM trajectory")
        if not pos_drivers:
            pos_drivers.append("Early baseline market alignment")

        unc_drivers = []
        if verified_evidence_ratio < 0.6:
            unc_drivers.append("Unverified secondary claims in deck extraction")
        if anomaly_reports:
            unc_drivers.append(f"{len(anomaly_reports)} statistical outlier metrics flagged for verification")
        if updated_belief.uncertainty_score > 1.5:
            unc_drivers.append("Limited historical revenue observation depth")
        if not unc_drivers:
            unc_drivers.append("Normal early-stage macro execution variance")

        # 6. Confidence Tier
        if verified_evidence_ratio >= 0.85 and updated_belief.uncertainty_score < 1.0:
            confidence = "VERY_HIGH"
        elif verified_evidence_ratio >= 0.65:
            confidence = "HIGH"
        elif verified_evidence_ratio >= 0.40:
            confidence = "MODERATE"
        else:
            confidence = "SPECULATIVE"

        return UnicornProbabilityProfile(
            company_name=company_name,
            stage=stage,
            sector=sector,
            overall_fundability_score=round(base_fundability_score, 1),
            series_a_18m_probability=series_a_prob,
            series_b_36m_probability=series_b_prob,
            ten_m_arr_5y_probability=ten_m_arr_prob,
            hundred_m_valuation_5y_probability=hundred_m_val_prob,
            unicorn_one_b_valuation_probability=unicorn_prob,
            bayesian_belief=updated_belief,
            confidence_tier=confidence,
            evidence_coverage_percentage=round(verified_evidence_ratio * 100, 1),
            prediction_uncertainty_score=updated_belief.uncertainty_score,
            survival_curve=survival_curve,
            primary_positive_drivers=pos_drivers,
            primary_uncertainty_drivers=unc_drivers,
            anomaly_audit_reports=anomaly_reports,
        )
