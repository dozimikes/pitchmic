"""
apps.application_intelligence.views
=====================================
API views for the Application Intelligence Engine.

Endpoints:
  GET  /programs/                         – list all active external program profiles
  GET  /programs/<id>/                    – full profile + rubric (requirements, questions, signals)
  GET  /correlations/                     – dataset-derived outcome correlation notes
  GET  /strategy/<program_id>/            – get saved strategy for current startup × program
  PUT  /strategy/<program_id>/            – save strategy for current startup × program
  GET  /stage-expectations/              – static stage evidence expectations (inline, no DB)
"""
from __future__ import annotations

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ApplicationStrategy, CorrelationNote, ExternalProgramProfile
from .serializers import (
    ApplicationStrategySerializer,
    CorrelationNoteSerializer,
    ExternalProgramProfileListSerializer,
    ExternalProgramProfileSerializer,
)


# ---------------------------------------------------------------------------
# Stage expectations — static lookup table, no DB needed
# ---------------------------------------------------------------------------

STAGE_EVIDENCE_EXPECTATIONS = [
    {
        "stage": "IDEA",
        "description": (
            "Idea-stage companies are not expected to produce revenue evidence. "
            "Focus on insight, validation, and early building."
        ),
        "evidence_items": [
            "Founder insight (proprietary problem exposure)",
            "Problem validation interviews (≥ 10)",
            "Customer discovery notes / journey maps",
            "Market evidence (data points, news, regulation)",
            "Prototype or technical feasibility demo",
        ],
    },
    {
        "stage": "PRE_SEED",
        "description": (
            "Pre-seed companies should show product and user validation artifacts. "
            "Revenue is not required but is a positive signal."
        ),
        "evidence_items": [
            "Working prototype / MVP",
            "Early user validation (signups, waitlist, beta users)",
            "Pilot interest or LOIs from target customers",
            "Early usage metrics (DAU/MAU, retention, session length)",
            "Founder-market fit narrative (domain background + path)",
            "Market evidence and adjacent trend data",
        ],
    },
    {
        "stage": "SEED",
        "description": "Seed-stage applications require commercial proof and repeatable distribution patterns.",
        "evidence_items": [
            "Revenue (paid customers, MRR/ARR trend)",
            "Customer count and retention cohorts",
            "Growth (MoM revenue or user growth)",
            "Distribution playbook (CAC, channels, conversion)",
            "Unit economics (CAC payback, LTV, gross margin)",
        ],
    },
    {
        "stage": "SERIES_A",
        "description": "Series A requires proven scale, predictability, and durable economics.",
        "evidence_items": [
            "Revenue trajectory and repeatability",
            "Growth rate (MoM / QoQ)",
            "Retention (cohort curves, NDR, gross revenue retention)",
            "CAC efficiency and payback period",
            "LTV and LTV:CAC ratio trend",
            "Gross margin and contribution margin stability",
            "Repeatability across segments / geos",
        ],
    },
]


class ProgramProfileListView(generics.ListAPIView):
    """List all active external program profiles (lightweight)."""
    serializer_class = ExternalProgramProfileListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ExternalProgramProfile.objects.filter(is_active=True)


class ProgramProfileDetailView(generics.RetrieveAPIView):
    """Full program profile including requirements, questions, and signals."""
    serializer_class = ExternalProgramProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = ExternalProgramProfile.objects.filter(is_active=True).prefetch_related(
        "requirements", "questions", "signals"
    )


class CorrelationNoteListView(generics.ListAPIView):
    """List active correlation notes."""
    serializer_class = CorrelationNoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return CorrelationNote.objects.filter(is_active=True)


class StageExpectationsView(APIView):
    """Return static stage evidence expectations. No DB required."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(STAGE_EVIDENCE_EXPECTATIONS)


class ApplicationStrategyView(APIView):
    """
    GET  /strategy/<int:program_id>/  — retrieve saved strategy
    PUT  /strategy/<int:program_id>/  — upsert saved strategy
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_program(self, program_id: int) -> ExternalProgramProfile:
        return generics.get_object_or_404(ExternalProgramProfile, pk=program_id, is_active=True)

    def get(self, request, program_id: int):
        program = self._get_program(program_id)
        try:
            strategy = ApplicationStrategy.objects.get(startup=request.user, program=program)
        except ApplicationStrategy.DoesNotExist:
            # Return an empty strategy shape so the frontend can hydrate fields
            return Response({
                "id": None,
                "program_id": program.pk,
                "program_name": program.name,
                "problem": "",
                "founder_advantage": "",
                "why_now": "",
                "proof": "",
                "program_fit": "",
                "primary_weakness": "",
                "mitigation": "",
                "updated_at": None,
            })
        serializer = ApplicationStrategySerializer(strategy)
        return Response(serializer.data)

    def put(self, request, program_id: int):
        program = self._get_program(program_id)
        strategy, _ = ApplicationStrategy.objects.get_or_create(
            startup=request.user,
            program=program,
        )
        serializer = ApplicationStrategySerializer(strategy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
