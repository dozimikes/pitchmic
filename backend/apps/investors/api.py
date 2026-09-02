"""
apps.investors.api
==================
Thin delegation layer — all business logic lives in apps.users.
Re-exports InvestorProfile views so a dedicated ``/api/v1/investors/``
router prefix can be wired without duplicating code.

Usage in urls.py::

    from apps.investors.api import router as investors_router
    urlpatterns += [path("api/v1/investors/", include(investors_router.urls))]
"""
from __future__ import annotations

from rest_framework import routers

from apps.users.views import InvestorProfileViewSet

router = routers.SimpleRouter()
router.register(r"", InvestorProfileViewSet, basename="investor")
