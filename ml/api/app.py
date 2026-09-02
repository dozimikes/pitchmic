"""
ml/api/app.py
=============
FastAPI application factory that wires every ml/ sub-package together.

The factory pattern (create_app) lets tests inject a custom settings object
and keeps the module importable without side-effects.

This app expands on ml/main.py by:
- Using the centralised ml.config.Settings
- Integrating ml.security.RateLimiter per-IP
- Exposing per-request X-RateLimit-Remaining headers
- Emitting HTTP request metrics via ml.monitoring.Metrics
- Providing /drift endpoint for feature drift reports
- Providing /models management endpoints (list, activate, delete)
"""
from __future__ import annotations

import hashlib
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel, Field

import predictor as _predictor
from ml.config.settings import Settings, get_settings
from ml.monitoring.metrics import get_metrics
from ml.security.rate_limiter import RateLimiter
from ml.security.auth import get_current_user, require_admin

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class StartupFeatures(BaseModel):
    startup_id: Optional[int] = None
    team_size: int = Field(default=0, ge=0, le=100)
    founder_experience_yrs: float = Field(default=0.0, ge=0)
    previous_exits: int = Field(default=0, ge=0)
    has_linkedin: bool = False
    has_github: bool = False
    patent_count: int = Field(default=0, ge=0)
    press_count: int = Field(default=0, ge=0)
    awards_count: int = Field(default=0, ge=0)
    current_revenue: float = Field(default=0.0, ge=0)
    revenue_growth_rate: float = Field(default=0.0, ge=0)
    gross_margin: float = Field(default=0.0, ge=0)
    runway_months: Optional[int] = Field(default=None, ge=0)
    ltv_cac_ratio: float = Field(default=0.0, ge=0)
    customer_count: int = Field(default=0, ge=0)
    mau: int = Field(default=0, ge=0)
    tam: float = Field(default=0.0, ge=0)
    sam: float = Field(default=0.0, ge=0)
    market_growth_rate: float = Field(default=0.0, ge=0)
    funding_stage: str = Field(default="")
    founded_years_ago: int = Field(default=0, ge=0)
    pitch_count: int = Field(default=0, ge=0)
    total_likes: int = Field(default=0, ge=0)
    total_offers: int = Field(default=0, ge=0)
    has_problem_section: bool = False
    has_solution_section: bool = False
    has_traction_section: bool = False
    has_financials_section: bool = False
    has_video: bool = False


class EmbeddingRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)
    model: str = Field(default="all-MiniLM-L6-v2")


class ActivateModelRequest(BaseModel):
    version: str


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """
    Create and configure the FastAPI application.

    Parameters
    ----------
    settings : Optional Settings override (useful in tests).
    """
    cfg = settings or get_settings()
    metrics = get_metrics()

    # Pre-build rate limiter
    limiter = RateLimiter(
        redis_url=cfg.redis_url,
        default_rate=cfg.rate_limit_requests,
        default_period=cfg.rate_limit_period_seconds,
    )

    # API key guard
    _api_key_header = APIKeyHeader(name="X-ML-API-Key", auto_error=False)

    def _check_api_key(key: Optional[str] = Security(_api_key_header)) -> None:
        if cfg.ml_api_key and key != cfg.ml_api_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid ML API key",
            )

    # ----------------------------------------------------------------
    # Lifespan
    # ----------------------------------------------------------------

    @asynccontextmanager
    async def _lifespan(app: FastAPI):
        logger.info("Warming up predictor …")
        svc = _predictor.get_predictor()
        logger.info(
            "Predictor ready (model=%s)",
            svc.model_manager.model_version or "heuristic-v1",
        )
        yield

    # ----------------------------------------------------------------
    # App
    # ----------------------------------------------------------------

    app = FastAPI(
        title=cfg.service_name,
        version="2.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )

    # ----------------------------------------------------------------
    # Middleware: request metrics + rate limiting
    # ----------------------------------------------------------------

    @app.middleware("http")
    async def _request_middleware(request: Request, call_next):
        t0 = time.monotonic()
        client_id = request.client.host if request.client else "unknown"

        # Rate limiting
        if not limiter.allow(client_id):
            return Response(
                content='{"detail":"Rate limit exceeded"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(cfg.rate_limit_period_seconds)},
            )

        response = await call_next(request)
        elapsed = time.monotonic() - t0

        # Prometheus HTTP metrics
        metrics.http_requests_total.labels(
            method=request.method,
            endpoint=request.url.path,
            status_code=str(response.status_code),
        ).inc()
        metrics.http_request_duration_seconds.labels(
            method=request.method,
            endpoint=request.url.path,
        ).observe(elapsed)

        # Rate-limit info headers
        remaining = limiter.remaining(client_id)
        response.headers["X-RateLimit-Limit"] = str(cfg.rate_limit_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response

    # ================================================================
    # Routes
    # ================================================================

    _start_time = time.time()

    # ----------------------------------------------------------------
    # Ops
    # ----------------------------------------------------------------

    @app.get("/health", tags=["ops"])
    def health():
        svc = _predictor.get_predictor()
        mm = svc.model_manager
        return {
            "status": "healthy",
            "service": cfg.service_name,
            "environment": cfg.environment,
            "uptime_seconds": round(time.time() - _start_time, 1),
            "model_loaded": mm.model is not None,
            "model_version": mm.model_version or "heuristic-v1",
            "circuit_breaker": mm.circuit_breaker.state,
        }

    @app.get("/ready", tags=["ops"])
    def readiness():
        try:
            svc = _predictor.get_predictor()
            return {
                "status": "ready",
                "model": svc.model_manager.model_version or "heuristic-v1",
            }
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc))

    @app.get("/metrics", tags=["ops"])
    def prometheus_metrics():
        try:
            from prometheus_client import generate_latest, CONTENT_TYPE_LATEST  # type: ignore
            return Response(
                content=generate_latest(), media_type=CONTENT_TYPE_LATEST
            )
        except ImportError:
            raise HTTPException(status_code=501,
                                detail="prometheus_client not installed")

    # ----------------------------------------------------------------
    # Prediction
    # ----------------------------------------------------------------

    @app.post("/api/v1/predict", tags=["predict"])
    def predict(
        features: StartupFeatures,
        _: None = Depends(_check_api_key),
        current_user: Optional[Dict[str, Any]] = Depends(get_current_user),
    ):
        data = features.model_dump(exclude={"startup_id"})
        try:
            result = _predictor.predict(data)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            logger.exception("Prediction error")
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return {**result, "startup_id": features.startup_id}

    @app.post("/api/v1/predict/batch", tags=["predict"])
    def predict_batch(
        items: List[StartupFeatures],
        skip_cache: bool = False,
        _: None = Depends(_check_api_key),
        current_user: Optional[Dict[str, Any]] = Depends(get_current_user),
    ):
        if len(items) > cfg.max_batch_size:
            raise HTTPException(
                status_code=400,
                detail=f"Batch size limited to {cfg.max_batch_size}",
            )
        if not items:
            return {"results": [], "count": 0}

        # Emit batch-size metric
        metrics.batch_size_histogram.observe(len(items))

        payloads = [i.model_dump(exclude={"startup_id"}) for i in items]
        results = _predictor.batch_predict(payloads, skip_cache=skip_cache)

        for i, item in enumerate(items):
            if isinstance(results[i], dict) and "error" not in results[i]:
                results[i]["startup_id"] = item.startup_id

        return {"results": results, "count": len(results)}

    @app.post("/api/v1/predict/embedding", tags=["predict"])
    def get_embedding(
        req: EmbeddingRequest,
        _: None = Depends(_check_api_key),
    ):
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            st_model = SentenceTransformer(req.model)
            vector = st_model.encode(req.text).tolist()
            checksum = hashlib.md5(req.text.encode()).hexdigest()[:8]
            return {
                "embedding": vector,
                "dimensions": len(vector),
                "model": req.model,
                "text_checksum": checksum,
            }
        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="sentence-transformers not installed",
            )

    # ----------------------------------------------------------------
    # Model management
    # ----------------------------------------------------------------

    @app.get("/api/v1/models", tags=["model"])
    def list_models(_: None = Depends(_check_api_key)):
        svc = _predictor.get_predictor()
        mm = svc.model_manager
        return {
            "active_version": mm.model_version or "heuristic-v1",
            "model_loaded": mm.model is not None,
            "model_file": str(_predictor.XGB_MODEL_FILE),
            "feature_count": _predictor.FEATURE_COUNT,
            "feature_names": _predictor.FEATURE_NAMES,
            "versions": mm.registry.list_versions(),
        }

    @app.post("/api/v1/models/activate", tags=["model"])
    def activate_model(
        body: ActivateModelRequest,
        admin: Dict[str, Any] = Depends(require_admin),
    ):
        svc = _predictor.get_predictor()
        ok = svc.model_manager.registry.activate(body.version)
        if not ok:
            raise HTTPException(
                status_code=404,
                detail=f"Version '{body.version}' not found",
            )
        svc.model_manager.reload()
        return {
            "status": "activated",
            "version": body.version,
            "model_version": svc.model_manager.model_version,
        }

    @app.post("/api/v1/models/reload", tags=["model"])
    def reload_model(_: None = Depends(_check_api_key)):
        svc = _predictor.get_predictor()
        ok = svc.model_manager.reload()
        if not ok:
            raise HTTPException(
                status_code=404,
                detail="No model file found",
            )
        return {
            "status": "reloaded",
            "model_version": svc.model_manager.model_version or "heuristic-v1",
        }

    @app.delete("/api/v1/models/{version}", tags=["model"])
    def delete_model(
        version: str,
        remove_file: bool = False,
        admin: Dict[str, Any] = Depends(require_admin),
    ):
        svc = _predictor.get_predictor()
        ok = svc.model_manager.registry.delete(version, remove_file=remove_file)
        if not ok:
            raise HTTPException(
                status_code=404,
                detail=f"Version '{version}' not found",
            )
        return {"status": "deleted", "version": version}

    return app


# ---------------------------------------------------------------------------
# Module-level app instance (used when running directly)
# ---------------------------------------------------------------------------

app = create_app()
