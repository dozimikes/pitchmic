"""
ml/security/rate_limiter.py
============================
Sliding-window rate limiter.

Redis backend  — uses a single Lua script so the check-and-add is atomic
                 (fixes the TOCTOU race in the original two-pipeline approach).
In-memory fallback — protected by a threading.Lock; periodic background
                     eviction prevents unbounded growth.
"""
from __future__ import annotations

import logging
import time
import threading
from collections import defaultdict
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Atomic Lua script for Redis sliding-window
# ---------------------------------------------------------------------------
# KEYS[1] = sorted-set key
# ARGV[1] = now (float seconds)
# ARGV[2] = window_start  (now - period)
# ARGV[3] = rate  (int)
# ARGV[4] = weight (int)
# ARGV[5] = period + 5  (key TTL seconds)
#
# Returns 1 if allowed, 0 if rejected.
# ---------------------------------------------------------------------------
_LUA_ALLOW = """
local key          = KEYS[1]
local now          = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local rate         = tonumber(ARGV[3])
local weight       = tonumber(ARGV[4])
local ttl          = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
local count = tonumber(redis.call('ZCARD', key))

if count + weight > rate then
    return 0
end

for i = 1, weight do
    redis.call('ZADD', key, now, now .. ':' .. i .. ':' .. math.random(1e9))
end
redis.call('EXPIRE', key, ttl)
return 1
"""

_LUA_REMAINING = """
local key          = KEYS[1]
local now          = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local rate         = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
local count = tonumber(redis.call('ZCARD', key))
return math.max(0, rate - count)
"""


class RateLimiter:
    """
    Sliding-window rate limiter.

    Parameters
    ----------
    redis_url:      Optional Redis connection URL.
    default_rate:   Requests allowed per window.
    default_period: Window length in seconds.
    key_prefix:     Namespace prefix for Redis / memory keys.
    evict_interval: Seconds between background eviction sweeps (memory backend).
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        default_rate: int = 100,
        default_period: int = 60,
        key_prefix: str = "pitchmic:rl",
        evict_interval: int = 120,
    ):
        self.default_rate = default_rate
        self.default_period = default_period
        self.key_prefix = key_prefix
        self._redis = None
        self._lua_allow = None
        self._lua_remaining = None

        # In-memory fallback — lock + bounded dict
        self._lock = threading.Lock()
        self._memory: Dict[str, List[float]] = defaultdict(list)

        if redis_url:
            self._connect(redis_url)

        # Background eviction for in-memory store
        self._start_eviction_thread(evict_interval)

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def _connect(self, redis_url: str) -> None:
        try:
            import redis as redis_lib  # type: ignore
            client = redis_lib.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            client.ping()
            self._redis = client
            # Pre-register Lua scripts so Redis compiles them once
            self._lua_allow = client.register_script(_LUA_ALLOW)
            self._lua_remaining = client.register_script(_LUA_REMAINING)
            logger.info("RateLimiter connected to Redis at %s", redis_url)
        except ImportError:
            logger.warning(
                "redis package not installed — using in-memory rate limiter"
            )
        except Exception as exc:
            logger.warning(
                "RateLimiter Redis unavailable (%s) — using in-memory", exc
            )

    def _start_eviction_thread(self, interval: int) -> None:
        """Daemon thread: evict expired entries from the in-memory store."""
        def _evict():
            while True:
                time.sleep(interval)
                with self._lock:
                    now = time.time()
                    cutoff = now - self.default_period
                    keys_to_drop = []
                    for k, timestamps in self._memory.items():
                        active = [t for t in timestamps if t >= cutoff]
                        if active:
                            self._memory[k] = active
                        else:
                            keys_to_drop.append(k)
                    for k in keys_to_drop:
                        del self._memory[k]

        threading.Thread(target=_evict, daemon=True,
                         name="ratelimiter-evict").start()

    def _redis_key(self, client_id: str) -> str:
        return f"{self.key_prefix}:{client_id}"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def allow(
        self,
        client_id: str,
        rate: Optional[int] = None,
        period: Optional[int] = None,
        weight: int = 1,
    ) -> bool:
        """
        Return True if the request is within the rate limit.

        Parameters
        ----------
        client_id: Caller identifier (IP, user ID, API key …).
        rate:      Override default allowed requests per window.
        period:    Override default window in seconds.
        weight:    Request cost (use len(batch) for batch endpoints).
        """
        rate = rate if rate is not None else self.default_rate
        period = period if period is not None else self.default_period

        if self._redis is not None:
            return self._redis_allow(client_id, rate, period, weight)
        return self._memory_allow(client_id, rate, period, weight)

    def remaining(
        self,
        client_id: str,
        rate: Optional[int] = None,
        period: Optional[int] = None,
    ) -> int:
        """Return requests remaining in the current window."""
        rate = rate if rate is not None else self.default_rate
        period = period if period is not None else self.default_period

        if self._redis is not None:
            return self._redis_remaining(client_id, rate, period)
        return self._memory_remaining(client_id, rate, period)

    def reset(self, client_id: str) -> None:
        """Clear all request history for a client (admin / test use)."""
        key = self._redis_key(client_id)
        if self._redis is not None:
            try:
                self._redis.delete(key)
            except Exception as exc:
                logger.warning("RateLimiter reset failed for %s: %s",
                               client_id, exc)
        with self._lock:
            self._memory.pop(key, None)

    # ------------------------------------------------------------------
    # Redis backend  (atomic Lua)
    # ------------------------------------------------------------------

    def _redis_allow(self, client_id: str, rate: int, period: int,
                     weight: int) -> bool:
        try:
            now = time.time()
            result = self._lua_allow(
                keys=[self._redis_key(client_id)],
                args=[now, now - period, rate, weight, period + 5],
            )
            return bool(result)
        except Exception as exc:
            logger.warning(
                "RateLimiter Redis error (%s) — allowing request", exc
            )
            return True  # fail-open: don't block traffic on Redis outage

    def _redis_remaining(self, client_id: str, rate: int,
                         period: int) -> int:
        try:
            now = time.time()
            result = self._lua_remaining(
                keys=[self._redis_key(client_id)],
                args=[now, now - period, rate],
            )
            return max(0, int(result))
        except Exception:
            return rate

    # ------------------------------------------------------------------
    # In-memory backend  (thread-safe)
    # ------------------------------------------------------------------

    def _memory_allow(self, client_id: str, rate: int, period: int,
                      weight: int) -> bool:
        now = time.time()
        window_start = now - period
        key = self._redis_key(client_id)

        with self._lock:  # FIX: was unlocked
            # Evict expired
            self._memory[key] = [
                t for t in self._memory[key] if t >= window_start
            ]
            if len(self._memory[key]) + weight > rate:
                return False
            self._memory[key].extend([now] * weight)
            return True

    def _memory_remaining(self, client_id: str, rate: int,
                          period: int) -> int:
        now = time.time()
        window_start = now - period
        key = self._redis_key(client_id)

        with self._lock:  # FIX: was unlocked
            count = sum(
                1 for t in self._memory.get(key, []) if t >= window_start
            )
        return max(0, rate - count)
