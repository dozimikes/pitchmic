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
from apps.core.permissions import (
    get_authorized_startup_or_404,
    get_authorized_investor_or_404,
)

from .models import MatchScore
from .serializers import InvestorIntentSignalSerializer, MatchScoreSerializer


class StartupRecommendationsView(generics.ListAPIView):
    """Top-N investors for a given startup.

    SEC-005 / IDOR: only the startup owner or staff may view match scores.
    Returns HTTP 404 (NotFound) rather than 403 to prevent object-ID
    enumeration.
    """

    serializer_class = MatchScoreSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        startup_pk = self.kwargs["pk"]
        user = self.request.user

        # get_authorized_startup_or_404 raises NotFound (404) if the user is
        # not allowed, which prevents attackers from telling whether a
        # startup_pk exists.
        get_authorized_startup_or_404(
            user,
            int(startup_pk),
            staff_allowed=True,
            investor_match_allowed=False,
        )

        limit = min(int(self.request.query_params.get("limit", 20)), 100)
        return (
            MatchScore.objects.filter(startup_id=startup_pk)
            .select_related("startup", "investor")
            .order_by("-compatibility_score")[:limit]
        )


class InvestorRecommendationsView(generics.ListAPIView):
    """Top-N startups for a given investor.

    SEC-005 / IDOR: only the investor owner or staff may view match scores.
    Returns HTTP 404 (NotFound) rather than 403 to prevent object-ID
    enumeration.
    """

    serializer_class = MatchScoreSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        investor_pk = self.kwargs["pk"]
        user = self.request.user

        get_authorized_investor_or_404(user, int(investor_pk), staff_allowed=True)

        limit = min(int(self.request.query_params.get("limit", 20)), 100)
        return (
            MatchScore.objects.filter(investor_id=investor_pk)
            .select_related("startup", "investor")
            .order_by("-compatibility_score")[:limit]
        )


class TopMatchesView(generics.ListAPIView):
    """Role-aware: returns top matches for the requesting user.
    SEC-011: superusers/staff no longer have an investor profile silently
    auto-created; they receive an empty list if they have no investor profile.
    """

    serializer_class = MatchScoreSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user: User = self.request.user
        limit = min(int(self.request.query_params.get("limit", 10)), 50)
        from apps.matching.services import score_match

        if user.role == User.ROLE_INVESTOR or user.is_staff or user.is_superuser:
            investor = None
            try:
                investor = user.investor_profile
            except (InvestorProfile.DoesNotExist, Exception):
                # SEC-011: do NOT auto-create an investor profile for
                # superusers/staff — that conflates admin accounts with real
                # investor accounts and leaks admin user data into listings.
                return MatchScore.objects.none()

            if not investor:
                return MatchScore.objects.none()

            scores = MatchScore.objects.filter(investor=investor).select_related("startup", "investor").order_by("-compatibility_score")
            if not scores.exists():
                startups = StartupProfile.objects.all()
                for s in startups:
                    dim = score_match(s, investor)
                    MatchScore.objects.update_or_create(
                        startup=s,
                        investor=investor,
                        defaults={
                            "compatibility_score": dim["compatibility_score"],
                            "industry_score": dim["industry_score"],
                            "stage_score": dim["stage_score"],
                            "ticket_size_score": dim["ticket_size_score"],
                            "location_score": dim["location_score"],
                            "semantic_score": dim["semantic_score"],
                        }
                    )
                scores = MatchScore.objects.filter(investor=investor).select_related("startup", "investor").order_by("-compatibility_score")

            return scores[:limit]

        # ROLE_STARTUP
        try:
            startup = user.startup_profile
        except (StartupProfile.DoesNotExist, Exception):
            # SEC-011: do NOT fall back to .objects.first() — return empty.
            return MatchScore.objects.none()

        scores = MatchScore.objects.filter(startup=startup).select_related("startup", "investor").order_by("-compatibility_score")
        if not scores.exists():
            investors = InvestorProfile.objects.all()
            for inv in investors:
                dim = score_match(startup, inv)
                MatchScore.objects.update_or_create(
                    startup=startup,
                    investor=inv,
                    defaults={
                        "compatibility_score": dim["compatibility_score"],
                        "industry_score": dim["industry_score"],
                        "stage_score": dim["stage_score"],
                        "ticket_size_score": dim["ticket_size_score"],
                        "location_score": dim["location_score"],
                        "semantic_score": dim["semantic_score"],
                    }
                )
            scores = MatchScore.objects.filter(startup=startup).select_related("startup", "investor").order_by("-compatibility_score")

        return scores[:limit]


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
    Only the startup owner or staff can call this.

    SEC-005 / IDOR: raises NotFound for unauthorized users rather than
    PermissionDenied to prevent object-ID enumeration.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, pk: int) -> Response:
        startup = get_authorized_startup_or_404(
            request.user,
            pk,
            staff_allowed=True,
            investor_match_allowed=False,
        )

        from .tasks import update_match_scores_for_startup

        update_match_scores_for_startup.delay(startup.pk)
        return Response(
            {"message": "Match score refresh queued.", "startup_id": startup.pk},
            status=status.HTTP_202_ACCEPTED,
        )
