"""
ml/cache/redis_cache.py
=======================
Two-tier prediction cache:
  Tier 1 — Redis (distributed, configurable TTL)
  Tier 2 — In-process LRU dict (local, short TTL)

The cache is keyed on a deterministic MD5 hash of the sorted JSON payload so
identical prediction requests return the same cached result.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class PredictionCache:
    """
    Redis-backed prediction cache with transparent local fallback.

    Parameters
    ----------
    redis_url:
        Optional redis:// or rediss:// connection string.
        When None or when Redis is unreachable, only the local tier is used.
    default_ttl:
        Cache entry TTL in seconds (Redis).
    local_ttl:
        In-process cache TTL in seconds.
    key_prefix:
        Namespace prefix prepended to every cache key.
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        default_ttl: int = 300,
        local_ttl: int = 60,
        key_prefix: str = "pitchmic:pred",
    ):
        self.default_ttl = default_ttl
        self.local_ttl = local_ttl
        self.key_prefix = key_prefix
        self._redis = None
        # local store: key → (result_dict, expiry_epoch_float)
        self._local: Dict[str, Tuple[Dict[str, Any], float]] = {}

        if redis_url:
            self._connect(redis_url)

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def _connect(self, redis_url: str) -> None:
        try:
            import redis as redis_lib  # type: ignore

            client = redis_lib.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=True,
            )
            client.ping()
            self._redis = client
            logger.info("PredictionCache connected to Redis at %s", redis_url)
        except ImportError:
            logger.warning("redis package not installed — local cache only")
        except Exception as exc:
            logger.warning("Redis unavailable (%s) — local cache only", exc)

    # ------------------------------------------------------------------
    # Key generation
    # ------------------------------------------------------------------

    def _make_key(self, data: Dict[str, Any]) -> str:
        """Deterministic cache key from request payload."""
        blob = json.dumps(data, sort_keys=True, default=str)
        digest = hashlib.md5(blob.encode(), usedforsecurity=False).hexdigest()
        return f"{self.key_prefix}:{digest}"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Return cached prediction or None."""
        key = self._make_key(data)

        # --- Tier 1: Redis ---
        if self._redis is not None:
            try:
                raw = self._redis.get(key)
                if raw:
                    logger.debug("Cache HIT (Redis) key=%s", key)
                    return json.loads(raw)
            except Exception as exc:
                logger.warning("Redis GET failed: %s", exc)

        # --- Tier 2: local ---
        entry = self._local.get(key)
        if entry is not None:
            result, expiry = entry
            if time.monotonic() < expiry:
                logger.debug("Cache HIT (local) key=%s", key)
                return result
            # Expired — evict
            del self._local[key]

        logger.debug("Cache MISS key=%s", key)
        return None

    def set(
        self,
        data: Dict[str, Any],
        result: Dict[str, Any],
        ttl: Optional[int] = None,
    ) -> None:
        """Store prediction result in both cache tiers."""
        key = self._make_key(data)
        ttl = ttl if ttl is not None else self.default_ttl
        payload = json.dumps(result, default=str)

        # --- Tier 1: Redis ---
        if self._redis is not None:
            try:
                self._redis.setex(key, ttl, payload)
                logger.debug("Cache SET (Redis) key=%s ttl=%ds", key, ttl)
            except Exception as exc:
                logger.warning("Redis SET failed: %s", exc)

        # --- Tier 2: local ---
        self._local[key] = (result, time.monotonic() + self.local_ttl)
        logger.debug("Cache SET (local) key=%s ttl=%ds", key, self.local_ttl)

    def invalidate(self, data: Dict[str, Any]) -> None:
        """Remove a specific entry from both tiers."""
        key = self._make_key(data)
        if self._redis is not None:
            try:
                self._redis.delete(key)
            except Exception as exc:
                logger.warning("Redis DELETE failed: %s", exc)
        self._local.pop(key, None)

    def flush_local(self) -> int:
        """Clear all expired entries from the local tier. Returns eviction count."""
        now = time.monotonic()
        expired = [k for k, (_, exp) in self._local.items() if now >= exp]
        for k in expired:
            del self._local[k]
        return len(expired)

    def ping(self) -> bool:
        """Check Redis connectivity. Returns True if Redis is reachable."""
        if self._redis is None:
            return False
        try:
            return self._redis.ping()
        except Exception:
            return False

    @property
    def backend(self) -> str:
        return "redis" if self._redis is not None else "local"
