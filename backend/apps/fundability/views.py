"""
=======================
API views for the Fundability Engine.

Endpoints (all mounted under /api/v1/fundability/):
  POST  /assess/                     Run a new fundability assessment
  GET   /assessments/                List past assessments (summary)
  GET   /assessments/current/        Get the current assessment (summary)
  GET   /assessments/{id}/           Full assessment detail
  GET   /assessments/{id}/gaps/      Gaps for an assessment
  GET   /assessments/{id}/actions/   Improvement actions for an assessment
  PATCH /gaps/{id}/status/           Founder updates a gap status
  PATCH /actions/{id}/status/        Founder marks an action complete
  GET   /evidence/                   List evidence vault items
  POST  /evidence/                   Add evidence to vault
  PATCH /evidence/{id}/              Update evidence item
  DELETE /evidence/{id}/             Remove evidence item
"""
from __future__ import annotations

import logging

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.users.models import StartupProfile
from apps.fundability.models import (
    EvidenceVaultItem,
    FundabilityAssessment,
    FundabilityGap,
    ImprovementAction,
)
from apps.fundability.serializers import (
    EvidenceVaultItemSerializer,
    FundabilityAssessmentSerializer,
    FundabilityAssessmentSummarySerializer,
    FundabilityGapSerializer,
    FundabilityGapUpdateSerializer,
    ImprovementActionSerializer,
    ImprovementActionUpdateSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_startup(request) -> StartupProfile | None:
    """Resolve the startup profile for the authenticated user."""
    if not request.user.is_authenticated:
        return None
    return getattr(request.user, "startup_profile", None)


def _require_startup(request) -> tuple[StartupProfile | None, Response | None]:
    startup = _resolve_startup(request)
    if not startup:
        return None, Response(
            {"detail": "No startup profile found for this account."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return startup, None


# ---------------------------------------------------------------------------
# Assess
# ---------------------------------------------------------------------------

class FundabilityAssessView(APIView):
    """
    POST /api/v1/fundability/assess/

    Triggers a new fundability assessment for the authenticated startup.
    The engine collects all available evidence from the startup's profile
    and produces a structured assessment.

    Returns the full assessment detail.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        startup, err = _require_startup(request)
        if err:
            return err

        try:
            from apps.fundability.engine import run_fundability_assessment
            assessment = run_fundability_assessment(startup)
            serializer = FundabilityAssessmentSerializer(assessment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValueError as exc:
            logger.warning("Fundability assessment blocked for %s: %s", startup.company_name, exc)
            return Response(
                {"detail": str(exc), "requires_founder_data": True},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            logger.exception("Fundability assessment failed for %s: %s", startup.company_name, exc)
            return Response(
                {"detail": f"Assessment failed: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ---------------------------------------------------------------------------
# Assessment ViewSet
# ---------------------------------------------------------------------------

class FundabilityAssessmentViewSet(ReadOnlyModelViewSet):
    """
    GET /api/v1/fundability/assessments/
    GET /api/v1/fundability/assessments/current/
    GET /api/v1/fundability/assessments/{id}/
    GET /api/v1/fundability/assessments/{id}/gaps/
    GET /api/v1/fundability/assessments/{id}/actions/
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ("list", "current"):
            return FundabilityAssessmentSummarySerializer
        return FundabilityAssessmentSerializer

    def get_queryset(self):
        startup = _resolve_startup(self.request)
        if not startup:
            return FundabilityAssessment.objects.none()
        return (
            FundabilityAssessment.objects
            .filter(startup=startup)
            .prefetch_related("dimensions", "gaps", "program_readiness")
            .order_by("-assessed_at")
        )

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        """Return the current (most recent) assessment as a summary."""
        startup, err = _require_startup(request)
        if err:
            return err
        assessment = (
            FundabilityAssessment.objects
            .filter(startup=startup, is_current=True)
            .prefetch_related("program_readiness", "gaps")
            .first()
        )
        if not assessment:
            return Response(
                {
                    "detail": "No assessment found. Run POST /api/v1/fundability/assess/ to generate one.",
                    "has_assessment": False,
                },
                status=status.HTTP_200_OK,
            )
        serializer = FundabilityAssessmentSummarySerializer(assessment)
        return Response({**serializer.data, "has_assessment": True})

    @action(detail=True, methods=["get"], url_path="gaps")
    def gaps(self, request, pk=None):
        """Return all gaps for a specific assessment, ordered by priority."""
        assessment = self.get_object()
        qs = assessment.gaps.order_by("priority_rank", "severity")
        serializer = FundabilityGapSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="actions")
    def actions(self, request, pk=None):
        """Return all improvement actions for a specific assessment."""
        assessment = self.get_object()
        qs = (
            ImprovementAction.objects
            .filter(gap__assessment=assessment)
            .select_related("gap")
            .order_by("priority_rank")
        )
        serializer = ImprovementActionSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="dimensions")
    def dimensions(self, request, pk=None):
        """Return dimension breakdown for a specific assessment."""
        assessment = self.get_object()
        serializer = FundabilityAssessmentSerializer(assessment)
        return Response(serializer.data["dimensions"])

    @action(detail=True, methods=["get"], url_path="improvement-plan")
    def improvement_plan(self, request, pk=None):
        """Return the full improvement plan for a specific assessment."""
        assessment = self.get_object()
        qs = (
            ImprovementAction.objects
            .filter(gap__assessment=assessment)
            .select_related("gap")
            .order_by("priority_rank")
        )
        serializer = ImprovementActionSerializer(qs, many=True)
        return Response({
            "assessment_id": str(assessment.id),
            "overall_score": assessment.overall_score,
            "inferred_stage": assessment.inferred_stage,
            "critical_gaps_count": assessment.critical_gaps_count,
            "actions": serializer.data,
        })


# ---------------------------------------------------------------------------
# Gap status updates
# ---------------------------------------------------------------------------

class FundabilityGapStatusView(APIView):
    """
    PATCH /api/v1/fundability/gaps/{id}/status/

    Allows the founder to update the status of a gap
    (e.g. mark it as in_progress or resolved).
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        startup, err = _require_startup(request)
        if err:
            return err
        gap = get_object_or_404(FundabilityGap, pk=pk, startup=startup)
        serializer = FundabilityGapUpdateSerializer(gap, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(FundabilityGapSerializer(gap).data)


# ---------------------------------------------------------------------------
# Action status updates
# ---------------------------------------------------------------------------

class ImprovementActionStatusView(APIView):
    """
    PATCH /api/v1/fundability/actions/{id}/status/

    Allows the founder to update their progress on an improvement action.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        startup, err = _require_startup(request)
        if err:
            return err
        action_obj = get_object_or_404(ImprovementAction, pk=pk, startup=startup)
        serializer = ImprovementActionUpdateSerializer(
            action_obj, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ImprovementActionSerializer(action_obj).data)


# ---------------------------------------------------------------------------
# Evidence Vault
# ---------------------------------------------------------------------------

class EvidenceVaultViewSet(ModelViewSet):
    """
    GET    /api/v1/fundability/evidence/
    POST   /api/v1/fundability/evidence/
    GET    /api/v1/fundability/evidence/{id}/
    PATCH  /api/v1/fundability/evidence/{id}/
    DELETE /api/v1/fundability/evidence/{id}/
    """
    serializer_class = EvidenceVaultItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        startup = _resolve_startup(self.request)
        if not startup:
            return EvidenceVaultItem.objects.none()
        qs = EvidenceVaultItem.objects.filter(startup=startup)
        # Optional filter by dimension
        dim = self.request.query_params.get("dimension")
        if dim:
            qs = qs.filter(dimension_tag=dim)
        # Optional filter by status
        ev_status = self.request.query_params.get("status")
        if ev_status:
            qs = qs.filter(status=ev_status)
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        startup = _resolve_startup(self.request)
        if not startup:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("No startup profile found.")
        serializer.save(startup=startup)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        Returns a per-dimension evidence summary for the evidence vault page.
        """
        startup = _resolve_startup(request)
        if not startup:
            return Response({"detail": "No startup profile."}, status=status.HTTP_404_NOT_FOUND)

        items = EvidenceVaultItem.objects.filter(startup=startup)
        total = items.count()
        verified = items.filter(status__in=["verified", "observed"]).count()
        by_dimension: dict[str, dict] = {}

        for item in items:
            d = item.dimension_tag
            if d not in by_dimension:
                by_dimension[d] = {"total": 0, "verified": 0, "dimension_display": item.get_dimension_tag_display()}
            by_dimension[d]["total"] += 1
            if item.status in ["verified", "observed"]:
                by_dimension[d]["verified"] += 1

        return Response({
            "total_items": total,
            "verified_items": verified,
            "completeness_pct": round((verified / total) * 100) if total else 0,
            "by_dimension": by_dimension,
        })
