"""
ml/monitoring/metrics.py
========================
Centralised Prometheus metric definitions — process-wide singleton.

All metrics live here so they are registered exactly once even when multiple
modules import them.  A complete _Noop stub is returned when prometheus_client
is absent so callers never need ImportError guards.
"""
from __future__ import annotations

import contextlib
import logging
from functools import lru_cache
from typing import Any

logger = logging.getLogger(__name__)


class _Noop:
    """
    Drop-in no-op for any Prometheus metric type.

    FIX 1: labels() now accepts *args as well as **kwargs so positional
            calls like .labels("xgboost", "api", "dev") don't raise.
    FIX 2: time() returns the context manager object directly, not a
            factory — so `with metric.time():` works correctly.
    """

    def labels(self, *_args: Any, **_kw: Any) -> "_Noop":
        return self

    def inc(self, amount: float = 1, **_: Any) -> None:
        pass

    def observe(self, amount: float, **_: Any) -> None:
        pass

    def set(self, value: float, **_: Any) -> None:
        pass

    def time(self):                           # FIX 2: return ctx manager directly
        @contextlib.contextmanager
        def _noop_ctx():
            yield
        return _noop_ctx()


class Metrics:
    """
    Container for all Prometheus metrics used in the ML service.

    Instantiate once via get_metrics(); never construct directly.
    Falls back to _Noop stubs when prometheus_client is unavailable.
    """

    def __init__(self) -> None:
        self._available = False
        try:
            from prometheus_client import Counter, Gauge, Histogram  # type: ignore

            self._available = True

            self.predictions_total = Counter(
                "predictions_total",
                "Total number of predictions served",
                ["model", "source", "environment"],
            )
            self.prediction_errors_total = Counter(
                "prediction_errors_total",
                "Total prediction errors",
                ["error_type", "environment"],
            )
            self.prediction_latency_seconds = Histogram(
                "prediction_latency_seconds",
                "End-to-end prediction latency",
                ["model", "environment"],
                buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
            )
            self.batch_size_histogram = Histogram(
                "batch_size",
                "Batch prediction size distribution",
                buckets=[1, 2, 5, 10, 20, 50, 100],
            )
            self.model_accuracy = Gauge(
                "model_accuracy",
                "Reported accuracy of the currently loaded model",
                ["model_version"],
            )
            self.feature_drift_score = Gauge(
                "feature_drift_score",
                "Computed PSI drift score per feature",
                ["feature_name"],
            )
            self.cache_hits_total = Counter(
                "cache_hits_total",
                "Prediction cache hits",
                ["environment"],
            )
            self.cache_misses_total = Counter(
                "cache_misses_total",
                "Prediction cache misses",
                ["environment"],
            )
            self.circuit_breaker_open = Gauge(
                "circuit_breaker_open",
                "1 when the ML circuit breaker is open, 0 otherwise",
                ["name"],
            )
            self.http_requests_total = Counter(
                "http_requests_total",
                "Total HTTP requests handled",
                ["method", "endpoint", "status_code"],
            )
            self.http_request_duration_seconds = Histogram(
                "http_request_duration_seconds",
                "HTTP request duration",
                ["method", "endpoint"],
                buckets=[0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
            )
            logger.info("Prometheus metrics initialised")

        except ImportError:
            logger.warning(
                "prometheus_client not installed — metrics replaced with no-ops"
            )
            self._install_noops()

    def _install_noops(self) -> None:
        noop = _Noop()
        for attr in (
            "predictions_total",
            "prediction_errors_total",
            "prediction_latency_seconds",
            "batch_size_histogram",
            "model_accuracy",
            "feature_drift_score",
            "cache_hits_total",
            "cache_misses_total",
            "circuit_breaker_open",
            "http_requests_total",
            "http_request_duration_seconds",
        ):
            setattr(self, attr, noop)

    @property
    def available(self) -> bool:
        return self._available


@lru_cache(maxsize=1)
def get_metrics() -> Metrics:
    """Return the process-wide singleton Metrics instance."""
    return Metrics()
