"""
ml/main.py
==========
FastAPI ML serving entry-point.

Fixes applied
-------------
- /model/info  : uses predictor.FEATURE_NAMES instead of stale hardcoded list.
- /predict/batch: delegates to predictor.batch_predict() (parallel ThreadPool).
- /model/reload : calls model_manager.reload() to update the live service
                  instance; also updates the module-level _xgb_model alias.
- Lifespan      : pre-warms the predictor singleton so the first request
                  does not pay model-load latency.
- /predict/success: removed duplicate outer latency measurement; the result
                    from predictor.predict() already includes latency_ms.

Endpoints
---------
GET  /health            liveness + readiness info
GET  /ready             Kubernetes readiness probe
GET  /metrics           Prometheus text exposition
POST /predict/success   single startup prediction
POST /predict/batch     parallel batch prediction
POST /predict/embedding sentence-transformer embedding
GET  /model/info        feature schema + active version
POST /model/reload      hot-reload model (requires API key)
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel, Field

import predictor

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(asctime)s %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# API-key guard (set ML_API_KEY env var to enable; leave blank to disable)
# ---------------------------------------------------------------------------

_ML_API_KEY = os.environ.get("ML_API_KEY", "")
_api_key_header = APIKeyHeader(name="X-ML-API-Key", auto_error=False)

_start_time = time.time()


def _check_api_key(key: str | None = Security(_api_key_header)) -> None:
    if _ML_API_KEY and key != _ML_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid ML API key")


# ---------------------------------------------------------------------------
# Lifespan — pre-warm singleton so readiness probe works correctly
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-warm predictor on startup so the first request is not slow."""
    logger.info("Pre-warming predictor singleton…")
    predictor.get_predictor()          # blocks until model is loaded/attempted
    logger.info("Predictor ready (model=%s)",
                predictor.get_predictor().model_manager.model_version
                or "heuristic-v1")
    yield
    # Shutdown hook — nothing to clean up for this service


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="PitchMic ML Service",
    description="Startup success prediction, ROI simulation, and embedding API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request/response schemas
# ---------------------------------------------------------------------------

class StartupFeatures(BaseModel):
    startup_id: int | None = None
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
    runway_months: int | None = Field(default=None, ge=0)
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


class PredictionResponse(BaseModel):
    startup_id: int | None
    success_probability: float
    confidence_lower: float
    confidence_upper: float
    model: str
    model_version: str
    roi: dict[str, Any]
    exit_prediction: dict[str, Any]
    shap_top_features: list[dict[str, Any]]
    request_id: str
    latency_ms: float
    environment: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["ops"])
def health():
    """Liveness probe — always returns 200 while the process is alive."""
    svc = predictor.get_predictor()
    mm = svc.model_manager
    return {
        "status": "healthy",
        "service": "pitchmic-ml",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "model_loaded": mm.model is not None,
        "model_version": mm.model_version or "heuristic-v1",
        "circuit_breaker": mm.circuit_breaker.state,
    }


@app.get("/ready", tags=["ops"])
def readiness():
    """
    Kubernetes readiness probe.
    Returns 503 until the predictor singleton has been initialised.
    """
    try:
        svc = predictor.get_predictor()
        # Service is ready whether using XGBoost or heuristic fallback
        return {"status": "ready",
                "model": svc.model_manager.model_version or "heuristic-v1"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/metrics", tags=["ops"])
def metrics():
    """Prometheus text exposition."""
    try:
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST  # type: ignore
        return Response(content=generate_latest(),
                        media_type=CONTENT_TYPE_LATEST)
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="prometheus_client not installed",
        )


# ---------------------------------------------------------------------------

@app.post("/predict/success", response_model=PredictionResponse, tags=["predict"])
def predict_success(
    features: StartupFeatures,
    _: None = Security(_check_api_key),
):
    """Predict success probability + ROI + exit timeline for one startup."""
    data = features.model_dump(exclude={"startup_id"})
    try:
        result = predictor.predict(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # FIX: predictor.predict() already measures and sets latency_ms;
    # don't add a redundant outer timestamp that would overwrite it.
    return {**result, "startup_id": features.startup_id}


@app.post("/predict/batch", tags=["predict"])
def predict_batch(
    items: list[StartupFeatures],
    skip_cache: bool = False,
    _: None = Security(_check_api_key),
):
    """
    Parallel batch prediction.

    FIX: delegates to predictor.batch_predict() (ThreadPoolExecutor)
    instead of a plain sequential for-loop.
    """
    if len(items) > 100:
        raise HTTPException(status_code=400, detail="Batch size limited to 100")
    if not items:
        return {"results": [], "count": 0}

    payloads = [item.model_dump(exclude={"startup_id"}) for item in items]
    results = predictor.batch_predict(payloads, skip_cache=skip_cache)

    # Re-attach startup_id from the original request items
    for i, item in enumerate(items):
        if isinstance(results[i], dict) and "error" not in results[i]:
            results[i]["startup_id"] = item.startup_id

    return {"results": results, "count": len(results)}


@app.post("/predict/embedding", tags=["predict"])
def get_embedding(
    req: EmbeddingRequest,
    _: None = Security(_check_api_key),
):
    """Generate a sentence-transformer embedding vector for semantic matching."""
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
            detail="sentence-transformers not installed in this container",
        )


# ---------------------------------------------------------------------------

@app.get("/model/info", tags=["model"])
def model_info():
    """
    Return the active model version and the canonical feature schema.

    FIX: uses predictor.FEATURE_NAMES directly instead of a stale
    hardcoded list that had wrong names (current_revenue_norm, burn_rate_safety, etc.)
    """
    svc = predictor.get_predictor()
    mm = svc.model_manager
    return {
        "active_model": mm.model_version or "heuristic-v1",
        "model_loaded": mm.model is not None,
        "model_file": str(predictor.XGB_MODEL_FILE),
        "model_file_exists": predictor.XGB_MODEL_FILE.exists(),
        "feature_count": predictor.FEATURE_COUNT,
        "feature_names": predictor.FEATURE_NAMES,  # FIX: canonical list from predictor
        "registry_versions": mm.registry.list_versions(),
    }


@app.post("/model/reload", tags=["model"])
def reload_model(_: None = Security(_check_api_key)):
    """
    Hot-reload the XGBoost model from disk without restarting the container.

    FIX: calls model_manager.reload() which updates the live ModelManager
    instance (and the module-level _xgb_model alias) in the current process.
    """
    svc = predictor.get_predictor()
    mm = svc.model_manager
    ok = mm.reload()
    if not ok:
        raise HTTPException(
            status_code=404,
            detail="No model file found at configured model path",
        )
    return {
        "message": "Model reloaded successfully",
        "model_version": mm.model_version or "heuristic-v1",
    }
