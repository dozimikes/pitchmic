import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


@dataclass
class ProbabilisticBelief:
    prior_alpha: float
    prior_beta: float
    posterior_alpha: float
    posterior_beta: float
    prior_probability: float
    posterior_probability: float
    credible_interval_5: float
    credible_interval_50: float
    credible_interval_95: float
    uncertainty_score: float  # High variance = high uncertainty
    evidence_weight_applied: float
    update_history: List[Dict[str, float]]


class BayesianUpdateEngine:
    """
    Bayesian Inference & Uncertainty Engine.
    Uses Beta-Binomial conjugate updating for milestone and success probabilities.
    Prevents static single-point estimates by modeling posterior distributions and credible intervals.
    """

    # Sector & Stage Prior Calibration Baselines (alpha, beta)
    STAGE_PRIORS = {
        "pre_seed": (2.0, 18.0),  # Baseline ~10% conversion
        "seed": (3.0, 12.0),      # Baseline ~20% conversion
        "series_a": (5.0, 10.0),  # Baseline ~33% conversion
        "series_b": (6.0, 6.0),   # Baseline ~50% conversion
    }

    SECTOR_VOLATILITY_MULTIPLIER = {
        "fintech": 1.1,
        "ai_infrastructure": 1.3,
        "enterprise_saas": 1.0,
        "healthtech": 1.2,
        "climate_hardware": 1.4,
        "consumer": 1.5,
    }

    @classmethod
    def beta_mean(cls, a: float, b: float) -> float:
        return a / (a + b)

    @classmethod
    def beta_variance(cls, a: float, b: float) -> float:
        return (a * b) / (((a + b) ** 2) * (a + b + 1))

    @classmethod
    def approximate_credible_intervals(
        cls, a: float, b: float
    ) -> Tuple[float, float, float]:
        """
        Approximates the 5th, 50th (median), and 95th percentiles of Beta(a, b).
        Uses Normal approximation with bounded support [0.001, 0.999].
        """
        mean = cls.beta_mean(a, b)
        var = cls.beta_variance(a, b)
        std = math.sqrt(max(var, 1e-6))

        # Z-scores for 5th, 50th, 95th percentiles (-1.645, 0, +1.645)
        p5 = max(0.001, min(0.999, mean - 1.645 * std))
        p50 = max(0.001, min(0.999, (a - 1/3) / (a + b - 2/3) if a > 1 and b > 1 else mean))
        p95 = max(0.001, min(0.999, mean + 1.645 * std))

        return round(p5, 4), round(p50, 4), round(p95, 4)

    @classmethod
    def initialize_belief(
        cls, stage: str = "seed", sector: str = "enterprise_saas"
    ) -> ProbabilisticBelief:
        stage_key = stage.lower().replace("-", "_").replace(" ", "_")
        sector_key = sector.lower().replace("-", "_").replace(" ", "_")

        base_a, base_b = cls.STAGE_PRIORS.get(stage_key, (3.0, 12.0))
        volatility = cls.SECTOR_VOLATILITY_MULTIPLIER.get(sector_key, 1.0)

        # Scale parameters according to sector volatility
        a = base_a / volatility
        b = base_b / volatility

        prior_prob = round(cls.beta_mean(a, b), 4)
        p5, p50, p95 = cls.approximate_credible_intervals(a, b)
        uncertainty = round(cls.beta_variance(a, b) * 100, 2)

        return ProbabilisticBelief(
            prior_alpha=round(a, 2),
            prior_beta=round(b, 2),
            posterior_alpha=round(a, 2),
            posterior_beta=round(b, 2),
            prior_probability=prior_prob,
            posterior_probability=prior_prob,
            credible_interval_5=p5,
            credible_interval_50=p50,
            credible_interval_95=p95,
            uncertainty_score=uncertainty,
            evidence_weight_applied=0.0,
            update_history=[{"step": 0, "probability": prior_prob, "uncertainty": uncertainty}],
        )

    @classmethod
    def update_belief(
        cls,
        belief: ProbabilisticBelief,
        positive_evidence_weight: float,
        negative_evidence_weight: float,
        evidence_confidence: float = 1.0,
    ) -> ProbabilisticBelief:
        """
        Updates belief with new verified evidence weights.
        positive_evidence_weight adds to alpha (successes).
        negative_evidence_weight adds to beta (failures).
        """
        eff_pos = max(0.0, positive_evidence_weight * evidence_confidence)
        eff_neg = max(0.0, negative_evidence_weight * evidence_confidence)

        new_a = belief.posterior_alpha + eff_pos
        new_b = belief.posterior_beta + eff_neg

        new_prob = round(cls.beta_mean(new_a, new_b), 4)
        p5, p50, p95 = cls.approximate_credible_intervals(new_a, new_b)
        uncertainty = round(cls.beta_variance(new_a, new_b) * 100, 2)

        history = list(belief.update_history)
        history.append({
            "step": len(history),
            "probability": new_prob,
            "uncertainty": uncertainty,
            "added_positive_weight": eff_pos,
            "added_negative_weight": eff_neg,
        })

        return ProbabilisticBelief(
            prior_alpha=belief.prior_alpha,
            prior_beta=belief.prior_beta,
            posterior_alpha=round(new_a, 2),
            posterior_beta=round(new_b, 2),
            prior_probability=belief.prior_probability,
            posterior_probability=new_prob,
            credible_interval_5=p5,
            credible_interval_50=p50,
            credible_interval_95=p95,
            uncertainty_score=uncertainty,
            evidence_weight_applied=round(belief.evidence_weight_applied + eff_pos + eff_neg, 2),
            update_history=history,
        )
