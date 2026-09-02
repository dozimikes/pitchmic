"""WebSocket URL routing for the offers app."""
from __future__ import annotations

from django.urls import re_path

from .consumers.bid_consumer import BidConsumer

websocket_urlpatterns = [
    re_path(r"^ws/bids/(?P<pitch_id>\d+)/$", BidConsumer.as_asgi()),
]
