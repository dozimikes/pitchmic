from __future__ import annotations

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from apps.users.models import StartupProfile
from apps.matching.models_opportunity import (
    FundingSource,
    FundingOpportunity,
    StartupOpportunityMatch,
)
from apps.matching.opportunity_serializers import (
    FundingOpportunitySerializer,
    FundingSourceSerializer,
    StartupOpportunityMatchSerializer,
)
from apps.matching.opportunity_service import (
    OpportunityIngestionEngine,
    OpportunityMatchingEngine,
)


def _get_startup_profile(request) -> StartupProfile | None:
    startup_id = request.query_params.get("startup_id")
    if startup_id:
        return StartupProfile.objects.filter(id=startup_id).first()
    if request.user.is_authenticated:
        return getattr(request.user, "startup_profile", None)
    return None


class RecommendedOpportunitiesView(APIView):
    """
    Returns personalized matched funding opportunities for the venture,
    ranked by compatibility score with 7-dimension breakdowns and evidence gaps.
    """

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get(self, request):
        startup = _get_startup_profile(request)
        if not startup:
            # Fallback to first available startup for demo / exploration mode
            startup = StartupProfile.objects.first()
            if not startup:
                return Response(
                    {"detail": "No startup profile available."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        recommendations = OpportunityMatchingEngine.get_recommended_opportunities_for_startup(startup)
        return Response(
            {
                "startup_id": str(startup.id),
                "company_name": startup.company_name,
                "total_matched": len(recommendations),
                "high_fit_count": len([r for r in recommendations if r["overall_match_score"] >= 85]),
                "recommendations": recommendations,
            },
            status=status.HTTP_200_OK,
        )


class FundingOpportunityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public catalogue of verified ecosystem opportunities.
    """

    queryset = FundingOpportunity.objects.all().select_related("source")
    serializer_class = FundingOpportunitySerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    lookup_field = "id"

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        opp_type = self.request.query_params.get("type")
        if opp_type:
            qs = qs.filter(opportunity_type=opp_type)
        return qs

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticatedOrReadOnly])
    def save_to_pipeline(self, request, id=None):
        """
        1-Click saves opportunity into the founder's active fundraising pipeline Kanban.
        """
        opp = get_object_or_404(FundingOpportunity, id=id)
        startup = _get_startup_profile(request)
        if not startup:
            startup = StartupProfile.objects.first()

        match, created = StartupOpportunityMatch.objects.get_or_create(
            startup=startup,
            opportunity=opp,
            defaults={"overall_match_score": 88},
        )
        stage = request.data.get("stage", "outreach")
        match.is_saved_to_pipeline = True
        match.pipeline_stage = stage
        match.save()

        return Response(
            {
                "status": "saved",
                "opportunity_id": str(opp.id),
                "opportunity_title": opp.title,
                "pipeline_stage": stage,
                "detail": f"Successfully integrated {opp.title} into your {stage} pipeline stage.",
            },
            status=status.HTTP_200_OK,
        )


class EcosystemIngestionSyncView(APIView):
    """
    Triggers an on-demand ecosystem crawl, change detection, and opportunity refresh cycle.
    """

    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def post(self, request):
        result = OpportunityIngestionEngine.sync_ecosystem_sources()
        return Response(result, status=status.HTTP_200_OK)
