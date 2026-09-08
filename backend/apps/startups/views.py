"""
backend.apps.startups.views
===========================
API views for the Venture Intelligence Profile and intelligence satellite models.

SEC-021: All ViewSets changed from IsAuthenticatedOrReadOnly to IsAuthenticated.
All .objects.first() fallbacks removed — they allowed unauthenticated or
cross-user reads of other startups' data.  Every queryset is now scoped to
the authenticated user's own startup profile.
"""
from __future__ import annotations

from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

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


def _get_own_startup(request) -> StartupProfile:
    """
    Return the authenticated user's startup profile.
    Raises PermissionDenied if the user has no startup profile.
    Also accepts ?startup_id= for staff/superuser users only.
    """
    user = request.user
    startup_id = request.query_params.get("startup_id")
    if startup_id:
        # Staff / superusers may query any startup by ID.
        # Normal users may only query their own startup.
        if user.is_staff or user.is_superuser:
            startup = StartupProfile.objects.filter(id=startup_id).first()
            if not startup:
                raise NotFound("Startup not found.")
            return startup
        # For non-staff: only allow if it matches their own profile
        own = getattr(user, "startup_profile", None)
        if own and str(own.pk) == str(startup_id):
            return own
        raise PermissionDenied("You can only access your own startup data.")

    own = getattr(user, "startup_profile", None)
    if not own:
        raise PermissionDenied("Complete your startup profile first.")
    return own


class VentureIntelligenceSnapshotView(APIView):
    """
    Returns the canonical machine-derived intelligence snapshot for a venture.
    SEC-021: Requires authentication; scoped to the requesting user's startup.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        startup = _get_own_startup(request)
        snapshot_data = VentureIntelligenceSnapshotService.get_or_create_snapshot(startup)
        return Response(snapshot_data, status=status.HTTP_200_OK)


class StartupClaimViewSet(viewsets.ModelViewSet):
    serializer_class = StartupClaimSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_own_startup(self.request)
        return StartupClaim.objects.filter(startup=startup)

    def perform_create(self, serializer):
        startup = _get_own_startup(self.request)
        serializer.save(startup=startup)


class StartupEvidenceViewSet(viewsets.ModelViewSet):
    serializer_class = StartupEvidenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_own_startup(self.request)
        return StartupEvidence.objects.filter(startup=startup)

    def perform_create(self, serializer):
        startup = _get_own_startup(self.request)
        serializer.save(startup=startup)


class StartupMaturityViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StartupMaturityAssessmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_own_startup(self.request)
        return StartupMaturityAssessment.objects.filter(startup=startup)


class StartupFinancialSnapshotViewSet(viewsets.ModelViewSet):
    serializer_class = StartupFinancialSnapshotSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_own_startup(self.request)
        return StartupFinancialSnapshot.objects.filter(startup=startup)

    def perform_create(self, serializer):
        startup = _get_own_startup(self.request)
        serializer.save(startup=startup)


class StartupFundingRoundViewSet(viewsets.ModelViewSet):
    serializer_class = StartupFundingRoundSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_own_startup(self.request)
        return StartupFundingRound.objects.filter(startup=startup)

    def perform_create(self, serializer):
        startup = _get_own_startup(self.request)
        serializer.save(startup=startup)


class StartupCustomerSegmentViewSet(viewsets.ModelViewSet):
    serializer_class = StartupCustomerSegmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_own_startup(self.request)
        return StartupCustomerSegment.objects.filter(startup=startup)

    def perform_create(self, serializer):
        startup = _get_own_startup(self.request)
        serializer.save(startup=startup)


class FundraisingCampaignViewSet(viewsets.ModelViewSet):
    serializer_class = FundraisingCampaignSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_own_startup(self.request)
        return FundraisingCampaign.objects.filter(startup=startup)

    def perform_create(self, serializer):
        startup = _get_own_startup(self.request)
        serializer.save(startup=startup)


class StartupContextualAssessmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StartupContextualAssessmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _get_own_startup(self.request)
        return StartupContextualAssessment.objects.filter(startup=startup)
