"""
backend.apps.startups.views
===========================
API views for the Venture Intelligence Profile and intelligence satellite models.
"""
from __future__ import annotations

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from apps.users.models import StartupProfile
from apps.startups.models import (
    StartupClaim,
    StartupEvidence,
    StartupMaturityAssessment,
    StartupFinancialSnapshot,
    StartupFundingRound,
    StartupCustomerSegment,
    FundraisingCampaign,
    StartupContextualAssessment,
)
from apps.startups.serializers import (
    StartupClaimSerializer,
    StartupEvidenceSerializer,
    StartupMaturityAssessmentSerializer,
    StartupFinancialSnapshotSerializer,
    StartupFundingRoundSerializer,
    StartupCustomerSegmentSerializer,
    FundraisingCampaignSerializer,
    StartupContextualAssessmentSerializer,
)
from apps.startups.services.snapshot_service import VentureIntelligenceSnapshotService


def _get_startup_for_request(request) -> StartupProfile | None:
    startup_id = request.query_params.get("startup_id")
    if startup_id:
        return StartupProfile.objects.filter(id=startup_id).first()
    if request.user.is_authenticated:
        return getattr(request.user, "startup_profile", None)
    return None


class VentureIntelligenceSnapshotView(APIView):
    """
    Returns the canonical machine-derived intelligence snapshot for a venture.
    """

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get(self, request):
        startup = _get_startup_for_request(request)
        if not startup:
            # Fallback to the first available startup for unauthenticated / demo exploration
            startup = StartupProfile.objects.first()
            if not startup:
                return Response(
                    {"detail": "No startup profile found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        snapshot_data = VentureIntelligenceSnapshotService.get_or_create_snapshot(startup)
        return Response(snapshot_data, status=status.HTTP_200_OK)


class StartupClaimViewSet(viewsets.ModelViewSet):
    serializer_class = StartupClaimSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        startup = _get_startup_for_request(self.request)
        if startup:
            return StartupClaim.objects.filter(startup=startup)
        return StartupClaim.objects.all()

    def perform_create(self, serializer):
        startup = _get_startup_for_request(self.request)
        if not startup:
            startup = StartupProfile.objects.first()
        serializer.save(startup=startup)


class StartupEvidenceViewSet(viewsets.ModelViewSet):
    serializer_class = StartupEvidenceSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        startup = _get_startup_for_request(self.request)
        if startup:
            return StartupEvidence.objects.filter(startup=startup)
        return StartupEvidence.objects.all()

    def perform_create(self, serializer):
        startup = _get_startup_for_request(self.request)
        if not startup:
            startup = StartupProfile.objects.first()
        serializer.save(startup=startup)


class StartupMaturityViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StartupMaturityAssessmentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        startup = _get_startup_for_request(self.request)
        if startup:
            return StartupMaturityAssessment.objects.filter(startup=startup)
        return StartupMaturityAssessment.objects.all()


class StartupFinancialSnapshotViewSet(viewsets.ModelViewSet):
    serializer_class = StartupFinancialSnapshotSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        startup = _get_startup_for_request(self.request)
        if startup:
            return StartupFinancialSnapshot.objects.filter(startup=startup)
        return StartupFinancialSnapshot.objects.all()

    def perform_create(self, serializer):
        startup = _get_startup_for_request(self.request)
        if not startup:
            startup = StartupProfile.objects.first()
        serializer.save(startup=startup)


class StartupFundingRoundViewSet(viewsets.ModelViewSet):
    serializer_class = StartupFundingRoundSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        startup = _get_startup_for_request(self.request)
        if startup:
            return StartupFundingRound.objects.filter(startup=startup)
        return StartupFundingRound.objects.all()

    def perform_create(self, serializer):
        startup = _get_startup_for_request(self.request)
        if not startup:
            startup = StartupProfile.objects.first()
        serializer.save(startup=startup)


class StartupCustomerSegmentViewSet(viewsets.ModelViewSet):
    serializer_class = StartupCustomerSegmentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        startup = _get_startup_for_request(self.request)
        if startup:
            return StartupCustomerSegment.objects.filter(startup=startup)
        return StartupCustomerSegment.objects.all()

    def perform_create(self, serializer):
        startup = _get_startup_for_request(self.request)
        if not startup:
            startup = StartupProfile.objects.first()
        serializer.save(startup=startup)


class FundraisingCampaignViewSet(viewsets.ModelViewSet):
    serializer_class = FundraisingCampaignSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        startup = _get_startup_for_request(self.request)
        if startup:
            return FundraisingCampaign.objects.filter(startup=startup)
        return FundraisingCampaign.objects.all()

    def perform_create(self, serializer):
        startup = _get_startup_for_request(self.request)
        if not startup:
            startup = StartupProfile.objects.first()
        serializer.save(startup=startup)


class StartupContextualAssessmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StartupContextualAssessmentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        startup = _get_startup_for_request(self.request)
        if startup:
            return StartupContextualAssessment.objects.filter(startup=startup)
        return StartupContextualAssessment.objects.all()
