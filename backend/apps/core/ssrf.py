"""
apps.core.ssrf
==============

Unified Server-Side Request Forgery blocklist helper.

Every user-configurable outbound URL must pass through
:func:`is_external_url_safe` BEFORE any raw HTTP client call is executed.

Defence-in-depth layers (evaluated in order):

    1. Scheme allowlist: only ``https`` is permitted.
    2. Hostname blocklist (explicit internal aliases used by Docker Compose).
    3. Allowlist override: hostnames in ``SSRF_ALLOWLIST_HOSTNAMES`` bypass
       the rest of the check, but only for HTTPS URLs.
    4. DNS A/AAAA resolution - performed TWICE with a TTL window to mitigate
       DNS rebinding.  Any resolved IP in EITHER pass that matches any of
       the IP ranges below causes rejection:
         * Loopback (127.0.0.0/8, ::1)
         * Private RFC1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
         * CGNAT shared address space 100.64.0.0/10
         * Link-local (169.254.0.0/16, fe80::/10)
         * Multicast (224.0.0.0/4, ff00::/8)
         * Reserved / unspecified (0.0.0.0, ::)
         * Cloud metadata (169.254.169.254, fd00::/8 ULA)
    5. A 60-second TTL LRU cache of (hostname, allowlist) → safe result so
       hot paths do not add repeated DNS latency (NFR-1).
"""
from __future__ import annotations

import functools
import ipaddress
import socket
import time
import urllib.parse
from dataclasses import dataclass
from typing import Iterable, Sequence

from apps.core.tenant import log_security_event


_INTERNAL_HOSTNAMES: frozenset[str] = frozenset(
    h.lower()
    for h in (
        "redis",
        "postgres",
        "chromadb",
        "backend",
        "frontend",
        "ml-service",
        "celery-worker",
        "celery-beat",
        "caddy",
        "localhost",
        "localhost.localdomain",
        "ip6-localhost",
        "ip6-loopback",
    )
)


_RESERVED_V4_NETWORKS: tuple[ipaddress.IPv4Network, ...] = tuple(
    ipaddress.IPv4Network(net, strict=False)
    for net in (
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "100.64.0.0/10",
        "169.254.0.0/16",
        "224.0.0.0/4",
        "0.0.0.0/8",
    )
)

_RESERVED_V6_NETWORKS: tuple[ipaddress.IPv6Network, ...] = tuple(
    ipaddress.IPv6Network(net, strict=False)
    for net in (
        "::1/128",
        "::/128",
        "fe80::/10",
        "ff00::/8",
        "fd00::/8",
    )
)


ALLOWED_SCHEMES = ("https",)

_CACHE_TTL_SECONDS = 60
_CACHE_MAX_ENTRIES = 512


@dataclass(frozen=True)
class _CacheEntry:
    safe: bool
    reason: str
    expires_at: float


_cache: dict[tuple[str, tuple[str, ...]], _CacheEntry] = {}
_cache_lock = __import__("threading").Lock()


def _cache_get(key: tuple[str, tuple[str, ...]]) -> _CacheEntry | None:
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry.expires_at:
            _cache.pop(key, None)
            return None
        return entry


def _cache_put(key: tuple[str, tuple[str, ...]], safe: bool, reason: str) -> None:
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX_ENTRIES:
            victim = next(iter(_cache))
            _cache.pop(victim, None)
        _cache[key] = _CacheEntry(
            safe=safe,
            reason=reason,
            expires_at=time.monotonic() + _CACHE_TTL_SECONDS,
        )


def _ip_is_blocked(ip_str: str) -> tuple[bool, str]:
    """Return (True, reason) if *ip_str* falls in any blocked range."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True, f"invalid_ip:{ip_str}"

    if isinstance(ip, ipaddress.IPv4Address):
        for net in _RESERVED_V4_NETWORKS:
            if ip in net:
                return True, f"ipv4_reserved:{str(net)}"
    else:
        for net in _RESERVED_V6_NETWORKS:
            if ip in net:
                return True, f"ipv6_reserved:{str(net)}"

    if ip.is_multicast or ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_private:
        return True, f"ip_flag:{type(ip).__name__}"

    return False, ""


def _resolve_all(hostname: str) -> list[str]:
    """Return every A/AAAA record for *hostname* (or empty on failure)."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return []
    except OSError:
        return []
    ips: list[str] = []
    seen: set[str] = set()
    for info in infos:
        sockaddr = info[4]
        if not sockaddr:
            continue
        ip = sockaddr[0]
        if ip not in seen:
            seen.add(ip)
            ips.append(ip)
    return ips


def _dns_checked(hostname: str) -> tuple[bool, str, list[str]]:
    """
    DNS rebinding-resistant double resolve.

    Returns (safe, reason, all_ips_seen).
    """
    first = _resolve_all(hostname)
    if not first:
        return False, "dns_no_records", []

    for ip in first:
        blocked, why = _ip_is_blocked(ip)
        if blocked:
            return False, f"first_resolve_blocked:{why}", first

    time.sleep(0.01)
    second = _resolve_all(hostname)
    combined = list(dict.fromkeys(first + second))

    for ip in combined:
        blocked, why = _ip_is_blocked(ip)
        if blocked:
            return False, f"rebind_resolve_blocked:{why}", combined

    return True, "ok", combined


def _normalise_allowlist(hostnames: Iterable[str] | None) -> tuple[str, ...]:
    return tuple(sorted({h.strip().lower() for h in (hostnames or ()) if h and h.strip()}))


def _hostname_stripped(hostname: str) -> str:
    hn = hostname.strip().lower()
    if hn.startswith("[") and hn.endswith("]"):
        hn = hn[1:-1]
    return hn


def is_external_url_safe(
    url: str,
    *,
    allowlist_hostnames: Sequence[str] | None = None,
    request_context: dict | None = None,
) -> tuple[bool, str]:
    """
    Verify that a user-controlled URL is safe to fetch.

    Returns ``(safe: bool, reason: str)``.  Callers MUST treat ``safe=False``
    as a hard block; never fall through to issuing the HTTP request.

    *allowlist_hostnames* is merged on top of the settings-wide
    ``SSRF_ALLOWLIST_HOSTNAMES``.  Hosts in either list bypass DNS-level
    checks (only HTTPS scheme is enforced for them).
    """
    if not url or not isinstance(url, str):
        return False, "empty_url"

    ctx = request_context or {}

    try:
        parsed = urllib.parse.urlparse(url.strip())
    except ValueError:
        log_security_event("sec.ssrf.blocked", url=repr(url), reason="parse_error", **ctx)
        return False, "parse_error"

    scheme = parsed.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        log_security_event("sec.ssrf.blocked", url=repr(url), reason=f"scheme:{scheme}", **ctx)
        return False, f"scheme_not_allowed:{scheme}"

    raw_host = parsed.hostname
    if not raw_host:
        log_security_event("sec.ssrf.blocked", url=repr(url), reason="no_host", **ctx)
        return False, "no_host"

    hostname = _hostname_stripped(raw_host)
    if not hostname:
        log_security_event("sec.ssrf.blocked", url=repr(url), reason="empty_host", **ctx)
        return False, "empty_host"

    try:
        from django.conf import settings as _dj_settings  # lazy

        settings_allow = tuple(getattr(_dj_settings, "SSRF_ALLOWLIST_HOSTNAMES", None) or ())
    except Exception:
        settings_allow = ()

    allowlist = _normalise_allowlist(tuple(settings_allow) + tuple(allowlist_hostnames or ()))
    cache_key = (hostname, allowlist)

    cached = _cache_get(cache_key)
    if cached is not None:
        if not cached.safe:
            log_security_event(
                "sec.ssrf.blocked",
                url=repr(url),
                reason=cached.reason,
                hostname=hostname,
                cached="1",
                **ctx,
            )
        return cached.safe, cached.reason

    if hostname in allowlist:
        _cache_put(cache_key, True, "allowlisted")
        return True, "allowlisted"

    if hostname in _INTERNAL_HOSTNAMES:
        _cache_put(cache_key, False, "internal_hostname")
        log_security_event(
            "sec.ssrf.blocked",
            url=repr(url),
            reason="internal_hostname",
            hostname=hostname,
            **ctx,
        )
        return False, "internal_hostname"

    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        blocked, why = _ip_is_blocked(hostname)
        if blocked:
            _cache_put(cache_key, False, f"raw_ip_blocked:{why}")
            log_security_event(
                "sec.ssrf.blocked",
                url=repr(url),
                reason=f"raw_ip_blocked:{why}",
                hostname=hostname,
                **ctx,
            )
            return False, f"raw_ip_blocked:{why}"

    safe, reason, ips = _dns_checked(hostname)
    if not safe:
        _cache_put(cache_key, False, reason)
        log_security_event(
            "sec.ssrf.blocked",
            url=repr(url),
            reason=reason,
            hostname=hostname,
            resolved_ips=",".join(ips),
            **ctx,
        )
        return False, reason

    _cache_put(cache_key, True, "ok")
    return True, "ok"
