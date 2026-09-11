"""
apps.users.throttles
====================
Custom DRF throttle classes for authentication endpoints.

All throttles use the Django cache backend (Redis in production) so limits are
enforced consistently across multiple Uvicorn workers and Celery processes.

Usage on a view:
    throttle_classes = [LoginRateThrottle]
"""
from __future__ import annotations

import logging

from rest_framework.throttling import AnonRateThrottle

logger = logging.getLogger(__name__)


class LoginRateThrottle(AnonRateThrottle):
    """
    Limit login attempts to 5 per minute per IP address.

    Scope key is "login" - maps to REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["login"]
    in settings.py, currently "5/minute".

    Throttled requests receive HTTP 429 Too Many Requests with a
    Retry-After header so clients can back off gracefully.

    Uses the client IP as the cache key (via get_cache_key → get_ident),
    which respects X-Forwarded-For behind a trusted reverse proxy.
    """

    scope = "login"

    def allow_request(self, request, view):
        allowed = super().allow_request(request, view)
        if not allowed:
            logger.warning(
                "Login rate limit exceeded: ip=%s",
                self.get_ident(request),
            )
        return allowed


class PasswordResetRateThrottle(AnonRateThrottle):
    """
    Limit password-reset requests to 3 per minute per IP.
    Scope: "password_reset" → DEFAULT_THROTTLE_RATES["password_reset"] = "3/minute".
    """

    scope = "password_reset"

    def allow_request(self, request, view):
        allowed = super().allow_request(request, view)
        if not allowed:
            logger.warning(
                "Password reset rate limit exceeded: ip=%s",
                self.get_ident(request),
            )
        return allowed
