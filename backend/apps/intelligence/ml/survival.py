import math
from dataclasses import dataclass
from typing import List


@dataclass
class SurvivalCurvePoint:
    horizon_months: int
    probability_milestone_achieved: float
    hazard_rate: float


class SurvivalAnalysisEngine:
    """
    Time-to-event survival modeling using parametric Weibull hazard curves.
    Calculates milestone completion probabilities over 6, 12, 18, 24, 36, and 60 month horizons.
    """

    @classmethod
    def weibull_cdf(cls, t: float, lambda_scale: float, k_shape: float) -> float:
        """
        F(t) = 1 - exp(-(t / lambda)^k)
        """
        if t <= 0:
            return 0.0
        return 1.0 - math.exp(-math.pow(t / lambda_scale, k_shape))

    @classmethod
    def calculate_fundraising_survival_curve(
        cls,
        stage: str = "seed",
        traction_velocity_score: float = 70.0,
        runway_months: float = 14.0,
    ) -> List[SurvivalCurvePoint]:
        """
        Computes fundraising probability curve across horizons (3m, 6m, 12m, 18m, 24m).
        """
        # Base scale (lambda) in months to raise next round
        base_lambda = 18.0 if stage == "seed" else 24.0

        # Traction velocity accelerates time-to-round (reduces lambda)
        velocity_factor = max(0.5, 1.5 - (traction_velocity_score / 100.0))
        adj_lambda = base_lambda * velocity_factor

        # Shape k (> 1 means increasing hazard over time as runway burns)
        k_shape = 1.35 if runway_months < 12 else 1.15

        horizons = [3, 6, 9, 12, 18, 24, 36]
        curve = []
        for h in horizons:
            prob = round(cls.weibull_cdf(h, adj_lambda, k_shape) * 100, 1)
            # Hazard at horizon h: h(t) = (k/lambda) * (t/lambda)^(k-1)
            hazard = round((k_shape / adj_lambda) * math.pow(h / adj_lambda, k_shape - 1), 4)
            curve.append(
                SurvivalCurvePoint(
                    horizon_months=h,
                    probability_milestone_achieved=min(99.0, prob),
                    hazard_rate=hazard,
                )
            )

        return curve
