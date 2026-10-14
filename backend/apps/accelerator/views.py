"""
apps.accelerator.views
======================
API ViewSets and endpoints for the Venture Admissions & Investment Operating System.
Includes granular role-based security, dynamic question engine, claim extraction,
forensic stage inference, multi-reviewer scoring, and selection committee workflows.
"""
from __future__ import annotations

import json
import hashlib
import logging
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Exists, OuterRef, Prefetch, Q
from django.db.utils import IntegrityError
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAssessment,
    ApplicationAuditEvent,
    ApplicationClaim,
    ApplicationDocument,
    ApplicationNote,
    ApplicationQuestion,
    CommitteeDecision,
    ContinuousAssessment,
    DiligenceItem,
    EvidenceRequest,
    FounderApplicationProfile,
    InterviewSession,
    MilestoneTemplate,
    ProgramMembership,
    QuestionResponse,
    ReviewComment,
    ReviewerAssessment,
    ReviewerDisagreement,
    StartupApplicationProfile,
    StartupMilestone,
)
from .models_os import (
    AcceleratorOrganization,
    ProgramStaffMembership,
    ReviewAssignment,
    ReviewerProfile,
    WorkflowAutomation,
)
from .permissions import IsAcceleratorOrStaff, IsApplicationOwnerOrStaff, programs_visible_to
from .tenant import (
    TenantScopedWriteMixin,
    catalogue_programs,
    is_program_team,
    may_configure_program,
    positive_int,
    program_visible_to,
    require_visible_program,
    scope_application_rows,
    scope_applications,
    scope_rows_to_visible_programs,
    scope_to_visible_programs,
)
# The project's one file-saving helper (media storage + absolute URL), imported
# rather than duplicated so uploads land where every other upload lands.
from apps.users.views import _save_upload
from .serializers import (
    AcceleratorApplicationCreateSerializer,
    AcceleratorApplicationDetailSerializer,
    AcceleratorApplicationListSerializer,
    AcceleratorProgramDetailSerializer,
    AcceleratorProgramListSerializer,
    AcceleratorProgramWriteSerializer,
    ApplicationAssessmentSerializer,
    ApplicationAuditEventSerializer,
    ApplicationClaimSerializer,
    ApplicationDocumentSerializer,
    ApplicationQuestionSerializer,
    ClaimEvidenceSerializer,
    CommitteeDecisionSerializer,
    ContinuousAssessmentSerializer,
    DiligenceItemSerializer,
    EligibilityCheckSerializer,
    EvidenceRequestSerializer,
    FounderApplicationProfileSerializer,
    InterviewSessionSerializer,
    MilestoneTemplateSerializer,
    ProgramMembershipSerializer,
    QuestionResponseSerializer,
    ReviewAssignmentSerializer,
    ReviewerAssessmentSerializer,
    ReviewerDisagreementSerializer,
    StartupApplicationProfileSerializer,
    StartupMilestoneSerializer,
    SwitchContextSerializer,
    UserContextResponseSerializer,
    WorkflowAutomationSerializer,
    WorkflowConfigSerializer,
)
from . import workflows
from . import workflow_engine
from . import queue_routing
from . import evidence_state
from .evidence_extraction import EvidenceExtractionUnavailable, extract_from
from .evidence_state import claim_exposure_annotations
from .decision_room import (
    DecisionRoom,
    QUORUM_SUMMARY_KEYS,
    TERMINAL_VOTE_CLOSURE_STATUSES,
    tally_committee_votes,
)
from .interview_guide import build_interview_guide, pool_strength_ladder
from apps.accelerator.eligibility import (
    evaluate_program_eligibility,
    facts_from_application,
    evaluate_application_eligibility,
    triage_bucket,
)


logger = logging.getLogger(__name__)

User = get_user_model()


def _write_assignment_audit(app, actor, action_type, reason):
    """Record an assignment change in the same immutable ledger as stage moves.

    from_stage and to_stage are both the current status: nothing about where the
    application sits in the funnel changed, only who is pointed at it. The row is
    still worth keeping — "who was asked, by whom, when" is what a program
    coordinator is later asked to show.
    """
    try:
        ApplicationAuditEvent.objects.create(
            application=app, actor=actor,
            from_stage=app.status, to_stage=app.status,
            reason=reason, action_type=action_type,
        )
    except Exception:  # noqa: BLE001 - auditing must never block the operation
        logger.exception(
            "assignment audit write failed app_id=%s action=%s", app.pk, action_type
        )


def _write_transition_audit(app, from_status, to_status, actor, reason, is_automated=False):
    """Record an immutable audit event for a manual status transition, with a
    SHA-256 snapshot of the evidence at decision time (WHO/WHAT/WHEN/BEFORE/AFTER/WHY)."""
    try:
        runtime = app.program.get_runtime()
        snapshot = {
            "eligibility_score": app.eligibility_score,
            "startup_strength_score": app.startup_strength_score,
            "program_fit_score": app.program_fit_score,
            "evidence_confidence_score": app.evidence_confidence_score,
            "automated_tier": app.automated_screening_tier,
        }
        digest = hashlib.sha256(
            json.dumps(snapshot, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
        ApplicationAuditEvent.objects.create(
            application=app, from_stage=from_status, to_stage=to_status,
            actor=actor, reason=reason,
            policy_version=runtime.get_policy_version(),
            evidence_snapshot=snapshot, snapshot_hash=digest,
            is_automated=is_automated,
        )
    except Exception:  # noqa: BLE001 - auditing must never block the transition
        logger.exception("audit write failed on transition app_id=%s", app.pk)


def _signal_support(signals: list[bool]) -> float:
    """
    Fraction of a dimension's input signals that actually carry data (0.0-1.0).
    This is data coverage, never a model probability: 0.4 means "40% of the
    inputs this screening rule scored on were populated", not "40% chance the
    score is correct".
    """
    if not signals:
        return 0.0
    return round(sum(1 for s in signals if s) / len(signals), 2)


# ──────────────────────────────────────────────────────────────────────────────
# 1. Program & Discovery Marketplace
# ──────────────────────────────────────────────────────────────────────────────

def _display_name(user_obj) -> str:
    """Best available human label for a user row (no fabricated names)."""
    if user_obj is None:
        return "Unknown"
    full = getattr(user_obj, "full_name", None)
    if full:
        return str(full)
    first = getattr(user_obj, "first_name", "") or ""
    last = getattr(user_obj, "last_name", "") or ""
    joined = f"{first} {last}".strip()
    return joined or str(getattr(user_obj, "email", "") or "Unknown")


# Final dispositions: a human with standing on THIS application must own them.
DECISION_STATUSES = ("ACCEPTED", "REJECTED", "WAITLISTED", "DEFERRED")

# Structured marker for gate overrides in the audit ledger. The eligibility
# report's "recent overrides" list queries on this prefix — one constant,
# written server-side, so the protocol can't drift from UI wording.
OVERRIDE_REASON_PREFIX = "Director override:"


def _assert_decision_authority(user, app, decision: str) -> None:
    """Raises PermissionDenied unless ``user`` may record ``decision`` on ``app``.

    Shared by transition-status and the Decision Room's record-decision path so
    the two can never drift: ML surfaces evidence, but selecting or rejecting a
    company is restricted to staff, the program owner, or a reviewer who has
    actually assessed this application.
    """
    if decision not in DECISION_STATUSES:
        return
    if getattr(user, "is_staff", False):
        return
    has_standing = (
        app.program.created_by_id == getattr(user, "id", None)
        or app.reviewer_assessments.filter(reviewer=user).exists()
    )
    if not has_standing:
        raise PermissionDenied(
            "Only the program owner, staff, or a reviewer who has assessed "
            "this application can record a decision."
        )


# The five fixed scorecard dimensions, and the tolerance that counts as
# agreement between two humans. One pair of constants for the disagreement
# detector and the calibration report — they must never disagree with each other.
REVIEW_DIMENSIONS = ("founder_score", "market_score", "product_score", "team_score", "traction_score")
AGREEMENT_TOLERANCE_POINTS = 3.0


def _require_review_scope(request) -> None:
    """Bulk reads of the reviewer ledger name a program or an application.

    Tenants are already kept apart by `scope_rows_to_visible_programs`, so this
    is no longer the only thing standing between one team and another's notes —
    it bounds the response. An unscoped list of every scorecard an account has
    ever worked is nobody's screen, and a page that wants a person's own queue
    asks for it by reviewer, not by leaving the filter off.
    """
    qp = request.query_params
    if not (qp.get("program_id") or qp.get("program") or qp.get("application_id")):
        raise ValidationError(
            {"detail": "Reviewer records must be scoped: pass program_id (or application_id)."}
        )


def _require_diligence_scope(request) -> None:
    """Same bulk-read rule as reviewer records: diligence questions name an
    owner and often quote internal findings, so an unscoped list of every
    program's open questions is refused rather than served."""
    qp = request.query_params
    if not (qp.get("program_id") or qp.get("program") or qp.get("application_id")):
        raise ValidationError(
            {"detail": "Diligence items must be scoped: pass program_id (or application_id)."}
        )


def _program_id_for(request):
    """Which program a scoped bulk read is about, proved against the caller.

    Either named directly or resolved from an application — and in the second
    case the application is the caller's to look at before its program is used,
    so an id from another tenant names nothing. Returning the program rather
    than trusting the filter keeps a readout's denominator tied to the tenant it
    claims to describe: a scoped *queryset* silently answers an unfamiliar
    program with zeros, which reads as "nobody has looked yet" when the truth is
    "you may not look".
    """
    qp = request.query_params
    raw = qp.get("program_id") or qp.get("program")
    app_id = qp.get("application_id")
    if app_id:
        # Coerced once, here, so no lookup below meets caller text and raises
        # `ValueError` where the answer should have been a refusal.
        app_id = positive_int(app_id, "application_id")
    if raw:
        require_visible_program(request.user, raw)
        if app_id:
            # Both named: they have to agree, or the numbers below would count
            # one program's load against another's seats.
            app_program = (
                AcceleratorApplication.objects.filter(pk=app_id)
                .values_list("program_id", flat=True).first()
            )
            if app_program is None or str(app_program) != str(raw):
                raise ValidationError({
                    "application_id": "That application is not in the program "
                                      "named by program_id."
                })
        return positive_int(raw, "program_id")
    if app_id:
        app_program = (
            AcceleratorApplication.objects.filter(pk=app_id)
            .values_list("program_id", flat=True).first()
        )
        if app_program is None:
            raise ValidationError({"application_id": "Unknown application."})
        require_visible_program(request.user, app_program, field="application_id")
        return app_program
    return None


def current_scorecards(reviews) -> list:
    """Collapse to one row per (application, reviewer) — the most recent one.

    ``ReviewerAssessment`` already has ``unique_together`` on that pair, so this
    is a guard on the ordering of whatever queryset comes in (and on rows that
    predate the constraint) rather than a fix for duplicate writes."""
    by_pair: dict[tuple[int, int], ReviewerAssessment] = {}
    for r in reviews:
        key = (r.application_id, r.reviewer_id)
        prev = by_pair.get(key)
        if prev is None or (r.submitted_at, r.pk) >= (prev.submitted_at, prev.pk):
            by_pair[key] = r
    return list(by_pair.values())


def compute_reviewer_calibration(reviews) -> dict:
    """Reviewer calibration from real scorecards only — the single
    implementation behind both /reviews/calibration/ and the consensus report.

    Agreement means two *different* reviewers scored the same dimension on the
    same application within AGREEMENT_TOLERANCE_POINTS. With no overlapping
    reviews the agreement value is null — consumers render 'not enough data',
    never an estimate."""
    current = current_scorecards(reviews)
    by_app: dict[int, list[ReviewerAssessment]] = {}
    for r in current:
        by_app.setdefault(r.application_id, []).append(r)

    pair_comparisons = pair_agreements = 0
    reviewer_stats: dict[int, dict] = {}
    for rid in sorted({r.reviewer_id for r in current}):
        rows = [r for r in current if r.reviewer_id == rid]
        reviewer_stats[rid] = {
            "name": _display_name(rows[0].reviewer),
            "reviews": len(rows),
            "conviction_sum": sum(float(r.overall_conviction or 0) for r in rows),
            "last": max((r.submitted_at for r in rows), default=None),
            "compared": 0,
            "agreed": 0,
        }
    for rs in by_app.values():
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                for dim in REVIEW_DIMENSIONS:
                    v1, v2 = getattr(rs[i], dim), getattr(rs[j], dim)
                    if v1 is None or v2 is None:
                        continue
                    pair_comparisons += 1
                    if abs(float(v1) - float(v2)) < AGREEMENT_TOLERANCE_POINTS:
                        pair_agreements += 1
                for a, b in ((rs[i], rs[j]), (rs[j], rs[i])):
                    va, vb = a.overall_conviction, b.overall_conviction
                    if va is None or vb is None:
                        continue
                    st = reviewer_stats[a.reviewer_id]
                    st["compared"] += 1
                    if abs(float(va) - float(vb)) < AGREEMENT_TOLERANCE_POINTS:
                        st["agreed"] += 1

    convictions = [float(r.overall_conviction) for r in current if r.overall_conviction is not None]
    cohort_avg = round(sum(convictions) / len(convictions), 2) if convictions else None

    reviewers_out = []
    for rid, st in reviewer_stats.items():
        avg = round(st["conviction_sum"] / st["reviews"], 2) if st["reviews"] else None
        if cohort_avg is None or avg is None:
            tendency = "insufficient_data"
        elif avg >= cohort_avg + 0.5:
            tendency = "lenient"
        elif avg <= cohort_avg - 0.5:
            tendency = "strict"
        else:
            tendency = "in_line"
        reviewers_out.append({
            "reviewer_id": rid,
            "reviewer_name": st["name"],
            "reviews": st["reviews"],
            "avg_overall_conviction": avg,
            "last_submitted_at": st["last"].isoformat() if st["last"] else None,
            "tendency": tendency,
            "agreement_with_cohort_pct": (
                round(st["agreed"] / st["compared"] * 100, 1) if st["compared"] else None
            ),
        })
    reviewers_out.sort(key=lambda x: -x["reviews"])

    return {
        "total_scorecards": len(current),
        "applications_reviewed": len(by_app),
        "multi_reviewer_applications": sum(1 for rs in by_app.values() if len(rs) >= 2),
        "inter_reviewer_agreement_pct": (
            round(pair_agreements / pair_comparisons * 100, 1) if pair_comparisons else None
        ),
        "cohort_avg_conviction": cohort_avg,
        "agreement_basis": (
            f"Dimension scores within {AGREEMENT_TOLERANCE_POINTS} points across reviewer pairs "
            "on the same application (1-10 scale). Tendency compares each reviewer's mean "
            "conviction against the cohort mean (±0.5 points)."
        ),
        "reviewers": reviewers_out,
    }


def _apply_decision_side_effects(app, new_status: str) -> None:
    """Everything that must be true once a final disposition lands on an
    application. Shared by transition-status and record-decision so accepting a
    company through either path enrols the cohort membership identically —
    a decision recorded twice can never produce two different program states."""
    if new_status not in DECISION_STATUSES + ("WITHDRAWN",):
        return
    app.decision_at = timezone.now()
    app.save(update_fields=["decision_at", "updated_at"])
    if new_status != "ACCEPTED":
        return
    membership, created = ProgramMembership.objects.get_or_create(
        application=app, program=app.program,
    )
    if created:
        for template in app.program.milestone_templates.all():
            StartupMilestone.objects.get_or_create(membership=membership, template=template)
    ContinuousAssessment.objects.create(
        application=app,
        period_label="Application Acceptance",
        readiness_score=app.startup_strength_score,
        revenue_at_period=app.startup_profile.mrr_usd,
        customers_at_period=app.startup_profile.customer_count,
        funding_raised_at_period=app.startup_profile.total_funding_raised_usd,
    )


class AcceleratorProgramViewSet(viewsets.ModelViewSet):
    """
    Marketplace and program management viewset.
    List, detail, create (accelerator/staff), and run real-time eligibility checks.
    """
    queryset = AcceleratorProgram.objects.filter(is_active=True)
    lookup_field = "pk"

    def get_queryset(self):
        """The catalogue page this caller may read, not every page there is.

        `is_public` opens a program to intake; it does not publish the private
        ones. Left as a static `queryset`, an unpublished program was reachable
        by id from an anonymous request — its name, its organization, how many
        applications it is sitting on, and with the detail serializer its whole
        scoring rubric.
        """
        visible = catalogue_programs(self.request.user)
        base = AcceleratorProgram.objects.filter(is_active=True)
        return base if visible is None else base.filter(pk__in=visible)

    def get_serializer_class(self):
        if self.action == "list":
            return AcceleratorProgramListSerializer
        if self.action in ["create", "update", "partial_update"]:
            return AcceleratorProgramWriteSerializer
        return AcceleratorProgramDetailSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve", "check_eligibility"]:
            return [AllowAny()]
        return [IsAcceleratorOrStaff()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        blocked = self._publish_guard(request)
        if blocked:
            return blocked
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        blocked = self._publish_guard(request)
        if blocked:
            return blocked
        return super().partial_update(request, *args, **kwargs)

    def _publish_guard(self, request):
        """Publishing activates a program's screening methodology. Refuse when
        the Selection Framework (scoring rubric) is empty so an unconfigured
        program can never start receiving/processing founder applications."""
        if str(request.data.get("program_status", "")).lower() != "published":
            return None
        program = self.get_object()
        rubric = request.data.get("scoring_rubric_config", None)
        if rubric is None:
            rubric = program.scoring_rubric_config
        if not rubric:
            return Response(
                {"error": "Publish blocked: configure the Selection Framework "
                          "(scoring rubric) before publishing this program."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @action(detail=True, methods=["get"], url_path="decision-room")
    def decision_room(self, request, pk=None):
        """The committee's whole-program view: real funnel counts plus every
        live candidate ranked by the program's own configured dimensions and
        weights. Computed server-side so the room can never disagree with the
        database (the frontend does not re-derive any of it)."""
        program = self.get_object()
        return Response(DecisionRoom(program).get_selection_summary())

    @action(detail=True, methods=["post"], url_path="check-eligibility")
    def check_eligibility(self, request, pk=None):
        """
        Calculates granular requirement-by-requirement founder eligibility.
        Delegates to apps.accelerator.eligibility — the same engine the
        dashboard scores submitted applications with, so the pre-application
        self-check and the triage view can never disagree.
        """
        program = self.get_object()
        serializer = EligibilityCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            evaluate_program_eligibility(program, serializer.validated_data)
        )

    @action(detail=True, methods=["get", "put"], url_path="workflow")
    def workflow(self, request, pk=None):
        """
        Workflow OS definition for this program: the ordered stage spine and the
        allowed transitions between them. GET returns the current config plus the
        vocabulary (statuses + automation triggers) the builder needs; PUT saves it.

        Stage slugs are constrained to the application STATUS_CHOICES so the visual
        builder and the runtime stay aligned — a deterministic guard, not a free-form
        JSON blob.
        """
        program = self.get_object()
        valid_statuses = list(AcceleratorApplication.STATUS_CHOICES)
        valid_slugs = {s for s, _ in valid_statuses}

        if request.method == "GET":
            # Ensure a spine exists, then read the authoritative relational graph.
            workflow_engine.ensure_default_graph(program)
            stages = [
                {"slug": s.slug, "label": s.name, "description": s.description,
                 "type": s.type, "terminal": s.is_terminal, "order": s.order}
                for s in program.stages.order_by("order", "id")
            ]
            transitions = [
                {"from_stage": t.from_stage.slug, "to_stage": t.to_stage.slug,
                 "label": t.label}
                for t in program.transitions.select_related("from_stage", "to_stage").order_by("order", "id")
            ]
            trigger_choices = WorkflowAutomation._meta.get_field("trigger_event").choices
            return Response({
                "program_id": program.id,
                "style": program.workflow_style,
                "stages": stages,
                "transitions": transitions,
                "available_statuses": [{"slug": s, "label": l} for s, l in valid_statuses],
                "available_triggers": [{"value": v, "label": l} for v, l in trigger_choices],
            })

        serializer = WorkflowConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        stage_slugs = [s["slug"] for s in data["stages"]]
        unknown = sorted({s for s in stage_slugs if s not in valid_slugs})
        if unknown:
            return Response(
                {"error": f"Unknown stage slugs (must be valid application statuses): {unknown}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(stage_slugs) != len(set(stage_slugs)):
            return Response({"error": "Duplicate stage slugs are not allowed."},
                            status=status.HTTP_400_BAD_REQUEST)

        slug_set = set(stage_slugs)
        for t in data.get("transitions", []):
            if t["from_stage"] not in slug_set or t["to_stage"] not in slug_set:
                return Response(
                    {"error": f"Transition references undefined stage: {t['from_stage']} → {t['to_stage']}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        saved = workflow_engine.sync_graph_from_config(
            program, data["style"], data["stages"], data.get("transitions", [])
        )
        return Response({
            "program_id": program.id,
            "style": program.workflow_style,
            "stages": saved["stages"],
            "transitions": saved["transitions"],
            "saved": True,
        })

    @action(detail=True, methods=["get"], url_path="pipeline")
    def pipeline(self, request, pk=None):
        """
        Returns full Kanban pipeline with applications partitioned by status and tier.
        """
        program = self.get_object()
        apps = program.applications.select_related("startup_profile", "assessment").all()

        columns = {
            "SUBMITTED": [],
            "SCREENING": [],
            "SHORTLISTED": [],
            "INTERVIEW_INVITED": [],
            "INTERVIEW_COMPLETE": [],
            "COMMITTEE_REVIEW": [],
            "EVIDENCE_REQUESTED": [],
            "ACCEPTED": [],
            "REJECTED": [],
            "WAITLISTED": [],
        }

        tiers = {"A": 0, "B": 0, "C": 0, "D": 0}
        total_apps = apps.count()
        avg_fit = 0.0
        avg_evidence = 0.0

        for app in apps:
            app_data = AcceleratorApplicationListSerializer(app).data
            status_col = app.status if app.status in columns else "SUBMITTED"
            columns[status_col].append(app_data)
            if app.automated_screening_tier in tiers:
                tiers[app.automated_screening_tier] += 1
            avg_fit += app.program_fit_score
            avg_evidence += app.evidence_confidence_score

        if total_apps > 0:
            avg_fit = round(avg_fit / total_apps, 1)
            avg_evidence = round(avg_evidence / total_apps, 1)

        return Response({
            "program_id": program.id,
            "program_name": program.name,
            "organization_name": program.organization_name,
            "total_applications": total_apps,
            "columns": columns,
            "tiers": tiers,
            "avg_fit": avg_fit,
            "avg_evidence_confidence": avg_evidence,
        })

    @action(detail=True, methods=["get"], url_path="cohort")
    def cohort(self, request, pk=None):
        """
        Active cohort management: enrolled startups, milestones, and continuous reassessment.
        """
        program = self.get_object()
        memberships = ProgramMembership.objects.filter(program=program, is_active=True).select_related(
            "application__startup_profile"
        ).prefetch_related("milestones__template")

        templates = program.milestone_templates.all()

        data = []
        for mem in memberships:
            mem_data = ProgramMembershipSerializer(mem).data
            latest_ca = ContinuousAssessment.objects.filter(application=mem.application).order_by("-recorded_at").first()
            mem_data["latest_readiness_score"] = latest_ca.readiness_score if latest_ca else mem.application.startup_strength_score
            data.append(mem_data)

        return Response({
            "program_id": program.id,
            "program_name": program.name,
            "target_cohort_size": program.target_cohort_size,
            "enrolled_count": len(data),
            "members": data,
            "milestone_templates": MilestoneTemplateSerializer(templates, many=True).data,
        })


# ──────────────────────────────────────────────────────────────────────────────
# 2. Canonical Founder & Startup Profiles
# ──────────────────────────────────────────────────────────────────────────────

class FounderProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = FounderApplicationProfile.objects.get_or_create(
            user=request.user,
            defaults={"full_name": request.user.full_name or request.user.email}
        )
        return Response(FounderApplicationProfileSerializer(profile).data)

    def put(self, request):
        profile, _ = FounderApplicationProfile.objects.get_or_create(user=request.user)
        serializer = FounderApplicationProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        fields = [profile.full_name, profile.location, profile.country, profile.linkedin, profile.education, profile.employment, profile.cofounders]
        filled = sum(1 for f in fields if f)
        profile.profile_completeness = round(filled / len(fields) * 100, 1)
        profile.save(update_fields=["profile_completeness"])

        return Response(FounderApplicationProfileSerializer(profile).data)


class StartupProfileViewSet(viewsets.ModelViewSet):
    serializer_class = StartupApplicationProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        founder_prof, _ = FounderApplicationProfile.objects.get_or_create(
            user=self.request.user,
            defaults={"full_name": self.request.user.full_name or self.request.user.email}
        )
        return StartupApplicationProfile.objects.filter(founder_profile=founder_prof)

    def perform_create(self, serializer):
        founder_prof, _ = FounderApplicationProfile.objects.get_or_create(
            user=self.request.user,
            defaults={"full_name": self.request.user.full_name or self.request.user.email}
        )
        serializer.save(founder_profile=founder_prof)


# ──────────────────────────────────────────────────────────────────────────────
# 3. Dynamic Question Engine
# ──────────────────────────────────────────────────────────────────────────────

class ApplicationQuestionViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """The question bank a program's application form draws from.

    A question with no `program` belongs to no tenant, so a create has to name
    one this account owns — `program_write_rule = "manage"`, the same rule the
    form builder uses. Reads are the caller's programs plus the platform-wide
    rows in `NULL_PROGRAM_READABLE`.
    """

    serializer_class = ApplicationQuestionSerializer
    program_write_rule = "manage"

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated()]
        return [IsAcceleratorOrStaff()]

    def get_queryset(self):
        return scope_to_visible_programs(
            ApplicationQuestion.objects.filter(is_active=True), self.request
        ).order_by("program_id", "order", "id")


class QuestionResponseViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """A founder's answers, row by row.

    Reads and writes follow the application: a founder reaches the answers on
    their own submission, a program-team account reaches the answers inside the
    programs it works in. `batch-save` is the same question, answered once —
    see `_assert_answer_targets`.
    """

    serializer_class = QuestionResponseSerializer
    permission_classes = [IsAuthenticated]
    program_source = "application__program"
    program_write_rule = "visible"

    def get_queryset(self):
        return scope_application_rows(QuestionResponse.objects.all(), self.request)

    @action(detail=False, methods=["post"], url_path="batch-save")
    def batch_save(self, request):
        """Saves or updates multiple responses in a single transaction for dynamic forms."""
        responses_data = request.data.get("responses", [])
        saved = []
        for r in responses_data:
            q_id = r.get("question")
            app_id = r.get("application")
            if not (q_id and app_id):
                continue
            self._assert_answer_targets(request.user, q_id, app_id)
            resp, _ = QuestionResponse.objects.update_or_create(
                application_id=app_id,
                question_id=q_id,
                defaults={
                    "text_response": r.get("text_response", ""),
                    "numeric_response": r.get("numeric_response"),
                    "boolean_response": r.get("boolean_response"),
                    "selected_choices": r.get("selected_choices", []),
                    "url_response": r.get("url_response", ""),
                    "word_count": len((r.get("text_response") or "").split()),
                }
            )
            saved.append(resp.id)
        return Response({"saved_count": len(saved), "response_ids": saved})

    def _assert_answer_targets(self, user, question_id, application_id):
        """Prove the caller may write *this* answer, not merely that they are
        authenticated.

        `batch-save` writes through `update_or_create`, which no queryset and no
        serializer guard ever sees, so the pair of ids in the body is checked
        here: the application must be the caller's own (or inside a program they
        work in), and the question must belong to that application's program.
        The whole request is refused rather than half-applied, so a founder's
        form cannot quietly land part of its answers somewhere else.
        """
        # Each id is proved to be an id first, so a malformed one is refused by
        # name instead of raising `ValueError` from inside a lookup.
        application = AcceleratorApplication.objects.filter(
            pk=positive_int(application_id, "application")).first()
        question = ApplicationQuestion.objects.filter(
            pk=positive_int(question_id, "question")).first()
        if application is None:
            raise ValidationError({"application": "Unknown application."})
        if question is None:
            raise ValidationError({"question": "Unknown question."})
        if is_program_team(user):
            require_visible_program(user, application.program_id, field="application")
        elif application.submitted_by_id != user.id:
            raise PermissionDenied(
                "A founder may answer questions only on their own application."
            )
        if question.program_id != application.program_id:
            raise ValidationError(
                {"question": "That question belongs to a different program than this application."}
            )
        return application


# ──────────────────────────────────────────────────────────────────────────────
# 4. Applications Orchestration
# ──────────────────────────────────────────────────────────────────────────────

class AcceleratorApplicationPagination(PageNumberPagination):
    """Explicit pagination for the applications feed so dashboard tables can be
    server-paginated (``page`` / ``page_size``) and aggregate honestly."""
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


# Statuses that represent an application still inside the active funnel
# (i.e. not a terminal/disposition exit). Owned by queue_routing so the review
# queue's lane assignment and these aggregates use one list.
ACTIVE_FUNNEL_STATUSES = list(queue_routing.ACTIVE_FUNNEL_STATUSES)

# Deepest-reached rank per status, used by the funnel + conversion math.
STATUS_REACHED_RANK = {
    "DRAFT": 0,               # received (not yet submitted formally)
    "SUBMITTED": 1,
    "SCREENING": 2,
    "SHORTLISTED": 3,
    "INTERVIEW_INVITED": 4,
    "INTERVIEW_COMPLETE": 5,
    "COMMITTEE_REVIEW": 6,
    "EVIDENCE_REQUESTED": 6,
    "WAITLISTED": 6,
    "DEFERRED": 6,
    "ACCEPTED": 7,
    # exits — counted only at "received"
    "REJECTED": 1,
    "WITHDRAWN": 1,
}


# What each kind of filed document is evidence *for*: the claim category it
# fills, how much it matters if it turns out to be false, and the founder's own
# declared figure quoted from the stored profile — the assertion the document is
# meant to support. Nothing here reads files; a document that backs no declared
# number still becomes a claim, it just carries no number. Empty string means
# "nothing was declared to check", which the caller renders as a plain record
# that the file was filed.
DOCUMENT_CLAIM_KINDS = {
    "lois": ("commercial_traction", "critical",
             lambda s: f"{s.loi_count} letters of intent declared" if s.loi_count else ""),
    "customer_contracts": ("commercial_traction", "critical",
                           lambda s: f"{s.customer_count} paying customers declared" if s.customer_count else ""),
    "invoices": ("revenue", "critical", lambda s: ""),
    "bank_statements": ("revenue", "critical",
                        lambda s: f"${float(s.mrr_usd or 0):,.0f} MRR declared" if s.mrr_usd else ""),
    "financial_model": ("revenue", "critical",
                        lambda s: f"${float(s.mrr_usd or 0):,.0f} MRR declared" if s.mrr_usd else ""),
    "analytics": ("commercial_traction", "high", lambda s: ""),
    "incorporation": ("regulatory", "high",
                      lambda s: f"Incorporated in {s.incorporation_country}"
                      if s.incorporated and s.incorporation_country else ""),
    "business_registration": ("regulatory", "high", lambda s: ""),
    "regulatory": ("regulatory", "high", lambda s: ""),
    "patents": ("ip", "high", lambda s: ""),
    "cap_table": ("funding", "high", lambda s: ""),
    "previous_investment": ("funding", "high", lambda s: ""),
    "founder_cv": ("team", "medium", lambda s: ""),
    "product_demo": ("product", "medium", lambda s: ""),
    "pitch_deck": ("other", "medium", lambda s: ""),
    "other": ("other", "low", lambda s: ""),
}


class AcceleratorApplicationViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = AcceleratorApplicationPagination
    # An application is filed *inside* a program, so the write rule is the one
    # that lets a founder apply to a program open for intake — not the ownership
    # rule, which would refuse every founder, and not no rule at all, which is
    # what this was: `program` arrived as an id resolved against every row in
    # the table, so a POST could open an application inside a private program
    # run by somebody else.
    program_source = "program"
    program_write_rule = "visible"

    def get_queryset(self):
        # Staff hold every pipeline, a program-team account its tenants, a
        # founder their own submissions — the rule lives in `scope_applications`
        # so the applications list and every traversal derived from it (the
        # evidence graph, the dossier) answer "whose rows?" the same way.
        qs = scope_applications(AcceleratorApplication.objects.all(), self.request)

        # Claim / reviewer counts are annotated once (no per-row subqueries).
        # The claim bundle comes from `evidence_state`, which is also where the
        # open-vs-decided denominator and the contradicted-not-done rule live.
        qs = qs.annotate(
            **claim_exposure_annotations(),
            n_reviewers=Count("reviewer_assessments", distinct=True),
        ).select_related(
            "startup_profile", "startup_profile__founder_profile", "program", "assessment"
        ).prefetch_related(
            # The list serializer shows who is on each row; prefetching keeps a
            # 200-row page at two queries instead of 200.
            Prefetch(
                "reviewer_assignments",
                queryset=ReviewAssignment.objects
                .select_related("reviewer")
                .order_by("round_id", "assigned_at"),
            ),
            # Cards ride along so "asked" and "actually filed one" can be
            # reported side by side on the same row without a query per app.
            Prefetch(
                "reviewer_assessments",
                queryset=ReviewerAssessment.objects.only("id", "application_id", "reviewer_id"),
            ),
            # Same reason for the diligence rollup on each row: owners are named
            # there, so the prefetch keeps a 200-row page off 200 extra queries.
            Prefetch(
                "diligence_items",
                queryset=DiligenceItem.objects.select_related("owner").order_by("created_at", "id"),
            ),
        )

        qp = self.request.query_params
        program_id = qp.get("program_id") or qp.get("program")
        if program_id:
            # A caller-supplied id is text: a malformed one is refused by name,
            # never quietly ignored (ignoring it would list the whole tenant).
            qs = qs.filter(program_id=positive_int(program_id, "program_id"))
        statuses = qp.get("status")
        if statuses:
            qs = qs.filter(status__in=[s.strip().upper() for s in statuses.split(",") if s.strip()])
        tier = qp.get("tier")
        if tier:
            qs = qs.filter(automated_screening_tier=tier.strip().upper())
        stage = qp.get("declared_stage")
        if stage:
            qs = qs.filter(startup_profile__declared_stage=stage)
        sector = qp.get("sector")
        if sector:
            qs = qs.filter(startup_profile__sector_tags__icontains=sector)
        country = qp.get("country")
        if country:
            qs = qs.filter(
                Q(startup_profile__incorporation_country__iexact=country)
                | Q(startup_profile__founder_profile__country__iexact=country)
            )
        q = qp.get("q") or qp.get("search")
        if q:
            qs = qs.filter(
                Q(startup_profile__company_name__icontains=q)
                | Q(startup_profile__founder_profile__full_name__icontains=q)
            )
        return qs.order_by("-updated_at")

    def get_serializer_class(self):
        if self.action == "list":
            return AcceleratorApplicationListSerializer
        if self.action == "create":
            return AcceleratorApplicationCreateSerializer
        return AcceleratorApplicationDetailSerializer

    def perform_create(self, serializer):
        self._assert_writable(serializer)  # overrides ModelViewSet's hook, so call the gate
        app = serializer.save(submitted_by=self.request.user, status="DRAFT")
        self._ensure_assessment_and_questions(app)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit_application(self, request, pk=None):
        """
        Finalizes draft submission: runs automatic forensics, claim extraction,
        inferred stage calculations, accelerator-specific expectation scoring,
        and assigns automated screening tier (A/B/C/D).
        """
        app = self.get_object()
        app.status = "SUBMITTED"
        app.submitted_at = timezone.now()

        self._run_admissions_engine(app)
        app.save()

        return Response({
            "message": "Application submitted successfully and evaluated by Admissions Engine.",
            "application_id": app.id,
            "status": app.status,
            "screening_tier": app.automated_screening_tier,
            "program_fit_score": app.program_fit_score,
            "startup_strength_score": app.startup_strength_score,
            "evidence_confidence_score": app.evidence_confidence_score,
            "inferred_stage": app.inferred_stage,
            "stage_conflict": app.stage_conflict_detected,
        })

    @action(detail=True, methods=["get"], url_path="assessment")
    def get_assessment(self, request, pk=None):
        """Returns deep assessment scorecard with dimension confidence and bull/bear."""
        app = self.get_object()
        assessment, _ = ApplicationAssessment.objects.get_or_create(application=app)
        return Response(ApplicationAssessmentSerializer(assessment).data)

    @action(detail=True, methods=["post"], url_path="upload-document", parser_classes=[MultiPartParser, FormParser, JSONParser])
    def upload_document(self, request, pk=None):
        """File a document a founder offers as evidence for something they claimed.

        Nothing here reads the file, because there is no parser in this
        codebase. The previous version answered that gap by inventing the
        analysis: a claimed LOI count when the profile had none, "documents
        found/signed/intent" as fixed percentages of it, a 0.82 confidence, and
        the claim written up as verified on the strength of the file arriving.
        A file arriving is not a fact being confirmed, so this records exactly
        what is known — the document exists at this address, it was filed
        against this kind of assertion, and the founder's own declared figure
        (quoted from the stored answer, never from the file) is still waiting to
        be checked. Verification is a separate act by a named human.

        No ClaimEvidence row is written either: its counters default to zero,
        and a zero nobody measured reads to the committee as "checked, found
        none".
        """
        app = self.get_object()
        doc_type = str(request.data.get("document_type") or "").strip()
        valid_types = {value for value, _label in ApplicationDocument.DOCUMENT_TYPE_CHOICES}
        if doc_type not in valid_types:
            return Response(
                {"document_type": f"Unknown document type: {doc_type or '(blank)'}. "
                                  "Name the kind of thing actually filed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        upload = request.data.get("file")
        file = upload if hasattr(upload, "read") else None
        file_url = str(request.data.get("file_url") or "").strip()
        if file is not None:
            file_url = _save_upload(file, f"accelerator/applications/{app.pk}", request)
        if not file_url:
            return Response(
                {"file": "Send the file, or the address it already lives at. "
                         "A document row with no location points nowhere."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        label = dict(ApplicationDocument.DOCUMENT_TYPE_CHOICES)[doc_type]
        file_name = str(request.data.get("file_name") or "").strip() or (file.name if file is not None else "")
        if not file_name:
            # Names are not decoration — a committee reads a list of them. The
            # stored path is the only truthful fallback.
            file_name = file_url.rsplit("/", 1)[-1]

        doc = ApplicationDocument.objects.create(
            application=app,
            document_type=doc_type,
            file_name=file_name,
            file_url=file_url,
            file_size_bytes=getattr(file, "size", 0) or 0,
            mime_type=str(getattr(file, "content_type", "") or ""),
            # Nothing has been read out of the file, so extraction has not
            # happened. It stays pending until something exists that can do it.
            extraction_status="pending",
            extracted_claims_count=0,
        )

        category, materiality, declared_of = DOCUMENT_CLAIM_KINDS[doc_type]
        declared = declared_of(app.startup_profile)
        statement = f"{file_name} filed as {label}."
        if declared:
            # The founder's own words, quoted from the stored profile — the
            # assertion the document is meant to support, not a finding.
            statement = f"{declared} — {file_name} filed as {label}."

        ApplicationClaim.objects.create(
            application=app,
            claim_id=f"C-{app.id:03d}{app.claims.count() + 1:02d}",
            claim_text=statement,
            category=category,
            materiality=materiality,
            source="document",
            source_document=doc,
            founder_asserted=True,
            evidence_required=True,
            # Provided, not satisfied: a document is in the file, and nothing
            # has yet established that it says what it is said to say.
            evidence_status="provided",
            verification_status=evidence_state.PENDING,
        )

        # Everything the file itself says, through the extraction port. Nothing
        # stands behind it in this deployment, so `extract_from` raises and the
        # document row stays `pending` — which now means "no extractor has read
        # this" rather than "a step is coming". A real one only has to be
        # registered; this path already files what it finds, and files it as
        # claims the founder asserted rather than findings, because an extractor
        # reports what a document says and not whether it is true.
        try:
            found = extract_from(doc)
        except EvidenceExtractionUnavailable:
            found = []
        for extracted in found:
            ApplicationClaim.objects.create(
                application=app,
                claim_id=f"C-{app.id:03d}{app.claims.count() + 1:02d}",
                claim_text=extracted.text,
                category=extracted.category,
                materiality=extracted.materiality,
                source="document",
                source_document=doc,
                founder_asserted=True,
                evidence_required=True,
                evidence_status="provided",
                verification_status=evidence_state.PENDING,
            )
        if found:
            doc.extraction_status = "complete"
            doc.extracted_at = timezone.now()
            doc.extracted_claims_count = len(found)
            doc.save(update_fields=["extraction_status", "extracted_at",
                                    "extracted_claims_count"])

        self._run_admissions_engine(app)
        app.save()

        return Response(ApplicationDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="copilot")
    def ai_reviewer_copilot(self, request, pk=None):
        """
        Admissions Copilot: Rule-based decision-support Q&A backed by the application's
        structured evidence graph and stored assessment data.

        NOTE: This is NOT an LLM. Responses are generated from structured application fields
        via keyword matching. This is communicated explicitly to the frontend and included in
        every response payload so callers cannot mistake it for AI-generated analysis.

        Restricted to Accelerators, Investors, and Staff.
        """
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            raise PermissionDenied("Admissions Copilot is restricted to admissions evaluators and committee members.")

        app = self.get_object()
        query = (request.data.get("query") or "").lower()
        company = app.startup_profile.company_name
        startup = app.startup_profile
        founder = startup.founder_profile

        # Build evidence summary from real stored data. The breakdown is built
        # from whichever states the rows actually hold rather than from a fixed
        # sentence: the old wording reported `pending` + `unverified` as one
        # number called "pending", which told a reader nothing had been examined
        # when in fact somebody had examined it and the evidence did not carry
        # it — two different facts, and the second one is a finding.
        total_claims = app.claims.count()
        per_state: dict[str, int] = {}
        for code, n in (app.claims.values_list("verification_status")
                        .annotate(count=Count("pk")).order_by("verification_status")):
            per_state[code] = n
        breakdown = ", ".join(
            f"{n} {evidence_state.label(code).lower()}"
            for code, n in sorted(per_state.items(), key=lambda kv: (-kv[1], kv[0]))
        )
        claims_summary = (
            f"{total_claims} structured claims extracted"
            + (f" ({breakdown})." if breakdown else ".")
        )

        # ── Keyword-matched response branches ─────────────────────────────────
        if "why" in query and ("interview" in query or "recommend" in query):
            answer = (
                f"Rule-based analysis - Interview recommendation drivers for {company}:\n\n"
                f"1. Founder Signal: {founder.full_name or 'Founder'} - technical capability "
                f"score {founder.technical_capability_score}/10, "
                f"full-time: {'yes' if founder.full_time_status else 'no'}.\n"
                f"2. Program Fit: {app.program_fit_score:.0f}% alignment with "
                f"{app.program.name} ({app.program.sector_focus}).\n"
                f"3. Commercial Traction: {startup.loi_count or 0} declared LOIs, "
                f"{startup.pilot_count or 0} active pilots. {claims_summary}\n"
                f"4. Product Stage: '{startup.product_stage}' - "
                f"{'live product confirmed' if startup.has_live_product else 'not yet in production'}.\n"
                f"5. Screening Tier: {app.automated_screening_tier} "
                f"(fit {app.program_fit_score:.0f}% / strength {app.startup_strength_score:.0f}% "
                f"/ evidence {app.evidence_confidence_score:.0f}%)."
            )

        elif "reject" in query or "risk" in query or "downside" in query or "pass" in query:
            if app.risk_flags:
                risks_text = "\n".join(
                    f"  • {r.get('risk', 'Unknown risk')}: {r.get('evidence', '')} "
                    f"(Severity: {r.get('severity', 'unknown')})"
                    for r in app.risk_flags
                )
            else:
                risks_text = "  • No automated risk flags detected at this stage."
            stage_note = (
                f"\nStage divergence flagged: declared {app.startup_profile.declared_stage.upper()}, "
                f"inferred {app.inferred_stage.upper()}."
                if app.stage_conflict_detected else ""
            )
            answer = (
                f"Rule-based risk summary for {company}:\n\n"
                f"{risks_text}{stage_note}\n\n"
                f"Evidence confidence: {app.evidence_confidence_score:.0f}% - "
                f"{'evidence gaps may increase scrutiny' if app.evidence_confidence_score < 60 else 'evidence levels within acceptable range'}."
            )

        elif any(kw in query for kw in ["contract", "loi", "traction", "customer", "pilot", "revenue"]):
            mrr = float(startup.mrr_usd or 0)
            answer = (
                f"Commercial traction data for {company} (from stored profile):\n\n"
                f"  • Declared LOIs: {startup.loi_count or 0}\n"
                f"  • Active pilots: {startup.pilot_count or 0}\n"
                f"  • Paying customers: {startup.customer_count or 0}\n"
                f"  • Current MRR: ${mrr:,.0f}\n"
                f"  • Revenue status: {startup.revenue_status.replace('_', ' ')}\n"
                f"  • Claim audit: {claims_summary}"
            )

        elif "stage" in query or "infer" in query or "declared" in query:
            answer = (
                f"Stage analysis for {company}:\n\n"
                f"  • Declared: {startup.declared_stage.upper()}\n"
                f"  • Engine-inferred: {app.inferred_stage.upper()} "
                f"(confidence: {getattr(app, 'stage_confidence', 0.91) * 100:.0f}%)\n"
                f"  • Conflict: {'YES - divergence flagged' if app.stage_conflict_detected else 'No conflict detected'}\n"
            )
            try:
                assessment = app.assessment
                if assessment.stage_conflict_explanation:
                    answer += f"  • Explanation: {assessment.stage_conflict_explanation}"
            except Exception:
                pass

        else:
            answer = (
                f"Forensic summary for {company} (rule-based - not model-generated):\n\n"
                f"  • Program Fit: {app.program_fit_score:.0f}%\n"
                f"  • Startup Strength: {app.startup_strength_score:.0f}%\n"
                f"  • Evidence Confidence: {app.evidence_confidence_score:.0f}%\n"
                f"  • Application Completeness: {app.application_completeness_score:.0f}%\n"
                f"  • Screening Tier: {app.automated_screening_tier}\n"
                f"  • Declared Stage: {startup.declared_stage.upper()} | "
                f"Inferred: {app.inferred_stage.upper()} "
                f"{'(Stage Divergence Flagged)' if app.stage_conflict_detected else '(Aligned)'}\n"
                f"  • {claims_summary}\n\n"
                f"Ask a more specific question (e.g. 'why interview?', 'what are the risks?', "
                f"'summarise traction') for a focused breakdown."
            )

        return Response({
            "query": request.data.get("query"),
            "company_name": company,
            "answer": answer,
            # Explicit capability disclosure - frontend uses this to label the source correctly
            "response_type": "rule_based",
            "is_ai_generated": False,
            "generated_at": timezone.now().isoformat(),
        })

    @action(detail=True, methods=["post"], url_path="transition-status")
    def transition_status(self, request, pk=None):
        """Transitions status through the pipeline. Restricted to the program
        team (accelerator role / staff) — investors observe, they don't move
        companies through admissions."""
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() == "accelerator"):
            raise PermissionDenied("Only accelerator managers can change application status.")

        app = self.get_object()
        new_status = request.data.get("status")
        reason = (request.data.get("reason") or "").strip()
        override = bool(request.data.get("override"))
        valid_statuses = [choice[0] for choice in AcceleratorApplication.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response({"error": f"Invalid status: {new_status}"}, status=status.HTTP_400_BAD_REQUEST)
        if new_status == app.status:
            return Response(
                {"error": f"Application is already in stage {new_status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Decision authority: final dispositions (select/reject/waitlist/hold)
        # require a human with standing on THIS application. Prevents any
        # accelerator-role account from deciding foreign applications.
        _assert_decision_authority(user, app, new_status)

        # Workflow OS runtime gate: honour the program's configured stage graph.
        from_status = app.status
        override_applied = False
        allowed, gate_reason = workflow_engine.validate_transition(app.program, from_status, new_status)
        if not allowed:
            # Overrides are a Director act: staff or THIS program's owner.
            # Any override needs a real justification — the audit ledger is
            # the accountability surface, so a blank "reason" is rejected and
            # the server (not the client) stamps the structured prefix.
            is_director = user.is_staff or app.program.created_by_id == getattr(user, "id", None)
            if not (override and is_director):
                return Response(
                    {"error": gate_reason, "from_stage": from_status, "to_stage": new_status},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not reason:
                return Response(
                    {"error": "An override requires a written justification."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            override_applied = True

        if override_applied and not reason.lower().startswith(OVERRIDE_REASON_PREFIX.lower()):
            reason = f"{OVERRIDE_REASON_PREFIX} {reason}".strip()

        app.status = new_status
        if new_status == "SHORTLISTED":
            app.shortlisted_at = timezone.now()
        app.save()

        # Accepting a company must enrol it the same way here as through the
        # Decision Room - one shared implementation, no drift between paths.
        _apply_decision_side_effects(app, new_status)

        # Immutable audit trail for the decision (WHO / WHAT / WHEN / BEFORE / AFTER / WHY).
        _write_transition_audit(app, from_status, new_status, user, reason)

        # Workflow OS: evaluate + log any automations bound to this transition.
        # Best-effort — a dispatch failure must never block the status change.
        try:
            workflows.dispatch_status_change(app.program, new_status, application=app, actor=user)
        except Exception:  # noqa: BLE001
            logger.exception("workflow dispatch failed on transition app_id=%s", app.pk)

        return Response({"status": app.status, "message": f"Updated to {app.status}"})

    @action(detail=True, methods=["get"], url_path="candidate-card")
    def candidate_card(self, request, pk=None):
        """The full committee dossier for one application: every reviewer
        scorecard, unresolved disagreements, interview outcomes, the claim
        ledger and the recorded decisions - assembled from the database by
        DecisionRoom so the drawer shows stored facts, never client guesses."""
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            raise PermissionDenied("Only program team members can open the candidate dossier.")
        app = self.get_object()
        return Response(DecisionRoom(app.program).get_candidate_card(app))

    @action(detail=True, methods=["get"], url_path="interview-guide")
    def interview_guide(self, request, pk=None):
        """Deterministic interview probes for one application.

        Which questions the record justifies is decided here, once, from the
        stored assessment and open claims - so the workspace, the dossier and
        the committee pack all ask the same questions. Styling stays with the
        client; each probe carries a severity, never a CSS class."""
        app = self.get_object()
        return Response(build_interview_guide(app))

    @action(detail=True, methods=["post"], url_path="record-decision")
    def record_decision(self, request, pk=None):
        """Record a committee decision on this application.

        This is a human action and nothing here calls a model: the ML pipeline
        only ever populates the evidence the dossier shows. Authority is the
        same rule as transition-status (shared helper), and the transition is
        executed through the audited pipeline so the stage graph still applies -
        an illegal move comes back as the pipeline's own reason."""
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            raise PermissionDenied("Only accelerator managers and committee members can record decisions.")

        app = self.get_object()
        decision = (request.data.get("decision") or "").strip().upper()
        valid_decisions = [choice[0] for choice in CommitteeDecision.DECISION_CHOICES]
        if decision not in valid_decisions:
            return Response(
                {"error": f"Invalid decision: {decision or '(none given)'}. Must be one of {', '.join(valid_decisions)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rationale = (request.data.get("rationale") or "").strip()
        if not rationale:
            return Response(
                {"error": "A committee decision must state its rationale."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stipulations = request.data.get("stipulations") or []
        if not isinstance(stipulations, list):
            return Response({"error": "stipulations must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        voting_summary = request.data.get("voting_summary") or {}
        if not isinstance(voting_summary, dict):
            return Response({"error": "voting_summary must be an object."}, status=status.HTTP_400_BAD_REQUEST)

        _assert_decision_authority(user, app, decision)

        try:
            record = DecisionRoom(app.program).record_decision(
                application=app,
                decision=decision,
                actor=user,
                rationale=rationale,
                stipulations=stipulations,
                voting_summary=voting_summary,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # The pipeline saved a locked copy of the row; re-read before applying
        # the acceptance side effects so membership sees the committed status.
        app = AcceleratorApplication.objects.select_related("startup_profile", "program").get(pk=app.pk)
        _apply_decision_side_effects(app, decision)

        return Response(CommitteeDecisionSerializer(record).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="allowed-transitions")
    def allowed_transitions(self, request, pk=None):
        """The program's legal next statuses from the application's current
        one, with human labels — so the UI renders only actions the workflow
        engine will actually accept."""
        app = self.get_object()
        workflow_engine.ensure_default_graph(app.program)
        rows = (
            app.program.transitions.select_related("from_stage", "to_stage")
            .filter(from_stage__slug=app.status)
            .order_by("order", "id")
        )
        options = [
            {"status": t.to_stage.slug, "label": (t.label or t.to_stage.name)}
            for t in rows
        ]
        return Response({"current": app.status, "allowed": options})

    @action(detail=True, methods=["get", "post"], url_path="notes")
    def notes(self, request, pk=None):
        """Append-only reviewer notes. Separate rows (not one mutable blob)
        so two reviewers writing at once can never overwrite each other."""
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            raise PermissionDenied("Only program team members can read or write notes.")
        app = self.get_object()
        if request.method == "GET":
            return Response([
                {"id": n.id, "body": n.body, "created_at": n.created_at.isoformat(),
                 "author": _display_name(n.author)}
                for n in app.notes.select_related("author").all()
            ])
        body = (request.data.get("body") or "").strip()
        if not body:
            raise ValidationError({"body": "Note text is required."})
        note = ApplicationNote.objects.create(application=app, author=user, body=body)
        return Response(
            {"id": note.id, "body": note.body, "created_at": note.created_at.isoformat(),
             "author": _display_name(user)},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        """Decision-Room discussion comments. Deliberately NOT reviews: no
        conviction score, excluded from reviewer_count, committee ratings,
        quorum and disagreement detection."""
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() in ["accelerator", "investor"]):
            raise PermissionDenied("Only program team members can read or write comments.")
        app = self.get_object()
        if request.method == "GET":
            return Response([
                {"id": c.id, "body": c.body, "created_at": c.created_at.isoformat(),
                 "author": _display_name(c.author)}
                for c in app.review_comments.select_related("author").all()
            ])
        body = (request.data.get("body") or "").strip()
        if not body:
            raise ValidationError({"body": "Comment text is required."})
        comment = ReviewComment.objects.create(application=app, author=user, body=body)
        return Response(
            {"id": comment.id, "body": comment.body, "created_at": comment.created_at.isoformat(),
             "author": _display_name(user)},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="screening-summary")
    def screening_summary(self, request):
        """Server-side screening aggregates for the WHOLE program (not one
        page of rows). Single source of truth for Command Center stats,
        Review Queue counters, the funnel and Analytics conversion math —
        every attention bucket uses the same predicates here, never a
        re-derived client copy."""
        qs = self.get_queryset()
        now = timezone.now()

        def agg(base, *args, **kw):
            return base.order_by().filter(*args, **kw).count()

        by_status = {
            row["status"]: row["n"]
            for row in qs.order_by().values("status").annotate(n=Count("id"))
        }
        total = qs.order_by().count()
        not_started = by_status.get("DRAFT", 0) + by_status.get("SUBMITTED", 0)
        processed = total - not_started

        active_q = Q(status__in=ACTIVE_FUNNEL_STATUSES)
        priority = agg(qs, active_q, automated_screening_tier="A")
        contradictory = agg(
            qs, active_q, Q(stage_conflict_detected=True) | Q(n_contradicted__gt=0)
        )
        uncertain = agg(
            qs, active_q,
            stage_conflict_detected=False, n_contradicted=0,
            evidence_confidence_score__lt=45,
        )
        missing_evidence = agg(qs, active_q, n_unverified__gte=3)
        holds = agg(
            qs, Q(status__in=["DEFERRED", "WAITLISTED"])
            | Q(active_q, application_completeness_score__lt=40)
        )
        review_queue = agg(qs, active_q)

        # Review-queue lanes come from the same router the row serializer
        # calls (apps.accelerator.queue_routing), which is what keeps the
        # counters, the tab badges and the filtered rows saying one thing.
        queues = {bucket: 0 for bucket in queue_routing.QUEUE_BUCKETS}
        for app in qs.order_by().filter(active_q):
            queues[queue_routing.queue_bucket(queue_routing.signal_fields(app))] += 1

        # "Top Strengths" is the pool's mean score on each Selection Framework
        # dimension the ML engine actually recorded — ranked server-side from
        # stored assessment rows, never re-derived from a page of rows.
        strengths = pool_strength_ladder(
            ApplicationAssessment.objects.filter(application__in=qs)
        )

        def reached(min_rank):
            return sum(
                n for s, n in by_status.items()
                if STATUS_REACHED_RANK.get(s, 0) >= min_rank
            )

        funnel = [
            {"key": "received", "label": "Received", "count": total},
            {"key": "eligibility", "label": "Eligibility Check",
             "count": agg(qs, eligibility_score__gt=0)},
            {"key": "screened", "label": "Screened", "count": reached(2)},
            {"key": "review", "label": "Review / Shortlist", "count": reached(3)},
            {"key": "interview", "label": "Interviews", "count": reached(4)},
            {"key": "committee", "label": "Committee / DD", "count": reached(6)},
            {"key": "selected", "label": "Selected",
             "count": by_status.get("ACCEPTED", 0)},
        ]

        tiers = {
            (row["automated_screening_tier"] or "UNRATED"): row["n"]
            for row in qs.order_by()
            .values("automated_screening_tier").annotate(n=Count("id"))
        }

        def value_counts(values_field, clean=None, limit=10):
            counts: dict[str, int] = {}
            rows = (
                qs.exclude(**{values_field: ""}).order_by()
                .values(values_field).annotate(n=Count("id"))[:3000]
            )
            for row in rows:
                raw = row[values_field] or ""
                key = (clean(raw) if clean else raw) or ""
                if key:
                    counts[key] = counts.get(key, 0) + row["n"]
            top = sorted(counts.items(), key=lambda kv: -kv[1])[:limit]
            other = sum(counts.values()) - sum(n for _, n in top)
            out = [{"name": k, "count": v} for k, v in top]
            if other > 0:
                out.append({"name": "Other", "count": other})
            return out

        first_tag = lambda s: (s or "").split(",")[0].strip().title()
        sectors = value_counts("startup_profile__sector_tags", clean=first_tag)
        countries = value_counts("startup_profile__incorporation_country",
                                 clean=lambda s: (s or "").strip().upper())
        declared_stages = value_counts("startup_profile__declared_stage",
                                       clean=lambda s: (s or "").strip().lower())

        week_new = agg(qs, created_at__gte=now - timedelta(days=7))
        prev_week = agg(
            qs,
            created_at__gte=now - timedelta(days=14),
            created_at__lt=now - timedelta(days=7),
        )

        # Cohort-over-cohort deltas: the same metrics computed for the most
        # recent OTHER program owned by this program's creator. Honest "—"
        # (null) when no baseline program exists — never a fabricated %.
        program_id = request.query_params.get("program_id") or request.query_params.get("program")
        cohort_deltas: dict = {"previous_program": None, "metrics": None}
        if program_id:
            try:
                cur_prog = AcceleratorProgram.objects.get(pk=int(program_id))
            except (AcceleratorProgram.DoesNotExist, TypeError, ValueError):
                cur_prog = None
            if cur_prog is not None:
                prev_prog = (
                    AcceleratorProgram.objects
                    .filter(created_by_id=cur_prog.created_by_id)
                    .exclude(pk=cur_prog.pk)
                    .filter(applications__isnull=False)
                    .distinct()
                    .order_by("-created_at")
                    .first()
                )
                if prev_prog is not None:
                    prev_qs = AcceleratorApplication.objects.filter(program=prev_prog)
                    p_by_status = {
                        row["status"]: row["n"]
                        for row in prev_qs.order_by().values("status").annotate(n=Count("id"))
                    }
                    p_total = prev_qs.order_by().count()
                    p_not_started = p_by_status.get("DRAFT", 0) + p_by_status.get("SUBMITTED", 0)
                    prev_metrics = {
                        "total": p_total,
                        "processed": p_total - p_not_started,
                        "review_queue": prev_qs.order_by().filter(
                            status__in=ACTIVE_FUNNEL_STATUSES
                        ).count(),
                        "interviews": p_by_status.get("INTERVIEW_INVITED", 0)
                        + p_by_status.get("INTERVIEW_COMPLETE", 0),
                        "due_diligence": p_by_status.get("COMMITTEE_REVIEW", 0)
                        + p_by_status.get("EVIDENCE_REQUESTED", 0),
                        "selected": p_by_status.get("ACCEPTED", 0),
                    }
                    cur_metrics = {
                        "total": total,
                        "processed": processed,
                        "review_queue": review_queue,
                        "interviews": by_status.get("INTERVIEW_INVITED", 0)
                        + by_status.get("INTERVIEW_COMPLETE", 0),
                        "due_diligence": by_status.get("COMMITTEE_REVIEW", 0)
                        + by_status.get("EVIDENCE_REQUESTED", 0),
                        "selected": by_status.get("ACCEPTED", 0),
                    }
                    def delta_pct(cur_v: int, prev_v: int):
                        if prev_v <= 0:
                            return None
                        return round((cur_v - prev_v) / prev_v * 100)
                    cohort_deltas = {
                        "previous_program": prev_prog.name,
                        "metrics": {
                            k: delta_pct(cur_metrics[k], prev_metrics[k]) for k in cur_metrics
                        },
                    }

        program_id = request.query_params.get("program_id") or request.query_params.get("program")
        return Response({
            "program_id": positive_int(program_id, "program_id") if program_id else None,
            "total": total,
            "processed": processed,
            "review_queue": review_queue,
            "by_status": by_status,
            "attention": {
                "priority": priority,
                "uncertain": uncertain,
                "contradictory": contradictory,
                "missing_evidence": missing_evidence,
                "holds": holds,
            },
            "queues": queues,
            "strengths": strengths,
            "funnel": funnel,
            "tiers": tiers,
            "sectors": sectors,
            "countries": countries,
            "declared_stages": declared_stages,
            "week_new": week_new,
            "prev_week_new": prev_week,
            "cohort_deltas": cohort_deltas,
            "generated_at": now.isoformat(),
        })

    # Row cap for the eligibility report. Buckets/gate counts always cover the
    # full population; only `rows` is capped, and `truncated` says so loudly.
    ELIGIBILITY_REPORT_CAP = 500

    @action(detail=False, methods=["get"], url_path="eligibility-report")
    def eligibility_report(self, request):
        """The Eligibility & Triage tab's single payload — computed live by
        apps.accelerator.eligibility (the same engine the founder self-check
        uses) against each application's OWN program rules. Buckets are
        mutually exclusive (triage_bucket precedence), the gate-failure list is
        a real ranked Pareto over hard-rule failures, and nothing is derived
        client-side. DRAFT/WITHDRAWN rows are excluded from triage scope and
        reported as such — they are not 'eligible'."""
        qs = self.get_queryset()
        now = timezone.now()

        status_counts = {
            row["status"]: row["n"]
            for row in qs.order_by().values("status").annotate(n=Count("id"))
        }
        total_all = qs.order_by().count()
        excluded = {s: status_counts.get(s, 0) for s in ("DRAFT", "WITHDRAWN") if status_counts.get(s)}
        triage_qs = qs.exclude(status__in=["DRAFT", "WITHDRAWN"]).order_by("-updated_at")
        evaluated_total = triage_qs.count()

        buckets = {"eligible": 0, "needs_verification": 0, "disqualified": 0, "rejected": 0}
        gate_failures: dict[str, dict] = {}
        rows = []
        for app in triage_qs[: self.ELIGIBILITY_REPORT_CAP]:
            result = evaluate_program_eligibility(app.program, facts_from_application(app))
            pending = [
                r["title"] for r in result["breakdown"]
                if r["status"] in ("uncertain", "requires_evidence")
            ]
            failed_reqs = [r for r in result["breakdown"] if r["status"] == "failed"]
            bucket = triage_bucket(
                eligibility_failed=result["requirements_failed"],
                eligibility_uncertain_or_evidence=(
                    result["requirements_uncertain"] + result["requirements_evidence_needed"]
                ),
                status=app.status,
                stage_conflict=app.stage_conflict_detected,
                unverified_claims=getattr(app, "n_unverified", 0) or 0,
                completeness=app.application_completeness_score,
            )
            buckets[bucket] += 1
            if bucket == "disqualified":
                for r in failed_reqs:
                    g = gate_failures.setdefault(
                        r["dimension"],
                        {"dimension": r["dimension"], "title": r["title"], "rule": r["rule"], "count": 0},
                    )
                    g["count"] += 1
            rows.append({
                "application_id": app.id,
                "company_name": app.startup_profile.company_name,
                "status": app.status,
                "tier": app.automated_screening_tier or None,
                "completeness": app.application_completeness_score,
                "program_fit": app.program_fit_score,
                "eligibility": {
                    "percentage": result["eligibility_percentage"],
                    "verdict": result["verdict"],
                    "satisfied": result["requirements_satisfied"],
                    "uncertain": result["requirements_uncertain"],
                    "failed": result["requirements_failed"],
                    "evidence_needed": result["requirements_evidence_needed"],
                    "total": result["total_requirements"],
                },
                "requirements": result["breakdown"],
                "signals": {
                    "stage_conflict": app.stage_conflict_detected,
                    "unverified_claims": getattr(app, "n_unverified", 0) or 0,
                    "pending_dimensions": pending,
                    "failed_dimensions": [r["title"] for r in failed_reqs],
                },
                "bucket": bucket,
            })

        ranked = sorted(gate_failures.values(), key=lambda g: -g["count"])
        disq = max(buckets["disqualified"], 1)
        cumulative = 0
        for g in ranked:
            g["pct_of_disqualified"] = round(g["count"] / disq * 100)
            cumulative += g["count"]
            g["cumulative_pct"] = round(cumulative / disq * 100)

        program_id = request.query_params.get("program_id") or request.query_params.get("program")
        override_qs = ApplicationAuditEvent.objects.filter(
            reason__istartswith=OVERRIDE_REASON_PREFIX
        ).select_related("actor", "application__startup_profile")
        if program_id:
            override_qs = override_qs.filter(
                application__program_id=positive_int(program_id, "program_id"))
        recent_overrides = [
            {
                "application_id": evt.application_id,
                "company_name": evt.application.startup_profile.company_name,
                "from_stage": evt.from_stage,
                "to_stage": evt.to_stage,
                "actor": _display_name(evt.actor),
                "reason": evt.reason,
                "timestamp": evt.timestamp.isoformat(),
            }
            for evt in override_qs.order_by("-timestamp")[:10]
        ]

        return Response({
            "program_id": int(program_id) if program_id else None,
            "scope": {
                "total_applications": total_all,
                "triage_scope": evaluated_total,
                "evaluated": len(rows),
                "excluded": [{"status": s, "count": n} for s, n in excluded.items()],
                "truncated": evaluated_total > len(rows),
            },
            "buckets": buckets,
            "gate_failures": ranked,
            "rows": rows,
            "recent_overrides": recent_overrides,
            "generated_at": now.isoformat(),
        })

    @action(detail=False, methods=["post"], url_path="evaluate-eligibility")
    def evaluate_eligibility(self, request):
        """Persist each application's eligibility result onto its row
        (eligibility_score / breakdown / checked_at) so downstream consumers —
        the funnel's Eligibility Check step, workflow `eligibility_passed`
        automations, decision dossiers — read a stored truth. Same engine as
        the report; re-running is cheap and idempotent."""
        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() == "accelerator"):
            raise PermissionDenied("Only program team members can run eligibility checks.")
        qs = self.get_queryset().exclude(status__in=["DRAFT"])
        evaluated = 0
        for app in qs[: self.ELIGIBILITY_REPORT_CAP]:
            evaluate_application_eligibility(app)
            evaluated += 1
        return Response({"evaluated": evaluated, "generated_at": timezone.now().isoformat()})

    # One click must not lock a request around an unbounded selection.
    BATCH_ANALYZE_CAP = 50

    @action(detail=False, methods=["post"], url_path="batch-analyze")
    def batch_analyze(self, request):
        """Runs automated triage on a set of applications (or a whole program) and
        persists what it computed — screening tier plus the eligibility row —
        through the same ``ApplicationPipeline`` the funnel documents, so the
        consensus tab's ML-screening column stops being a permanently blank readout.

        Triage ranks; it does not decide. An application sitting in SUBMITTED
        moves to SCREENING because that is what a tier means, and every write
        carries an audit row. Nothing here accepts, rejects or advances further.
        """
        from apps.accelerator.pipeline import ApplicationPipeline

        user = request.user
        if not (user.is_staff or getattr(user, "role", "").lower() == "accelerator"):
            raise PermissionDenied("Only program team members can run automated triage.")

        raw_ids = request.data.get("application_ids")
        ids = list(dict.fromkeys(i for i in raw_ids if isinstance(i, int))) if isinstance(raw_ids, list) else []
        program_id = request.data.get("program_id")
        if not ids and not program_id:
            raise ValidationError(
                {"application_ids": "Pass application_ids, or a program_id to screen that program."}
            )
        if program_id:
            program_id = positive_int(program_id, "program_id")

        # get_queryset() carries the tenant rule — an accelerator screens the
        # programs it holds or the ones published for public intake, staff screen
        # anywhere — so an id outside that never reaches the loop below.
        runnable = self.get_queryset().exclude(status__in=["DRAFT", "WITHDRAWN"])

        if ids:
            scoped = runnable.filter(id__in=ids)
            # The denominator is what was asked for. Ids outside the caller's
            # programs, or already withdrawn, vanish from `scoped`, and counting
            # only what survived the filter would report a clean run over a
            # shorter list than was sent.
            requested = len(ids)
        else:
            scoped = runnable.filter(program_id=program_id)
            requested = self.get_queryset().filter(program_id=program_id).count()
        apps = list(scoped[: self.BATCH_ANALYZE_CAP])

        results = []
        for app in apps:
            try:
                tier = ApplicationPipeline(app).run_automated_triage()
                # advance() locks and re-loads its own copy, so the instance we
                # handed it keeps pre-triage values. Report what the row holds now.
                app.refresh_from_db()
            except Exception:  # noqa: BLE001
                logger.exception("automated triage failed app_id=%s", app.pk)
                results.append(
                    {
                        "application_id": app.pk,
                        "ok": False,
                        "company_name": app.startup_profile.company_name,
                        "tier": app.automated_screening_tier or None,
                        "error": "Triage could not complete on this row. Its previous values are unchanged.",
                    }
                )
                continue
            results.append(
                {
                    "application_id": app.pk,
                    "ok": True,
                    "company_name": app.startup_profile.company_name,
                    "tier": tier,
                    "status": app.status,
                    "eligibility_score": app.eligibility_score,
                    "eligibility_checked_at": (
                        app.eligibility_checked_at.isoformat() if app.eligibility_checked_at else None
                    ),
                }
            )

        succeeded = [r for r in results if r["ok"]]
        return Response(
            {
                "results": results,
                "requested": requested,
                "ran": len(results),
                # Rows never reached: dropped by scoping, by DRAFT/WITHDRAWN
                # status, or by the cap — reported so the screen can say
                # "3 of 5 ran" instead of implying it ran all five.
                "not_run": max(0, requested - len(apps)),
                "failed": len(results) - len(succeeded),
                "error": (
                    None
                    if succeeded
                    else "No application could be screened: drafts, withdrawn rows and "
                    "applications outside your programs are skipped."
                ),
                "generated_at": timezone.now().isoformat(),
            },
            status=status.HTTP_200_OK if succeeded else status.HTTP_400_BAD_REQUEST,
        )

    # Row cap for the consensus report — buckets/rollups always cover the full
    # program population, only `rows` is capped, and `truncated` says so.
    CONSENSUS_REPORT_CAP = 500

    @action(detail=False, methods=["get"], url_path="reviewer-consensus-report")
    def reviewer_consensus_report(self, request):
        """The Reviewer Consensus tab's single payload, computed here so the
        browser never re-derives it: which applications still need a human
        scorecard, the human mean per candidate over DEDUPED scorecards (one
        live card per reviewer), whether the ML screening run actually happened
        (blank tier = never run; a real 0 stays a 0), reviewer calibration from
        compute_reviewer_calibration, and open cross-reviewer disagreements with
        the humans named. DRAFT/WITHDRAWN rows are outside review scope and
        reported as excluded — they cannot be scored."""
        qs = self.get_queryset()
        now = timezone.now()
        user = request.user

        status_counts = {
            row["status"]: row["n"]
            for row in qs.order_by().values("status").annotate(n=Count("id"))
        }
        total_all = qs.order_by().count()
        excluded = {s: status_counts.get(s, 0) for s in ("DRAFT", "WITHDRAWN") if status_counts.get(s)}
        scope_qs = qs.exclude(status__in=["DRAFT", "WITHDRAWN"]).order_by("-updated_at")
        in_scope = scope_qs.count()
        apps = list(scope_qs[: self.CONSENSUS_REPORT_CAP])
        app_ids = [a.id for a in apps]

        all_cards = list(
            ReviewerAssessment.objects.filter(application_id__in=app_ids)
            .select_related("reviewer", "application")
            .order_by("submitted_at", "id")
        )
        current = current_scorecards(all_cards)
        cards_by_app: dict[int, list[ReviewerAssessment]] = {}
        for r in current:
            cards_by_app.setdefault(r.application_id, []).append(r)
        mine_by_app = {r.application_id: r for r in current if r.reviewer_id == getattr(user, "id", None)}

        # Who the program has pointed at each application. Kept separate from
        # the cards on purpose: "asked, no scorecard yet" and "nobody was asked"
        # are different facts, and collapsing them is how a queue starts lying.
        assignments_by_app: dict[int, list[ReviewAssignment]] = {}
        for a in (
            ReviewAssignment.objects.filter(application_id__in=app_ids)
            .select_related("reviewer")
            .order_by("round_id", "assigned_at")
        ):
            assignments_by_app.setdefault(a.application_id, []).append(a)

        # Truthful ML state: the screening tier is blank until the engine runs,
        # and the automated audit event carries when it ran.
        ran_at: dict[int, object] = {}
        for evt in (
            ApplicationAuditEvent.objects.filter(application_id__in=app_ids, is_automated=True)
            .order_by("timestamp")
        ):
            ran_at[evt.application_id] = evt.timestamp  # ascending order => last write wins

        disagreement_rows = list(
            ReviewerDisagreementSerializer(
                ReviewerDisagreement.objects.filter(application_id__in=app_ids, resolved=False)
                .select_related("application", "reviewer_a__reviewer", "reviewer_b__reviewer")
                .order_by("-variance_pct"),
                many=True,
            ).data
        )
        open_by_app: dict[int, int] = {}
        for d in disagreement_rows:
            open_by_app[d["application"]] = open_by_app.get(d["application"], 0) + 1

        lanes = {"awaiting_review": 0, "in_review": 0, "decided": 0}
        # Whether a human has been pointed at the application at all — a
        # different question from whether a scorecard exists yet.
        assignment_state = {"assigned": 0, "unassigned": 0}
        ml_state = {"scored": 0, "not_run": 0}
        rows = []
        for app in apps:
            cards = cards_by_app.get(app.id, [])
            convictions = [float(c.overall_conviction) for c in cards if c.overall_conviction is not None]
            avg = round(sum(convictions) / len(convictions), 1) if convictions else None
            spread = round(max(convictions) - min(convictions), 1) if len(convictions) >= 2 else None
            if len(cards) >= 2 and spread is not None and spread >= AGREEMENT_TOLERANCE_POINTS:
                consensus_state = "divergent"
            elif len(cards) >= 2:
                consensus_state = "consensus"
            elif len(cards) == 1:
                consensus_state = "single_reviewer"
            else:
                consensus_state = "none"
            if app.status in DECISION_STATUSES:
                lane = "decided"
            elif not cards:
                lane = "awaiting_review"
            else:
                lane = "in_review"
            lanes[lane] += 1
            screened = bool(app.automated_screening_tier)
            ml_state["scored" if screened else "not_run"] += 1
            recommendations: dict[str, int] = {}
            for c in cards:
                recommendations[c.recommendation] = recommendations.get(c.recommendation, 0) + 1
            my_card = mine_by_app.get(app.id)
            row_assignments = assignments_by_app.get(app.id, [])
            scored_by = {r.reviewer_id for r in cards}
            assignment_state["assigned" if row_assignments else "unassigned"] += 1
            rows.append({
                "application_id": app.id,
                "company_name": app.startup_profile.company_name,
                "status": app.status,
                "sector": app.startup_profile.sector or None,
                "stage": app.startup_profile.declared_stage or app.inferred_stage or None,
                "lane": lane,
                "reviewer_count": len(cards),
                "assignments": [
                    {
                        "id": a.id,
                        "reviewer_id": a.reviewer_id,
                        "reviewer_name": _display_name(a.reviewer),
                        "round_id": a.round_id,
                        "status": a.status,
                        "conflict_status": a.conflict_status,
                        "due_at": a.due_at.isoformat() if a.due_at else None,
                        # Asked vs actually done, decided by whether this human
                        # has a live scorecard on the application.
                        "scorecard_filed": a.reviewer_id in scored_by,
                        # Same server clock and same rule as the seat rows on an
                        # application — overdue is not re-derived per screen.
                        "is_overdue": a.is_overdue(now, a.reviewer_id in scored_by),
                    }
                    for a in row_assignments
                ],
                "human_avg_conviction": avg,
                "human_conviction_spread_points": spread,
                "consensus_state": consensus_state,
                "recommendations": recommendations,
                "open_disagreements": open_by_app.get(app.id, 0),
                "claims": {
                    "total": getattr(app, "n_claims", 0) or 0,
                    "unverified": getattr(app, "n_unverified", 0) or 0,
                    "contradicted": getattr(app, "n_contradicted", 0) or 0,
                },
                "stage_conflict": app.stage_conflict_detected,
                "ml": {
                    "screening_ran": screened,
                    "tier": app.automated_screening_tier or None,
                    "ran_at": ran_at[app.id].isoformat() if app.id in ran_at else None,
                    "program_fit": app.program_fit_score if screened else None,
                    "startup_strength": app.startup_strength_score if screened else None,
                    "evidence_confidence": app.evidence_confidence_score if screened else None,
                    "completeness": app.application_completeness_score if screened else None,
                },
                "aging_days": app.aging_days(now),
                "my_review": {
                    "conviction": my_card.overall_conviction,
                    "recommendation": my_card.recommendation,
                    "submitted_at": my_card.submitted_at.isoformat(),
                } if my_card else None,
            })

        calibration = compute_reviewer_calibration(all_cards)
        convictions_all = [
            float(c.overall_conviction) for c in current if c.overall_conviction is not None
        ]

        return Response({
            "program_id": (
                positive_int(request.query_params.get("program_id")
                             or request.query_params.get("program"), "program_id")
                if (request.query_params.get("program_id") or request.query_params.get("program"))
                else None
            ),
            "scope": {
                "total_applications": total_all,
                "review_scope": in_scope,
                "evaluated": len(rows),
                "excluded": [{"status": s, "count": n} for s, n in excluded.items()],
                "truncated": in_scope > len(rows),
            },
            "rollup": {
                "lanes": lanes,
                "scorecards_recorded": len(current),
                "applications_assigned": assignment_state["assigned"],
                "applications_unassigned": assignment_state["unassigned"],
                "active_reviewers": len(calibration["reviewers"]),
                "avg_human_conviction": (
                    round(sum(convictions_all) / len(convictions_all), 1) if convictions_all else None
                ),
                "open_disagreements": len(disagreement_rows),
                "ml_screened": ml_state["scored"],
                "ml_not_run": ml_state["not_run"],
                "reviewed_applications": calibration["applications_reviewed"],
                "multi_reviewer_applications": calibration["multi_reviewer_applications"],
            },
            "calibration": calibration,
            "disagreements": disagreement_rows,
            "rows": rows,
            "generated_at": now.isoformat(),
        })

    # Dynamic Admissions Engine
    def _run_admissions_engine(self, app: AcceleratorApplication):
        startup = app.startup_profile
        founder = startup.founder_profile

        # 1. Dynamic Stage Inference
        declared = startup.declared_stage
        mrr = float(startup.mrr_usd or 0)
        has_scaling_revenue = startup.revenue_status in ["scaling_revenue", "growing_revenue"] or mrr >= 15000
        has_mvp_only = startup.product_stage in ["idea", "prototype"] and startup.revenue_status == "pre_revenue"

        if has_scaling_revenue:
            inferred = "seed"
        elif has_mvp_only:
            inferred = "idea"
        else:
            inferred = "pre_seed"

        stage_conflict = (declared == "seed" and inferred in ["pre_seed", "idea"]) or (declared == "series_a" and inferred != "series_a")
        app.inferred_stage = inferred
        app.stage_conflict_detected = stage_conflict

        # 2. Dynamic Founder DNA Score (0-100)
        founder_score = 60.0
        if founder.full_time_status:
            founder_score += 12.0
        if founder.previous_companies:
            founder_score += 12.0
        founder_score += min(10.0, founder.technical_capability_score)
        founder_score += min(6.0, founder.business_capability_score * 0.6)
        founder_score = min(98.0, founder_score)

        # 3. Dynamic Product & Technical Execution Score (0-100)
        product_score = 50.0
        stage_bonuses = {"idea": 5.0, "prototype": 12.0, "mvp": 20.0, "pilot": 28.0, "live": 35.0, "scaling": 40.0}
        product_score += stage_bonuses.get(startup.product_stage, 15.0)
        if startup.has_live_product:
            product_score += 8.0
        product_score = min(96.0, product_score)

        # 4. Dynamic Problem & Market Severity Score (0-100)
        problem_score = 75.0
        market_score = 70.0
        if startup.industry:
            problem_score += 8.0
        if startup.geography:
            market_score += 10.0
        problem_score = min(95.0, problem_score)
        market_score = min(95.0, market_score)

        # 5. Dynamic Traction & LOI Score (0-100)
        traction_score = 40.0
        if startup.loi_count > 0:
            traction_score += min(25.0, startup.loi_count * 0.3)
        if startup.pilot_count > 0:
            traction_score += min(20.0, startup.pilot_count * 3.0)
        if startup.customer_count > 0:
            traction_score += min(15.0, startup.customer_count * 0.5)
        traction_score = min(95.0, traction_score)

        # 6. Dynamic Revenue & Unit Economics (0-100)
        if startup.revenue_status == "pre_revenue":
            # For pre-revenue, evaluate LOI pull and pilot conversion intent
            revenue_score = 35.0 + min(25.0, (startup.loi_count or 0) * 0.25)
        else:
            revenue_score = 65.0 + min(30.0, (mrr / 500.0))
        revenue_score = min(95.0, revenue_score)

        # 7. Defensibility & Team (0-100)
        team_score = 65.0
        if founder.cofounders:
            team_score += 15.0
        if startup.incorporated:
            team_score += 10.0
        team_score = min(95.0, team_score)

        # Composite Startup Strength
        strength = round((founder_score * 0.25) + (product_score * 0.20) + (traction_score * 0.25) + (revenue_score * 0.15) + (team_score * 0.15), 1)

        # Dynamic Program Fit
        fit = 75.0
        if app.program.stage_focus in ["any", inferred]:
            fit += 12.0
        if any(s in (startup.sector_tags or "").lower() for s in (app.program.sector_focus or "").lower().split(",")):
            fit += 8.0
        fit = min(98.0, fit)

        # Dynamic Evidence Confidence
        doc_count = app.documents.count()
        claims_count = app.claims.count()
        evidence_conf = 55.0 + min(20.0, doc_count * 8.0) + min(15.0, claims_count * 5.0)
        evidence_conf = min(95.0, evidence_conf)

        app.founder_score = founder_score
        app.startup_strength_score = strength
        app.program_fit_score = fit
        app.evidence_confidence_score = evidence_conf
        completeness_signals = [
            bool(startup.company_name), bool(startup.product_description), bool(startup.sector_tags),
            bool(startup.geography), bool(startup.website), bool(startup.business_model),
            bool(startup.customer_description), (startup.employee_count or 0) > 0,
            bool(founder.linkedin), bool(founder.previous_companies),
            doc_count > 0, bool(startup.pitch_deck_url),
        ]
        app.application_completeness_score = round(_signal_support(completeness_signals) * 100.0, 1)

        # Tier assignment
        if fit >= 85 and strength >= 75 and evidence_conf >= 70:
            app.automated_screening_tier = "A"
        elif strength >= 65:
            app.automated_screening_tier = "B"
        elif evidence_conf < 50:
            app.automated_screening_tier = "C"
        else:
            app.automated_screening_tier = "D"

        # Risk detection — every flag below is a deterministic rule that fired
        # on observed fields, so its confidence is 1.0 (certainty of the check),
        # not a model probability.
        risks = []
        if stage_conflict:
            risks.append({
                "risk": "Declared vs Inferred Stage Mismatch",
                "severity": "medium",
                "confidence": 1.0,
                "basis": "deterministic rule",
                "evidence": f"Declared: {declared.upper()}, but commercial traction metrics align with {inferred.upper()}.",
                "mitigation": "Align round sizing and valuation expectations during partner screening.",
            })
        if startup.revenue_status == "pre_revenue":
            risks.append({
                "risk": "Pre-Revenue Commercialization Velocity",
                "severity": "low",
                "confidence": 1.0,
                "basis": "deterministic rule",
                "evidence": f"{startup.loi_count} LOIs recorded; requires conversion validation into active commercial annual recurring revenue.",
                "mitigation": "Focus first 4 cohort weeks on structured pilot conversions.",
            })
        if not startup.incorporated:
            risks.append({
                "risk": "Unincorporated Legal Entity",
                "severity": "low",
                "confidence": 1.0,
                "basis": "deterministic rule",
                "evidence": "Startup is not yet incorporated in primary jurisdiction.",
                "mitigation": "Incorporate Delaware flip or local holding entity prior to batch funding tranche.",
            })
        app.risk_flags = risks

        # Create/Update Assessment
        # Per-dimension "confidence" is data coverage of the inputs each rule
        # scored on (signal support), never a model probability.
        founder_support = _signal_support([
            bool(founder.linkedin), bool(founder.education or founder.employment),
            bool(founder.previous_companies), bool(founder.cofounders),
            (founder.technical_capability_score or 0) > 0,
            (founder.business_capability_score or 0) > 0,
        ])
        problem_support = _signal_support([
            bool(startup.product_description), bool(startup.industry),
            bool(startup.customer_description), bool(startup.geography),
        ])
        product_support = _signal_support([
            bool(startup.product_stage), startup.has_live_product,
            bool(startup.website), bool(startup.pitch_deck_url),
        ])
        market_support = _signal_support([
            bool(startup.geography), bool(startup.incorporation_country),
            bool(startup.business_model), bool(startup.customer_description),
        ])
        traction_support = _signal_support([
            (startup.loi_count or 0) > 0, (startup.pilot_count or 0) > 0,
            (startup.customer_count or 0) > 0, (startup.monthly_active_users or 0) > 0,
            startup.founded_date is not None,
        ])
        revenue_support = _signal_support([
            bool(startup.revenue_status), mrr > 0 or float(startup.arr_usd or 0) > 0,
            float(startup.gross_margin_pct or 0) > 0, bool(startup.financial_model_url),
        ])
        team_support = _signal_support([
            bool(founder.cofounders), (startup.employee_count or 0) > 0,
            startup.incorporated, float(startup.total_funding_raised_usd or 0) > 0,
        ])
        stage_support = _signal_support([
            bool(declared), bool(startup.revenue_status), bool(startup.product_stage),
            mrr > 0 or (startup.loi_count or 0) > 0 or (startup.pilot_count or 0) > 0
            or (startup.customer_count or 0) > 0,
        ])

        assessment, _ = ApplicationAssessment.objects.get_or_create(application=app)
        assessment.founder_score = founder_score
        assessment.founder_confidence = founder_support
        assessment.problem_score = problem_score
        assessment.problem_confidence = problem_support
        assessment.product_score = product_score
        assessment.product_confidence = product_support
        assessment.market_score = market_score
        assessment.market_confidence = market_support
        assessment.traction_score = traction_score
        assessment.traction_confidence = traction_support
        assessment.revenue_score = revenue_score
        assessment.revenue_confidence = revenue_support
        assessment.team_score = team_score
        assessment.team_confidence = team_support

        assessment.declared_stage = declared
        assessment.inferred_stage = inferred
        assessment.stage_confidence = stage_support
        assessment.stage_conflict = stage_conflict
        assessment.stage_conflict_explanation = (
            f"Founder declared {declared}, but traction metrics align with pilot-stage {inferred}."
            if stage_conflict else ""
        )

        assessment.overall_program_fit = fit
        assessment.startup_strength = strength
        assessment.evidence_confidence = evidence_conf
        assessment.application_completeness = app.application_completeness_score

        bull: list[dict[str, str]] = []
        if (founder.technical_capability_score or 0) >= 7:
            bull.append({"point": f"Founder-reported technical capability {founder.technical_capability_score}/10 (self-assessed, not verified).", "strength": "Medium"})
        if founder.previous_companies:
            bull.append({"point": f"{len(founder.previous_companies)} previous founder compan{'ies' if len(founder.previous_companies) > 1 else 'y'} listed.", "strength": "Medium"})
        if (startup.pilot_count or 0) > 0:
            bull.append({"point": f"{startup.pilot_count} pilots recorded in the application.", "strength": "High"})
        elif (startup.loi_count or 0) > 0:
            bull.append({"point": f"{startup.loi_count} LOIs recorded (founder-reported, unverified).", "strength": "Medium"})
        if mrr > 0:
            bull.append({"point": f"Reported MRR of ${mrr:,.0f}.", "strength": "High"})
        if fit >= 85:
            bull.append({"point": f"Declared stage and sector align with {app.program.name}'s focus.", "strength": "Medium"})
        if not bull:
            bull.append({"point": "No data-supported strength signals at submission; treat every claim as an open question in review.", "strength": "Low"})

        bear: list[dict[str, str]] = []
        if startup.revenue_status == "pre_revenue":
            bear.append({"point": "No revenue reported; commercial validation rests on founder-asserted figures.", "strength": "Medium"})
        if not startup.incorporated:
            bear.append({"point": "Legal entity not yet incorporated.", "strength": "Medium"})
        if doc_count == 0:
            bear.append({"point": "No supporting documents uploaded; claims are unverified.", "strength": "High"})
        if stage_conflict:
            bear.append({"point": f"Declared stage ({declared}) conflicts with rule-inferred stage ({inferred}).", "strength": "Medium"})
        if not bear:
            bear.append({"point": "No rule-detected red flags; absence of flags is not evidence of quality.", "strength": "Low"})

        assessment.bull_case = bull
        assessment.bear_case = bear
        assessment.risk_flags = risks

        supports = [founder_support, problem_support, product_support, market_support,
                    traction_support, revenue_support, team_support]
        rec_confidence = round(sum(supports) / len(supports), 2)
        assessment.recommendation_confidence = rec_confidence
        if app.automated_screening_tier in ["A", "B"]:
            assessment.overall_recommendation = "INTERVIEW"
            assessment.recommendation_reasoning = (
                f"Rule screening scored fit {fit:.0f}/100 and strength {strength:.0f}/100 on "
                f"{rec_confidence:.0%} input coverage. Advisory only — a human reviewer decides."
            )
        else:
            assessment.overall_recommendation = "REQUEST_EVIDENCE"
            assessment.recommendation_reasoning = (
                f"Input coverage {rec_confidence:.0%} and evidence confidence {evidence_conf:.0f}/100 sit below the "
                f"advance threshold. Advisory only — request evidence before any disposition."
            )
        assessment.save()

    def _ensure_assessment_and_questions(self, app):
        ApplicationAssessment.objects.get_or_create(application=app)


# ──────────────────────────────────────────────────────────────────────────────
# 5. Reviewer Workspace & Multi-Reviewer Scoring
# ──────────────────────────────────────────────────────────────────────────────

class ReviewerAssessmentViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = ReviewerAssessmentSerializer
    permission_classes = [IsAcceleratorOrStaff]
    # A scorecard is work done inside a program, so the write rule is the one a
    # reviewer needs — visible to them — not ownership of the pipeline.
    program_source = "application__program"
    program_write_rule = "visible"
    ordering = ["-submitted_at", "id"]  # stable pages — the model has no default ordering

    def get_queryset(self):
        return scope_rows_to_visible_programs(
            ReviewerAssessment.objects.select_related("application", "reviewer"),
            self.request, "application__program",
        )

    def list(self, request, *args, **kwargs):
        _require_review_scope(request)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        app = serializer.validated_data.get("application")
        if app is not None and app.status in ("DRAFT", "WITHDRAWN"):
            raise ValidationError(
                f"Cannot record a scorecard on a {app.status} application — there is "
                "no submitted application to review."
            )
        user = self.request.user
        # One live scorecard per human per application: re-submitting EDITS the
        # existing row instead of adding a second ballot for the same person.
        existing = ReviewerAssessment.objects.filter(application=app, reviewer=user).first()
        if existing is not None:
            serializer.validated_data.pop("application", None)
            # Pointing `instance` at the live row makes DRF's save() take the
            # update() path instead of inserting a second ballot.
            serializer.instance = existing
            review = serializer.save()
            self._detect_disagreements(review.application)
            return
        review = serializer.save(reviewer=user)
        self._detect_disagreements(review.application)

    def _detect_disagreements(self, application):
        """Flag every cross-reviewer dimension gap >= the tolerance, over all
        reviewer pairs on this application — not just the first two rows of an
        unordered queryset. Re-running it after an edit is idempotent because
        each row is keyed on (application, dimension, pair)."""
        current = current_scorecards(
            application.reviewer_assessments.select_related("reviewer").order_by("submitted_at", "id")
        )
        if len(current) < 2:
            return
        for i in range(len(current)):
            for j in range(i + 1, len(current)):
                r1, r2 = current[i], current[j]
                for dim in REVIEW_DIMENSIONS:
                    val1, val2 = getattr(r1, dim), getattr(r2, dim)
                    if val1 is None or val2 is None:
                        continue
                    diff = abs(float(val1) - float(val2))
                    if diff < AGREEMENT_TOLERANCE_POINTS:
                        continue
                    ReviewerDisagreement.objects.get_or_create(
                        application=application,
                        dimension=dim.replace("_score", "").title(),
                        reviewer_a=r1,
                        reviewer_b=r2,
                        defaults={
                            # variance_pct is the 1-10 gap expressed as a
                            # percentage of the scale: 3 points => 30.
                            "variance_pct": round(diff * 10),
                            "resolution_notes": (
                                f"{_display_name(r1.reviewer)} scored {val1:g}; "
                                f"{_display_name(r2.reviewer)} scored {val2:g} "
                                f"on {dim.replace('_score', '')} (gap {diff:g} points of a 1-10 scale)."
                            ),
                        },
                    )

    @action(detail=False, methods=["get"])
    def calibration(self, request):
        """Reviewer calibration computed from real scorecards only — see
        compute_reviewer_calibration for the single shared implementation.
        Scoped like the ledger itself: an unscoped cohort is the whole database,
        which is nobody's program."""
        _require_review_scope(request)
        return Response(compute_reviewer_calibration(self.get_queryset()))

    @action(detail=False, methods=["get"], url_path="my-calibration")
    def my_calibration(self, request):
        """The requesting reviewer's scoring behavior vs other reviewers on shared applications."""
        mine = list(self.get_queryset().filter(reviewer=request.user))
        by_app: dict[int, list[ReviewerAssessment]] = {}
        for r in mine:
            by_app.setdefault(r.application_id, []).append(r)

        compared = agreed = 0
        deltas: list[float] = []
        for app_id in by_app:
            others = list(
                ReviewerAssessment.objects.filter(application_id=app_id)
                .exclude(reviewer=request.user).order_by("submitted_at", "id")
            )
            if not others:
                continue
            for r in by_app[app_id]:
                for dim in REVIEW_DIMENSIONS:
                    v = getattr(r, dim)
                    vals = [float(getattr(o, dim)) for o in others if getattr(o, dim) is not None]
                    if v is None or not vals:
                        continue
                    compared += 1
                    cohort_mean = sum(vals) / len(vals)
                    deltas.append(float(v) - cohort_mean)
                    if abs(float(v) - cohort_mean) < AGREEMENT_TOLERANCE_POINTS:
                        agreed += 1

        return Response({
            "reviews_submitted": len(mine),
            "applications_reviewed": len(by_app),
            "comparable_dimension_scores": compared,
            "agreement_with_cohort_pct": round(agreed / compared * 100, 1) if compared else None,
            "mean_bias_points": round(sum(deltas) / len(deltas), 2) if deltas else None,
            "bias_note": (
                "Positive mean_bias_points means you score higher than other reviewers on the same applications (1-10 scale)."
                if deltas else "Not enough overlapping reviews to compute bias."
            ),
        })


ASSIGNMENT_OPEN_STATUSES = ("pending", "in_progress")


class ReviewAssignmentViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """Who a program asked to review an application, and by when.

    An attention/ownership record, not a gate and not a verdict: an assignment
    does not stop any other human on the program team from filing a scorecard,
    and an assignment with no scorecard behind it stays visible as exactly that
    — asked, not done. The scorecard remains the only proof a review happened.

    Staff-only on purpose: reviewer identity is not disclosed to founders on the
    scorecard endpoints, so it must not leak out of this one either.
    """

    serializer_class = ReviewAssignmentSerializer
    permission_classes = [IsAcceleratorOrStaff]
    program_source = "application__program"
    program_write_rule = "visible"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = scope_rows_to_visible_programs(
            ReviewAssignment.objects.select_related(
                "application__startup_profile", "reviewer", "assigned_by"
            ).annotate(
                # Did this reviewer actually file the scorecard yet? Answered by
                # one subquery over the whole page instead of one per row.
                scorecard_filed=Exists(
                    ReviewerAssessment.objects.filter(
                        application_id=OuterRef("application_id"),
                        reviewer_id=OuterRef("reviewer_id"),
                    )
                )
            ),
            self.request, "application__program",
        )
        qp = self.request.query_params
        reviewer = qp.get("reviewer")
        if reviewer:
            qs = qs.filter(reviewer_id=positive_int(reviewer, "reviewer"))
        statuses = qp.get("assignment_status")
        if statuses:
            qs = qs.filter(status__in=[s.strip().lower() for s in statuses.split(",") if s.strip()])
        return qs.order_by("application_id", "round_id", "assigned_at")

    def list(self, request, *args, **kwargs):
        _require_review_scope(request)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        app = serializer.validated_data.get("application")
        if app is not None and app.status in ("DRAFT", "WITHDRAWN"):
            raise ValidationError(
                {"application": f"Cannot assign a reviewer to a {app.status} application — "
                                "there is no submitted application to review."}
            )
        try:
            assignment = serializer.save(assigned_by=self.request.user)
        except IntegrityError:
            # The (reviewer, application, round) unique pair is the database's
            # rule; two coordinators clicking at once must produce a clear 400,
            # not a 500.
            raise ValidationError(
                {"reviewer": "That reviewer is already assigned to this round of this application."}
            )
        _write_assignment_audit(
            assignment.application, self.request.user, "reviewer_assigned",
            f"Reviewer assigned: {_display_name(assignment.reviewer)} "
            f"({assignment.round_id}{'' if not assignment.due_at else f', due {assignment.due_at:%Y-%m-%d}'})",
        )

    def perform_update(self, serializer):
        was_conflict = serializer.instance.conflict_status
        assignment = serializer.save()
        if assignment.conflict_status != was_conflict:
            # A recusal is a governance event — who stepped off a review, and
            # when, belongs in the ledger next to who was put on it.
            _write_assignment_audit(
                assignment.application, self.request.user, "reviewer_conflict_update",
                f"Conflict status for {_display_name(assignment.reviewer)} "
                f"({assignment.round_id}): {was_conflict} → {assignment.conflict_status}",
            )

    def perform_destroy(self, instance):
        user = self.request.user
        may_remove = (
            user.is_staff
            or instance.assigned_by_id == user.id
            or instance.reviewer_id == user.id
            or instance.application.program.created_by_id == user.id
        )
        if not may_remove:
            raise PermissionDenied(
                "Only the person who assigned this, the assigned reviewer, or the "
                "program owner can remove an assignment."
            )
        app, label, round_id = instance.application, _display_name(instance.reviewer), instance.round_id
        instance.delete()
        _write_assignment_audit(
            app, user, "reviewer_unassigned",
            f"Reviewer unassigned: {label} ({round_id})",
        )

    @action(detail=False, methods=["get"], url_path="candidates")
    def candidates(self, request):
        """People this program may put on a review, with their current load.

        The pool is the platform's program-team eligibility rule — the same one
        `ReviewAssignmentSerializer` applies when a seat is saved (role, staff,
        or an active `ReviewerProfile`). It is deliberately not described as
        "this program's team": there is no membership row that gates who may
        review, so filtering by one would hide people the write path accepts.
        `on_program_team` is the honest version of that distinction — whether
        this person holds a staff seat in the program being asked about.

        Load is counted here rather than guessed in the browser so the picker
        can show "already on 4 open reviews" and spread work instead of piling
        it onto whoever was spoken to last. `scorecards_filed` is what this
        person has actually completed — an empty reviewer profile is not a
        review, so the two columns stay separate.

        `open_diligence` rides along because the diligence owner picker asks the
        same question ("who already has a stack?") about a different kind of
        work. One endpoint, one load picture per person.

        `?q=` narrows by name or email and `?limit=` bounds the page, both
        server-side: a program with 400 reviewers is not served as 400 rows to
        be filtered in the browser.
        """
        # `_program_id_for` is what proves the caller works in the program it
        # returns, so every number below is counted for a tenant they hold.
        program_id = _program_id_for(request)
        if not program_id:
            raise ValidationError(
                {"program_id": "program_id (or application_id) is required to list candidates."}
            )
        profiles = {
            p.user_id: p
            for p in ReviewerProfile.objects.filter(is_active=True)
        }
        people = (
            User.objects.filter(
                Q(role__in=["accelerator", "investor"])
                | Q(is_staff=True)
                | Q(reviewer_profile__isnull=False)
            )
            .annotate(
                on_program_team=Exists(
                    ProgramStaffMembership.objects.filter(
                        program_id=program_id, user=OuterRef("pk")
                    )
                ),
                open_assignments=Count(
                    "review_assignments", distinct=True,
                    filter=Q(
                        review_assignments__application__program_id=program_id,
                        review_assignments__status__in=list(ASSIGNMENT_OPEN_STATUSES),
                    ),
                ),
                completed_assignments=Count(
                    "review_assignments", distinct=True,
                    filter=Q(
                        review_assignments__application__program_id=program_id,
                        review_assignments__status="completed",
                    ),
                ),
                scorecards_filed=Count(
                    "reviewed_applications", distinct=True,
                    filter=Q(reviewed_applications__application__program_id=program_id),
                ),
                # Diligence questions on this person's desk. Counted in the same
                # query as review load so one picker can show both instead of
                # the browser joining two sources into a third number.
                open_diligence=Count(
                    "owned_diligence_items", distinct=True,
                    filter=Q(
                        owned_diligence_items__application__program_id=program_id,
                        owned_diligence_items__status__in=list(DiligenceItem.OPEN_STATUSES),
                    ),
                ),
            )
            .order_by("first_name", "last_name", "email")
        )
        # When the picker is opened from one application, say whose seats are
        # already taken — "asked, and holding a seat on this round" is a fact
        # the coordinator is looking at, not a filter that hides them.
        application_id = request.query_params.get("application_id")
        if application_id:
            people = people.annotate(
                already_asked=Exists(
                    ReviewAssignment.objects.filter(
                        application_id=application_id, reviewer=OuterRef("pk")
                    )
                )
            )
        q = (request.query_params.get("q") or "").strip()
        if q:
            people = people.filter(
                Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q)
            )
        try:
            limit = max(1, min(200, int(request.query_params.get("limit") or 50)))
        except (TypeError, ValueError):
            raise ValidationError({"limit": "limit must be an integer between 1 and 200."})
        total = people.count()
        rows = []
        for u in people[:limit]:
            profile = profiles.get(u.id)
            capacity = profile.max_active_reviews if profile else None
            rows.append({
                "id": u.id,
                "name": _display_name(u),
                "email": u.email,
                "role": getattr(u, "role", "") or "",
                "on_program_team": u.on_program_team,
                "already_asked": bool(getattr(u, "already_asked", False)),
                "open_assignments": u.open_assignments,
                "completed_assignments": u.completed_assignments,
                "scorecards_filed": u.scorecards_filed,
                "open_diligence": u.open_diligence,
                "max_active_reviews": capacity,
                # Honest capacity note only when the person has a stated limit;
                # no profile is unknown capacity, not unlimited capacity.
                "at_capacity": bool(capacity is not None and u.open_assignments >= capacity),
            })
        return Response({
            "program_id": int(program_id),
            "candidates": rows,
            "total_matching": total,
            "returned": len(rows),
            "limit": limit,
        })


class ReviewerDisagreementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ReviewerDisagreementSerializer
    permission_classes = [IsAcceleratorOrStaff]
    ordering = ["-variance_pct", "id"]

    def get_queryset(self):
        return scope_rows_to_visible_programs(
            ReviewerDisagreement.objects.select_related(
                "application", "reviewer_a__reviewer", "reviewer_b__reviewer"
            ),
            self.request, "application__program",
        )

    def list(self, request, *args, **kwargs):
        _require_review_scope(request)
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        """Close a flagged variance. ML flags the gap; only a human can say it
        has been discussed. Requires a note, and records who closed it — the
        disagreement row itself is never edited beyond these two fields."""
        notes = (request.data.get("resolution_notes") or "").strip()
        if not notes:
            raise ValidationError({"resolution_notes": "Explain how the disagreement was resolved."})
        disagreement = self.get_object()
        disagreement.resolved = True
        prior = (disagreement.resolution_notes or "").strip()
        disagreement.resolution_notes = (
            f"{prior}\nResolved by {_display_name(request.user)}: {notes}".strip()
        )
        disagreement.save(update_fields=["resolved", "resolution_notes"])
        return Response(self.get_serializer(disagreement).data)


# ──────────────────────────────────────────────────────────────────────────────
# 5d. Due diligence items — who owns which open question, and by when
# ──────────────────────────────────────────────────────────────────────────────

class DiligenceItemViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """The diligence questions a program is chasing, with a named owner and a
    date.

    An ownership record, not a verdict: closing an item writes down that a human
    checked something and what they found. It does not accept or reject anyone —
    the committee reads the note and decides for itself.

    Staff-only: like reviewer identity, an owner's name is not something to
    disclose to founders through a side endpoint.
    """

    serializer_class = DiligenceItemSerializer
    permission_classes = [IsAcceleratorOrStaff]
    program_source = "application__program"
    program_write_rule = "visible"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = scope_rows_to_visible_programs(
            DiligenceItem.objects.select_related(
                "application__startup_profile", "owner", "created_by"
            ),
            self.request, "application__program",
        )
        qp = self.request.query_params
        owner = qp.get("owner")
        if owner:
            if owner in ("none", "unassigned"):
                # "Who has nobody on it" is a question a program coordinator
                # actually asks, and it is not expressible with a plain id.
                qs = qs.filter(owner__isnull=True)
            else:
                qs = qs.filter(owner_id=positive_int(owner, "owner"))
        statuses = qp.get("item_status")
        if statuses:
            qs = qs.filter(status__in=[s.strip().lower() for s in statuses.split(",") if s.strip()])
        if qp.get("overdue") in ("1", "true", "True"):
            # Filtered by the model's own rule: the shared status set, and a
            # deadline the clock has actually passed. No due date is never
            # overdue.
            qs = qs.filter(status__in=list(DiligenceItem.OPEN_STATUSES),
                           due_at__lt=timezone.now())
        return qs.order_by("application_id", "created_at", "id")

    def list(self, request, *args, **kwargs):
        _require_diligence_scope(request)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        app = serializer.validated_data.get("application")
        if app is not None and app.status in ("DRAFT", "WITHDRAWN"):
            raise ValidationError(
                {"application": f"Cannot open a diligence question on a {app.status} "
                                "application — there is nothing under review."}
            )
        item = serializer.save(created_by=self.request.user)
        _write_assignment_audit(
            item.application, self.request.user, "diligence_item_opened",
            f"Diligence question opened: {item.question[:80]}"
            f"{'' if item.owner_id is None else f' — owner {_display_name(item.owner)}'}"
            f"{'' if not item.due_at else f', due {item.due_at:%Y-%m-%d}'}",
        )

    def perform_update(self, serializer):
        was_status = serializer.instance.status
        was_owner = serializer.instance.owner
        was_owner_id = was_owner.id if was_owner else None
        was_owner_name = _display_name(was_owner) if was_owner else "nobody"
        # Closing and re-opening are the server's business: a client that PATCHes
        # status='resolved' must not leave resolved_at null, and re-opening must
        # not leave a stale close date sitting on an open question.
        new_status = serializer.validated_data.get("status", was_status)
        if new_status == "resolved" and was_status != "resolved":
            serializer.save(resolved_at=timezone.now())
        elif new_status != "resolved" and was_status == "resolved":
            serializer.save(resolved_at=None)
        else:
            serializer.save()
        item = serializer.instance
        if was_status != "resolved" and item.status == "resolved":
            _write_assignment_audit(
                item.application, self.request.user, "diligence_item_resolved",
                f"Diligence question closed: {item.question[:80]} — "
                f"{(item.resolution_note or 'no note recorded').strip()[:160]}",
            )
        elif (item.owner_id or None) != (was_owner_id or None):
            _write_assignment_audit(
                item.application, self.request.user, "diligence_item_reassigned",
                f"Diligence question reassigned: {item.question[:80]} — {was_owner_name} → "
                f"{'nobody' if item.owner is None else _display_name(item.owner)}",
            )

    @action(detail=False, methods=["get"])
    def rollup(self, request):
        """Program-level diligence numbers, computed here rather than tallied in
        the browser.

        Coverage, not a gate: `applications_uncovered` counts submitted
        applications with no diligence question written down at all. That is not
        evidence they need none — it is the board telling you nobody has looked
        yet.
        """
        _require_diligence_scope(request)
        qs = self.get_queryset()
        now = timezone.now()
        items = list(qs)
        open_items = [i for i in items if i.status in DiligenceItem.OPEN_STATUSES]
        overdue = [i for i in open_items if i.is_overdue(now)]
        due = [i.due_at for i in open_items if i.due_at is not None]

        by_owner: dict[int | None, dict] = {}
        for i in open_items:
            key = i.owner_id
            row = by_owner.setdefault(key, {
                "owner_id": key,
                "owner_name": i.owner.full_name if i.owner else None,
                "open": 0,
                "overdue": 0,
            })
            row["open"] += 1
            if i.is_overdue(now):
                row["overdue"] += 1
        owners = sorted(by_owner.values(),
                        key=lambda r: (-r["overdue"], -r["open"], r["owner_name"] or ""))

        covered = {i.application_id for i in items}
        # Same review scope the consensus report uses: DRAFT and WITHDRAWN rows
        # are not under diligence, so they cannot count as "uncovered".
        #
        # The denominator is the program the caller named, and `_program_id_for`
        # is what proves they may name it. Filtering a scoped queryset instead
        # would answer an unfamiliar program with zeros, and "0 applications, 0
        # of them uncovered" is a claim about a pipeline the caller cannot read
        # — withheld has to look like withheld, not like nothing.
        program_id = _program_id_for(request)
        all_app_ids = set(
            AcceleratorApplication.objects.exclude(status__in=["DRAFT", "WITHDRAWN"])
            .filter(program_id=program_id).values_list("id", flat=True)
        )

        return Response({
            "program_id": program_id,
            "as_of": now.isoformat(),
            "items": len(items),
            "open": len(open_items),
            "overdue": len(overdue),
            "unowned_open": sum(1 for i in open_items if i.owner_id is None),
            "undated_open": sum(1 for i in open_items if i.due_at is None),
            "resolved": sum(1 for i in items if i.status == "resolved"),
            "blocked": sum(1 for i in items if i.status == "blocked"),
            "by_status": {code: sum(1 for i in items if i.status == code)
                          for code, _label in DiligenceItem.STATUS_CHOICES},
            "next_due_at": min(due).isoformat() if due else None,
            # Days past the earliest missed deadline, or null when nothing has
            # slipped — "how bad is it" with no invented zero.
            "oldest_overdue_days": (
                max(0, (now - min(i.due_at for i in overdue)).days) if overdue else None
            ),
            "by_owner": owners,
            "applications_covered": len(covered & all_app_ids),
            "applications_uncovered": len(all_app_ids - covered),
        })


# ──────────────────────────────────────────────────────────────────────────────
# 6. Interview Sessions & Intelligence
# ──────────────────────────────────────────────────────────────────────────────

class InterviewSessionViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """The interview calendar and its transcript.

    A founder sees the sessions on their own application; a program-team
    account sees the sessions inside the programs it works in. Completing a
    session is a program-team act — it moves the application's status, and a
    founder must not be able to advance their own pipeline through a side
    endpoint.
    """

    serializer_class = InterviewSessionSerializer
    permission_classes = [IsAuthenticated]
    program_source = "application__program"
    program_write_rule = "visible"

    def get_queryset(self):
        return scope_application_rows(InterviewSession.objects.all(), self.request)

    def perform_create(self, serializer):
        serializer.save(interviewer=self.request.user if not self.request.data.get("is_ai") else None)

    @action(detail=True, methods=["post"], url_path="complete",
            permission_classes=[IsAcceleratorOrStaff])
    def complete_interview(self, request, pk=None):
        interview = self.get_object()
        interview.status = "complete"
        interview.completed_at = timezone.now()
        interview.save(update_fields=["status", "completed_at"])

        interview.application.status = "INTERVIEW_COMPLETE"
        interview.application.save(update_fields=["status"])

        return Response(InterviewSessionSerializer(
            interview, context={"request": request}).data)

    # ── Transcript capture ───────────────────────────────────────────────────
    # Writing a transcript down is a staff act: it records what a founder said,
    # so the founder's own endpoint must not be the way it gets written. Both
    # actions below are therefore gated past the viewset's owner-scoped read
    # permissions.

    @action(detail=True, methods=["post"], url_path="transcript",
            permission_classes=[IsAcceleratorOrStaff])
    def capture_transcript(self, request, pk=None):
        """Append what was said to this session's transcript.

        ``{"turns": [{"speaker": "founder", "text": "…"}]}``

        Append-only, and the server owns the timestamp and the recorder. A
        reviewer pasting a transcript in later is a different fact from the
        words being spoken then, and the row keeps both.
        """
        session = self.get_object()
        raw = request.data.get("turns")
        if not isinstance(raw, list) or not raw:
            return Response(
                {"turns": "Send a non-empty list of {speaker, text} turns."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(raw) > 100:
            return Response(
                {"turns": "That is a lot of turns for one write — send 100 or fewer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed = set(InterviewSession.TRANSCRIPT_SPEAKERS)
        turns = []
        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                return Response(
                    {f"turns.{index}": "Each turn must be an object with speaker and text."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            speaker = str(item.get("speaker") or "").strip().lower()
            if speaker not in allowed:
                return Response(
                    {f"turns.{index}.speaker":
                     f"Unknown speaker {speaker or '(blank)'!r}. "
                     f"Who said it is the point — pick one of {', '.join(sorted(allowed))}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            text = str(item.get("text") or "").strip()
            if not text:
                return Response(
                    {f"turns.{index}.text": "An empty turn records nothing. Leave it out."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(text) > 4000:
                return Response(
                    {f"turns.{index}.text": "Keep each turn under 4000 characters."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            turns.append({"speaker": speaker, "text": text})

        stored = session.append_transcript_turns(turns, recorded_by=request.user)

        _write_assignment_audit(
            session.application, request.user, "interview_transcript_recorded",
            f"Interview transcript: {len(turns)} turn{'s' if len(turns) != 1 else ''} added "
            f"to round {session.round_number} ({session.get_interview_type_display()}); "
            f"{len(stored)} on record.",
        )

        return Response({
            "session": InterviewSessionSerializer(session, context={"request": request}).data,
            "turns_added": len(turns),
            "transcript_turns": len(stored),
            "session_status": session.status,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="record-claim",
            permission_classes=[IsAcceleratorOrStaff])
    def record_transcript_claim(self, request, pk=None):
        """Turn one transcript line into a claim in the evidence graph.

        A human decides which answer was an assertion worth checking; the row
        lands as `source='interview'` and `verification_status='pending'`, with
        the session and turn number cited on it. Nothing here verifies
        anything — an interview claim is exactly as trustworthy as the sentence
        it came from, and the graph shows it that way so the deck and the
        interview can be set against each other.
        """
        session = self.get_object()
        try:
            turn_index = int(request.data.get("turn"))
        except (TypeError, ValueError):
            return Response(
                {"turn": "Which transcript turn? Send its turn number."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        turn = session.transcript_turn(turn_index)
        if turn is None:
            return Response(
                {"turn": f"Turn {turn_index} is not on this session's transcript. "
                         "Nothing is being invented from a line that does not exist."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        app = session.application
        categories = {value for value, _label in ApplicationClaim.CATEGORY_CHOICES}
        materialities = {value for value, _label in ApplicationClaim.MATERIALITY_CHOICES}
        category = str(request.data.get("category") or "").strip().lower()
        materiality = str(request.data.get("materiality") or "").strip().lower()
        errors = {}
        if category not in categories:
            errors["category"] = f"Pick one of {', '.join(sorted(categories))}."
        if materiality not in materialities:
            errors["materiality"] = f"Pick one of {', '.join(sorted(materialities))}."
        statement = str(request.data.get("statement") or "").strip() or turn["text"]
        if not statement:
            errors["statement"] = "Write the assertion being recorded."
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        if ApplicationClaim.objects.filter(
            source_interview=session, source_transcript_turn=turn_index
        ).exists():
            # Recording the same sentence twice would double-count it on every
            # claim tally the diligence board reads.
            return Response(
                {"detail": "That turn is already recorded as a claim on this application."},
                status=status.HTTP_409_CONFLICT,
            )

        claim = ApplicationClaim.objects.create(
            application=app,
            claim_id=f"C-{app.id:03d}{app.claims.count() + 1:02d}",
            claim_text=statement,
            category=category,
            materiality=materiality,
            source="interview",
            source_interview=session,
            source_transcript_turn=turn_index,
            # Only the founder asserting something makes it their claim; a
            # reviewer's own summary line stays a note in the graph.
            founder_asserted=turn["speaker"] == "founder",
            evidence_required=bool(request.data.get("evidence_required", True)),
            verification_status=evidence_state.PENDING,
        )

        _write_assignment_audit(
            app, request.user, "interview_claim_recorded",
            f"Claim from interview turn {turn_index}: {claim.claim_text[:80]} "
            f"({claim.get_materiality_display()}, {claim.get_category_display()}) — unverified.",
        )

        return Response(
            ApplicationClaimSerializer(claim).data, status=status.HTTP_201_CREATED
        )


# ──────────────────────────────────────────────────────────────────────────────
# 7. Committee Decision Workspace & IC Debate
# ──────────────────────────────────────────────────────────────────────────────

class CommitteeDecisionViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = CommitteeDecisionSerializer
    permission_classes = [IsAcceleratorOrStaff]
    program_source = "application__program"
    program_write_rule = "visible"

    def get_queryset(self):
        return scope_rows_to_visible_programs(
            CommitteeDecision.objects.select_related("application", "decided_by"),
            self.request, "application__program",
        )

    @action(detail=False, methods=["post"], url_path="cast-vote")
    def cast_vote(self, request):
        """Cast an IC committee vote and update the aggregate decision tally.

        Ballots are stored on the application's open committee workspace row
        (re-voting replaces your own previous ballot). The quorum tally
        returned here is always recomputed server-side from stored ballots —
        never from client-supplied counts."""
        app_id = request.data.get("application_id")
        vote_type = str(request.data.get("vote") or "YES").strip().upper()
        if vote_type not in ("YES", "CONDITIONAL", "PASS"):
            return Response(
                {"error": f"Invalid vote: {vote_type}. Must be YES, CONDITIONAL or PASS."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            conviction = max(1, min(10, int(request.data.get("conviction_score", 8))))
        except (TypeError, ValueError):
            return Response({"error": "conviction_score must be an integer (1-10)."}, status=400)
        notes = str(request.data.get("notes") or "").strip()

        try:
            app = AcceleratorApplication.objects.get(pk=app_id)
        except (AcceleratorApplication.DoesNotExist, TypeError, ValueError):
            return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

        # A ballot is a write into another team's committee room if the
        # application is not in a program this account works in. `cast-vote`
        # resolves the application from the request body, so no scoped
        # queryset is ever consulted and the tenant has to be named and proved.
        require_visible_program(request.user, app.program_id, field="application_id")

        if app.status in TERMINAL_VOTE_CLOSURE_STATUSES:
            return Response(
                {"error": f"Voting is closed — this application is already {app.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        decision_obj = (
            app.committee_decisions.filter(decision="").order_by("-updated_at").first()
            or CommitteeDecision.objects.create(application=app)
        )

        votes = [
            v for v in (decision_obj.individual_votes or [])
            if isinstance(v, dict) and v.get("voter_id") != request.user.id
        ]
        votes.append({
            "voter_id": request.user.id,
            "voter_name": request.user.full_name or request.user.email,
            "vote": vote_type,
            "conviction_score": conviction,
            "notes": notes,
            "timestamp": timezone.now().isoformat(),
        })

        # Save the ballot first, then tally from the database — the response
        # must reflect stored truth, including the vote just cast.
        decision_obj.individual_votes = votes
        decision_obj.save()

        tally = tally_committee_votes(app)
        decision_obj.vote_summary = {k: tally[k] for k in QUORUM_SUMMARY_KEYS}
        decision_obj.save(update_fields=["vote_summary", "updated_at"])

        payload = CommitteeDecisionSerializer(decision_obj).data
        payload["quorum"] = {k: tally[k] for k in QUORUM_SUMMARY_KEYS}
        payload["quorum"]["voters"] = [
            {
                "voter_id": v.get("voter_id"),
                "voter_name": v.get("voter_name"),
                "vote": v.get("vote"),
                "conviction_score": v.get("conviction_score"),
                "timestamp": v.get("timestamp"),
            }
            for v in tally["votes"]
        ]
        return Response(payload)

    @action(detail=False, methods=["post"], url_path="finalize-decision")
    def finalize_decision(self, request):
        """Legacy IC workspace entry point. Delegates to the same audited path
        as the Decision Room so a decision can never bypass the stage graph,
        the authority check or the cohort enrolment side effects."""
        app_id = request.data.get("application_id")
        dec = (request.data.get("decision") or "").strip().upper()
        rationale = (request.data.get("rationale") or "").strip()
        conditions = request.data.get("conditions", "")

        try:
            app = AcceleratorApplication.objects.select_related("startup_profile", "program").prefetch_related(
                "committee_decisions"
            ).get(pk=app_id)
        except (AcceleratorApplication.DoesNotExist, TypeError, ValueError):
            return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)
        # Same proof as the ballot: this path writes a settled decision and
        # enrols a cohort, so the application must be inside a program the
        # caller works in before the authority check gets a chance to speak.
        require_visible_program(request.user, app.program_id, field="application_id")
        valid_decisions = [choice[0] for choice in CommitteeDecision.DECISION_CHOICES]
        if dec not in valid_decisions:
            return Response(
                {"error": f"Invalid decision: {dec or '(none given)'}. Must be one of {', '.join(valid_decisions)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not rationale:
            return Response({"error": "A committee decision must state its rationale."}, status=400)

        _assert_decision_authority(request.user, app, dec)

        prior = app.committee_decisions.order_by("-created_at").first()
        try:
            record = DecisionRoom(app.program).record_decision(
                application=app,
                decision=dec,
                actor=request.user,
                rationale=rationale,
                stipulations=[conditions] if conditions else [],
                voting_summary=dict(prior.vote_summary or {}) if prior else {},
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        app = AcceleratorApplication.objects.select_related("startup_profile", "program").get(pk=app.pk)
        _apply_decision_side_effects(app, dec)

        return Response(CommitteeDecisionSerializer(record).data)


# ──────────────────────────────────────────────────────────────────────────────
# 8. Evidence Request Loop
# ──────────────────────────────────────────────────────────────────────────────

class EvidenceRequestViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """The program asking a founder for something it cannot establish itself.

    A request is a question with a state, not a verdict: opening one moves the
    application to `EVIDENCE_REQUESTED`, and resolving one records the answer.
    It does not re-score the startup — readiness is what the admissions engine
    computes from the evidence that exists, so `post_readiness_score` stays
    unset until a human runs that again, rather than a fixed bump standing in
    for it.
    """

    serializer_class = EvidenceRequestSerializer
    permission_classes = [IsAuthenticated]
    program_source = "application__program"
    program_write_rule = "visible"

    def get_queryset(self):
        return scope_application_rows(EvidenceRequest.objects.all(), self.request)

    def perform_create(self, serializer):
        if not is_program_team(self.request.user):
            raise PermissionDenied("Only accelerator managers and committee members can initiate evidence requests.")
        app = serializer.validated_data["application"]
        # Terminal applications cannot be pulled back into EVIDENCE_REQUESTED
        # — a completed selection or rejection is a completed selection.
        if app.status in ("ACCEPTED", "REJECTED", "WITHDRAWN"):
            raise ValidationError(
                f"Cannot request evidence from a {app.status.lower()} application."
            )
        serializer.save(
            requested_by=self.request.user,
            pre_readiness_score=app.startup_strength_score,
        )
        app.status = "EVIDENCE_REQUESTED"
        app.save(update_fields=["status"])

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve_evidence(self, request, pk=None):
        """Record the founder's answer and close the request.

        The response has to be sent: writing "Evidence provided." down when
        nobody provided any would put a fabricated fact on the evidence ledger,
        and the whole point of this row is what a human was told.
        """
        evidence_req = self.get_object()
        app = evidence_req.application
        response_text = str(request.data.get("founder_response") or "").strip()
        if not response_text:
            raise ValidationError(
                {"founder_response": "Record what the founder actually provided. "
                                      "A request is not resolved by closing it."}
            )
        evidence_req.status = "COMPLETE"
        evidence_req.founder_response = response_text
        evidence_req.resolved_at = timezone.now()
        evidence_req.save(update_fields=["status", "founder_response", "resolved_at", "updated_at"])

        _write_assignment_audit(
            app, request.user, "evidence_received",
            f"Evidence response recorded: {response_text[:120]}",
        )

        return Response({
            "message": "Founder response recorded and the request closed. "
                       "The application stays in EVIDENCE_REQUESTED until a human "
                       "advances it.",
            "pre_readiness_score": evidence_req.pre_readiness_score,
            "post_readiness_score": evidence_req.post_readiness_score,
            "current_status": app.status,
        })


# ──────────────────────────────────────────────────────────────────────────────
# 9. Seed / Setup Initial Default Programs & Questions
# ──────────────────────────────────────────────────────────────────────────────

class SeedAcceleratorDefaultsView(APIView):
    """
    Creates high-fidelity default programs and standard dynamic questions.

    A demo-data shortcut behind the dashboard's "seed" button, so it is a write
    like any other: it used to be AllowAny, which let an anonymous visitor
    create programs and questions on a production deployment.
    """
    permission_classes = [IsAcceleratorOrStaff]

    def post(self, request):
        p1, _ = AcceleratorProgram.objects.get_or_create(
            slug="pan-african-accelerator-2026",
            defaults={
                "name": "Pan-African Accelerator 2026",
                "organization_name": "Venture Admissions Network",
                "tagline": "Pre-seed to Seed multi-stage institutional admissions pipeline.",
                "description": "Techstars-calibrated 12-week intensive accelerator with screening committee, dual-interview rounds, and continuous milestone readiness tracking.",
                "sector_focus": "Fintech, Logistics, Healthtech, Climate, B2B SaaS",
                "geography_focus": "Nigeria, Kenya, South Africa, Egypt, Ghana, Rwanda",
                "stage_focus": "pre_seed",
                "funding_amount_usd": Decimal("120000.00"),
                "equity_offered_pct": 7.0,
                "program_duration_weeks": 12,
                "is_remote": True,
                "location": "Lagos, Nairobi & Virtual",
                "program_cycle": "2026-Batch 1",
                "target_cohort_size": 15,
                "workflow_style": "techstars_style",
                "eligibility_rules": {
                    "geography_whitelist": ["NG", "KE", "ZA", "EG", "GH", "RW"],
                    "sector_whitelist": ["fintech", "logistics", "healthtech", "climate", "saas", "tech"],
                    "incorporated_required": False,
                    "full_time_required": True,
                    "previous_funding_max_usd": 750000,
                },
                "is_active": True,
                "is_public": True,
            }
        )

        # Dynamic questions for p1
        questions = [
            ("What burning problem are you solving and for whom?", "problem", "narrative", "critical", True, 0),
            ("Do you currently have paying customers or revenue?", "traction", "boolean", "critical", True, 1),
            ("Monthly Recurring Revenue (USD)", "financials", "numeric", "high", False, 2),
            ("How many signed LOIs or pilot agreements do you have?", "traction", "numeric", "critical", True, 3),
            ("Why is this founding team uniquely suited to win this market?", "team", "narrative", "high", True, 4),
        ]
        for text, cat, qtype, mat, req, ordr in questions:
            ApplicationQuestion.objects.get_or_create(
                program=p1,
                order=ordr,
                defaults={"text": text, "category": cat, "question_type": qtype, "materiality": mat, "is_required": req}
            )

        p2, _ = AcceleratorProgram.objects.get_or_create(
            slug="global-founders-sprint-2026",
            defaults={
                "name": "Global Founders Sprint",
                "organization_name": "Sprint Ventures",
                "tagline": "High-velocity online application with 48-hour interview decision.",
                "description": "Streamlined YC-style admissions focusing on founder iteration speed, technical defensibility, and scalable market insight.",
                "sector_focus": "AI, DevTools, Fintech, Deep Tech",
                "geography_focus": "Global / Emerging Markets",
                "stage_focus": "any",
                "funding_amount_usd": Decimal("500000.00"),
                "equity_offered_pct": 7.0,
                "program_duration_weeks": 10,
                "is_remote": True,
                "program_cycle": "Summer 2026",
                "target_cohort_size": 25,
                "workflow_style": "yc_style",
                "eligibility_rules": {
                    "geography_whitelist": ["ALL"],
                    "full_time_required": True,
                    "previous_funding_max_usd": 2000000,
                },
                "is_active": True,
                "is_public": True,
            }
        )

        return Response({
            "message": "Seeded configurable accelerator programs and dynamic questions.",
            "programs": [p1.name, p2.name]
        })

# ──────────────────────────────────────────────────────────────────────────────
# 10. User / Organization Context Endpoints
# ──────────────────────────────────────────────────────────────────────────────

# What the account record itself says about who this is. There is deliberately
# no default: a program-scoped title (director, reviewer, mentor) is not stored
# against a user anywhere, so claiming one would invent an authority the
# database never granted.
ACCOUNT_ROLE_LABELS = {
    "accelerator": "Accelerator team",
    "investor": "Investor",
    "startup": "Founder",
}


def _account_role(user):
    code = (getattr(user, "role", "") or "").strip().lower()
    if code in ACCOUNT_ROLE_LABELS:
        return ACCOUNT_ROLE_LABELS[code], code
    if getattr(user, "is_staff", False):
        return "Staff", code or None
    return None, code or None


def _organization_summaries(user):
    """Group the visible programs into organizations.

    ``id`` is a real ``AcceleratorOrganization`` key when the program is linked
    to one, and null when all that exists is the program's own
    ``organization_name`` text. The previous payload used the program's primary
    key as an organization id and attached a role plus a permission list no
    table backs, which let a client "switch" into an entity that does not
    exist and read back an authority level it had asserted itself.
    """
    grouped: dict[object, dict] = {}
    for prog in programs_visible_to(user).select_related("organization"):
        # A linked organization record owns the name; the program's own text
        # field speaks only while no link exists. Same rule as the active
        # context payload, so the two can't disagree about who runs a program.
        name = prog.organization.name if prog.organization_id else prog.organization_name
        key = prog.organization_id or f"name:{name}"
        entry = grouped.get(key)
        if entry is None:
            grouped[key] = {
                "id": prog.organization_id,
                "name": name,
                "linked": prog.organization_id is not None,
                "program_ids": [prog.pk],
            }
        else:
            entry["program_ids"].append(prog.pk)
    return list(grouped.values())


def _program_roles(user, program):
    """The seats this account holds in one program, as the roster states them.

    A list rather than one title because a person can legitimately hold two
    (a reviewer who also sits on the committee), and picking one would be the
    server inventing a hierarchy it does not have. Only live seats are reported:
    a deactivated seat grants nothing, so naming it would be a fiction.
    """
    if program is None or not getattr(user, "is_authenticated", False):
        return []
    labels = dict(
        ProgramStaffMembership._meta.get_field("role").choices)
    seats = ProgramStaffMembership.objects.filter(
        user=user, program=program, is_active=True,
    ).order_by("role")
    return [
        {"code": seat.role, "label": labels.get(seat.role, seat.role),
         "membership_id": seat.pk}
        for seat in seats
    ]


def _active_context_payload(user, program):
    organization = program.organization if program is not None else None
    # A linked organization record owns the name; the program's own text field
    # speaks only while no link exists.
    organization_name = (
        organization.name if organization is not None
        else (program.organization_name if program is not None else None)
    )
    role_label, role_code = _account_role(user)
    return {
        "program_roles": _program_roles(user, program),
        "organization_id": organization.pk if organization is not None else None,
        "organization_name": organization_name,
        "program_id": program.pk if program is not None else None,
        "program_name": program.name if program is not None else None,
        "role": role_label,
        "role_code": role_code,
        "is_program_creator": bool(
            program is not None and program.created_by_id == user.pk
        ),
        # The permission question, which is wider than the creator one: platform
        # staff configure a program they did not make.
        "can_configure_program": may_configure_program(program, user),
    }


def _context_payload(user, program):
    return {
        "user_id": user.pk,
        "email": user.email,
        "organizations": _organization_summaries(user),
        "active_context": _active_context_payload(user, program),
    }


class UserContextView(APIView):
    """
    GET /accelerator/context/
    Returns the logged-in user's accessible organizations, programs, and active context.
    Used by ProgramContext.tsx to bootstrap the accelerator sub-app.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = request.user
        # Bootstrap on the newest program the account can see (the model's
        # ordering is -created_at). When there is none, every context field is
        # simply null — the client shows an absent context as absent.
        active_program = programs_visible_to(user).first()
        serializer = UserContextResponseSerializer(_context_payload(user, active_program))
        return Response(serializer.data)


class SwitchContextView(APIView):
    """
    POST /accelerator/context/switch/

    Confirms a program (and, when organizations are linked records, the
    organization running it) against what the account can actually reach, then
    returns the resulting context. Nothing is persisted — a JWT API has no
    session to write to — so this response is a server-checked confirmation of
    a selection, never an echo of a claim.

    It used to accept a ``role`` from the request body and hand it back as the
    caller's authority. That field is gone: no table maps a user to a role
    inside a program, so the honest answer is the account role or null.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        ser = SwitchContextSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        user = request.user
        visible = programs_visible_to(user)

        program_id = data.get("program_id")
        if program_id:
            program = visible.filter(pk=program_id).first()
            if program is None:
                # Previously this fell through to "some program I can see" and
                # reported it as the one you asked for.
                raise ValidationError({
                    "program_id": "No such program is available to this account."
                })
        else:
            program = visible.first()

        org_id = data.get("organization_id")
        if org_id:
            if not AcceleratorOrganization.objects.filter(pk=org_id).exists():
                raise ValidationError({"organization_id": "No such organization."})
            if program is None or program.organization_id != org_id:
                raise ValidationError({
                    "organization_id": "That organization does not run the selected program."
                })

        serializer = UserContextResponseSerializer(_context_payload(user, program))
        return Response(serializer.data)


# ──────────────────────────────────────────────────────────────────────────────
# 10b. WORK INBOX — what the program's ledgers owe the signed-in user
# ──────────────────────────────────────────────────────────────────────────────

# The panel lists this many rows, but the counts above it are always over the
# whole working set — capping a count is how a badge starts lying.
WORK_INBOX_ITEM_LIMIT = 50


def _company_label(application) -> str:
    profile = getattr(application, "startup_profile", None)
    name = (getattr(profile, "company_name", "") or "").strip()
    return name or f"Application #{application.pk}"


class WorkInboxView(APIView):
    """
    GET /accelerator/work-inbox/?program_id=N

    What the program's four work ledgers owe the requesting user and nobody
    else: reviews assigned to them, diligence questions they own, interview
    sessions naming them as the interviewer, and evidence requests they raised
    that a founder has not answered.

    Every number is a row count over rows carrying their name. It is not a
    statement about the program's backlog, and an empty result means only that:
    "nothing is owed to you" and "everything is handled" are different claims,
    and this endpoint can support the first one alone.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = request.user
        raw_program_id = request.query_params.get("program_id")
        if not raw_program_id:
            raise ValidationError({"program_id": "program_id is required."})
        # Present-but-malformed says so: answering "is required" to a caller who
        # did send one describes the wrong problem.
        program_id = positive_int(raw_program_id, "program_id")

        # The same reach every other read uses. `programs_visible_to` alone would
        # blind a staff account — an admin runs the platform rather than owning
        # every program on it — and the work ledger is per-person rows either way.
        program = AcceleratorProgram.objects.filter(pk=program_id).first()
        if program is None or not program_visible_to(program, user):
            raise NotFound("No such program is available to this account.")

        now = timezone.now()
        far_future = now + timedelta(days=3650)

        # A recused reviewer owes nothing, and a completed assignment is no
        # longer open — both are excluded rather than counted and greyed out.
        reviews = ReviewAssignment.objects.filter(
            reviewer=user,
            application__program_id=program.pk,
            status__in=("pending", "in_progress"),
        ).exclude(conflict_status="recused").select_related("application")

        diligence = DiligenceItem.objects.filter(
            owner=user,
            application__program_id=program.pk,
            status__in=DiligenceItem.OPEN_STATUSES,
        ).select_related("application")

        # ML-conducted sessions have no interviewer, so they never land here:
        # no human owes anything to them.
        interviews = InterviewSession.objects.filter(
            interviewer=user,
            application__program_id=program.pk,
            status__in=("scheduled", "in_progress"),
        ).select_related("application")

        awaiting_founder = EvidenceRequest.objects.filter(
            requested_by=user,
            application__program_id=program.pk,
            status__in=("PENDING", "PARTIAL"),
        ).select_related("application")

        overdue_reviews = reviews.filter(due_at__isnull=False, due_at__lt=now).count()
        overdue_diligence = diligence.filter(due_at__isnull=False, due_at__lt=now).count()
        overdue_interviews = interviews.filter(
            scheduled_at__isnull=False, scheduled_at__lt=now
        ).count()
        overdue_requests = awaiting_founder.filter(
            response_deadline__isnull=False, response_deadline__lt=now
        ).count()

        rows: list[tuple] = []

        for assignment in reviews:
            rows.append((
                assignment.due_at or far_future,
                {
                    "key": f"review-{assignment.pk}",
                    "kind": "review",
                    "application_id": assignment.application_id,
                    "company": _company_label(assignment.application),
                    "title": f"Review {assignment.round_id} — {assignment.status.replace('_', ' ')}",
                    "due_at": assignment.due_at.isoformat() if assignment.due_at else None,
                    "overdue": (
                        assignment.due_at < now if assignment.due_at else None
                    ),
                    "href": f"/accelerator/applications/{assignment.application_id}",
                },
            ))

        for item in diligence:
            rows.append((
                item.due_at or far_future,
                {
                    "key": f"diligence-{item.pk}",
                    "kind": "diligence",
                    "application_id": item.application_id,
                    "company": _company_label(item.application),
                    "title": item.question,
                    "area": item.area,
                    "due_at": item.due_at.isoformat() if item.due_at else None,
                    # An item with no due date is undated, not on time — null
                    # keeps the two apart.
                    "overdue": (item.is_overdue(now) if item.due_at else None),
                    "href": f"/accelerator/applications/{item.application_id}",
                },
            ))

        for session in interviews:
            rows.append((
                session.scheduled_at or far_future,
                {
                    "key": f"interview-{session.pk}",
                    "kind": "interview",
                    "application_id": session.application_id,
                    "company": _company_label(session.application),
                    "title": (
                        f"{session.get_interview_type_display()} · Round {session.round_number}"
                    ),
                    "due_at": (
                        session.scheduled_at.isoformat() if session.scheduled_at else None
                    ),
                    "overdue": (
                        session.scheduled_at < now if session.scheduled_at else None
                    ),
                    "href": "/accelerator/interviews",
                },
            ))

        for req in awaiting_founder:
            rows.append((
                req.response_deadline or far_future,
                {
                    "key": f"evidence-{req.pk}",
                    "kind": "awaiting_founder",
                    "application_id": req.application_id,
                    "company": _company_label(req.application),
                    "title": f"Evidence request {req.status.lower()} — founder has not responded",
                    "due_at": (
                        req.response_deadline.isoformat() if req.response_deadline else None
                    ),
                    "overdue": (
                        req.response_deadline < now if req.response_deadline else None
                    ),
                    "href": f"/accelerator/applications/{req.application_id}",
                },
            ))

        rows.sort(key=lambda pair: pair[0])
        items = [row[1] for row in rows]

        counts = {
            "reviews": reviews.count(),
            "diligence": diligence.count(),
            "interviews": interviews.count(),
            "awaiting_founder": awaiting_founder.count(),
            "overdue": overdue_reviews + overdue_diligence + overdue_interviews + overdue_requests,
        }

        return Response({
            "program_id": program.pk,
            "program_name": program.name,
            "generated_at": now.isoformat(),
            "counts": counts,
            "total_open": sum(
                counts[key] for key in ("reviews", "diligence", "interviews", "awaiting_founder")
            ),
            "items": items[:WORK_INBOX_ITEM_LIMIT],
            "item_limit": WORK_INBOX_ITEM_LIMIT,
            "truncated": len(items) > WORK_INBOX_ITEM_LIMIT,
        })


# ──────────────────────────────────────────────────────────────────────────────
# Workflow OS — automations CRUD
# ──────────────────────────────────────────────────────────────────────────────

class WorkflowAutomationViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """
    Per-program workflow automations (trigger → conditions → queued actions).

    Reads are scoped to the programs this account works in and narrowed by
    ``?program_id=`` — the parameter narrows, it cannot widen. Writes are
    accelerator staff *and* must name a program this account owns, because an
    automation changes what the pipeline does on its own. Automations never
    execute their own side effects — the dispatcher records intent for the
    Communications OS to run.
    """
    serializer_class = WorkflowAutomationSerializer
    permission_classes = [IsAuthenticated]
    program_write_rule = "manage"

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated()]
        return [IsAcceleratorOrStaff()]

    def get_queryset(self):
        qs = scope_to_visible_programs(
            WorkflowAutomation.objects.select_related("program"), self.request
        )
        return qs.order_by("program_id", "order", "id")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
