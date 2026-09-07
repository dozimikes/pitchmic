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
from apps.startups.sub_views import (
    FounderProfileViewSet,
    ProductProfileView,
    MarketProfileView,
    BusinessModelProfileView,
    TractionMetricViewSet,
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
# Sub-profile viewsets (Fundability Engine evidence layer)
router.register(r"founders", FounderProfileViewSet, basename="startup-founders")
router.register(r"traction", TractionMetricViewSet, basename="startup-traction")
router.register(r"", StartupProfileViewSet, basename="startup")

urlpatterns = [
    path("snapshot/", VentureIntelligenceSnapshotView.as_view(), name="startup-snapshot"),
    # OneToOne sub-profile endpoints
    path("product-profile/", ProductProfileView.as_view(), name="startup-product-profile"),
    path("market-profile/", MarketProfileView.as_view(), name="startup-market-profile"),
    path("business-model/", BusinessModelProfileView.as_view(), name="startup-business-model"),
] + router.urls
