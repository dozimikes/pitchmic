"""
apps.matching.views
===================
REST endpoints for the AI matching engine.

GET  /api/v1/matching/recommendations/startup/{pk}/
     Top investors for a startup, ordered by compatibility_score.

GET  /api/v1/matching/recommendations/investor/{pk}/
     Top startups for an investor.

GET  /api/v1/matching/top-matches/
     Current user's top matches (role-aware).

POST /api/v1/matching/signals/
     Record an InvestorIntentSignal (used as ML training data).

POST /api/v1/matching/refresh/{startup_pk}/
     Admin / startup owner: trigger async match-score refresh for one startup.
"""
from __future__ import annotations

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import InvestorProfile, StartupProfile, User

from .models import InvestorIntentSignal, MatchScore
from .serializers import InvestorIntentSignalSerializer, MatchScoreSerializer


class StartupRecommendationsView(generics.ListAPIView):
    """Top-N investors for a given startup."""

    serializer_class = MatchScoreSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        startup_pk = self.kwargs["pk"]
        limit = min(int(self.request.query_params.get("limit", 20)), 100)
        return (
            MatchScore.objects.filter(startup_id=startup_pk)
            .select_related("startup", "investor")
            .order_by("-compatibility_score")[:limit]
        )


class InvestorRecommendationsView(generics.ListAPIView):
    """Top-N startups for a given investor."""

    serializer_class = MatchScoreSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        investor_pk = self.kwargs["pk"]
        limit = min(int(self.request.query_params.get("limit", 20)), 100)
        return (
            MatchScore.objects.filter(investor_id=investor_pk)
            .select_related("startup", "investor")
            .order_by("-compatibility_score")[:limit]
        )


class TopMatchesView(generics.ListAPIView):
    """Role-aware: returns top matches for the requesting user."""

    serializer_class = MatchScoreSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user: User = self.request.user
        limit = min(int(self.request.query_params.get("limit", 10)), 50)

        if user.role == User.ROLE_INVESTOR:
            try:
                investor = user.investor_profile
            except InvestorProfile.DoesNotExist:
                return MatchScore.objects.none()
            return (
                MatchScore.objects.filter(investor=investor)
                .select_related("startup", "investor")
                .order_by("-compatibility_score")[:limit]
            )

        # ROLE_STARTUP
        try:
            startup = user.startup_profile
        except StartupProfile.DoesNotExist:
            return MatchScore.objects.none()
        return (
            MatchScore.objects.filter(startup=startup)
            .select_related("startup", "investor")
            .order_by("-compatibility_score")[:limit]
        )


class IntentSignalCreateView(generics.CreateAPIView):
    """
    Record a single investor intent signal.
    Only investors can call this endpoint.
    """

    serializer_class = InvestorIntentSignalSerializer
    permission_classes = (IsAuthenticated,)

    def perform_create(self, serializer: InvestorIntentSignalSerializer) -> None:
        if self.request.user.role != User.ROLE_INVESTOR:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only investors can record intent signals.")
        serializer.save()


class RefreshMatchScoresView(APIView):
    """
    Trigger an async refresh of all match scores for a single startup.
    Only the startup owner or an admin can call this.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, pk: int) -> Response:
        try:
            startup = StartupProfile.objects.get(pk=pk)
        except StartupProfile.DoesNotExist:
            return Response({"detail": "Startup not found."}, status=status.HTTP_404_NOT_FOUND)

        if startup.user != request.user and not request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to refresh scores for this startup.")

        from .tasks import update_match_scores_for_startup
        update_match_scores_for_startup.delay(startup.pk)
        return Response(
            {"message": "Match score refresh queued.", "startup_id": startup.pk},
            status=status.HTTP_202_ACCEPTED,
        )
