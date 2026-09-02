"""
ml/config/settings.py
=====================
Centralised, environment-variable-driven configuration using pydantic-settings.

Usage
-----
    from ml.config.settings import get_settings
    cfg = get_settings()
    print(cfg.redis_url)
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

try:
    from pydantic_settings import BaseSettings  # pydantic v2
    from pydantic import Field
except ImportError:
    from pydantic import BaseSettings, Field  # type: ignore[no-redef]


class Settings(BaseSettings):
    """
    All settings can be overridden via environment variables.
    Env var names are the field names uppercased (pydantic default).
    """

    # ------------------------------------------------------------------ Service
    service_name: str = Field("pitchmic-ml", description="Service name tag for logs/metrics")
    environment: str = Field("development", description="development | staging | production")
    log_level: str = Field("INFO", description="Python logging level")

    # ------------------------------------------------------------------ Model
    model_path: Path = Field(Path("/app/models"), description="Directory for model artefacts")
    xgb_model_filename: str = Field("startup_success.xgb", description="XGBoost model filename")
    circuit_breaker_threshold: int = Field(5, description="Failures before opening circuit")
    circuit_breaker_timeout: int = Field(60, description="Seconds before half-open attempt")

    # ------------------------------------------------------------------ Cache
    redis_url: Optional[str] = Field(None, description="Redis connection URL")
    enable_cache: bool = Field(True, description="Toggle prediction caching")
    cache_ttl_seconds: int = Field(300, description="Cache entry TTL in seconds")
    local_cache_ttl: int = Field(60, description="In-process cache TTL fallback")

    # ------------------------------------------------------------------ Inference
    max_batch_size: int = Field(100, description="Maximum items per batch request")
    predict_timeout_seconds: int = Field(5, description="Per-prediction timeout")
    enable_monitoring: bool = Field(True, description="Toggle Prometheus metrics")

    # ------------------------------------------------------------------ Auth
    jwt_secret_key: str = Field(
        "CHANGE_ME_IN_PRODUCTION",
        description="HS256 signing secret — override via JWT_SECRET_KEY env var",
    )
    jwt_algorithm: str = Field("HS256")
    access_token_expire_minutes: int = Field(30)
    ml_api_key: Optional[str] = Field(
        None,
        description="Simple static API key guard (leave blank to disable)",
    )

    # ------------------------------------------------------------------ Rate limiting
    rate_limit_requests: int = Field(100, description="Requests allowed per window")
    rate_limit_period_seconds: int = Field(60, description="Rate-limit window in seconds")

    # ------------------------------------------------------------------ AWS / S3 (optional)
    aws_access_key_id: Optional[str] = Field(None)
    aws_secret_access_key: Optional[str] = Field(None)
    aws_s3_bucket: Optional[str] = Field(None, description="S3 bucket for model backups")
    aws_s3_region: str = Field("us-east-1")

    # ------------------------------------------------------------------ CORS
    cors_origins: List[str] = Field(
        default=["*"],
        description="Allowed CORS origins",
    )

    class Config:
        env_file = os.environ.get("ENV_FILE", ".env")
        env_file_encoding = "utf-8"
        case_sensitive = False
        # Allow extra env vars that aren't declared here
        extra = "ignore"

    @property
    def xgb_model_file(self) -> Path:
        return self.model_path / self.xgb_model_filename

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def s3_configured(self) -> bool:
        return bool(
            self.aws_access_key_id
            and self.aws_secret_access_key
            and self.aws_s3_bucket
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()
