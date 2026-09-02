"""
apps.startups.api
=================
Thin delegation layer — all business logic lives in apps.users.
This module re-exports the StartupProfile views and serializers so
that a dedicated ``/api/v1/startups/`` router prefix can be wired up
without duplicating code.

Usage in urls.py::

    from apps.startups.api import router as startups_router
    urlpatterns += [path("api/v1/startups/", include(startups_router.urls))]
"""
from __future__ import annotations

from rest_framework import routers

from apps.users.views import StartupProfileViewSet

router = routers.SimpleRouter()
router.register(r"", StartupProfileViewSet, basename="startup")
