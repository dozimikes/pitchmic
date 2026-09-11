"""
apps.core.permissions
=====================

Shared object-level authorization helpers used by REST views across the
entire PitchMic backend.  Centralising the helpers means every view uses
the *same* authorization semantics and a single fix protects every
endpoint.

The helpers intentionally return :class:`~rest_framework.exceptions.NotFound`
(HTTP 404) instead of :class:`~rest_framework.exceptions.PermissionDenied`
(HTTP 403) when the caller is not authorized for a specific object.  This
prevents object-ID enumeration (IDOR reconnaissance) - an attacker cannot
distinguish "object does not exist" from "object exists but you cannot see
it".
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from rest_framework.exceptions import NotFound

from apps.core.tenant import log_security_event
from apps.users.models import InvestorProfile, StartupProfile, User

if TYPE_CHECKING:  # pragma: no cover - typing only
    pass


def _raise_not_found(detail: str = "Not found.") -> None:
    """Raise a 404 NotFound - never use 403 for object-level checks."""
    raise NotFound(detail=detail)


def _accelerator_can_access_startup(accel_user: User, startup: StartupProfile) -> bool:
    if accel_user.is_staff or accel_user.is_superuser:
        return True
    try:
        from apps.intelligence.models import CohortApplication
    except Exception:
        return False
    try:
        return CohortApplication.objects.filter(
            cohort__accelerator_user=accel_user,
            startup=startup,
        ).exists()
    except AttributeError:
        return CohortApplication.objects.filter(startup=startup).exists()


def _accelerator_can_access_investor(accel_user: User, investor: InvestorProfile) -> bool:
    if accel_user.is_staff or accel_user.is_superuser:
        return True
    try:
        from apps.intelligence.models import CohortApplication
    except Exception:
        return False
    try:
        matched_startups = investor.matched_startups.all()
        return CohortApplication.objects.filter(
            cohort__accelerator_user=accel_user,
            startup__in=matched_startups,
        ).exists()
    except AttributeError:
        matched_startups = investor.matched_startups.all()
        return CohortApplication.objects.filter(startup__in=matched_startups).exists()


def get_authorized_startup_or_404(
    user: User,
    startup_pk: int,
    *,
    staff_allowed: bool = True,
    investor_match_allowed: bool = True,
) -> StartupProfile:
    """
    Return a :class:`StartupProfile` if and only if *user* is authorized
    to access it.  Otherwise raise :class:`NotFound` (HTTP 404) so the
    caller cannot enumerate startup IDs.

    Authorization rules (evaluated in order):
      1. Superusers are always allowed (platform-level override).
      2. Staff users are allowed when *staff_allowed* is True.
      3. Startup founders whose ``startup_profile.pk == startup_pk``.
      4. Investor profiles that have the startup in ``matched_startups``
         (when *investor_match_allowed* is True).
      5. Accelerator / venture partner users are allowed to read any
         non-draft startup profile for discovery purposes.
    """
    try:
        startup = StartupProfile.objects.select_related("user").get(pk=startup_pk)
    except StartupProfile.DoesNotExist:
        _raise_not_found("Startup not found.")

    if user.is_superuser:
        return startup

    if staff_allowed and getattr(user, "is_staff", False):
        return startup

    if getattr(user, "role", None) == User.ROLE_STARTUP:
        profile = getattr(user, "startup_profile", None)
        if profile is not None and profile.pk == startup.pk:
            return startup

    if investor_match_allowed and getattr(user, "role", None) == User.ROLE_INVESTOR:
        profile = getattr(user, "investor_profile", None)
        if profile is not None:
            if InvestorProfile.objects.filter(
                pk=profile.pk,
                matched_startups=startup,
            ).exists():
                return startup

    if getattr(user, "role", None) == User.ROLE_ACCELERATOR:
        return startup

    _raise_not_found("Startup not found.")


def get_authorized_investor_or_404(
    user: User,
    investor_pk: int,
    *,
    staff_allowed: bool = True,
) -> InvestorProfile:
    """
    Return an :class:`InvestorProfile` if and only if *user* is authorized
    to access it.  Otherwise raise :class:`NotFound`.
    """
    try:
        investor = InvestorProfile.objects.select_related("user").get(pk=investor_pk)
    except InvestorProfile.DoesNotExist:
        _raise_not_found("Investor not found.")

    if user.is_superuser:
        return investor

    if staff_allowed and getattr(user, "is_staff", False):
        return investor

    if getattr(user, "role", None) == User.ROLE_INVESTOR:
        profile = getattr(user, "investor_profile", None)
        if profile is not None and profile.pk == investor.pk:
            return investor

    if getattr(user, "role", None) == User.ROLE_ACCELERATOR:
        return investor

    _raise_not_found("Investor not found.")


def is_authorized_for_startup(
    user: User,
    startup: StartupProfile,
    *,
    staff_allowed: bool = True,
    investor_match_allowed: bool = True,
) -> bool:
    """
    Boolean variant of :func:`get_authorized_startup_or_404`.  Returns
    ``True`` when the user is allowed to operate on *startup*, ``False``
    otherwise.  Use this helper inside querysets / filters where raising
    NotFound directly is inconvenient.
    """
    if user.is_superuser:
        return True
    if staff_allowed and getattr(user, "is_staff", False):
        return True
    if getattr(user, "role", None) == User.ROLE_STARTUP:
        profile = getattr(user, "startup_profile", None)
        return profile is not None and profile.pk == startup.pk
    if investor_match_allowed and getattr(user, "role", None) == User.ROLE_INVESTOR:
        profile = getattr(user, "investor_profile", None)
        if profile is None:
            return False
        return InvestorProfile.objects.filter(
            pk=profile.pk,
            matched_startups=startup,
        ).exists()
    if getattr(user, "role", None) == User.ROLE_ACCELERATOR:
        return True
    return False


def ensure_authorized_for_startup(
    user: User,
    startup: StartupProfile,
    *,
    staff_allowed: bool = True,
    investor_match_allowed: bool = True,
) -> None:
    """
    Assert *user* is authorized for *startup*; raise :class:`NotFound` if
    not.  Thin wrapper around :func:`is_authorized_for_startup`.
    """
    if not is_authorized_for_startup(
        user,
        startup,
        staff_allowed=staff_allowed,
        investor_match_allowed=investor_match_allowed,
    ):
        _raise_not_found("Startup not found.")
