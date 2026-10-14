"""
apps.accelerator.serializers_config
===================================
Serializers for the Program OS configuration layer (Workflow stages, Application
form builder, Communications templates, custom data objects, roles, reports).
Kept separate from the admissions serializers to make the CMS surface legible.
"""
from __future__ import annotations

import re

from django.utils import timezone
from rest_framework import serializers

from .models import AcceleratorProgram
from .models_config import (
    CustomObject,
    CustomObjectField,
    CustomRecord,
    DashboardReport,
    EventOutbox,
    FormDefinition,
    FormQuestion,
    FormResponse,
    FormSection,
    Notification,
    NotificationTemplate,
    ProgramRole,
    ProgramStage,
    QuestionOption,
    StageTransition,
)
from .models_os import ApplicationCycle, ExternalIntakeSubmission, ProgramStaffMembership
from .permissions import runs_a_program
from .program_policy import ProgramEvaluationPolicy
from .serializers import cohort_runtime


def _program_id_field():
    return serializers.PrimaryKeyRelatedField(
        queryset=AcceleratorProgram.objects.all(), source="program", write_only=True
    )


# ─── Workflow OS: stages + transitions ────────────────────────────────────────

class QuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionOption
        fields = ["id", "label", "value", "order"]


class FormQuestionSerializer(serializers.ModelSerializer):
    options = QuestionOptionSerializer(many=True, required=False)

    class Meta:
        model = FormQuestion
        fields = [
            "id", "label", "help_text", "field_type", "required", "order",
            "character_limit", "validation", "visible_if", "required_if",
            "routing", "config", "options",
        ]

    def create(self, validated_data):
        options = validated_data.pop("options", [])
        question = FormQuestion.objects.create(**validated_data)
        for o in options:
            QuestionOption.objects.create(question=question, **o)
        return question

    def update(self, instance, validated_data):
        options = validated_data.pop("options", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if options is not None:
            instance.options.all().delete()
            for o in options:
                QuestionOption.objects.create(question=instance, **o)
        return instance


class FormSectionSerializer(serializers.ModelSerializer):
    questions = FormQuestionSerializer(many=True, required=False)

    class Meta:
        model = FormSection
        fields = ["id", "name", "description", "order", "visible_if", "questions"]

    def _write_children(self, section, questions):
        for q in questions:
            opts = q.pop("options", [])
            cq = FormQuestion.objects.create(section=section, **q)
            for o in opts:
                QuestionOption.objects.create(question=cq, **o)

    def create(self, validated_data):
        questions = validated_data.pop("questions", [])
        section = FormSection.objects.create(**validated_data)
        self._write_children(section, questions)
        return section

    def update(self, instance, validated_data):
        questions = validated_data.pop("questions", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if questions is not None:
            instance.questions.all().delete()
            self._write_children(instance, questions)
        return instance


class FormDefinitionSerializer(serializers.ModelSerializer):
    sections = FormSectionSerializer(many=True, required=False)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = FormDefinition
        fields = [
            "id", "program_id", "name", "form_type", "version", "status",
            "description", "is_default", "published_at", "sections",
            "question_count", "created_at", "updated_at",
        ]
        read_only_fields = ["published_at", "created_at", "updated_at", "version"]

    program_id = _program_id_field()

    def get_question_count(self, obj):
        return FormQuestion.objects.filter(section__form=obj).count()

    def create(self, validated_data):
        sections = validated_data.pop("sections", [])
        form = FormDefinition.objects.create(**validated_data)
        for s in sections:
            qs = s.pop("questions", [])
            section = FormSection.objects.create(form=form, **s)
            for q in qs:
                opts = q.pop("options", [])
                cq = FormQuestion.objects.create(section=section, **q)
                for o in opts:
                    QuestionOption.objects.create(question=cq, **o)
        return form

    def update(self, instance, validated_data):
        if instance.status == "published":
            raise serializers.ValidationError(
                "Published forms are immutable. Clone to a new draft version to edit."
            )
        sections = validated_data.pop("sections", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if sections is not None:
            instance.sections.all().delete()
            for s in sections:
                qs = s.pop("questions", [])
                section = FormSection.objects.create(form=instance, **s)
                for q in qs:
                    opts = q.pop("options", [])
                    cq = FormQuestion.objects.create(section=section, **q)
                    for o in opts:
                        QuestionOption.objects.create(question=cq, **o)
        return instance


class FormResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormResponse
        fields = ["id", "form", "application", "answers", "status", "last_saved_at", "submitted_at"]
        read_only_fields = ["last_saved_at", "submitted_at"]


# ─── Workflow OS stage/transition ─────────────────────────────────────────────

class ProgramStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgramStage
        fields = [
            "id", "program_id", "name", "slug", "type", "description", "order",
            "is_entry", "is_terminal", "entry_conditions", "exit_conditions",
            "deadline_days", "permissions", "config",
        ]
        read_only_fields = ["created_at", "updated_at"]

    program_id = _program_id_field()


class StageTransitionSerializer(serializers.ModelSerializer):
    from_slug = serializers.CharField(source="from_stage.slug", read_only=True)
    to_slug = serializers.CharField(source="to_stage.slug", read_only=True)

    class Meta:
        model = StageTransition
        fields = [
            "id", "program_id", "from_stage", "to_stage", "from_slug", "to_slug",
            "label", "condition", "requires_approval", "order",
        ]

    program_id = _program_id_field()


# ─── Communications OS ────────────────────────────────────────────────────────

class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = ["id", "program_id", "key", "name", "channel", "subject", "body", "is_active"]
        read_only_fields = ["created_at", "updated_at"]

    program_id = _program_id_field()


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id", "program", "application", "template_key", "channel",
            "subject", "body", "status", "sent_at", "created_at",
        ]
        read_only_fields = ["created_at", "sent_at", "status"]


# ─── Custom data objects ──────────────────────────────────────────────────────

class CustomObjectFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomObjectField
        fields = ["id", "name", "key", "field_type", "required", "order"]


class CustomObjectSerializer(serializers.ModelSerializer):
    fields = CustomObjectFieldSerializer(many=True, required=False)

    class Meta:
        model = CustomObject
        fields = ["id", "program_id", "name", "slug", "description", "icon", "fields", "created_at"]
        read_only_fields = ["created_at"]

    program_id = _program_id_field()

    def create(self, validated_data):
        fields = validated_data.pop("fields", [])
        obj = CustomObject.objects.create(**validated_data)
        for f in fields:
            CustomObjectField.objects.create(custom_object=obj, **f)
        return obj

    def update(self, instance, validated_data):
        fields = validated_data.pop("fields", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if fields is not None:
            instance.fields.all().delete()
            for f in fields:
                CustomObjectField.objects.create(custom_object=instance, **f)
        return instance


class CustomRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomRecord
        fields = ["id", "custom_object", "application", "membership", "data", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate(self, attrs):
        """The record lives in its object's program, so the founder or
        application it points at has to live in that same program.

        `custom_object` is what the tenant guard reads; `application` and
        `membership` are plain ids this viewset's queryset never resolves, so a
        mismatch would attach one team's founder to another team's table.
        """
        attrs = super().validate(attrs)
        custom_object = attrs.get("custom_object") or getattr(self.instance, "custom_object", None)
        if custom_object is None:
            return attrs
        program_id = custom_object.program_id
        for key, label in (("application", "application"), ("membership", "cohort member")):
            related = attrs.get(key, getattr(self.instance, key, None))
            if related is None:
                continue
            if related.program_id != program_id:
                raise serializers.ValidationError({
                    key: f"That {label} belongs to a different program than this "
                         "custom object, so a record here would join two tenants."
                })
        return attrs


# ─── Roles ────────────────────────────────────────────────────────────────────

def _role_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


# The staff roster stores one of a fixed set of role codes; a ProgramRole slug
# is free text a director types. Nothing links the two, so the join is by name:
# a slug counts only when it folds onto a code or that code's own label
# ("program-director" -> "director"), and one that folds nowhere has no rows to
# count. Read off the model's choices so the lists cannot drift apart.
STAFF_ROLE_BY_KEY = {
    key: code
    for code, label in ProgramStaffMembership._meta.get_field("role").choices
    for key in (_role_key(code), _role_key(label))
}


class ProgramRoleSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = ProgramRole
        fields = [
            "id", "program_id", "name", "slug", "description",
            "permissions", "field_visibility", "is_system", "member_count",
        ]

    program_id = serializers.PrimaryKeyRelatedField(
        queryset=AcceleratorProgram.objects.all(), source="program",
        write_only=True, required=False, allow_null=True,
    )

    def get_member_count(self, obj):
        """How many active staff hold this role in this program, or None.

        None is "not knowable", which is not the same as zero: the role is
        organization-wide, so its people sit in no single program, or its slug
        folds onto no code the staff roster can carry. The roles screen used to
        count ``ProgramMembership`` instead — startups attached to cohorts, a
        table with no role field at all — so every role read "0 Active" no
        matter who was actually on staff.
        """
        code = STAFF_ROLE_BY_KEY.get(_role_key(obj.slug))
        if code is None or obj.program_id is None:
            return None
        return ProgramStaffMembership.objects.filter(
            program_id=obj.program_id, role=code, is_active=True,
        ).count()


class ProgramStaffMembershipSerializer(serializers.ModelSerializer):
    """One human's seat on a program's own team.

    A seat is the only way a second person comes to work a program they did not
    create: `permissions.programs_visible_to` reads an active membership as a
    read-and-work grant, so this row is what turns "I run this pipeline" into
    "we run this pipeline". It stops there — configuring how the program judges
    founders stays with `created_by` (`program_write_rule = "manage"` on the
    viewset below), which is why a seat can be handed out without also handing
    over the methodology.

    A seat always names a program: the model's own column is non-null, and a
    platform-wide seat is not a thing a program's owner can grant.

    Two columns the model carries are deliberately not exposed: `scope` and
    `permissions`. Nothing in the request path reads either one, so a screen
    that edited them would advertise an enforcement that does not exist — today
    a seat is program-wide. And there is no actor column on the model, so this
    reports when a seat was written (`member_since`) and not who wrote it; a
    timestamp is a fact here and an attributable name would be a guess.
    """

    STAFF_ROLES = dict(
        (code, label)
        for code, label in ProgramStaffMembership._meta.get_field("role").choices
    )

    program_id = serializers.PrimaryKeyRelatedField(
        queryset=AcceleratorProgram.objects.all(), source="program",
        write_only=True,
    )
    user_name = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    role_label = serializers.SerializerMethodField()
    member_since = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = ProgramStaffMembership
        fields = [
            "id", "program_id", "user", "user_name", "user_email",
            "role", "role_label", "is_active", "member_since",
        ]
        read_only_fields = ["id"]

    def get_user_name(self, obj):
        full = f"{obj.user.first_name or ''} {obj.user.last_name or ''}".strip()
        return full or obj.user.email

    def get_user_email(self, obj):
        return obj.user.email

    def get_role_label(self, obj):
        return self.STAFF_ROLES.get(obj.role, obj.role)

    def validate_user(self, value):
        if not runs_a_program(value):
            raise serializers.ValidationError(
                "Only an account on the operating side of a pipeline (accelerator, "
                "investor, or platform staff) can hold a program seat. A founder "
                "seated here would read the program's whole record layer."
            )
        if not value.is_active:
            raise serializers.ValidationError(
                "That account is deactivated. A seat for it is a grant waiting to "
                "be reinstated, so it is not recorded."
            )
        return value

    def validate(self, attrs):
        user = attrs.get("user", self.instance and self.instance.user)
        program = attrs.get("program", self.instance and self.instance.program)
        role = attrs.get("role", self.instance and self.instance.role)
        if user is not None and program is not None:
            taken = ProgramStaffMembership.objects.filter(
                user=user, program=program, role=role,
            )
            if self.instance is not None:
                taken = taken.exclude(pk=self.instance.pk)
            if taken.exists():
                raise serializers.ValidationError(
                    {"user": "That person already holds this seat in this program."}
                )
        return attrs


# ─── Application cycles ───────────────────────────────────────────────────────

class ApplicationCycleSerializer(serializers.ModelSerializer):
    """One intake window inside a program — the unit a founder applies *to*.

    A program's own ``cohort_start_date``/``cohort_end_date`` describe the one
    cohort the header chip tracks; a cycle carries its own schedule because a
    program can run several windows. Nothing here copies one into the other, and
    nothing guesses: an unset date stays ``null`` and renders as a dash, and
    ``target_cohort_size`` is required on create because the model's ``default=15``
    is what an unplanned cycle looks like, not what a director decided.

    ``scheduled_window`` reports only what the two dates say, which is not the
    same as being able to receive: a cycle also needs an intake key before an
    accelerator's own website can post into it. ``intake_open`` says whether that
    key exists — never the key itself, which is stored hashed and shown once when
    it is issued.
    """

    application_count = serializers.SerializerMethodField()
    accepted_count = serializers.SerializerMethodField()
    scheduled_window = serializers.SerializerMethodField()
    days_until_deadline = serializers.SerializerMethodField()
    cohort_runtime = serializers.SerializerMethodField()
    intake_open = serializers.SerializerMethodField()
    intake_key = serializers.SerializerMethodField()
    staged_count = serializers.SerializerMethodField()

    class Meta:
        model = ApplicationCycle
        fields = [
            "id", "program_id", "name", "cycle_code", "status", "intake_type",
            "open_date", "deadline", "cohort_start_date", "cohort_end_date",
            "target_cohort_size", "application_count", "accepted_count",
            "staged_count", "scheduled_window", "days_until_deadline",
            "cohort_runtime", "intake_open", "intake_key",
            "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]
        extra_kwargs = {"target_cohort_size": {"required": True}}

    program_id = _program_id_field()

    def validate(self, attrs):
        """Reject schedules that cannot be true, rather than storing them.

        Partial updates fall back to the stored value, so PATCHing one end of a
        window cannot smuggle an inverted range past the check.
        """
        def either(key):
            if key in attrs:
                return attrs[key]
            return getattr(self.instance, key, None)

        open_date, deadline = either("open_date"), either("deadline")
        if open_date and deadline and deadline <= open_date:
            raise serializers.ValidationError({
                "deadline": "The deadline has to fall after the window opens."
            })
        start, end = either("cohort_start_date"), either("cohort_end_date")
        if start and end and end < start:
            raise serializers.ValidationError({
                "cohort_end_date": "The cohort cannot end before it starts."
            })
        return attrs

    def get_application_count(self, obj):
        return obj.applications.count()

    def get_accepted_count(self, obj):
        return obj.applications.filter(status="ACCEPTED").count()

    def get_scheduled_window(self, obj):
        now = timezone.now()
        if obj.open_date is None and obj.deadline is None:
            return {"state": "unscheduled", "opens_at": None, "closes_at": None}
        if obj.open_date and now < obj.open_date:
            state = "not_yet_open"
        elif obj.deadline and now > obj.deadline:
            state = "past_deadline"
        else:
            state = "inside_window"
        return {
            "state": state,
            "opens_at": obj.open_date.isoformat() if obj.open_date else None,
            "closes_at": obj.deadline.isoformat() if obj.deadline else None,
        }

    def get_days_until_deadline(self, obj):
        if obj.deadline is None:
            return None
        return max(0, (obj.deadline - timezone.now()).days)

    def get_cohort_runtime(self, obj):
        # Same function the program chip uses, so the two cannot disagree about
        # what "week 3" means for the same pair of dates.
        return cohort_runtime(obj)

    def get_intake_open(self, obj):
        return bool(obj.intake_key_hash)

    def get_intake_key(self, obj):
        """Enough to recognise the live key; the key itself was shown once, at issue.

        ``set_by``/``set_at`` stay because a door that someone opened should have
        a name and a time attached to it.
        """
        if not obj.intake_key_hash:
            return None
        return {
            "hint": obj.intake_key_hint or None,
            "issued_at": obj.intake_key_set_at,
            "issued_by": (
                {"id": obj.intake_key_set_by_id, "email": obj.intake_key_set_by.email}
                if obj.intake_key_set_by_id else None
            ),
        }

    def get_staged_count(self, obj):
        return obj.intake_submissions.filter(status="staged").count()


# ─── External intake (staged submissions) ─────────────────────────────────────

class ExternalIntakeSubmissionSerializer(serializers.ModelSerializer):
    """A submission received from outside the dashboard, as a reviewer sees it.

    Read-only by design: nothing in this screen is edited into existence. A row
    is created by the cycle's intake key or by an import, and it leaves
    ``staged`` only through accept or dismiss, both of which record who did it.
    ``issues`` and ``blocking_gaps`` describe the row; they never decide it.
    """

    program_id = serializers.IntegerField(source="program.id", read_only=True)
    program_name = serializers.CharField(source="program.name", read_only=True)
    cycle_id = serializers.SerializerMethodField()
    cycle_name = serializers.SerializerMethodField()
    application_id = serializers.SerializerMethodField()
    blocking_gaps = serializers.SerializerMethodField()
    can_accept = serializers.SerializerMethodField()
    decided_by = serializers.SerializerMethodField()
    payload = serializers.SerializerMethodField()

    class Meta:
        model = ExternalIntakeSubmission
        fields = [
            "id", "program_id", "program_name", "cycle_id", "cycle_name",
            "source", "external_id", "founder_email", "founder_name",
            "company_name", "status", "issues", "blocking_gaps", "can_accept",
            "note", "batch_ref", "payload", "application_id",
            "decided_by", "decided_at", "created_at",
        ]

    def get_cycle_id(self, obj):
        return obj.cycle_id  # null when it arrived before a window was decided

    def get_cycle_name(self, obj):
        return obj.cycle.name if obj.cycle_id else None

    def get_application_id(self, obj):
        return obj.application_id

    def get_blocking_gaps(self, obj):
        return obj.blocking_gaps()

    def get_can_accept(self, obj):
        return obj.status == "staged" and not obj.blocking_gaps()

    def get_decided_by(self, obj):
        if not obj.decided_by_id:
            return None
        return {"id": obj.decided_by_id, "email": obj.decided_by.email}

    def get_payload(self, obj):
        # Keys are the importer's own column headings, so the payload is shown
        # rather than re-labelled: renaming a founder's answer is a guess.
        return obj.raw_payload or {}


# ─── Evaluation policy (the versioned methodology a program scores by) ────────

class ProgramEvaluationPolicySerializer(serializers.ModelSerializer):
    """A stored evaluation policy, with its fields named as the model names them.

    Read-only wherever it is exposed. A policy's version is what each decision is
    anchored to in the Decision Ledger, so patching `scoring_dimensions` on an
    active policy would silently re-write the meaning of the decisions already
    recorded against that version.
    """

    created_by_email = serializers.SerializerMethodField()

    class Meta:
        model = ProgramEvaluationPolicy
        fields = [
            "id", "program", "version", "is_active", "effective_from", "created_at",
            "scoring_dimensions", "min_reviewers_per_application", "review_rounds",
            "created_by_email",
        ]
        read_only_fields = fields

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by_id else None


# ─── Reports / analytics ──────────────────────────────────────────────────────

class DashboardReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = DashboardReport
        fields = [
            "id", "program_id", "name", "description", "metric", "filters",
            "group_by", "compare", "visualization", "is_public_to_org",
        ]

    program_id = _program_id_field()


# ─── Event bus (read-only observability) ──────────────────────────────────────

class EventOutboxSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventOutbox
        fields = [
            "id", "program", "application", "event_type", "payload",
            "status", "occurred_at", "processed_at",
        ]
        read_only_fields = fields
