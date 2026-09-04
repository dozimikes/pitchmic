"""
apps.investors.urls
===================
Routing for the Institutional Investment Operating System.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ICWorkspaceViewSet,
    InvestmentCaseViewSet,
    InvestmentFirmViewSet,
    InvestmentFundViewSet,
    InvestmentMandateViewSet,
    PortfolioViewSet,
    RelationshipEdgeViewSet,
    SeedInvestorDefaultsView,
    TermSheetViewSet,
)

router = DefaultRouter()
router.register(r"firms", InvestmentFirmViewSet, basename="investor-firm")
router.register(r"funds", InvestmentFundViewSet, basename="investor-fund")
router.register(r"mandates", InvestmentMandateViewSet, basename="investor-mandate")
router.register(r"cases", InvestmentCaseViewSet, basename="investor-case")
router.register(r"ic", ICWorkspaceViewSet, basename="investor-ic")
router.register(r"term-sheets", TermSheetViewSet, basename="investor-term-sheet")
router.register(r"portfolio", PortfolioViewSet, basename="investor-portfolio")
router.register(r"relationships", RelationshipEdgeViewSet, basename="investor-relationship")

urlpatterns = [
    path("seed-defaults/", SeedInvestorDefaultsView.as_view(), name="investor-seed-defaults"),
    path("", include(router.urls)),
]
