from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import InvestorProfileViewSet, StartupProfileViewSet

router = DefaultRouter()
router.register(r"startup", StartupProfileViewSet, basename="startup-profile")
router.register(r"investor", InvestorProfileViewSet, basename="investor-profile")

app_name: str = "users"

urlpatterns: list = [
    path("profiles/", include(router.urls)),
]
