"""
ml/security/auth.py
===================
JWT authentication and role-based access control for the ML service.

Tokens are issued by the Django backend and verified here.
AuthManager provides static helpers for token creation/verification and
bcrypt password operations.  FastAPI dependencies (get_current_user,
require_auth, require_admin) are defined at module level and safe to import
regardless of whether FastAPI is installed.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional heavy imports — graceful fallback in non-HTTP contexts
# ---------------------------------------------------------------------------

try:
    from fastapi import Depends, HTTPException, Security, status
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
    _security_scheme = HTTPBearer(auto_error=False)
    _FASTAPI = True
except ImportError:  # pragma: no cover
    _FASTAPI = False
    _security_scheme = None  # type: ignore[assignment]

try:
    import jwt as _pyjwt  # PyJWT ≥ 2.x
    _JWT = True
except ImportError:
    logger.warning("PyJWT not installed — JWT auth disabled")
    _JWT = False

try:
    import bcrypt as _bcrypt  # type: ignore
    _BCRYPT = True
except ImportError:
    logger.warning("bcrypt not installed — password hashing disabled")
    _BCRYPT = False

# ---------------------------------------------------------------------------
# Settings helpers — cached to avoid repeated import attempts per request
# ---------------------------------------------------------------------------

_settings_cache: Optional[Any] = None
_settings_attempted = False


def _get_settings() -> Optional[Any]:
    """Return ml.config Settings singleton; None if unavailable."""
    global _settings_cache, _settings_attempted
    if _settings_attempted:
        return _settings_cache
    _settings_attempted = True
    try:
        from ml.config.settings import get_settings
        _settings_cache = get_settings()
    except Exception:
        _settings_cache = None
    return _settings_cache


def _secret_key() -> str:
    cfg = _get_settings()
    if cfg:
        return cfg.jwt_secret_key
    return os.environ.get("JWT_SECRET_KEY", "CHANGE_ME_IN_PRODUCTION")


def _algorithm() -> str:
    cfg = _get_settings()
    return cfg.jwt_algorithm if cfg else "HS256"


def _token_ttl() -> int:
    cfg = _get_settings()
    return cfg.access_token_expire_minutes if cfg else 30

# ---------------------------------------------------------------------------
# AuthManager
# ---------------------------------------------------------------------------

class AuthManager:
    """Stateless JWT utilities — all methods are static."""

    @staticmethod
    def create_access_token(
        user_id: str,
        role: str = "user",
        extra_claims: Optional[Dict[str, Any]] = None,
        expires_in_minutes: Optional[int] = None,
    ) -> str:
        if not _JWT:
            raise RuntimeError("PyJWT is required for JWT auth")
        ttl = expires_in_minutes or _token_ttl()
        now = datetime.now(tz=timezone.utc)
        payload: Dict[str, Any] = {
            "sub": user_id,
            "role": role,
            "iat": now,
            "exp": now + timedelta(minutes=ttl),
        }
        if extra_claims:
            payload.update(extra_claims)
        return _pyjwt.encode(payload, _secret_key(), algorithm=_algorithm())

    @staticmethod
    def verify_token(token: str) -> Dict[str, Any]:
        """
        Verify and decode a JWT.

        Always raises (HTTPException or ValueError) on failure — never
        returns None implicitly.  FIX: added bare PyJWTError catch-all and
        explicit raise after except chain.
        """
        if not _JWT:
            raise RuntimeError("PyJWT is required for JWT auth")

        def _fail(detail: str) -> None:
            if _FASTAPI:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=detail,
                    headers={"WWW-Authenticate": "Bearer"},
                )
            raise ValueError(detail)

        try:
            payload: Dict[str, Any] = _pyjwt.decode(
                token,
                _secret_key(),
                algorithms=[_algorithm()],
                options={"require": ["exp", "sub"]},
            )
            return payload
        except _pyjwt.ExpiredSignatureError:
            _fail("Token has expired")
        except _pyjwt.InvalidTokenError as exc:
            _fail(f"Invalid token: {exc}")
        except Exception as exc:
            # Catch-all: any unexpected pyjwt / crypto failure
            _fail(f"Token verification failed: {exc}")

        # FIX: unreachable but satisfies type checker — _fail always raises
        raise RuntimeError("verify_token: unreachable")

    @staticmethod
    def hash_password(plain: str) -> str:
        if not _BCRYPT:
            raise RuntimeError("bcrypt is required for password hashing")
        return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt(rounds=12)).decode()

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        if not _BCRYPT:
            raise RuntimeError("bcrypt is required for password hashing")
        return _bcrypt.checkpw(plain.encode(), hashed.encode())

# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    credentials: Optional["HTTPAuthorizationCredentials"] = (
        Security(_security_scheme) if _FASTAPI else None
    ),
) -> Optional[Dict[str, Any]]:
    """
    Extract and verify the Bearer token.
    Returns the decoded payload or None (unauthenticated but not blocked).
    Individual routes decide whether to require auth.
    """
    if not _FASTAPI:
        return None
    if credentials is None:
        return None
    return AuthManager.verify_token(credentials.credentials)


# FIX: use a plain function body guard instead of fragile conditional Depends
if _FASTAPI:
    def require_auth(
        current_user: Optional[Dict[str, Any]] = Depends(get_current_user),
    ) -> Dict[str, Any]:
        """Enforce that a valid token was supplied."""
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return current_user

    def require_admin(
        current_user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """Enforce admin role."""
        if current_user.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )
        return current_user
else:
    # Non-FastAPI contexts: stubs that always return empty dict
    def require_auth(**_) -> Dict[str, Any]:  # type: ignore[misc]
        return {}

    def require_admin(**_) -> Dict[str, Any]:  # type: ignore[misc]
        return {}
