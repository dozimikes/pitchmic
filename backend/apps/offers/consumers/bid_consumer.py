"""
apps.offers.consumers.bid_consumer
===================================
WebSocket consumer for real-time bid/offer updates.

Channel group naming:
  pitch_<pitch_id>   - all connected clients watching a specific pitch
  investor_<user_id> - per-investor channel for outbound offer status updates

Message shape sent to clients::

    {
        "type": "offer.update",
        "offer_id": "<int>",
        "status": "<OfferStatus value>",
        "pitch_id": "<int>",
        "actor": "<user email>",
        "timestamp": "<ISO-8601>"
    }

Connect URL pattern (wired in routing.py):
    ws://<host>/ws/bids/<pitch_id>/
"""
from __future__ import annotations

import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone

logger = logging.getLogger(__name__)


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
        """
        if text_data:
            try:
                data = json.loads(text_data)
            except json.JSONDecodeError:
                return
            if data.get("type") == "ping":
                await self.send(text_data=json.dumps({"type": "pong"}))

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
