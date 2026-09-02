"""
apps.marketing.views
====================
REST endpoints for outreach campaign management.

POST /api/v1/marketing/campaigns/              — create a campaign
GET  /api/v1/marketing/campaigns/              — list my campaigns
GET  /api/v1/marketing/campaigns/{pk}/         — campaign detail
POST /api/v1/marketing/campaigns/{pk}/activate/ — activate & generate investor list
POST /api/v1/marketing/campaigns/{pk}/pause/   — pause campaign
GET  /api/v1/marketing/campaigns/{pk}/analytics/ — detailed metrics
GET  /api/v1/marketing/campaigns/{pk}/messages/ — messages for a campaign
POST /api/v1/marketing/generate-list/          — AI investor list preview (no campaign)
"""
from __future__ import annotations

from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .models import OutreachCampaign, OutreachMessage
from .serializers import OutreachCampaignSerializer, OutreachMessageSerializer


class CampaignListCreateView(generics.ListCreateAPIView):
    serializer_class = OutreachCampaignSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        if self.request.user.role != User.ROLE_STARTUP:
            raise PermissionDenied("Only startup accounts can manage campaigns.")
        return OutreachCampaign.objects.filter(startup__user=self.request.user).prefetch_related("messages")

    def perform_create(self, serializer):
        if self.request.user.role != User.ROLE_STARTUP:
            raise PermissionDenied("Only startup accounts can create campaigns.")
        try:
            startup = self.request.user.startup_profile
        except Exception:
            raise PermissionDenied("Complete your startup profile first.")
        serializer.save(startup=startup)


class CampaignDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = OutreachCampaignSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return OutreachCampaign.objects.filter(startup__user=self.request.user)


class ActivateCampaignView(APIView):
    """Activate a campaign — generates the investor list and queues sends."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, pk: int) -> Response:
        try:
            campaign = OutreachCampaign.objects.get(pk=pk, startup__user=request.user)
        except OutreachCampaign.DoesNotExist:
            raise NotFound("Campaign not found.")

        if campaign.status not in ("draft", "paused"):
            return Response(
                {"detail": f"Cannot activate a campaign with status '{campaign.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campaign.status = "active"
        campaign.save(update_fields=["status", "updated_at"])

        from .tasks import generate_campaign_investor_list
        generate_campaign_investor_list.delay(campaign.pk)

        return Response(
            {"message": "Campaign activated. Investor list is being generated.", "id": pk},
            status=status.HTTP_202_ACCEPTED,
        )


class PauseCampaignView(APIView):
    """Pause an active campaign."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, pk: int) -> Response:
        try:
            campaign = OutreachCampaign.objects.get(pk=pk, startup__user=request.user)
        except OutreachCampaign.DoesNotExist:
            raise NotFound("Campaign not found.")

        if campaign.status != "active":
            return Response(
                {"detail": "Only active campaigns can be paused."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campaign.status = "paused"
        campaign.save(update_fields=["status", "updated_at"])
        return Response({"message": "Campaign paused.", "id": pk})


class CampaignAnalyticsView(APIView):
    """Detailed performance metrics for a campaign."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, pk: int) -> Response:
        try:
            campaign = OutreachCampaign.objects.prefetch_related("messages").get(
                pk=pk, startup__user=request.user
            )
        except OutreachCampaign.DoesNotExist:
            raise NotFound("Campaign not found.")

        messages = campaign.messages.all()
        status_breakdown = {}
        for choice, _ in OutreachMessage.STATUS_CHOICES:
            status_breakdown[choice] = messages.filter(status=choice).count()

        return Response({
            "campaign_id": pk,
            "name": campaign.name,
            "status": campaign.status,
            "total_reached": campaign.total_reached,
            "positive_responses": campaign.positive_responses,
            "meetings_scheduled": campaign.meetings_scheduled,
            "response_rate": campaign.response_rate,
            "status_breakdown": status_breakdown,
            "total_messages": messages.count(),
        })


class CampaignMessagesView(generics.ListAPIView):
    """List messages for a specific campaign."""

    serializer_class = OutreachMessageSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        pk = self.kwargs["pk"]
        try:
            campaign = OutreachCampaign.objects.get(pk=pk, startup__user=self.request.user)
        except OutreachCampaign.DoesNotExist:
            raise NotFound("Campaign not found.")
        return campaign.messages.select_related("investor").all()


class GenerateInvestorListView(APIView):
    """
    Preview AI-generated investor list based on targeting criteria.
    Does NOT create messages — just returns a ranked investor list.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        if request.user.role != User.ROLE_STARTUP:
            raise PermissionDenied("Only startup accounts can use this feature.")

        try:
            startup = request.user.startup_profile
        except Exception:
            raise PermissionDenied("Complete your startup profile first.")

        min_score = float(request.data.get("min_compatibility_score", 0.5))
        limit = min(int(request.data.get("limit", 20)), 50)

        from apps.matching.models import MatchScore
        from apps.users.serializers import InvestorProfileSerializer

        top_matches = (
            MatchScore.objects.filter(
                startup=startup,
                compatibility_score__gte=min_score,
            )
            .select_related("investor", "investor__user")
            .order_by("-compatibility_score")[:limit]
        )

        return Response({
            "startup_id": startup.pk,
            "min_compatibility_score": min_score,
            "results": [
                {
                    "investor_id": ms.investor_id,
                    "investor_name": ms.investor.full_name,
                    "company": ms.investor.company_name,
                    "compatibility_score": ms.compatibility_score,
                    "location": ms.investor.location,
                    "preferred_industries": ms.investor.preferred_industries,
                }
                for ms in top_matches
            ],
            "count": len(top_matches),
        })
