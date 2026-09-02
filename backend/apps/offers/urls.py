from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import OfferViewSet

router = DefaultRouter()
router.register(r"", OfferViewSet, basename="offer")

app_name: str = "offers"

urlpatterns: list = [
    path("", include(router.urls)),
]
