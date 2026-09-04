"""
backend.apps.matching.opportunity_urls
======================================
URL patterns for Continuous Funding Opportunity Intelligence.
"""
from __future__ import annotations

from django.urls import include, path
from rest_framework import routers
from apps.matching.opportunity_views import (
    RecommendedOpportunitiesView,
    FundingOpportunityViewSet,
    EcosystemIngestionSyncView,
)

router = routers.DefaultRouter()
router.register(r"", FundingOpportunityViewSet, basename="funding-opportunity")

urlpatterns = [
    path("recommended/", RecommendedOpportunitiesView.as_view(), name="recommended-opportunities"),
    path("sync/", EcosystemIngestionSyncView.as_view(), name="sync-opportunities"),
    path("", include(router.urls)),
]
