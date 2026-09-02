"""
ml/predictor.py
===============
Production-grade Startup Success Predictor.

All heavy sub-system classes (registry, cache, metrics) are imported from
their dedicated sub-packages. This module owns:
  - Feature schema & extraction (30 features)
  - Circuit breaker
  - ModelManager (load / hot-reload / heuristic fallback)
  - PredictionService (orchestration, caching, metrics, batch)
  - Public convenience API  (predict / batch_predict / health_check)
  - Module-level aliases kept for backward-compat with main.py
"""
from __future__ import annotations

import concurrent.futures
import os
import time
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import logging
import json
import hashlib

import numpy as np

# ---------------------------------------------------------------------------
# Configuration  (read once at import; intentionally lightweight dataclass)
# ---------------------------------------------------------------------------

from dataclasses import dataclass

@dataclass
class PredictorConfig:
    model_path: Path = Path(os.environ.get("MODEL_PATH", "/app/models"))
    cache_ttl_seconds: int = int(os.environ.get("CACHE_TTL_SECONDS", "300"))
    max_batch_size: int = int(os.environ.get("MAX_BATCH_SIZE", "100"))
    timeout_seconds: int = int(os.environ.get("PREDICT_TIMEOUT_SECONDS", "5"))
    circuit_breaker_threshold: int = int(os.environ.get("CIRCUIT_BREAKER_THRESHOLD", "5"))
    circuit_breaker_timeout_seconds: int = int(os.environ.get("CIRCUIT_BREAKER_TIMEOUT", "60"))
    redis_url: Optional[str] = os.environ.get("REDIS_URL")
    enable_cache: bool = os.environ.get("ENABLE_CACHE", "true").lower() == "true"
    enable_monitoring: bool = os.environ.get("ENABLE_MONITORING", "true").lower() == "true"
    environment: str = os.environ.get("ENVIRONMENT", "development")
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")


config = PredictorConfig()

# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------

class StructuredLogger:
    """JSON-line logger for Loki / CloudWatch / Datadog ingest."""

    def __init__(self, name: str):
        self._logger = logging.getLogger(name)
        self._logger.setLevel(getattr(logging, config.log_level, logging.INFO))
        if not self._logger.handlers:
            h = logging.StreamHandler()
            h.setFormatter(logging.Formatter(
                '{"ts":"%(asctime)s","lvl":"%(levelname)s",'
                '"logger":"%(name)s","msg":%(message)s}'
            ))
            self._logger.addHandler(h)

    def _fmt(self, msg: str, kw: dict) -> str:
        payload: Dict[str, Any] = {"msg": msg}
        payload.update(kw)
        try:
            return json.dumps(payload)
        except (TypeError, ValueError):
            return json.dumps({"msg": msg})

    def info(self, msg: str, **kw):    self._logger.info(self._fmt(msg, kw))
    def error(self, msg: str, **kw):   self._logger.error(self._fmt(msg, kw))
    def warning(self, msg: str, **kw): self._logger.warning(self._fmt(msg, kw))
    def debug(self, msg: str, **kw):   self._logger.debug(self._fmt(msg, kw))


logger = StructuredLogger(__name__)

# ---------------------------------------------------------------------------
# Prometheus metrics — delegate to monitoring.metrics singleton
# ---------------------------------------------------------------------------

class _Noop:
    """Drop-in no-op; accepts both positional and keyword label arguments."""
    def labels(self, *_a, **_kw) -> "_Noop": return self   # FIX: accept *args
    def inc(self, *_, **__): pass
    def observe(self, *_, **__): pass
    def set(self, *_, **__): pass


def _build_metrics():
    if not config.enable_monitoring:
        return (_Noop(),) * 7
    try:
        # Re-use the singleton from monitoring.metrics to avoid duplicate
        # Prometheus timeseries registration errors across workers.
        from ml.monitoring.metrics import get_metrics
        m = get_metrics()
        return (
            m.predictions_total,
            m.prediction_errors_total,
            m.prediction_latency_seconds,
            m.model_accuracy,
            m.feature_drift_score,
            m.cache_hits_total,
            m.cache_misses_total,
        )
    except Exception:
        # Graceful fallback: direct registration (single-process mode)
        try:
            from prometheus_client import Counter, Histogram, Gauge  # type: ignore
            return (
                Counter("predictions_total", "Total predictions",
                        ["model", "source", "environment"]),
                Counter("prediction_errors_total", "Prediction errors",
                        ["error_type", "environment"]),
                Histogram("prediction_latency_seconds", "Prediction latency",
                          ["model", "environment"],
                          buckets=[0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0]),
                _Noop(), _Noop(),
                Counter("cache_hits_total", "Cache hits", ["environment"]),
                Counter("cache_misses_total", "Cache misses", ["environment"]),
            )
        except Exception:
            return (_Noop(),) * 7


(
    prediction_counter,
    prediction_errors,
    prediction_latency,
    model_accuracy_gauge,
    feature_drift_gauge,
    cache_hit_counter,
    cache_miss_counter,
) = _build_metrics()

# ---------------------------------------------------------------------------
# Feature schema
# ---------------------------------------------------------------------------

FEATURE_NAMES: List[str] = [
    "team_size", "founder_experience_yrs", "previous_exits", "has_linkedin",
    "has_github", "patent_count", "press_count", "awards_count",
    "current_revenue", "revenue_growth_rate", "gross_margin",
    "runway_months", "ltv_cac_ratio", "customer_count",
    "mau", "tam", "sam", "market_growth_rate",
    "stage_seed", "stage_series_a", "stage_series_b_plus",
    "founded_years_ago", "pitch_count", "total_likes", "total_offers",
    "has_problem_section", "has_solution_section", "has_traction_section",
    "has_financials_section", "has_video",
]

FEATURE_INDICES: Dict[str, int] = {n: i for i, n in enumerate(FEATURE_NAMES)}
FEATURE_COUNT = len(FEATURE_NAMES)

_CAPS: Dict[str, float] = {
    "team_size": 10.0,
    "founder_experience_yrs": 20.0,
    "previous_exits": 3.0,
    "patent_count": 5.0,
    "press_count": 20.0,
    "awards_count": 5.0,
    "current_revenue": 1_000_000.0,
    "revenue_growth_rate": 3.0,
    "gross_margin": 100.0,
    "runway_months": 24.0,
    "ltv_cac_ratio": 10.0,
    "customer_count": 10_000.0,
    "mau": 100_000.0,
    "tam": 10_000_000_000.0,
    "sam": 1_000_000_000.0,
    "market_growth_rate": 50.0,
    "founded_years_ago": 10.0,
    "pitch_count": 10.0,
    "total_likes": 1_000.0,
    "total_offers": 50.0,
}

_HEURISTIC_WEIGHTS: Dict[str, float] = {
    "team_size": 0.08,
    "founder_experience_yrs": 0.12,
    "previous_exits": 0.10,
    "has_linkedin": 0.02,
    "has_github": 0.02,
    "patent_count": 0.03,
    "current_revenue": 0.10,
    "revenue_growth_rate": 0.12,
    "gross_margin": 0.06,
    "runway_months": 0.08,
    "ltv_cac_ratio": 0.07,
    "customer_count": 0.05,
    "mau": 0.04,
    "market_growth_rate": 0.04,
    "has_traction_section": 0.03,
    "has_financials_section": 0.03,
    "has_video": 0.01,
}

# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def _cap(value: Any, maximum: float, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        val = float(value)
        if val < 0:
            return default
        return min(val / maximum, 1.0)
    except (TypeError, ValueError):
        return default


def _to_bool(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return 1.0 if value > 0 else 0.0
    if isinstance(value, str):
        return 1.0 if value.lower() in ("true", "yes", "1") else 0.0
    return 0.0


def _extract_features_impl(data: Dict[str, Any]) -> np.ndarray:
    """Build a float32[30] feature vector. All values normalised to [0, 1]."""
    features = np.zeros(FEATURE_COUNT, dtype=np.float32)

    stage = str(data.get("funding_stage") or "").lower()
    features[FEATURE_INDICES["stage_seed"]] = 1.0 if stage == "seed" else 0.0
    features[FEATURE_INDICES["stage_series_a"]] = 1.0 if stage == "series_a" else 0.0
    features[FEATURE_INDICES["stage_series_b_plus"]] = (
        1.0 if stage in ("series_b", "series_c", "growth", "series_b+") else 0.0
    )

    for fname in ("has_linkedin", "has_github", "has_problem_section",
                  "has_solution_section", "has_traction_section",
                  "has_financials_section", "has_video"):
        features[FEATURE_INDICES[fname]] = _to_bool(data.get(fname))

    for fname, cap in _CAPS.items():
        if fname in FEATURE_INDICES:
            features[FEATURE_INDICES[fname]] = _cap(data.get(fname), cap)

    return features


@lru_cache(maxsize=2048)
def _cached_feature_extraction(data_tuple: tuple) -> np.ndarray:
    return _extract_features_impl(dict(data_tuple))


def extract_features(data: Dict[str, Any]) -> np.ndarray:
    if config.enable_cache:
        try:
            key = tuple(sorted(
                (k, v) for k, v in data.items()
                if isinstance(v, (str, int, float, bool, type(None)))
            ))
            return _cached_feature_extraction(key)
        except Exception:
            pass
    return _extract_features_impl(data)

# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpenError(Exception):
    pass


class CircuitBreaker:
    """Three-state circuit breaker; thread-safe via RLock."""

    def __init__(self, name: str, failure_threshold: int = 5,
                 timeout_seconds: int = 60):
        self.name = name
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: Optional[datetime] = None
        self._lock = threading.RLock()

    @contextmanager
    def protect(self):
        if not self._can_execute():
            raise CircuitBreakerOpenError(
                f"Circuit breaker '{self.name}' is OPEN"
            )
        try:
            yield
            self._record_success()
        except Exception:
            self._record_failure()
            raise

    def _can_execute(self) -> bool:
        with self._lock:
            if self._state == CircuitState.CLOSED:
                return True
            if self._state == CircuitState.OPEN:
                if self._last_failure_time:
                    elapsed = (
                        datetime.now() - self._last_failure_time
                    ).total_seconds()
                    if elapsed >= self.timeout_seconds:
                        self._state = CircuitState.HALF_OPEN
                        logger.info("CircuitBreaker HALF_OPEN", name=self.name)
                        return True
                return False
            return True  # HALF_OPEN — allow one probe

    def _record_success(self):
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.CLOSED
                self._failure_count = 0
                logger.info("CircuitBreaker CLOSED", name=self.name)
            elif self._state == CircuitState.CLOSED:
                self._failure_count = max(0, self._failure_count - 1)

    def _record_failure(self):
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = datetime.now()
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                logger.warning("CircuitBreaker OPEN (HALF_OPEN→OPEN)",
                               name=self.name)
            elif (self._state == CircuitState.CLOSED
                  and self._failure_count >= self.failure_threshold):
                self._state = CircuitState.OPEN
                logger.warning("CircuitBreaker OPEN (threshold)",
                               name=self.name, failures=self._failure_count)

    @property
    def state(self) -> str:
        return self._state.value

# ---------------------------------------------------------------------------
# Cache — import from dedicated module; inline fallback only when pkg absent
# ---------------------------------------------------------------------------

try:
    from ml.cache.redis_cache import PredictionCache
except ImportError:
    # Standalone / test mode — minimal inline implementation
    class PredictionCache:  # type: ignore[no-redef]
        """Minimal two-tier cache used when ml.cache is not importable."""

        _LOCAL_TTL = 60

        def __init__(self, redis_url: Optional[str] = None):
            self._redis = None
            self._local: Dict[str, tuple] = {}
            self._lock = threading.Lock()  # FIX: thread-safe
            if redis_url and config.enable_cache:
                try:
                    import redis as _r
                    c = _r.from_url(redis_url, decode_responses=True,
                                    socket_connect_timeout=2,
                                    socket_timeout=2)
                    c.ping()
                    self._redis = c
                except Exception as exc:
                    logger.warning("Redis unavailable", error=str(exc))

        def _key(self, data: Dict[str, Any]) -> str:
            blob = json.dumps(data, sort_keys=True, default=str)
            return f"pitchmic:pred:{hashlib.md5(blob.encode()).hexdigest()}"

        def get(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            key = self._key(data)
            if self._redis:
                try:
                    raw = self._redis.get(key)
                    if raw:
                        return json.loads(raw)
                except Exception:
                    pass
            with self._lock:  # FIX: lock local access
                entry = self._local.get(key)
                if entry:
                    result, ts = entry
                    if (datetime.now() - ts).total_seconds() < self._LOCAL_TTL:
                        return result
                    del self._local[key]
            return None

        def set(self, data: Dict[str, Any], result: Dict[str, Any],
                ttl: Optional[int] = None) -> None:
            key = self._key(data)
            ttl = ttl or config.cache_ttl_seconds
            if self._redis:
                try:
                    self._redis.setex(key, ttl, json.dumps(result, default=str))
                except Exception:
                    pass
            with self._lock:  # FIX: lock local writes
                self._local[key] = (result, datetime.now())

        def invalidate(self, data: Dict[str, Any]) -> None:
            key = self._key(data)
            if self._redis:
                try:
                    self._redis.delete(key)
                except Exception:
                    pass
            with self._lock:
                self._local.pop(key, None)

# ---------------------------------------------------------------------------
# Model registry — import from dedicated module; inline fallback
# ---------------------------------------------------------------------------

try:
    from ml.models.registry import ModelRegistry, ModelVersion
except ImportError:
    # Standalone fallback — mirrors models/registry.py closely
    from dataclasses import dataclass as _dc, field as _fld
    import os as _os

    @_dc
    class ModelVersion:  # type: ignore[no-redef]
        version: str
        path: Path
        created_at: datetime
        accuracy: Optional[float] = None
        metadata: Dict[str, Any] = _fld(default_factory=dict)
        is_active: bool = False

        def to_dict(self) -> Dict[str, Any]:
            return {
                "version": self.version, "path": str(self.path),
                "created_at": self.created_at.isoformat(),
                "accuracy": self.accuracy, "metadata": self.metadata,
                "is_active": self.is_active,
            }

    class ModelRegistry:  # type: ignore[no-redef]
        def __init__(self, registry_path: Path):
            self.registry_path = registry_path
            self._file = registry_path / "model_registry.json"
            self._models: Dict[str, "ModelVersion"] = {}
            self._lock = threading.RLock()
            self._load()

        def _load(self):
            if not self._file.exists():
                return
            try:
                with open(self._file) as fh:
                    data = json.load(fh)
                for ver, info in data.items():
                    self._models[ver] = ModelVersion(
                        version=ver, path=Path(info["path"]),
                        created_at=datetime.fromisoformat(info["created_at"]),
                        accuracy=info.get("accuracy"),
                        metadata=info.get("metadata", {}),
                        is_active=info.get("is_active", False),
                    )
            except Exception as exc:
                logger.error("Registry load failed", error=str(exc))

        def _save(self):
            self.registry_path.mkdir(parents=True, exist_ok=True)
            data = {v: m.to_dict() for v, m in self._models.items()}
            tmp = self._file.with_suffix(".tmp")
            with open(tmp, "w") as fh:
                json.dump(data, fh, indent=2, default=str)
            _os.replace(str(tmp), str(self._file))  # atomic on POSIX & Windows

        def register(self, model_path: Path,
                     accuracy: Optional[float] = None,
                     metadata: Optional[Dict[str, Any]] = None) -> str:
            with self._lock:
                # Use UUID suffix to avoid collision after delete+register
                import uuid as _uuid
                version = f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}_{_uuid.uuid4().hex[:6]}"
                self._models[version] = ModelVersion(
                    version=version, path=model_path,
                    created_at=datetime.now(),
                    accuracy=accuracy, metadata=metadata or {},
                    is_active=False,
                )
                self._save()
                return version

        def activate(self, version: str) -> bool:
            with self._lock:
                if version not in self._models:
                    return False
                for m in self._models.values():
                    m.is_active = False
                self._models[version].is_active = True
                self._save()
                return True

        def get_active(self) -> Optional["ModelVersion"]:
            with self._lock:
                return next((m for m in self._models.values() if m.is_active), None)

        def list_versions(self) -> List[Dict[str, Any]]:
            with self._lock:
                return [m.to_dict() for m in self._models.values()]

# ---------------------------------------------------------------------------
# Backward-compat module-level aliases (main.py reads these directly)
# ---------------------------------------------------------------------------

XGB_MODEL_FILE = config.model_path / "startup_success.xgb"
_xgb_model = None   # kept in sync by ModelManager._load_model()

# ---------------------------------------------------------------------------
# Model Manager
# ---------------------------------------------------------------------------

class ModelManager:
    """
    Owns the XGBoost lifecycle:
    - Load from registry or well-known path on startup
    - Hot-reload via background watcher (every 5 min)
    - Circuit-breaker-protected inference
    - Heuristic fallback when model absent
    """

    def __init__(self):
        global _xgb_model
        self.model = None
        self.model_version: Optional[str] = None
        self.registry = ModelRegistry(config.model_path)
        self.circuit_breaker = CircuitBreaker(
            "xgboost_inference",
            failure_threshold=config.circuit_breaker_threshold,
            timeout_seconds=config.circuit_breaker_timeout_seconds,
        )
        self._lock = threading.RLock()
        self._last_mtime: Optional[float] = None
        self._load_model()
        _xgb_model = self.model
        self._start_health_watcher()

    # ------------------------------------------------------------------
    def _load_model(self) -> bool:
        with self._lock:
            global _xgb_model
            active = self.registry.get_active()
            candidates = []
            if active and active.path.exists():
                candidates.append((active.path, active.version))
            if XGB_MODEL_FILE.exists():
                candidates.append((XGB_MODEL_FILE, "xgboost-v1"))

            for path, ver in candidates:
                try:
                    import xgboost as xgb  # type: ignore
                    booster = xgb.Booster()
                    booster.load_model(str(path))
                    self.model = booster
                    _xgb_model = booster
                    self.model_version = ver
                    self._last_mtime = path.stat().st_mtime
                    if active and active.accuracy:
                        model_accuracy_gauge.labels(
                            model_version=ver
                        ).set(active.accuracy)
                    logger.info("Model loaded", version=ver, path=str(path))
                    return True
                except Exception as exc:
                    logger.error("Model load failed", path=str(path),
                                 error=str(exc))

            logger.warning("No model found — heuristic fallback active")
            self.model = None
            _xgb_model = None
            self.model_version = None
            return False

    def reload(self) -> bool:
        """Public method — reloads the live model in this process."""
        return self._load_model()

    def _start_health_watcher(self):
        def _watch():
            while True:
                time.sleep(300)
                try:
                    active = self.registry.get_active()
                    target = active.path if active else XGB_MODEL_FILE
                    if target.exists():
                        mtime = target.stat().st_mtime
                        if mtime != self._last_mtime:
                            logger.info("Model file changed, reloading")
                            self._load_model()
                except Exception as exc:
                    logger.error("Watcher error", error=str(exc))

        threading.Thread(target=_watch, daemon=True,
                         name="model-watcher").start()

    # ------------------------------------------------------------------
    def predict(self, features: np.ndarray) -> Dict[str, Any]:
        if self.model is None:
            return self._heuristic_predict(features)
        try:
            with self.circuit_breaker.protect():
                import xgboost as xgb  # type: ignore
                dmat = xgb.DMatrix(
                    features.reshape(1, -1), feature_names=FEATURE_NAMES
                )
                prob = float(np.clip(self.model.predict(dmat)[0], 0.0, 1.0))
                return self._format_prediction(prob, "xgboost",
                                               self.model_version)
        except CircuitBreakerOpenError as exc:
            logger.warning("CircuitBreaker open", error=str(exc))
            prediction_errors.labels(
                error_type="circuit_breaker_open",
                environment=config.environment,
            ).inc()
            return self._heuristic_predict(features)
        except Exception as exc:
            logger.error("XGBoost inference failed", error=str(exc))
            prediction_errors.labels(
                error_type="inference_error",
                environment=config.environment,
            ).inc()
            return self._heuristic_predict(features)

    def _heuristic_predict(self, features: np.ndarray) -> Dict[str, Any]:
        score = 0.0
        total_w = sum(_HEURISTIC_WEIGHTS.values())
        for fname, weight in _HEURISTIC_WEIGHTS.items():
            idx = FEATURE_INDICES.get(fname)
            if idx is not None:
                score += weight * float(features[idx])
        raw = score / total_w if total_w else 0.5
        prob = float(np.clip(0.1 + 0.8 * raw, 0.0, 1.0))
        return self._format_prediction(prob, "heuristic", "heuristic-v1")

    @staticmethod
    def _format_prediction(prob: float, model: str,
                            ver: Optional[str]) -> Dict[str, Any]:
        ver = ver or "unknown"
        # Confidence margin is tighter near 0.5 (high uncertainty) and wider
        # near extremes.  Capped at ±0.15.
        margin = min(0.05 + 0.1 * abs(prob - 0.5) / 0.5, 0.15)
        return {
            "success_probability": round(prob, 4),
            "model": model,
            "model_version": ver,
            "confidence_lower": round(max(0.0, prob - margin), 4),
            "confidence_upper": round(min(1.0, prob + margin), 4),
        }

    # ------------------------------------------------------------------
    def simulate_roi(self, features: np.ndarray,
                     prob: Optional[float] = None,
                     investment_usd: float = 500_000.0) -> Dict[str, Any]:
        """
        ROI simulation.  Accepts pre-computed probability to avoid a
        second inference pass (FIX: was calling self.predict() again).
        """
        if prob is None:
            prob = self.predict(features)["success_probability"]
        p = float(prob)

        growth_norm = float(features[FEATURE_INDICES["revenue_growth_rate"]])
        base_multiple = 1.0 + 15.0 * p * (0.3 + 0.7 * growth_norm)
        downside = max(0.1, base_multiple * 0.15)

        expected = round(p * base_multiple + (1 - p) * downside, 2)
        conservative = round(p * base_multiple * 0.6 + (1 - p) * downside, 2)
        optimistic = round(
            p * base_multiple * 1.5 + (1 - p) * downside * 0.5, 2
        )
        return {
            "investment_usd": investment_usd,
            "expected_multiple": expected,
            "conservative_multiple": conservative,
            "optimistic_multiple": optimistic,
            "expected_return_usd": round(investment_usd * expected, 2),
        }

    def predict_exit(self, features: np.ndarray,
                     prob: Optional[float] = None) -> Dict[str, Any]:
        """
        Exit timeline prediction.  Uses pre-computed prob when supplied
        (FIX: was calling self.predict() again, causing double inference).

        founded_years_ago is stored normalised [0,1] against a cap of 10 yrs,
        so we multiply by 10 to recover the raw year count.
        """
        if prob is None:
            prob = self.predict(features)["success_probability"]
        p = float(prob)

        stage_seed = float(features[FEATURE_INDICES["stage_seed"]])
        stage_a = float(features[FEATURE_INDICES["stage_series_a"]])
        # founded_years_ago is normalised 0–1 (cap=10); recover raw years
        founded_raw = float(features[FEATURE_INDICES["founded_years_ago"]]) * 10.0

        if p >= 0.70:
            exit_type = "IPO"
            years = max(3.0, 7.0 - founded_raw * 0.5)
        elif p >= 0.50:
            exit_type = "Acquisition"
            years = max(2.0, 5.0 - stage_a * 1.5 - stage_seed)
        elif p >= 0.30:
            exit_type = "Acqui-hire"
            years = 3.0
        else:
            exit_type = "Shutdown / Wind-down"
            years = 1.5

        return {
            "predicted_exit_type": exit_type,
            "estimated_years_to_exit": round(years, 1),
            "confidence": round(min(0.9, 0.4 + p * 0.5), 2),
        }

    def top_shap_features(self, features: np.ndarray,
                          top_n: int = 5) -> List[Dict[str, Any]]:
        if self.model is not None:
            try:
                import xgboost as xgb  # type: ignore
                dmat = xgb.DMatrix(
                    features.reshape(1, -1), feature_names=FEATURE_NAMES
                )
                contribs = self.model.predict(dmat, pred_contribs=True)[0]
                pairs = sorted(
                    zip(FEATURE_NAMES, contribs[:-1]),
                    key=lambda x: abs(x[1]), reverse=True,
                )
                return [{"feature": n, "contribution": round(float(v), 4)}
                        for n, v in pairs[:top_n]]
            except Exception:
                pass
        # Heuristic fallback
        pairs = [
            (fname, weight * float(features[FEATURE_INDICES[fname]]))
            for fname, weight in _HEURISTIC_WEIGHTS.items()
            if fname in FEATURE_INDICES
        ]
        pairs.sort(key=lambda x: abs(x[1]), reverse=True)
        return [{"feature": n, "contribution": round(v, 4)}
                for n, v in pairs[:top_n]]

# ---------------------------------------------------------------------------
# Prediction Service
# ---------------------------------------------------------------------------

class PredictionService:
    """
    Orchestrates validation → cache → features → inference → enrichments
    → cache-write → metrics.  Supports single and parallel batch prediction.
    """

    def __init__(self):
        self.model_manager = ModelManager()
        self.cache = PredictionCache(config.redis_url)

    # ------------------------------------------------------------------
    def predict(self, startup_data: Dict[str, Any],
                skip_cache: bool = False) -> Dict[str, Any]:
        t0 = time.monotonic()

        self._validate(startup_data)

        if not skip_cache and config.enable_cache:
            cached = self.cache.get(startup_data)
            if cached:
                return cached

        features = extract_features(startup_data)

        # Single inference pass; pass prob to enrichments to avoid re-inference
        core = self.model_manager.predict(features)
        prob = core["success_probability"]

        core["roi"] = self.model_manager.simulate_roi(features, prob=prob)
        core["exit_prediction"] = self.model_manager.predict_exit(
            features, prob=prob
        )
        core["shap_top_features"] = self.model_manager.top_shap_features(
            features
        )

        elapsed = time.monotonic() - t0
        core.update({
            "request_id": f"req_{uuid.uuid4().hex[:12]}",
            "timestamp": datetime.now().isoformat(),
            "latency_ms": round(elapsed * 1000, 2),
            "environment": config.environment,
        })

        if not skip_cache and config.enable_cache:
            self.cache.set(startup_data, core)

        prediction_counter.labels(
            model=core.get("model", "unknown"),
            source="api",
            environment=config.environment,
        ).inc()
        prediction_latency.labels(
            model=core.get("model", "unknown"),
            environment=config.environment,
        ).observe(elapsed)

        logger.info("Prediction completed",
                    request_id=core["request_id"],
                    probability=core["success_probability"],
                    model=core.get("model"),
                    latency_ms=core["latency_ms"])
        return core

    # ------------------------------------------------------------------
    def batch_predict(self, startups: List[Dict[str, Any]],
                      **kwargs) -> List[Dict[str, Any]]:
        if len(startups) > config.max_batch_size:
            raise ValueError(
                f"Batch size {len(startups)} exceeds maximum "
                f"{config.max_batch_size}"
            )
        if not startups:
            return []

        # FIX: max_workers=0 crash when startups is empty — guarded above;
        # also cap workers at 1 minimum.
        n_workers = max(1, min(10, len(startups)))
        results: List[Optional[Dict[str, Any]]] = [None] * len(startups)

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=n_workers
        ) as pool:
            future_to_idx = {
                pool.submit(self.predict, s, **kwargs): i
                for i, s in enumerate(startups)
            }
            for fut in concurrent.futures.as_completed(future_to_idx):
                idx = future_to_idx[fut]
                try:
                    results[idx] = fut.result()
                except Exception as exc:
                    logger.error("Batch item failed", index=idx,
                                 error=str(exc))
                    results[idx] = {"error": str(exc), "index": idx}

        return results  # type: ignore[return-value]

    # ------------------------------------------------------------------
    @staticmethod
    def _validate(data: Dict[str, Any]) -> None:
        required = ["team_size", "current_revenue"]
        missing = [f for f in required if f not in data]
        if missing:
            raise ValueError(
                f"Missing required fields: {', '.join(missing)}"
            )
        team_size = data.get("team_size")
        if not isinstance(team_size, (int, float)) or team_size < 0:
            raise ValueError("team_size must be a non-negative number")
        if team_size > 100:
            raise ValueError("team_size exceeds maximum (100)")
        revenue = data.get("current_revenue")
        if not isinstance(revenue, (int, float)) or revenue < 0:
            raise ValueError(
                "current_revenue must be a non-negative number"
            )

# ---------------------------------------------------------------------------
# Thread-safe singleton
# ---------------------------------------------------------------------------

_service: Optional[PredictionService] = None
_service_lock = threading.Lock()


def get_predictor() -> PredictionService:
    global _service
    if _service is None:
        with _service_lock:
            if _service is None:
                _service = PredictionService()
    return _service

# ---------------------------------------------------------------------------
# Public convenience API (backward-compatible)
# ---------------------------------------------------------------------------

def predict(startup_data: Dict[str, Any], **kwargs) -> Dict[str, Any]:
    return get_predictor().predict(startup_data, **kwargs)


def batch_predict(startups: List[Dict[str, Any]],
                  **kwargs) -> List[Dict[str, Any]]:
    return get_predictor().batch_predict(startups, **kwargs)


def health_check() -> Dict[str, Any]:
    svc = get_predictor()
    mm = svc.model_manager
    return {
        "status": "healthy",
        "model_loaded": mm.model is not None,
        "model_version": mm.model_version or "heuristic-v1",
        "cache_available": getattr(svc.cache, "_redis", None) is not None,
        "circuit_breaker_state": mm.circuit_breaker.state,
        "timestamp": datetime.now().isoformat(),
        "environment": config.environment,
    }
