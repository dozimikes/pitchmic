"""
backend.apps.startups.api
=========================
Router wiring for canonical Venture Intelligence Profile and satellite entities.
Exposed at /api/v1/startups/.
"""
from __future__ import annotations

from django.urls import path
from rest_framework import routers

from apps.users.views import StartupProfileViewSet
from apps.startups.views import (
    VentureIntelligenceSnapshotView,
    StartupClaimViewSet,
    StartupEvidenceViewSet,
    StartupMaturityViewSet,
    StartupFinancialSnapshotViewSet,
    StartupFundingRoundViewSet,
    StartupCustomerSegmentViewSet,
    FundraisingCampaignViewSet,
    StartupContextualAssessmentViewSet,
)

router = routers.DefaultRouter()
router.register(r"profiles", StartupProfileViewSet, basename="startup-profile-direct")
router.register(r"claims", StartupClaimViewSet, basename="startup-claim")
router.register(r"evidence", StartupEvidenceViewSet, basename="startup-evidence")
router.register(r"maturity", StartupMaturityViewSet, basename="startup-maturity")
router.register(r"financials", StartupFinancialSnapshotViewSet, basename="startup-financials")
router.register(r"funding-rounds", StartupFundingRoundViewSet, basename="startup-funding-rounds")
router.register(r"customers", StartupCustomerSegmentViewSet, basename="startup-customers")
router.register(r"campaigns", FundraisingCampaignViewSet, basename="startup-campaigns")
router.register(r"contextual-assessments", StartupContextualAssessmentViewSet, basename="startup-contextual-assessments")
router.register(r"", StartupProfileViewSet, basename="startup")

urlpatterns = [
    path("snapshot/", VentureIntelligenceSnapshotView.as_view(), name="startup-snapshot"),
] + router.urls
