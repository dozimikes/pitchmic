from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class MetricAnomalyReport:
    metric_key: str
    claimed_value: Any
    sector_median: float
    sector_p95: float
    is_anomaly: bool
    severity: str  # "LOW", "MEDIUM", "HIGH"
    explanation: str


class AnomalyDetectionEngine:
    """
    Statistical Outlier & Inconsistency Detector.
    Identifies claims that deviate significantly from empirical sector distributions.
    Flagging triggers evidence verification rather than accusatory conclusions.
    """

    BENCHMARKS: Dict[str, Dict[str, Dict[str, float]]] = {
        "enterprise_saas": {
            "mom_growth_pct": {"p25": 8.0, "median": 15.0, "p75": 25.0, "p95": 50.0},
            "gross_margin_pct": {"p25": 65.0, "median": 78.0, "p75": 85.0, "p95": 92.0},
            "net_revenue_retention_pct": {"p25": 95.0, "median": 110.0, "p75": 125.0, "p95": 150.0},
            "cac_payback_months": {"p25": 6.0, "median": 12.0, "p75": 18.0, "p95": 24.0},
        },
        "fintech": {
            "mom_growth_pct": {"p25": 10.0, "median": 20.0, "p75": 35.0, "p95": 70.0},
            "gross_margin_pct": {"p25": 40.0, "median": 60.0, "p75": 75.0, "p95": 88.0},
            "net_revenue_retention_pct": {"p25": 100.0, "median": 118.0, "p75": 135.0, "p95": 165.0},
            "cac_payback_months": {"p25": 4.0, "median": 9.0, "p75": 15.0, "p95": 22.0},
        },
    }

    @classmethod
    def audit_metric(
        cls,
        metric_key: str,
        value: float,
        sector: str = "enterprise_saas",
    ) -> MetricAnomalyReport:
        sec = sector.lower().replace("-", "_").replace(" ", "_")
        bench = cls.BENCHMARKS.get(sec, cls.BENCHMARKS["enterprise_saas"]).get(metric_key)

        if not bench:
            return MetricAnomalyReport(
                metric_key=metric_key,
                claimed_value=value,
                sector_median=0.0,
                sector_p95=0.0,
                is_anomaly=False,
                severity="LOW",
                explanation=f"No sector baseline available for {metric_key}.",
            )

        p95 = bench["p95"]
        median = bench["median"]

        if value > p95 * 2.0:
            return MetricAnomalyReport(
                metric_key=metric_key,
                claimed_value=value,
                sector_median=median,
                sector_p95=p95,
                is_anomaly=True,
                severity="HIGH",
                explanation=f"Claimed {metric_key} ({value}) exceeds 200% of sector 95th percentile ({p95}). High verification priority.",
            )
        elif value > p95:
            return MetricAnomalyReport(
                metric_key=metric_key,
                claimed_value=value,
                sector_median=median,
                sector_p95=p95,
                is_anomaly=True,
                severity="MEDIUM",
                explanation=f"Claimed {metric_key} ({value}) is above the sector 95th percentile ({p95}). Secondary documentation required.",
            )

        return MetricAnomalyReport(
            metric_key=metric_key,
            claimed_value=value,
            sector_median=median,
            sector_p95=p95,
            is_anomaly=False,
            severity="LOW",
            explanation=f"Value is within standard sector distribution (median: {median}, p95: {p95}).",
        )
