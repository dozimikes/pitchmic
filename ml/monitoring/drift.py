"""
ml/monitoring/drift.py
======================
Feature drift detection using Population Stability Index (PSI).

  PSI < 0.1   — no significant change
  0.1 – 0.2   — moderate change; worth investigating
  > 0.2       — significant drift; retraining recommended

Fixes applied
-------------
- PSI denominator now uses histogram bin-count sums (ref_counts.sum() and
  cur_counts.sum()) instead of raw array lengths, so out-of-range samples
  that fall outside the reference bin edges don't silently deflate PSI.
- WARN_THRESHOLD / ALERT_THRESHOLD promoted to module-level constants so
  they are not dataclass fields (which would appear as __init__ parameters).
- reference_data is copied on construction so caller mutations don't corrupt
  the baseline.
- Minimum sample guard: PSI is unreliable below MIN_SAMPLES; returns 0.0
  with a warning in that case.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from .metrics import get_metrics

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level thresholds (FIX: not dataclass fields)
# ---------------------------------------------------------------------------

PSI_WARN_THRESHOLD: float = 0.1
PSI_ALERT_THRESHOLD: float = 0.2
MIN_SAMPLES: int = 50   # below this PSI is statistically unreliable


# ---------------------------------------------------------------------------
# PSI calculation
# ---------------------------------------------------------------------------

def _psi_for_feature(
    reference: np.ndarray,
    current: np.ndarray,
    n_bins: int = 10,
    eps: float = 1e-7,
) -> float:
    """
    Compute PSI for a single feature.

    Parameters
    ----------
    reference : 1-D normalised reference distribution (training data).
    current   : 1-D normalised current distribution (live traffic window).
    n_bins    : Number of percentile bins built on the reference.
    eps       : Smoothing constant to avoid log(0).

    Returns
    -------
    float — PSI value (≥ 0).
    """
    if len(reference) < MIN_SAMPLES or len(current) < MIN_SAMPLES:
        logger.warning(
            "PSI skipped: too few samples (ref=%d, cur=%d, min=%d)",
            len(reference), len(current), MIN_SAMPLES,
        )
        return 0.0

    # Build bin edges from the reference percentiles
    percentiles = np.linspace(0, 100, n_bins + 1)
    bin_edges = np.unique(np.percentile(reference, percentiles))
    if len(bin_edges) < 2:
        return 0.0

    ref_counts, _ = np.histogram(reference, bins=bin_edges)
    cur_counts, _ = np.histogram(current, bins=bin_edges)

    # FIX: use .sum() not len() — out-of-range values are dropped by
    # np.histogram, so the raw lengths would give wrong percentages.
    ref_total = ref_counts.sum()
    cur_total = cur_counts.sum()
    if ref_total == 0 or cur_total == 0:
        return 0.0

    ref_pct = ref_counts / ref_total
    cur_pct = cur_counts / cur_total

    # Smooth zeros before taking log
    ref_pct = np.where(ref_pct == 0, eps, ref_pct)
    cur_pct = np.where(cur_pct == 0, eps, cur_pct)

    psi = float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))
    return max(0.0, psi)   # PSI is always non-negative; clamp floating noise


# ---------------------------------------------------------------------------
# DriftReport
# ---------------------------------------------------------------------------

@dataclass
class DriftReport:
    """Results of a single drift-check run."""

    feature_psi: Dict[str, float] = field(default_factory=dict)
    drifted_features: List[str] = field(default_factory=list)
    overall_drift_score: float = 0.0
    n_reference_samples: int = 0
    n_current_samples: int = 0

    # NOTE: thresholds are module-level constants, not dataclass fields

    def summary(self) -> str:
        if self.overall_drift_score > PSI_ALERT_THRESHOLD:
            status = "ALERT — significant drift"
        elif self.overall_drift_score > PSI_WARN_THRESHOLD:
            status = "WARN — moderate drift"
        else:
            status = "OK"

        lines = [
            f"Drift status : {status}",
            f"Overall PSI  : {self.overall_drift_score:.4f}",
            f"Samples      : ref={self.n_reference_samples}, "
            f"current={self.n_current_samples}",
            "Per-feature PSI:",
        ]
        for feat, psi in sorted(
            self.feature_psi.items(), key=lambda x: -x[1]
        ):
            flag = "  " if psi > PSI_WARN_THRESHOLD else ""
            lines.append(f"  {feat:<30} {psi:.4f}{flag}")
        return "\n".join(lines)

    @property
    def has_alert(self) -> bool:
        return self.overall_drift_score > PSI_ALERT_THRESHOLD

    @property
    def has_warning(self) -> bool:
        return self.overall_drift_score > PSI_WARN_THRESHOLD


# ---------------------------------------------------------------------------
# DriftDetector
# ---------------------------------------------------------------------------

class DriftDetector:
    """
    Detects feature distribution drift between a reference baseline and a
    live traffic window using PSI.

    Parameters
    ----------
    reference_data : 2-D array (n_samples × n_features).
    feature_names  : Column names for reference_data.
    n_bins         : Number of bins for PSI calculation.
    """

    def __init__(
        self,
        reference_data: np.ndarray,
        feature_names: Optional[List[str]] = None,
        n_bins: int = 10,
    ):
        if reference_data.ndim != 2:
            raise ValueError(
                "reference_data must be 2-D (n_samples × n_features)"
            )
        # FIX: copy so external mutations don't corrupt the baseline
        self.reference = reference_data.copy()
        self.n_features = reference_data.shape[1]
        self.feature_names = (
            feature_names
            if feature_names
            else [f"feature_{i}" for i in range(self.n_features)]
        )
        self.n_bins = n_bins
        self._metrics = get_metrics()

        logger.info(
            "DriftDetector ready: %d reference samples, %d features",
            len(self.reference), self.n_features,
        )

    # ------------------------------------------------------------------

    def check(self, current_data: np.ndarray) -> DriftReport:
        """
        Run a drift check against current_data.

        Parameters
        ----------
        current_data : 2-D array (n_samples × n_features).

        Returns
        -------
        DriftReport
        """
        if current_data.ndim != 2:
            raise ValueError(
                "current_data must be 2-D (n_samples × n_features)"
            )
        if current_data.shape[1] != self.n_features:
            raise ValueError(
                f"Feature count mismatch: expected {self.n_features}, "
                f"got {current_data.shape[1]}"
            )

        feature_psi: Dict[str, float] = {}
        drifted: List[str] = []

        for i, name in enumerate(self.feature_names):
            psi = _psi_for_feature(
                self.reference[:, i],
                current_data[:, i],
                n_bins=self.n_bins,
            )
            feature_psi[name] = psi

            # Push to Prometheus
            self._metrics.feature_drift_score.labels(
                feature_name=name
            ).set(psi)

            if psi > PSI_WARN_THRESHOLD:
                drifted.append(name)
                logger.warning(
                    "Feature drift: %s PSI=%.4f", name, psi
                )

        overall = (
            float(np.mean(list(feature_psi.values()))) if feature_psi else 0.0
        )

        report = DriftReport(
            feature_psi=feature_psi,
            drifted_features=drifted,
            overall_drift_score=overall,
            n_reference_samples=len(self.reference),
            n_current_samples=len(current_data),
        )

        if report.has_alert:
            logger.error(
                "SIGNIFICANT drift: overall_psi=%.4f drifted=%s",
                overall, drifted,
            )
        elif report.has_warning:
            logger.warning(
                "Moderate drift: overall_psi=%.4f drifted=%s",
                overall, drifted,
            )

        return report

    def update_reference(self, new_reference: np.ndarray) -> None:
        """Replace the baseline (e.g. after model retraining)."""
        if new_reference.shape[1] != self.n_features:
            raise ValueError(
                "Feature count mismatch when updating reference"
            )
        self.reference = new_reference.copy()  # FIX: copy here too
        logger.info(
            "DriftDetector reference updated (%d samples)",
            len(self.reference),
        )
