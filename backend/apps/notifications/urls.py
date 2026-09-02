from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import NotificationViewSet

router = DefaultRouter()
router.register(r"", NotificationViewSet, basename="notification")

app_name: str = "notifications"

urlpatterns: list = [
    path("", include(router.urls)),
]
