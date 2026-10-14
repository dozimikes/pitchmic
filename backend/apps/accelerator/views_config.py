"""
apps.accelerator.views_config
=============================
DRF viewsets for the Program OS configuration layer. Each maps to one of the
configurable subsystems (Workflow stages, Application forms, Communications,
custom data objects, roles, reports, event bus).

Read is available to any authenticated user, confined to the programs the account
can actually work in; every write requires an accelerator manager or staff *and*
names a program in that same scope, mirroring the admissions APIs. The
public-facing form render endpoint is the one exception and is intentionally
anonymous-friendly for the application portal.
"""
from __future__ import annotations

from django.db.models import Avg, Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import AcceleratorApplication
from .models_config import (
    CustomObject,
    CustomRecord,
    DashboardReport,
    EventOutbox,
    FormDefinition,
    FormResponse,
    Notification,
    NotificationTemplate,
    ProgramRole,
    ProgramStage,
    StageTransition,
)
from .models_os import ApplicationCycle, ProgramStaffMembership
from .permissions import IsAcceleratorOrStaff
from .program_policy import ProgramEvaluationPolicy
from .tenant import (
    TenantScopedWriteMixin,
    positive_int,
    program_visible_to,
    scope_to_visible_programs,
    tenant_programs,
)
from .workflows import publish_event
from .serializers_config import (
    ApplicationCycleSerializer,
    CustomObjectSerializer,
    CustomRecordSerializer,
    DashboardReportSerializer,
    EventOutboxSerializer,
    FormDefinitionSerializer,
    FormResponseSerializer,
    NotificationSerializer,
    NotificationTemplateSerializer,
    ProgramEvaluationPolicySerializer,
    ProgramRoleSerializer,
    ProgramStaffMembershipSerializer,
    ProgramStageSerializer,
    StageTransitionSerializer,
)


class ReadOnlyOrAccelerator(permissions.BasePermission):
    """Safe methods for any authenticated user; writes restricted to staff/accelerator."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return IsAcceleratorOrStaff().has_permission(request, view)



def _make_visibility(answers: dict):
    """Return predicate(cond) -> bool for a conditional-logic dict.

    Supported shapes (deterministic, string-compared):
      {} / falsy                         -> always visible
      {question: <id>, equals: <value>}  -> visible when answer == value
      {question: <id>, in: [<values>]}   -> visible when answer in values
      {question: <id>, truthy: true}     -> visible when answer is truthy
    """
    def predicate(cond):
        if not cond or not isinstance(cond, dict):
            return True
        qid = str(cond.get("question", ""))
        actual = answers.get(qid)
        if "equals" in cond:
            return str(actual) == str(cond["equals"])
        if "in" in cond:
            return str(actual) in [str(v) for v in cond.get("in", [])]
        if cond.get("truthy"):
            return bool(actual)
        return True
    return predicate


def _routing_match(question, answers: dict, val) -> dict:
    routing = question.routing or {}
    if not routing:
        return {}
    if "equals" in routing and str(val) == str(routing["equals"]):
        return {k: v for k, v in routing.items() if k.startswith("then_")}
    if "in" in routing and str(val) in [str(v) for v in routing.get("in", [])]:
        return {k: v for k, v in routing.items() if k.startswith("then_")}
    return {}


class ProgramStageViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = ProgramStageSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        return scope_to_visible_programs(ProgramStage.objects.all(), self.request).order_by("order", "id")


class StageTransitionViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = StageTransitionSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        return scope_to_visible_programs(
            StageTransition.objects.select_related("from_stage", "to_stage"), self.request
        ).order_by("order", "id")


class FormDefinitionViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = FormDefinitionSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        # A published form is the intake surface: it is the thing a founder opens
        # and fills in, so the public programs' published versions read to them.
        # Drafts and archives of a *private* program still read to nobody outside
        # the team that runs it.
        return scope_to_visible_programs(
            FormDefinition.objects.prefetch_related("sections__questions__options"),
            self.request,
            intake_visible=True,
        )

    def perform_create(self, serializer):
        self._assert_writable(serializer)  # overrides ModelViewSet's hook, so call the gate
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        """Draft -> published. Existing submissions referencing a prior published
        version keep it (immutability); the newest published version is what the
        portal renders next."""
        form = self.get_object()
        if form.status == "published":
            return Response({"error": "Already published."}, status=status.HTTP_400_BAD_REQUEST)
        if not form.sections.exists():
            return Response({"error": "Cannot publish an empty form."}, status=status.HTTP_400_BAD_REQUEST)
        FormDefinition.objects.filter(
            program=form.program, form_type=form.form_type, status="published"
        ).update(status="archived", is_default=False)
        form.status = "published"
        form.is_default = True
        form.published_at = timezone.now()
        form.save(update_fields=["status", "is_default", "published_at", "updated_at"])
        return Response(self.get_serializer(form).data)

    @action(detail=True, methods=["post"], url_path="new-version")
    def new_version(self, request, pk=None):
        """Clone a published form into an editable higher-numbered draft."""
        form = self.get_object()
        clone = FormDefinition.objects.create(
            program=form.program, name=form.name, form_type=form.form_type,
            version=form.version + 1, status="draft", description=form.description,
            created_by=request.user,
        )
        for old_section in form.sections.all():
            old_questions = list(old_section.questions.all())
            old_section.pk = None
            old_section.id = None
            old_section.form = clone
            old_section.save()
            for old_q in old_questions:
                old_options = list(old_q.options.all())
                old_q.pk = None
                old_q.id = None
                old_q.section = old_section
                old_q.save()
                for old_o in old_options:
                    old_o.pk = None
                    old_o.id = None
                    old_o.question = old_q
                    old_o.save()
        clone = FormDefinition.objects.prefetch_related("sections__questions__options").get(pk=clone.pk)
        return Response(FormDefinitionSerializer(clone).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="render", permission_classes=[permissions.AllowAny])
    def render(self, request, pk=None):
        """The portal-facing form structure (anonymous allowed)."""
        return Response(_render_form(self.get_object()))


def _render_form(form):
    sections = []
    for s in form.sections.order_by("order", "id"):
        questions = []
        for q in s.questions.order_by("order", "id"):
            questions.append({
                "id": q.id, "label": q.label, "help_text": q.help_text,
                "field_type": q.field_type, "required": q.required,
                "character_limit": q.character_limit, "validation": q.validation,
                "visible_if": q.visible_if, "required_if": q.required_if,
                "options": [{"label": o.label, "value": o.value} for o in q.options.order_by("order", "id")],
            })
        sections.append({
            "id": s.id, "name": s.name, "description": s.description,
            "visible_if": s.visible_if, "questions": questions,
        })
    return {
        "id": form.id, "name": form.name, "form_type": form.form_type,
        "version": form.version, "status": form.status, "sections": sections,
    }


class FormResponseViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = FormResponseSerializer
    queryset = FormResponse.objects.all()
    permission_classes = [ReadOnlyOrAccelerator]
    # An answer is work done inside a program, not a change to how it judges
    # founders, so the wider (visible) rule applies.
    program_write_rule = "visible"
    program_source = "form__program"

    def get_queryset(self):
        # Answers are the most personal rows in this layer — a founder's numbers —
        # and they hang off a form, not a program, so the tenant test goes through
        # `form__program`. A founder reading this table is reading their own
        # autosave, and nobody else's: the row is theirs because they answered it.
        return scope_to_visible_programs(
            FormResponse.objects.select_related("form", "application"), self.request,
            program_field="form__program",
            founder_field="respondent",
            # There is no `created_at` on this model: an autosave row's newest
            # touch is what a reviewer sorts by, and unlike `submitted_at` it is
            # never null (which would put unsent drafts at the top of the list).
        ).order_by("-last_saved_at")

    @action(detail=False, methods=["post"], url_path="submit")
    def submit(self, request):
        """Validate a founder's answers against the form's conditional logic
        (only questions visible for the given answers are required) and apply any
        dynamic routing. Deterministic — no AI decides eligibility."""
        form_id = request.data.get("form")
        answers = request.data.get("answers") or {}
        application_id = request.data.get("application")
        try:
            form = FormDefinition.objects.prefetch_related("sections__questions__options").get(pk=form_id)
        except (FormDefinition.DoesNotExist, ValueError, TypeError):
            return Response({"error": "Unknown form."}, status=status.HTTP_404_NOT_FOUND)
        if not program_visible_to(form.program, request.user):
            # Answered exactly like a form that does not exist. Anything else is a
            # leak in two directions: it confirms another team's form id, and the
            # required-field errors below would enumerate their questions.
            return Response({"error": "Unknown form."}, status=status.HTTP_404_NOT_FOUND)

        if application_id in (None, ""):
            application = None
        else:
            application = AcceleratorApplication.objects.filter(
                pk=positive_int(application_id, "application")).first()
            if application is None or not program_visible_to(application.program, request.user):
                # Refused rather than dropped: filing a response under no
                # application would be a false fact about whose answers these are.
                return Response(
                    {"error": "Unknown application.", "application": "Unknown application."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        is_visible = _make_visibility(answers)
        errors = {}
        routes = []
        for section in form.sections.all():
            if not is_visible(section.visible_if):
                continue
            for q in section.questions.all():
                if not is_visible(q.visible_if):
                    continue
                required = q.required or is_visible(q.required_if)
                val = answers.get(str(q.id))
                if required and (val is None or val == "" or val == []):
                    errors[str(q.id)] = "This field is required."
                if q.routing:
                    hit = _routing_match(q, answers, val)
                    if hit:
                        routes.append({"question": q.id, **hit})

        if errors:
            return Response({"error": "Validation failed.", "fields": errors},
                            status=status.HTTP_400_BAD_REQUEST)

        resp = FormResponse.objects.create(
            form=form,
            application=application,
            respondent=request.user if request.user.is_authenticated else None,
            answers=answers,
            status="submitted",
            submitted_at=timezone.now(),
        )
        return Response({
            "id": resp.id, "status": resp.status,
            "routing": routes,
            "complete": True,
        })


class NotificationTemplateViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = NotificationTemplateSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        return scope_to_visible_programs(NotificationTemplate.objects.all(), self.request).order_by("key")


class NotificationViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [ReadOnlyOrAccelerator]
    http_method_names = ["get", "post", "patch", "head", "options"]
    # Notifying someone about an application is work inside a program, not a
    # change to its methodology.
    program_write_rule = "visible"

    def get_queryset(self):
        qs = Notification.objects.all()
        mine = self.request.query_params.get("mine")
        if mine:
            qs = qs.filter(recipient=self.request.user)
        scoped = scope_to_visible_programs(qs, self.request)
        user = self.request.user
        if tenant_programs(user) is not None:
            # A row addressed to you is yours even if its program stops being
            # visible to you — an inbox that empties because someone flipped
            # `is_public` is not a privacy fix.
            scoped = qs.filter(Q(pk__in=scoped) | Q(recipient=user))
        return scoped.order_by("-created_at")

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        n = self.get_object()
        n.status = "read"
        n.save(update_fields=["status"])
        return Response({"status": n.status})


class ApplicationCycleViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """Intake windows for a program — the cycle a founder applies *into*.

    Reads are confined to programs the account can actually work in, so listing
    cycles cannot walk another organization's schedule.

    Writes take the `manage` rule, which is narrower than the read rule and is
    the whole point here: opening, moving or closing someone else's intake window
    is changing how their pipeline runs, and `is_public` puts a program on the
    catalogue for founders rather than handing its schedule to every accelerator
    account that can see it.

    DELETE is refused while applications point at the cycle. That link is
    ``SET_NULL``, so deleting would quietly detach rows reviewers are working
    on; ARCHIVED closes the same cycle without breaking the link.
    """

    serializer_class = ApplicationCycleSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        # The shared scoper rather than a hand-rolled `program__in`: it is what
        # gives staff the whole platform, and what refuses a malformed
        # `?program_id=` by name instead of raising inside the filter. A cycle is
        # intake-facing — it is the window a founder applies into and the only
        # schedule their own portal can honestly quote — so a founder reads the
        # windows of the programs open for intake, and no others.
        qs = scope_to_visible_programs(ApplicationCycle.objects.all(), self.request,
                                       intake_visible=True)
        # Newest first. The schedule fields are nullable and a NULLS-LAST sort
        # means a different order per backend, so the stable key wins.
        return qs.order_by("-created_at")

    def destroy(self, request, *args, **kwargs):
        cycle = self.get_object()
        linked = cycle.applications.count()
        if linked:
            return Response(
                {
                    "detail": (
                        f"{linked} application(s) are linked to this cycle, so "
                        "deleting it would detach them. Set its status to "
                        "ARCHIVED to close it and keep the link."
                    ),
                    "application_count": linked,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)


class CustomObjectViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = CustomObjectSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        return scope_to_visible_programs(CustomObject.objects.prefetch_related("fields"), self.request).order_by("name")


class CustomRecordViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = CustomRecordSerializer
    permission_classes = [ReadOnlyOrAccelerator]
    # A record is data captured about an application, not a change to the
    # pipeline's design, so the wider (visible) rule applies. Its program is the
    # custom object's, not its own.
    program_write_rule = "visible"
    program_source = "custom_object__program"

    def get_queryset(self):
        qs = CustomRecord.objects.all()
        cid = self.request.query_params.get("custom_object_id")
        if cid:
            qs = qs.filter(custom_object_id=positive_int(cid, "custom_object_id"))
        # A record has no program of its own — it inherits one through the custom
        # object it belongs to — so the tenant test walks that join rather than
        # trusting `custom_object_id`, which is the caller's to set.
        return scope_to_visible_programs(qs, self.request, program_field="custom_object__program").order_by("-created_at")

    def perform_create(self, serializer):
        self._assert_writable(serializer)  # overrides ModelViewSet's hook, so call the gate
        serializer.save(created_by=self.request.user)


class ProgramRoleViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = ProgramRoleSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        # Scoped like every sibling config table: one program's role list is not
        # every program's, and this screen edits what it shows.
        return scope_to_visible_programs(ProgramRole.objects.all(), self.request).order_by("name")


class ProgramStaffMembershipViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    """The program's own team: which people it has seated, and in what role.

    This is the surface that makes a multi-person pipeline possible. Until it
    existed the roster was read by three endpoints (`candidates`, the role
    member counts, the reach rule itself) and written by none, so an active
    membership was a fact only a database shell could create.

    Read is scoped like every sibling config table — a team list names people,
    so it belongs to the programs the caller works in and to nobody else. Write
    takes the `manage` rule, which is the point of the split: seating someone is
    granting them reach, and only the account that made the program — or platform
    staff — may hand that out. A seat therefore cannot be claimed.

    Seating and unseating are published to the outbox with the acting human
    attached. The membership row has no actor column, so without this there would
    be no answer to "who put this person on the team"; the event bus is where
    that answer lives rather than a name invented on the row.
    """

    serializer_class = ProgramStaffMembershipSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        return scope_to_visible_programs(
            ProgramStaffMembership.objects.select_related("user", "program"),
            self.request,
        ).order_by("role", "user__first_name", "user__last_name", "user__email")

    def perform_create(self, serializer):
        self._assert_writable(serializer)  # this hook overrides the mixin's, so call the gate
        membership = serializer.save()
        publish_event(
            membership.program, "program_staff_seated", actor=self.request.user,
            payload={
                "membership_id": membership.pk,
                "member_id": membership.user_id,
                "role": membership.role,
                "is_active": membership.is_active,
            },
        )

    def perform_update(self, serializer):
        self._assert_writable(serializer)  # as above: the gate, or a PATCH is ungated
        was_active = serializer.instance.is_active
        was_role = serializer.instance.role
        membership = serializer.save()
        if was_active != membership.is_active or was_role != membership.role:
            publish_event(
                membership.program,
                "program_staff_seat_revoked" if not membership.is_active
                else "program_staff_seat_changed",
                actor=self.request.user,
                payload={
                    "membership_id": membership.pk,
                    "member_id": membership.user_id,
                    "from": {"role": was_role, "is_active": was_active},
                    "to": {"role": membership.role, "is_active": membership.is_active},
                },
            )

    def perform_destroy(self, instance):
        program, payload = instance.program, {
            "membership_id": instance.pk,
            "member_id": instance.user_id,
            "role": instance.role,
        }
        super().perform_destroy(instance)
        publish_event(program, "program_staff_unseated", actor=self.request.user,
                      payload=payload)

    @action(detail=False, methods=["get"], url_path="role-options")
    def role_options(self, request):
        """The role codes a seat may carry, straight off the model's choices.

        The screen used to type its own list, which is how a roster ended up
        holding codes nothing could count and a picker offered titles the
        database refused.
        """
        field = ProgramStaffMembership._meta.get_field("role")
        return Response([
            {"value": code, "label": label} for code, label in field.choices
        ])


class DashboardReportViewSet(TenantScopedWriteMixin, viewsets.ModelViewSet):
    serializer_class = DashboardReportSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        return scope_to_visible_programs(DashboardReport.objects.all(), self.request).order_by("name")

    def perform_create(self, serializer):
        self._assert_writable(serializer)  # overrides ModelViewSet's hook, so call the gate
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["get"], url_path="data")
    def data(self, request, pk=None):
        """Compute a report from live metric snapshots according to the saved
        definition. This is the analytics-builder execution endpoint."""
        report = self.get_object()
        from .models_os import MetricSnapshot
        qs = MetricSnapshot.objects.filter(membership__program=report.program)
        for key, value in (report.filters or {}).items():
            qs = qs.filter(**{key: value})
        rows = list(
            qs.values("period_label").annotate(value=Avg("readiness_score")).order_by("period_label")
        )
        return Response({
            "report": report.name, "metric": report.metric,
            "visualization": report.visualization, "rows": rows,
        })


class ProgramEvaluationPolicyViewSet(viewsets.ReadOnlyModelViewSet):
    """The evaluation policies a program's scores are anchored to.

    Two deliberate differences from the rest of this layer. It is read-only,
    because a policy version is a record of how past decisions were made rather
    than a setting to tweak. And it is scoped by the programs the account may
    work in, not by the `program_id` query parameter alone: a policy names the
    weights another accelerator judged founders by, so a request that omits
    `program_id` has to mean "my programs", never "every program".
    """

    serializer_class = ProgramEvaluationPolicySerializer
    permission_classes = [IsAcceleratorOrStaff]

    def get_queryset(self):
        # Same scoper as the rest of this layer: staff oversee every program's
        # policies, an accelerator sees the programs it works in, and a
        # `?program_id=` can only narrow that — never name a foreign program.
        qs = scope_to_visible_programs(
            ProgramEvaluationPolicy.objects.select_related("created_by"),
            self.request,
        )
        return qs.order_by("-is_active", "-created_at")


class EventOutboxViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EventOutboxSerializer
    permission_classes = [ReadOnlyOrAccelerator]

    def get_queryset(self):
        return scope_to_visible_programs(EventOutbox.objects.all(), self.request).order_by("-occurred_at")
