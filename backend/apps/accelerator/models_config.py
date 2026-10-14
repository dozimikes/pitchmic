"""
apps.accelerator.models_config
==============================
Program OS — configurable "Program CMS" layer.

These models back the promise that "anything that represents an accelerator's
methodology is configurable, anything that is Pitchmic infrastructure is
standardized". They are the mutable design-time objects that drive runtime
behaviour through :class:`~apps.accelerator.program_runtime.ProgramRuntime`.

Design principles carried from the spec:
  * Core entities stay relational; only flexible payloads use JSON.
  * Everything that a founder relied on is versioned / snapshotted, never
    silently overwritten (draft -> published, published rows are immutable).
  * The database is the source of truth; the event bus records intent, and the
    Communications / automation layers consume it. Nothing here makes an
    admission decision by itself.

Foreign keys use string references (``to='accelerator.X'``) so import order
never matters. Registered under the ``accelerator`` app label because this
module lives under ``apps.accelerator``.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models


# ─────────────────────────────────────────────────────────────────────────────
# 03 — WORKFLOW OS : configurable stages + transitions
# ─────────────────────────────────────────────────────────────────────────────

class ProgramStage(models.Model):
    """A configurable lifecycle stage. Not hard-coded 'Interview' — a generic
    stage the accelerator names, orders and types freely."""

    STAGE_TYPE_CHOICES = [
        ("form", "Form"),
        ("screening", "Screening"),
        ("review", "Review"),
        ("interview", "Interview"),
        ("assessment", "Assessment"),
        ("due_diligence", "Due Diligence"),
        ("committee", "Committee"),
        ("approval", "Approval"),
        ("milestone", "Milestone"),
        ("event", "Event"),
        ("workshop", "Workshop"),
        ("custom", "Custom"),
    ]

    program = models.ForeignKey(
        related_name="stages", on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
    )
    name = models.CharField(verbose_name="stage name", max_length=120)
    slug = models.CharField(verbose_name="stage slug", max_length=50)
    type = models.CharField(max_length=30, choices=STAGE_TYPE_CHOICES, default="custom")
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    is_entry = models.BooleanField(
        default=False, help_text="Applications start here on submission."
    )
    is_terminal = models.BooleanField(
        default=False, help_text="A decision state; nothing follows it."
    )
    entry_conditions = models.JSONField(
        blank=True, default=dict,
        help_text="Deterministic gate to ENTER this stage. e.g. {eligibility_passed: true}",
    )
    exit_conditions = models.JSONField(blank=True, default=dict)
    deadline_days = models.PositiveIntegerField(
        null=True, blank=True, help_text="Auto-deadline measured from entry."
    )
    permissions = models.JSONField(
        blank=True, default=dict,
        help_text="Role -> allowed actions for this stage.",
    )
    config = models.JSONField(blank=True, default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "program stage"
        verbose_name_plural = "program stages"
        ordering = ["program", "order", "id"]
        unique_together = [["program", "slug"]]


class StageTransition(models.Model):
    """A directed edge between two ProgramStages. The workflow engine validates
    every status change against these rows at runtime."""

    program = models.ForeignKey(
        related_name="transitions", on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
    )
    from_stage = models.ForeignKey(
        related_name="outgoing_transitions", on_delete=models.CASCADE,
        to="accelerator.programstage",
    )
    to_stage = models.ForeignKey(
        related_name="incoming_transitions", on_delete=models.CASCADE,
        to="accelerator.programstage",
    )
    label = models.CharField(max_length=120, blank=True)
    condition = models.JSONField(
        blank=True, default=dict,
        help_text="Deterministic predicate that must hold for this edge to be offered.",
    )
    requires_approval = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "stage transition"
        verbose_name_plural = "stage transitions"
        ordering = ["program", "order", "id"]
        unique_together = [["program", "from_stage", "to_stage"]]


# ─────────────────────────────────────────────────────────────────────────────
# 02 — APPLICATION OS : form builder + conditional logic + versioning
# ─────────────────────────────────────────────────────────────────────────────

class FormDefinition(models.Model):
    """A versioned application form. Draft -> published; published rows become
    immutable for any submission that already referenced them."""

    STATUS_CHOICES = [("draft", "Draft"), ("published", "Published"), ("archived", "Archived")]

    program = models.ForeignKey(
        related_name="forms", on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
    )
    name = models.CharField(max_length=200)
    form_type = models.CharField(
        max_length=30, default="application",
        choices=[
            ("application", "Application"),
            ("due_diligence", "Due Diligence"),
            ("onboarding", "Onboarding"),
            ("outcome_survey", "Outcome Survey"),
            ("assessment", "Assessment"),
            ("custom", "Custom"),
        ],
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    description = models.TextField(blank=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="created_forms",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "form definition"
        verbose_name_plural = "form definitions"
        ordering = ["program", "form_type", "-version"]
        unique_together = [["program", "form_type", "version"]]

    def __str__(self):
        return f"{self.name} v{self.version} [{self.status}]"


class FormSection(models.Model):
    form = models.ForeignKey(
        related_name="sections", on_delete=models.CASCADE, to="accelerator.formdefinition"
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    # Conditional visibility for the whole section
    visible_if = models.JSONField(
        blank=True, default=dict,
        help_text="e.g. {question: 'has_revenue', equals: true}",
    )

    class Meta:
        verbose_name = "form section"
        verbose_name_plural = "form sections"
        ordering = ["form", "order", "id"]


class FormQuestion(models.Model):
    FIELD_TYPE_CHOICES = [
        ("short_text", "Short Text"), ("long_text", "Long Text"), ("number", "Number"),
        ("currency", "Currency"), ("date", "Date"), ("dropdown", "Dropdown"),
        ("multi_select", "Multi-select"), ("radio", "Radio"), ("checkbox", "Checkbox"),
        ("file", "File Upload"), ("url", "URL"), ("rich_text", "Rich Text"),
        ("address", "Address"), ("founder", "Founder"), ("company", "Company"),
        ("team", "Team"), ("financial", "Financial"), ("traction", "Traction"),
    ]

    section = models.ForeignKey(
        related_name="questions", on_delete=models.CASCADE, to="accelerator.formsection"
    )
    label = models.CharField(max_length=300)
    help_text = models.TextField(blank=True)
    field_type = models.CharField(max_length=30, choices=FIELD_TYPE_CHOICES, default="short_text")
    required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    character_limit = models.PositiveIntegerField(null=True, blank=True)
    validation = models.JSONField(blank=True, default=dict)
    # Conditional logic: show / require / hide based on a sibling answer
    visible_if = models.JSONField(blank=True, default=dict)
    required_if = models.JSONField(blank=True, default=dict)
    routing = models.JSONField(
        blank=True, default=dict,
        help_text="Route the application by this answer. e.g. {equals: 'fintech', then_track: 'fintech'}",
    )
    config = models.JSONField(blank=True, default=dict)

    class Meta:
        verbose_name = "form question"
        verbose_name_plural = "form questions"
        ordering = ["section", "order", "id"]


class QuestionOption(models.Model):
    question = models.ForeignKey(
        related_name="options", on_delete=models.CASCADE, to="accelerator.formquestion"
    )
    label = models.CharField(max_length=200)
    value = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "question option"
        verbose_name_plural = "question options"
        ordering = ["question", "order", "id"]


class FormResponse(models.Model):
    """A founder's stored (autosaved) answers to a published form."""

    STATUS_CHOICES = [("autosave", "Autosave"), ("submitted", "Submitted")]

    form = models.ForeignKey(
        related_name="responses", on_delete=models.CASCADE, to="accelerator.formdefinition"
    )
    application = models.ForeignKey(
        related_name="form_responses", null=True, blank=True,
        on_delete=models.SET_NULL, to="accelerator.acceleratorapplication",
    )
    respondent = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="form_responses",
    )
    answers = models.JSONField(blank=True, default=dict)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="autosave")
    last_saved_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "form response"
        verbose_name_plural = "form responses"


# ─────────────────────────────────────────────────────────────────────────────
# 21 — CUSTOM DATA OBJECTS : a true accelerator CMS
# ─────────────────────────────────────────────────────────────────────────────

class CustomObject(models.Model):
    """Administrator-defined entity (e.g. 'Impact Assessment', 'Scientific
    Validation'). Fields are declared below; records store JSON payloads."""

    program = models.ForeignKey(
        related_name="custom_objects", on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
    )
    name = models.CharField(max_length=120)
    slug = models.CharField(max_length=60)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "custom object"
        verbose_name_plural = "custom objects"
        unique_together = [["program", "slug"]]


class CustomObjectField(models.Model):
    custom_object = models.ForeignKey(
        related_name="fields", on_delete=models.CASCADE, to="accelerator.customobject"
    )
    name = models.CharField(max_length=120)
    key = models.CharField(max_length=60)
    field_type = models.CharField(max_length=30, default="short_text")
    required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "custom object field"
        verbose_name_plural = "custom object fields"
        ordering = ["custom_object", "order", "id"]
        unique_together = [["custom_object", "key"]]


class CustomRecord(models.Model):
    custom_object = models.ForeignKey(
        related_name="records", on_delete=models.CASCADE, to="accelerator.customobject"
    )
    application = models.ForeignKey(
        related_name="custom_records", null=True, blank=True,
        on_delete=models.SET_NULL, to="accelerator.acceleratorapplication",
    )
    membership = models.ForeignKey(
        related_name="custom_records", null=True, blank=True,
        on_delete=models.SET_NULL, to="accelerator.programmembership",
    )
    data = models.JSONField(blank=True, default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "custom record"
        verbose_name_plural = "custom records"


# ─────────────────────────────────────────────────────────────────────────────
# 10 — COMMUNICATIONS OS : templates + delivered notifications
# ─────────────────────────────────────────────────────────────────────────────

class NotificationTemplate(models.Model):
    program = models.ForeignKey(
        related_name="notification_templates", on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
    )
    key = models.CharField(
        max_length=60,
        help_text="Stable id referenced by automations. e.g. 'shortlist_email'.",
    )
    name = models.CharField(max_length=150)
    channel = models.CharField(
        max_length=20, default="email",
        choices=[
            ("email", "Email"), ("sms", "SMS"), ("whatsapp", "WhatsApp"),
            ("push", "Push"), ("in_app", "In-App"),
        ],
    )
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField(
        blank=True,
        help_text="Use {{founder.first_name}}, {{company.name}}, {{program.name}}, {{deadline}}.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "notification template"
        verbose_name_plural = "notification templates"
        unique_together = [["program", "key", "channel"]]


class Notification(models.Model):
    """A concrete, rendered notification. The dispatcher creates these as
    queued; a delivery worker (or manual send) flips status."""

    STATUS_CHOICES = [
        ("queued", "Queued"), ("sent", "Sent"), ("failed", "Failed"),
        ("read", "Read"), ("dismissed", "Dismissed"),
    ]

    program = models.ForeignKey(
        related_name="notifications", on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
    )
    application = models.ForeignKey(
        related_name="notifications", null=True, blank=True,
        on_delete=models.SET_NULL, to="accelerator.acceleratorapplication",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="program_notifications",
    )
    template_key = models.CharField(max_length=60, blank=True)
    channel = models.CharField(max_length=20, default="in_app")
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    context = models.JSONField(blank=True, default=dict)
    error = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "notification"
        verbose_name_plural = "notifications"
        ordering = ["-created_at"]


# ─────────────────────────────────────────────────────────────────────────────
# 36 — EVENT BUS : the domain-event backbone every subsystem reacts to
# ─────────────────────────────────────────────────────────────────────────────

class EventOutbox(models.Model):
    """A durable domain event. Publishers write here; the workflow dispatcher,
    communications layer, analytics and audit consume them. This is what keeps
    AI / side-effects out of the transactional write path and auditable."""

    STATUS_CHOICES = [("pending", "Pending"), ("processed", "Processed"), ("failed", "Failed")]

    program = models.ForeignKey(
        related_name="events", null=True, blank=True, on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
    )
    application = models.ForeignKey(
        related_name="events", null=True, blank=True, on_delete=models.SET_NULL,
        to="accelerator.acceleratorapplication",
    )
    event_type = models.CharField(max_length=80)
    payload = models.JSONField(blank=True, default=dict)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    error = models.TextField(blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "event outbox entry"
        verbose_name_plural = "event outbox"
        ordering = ["occurred_at"]


# ─────────────────────────────────────────────────────────────────────────────
# 19/20 — CUSTOM ROLES + field-level permissions
# ─────────────────────────────────────────────────────────────────────────────

class ProgramRole(models.Model):
    """Administrator-defined role (not hard-coded Admin/Reviewer/...). Carries
    a permission set and optional field-level visibility rules."""

    program = models.ForeignKey(
        related_name="custom_roles", null=True, blank=True, on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
        help_text="Leave blank for an organization/platform-wide role.",
    )
    name = models.CharField(max_length=120)
    slug = models.CharField(max_length=60)
    description = models.TextField(blank=True)
    permissions = models.JSONField(
        blank=True, default=list,
        help_text="e.g. ['view_applications','review_applications','export_data']",
    )
    field_visibility = models.JSONField(
        blank=True, default=dict,
        help_text="Field-group -> roles. e.g. {'bank_statements': ['director'], 'cap_table': ['director','lead_reviewer']}",
    )
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "program role"
        verbose_name_plural = "program roles"
        unique_together = [["program", "slug"]]


# ─────────────────────────────────────────────────────────────────────────────
# 32 — ANALYTICS / REPORT BUILDER
# ─────────────────────────────────────────────────────────────────────────────

class DashboardReport(models.Model):
    """Saved, configurable report definition (metric + filter + group + compare
    + visualization) rather than a hard-coded report."""

    program = models.ForeignKey(
        related_name="reports", on_delete=models.CASCADE,
        to="accelerator.acceleratorprogram",
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    metric = models.CharField(max_length=60)
    filters = models.JSONField(blank=True, default=dict)
    group_by = models.CharField(max_length=60, blank=True)
    compare = models.CharField(max_length=60, blank=True)
    visualization = models.CharField(
        max_length=20, default="bar",
        choices=[
            ("bar", "Bar"), ("line", "Line"), ("pie", "Pie"),
            ("table", "Table"), ("kpi", "KPI"),
        ],
    )
    is_public_to_org = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "dashboard report"
        verbose_name_plural = "dashboard reports"
        ordering = ["program", "name"]
