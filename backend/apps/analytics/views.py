"""
apps.analytics.views
====================
REST endpoints for predictive analytics.

GET  /api/v1/analytics/predict/startup/{pk}/   — FundraisingPrediction for a startup
POST /api/v1/analytics/predict/startup/{pk}/   — Trigger async prediction refresh
GET  /api/v1/analytics/insights/startup/{pk}/  — Simplified "readiness" scorecard
GET  /api/v1/analytics/investor-profile/{pk}/  — InvestorBehaviorAnalysis
GET  /api/v1/analytics/heatmap/                — Aggregate heatmap data for D3
POST /api/v1/analytics/events/                 — Record a UserBehaviorEvent
"""
from __future__ import annotations

from django.db.models import Avg, Count
from django.db.models.functions import TruncMonth
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.offers.models import Offer
from apps.pitches.models import Pitch
from apps.users.models import InvestorProfile, StartupProfile, User

from .models import FundraisingPrediction, InvestorBehaviorAnalysis, UserBehaviorEvent
from .serializers import (
    FundraisingPredictionSerializer,
    InvestorBehaviorAnalysisSerializer,
    UserBehaviorEventSerializer,
)


class StartupPredictionView(APIView):
    """
    GET  — return cached prediction (triggers async refresh if stale / absent)
    POST — force an immediate async refresh
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, pk: int) -> Response:
        try:
            prediction = FundraisingPrediction.objects.select_related("startup").get(startup_id=pk)
            return Response(FundraisingPredictionSerializer(prediction).data)
        except FundraisingPrediction.DoesNotExist:
            # Queue a fresh compute and return 202
            from .tasks import update_predictions_for_startup
            update_predictions_for_startup.delay(pk)
            return Response(
                {"message": "Prediction is being computed. Retry in a few seconds."},
                status=status.HTTP_202_ACCEPTED,
            )

    def post(self, request: Request, pk: int) -> Response:
        try:
            StartupProfile.objects.get(pk=pk)
        except StartupProfile.DoesNotExist:
            return Response({"detail": "Startup not found."}, status=status.HTTP_404_NOT_FOUND)

        from .tasks import update_predictions_for_startup
        update_predictions_for_startup.delay(pk)
        return Response({"message": "Prediction refresh queued.", "startup_id": pk}, status=status.HTTP_202_ACCEPTED)


class StartupReadinessView(APIView):
    """Simplified scorecard: investor-facing 'Is this startup ready?' summary."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, pk: int) -> Response:
        try:
            startup = StartupProfile.objects.prefetch_related("team_members", "pitches").get(pk=pk)
        except StartupProfile.DoesNotExist:
            return Response({"detail": "Startup not found."}, status=status.HTTP_404_NOT_FOUND)

        from .services import StartupScoringEngine
        engine = StartupScoringEngine()
        data = engine.score(startup)

        return Response({
            "startup_id": pk,
            "company_name": startup.company_name,
            "readiness_score": round(data["success_probability"] * 100, 1),
            "team_score": data["team_score"],
            "market_score": data["market_score"],
            "traction_score": data["traction_score"],
            "financial_score": round(data.get("scalability_score", 0), 1),
            "risk_level": data["risk_profile"]["overall_risk"],
            "top_improvements": data["risk_profile"]["mitigations"],
            "explanation": data["explanation"],
        })


class InvestorBehaviorView(generics.RetrieveAPIView):
    """GET /api/v1/analytics/investor-profile/{pk}/"""

    serializer_class = InvestorBehaviorAnalysisSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        pk = self.kwargs["pk"]
        try:
            analysis, _ = InvestorBehaviorAnalysis.objects.get_or_create(
                investor_id=pk,
                defaults={
                    "avg_time_on_pitch_seconds": 0,
                    "view_to_offer_conversion_rate": 0,
                    "total_pitches_viewed": 0,
                    "total_offers_sent": 0,
                    "total_offers_accepted": 0,
                },
            )
            return analysis
        except InvestorProfile.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Investor not found.")


class HeatmapView(APIView):
    """
    Aggregate activity data for the investment heatmap visualisation.
    Returns industry breakdown, region density, and monthly offer volume.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        by_industry = list(
            Pitch.objects.filter(is_draft=False)
            .values("startup__industry")
            .annotate(
                count=Count("id"),
                avg_offers=Avg("offers__amount"),
            )
            .order_by("-count")[:20]
        )

        by_region = list(
            StartupProfile.objects.values("location")
            .annotate(count=Count("id"))
            .exclude(location="")
            .order_by("-count")[:30]
        )

        by_month = list(
            Offer.objects.filter(status__in=["sent", "accepted"])
            .annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(count=Count("id"))
            .order_by("month")[:24]
        )

        return Response({
            "by_industry": by_industry,
            "by_region": by_region,
            "by_month": [
                {"month": row["month"].strftime("%Y-%m") if row["month"] else None, "count": row["count"]}
                for row in by_month
            ],
        })


class BehaviorEventCreateView(generics.CreateAPIView):
    """POST /api/v1/analytics/events/ — Record a single user behaviour event."""

    serializer_class = UserBehaviorEventSerializer
    permission_classes = (IsAuthenticated,)
