"""
apps.core.tenant
================

Tenant identity derivation and structured security-event logging.

The helpers here are intentionally small and re-exportable so they can be
called from REST views, Channels consumers, Celery tasks, and management
commands without pulling in a heavy import graph.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any

from rest_framework.exceptions import NotFound

logger = logging.getLogger("pitchmic.security")

_LOCAL = threading.local()

DEFAULT_TENANT_ID = "default_fund"


def get_request_context(request: Any | None = None) -> dict[str, Any]:
    """
    Build a minimal, structured context dict for a security event log.

    Values present are only those that can be determined without throwing -
    callers never have to guard this helper.
    """
    ctx: dict[str, Any] = {}

    rq = request if request is not None else getattr(_LOCAL, "request", None)

    if rq is None:
        return ctx

    try:
        method = getattr(rq, "method", None)
        if method:
            ctx["http_method"] = str(method).upper()
    except Exception:
        pass

    try:
        path = getattr(rq, "path", None)
        if path:
            ctx["path"] = str(path)
    except Exception:
        pass

    try:
        user = getattr(rq, "user", None)
        if user is not None and not getattr(user, "is_anonymous", True):
            uid = getattr(user, "pk", None) or getattr(user, "id", None)
            if uid is not None:
                ctx["user_id"] = int(uid)
            email = getattr(user, "email", None)
            if email:
                ctx["user_email"] = str(email)
            enterprise = getattr(user, "enterprise_tenant_id", None)
            if enterprise:
                ctx["tenant_id"] = str(enterprise)
    except Exception:
        pass

    try:
        META = getattr(rq, "META", None) or {}
        remote = META.get("REMOTE_ADDR") or META.get("HTTP_X_FORWARDED_FOR")
        if remote:
            ctx["ip"] = str(remote).split(",", 1)[0].strip()
    except Exception:
        pass

    try:
        rqid = getattr(rq, "id", None)
        if rqid:
            ctx["request_id"] = str(rqid)
    except Exception:
        pass

    return ctx


def log_security_event(event_code: str, **kwargs: Any) -> None:
    """
    Emit a structured security event.

    *event_code* must be a stable, dotted identifier such as
    ``sec.ssrf.blocked``.  Additional context keywords are merged on top of
    the current request context.

    The logger writes every event with the ``security=true`` marker so a
    SIEM pipeline can fan out to alerting without having to grok message
    strings.
    """
    ctx = get_request_context()
    for k, v in kwargs.items():
        if v is None:
            continue
        if isinstance(v, (str, int, float, bool)):
            ctx[k] = v
        else:
            try:
                ctx[k] = str(v)
            except Exception:
                ctx[k] = type(v).__name__

    ctx.setdefault("pid", os.getpid())
    ctx["event_code"] = event_code
    ctx["security"] = True

    logger.warning("[SEC] %s | %s", event_code, " ".join(f"{k}={v}" for k, v in sorted(ctx.items())))


def set_local_request(request: Any) -> None:
    """Attach *request* to the current thread (used by middleware)."""
    _LOCAL.request = request


def clear_local_request() -> None:
    _LOCAL.__dict__.pop("request", None)


def get_authorized_tenant_id(
    request_or_user: Any,
    *,
    staff_bypass: bool = False,
) -> str:
    """
    Return the caller's tenant_id or raise :class:`NotFound` (HTTP 404).

    Accepts either a Request object (from which ``.user`` is read) or a raw
    User instance.

    Semantics match the rest of ``apps.core.permissions``: raising NotFound
    instead of a permission error prevents tenant-ID enumeration.  Staff
    bypass is off by default so accidentally wiring ``staff_bypass=True``
    doesn't weaken the default.
    """
    from django.contrib.auth.models import AnonymousUser  # lazy import

    user = getattr(request_or_user, "user", request_or_user)

    if user is None or isinstance(user, AnonymousUser) or not getattr(user, "is_authenticated", False):
        log_security_event("sec.tenant.unauthenticated")
        raise NotFound("Not found.")

    tenant_raw = getattr(user, "enterprise_tenant_id", None)

    if tenant_raw is None and staff_bypass:
        staff = getattr(user, "is_staff", False) or getattr(user, "is_superuser", False)
        if staff:
            return DEFAULT_TENANT_ID

    if tenant_raw is None or (isinstance(tenant_raw, str) and not tenant_raw.strip()):
        log_security_event("sec.tenant.mismatch", user_id=getattr(user, "pk", None))
        raise NotFound("Not found.")

    tenant_id = str(tenant_raw).strip()
    log_security_event("sec.tenant.resolved", tenant_id=tenant_id)
    return tenant_id
