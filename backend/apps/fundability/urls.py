"""
apps.fundability.urls
======================
URL patterns for the Fundability Engine.
Mounted at /api/v1/fundability/ in config/urls.py.
"""
from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.fundability.views import (
    EvidenceVaultViewSet,
    FundabilityAssessView,
    FundabilityAssessmentViewSet,
    FundabilityGapStatusView,
    ImprovementActionStatusView,
)

router = DefaultRouter()
router.register(r"assessments", FundabilityAssessmentViewSet, basename="fundability-assessment")
router.register(r"evidence", EvidenceVaultViewSet, basename="evidence-vault")

urlpatterns = [
    path("assess/", FundabilityAssessView.as_view(), name="fundability-assess"),
    path("gaps/<uuid:pk>/status/", FundabilityGapStatusView.as_view(), name="fundability-gap-status"),
    path("actions/<uuid:pk>/status/", ImprovementActionStatusView.as_view(), name="fundability-action-status"),
] + router.urls
