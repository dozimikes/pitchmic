"""
apps.offers.push
================
Thin service layer for pushing real-time WebSocket messages to connected
clients after offer state transitions.

Channel group naming (must match BidConsumer):
  pitch_<pitch_id>    - all clients watching a specific pitch
  investor_<user_id>  - per-investor direct channel

Callers should use push_offer_update() or push_offer_created() after
any offer save that changes the offer's status.  Failures are logged
but never re-raised so a missing Redis/channel-layer never breaks the
HTTP response.
"""
from __future__ import annotations

import logging

from django.utils import timezone

logger = logging.getLogger(__name__)


def _get_channel_layer():
    """
    Lazily import the channel layer so this module can be imported
    without raising errors when channels is not configured (e.g. tests).
    Returns None if channel layer is unavailable.
    """
    try:
        from channels.layers import get_channel_layer
        layer = get_channel_layer()
        return layer
    except Exception:  # noqa: BLE001
        return None


def _send_sync(group: str, message: dict) -> None:
    """
    Send a message to a channel group synchronously (from a WSGI/sync context).
    Uses async_to_sync wrapper provided by asgiref.
    """
    layer = _get_channel_layer()
    if layer is None:
        return
    try:
        from asgiref.sync import async_to_sync
        async_to_sync(layer.group_send)(group, message)
    except Exception:  # noqa: BLE001
        logger.exception("channel_layer.group_send failed for group=%s", group)


def push_offer_update(offer) -> None:
    """
    Broadcast an offer.update event after a status transition.

    Sends to:
      - pitch_<pitch_id>   → all watchers of the pitch
      - investor_<user_id> → the investor's own channel
    """
    try:
        pitch_id = offer.pitch_id
        investor_user_id = offer.investor.user_id
        actor_email = offer.investor.user.email
    except Exception:  # noqa: BLE001
        logger.exception("push_offer_update: failed to resolve offer relationships pk=%s", offer.pk)
        return

    message = {
        "type": "offer.update",      # maps to BidConsumer.offer_update()
        "offer_id": offer.pk,
        "status": offer.status,
        "pitch_id": pitch_id,
        "actor": actor_email,
        "timestamp": timezone.now().isoformat(),
    }

    _send_sync(f"pitch_{pitch_id}", message)
    _send_sync(f"investor_{investor_user_id}", message)


def push_offer_created(offer) -> None:
    """
    Broadcast an offer.created event when a new offer is sent.

    Sends to:
      - pitch_<pitch_id>  → notifies the startup and any watchers
    """
    try:
        pitch_id = offer.pitch_id
        investor_name = offer.investor.full_name or offer.investor.user.email
    except Exception:  # noqa: BLE001
        logger.exception("push_offer_created: failed to resolve offer relationships pk=%s", offer.pk)
        return

    message = {
        "type": "offer.created",     # maps to BidConsumer.offer_created()
        "offer_id": offer.pk,
        "pitch_id": pitch_id,
        "investor": investor_name,
        "amount": str(offer.amount),
        "equity_pct": str(offer.equity_pct),
        "timestamp": timezone.now().isoformat(),
    }

    _send_sync(f"pitch_{pitch_id}", message)
