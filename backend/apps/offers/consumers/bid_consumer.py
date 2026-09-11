"""
apps.offers.consumers.bid_consumer
===================================
WebSocket consumer for real-time bid/offer updates.

SEC-031: Added pitch-level authorization in connect().
Authentication alone is NOT sufficient - the user must have a legitimate
relationship to the pitch (owner, investor with active offer, or staff).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone

logger = logging.getLogger(__name__)


@database_sync_to_async
def _is_authorized_for_pitch(user, pitch_id: str) -> bool:
    """
    Returns True if the user is allowed to receive real-time events for
    the given pitch.

    Allowed principals:
    - Staff / superusers (platform oversight)
    - The startup that owns the pitch
    - Any investor who has submitted at least one offer on the pitch
    """
    if user.is_staff or user.is_superuser:
        return True
    try:
        from apps.pitches.models import Pitch
        pitch = Pitch.objects.select_related("startup__user").get(pk=pitch_id)
    except Exception:
        return False

    # Startup owner
    if pitch.startup.user_id == user.pk:
        return True

    # Investor with an offer on this pitch
    try:
        from apps.offers.models import Offer
        investor = user.investor_profile
        return Offer.objects.filter(pitch=pitch, investor=investor).exists()
    except Exception:
        return False


class BidConsumer(AsyncWebsocketConsumer):
    """Async WebSocket consumer for live offer updates on a single pitch."""

    async def connect(self) -> None:
        self.pitch_id: str = self.scope["url_route"]["kwargs"]["pitch_id"]
        self.pitch_group: str = f"pitch_{self.pitch_id}"
        self.user = self.scope.get("user")

        # Reject anonymous connections
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        # SEC-031: Verify the user has a legitimate relationship with this pitch.
        # Authentication alone (having a valid JWT) does not entitle a user to
        # subscribe to another startup's real-time offer stream.
        authorized = await _is_authorized_for_pitch(self.user, self.pitch_id)
        if not authorized:
            await self.close(code=4003)
            logger.warning(
                "WS unauthorized: user=%s attempted pitch=%s",
                self.user.email,
                self.pitch_id,
            )
            return

        # Join pitch-specific group
        await self.channel_layer.group_add(self.pitch_group, self.channel_name)

        # Also join per-user group for outbound notifications
        self.user_group: str = f"investor_{self.user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        await self.accept()
        logger.info("WS connect: user=%s pitch=%s", self.user.email, self.pitch_id)

    async def disconnect(self, close_code: int) -> None:
        if hasattr(self, "pitch_group"):
            await self.channel_layer.group_discard(self.pitch_group, self.channel_name)
        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        logger.info("WS disconnect: code=%s", close_code)

    async def receive(self, text_data: str | None = None, bytes_data: bytes | None = None) -> None:
        """
        Clients may optionally send a ping frame; we echo it back.
        All real updates originate from the server side via group_send.
        Reject any other client-initiated messages.
        """
        if text_data:
            try:
                data = json.loads(text_data)
            except json.JSONDecodeError:
                return
            if data.get("type") == "ping":
                await self.send(text_data=json.dumps({"type": "pong"}))
            # Ignore all other message types - clients cannot push events

    # -----------------------------------------------------------------------
    # Handlers - called by channel_layer.group_send from Django signal/task
    # -----------------------------------------------------------------------

    async def offer_update(self, event: dict[str, Any]) -> None:
        """Forward an offer.update message to the connected WebSocket client."""
        await self.send(text_data=json.dumps({
            "type": "offer.update",
            "offer_id": event.get("offer_id"),
            "status": event.get("status"),
            "pitch_id": event.get("pitch_id"),
            "actor": event.get("actor"),
            "timestamp": event.get("timestamp", timezone.now().isoformat()),
        }))

    async def offer_created(self, event: dict[str, Any]) -> None:
        """Forward a new offer notification to the pitch group."""
        await self.send(text_data=json.dumps({
            "type": "offer.created",
            "offer_id": event.get("offer_id"),
            "pitch_id": event.get("pitch_id"),
            "investor": event.get("investor"),
            "amount": event.get("amount"),
            "equity_pct": event.get("equity_pct"),
            "timestamp": event.get("timestamp", timezone.now().isoformat()),
        }))
