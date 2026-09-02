from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PitchViewSet

router = DefaultRouter()
router.register(r"", PitchViewSet, basename="pitch")

app_name: str = "pitches"

urlpatterns: list = [
    path("", include(router.urls)),
]
