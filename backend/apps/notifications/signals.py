"""
apps.notifications.signals
==========================
Signal handlers that create Notification + InAppNotification rows when
domain events occur.

Notification recipients
-----------------------
  offer_made        → startup owner (someone offered on their pitch)
  offer_accepted    → investor   (their offer was accepted)
  offer_rejected    → investor   (their offer was rejected)
  offer_negotiating → investor   (startup opened negotiation)
  pitch_liked       → startup owner (someone liked their pitch)

All handlers are connected in NotificationsConfig.ready().
"""
from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_save

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _notify(
    *,
    user,
    notification_type: str,
    category: str,
    title: str,
    body: str = "",
    data: dict | None = None,
    pinned: bool = False,
) -> None:
    """
    Create a Notification + InAppNotification atomically.
    Wrapped in try/except so failures never propagate into the originating
    transaction.
    """
    from apps.notifications.models import InAppNotification, Notification

    try:
        with transaction.atomic():
            notif = Notification.objects.create(
                user=user,
                notification_type=notification_type,
                category=category,
                title=title,
                body=body,
                data=data or {},
            )
            InAppNotification.objects.create(notification=notif, pinned=pinned)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to create Notification for user=%s category=%s",
            getattr(user, "pk", user),
            category,
        )


# ---------------------------------------------------------------------------
# Offer → Notification
# ---------------------------------------------------------------------------

def on_offer_saved(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    """
    Notify the correct party when an offer reaches a significant status.
    Uses instance._loaded_status (written by Offer.__init__ / Offer.save)
    to fire only on genuine status transitions.
    """
    current_status = instance.status
    previous_status = getattr(instance, "_loaded_status", None)

    if not created and current_status == previous_status:
        return

    try:
        pitch = instance.pitch
        investor_user = instance.investor.user
        startup_user = pitch.startup.user
        pitch_title = pitch.title
        investor_name = instance.investor.full_name or investor_user.email
        startup_name = pitch.startup.company_name
    except Exception:  # noqa: BLE001
        logger.exception("Notification: could not resolve offer relationships for offer pk=%s", instance.pk)
        return

    data = {
        "offer_id": instance.pk,
        "pitch_id": pitch.pk,
        "pitch_title": pitch_title,
        "amount": str(instance.amount),
        "equity_pct": str(instance.equity_pct),
        "status": current_status,
    }

    if current_status == "sent":
        # Notify the startup: an investor sent an offer
        _notify(
            user=startup_user,
            notification_type="info",
            category="new_offer",
            title=f'New offer on "{pitch_title}"',
            body=(
                f"{investor_name} has submitted an investment offer of "
                f"${instance.amount:,.0f} for {instance.equity_pct}% equity."
            ),
            data=data,
        )

    elif current_status == "accepted":
        # Notify the investor: their offer was accepted
        _notify(
            user=investor_user,
            notification_type="success",
            category="offer_updated",
            title=f"Offer accepted by {startup_name}",
            body=(
                f"Congratulations! {startup_name} has accepted your offer "
                f'on "{pitch_title}".'
            ),
            data=data,
            pinned=True,
        )

    elif current_status == "rejected":
        # Notify the investor: their offer was rejected
        _notify(
            user=investor_user,
            notification_type="warning",
            category="offer_updated",
            title=f"Offer declined by {startup_name}",
            body=(
                f'{startup_name} has declined your offer on "{pitch_title}". '
                f"You may submit a revised offer."
            ),
            data=data,
        )

    elif current_status == "negotiating":
        # Notify the investor: startup wants to negotiate
        _notify(
            user=investor_user,
            notification_type="info",
            category="offer_updated",
            title=f"{startup_name} wants to negotiate",
            body=(
                f"{startup_name} has opened a negotiation on your offer "
                f'for "{pitch_title}".'
            ),
            data=data,
        )


# ---------------------------------------------------------------------------
# PitchLike → Notification
# ---------------------------------------------------------------------------

def on_pitch_liked(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    if not created:
        return

    try:
        startup_user = instance.pitch.startup.user
        pitch_title = instance.pitch.title
        liker_name = instance.user.full_name or instance.user.email
    except Exception:  # noqa: BLE001
        logger.exception("Notification: could not resolve like relationships for like pk=%s", instance.pk)
        return

    # Don't notify if the startup owner liked their own pitch
    if instance.user_id == startup_user.pk:
        return

    _notify(
        user=startup_user,
        notification_type="info",
        category="new_like",
        title=f"{liker_name} liked your pitch",
        body=f'"{pitch_title}" received a new like.',
        data={
            "pitch_id": instance.pitch_id,
            "pitch_title": pitch_title,
            "liked_by": instance.user_id,
        },
    )


# ---------------------------------------------------------------------------
# Registration — called from NotificationsConfig.ready()
# ---------------------------------------------------------------------------

def connect() -> None:
    """Connect all notification signal handlers. Called once from NotificationsConfig.ready()."""
    from apps.offers.models import Offer
    from apps.pitches.models import PitchLike

    post_save.connect(on_offer_saved, sender=Offer, dispatch_uid="notifications.offer_saved")
    post_save.connect(on_pitch_liked, sender=PitchLike, dispatch_uid="notifications.pitch_liked")

    logger.debug("Notification signal handlers connected.")
