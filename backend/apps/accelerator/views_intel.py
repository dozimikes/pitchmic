"""
apps.accelerator.views_intel
============================
DRF viewsets/views for the Program OS intelligence layer:

  * ProgramMemoryEntryViewSet      - program memory CRUD + deterministic
                                     cross-program ``compare`` analytics.
  * DashboardWidgetConfigViewSet   - per-role dashboard widget configuration.
  * ProgramBlueprintViewSet        - blueprint CRUD + ``save_from_program``
                                     (snapshot a live program) + ``clone``
                                     (materialise a new program from a
                                     blueprint snapshot).
  * EvidenceGraphView              - Founder Evidence Graph traversal for one
                                     application (claims -> evidence ->
                                     decisions/reviews that relied on them).
  * ProgramStudioSeedView          - Program Studio wizard: create a program
                                     from an archetype with a seeded workflow
                                     and evaluation policy.

Permissions mirror ``views_config``: authenticated read, accelerator/staff
write (``ReadOnlyOrAccelerator``), program scoping via ``?program_id=``
(``scope_to_visible_programs``). Everything is deterministic - no AI in any write path.
"""
from __future__ import annotations

import logging
import uuid

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import evidence_state
from . import workflow_engine
from .workflows import publish_event
from .models import (
    AcceleratorApplication,
    ApplicationClaim,
    AcceleratorProgram,
    _person_label,
    materiality_ordering,
)
from .models_config import (
    FormDefinition,
    FormQuestion,
    FormSection,
    NotificationTemplate,
    QuestionOption,
)
from .models_os import (
    AcceleratorOrganization,
    DashboardWidgetConfig,
    ProgramBlueprint,
    ProgramMemoryEntry,
    WorkflowAutomation,
)
from .permissions import IsAcceleratorOrStaff
from .program_policy import ProgramArchetype, ProgramEvaluationPolicy
from .serializers import ApplicationClaimSerializer
from .serializers_intel import (
    ClaimVerificationSerializer,
    DashboardWidgetConfigSerializer,
    ProgramBlueprintSerializer,
    ProgramMemoryEntrySerializer,
)
from .tenant import (
    TenantScopedWriteMixin,
    ownable_programs,
    positive_int,
    scope_applications,
    scope_rows_to_visible_programs,
    scope_to_visible_programs,
    tenant_programs,
)
from .views_config import ReadOnlyOrAccelerator

logger = logging.getLogger(__name__)

# Allowed write keys for cloning snapshot rows back into live tables.
_AUTOMATION_KEYS = (
    "name", "description", "trigger_event", "conditions", "actions",
    "is_active", "order",
)
_TEMPLATE_KEYS = ("key", "name", "channel", "subject", "body", "is_active")
_POLICY_JSON_KEYS = (
    "scoring_dimensions", "stage_adjustments", "sector_adjustments",
    "hard_gates", "reviewer_roles", "interview_policy", "decision_policy",
    "diversity_policy", "cohort_constraints", "milestone_policy",
    "risk_thresholds", "outcome_weights", "evidence_requirements",
)
_POLICY_INT_KEYS = ("min_reviewers_per_application", "review_rounds")


def _unique_slug(base: str) -> str:
    """Return a URL-safe slug guaranteed (best-effort) not to collide."""
    stem = slugify(base or "program")[:90] or "program"
    candidate = stem
    while AcceleratorProgram.objects.filter(slug=candidate).exists():
        candidate = f"{stem}-{uuid.uuid4().hex[:6]}"
    return candidate


def _blueprints_visible_to(user):
    """The blueprints this account may read — and therefore edit.

    A blueprint is a verbatim copy of a program's methodology, so the default is
    its own tenant's rows plus the ones its author made. ``is_published`` is the
    one sharing mechanism the model actually has ("published / available to
    clone"), which is why a published template is readable across tenants on
    purpose while a draft is not.
    """
    qs = ProgramBlueprint.objects.all()
    visible = tenant_programs(user)
    if visible is not None:
        qs = qs.filter(
            Q(source_program__in=visible) | Q(created_by=user) | Q(is_published=True)
        )
    return qs


# ─────────────────────────────────────────────────────────────────────────────
# 1. Program Memory & Analytics OS
# ─────────────────────────────────────────────────────────────────────────────

class ProgramMemoryEntryViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """Accumulated selection/cohort/outcome insights per program, plus a
    deterministic cross-program ``compare`` endpoint (no AI)."""

    serializer_class = ProgramMemoryEntrySerializer
    permission_classes = [ReadOnlyOrAccelerator]
    # An insight recorded about a program is work done inside it, not a change to
    # how it judges founders.
    program_write_rule = "visible"

    def get_queryset(self):
        qs = ProgramMemoryEntry.objects.select_related("program", "created_by")
        return scope_to_visible_programs(qs, self.request).order_by("-created_at")

    def perform_create(self, serializer):
        self._assert_writable(serializer)  # overrides ModelViewSet's hook, so call the gate
        serializer.save(created_by=self.request.user)

    @staticmethod
    def _memory_payload(program_id: str, request):
        # The request is a required argument on purpose: the tenant rule is part
        # of what this returns, and a defaulted-out `request` would hand back
        # another program's memory to any caller that forgot to pass one. A
        # program outside the caller's scope answers as unknown, so the
        # comparison never confirms which private pipelines exist.
        qs = AcceleratorProgram.objects.all()
        visible = tenant_programs(request.user)
        if visible is not None:
            qs = qs.filter(pk__in=visible)
        program = qs.filter(pk=positive_int(program_id, "program_id")).first()
        if program is None:
            return None
        entries = list(
            ProgramMemoryEntry.objects.filter(program_id=program.pk)
            .order_by("-created_at")
            .values("id", "memory_type", "title", "confidence",
                    "is_actionable", "created_at")
        )
        by_type: dict[str, int] = {}
        for e in entries:
            by_type[e["memory_type"]] = by_type.get(e["memory_type"], 0) + 1
        for e in entries:
            if e["created_at"] is not None:
                e["created_at"] = e["created_at"].isoformat()
        return {
            "program_id": program.pk,
            "program_name": program.name,
            "total": len(entries),
            "by_type": by_type,
            "actionable": sum(1 for x in entries if x["is_actionable"]),
            "entries": entries,
        }

    @action(detail=False, methods=["get"], url_path="compare")
    def compare(self, request):
        """Deterministic memory comparison between one or two programs.

        ?program_id=<required>&other_program_id=<optional>
        Returns each program's memory entries + type counts and, when a second
        program is given, a title/type set-diff between the two.
        """
        pid = request.query_params.get("program_id")
        if not pid:
            return Response(
                {"error": "program_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        this = self._memory_payload(pid, request)
        if this is None:
            return Response({"error": "Unknown program."},
                            status=status.HTTP_404_NOT_FOUND)

        result = {"program": this}

        other_pid = request.query_params.get("other_program_id")
        if other_pid:
            other = self._memory_payload(other_pid, request)
            if other is None:
                return Response({"error": "Unknown other_program_id."},
                                status=status.HTTP_404_NOT_FOUND)
            result["other_program"] = other
            this_titles = {e["title"] for e in this["entries"]}
            other_titles = {e["title"] for e in other["entries"]}
            type_diff = {}
            for t in sorted(set(this["by_type"]) | set(other["by_type"])):
                type_diff[t] = {
                    "this": this["by_type"].get(t, 0),
                    "other": other["by_type"].get(t, 0),
                }
            result["diff"] = {
                "only_in_this": sorted(this_titles - other_titles),
                "only_in_other": sorted(other_titles - this_titles),
                "shared": sorted(this_titles & other_titles),
                "type_counts": type_diff,
            }
        return Response(result)


class DashboardWidgetConfigViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """Per-role (and optionally per-user) dashboard widget/nav configuration.
    Standard program-scoped CRUD."""

    serializer_class = DashboardWidgetConfigSerializer
    permission_classes = [ReadOnlyOrAccelerator]
    # Whose layout this is lives in `role`/`user`, not in the tenant rule; the
    # program only says which pipeline the layout belongs to.
    program_write_rule = "visible"

    def get_queryset(self):
        qs = DashboardWidgetConfig.objects.select_related("program", "user")
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        mine = self.request.query_params.get("mine")
        if mine:
            qs = qs.filter(user=self.request.user)
        return scope_to_visible_programs(qs, self.request).order_by("role", "id")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Program Blueprint system
# ─────────────────────────────────────────────────────────────────────────────

def _snapshot_form(form: FormDefinition) -> dict:
    """Full nested serialisation of one form (sections/questions/options)."""
    sections = []
    for s in form.sections.order_by("order", "id"):
        questions = []
        for q in s.questions.order_by("order", "id"):
            questions.append({
                "label": q.label, "help_text": q.help_text,
                "field_type": q.field_type, "required": q.required,
                "order": q.order, "character_limit": q.character_limit,
                "validation": q.validation, "visible_if": q.visible_if,
                "required_if": q.required_if, "routing": q.routing,
                "config": q.config,
                "options": [
                    {"label": o.label, "value": o.value, "order": o.order}
                    for o in q.options.order_by("order", "id")
                ],
            })
        sections.append({
            "name": s.name, "description": s.description,
            "order": s.order, "visible_if": s.visible_if,
            "questions": questions,
        })
    return {
        "name": form.name, "form_type": form.form_type,
        "version": form.version, "status": form.status,
        "description": form.description, "is_default": form.is_default,
        "sections": sections,
    }


def _snapshot_policy(policy: ProgramEvaluationPolicy) -> dict:
    return {
        "version": policy.version,
        "archetype_slug": policy.archetype.slug if policy.archetype else None,
        **{k: getattr(policy, k) for k in _POLICY_JSON_KEYS},
        **{k: getattr(policy, k) for k in _POLICY_INT_KEYS},
    }


def _build_workflow_snapshot(program: AcceleratorProgram) -> dict:
    stages = [
        {
            "slug": s.slug, "label": s.name, "type": s.type,
            "description": s.description, "terminal": s.is_terminal,
            "entry": s.is_entry, "deadline_days": s.deadline_days,
            "entry_conditions": s.entry_conditions,
            "exit_conditions": s.exit_conditions,
            "permissions": s.permissions, "config": s.config,
        }
        for s in program.stages.order_by("order", "id")
    ]
    transitions = [
        {
            "from_stage": t.from_stage.slug, "to_stage": t.to_stage.slug,
            "label": t.label, "condition": t.condition,
            "requires_approval": t.requires_approval,
        }
        for t in program.transitions.select_related("from_stage", "to_stage")
        .order_by("order", "id")
    ]
    return {
        "style": program.workflow_style,
        "stages": stages,
        "transitions": transitions,
        "workflow_config": program.workflow_config or {},
    }


def _create_form_from_snapshot(new_program, form_snap: dict, user) -> FormDefinition:
    """Recreate a snapshotted published form as a new draft on ``new_program``."""
    form = FormDefinition.objects.create(
        program=new_program,
        name=form_snap.get("name") or "Cloned form",
        form_type=form_snap.get("form_type") or "application",
        version=1,  # snapshot forms arrive as new drafts
        status="draft",
        description=form_snap.get("description", ""),
        created_by=user,
    )
    for idx, s in enumerate(form_snap.get("sections") or []):
        section = FormSection.objects.create(
            form=form,
            name=s.get("name") or f"Section {idx + 1}",
            description=s.get("description", ""),
            order=s.get("order", idx),
            visible_if=s.get("visible_if") or {},
        )
        for qidx, q in enumerate(s.get("questions") or []):
            question = FormQuestion.objects.create(
                section=section,
                label=q.get("label") or f"Question {qidx + 1}",
                help_text=q.get("help_text", ""),
                field_type=q.get("field_type") or "short_text",
                required=bool(q.get("required", False)),
                order=q.get("order", qidx),
                character_limit=q.get("character_limit"),
                validation=q.get("validation") or {},
                visible_if=q.get("visible_if") or {},
                required_if=q.get("required_if") or {},
                routing=q.get("routing") or {},
                config=q.get("config") or {},
            )
            for oidx, o in enumerate(q.get("options") or []):
                QuestionOption.objects.create(
                    question=question,
                    label=o.get("label", ""),
                    value=o.get("value", ""),
                    order=o.get("order", oidx),
                )
    return form


class ProgramBlueprintViewSet(viewsets.ModelViewSet):
    """Program Blueprint system: reusable, versioned snapshots of a program's
    full runtime configuration (workflow, forms, policies, automations, comms,
    branding, portal) that the Program Studio can clone into new programs.

    A blueprint body carries another program's entire selection methodology as
    plain JSON, so the list endpoint is a bulk read of it. Two things follow:
    the queryset is confined to what the caller may see, and a create cannot
    name a program outside that scope in its body — the serializer resolves an
    id against the model's manager, not this queryset.
    """

    serializer_class = ProgramBlueprintSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        qs = _blueprints_visible_to(self.request.user).select_related(
            "organization", "source_program", "created_by"
        )
        pid = self.request.query_params.get("program_id")
        if pid:
            qs = qs.filter(source_program_id=positive_int(pid, "program_id"))
        oid = self.request.query_params.get("organization_id")
        if oid:
            qs = qs.filter(organization_id=positive_int(oid, "organization_id"))
        published = self.request.query_params.get("published")
        if published:
            qs = qs.filter(is_published=True)
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        self._assert_body_program_writable(serializer)
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._assert_body_program_writable(serializer)
        serializer.save()

    def _assert_body_program_writable(self, serializer):
        """A program-less blueprint is a legitimate hand-authored template, so
        only a named program is checked here; which rows are reachable at all is
        `get_queryset`'s answer."""
        allowed = ownable_programs(self.request.user)
        if allowed is None:
            return
        program = serializer.validated_data.get("source_program")
        if program is not None and not allowed.filter(pk=program.pk).exists():
            raise ValidationError({"source_program": (
                "This account cannot snapshot a program it does not work in."
            )})

    # ── save_from_program: snapshot a live program into a blueprint ──────────
    @action(detail=False, methods=["post"], url_path="save_from_program")
    def save_from_program(self, request):
        """POST {program_id, name, description?, organization_id?}.

        Snapshots the program's workflow, published forms, automations,
        notification templates, evaluation policy, eligibility rules and all
        runtime config JSON into the blueprint's *_snapshot fields."""
        program_id = request.data.get("program_id")
        name = request.data.get("name")
        if not program_id or not name:
            return Response(
                {"error": "program_id and name are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        program = AcceleratorProgram.objects.filter(
            pk=positive_int(program_id, "program_id")).first()
        allowed = ownable_programs(request.user)
        if program is not None and allowed is not None:
            # Snapshotting is a read of one program's whole methodology, so the
            # stricter (ownership) rule applies before anything is copied. An
            # out-of-scope program answers exactly as a missing one does.
            if not allowed.filter(pk=program.pk).exists():
                program = None
        if program is None:
            return Response({"error": "Unknown program."},
                            status=status.HTTP_404_NOT_FOUND)

        organization = None
        org_id = request.data.get("organization_id") or program.organization_id
        if org_id and str(org_id) != str(program.organization_id):
            # The body may not file this copy inside another organization's
            # blueprint shelf; absent a stated org, the program's own is used.
            return Response(
                {"error": "organization_id must be the program's own "
                          "organization or left blank."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if org_id:
            organization = AcceleratorOrganization.objects.filter(pk=org_id).first()
        if organization is None:
            return Response(
                {"error": "Blueprints require an organization. Provide "
                          "organization_id or attach one to the program."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        active_policy = program.evaluation_policies.filter(
            is_active=True
        ).order_by("-created_at").first()

        workflow = _build_workflow_snapshot(program)
        forms = [_snapshot_form(f) for f in FormDefinition.objects.filter(
            program=program, status="published"
        ).prefetch_related("sections__questions__options").order_by("form_type", "id")]
        automations = list(program.automations.order_by("order", "id").values(
            *_AUTOMATION_KEYS))
        templates = list(program.notification_templates.order_by("key", "id").values(
            *_TEMPLATE_KEYS))

        blueprint = ProgramBlueprint.objects.create(
            name=name,
            description=request.data.get("description", ""),
            program_type=program.program_type,
            organization=organization,
            source_program=program,
            created_by=request.user,
            is_published=bool(request.data.get("is_published", False)),
            workflow_snapshot=workflow,
            form_snapshot={"forms": forms},
            automation_snapshot={"automations": automations},
            notification_snapshot={
                "templates": templates,
                "notification_config": program.notification_config or {},
            },
            policy_snapshot={
                "scoring_rubric_config": program.scoring_rubric_config or {},
                "eligibility_rules": program.eligibility_rules or {},
                "evaluation_policy": _snapshot_policy(active_policy) if active_policy else {},
            },
            module_config_snapshot=program.module_config or {},
            branding_snapshot=program.branding_config or {},
            portal_snapshot=program.portal_config or {},
        )
        return Response(
            self.get_serializer(blueprint).data, status=status.HTTP_201_CREATED
        )

    # ── clone: materialise a new program from a blueprint ────────────────────
    @action(detail=True, methods=["post"], url_path="clone")
    def clone(self, request, pk=None):
        """POST {name, organization_name?}. Creates a new AcceleratorProgram
        from this blueprint's snapshots: config JSON copied, workflow rows
        materialised via workflow_engine, automations / notification templates
        recreated, published forms recreated as drafts."""
        blueprint = self.get_object()
        name = request.data.get("name")
        if not name:
            return Response({"error": "name is required."},
                            status=status.HTTP_400_BAD_REQUEST)

        policy_snap = blueprint.policy_snapshot or {}
        workflow_snap = blueprint.workflow_snapshot or {}
        notification_snap = blueprint.notification_snapshot or {}

        org_name = (
            request.data.get("organization_name")
            or (blueprint.source_program.organization_name
                if blueprint.source_program else "")
            or (blueprint.organization.name if blueprint.organization_id else "")
        )

        with transaction.atomic():
            new_program = AcceleratorProgram.objects.create(
                name=name,
                organization_name=org_name,
                slug=_unique_slug(name),
                description=(
                    blueprint.description
                    or (blueprint.source_program.description
                        if blueprint.source_program else "")
                ),
                program_type=blueprint.program_type or "vc_accelerator",
                eligibility_rules=policy_snap.get("eligibility_rules") or {},
                scoring_rubric_config=policy_snap.get("scoring_rubric_config") or {},
                module_config=blueprint.module_config_snapshot or {},
                branding_config=blueprint.branding_snapshot or {},
                portal_config=blueprint.portal_snapshot or {},
                notification_config=notification_snap.get("notification_config") or {},
                workflow_style=workflow_snap.get("style") or "custom",
                organization=blueprint.organization,
                blueprint_source=blueprint,
                created_by=request.user,
                program_version=blueprint.blueprint_version or "v1",
                program_status="setup",
            )

            # 1. Workflow: materialise stages/transitions from the snapshot.
            stages = workflow_snap.get("stages") or []
            transitions = workflow_snap.get("transitions") or []
            if stages:
                workflow_engine.sync_graph_from_config(
                    new_program,
                    workflow_snap.get("style", ""),
                    stages,
                    transitions,
                )
                workflow_seeded = "blueprint"
            else:
                workflow_engine.ensure_default_graph(new_program)
                workflow_seeded = "default"

            # 2. Automations.
            automation_count = 0
            for a in (blueprint.automation_snapshot or {}).get("automations") or []:
                WorkflowAutomation.objects.create(
                    program=new_program, created_by=request.user,
                    **{k: a.get(k) for k in _AUTOMATION_KEYS if k in a},
                )
                automation_count += 1

            # 3. Notification templates.
            template_count = 0
            for t in notification_snap.get("templates") or []:
                NotificationTemplate.objects.create(
                    program=new_program,
                    **{k: t.get(k) for k in _TEMPLATE_KEYS if k in t},
                )
                template_count += 1

            # 4. Forms: recreate each snapshot form as a new draft.
            form_count = 0
            for f in (blueprint.form_snapshot or {}).get("forms") or []:
                _create_form_from_snapshot(new_program, f, request.user)
                form_count += 1

            # 5. Evaluation policy (defensive: only when the snapshot has one).
            policy_snap_inner = policy_snap.get("evaluation_policy") or {}
            policy_id = None
            if policy_snap_inner:
                archetype = None
                if policy_snap_inner.get("archetype_slug"):
                    archetype = ProgramArchetype.objects.filter(
                        slug=policy_snap_inner["archetype_slug"]
                    ).first()
                policy = ProgramEvaluationPolicy.objects.create(
                    program=new_program,
                    archetype=archetype,
                    version=policy_snap_inner.get("version") or "v1.0",
                    is_active=True,
                    effective_from=timezone.now(),
                    created_by=request.user,
                    **{
                        k: policy_snap_inner.get(k)
                        for k in _POLICY_JSON_KEYS + _POLICY_INT_KEYS
                        if k in policy_snap_inner
                    },
                )
                policy_id = policy.pk

        logger.info(
            "program_cloned blueprint_id=%s new_program_id=%s by=%s",
            blueprint.pk, new_program.pk, getattr(request.user, "email", request.user),
        )
        return Response({
            "program_id": new_program.pk,
            "name": new_program.name,
            "slug": new_program.slug,
            "blueprint_id": blueprint.pk,
            "workflow_seeded": workflow_seeded,
            "counts": {
                "stages": new_program.stages.count(),
                "transitions": new_program.transitions.count(),
                "automations": automation_count,
                "notification_templates": template_count,
                "forms": form_count,
            },
            "evaluation_policy_id": policy_id,
        }, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Evidence & Data OS — Founder Evidence Graph traversal
# ─────────────────────────────────────────────────────────────────────────────

# Cap on claim nodes drawn in the node/link view. A single application can
# carry hundreds of extracted claims; the traversal keeps the most material
# ones (the queryset is materiality-ordered) and flags the subset, while the
# claims list in the same payload always stays complete.
GRAPH_NODE_LIMIT = 40


class EvidenceGraphView(APIView):
    """Founder Evidence Graph traversal for one application.

    GET ?application_id=<id>

    For every ``ApplicationClaim`` of the application, returns the claim, its
    linked ``ClaimEvidence`` verification row (one-to-one via
    ``evidence_detail``), and a summary of the committee decisions / reviewer
    assessments that relied on the evidence. Deterministic read-only
    traversal - nothing here mutates state.

    Scoped like the applications list, because this is the widest read in the
    app: one payload carries a founder's claims, the reviewers' emails and what
    the committee decided. An application outside the caller's reach answers
    exactly as one that does not exist.
    """

    permission_classes = [ReadOnlyOrAccelerator]

    def get(self, request, application_id=None):
        app_id = application_id or request.query_params.get("application_id")
        if not app_id:
            return Response(
                {"error": "application_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        application = (
            scope_applications(
                AcceleratorApplication.objects
                .select_related("startup_profile", "program"),
                request,
            ).filter(pk=positive_int(app_id, "application_id")).first()
        )
        if application is None:
            return Response({"error": "Unknown application."},
                            status=status.HTTP_404_NOT_FOUND)

        # Decisions and reviews are application-level; summarised once and
        # attached to each claim as the "used_by" side of the graph.
        decisions = [
            {
                "id": d.pk,
                "decision": d.decision,
                "vote_summary": d.vote_summary or {},
                "reason": d.notes or d.decision_rationale or "",
                "decided_at": d.decided_at.isoformat() if d.decided_at else None,
            }
            for d in application.committee_decisions.order_by("-decided_at", "-id")
        ]
        reviews = [
            {
                "id": r.pk,
                "reviewer": r.reviewer.email,
                "recommendation": r.recommendation,
                "overall_conviction": r.overall_conviction,
                "notes": r.notes,
            }
            for r in application.reviewer_assessments.select_related("reviewer")
            .order_by("-submitted_at")
        ]
        used_by = {"decisions": decisions, "reviews": reviews}

        claims_qs = (
            application.claims
            .select_related("evidence_detail", "evidence_detail__document",
                           "source_document", "source_interview",
                           "source_interview__interviewer")
            .order_by(*materiality_ordering())
        )
        claims = []
        counts = {"total": 0, "verified": 0, "contradicted": 0, "unverified": 0}

        # Node/link traversal of the same rows the claim list renders: the
        # startup asserts a claim, a ClaimEvidence row either supports it or
        # contradicts it, and a claim heard out loud links to the interview
        # session that carries the turn. Nothing here is inferred beyond those
        # real relations, so the graph can never show an edge the database denies.
        nodes: list[dict] = [{
            "id": f"application:{application.pk}",
            "kind": "application",
            "label": application.startup_profile.company_name,
            "status": application.status,
        }]
        node_ids = {nodes[0]["id"]}
        links: list[dict] = []
        graph_claims = 0
        graph_truncated = False

        for claim in claims_qs:
            counts["total"] += 1
            if claim.verification_status in ("verified", "partially_verified"):
                counts["verified"] += 1
            elif claim.verification_status == "contradicted":
                counts["contradicted"] += 1
            else:
                counts["unverified"] += 1

            # Provenance is only ever reported when the FK says it exists. A
            # turn that was later removed from the transcript still cites the
            # session it was heard in, but the speaker and clock are simply
            # absent rather than guessed.
            session = claim.source_interview
            interview_info = None
            if session is not None:
                turn = session.transcript_turn(claim.source_transcript_turn)
                interview_info = {
                    "session_id": session.pk,
                    "round_number": session.round_number,
                    "interview_type": session.interview_type,
                    "interview_type_label": session.get_interview_type_display(),
                    "interviewer": _person_label(session.interviewer),
                    "turn": claim.source_transcript_turn,
                    "speaker": (turn or {}).get("speaker"),
                    "said_at": (turn or {}).get("timestamp"),
                    "recorded_by": (turn or {}).get("recorded_by"),
                }

            # Graph layout carries only the most material claims (the queryset
            # is ordered by materiality). The claims list below stays complete;
            # `truncated` tells the client the drawing is a subset.
            in_graph = graph_claims < GRAPH_NODE_LIMIT
            if in_graph:
                graph_claims += 1
                claim_node_id = f"claim:{claim.pk}"
                nodes.append({
                    "id": claim_node_id,
                    "kind": "claim",
                    "label": claim.claim_text,
                    "category": claim.category,
                    "materiality": claim.materiality,
                    "status": claim.verification_status,
                })
                links.append({
                    "source": f"application:{application.pk}",
                    "target": claim_node_id,
                    "kind": "asserted",
                })
                if session is not None:
                    session_id = f"interview:{session.pk}"
                    if session_id not in node_ids:
                        node_ids.add(session_id)
                        nodes.append({
                            "id": session_id,
                            "kind": "interview",
                            "label": (
                                f"{session.get_interview_type_display()} - "
                                f"Round {session.round_number}"
                            ),
                            "status": session.status,
                        })
                    links.append({
                        "source": session_id,
                        "target": claim_node_id,
                        "kind": "heard_in",
                    })
            else:
                graph_truncated = True
                claim_node_id = ""

            evidence_rows = []
            # Reverse OneToOne: raises RelatedObjectDoesNotExist (an
            # AttributeError subclass) when absent -> getattr default is safe.
            detail = getattr(claim, "evidence_detail", None)
            if detail is not None:
                doc = detail.document
                evidence_rows.append({
                    "id": detail.pk,
                    "type": (doc.document_type if doc else "verification"),
                    "source": (doc.file_name or doc.file_url) if doc else claim.get_source_display(),
                    "claimed_count": detail.claimed_count,
                    "documents_found": detail.documents_found,
                    "documents_signed": detail.documents_signed,
                    "unique_entities": detail.unique_entities,
                    "current_documents": detail.current_documents,
                    "commercial_intent_count": detail.commercial_intent_count,
                    "confidence": detail.confidence,
                    "flags": detail.flags or [],
                    "note": detail.verification_summary or {},
                    "verified_at": detail.verified_at.isoformat() if detail.verified_at else None,
                })
                if in_graph:
                    doc_id = f"evidence:{detail.pk}"
                    if doc_id not in node_ids:
                        node_ids.add(doc_id)
                        nodes.append({
                            "id": doc_id,
                            "kind": "evidence",
                            "label": evidence_rows[0]["source"],
                            "category": evidence_rows[0]["type"],
                            # An evidence node carries the claim's verification
                            # outcome — it is the link that says whether this
                            # document supports the claim or contradicts it.
                            "status": claim.verification_status,
                        })
                    links.append({
                        "source": claim_node_id,
                        "target": doc_id,
                        "kind": "contradicts" if claim.verification_status == "contradicted" else "supports",
                    })
            claims.append({
                "id": claim.pk,
                "claim_id": claim.claim_id,
                "statement": claim.claim_text,
                "category": claim.category,
                "materiality": claim.materiality,
                "source": claim.source,
                "interview": interview_info,
                "value": claim.verified_value if claim.verified_value else None,
                "founder_asserted": claim.founder_asserted,
                "evidence_status": claim.evidence_status,
                "verification_status": claim.verification_status,
                "discrepancy_notes": claim.discrepancy_notes,
                "verified_at": claim.verified_at.isoformat() if claim.verified_at else None,
                "evidence": evidence_rows,
                "used_by": used_by,
            })

        return Response({
            "application_id": application.pk,
            "company_name": application.startup_profile.company_name,
            "program": {"id": application.program_id, "name": application.program.name},
            "status": application.status,
            "graph": {
                "nodes": nodes,
                "links": links,
                "truncated": graph_truncated,
                "node_limit": GRAPH_NODE_LIMIT,
            },
            "claims": claims,
            "summary": counts,
        })


# ─────────────────────────────────────────────────────────────────────────────
# 5. Program Studio wizard
# ─────────────────────────────────────────────────────────────────────────────

class ProgramStudioSeedView(APIView):
    """Program Studio: create a configured program from an archetype in one
    call. POST {name, organization_name, archetype_slug?, program_type?}.

    Attaches the archetype (when given), seeds the default workflow graph via
    ``workflow_engine.ensure_default_graph``, and creates an active
    ``ProgramEvaluationPolicy`` from the archetype's defaults. All-or-nothing
    inside a single transaction."""

    permission_classes = [ReadOnlyOrAccelerator]

    def post(self, request):
        name = request.data.get("name")
        organization_name = request.data.get("organization_name")
        if not name or not organization_name:
            return Response(
                {"error": "name and organization_name are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        archetype = None
        archetype_slug = request.data.get("archetype_slug")
        if archetype_slug:
            archetype = ProgramArchetype.objects.filter(
                slug=archetype_slug
            ).first()
            if archetype is None:
                return Response(
                    {"error": f"Unknown archetype_slug '{archetype_slug}'."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        program_type = request.data.get("program_type")

        with transaction.atomic():
            program = AcceleratorProgram.objects.create(
                name=name,
                organization_name=organization_name,
                slug=_unique_slug(name),
                description=request.data.get("description", ""),
                program_type=program_type or "vc_accelerator",
                archetype=archetype,
                created_by=request.user,
                program_status="setup",
            )

            # Seed the deterministic default admissions spine.
            workflow_engine.ensure_default_graph(program)

            # Derive the initial active evaluation policy from the archetype
            # defaults (defensive: skip cleanly when there is no archetype).
            policy = None
            if archetype is not None:
                policy = ProgramEvaluationPolicy.objects.create(
                    program=program,
                    archetype=archetype,
                    version="v1.0",
                    is_active=True,
                    effective_from=timezone.now(),
                    created_by=request.user,
                    scoring_dimensions=archetype.default_scoring_dimensions or [],
                    outcome_weights=archetype.default_outcome_weights or {},
                    hard_gates=archetype.default_hard_gates or [],
                    milestone_policy=archetype.default_milestone_policy or {},
                    risk_thresholds=archetype.default_risk_thresholds or {},
                )

        logger.info(
            "program_studio_seeded program_id=%s archetype=%s by=%s",
            program.pk, archetype.slug if archetype else None,
            getattr(request.user, "email", request.user),
        )
        return Response({
            "program_id": program.pk,
            "name": program.name,
            "slug": program.slug,
            "archetype": archetype.slug if archetype else None,
            "evaluation_policy_id": policy.pk if policy else None,
            "workflow": {
                "stages": program.stages.count(),
                "transitions": program.transitions.count(),
            },
        }, status=status.HTTP_201_CREATED)


class ApplicationClaimViewSet(viewsets.ReadOnlyModelViewSet):
    """One founder claim, and the only place its verification state changes.

    The six states have been on the model since the first batch, and so have the
    readouts that count them: the review queue's open-claim number, the decision
    rail's contradicted exposure, the diligence progress denominator. What did not
    exist until now was a *writer*. Every path in the codebase stored `pending`
    and nothing moved a claim off it, so those counters were not wrong so much as
    permanently zero — and a zero that means "nobody has decided yet" renders on a
    screen as "nothing is wrong with these claims", which is a different fact.

    This closes that loop and keeps it closed by construction:

    * read is scoped by the application's program, so a claim outside the caller's
      reach answers 404 rather than as a row they may not act on;
    * the only write is this action, which takes a state and a reason — there is
      no `PATCH /claims/<id>/`, because a client-editable `verification_status`
      would let a record claim the outcome without the act that reached it;
    * the human who decided goes on the event, not on the row, because
      `ApplicationClaim` has no verifier column and inventing one on the readout
      would be an invented fact. The outbox row is who; the note is why; the
      timestamp is when.
    """

    serializer_class = ApplicationClaimSerializer
    # The role gate, not the reach gate. `ReadOnlyOrAccelerator` would open the
    # safe methods to any signed-in account, and `tenant_programs` hands an
    # account on the founder side every program that is open for intake — so a
    # founder would read the claims ledger of the whole public catalogue, other
    # founders' applications included. Publishing a program publishes its form and
    # its deadline; it does not publish what a reviewer concluded about the
    # numbers a founder quoted, which is what `discrepancy_notes` holds.
    permission_classes = [IsAcceleratorOrStaff]

    def get_queryset(self):
        return scope_rows_to_visible_programs(
            ApplicationClaim.objects.select_related(
                "application__program", "application__startup_profile",
                "source_document",
            ),
            self.request, "application__program",
        ).order_by(*materiality_ordering())

    @action(detail=True, methods=["post"], url_path="verification")
    def record_verification(self, request, pk=None):
        """Record what a named human concluded about a claim's evidence.

        The rules are the vocabulary's (see `evidence_state`): a state the model
        does not carry is refused by listing the ones it does; `verified` needs
        something attached to check the claim against, so the word cannot be spent
        on nothing; every other decision — including sending a decided claim back
        to `pending` — needs the reason in words, because a silent reopen looks
        exactly like a claim nobody ever examined.
        """
        claim = self.get_object()  # already inside the caller's reach, or 404
        serializer = ClaimVerificationSerializer(
            data=request.data, context={"claim": claim, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        state = serializer.validated_data["state"]
        note = serializer.validated_data["note"]
        was = claim.verification_status
        now = timezone.now()

        if note:
            entry = f"[{_person_label(request.user)} · {now.date().isoformat()}] {note}"
            # Appended rather than overwritten: the reason a claim was marked
            # contradicted in March is still the reason when a second document
            # moves it to verified in June, and the pair together is what a later
            # reader needs to judge the change.
            claim.discrepancy_notes = (
                f"{claim.discrepancy_notes}\n{entry}" if claim.discrepancy_notes else entry
            )
        claim.verification_status = state
        # The timestamp says a human settled it; going back to `pending` unsettles
        # the claim, so the stamp goes with the decision it recorded.
        claim.verified_at = None if state == evidence_state.PENDING else now
        claim.save(update_fields=["verification_status", "verified_at", "discrepancy_notes"])

        publish_event(
            claim.application.program, "claim_verification_recorded",
            application=claim.application, actor=request.user,
            payload={
                "claim_id": claim.pk, "claim_code": claim.claim_id,
                "from": was, "to": state, "note": note,
                "evidence_attached": evidence_state.corroborating_evidence(claim),
            },
        )
        return Response(self.get_serializer(claim).data)
