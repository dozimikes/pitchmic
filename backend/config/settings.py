from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR: Path = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    SECRET_KEY=(str, "insecure-dev-key-change-in-production"),
    ALLOWED_HOSTS=(list, ["*"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:3000", "http://127.0.0.1:3000"]),
    # Defaults to SQLite so `python manage.py check` works without Postgres
    DATABASE_URL=(str, "sqlite:///./db.sqlite3"),
    REDIS_URL=(str, "redis://localhost:6379/0"),
    CELERY_BROKER_URL=(str, "redis://localhost:6379/1"),
    CELERY_RESULT_BACKEND=(str, "redis://localhost:6379/2"),
    PAYSTACK_SECRET_KEY=(str, "test_paystack_secret_key_local_dev"),
    PAYSTACK_PUBLIC_KEY=(str, "pk_test_local_dev_public_key"),
)

environ.Env.read_env(os.path.join(BASE_DIR, ".env"))

SECRET_KEY: str = env("SECRET_KEY")
DEBUG: bool = env("DEBUG")
ALLOWED_HOSTS: list[str] = env("ALLOWED_HOSTS")
PAYSTACK_SECRET_KEY: str = env("PAYSTACK_SECRET_KEY")
PAYSTACK_PUBLIC_KEY: str = env("PAYSTACK_PUBLIC_KEY")

INSTALLED_APPS: list[str] = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "channels",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_celery_beat",
    "django_filters",
    "drf_spectacular",
    "django.contrib.postgres",
    "apps.users",
    "apps.pitches",
    "apps.offers",
    "apps.newsfeed",
    "apps.notifications",
    "apps.startups",
    "apps.investors",
    "apps.billing",
    #  Intelligence / ML apps 
    "apps.matching",
    "apps.analytics",
    "apps.intelligence",
    "apps.predictive_intelligence",
    "apps.dataroom",
    "apps.marketing",
    "apps.accelerator",
    # Intelligence Engine — real-time funding intelligence pipeline
    "apps.intelligence_engine",
    # Fundability Engine
    "apps.fundability",
    # Application Intelligence Engine
    "apps.application_intelligence",
]

MIDDLEWARE: list[str] = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF: str = "config.urls"

TEMPLATES: list[dict] = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION: str = "config.wsgi.application"
ASGI_APPLICATION: str = "config.asgi.application"

CHANNEL_LAYERS: dict = {
    "default": {
        # Use in-memory channel layer when Redis isn't available (e.g. local
        # `manage.py check` without Redis running).  Override to RedisChannelLayer
        # in production via REDIS_URL env var.
        "BACKEND": "channels.layers.InMemoryChannelLayer"
        if env("REDIS_URL", default="").startswith("redis://localhost") and DEBUG
        else "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [env("REDIS_URL", default="redis://localhost:6379/0")],
        },
    },
}

DATABASES: dict = {
    "default": env.db("DATABASE_URL"),
}

CACHES: dict = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
        "KEY_PREFIX": "pitchmic",
    }
}

SESSION_ENGINE: str = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS: str = "default"

AUTH_USER_MODEL: str = "users.User"

AUTH_PASSWORD_VALIDATORS: list[dict] = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS: list[str] = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

LANGUAGE_CODE: str = "en-us"
TIME_ZONE: str = "UTC"
USE_I18N: bool = True
USE_TZ: bool = True

STATIC_URL: str = "/static/"
STATIC_ROOT: Path = BASE_DIR / "staticfiles"
# Only include STATICFILES_DIRS entry if the directory actually exists
# (avoids ImproperlyConfigured during CI / docker builds before collectstatic)
_static_src = BASE_DIR / "static"
STATICFILES_DIRS: list[Path] = [_static_src] if _static_src.is_dir() else []

MEDIA_URL: str = "/media/"
MEDIA_ROOT: Path = BASE_DIR / "media"

DEFAULT_AUTO_FIELD: str = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS: list[str] = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS: bool = True
CORS_ALLOW_ALL_ORIGINS: bool = DEBUG

REST_FRAMEWORK: dict = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "rest_framework.views.exception_handler",
}

SIMPLE_JWT: dict = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
    "JTI_CLAIM": "jti",
    "SLIDING_TOKEN_REFRESH_EXP_CLAIM": "refresh_exp",
    "SLIDING_TOKEN_LIFETIME": timedelta(minutes=30),
    "SLIDING_TOKEN_REFRESH_LIFETIME": timedelta(days=7),
}

SPECTACULAR_SETTINGS: dict = {
    "TITLE": "PitchMic API",
    "DESCRIPTION": "PitchMic - Connect startups with investors",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v[0-9]+/",
    "SWAGGER_UI_SETTINGS": {
        "persistAuthorization": True,
    },
    "REDOC_UI_SETTINGS": {
        "theme": {
            "colors": {
                "primary": {
                    "main": "#6366f1",
                },
            },
        },
    },
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_ADD_EXPLICIT_BLANK_NULL_CHOICE": False,
    "GENERAL_ENUM_ADD_LABELS": True,
    "POSTPROCESSING_HOOKS": [],
}

CELERY_BROKER_URL: str = env("CELERY_BROKER_URL")
CELERY_RESULT_BACKEND: str = env("CELERY_RESULT_BACKEND")
CELERY_ACCEPT_CONTENT: list[str] = ["json"]
CELERY_TASK_SERIALIZER: str = "json"
CELERY_RESULT_SERIALIZER: str = "json"
CELERY_TIMEZONE: str = TIME_ZONE
CELERY_TASK_TRACK_STARTED: bool = True
CELERY_TASK_TIME_LIMIT: int = 30 * 60

# ── Intelligence Engine Celery Beat schedule ──────────────────────────────────
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE: dict = {
    # Crawl all due sources every 30 minutes (T1 hourly sources crawled 2x/hr)
    "ie_crawl_due_sources": {
        "task": "intelligence_engine.crawl_due_sources",
        "schedule": crontab(minute="*/30"),
        "kwargs": {"limit": 25},
    },
    # Retire expired opportunities daily at 00:30
    "ie_retire_expired_opportunities": {
        "task": "intelligence_engine.retire_expired_opportunities",
        "schedule": crontab(hour="0", minute="30"),
    },
    # Recompute investor thesis alignment daily at 03:00
    "ie_recompute_investor_theses": {
        "task": "intelligence_engine.recompute_investor_theses",
        "schedule": crontab(hour="3", minute="0"),
    },
    # Recompute freshness scores every 2 hours
    "ie_recompute_freshness": {
        "task": "intelligence_engine.recompute_freshness_scores",
        "schedule": crontab(minute="0", hour="*/2"),
    },
    # Legacy matching sync (kept for backward compat)
    "matching_sync_ecosystem": {
        "task": "matching.sync_ecosystem_opportunities",
        "schedule": crontab(minute="0", hour="*/6"),
    },
}

DEFAULT_FILE_STORAGE: str = "django.core.files.storage.FileSystemStorage"

FRONTEND_BASE_URL: str = env("FRONTEND_BASE_URL", default="http://localhost:3000")
DEFAULT_FROM_EMAIL: str = env("DEFAULT_FROM_EMAIL", default="noreply@pitchmic.com")

LOGS_DIR: Path = BASE_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

if not DEBUG:
    SECURE_HSTS_SECONDS: int = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS: bool = True
    SECURE_HSTS_PRELOAD: bool = True
    SECURE_SSL_REDIRECT: bool = True
    SESSION_COOKIE_SECURE: bool = True
    CSRF_COOKIE_SECURE: bool = True
    SECURE_BROWSER_XSS_FILTER: bool = True
    SECURE_CONTENT_TYPE_NOSNIFF: bool = True

LOGGING: dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "level": "DEBUG",
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
        "file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": BASE_DIR / "logs" / "django.log",
            "maxBytes": 1024 * 1024 * 10,
            "backupCount": 10,
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
        # App-level debug logging - useful during development
        "apps.pitches": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
        "apps.users": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}

# ======================================================================
# ML / AI service configuration  (ML-core, AI-optional philosophy)
# ======================================================================
# Pitchmic = Machine-Learning-Native Venture Intelligence Infrastructure.
# The ML engine (predictive models, graph ML, behavioral ML, Bayesian
# inference, survival analysis, ranking, calibration, anomaly detection) is
# ALWAYS active and is the source of record for any probability or score.
#
# AI/LLMs are an auxiliary layer used ONLY for:
#   - unstructured-data ingestion (pitch-deck claim extraction)
#   - natural-language explanation of ML results
# They NEVER own a probability, rank, or forecast.  To disable AI entirely
# (pure-ML mode), set ENABLE_AI_FEATURES=False.  Individual provider creds
# are ignored when ENABLE_AI_FEATURES is False.
#
# Fine-grained capability registry lives in:
#   apps.predictive_intelligence.ai_gateway.FEATURE_CAPABILITIES
# and is persisted to the AICapability ORM model for admin runtime toggles.
# Every AI-augmented feature is classified as:
#   "ml_only"  → always on, no LLM involvement
#   "ai_opt"   → LLM when available, heuristic fallback always present
#   "ai_req"   → disabled in pure-ML mode (AI is hard requirement)
#
# Expose the runtime matrix via:
#   GET /api/v1/predictive/features/capabilities/
# ======================================================================

ENABLE_AI_FEATURES: bool = env("ENABLE_AI_FEATURES", default=False)

ML_SERVICE_URL: str = env("ML_SERVICE_URL", default="http://ml-service:5000")

AI_PROVIDERS: dict[str, dict[str, str]] = {
    "openai": {
        "api_key": env("OPENAI_API_KEY", default=""),
        "base_url": env("OPENAI_BASE_URL", default=""),
        "default_model": env("OPENAI_DEFAULT_MODEL", default="gpt-4o-mini"),
    },
    "gemini": {
        "api_key": env("GOOGLE_GEMINI_API_KEY", default=""),
        "default_model": env("GEMINI_DEFAULT_MODEL", default="gemini-1.5-flash"),
    },
    "openrouter": {
        "api_key": env("OPENROUTER_API_KEY", default=""),
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": env("OPENROUTER_DEFAULT_MODEL", default="meta-llama/llama-3.1-70b-instruct"),
    },
    "noop": {
        "api_key": "",
        "base_url": "",
        "default_model": "deterministic-fallback",
    },
}
AI_DEFAULT_PROVIDER: str = env("AI_DEFAULT_PROVIDER", default="noop")
OPENAI_API_KEY: str = AI_PROVIDERS["openai"]["api_key"]
GOOGLE_GEMINI_API_KEY: str = AI_PROVIDERS["gemini"]["api_key"]

# Per-install admin override: set entries here to force-disable specific
# feature-keys (regardless of their tier or AI availability).
# Example:
#   AI_CAPABILITY_OVERRIDES = {"deck.claim_extraction": False}
AI_CAPABILITY_OVERRIDES: dict[str, bool] = {}

# ======================================================================
# Celery Beat periodic task schedule
# ======================================================================
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE: dict = {
    #  Nightly match-score refresh (2 AM UTC) 
    "update-all-match-scores-nightly": {
        "task": "matching.update_all_match_scores",
        "schedule": crontab(hour=2, minute=0),
        "options": {"queue": "ml"},
    },
    #  Nightly prediction refresh (3 AM UTC) 
    "update-all-predictions-nightly": {
        "task": "analytics.update_all_predictions",
        "schedule": crontab(hour=3, minute=0),
        "options": {"queue": "ml"},
    },
    #  Weekly investor behavior analysis (Sunday 4 AM UTC) 
    "update-investor-behavior-weekly": {
        "task": "analytics.update_investor_behavior_all",
        "schedule": crontab(hour=4, minute=0, day_of_week="sunday"),
        "options": {"queue": "default"},
    },
    #  Daily campaign send batches (9 AM UTC) 
    "send-campaign-batches-daily": {
        "task": "marketing.send_all_active_campaigns",
        "schedule": crontab(hour=9, minute=0),
        "options": {"queue": "default"},
    },
}

# Named Celery queues
CELERY_TASK_ROUTES: dict = {
    "matching.*": {"queue": "ml"},
    "analytics.*": {"queue": "ml"},
    "intelligence.*": {"queue": "ml"},
    "marketing.*": {"queue": "default"},
    "users.*": {"queue": "default"},
}
