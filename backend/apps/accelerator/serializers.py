"""
apps.accelerator.serializers
============================
DRF serializers for the Venture Admissions OS.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from . import eligibility, evidence_state, queue_routing
from .evidence_extraction import extraction_state as document_extraction_state
from .models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAssessment,
    ApplicationAuditEvent,
    ApplicationClaim,
    ApplicationDocument,
    ApplicationQuestion,
    ClaimEvidence,
    CommitteeDecision,
    ContinuousAssessment,
    DiligenceItem,
    EvidenceRequest,
    FounderApplicationProfile,
    InterviewSession,
    MilestoneTemplate,
    ProgramMembership,
    QuestionResponse,
    ReviewerAssessment,
    ReviewerDisagreement,
    StartupApplicationProfile,
    StartupMilestone,
)
from .models_os import (
    ApplicationCycle,
    ReviewAssignment,
    ReviewerProfile,
    WorkflowAutomation,
)
from .permissions import IsAcceleratorOrStaff
from .tenant import (
    METHODOLOGY_FIELDS,
    is_program_team,
    methodology_visible_to,
)

# Instantiated once: serializers ask the same permission object the views use,
# so "who counts as program staff" has exactly one definition in this app.
STAFF_ONLY_PERMISSION = IsAcceleratorOrStaff()


def cohort_runtime(program, today=None):
    """Where this cohort actually is in time, from its two schedule dates.

    ``week`` and ``total_weeks`` are derived from ``cohort_start_date`` and
    ``cohort_end_date`` only. ``program_duration_weeks`` is never the
    denominator: it defaults to 12 at creation, so a program nobody planned
    would still report "Week 7 / 12" — which is the number this replaces.
    A cohort with no dates says so instead.
    """
    start = program.cohort_start_date
    end = program.cohort_end_date
    total = (end - start).days // 7 + 1 if (start and end and end >= start) else None

    if start is None:
        return {"phase": "unscheduled", "week": None, "total_weeks": None}

    today = today or timezone.localdate()
    if today < start:
        return {"phase": "upcoming", "week": None, "total_weeks": total}
    if end is not None and today > end:
        return {"phase": "ended", "week": None, "total_weeks": total}
    return {
        "phase": "running",
        "week": (today - start).days // 7 + 1,
        "total_weeks": total,
    }


def require_program_team_user(value, what: str):
    """One eligibility rule for "can a program point work at this person".

    Review seats and diligence ownership ask the same question, so they check
    it in the same place — two copies would eventually disagree about who
    counts as the program team.
    """
    role = (getattr(value, "role", "") or "").lower()
    eligible = value.is_staff or role in ("accelerator", "investor")
    if not eligible:
        eligible = ReviewerProfile.objects.filter(user=value, is_active=True).exists()
    if not eligible:
        raise serializers.ValidationError(
            f"This person is not on the program team, so {what} cannot be "
            "handed work they never opted into."
        )
    return value


# ─── Program ──────────────────────────────────────────────────────────────────

class AcceleratorProgramListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for marketplace listing."""
    total_applications = serializers.SerializerMethodField()
    days_until_deadline = serializers.SerializerMethodField()
    cohort_runtime = serializers.SerializerMethodField()

    class Meta:
        model = AcceleratorProgram
        fields = [
            "id", "name", "organization_name", "slug", "logo_url", "tagline",
            "sector_focus", "geography_focus", "stage_focus",
            "equity_offered_pct", "funding_amount_usd", "program_duration_weeks",
            "is_remote", "location", "application_deadline", "cohort_start_date",
            "cohort_end_date", "program_cycle", "target_cohort_size",
            "total_applications", "days_until_deadline", "cohort_runtime",
            "is_active", "is_public",
        ]

    def get_total_applications(self, obj):
        return obj.applications.count()

    def get_days_until_deadline(self, obj):
        if obj.application_deadline:
            delta = obj.application_deadline - timezone.now()
            return max(0, delta.days)
        return None

    def get_cohort_runtime(self, obj):
        return cohort_runtime(obj)


class AcceleratorProgramDetailSerializer(serializers.ModelSerializer):
    """Full program detail including eligibility rules and question config.

    "Full" means full for the account that runs the program. The fields in
    `METHODOLOGY_FIELDS` are withheld from everyone else — a public listing is
    an intake doorway, not the scoring sheet behind it — and withheld means
    absent, not zeroed: a founder's screen that never sees the rubric should not
    be reading an empty one and concluding the program scored them on nothing.
    """
    total_applications = serializers.SerializerMethodField()
    eligibility_defaults = serializers.SerializerMethodField()
    cohort_runtime = serializers.SerializerMethodField()

    class Meta:
        model = AcceleratorProgram
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not methodology_visible_to(instance, getattr(request, "user", None)):
            for key in METHODOLOGY_FIELDS:
                data.pop(key, None)
        return data

    def get_total_applications(self, obj):
        return obj.applications.count()

    def get_cohort_runtime(self, obj):
        return cohort_runtime(obj)

    def get_eligibility_defaults(self, obj):
        """What the rules engine assumes for any rule key this program never set.

        The configuration screen needs it to state the effective gate: an absent
        geography whitelist is not "no gate", it is the default country list.
        """
        return eligibility.rule_defaults()


class AcceleratorProgramWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcceleratorProgram
        exclude = ["created_at", "updated_at", "created_by"]


# ─── Eligibility Check ────────────────────────────────────────────────────────

class EligibilityCheckSerializer(serializers.Serializer):
    """Input for real-time eligibility check."""
    country = serializers.CharField(required=False, default="")
    sector = serializers.CharField(required=False, default="")
    stage = serializers.CharField(required=False, default="pre_seed")
    incorporated = serializers.BooleanField(required=False, default=False)
    full_time = serializers.BooleanField(required=False, default=True)
    total_funding_raised_usd = serializers.FloatField(required=False, default=0)
    team_size = serializers.IntegerField(required=False, default=1)
    previous_accelerator = serializers.BooleanField(required=False, default=False)
    revenue_usd = serializers.FloatField(required=False, default=0)


# ─── Workflow OS ──────────────────────────────────────────────────────────────

class WorkflowAutomationSerializer(serializers.ModelSerializer):
    """CRUD for a program's workflow automations (trigger → conditions → actions)."""
    trigger_event_display = serializers.CharField(source="get_trigger_event_display", read_only=True)
    program_id = serializers.PrimaryKeyRelatedField(
        source="program", write_only=True, queryset=AcceleratorProgram.objects.all()
    )

    class Meta:
        model = WorkflowAutomation
        fields = [
            "id", "program_id", "name", "description", "trigger_event",
            "trigger_event_display", "conditions", "actions", "is_active",
            "order", "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class WorkflowStageSerializer(serializers.Serializer):
    slug = serializers.CharField(max_length=50)
    label = serializers.CharField(max_length=120, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    terminal = serializers.BooleanField(required=False, default=False)


class WorkflowTransitionSerializer(serializers.Serializer):
    from_stage = serializers.CharField(max_length=50)
    to_stage = serializers.CharField(max_length=50)
    label = serializers.CharField(required=False, allow_blank=True)


class WorkflowConfigSerializer(serializers.Serializer):
    """Payload for saving a program's workflow definition."""
    style = serializers.CharField(max_length=30)
    stages = WorkflowStageSerializer(many=True)
    transitions = WorkflowTransitionSerializer(many=True, required=False, allow_empty=True)


# ─── Founder & Startup Profile ───────────────────────────────────────────────

class FounderApplicationProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = FounderApplicationProfile
        exclude = ["user"]
        read_only_fields = ["created_at", "updated_at", "profile_completeness"]


class StartupApplicationProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StartupApplicationProfile
        exclude = ["founder_profile"]
        read_only_fields = ["created_at", "updated_at", "profile_completeness"]


# ─── Questions ────────────────────────────────────────────────────────────────

class ApplicationQuestionSerializer(serializers.ModelSerializer):
    """`program` is writable on purpose: the viewset's tenant guard can only
    refuse a create that names a program, and a bank row with no program cannot
    be attributed to a tenant at all."""

    class Meta:
        model = ApplicationQuestion
        fields = "__all__"
        read_only_fields = ["id"]
        extra_kwargs = {"program": {"required": True}}


class QuestionResponseSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source="question.text", read_only=True)
    question_category = serializers.CharField(source="question.category", read_only=True)

    class Meta:
        model = QuestionResponse
        fields = "__all__"
        read_only_fields = ["last_saved_at", "extracted_claims", "ai_score", "ai_score_reasoning", "word_count"]


# ─── Documents ───────────────────────────────────────────────────────────────

class ApplicationDocumentSerializer(serializers.ModelSerializer):
    """Read shape for one filed document.

    `extraction` travels beside `extraction_status` because the column alone is a
    step on a pipeline, and a screen that renders it as one is reporting a queue
    that may not exist. The computed field says who can read the file and what
    has actually happened, so no caller has to infer a capability from a word like
    "pending".
    """

    extraction = serializers.SerializerMethodField()

    def get_extraction(self, doc):
        return document_extraction_state(doc)

    class Meta:
        model = ApplicationDocument
        fields = "__all__"
        read_only_fields = ["uploaded_at", "extracted_at", "extraction_status",
                            "extracted_claims_count", "parsed_content"]


# ─── Claims ──────────────────────────────────────────────────────────────────

class ClaimEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClaimEvidence
        fields = "__all__"
        read_only_fields = ["verified_at"]


class ApplicationClaimSerializer(serializers.ModelSerializer):
    """Read shape for one founder claim.

    `fields = "__all__"` with the verification columns held back: a claim's state
    is a recorded human decision, so it arrives through
    `POST /accelerator/claims/<id>/verification/` and nowhere else. Left writable,
    this serializer would let any client assert that a claim was verified — the
    outcome without the act, the timestamp without the reviewer.

    `verification_choices` and `may_verify` travel with the row so the screen that
    offers the decision is reading the same lists the endpoint enforces. A state
    vocabulary a browser keeps on its own is a second source of truth, and the one
    drift that matters: a button offering `verified` when the server would refuse
    it for want of evidence attached.
    """
    evidence_detail = ClaimEvidenceSerializer(read_only=True)
    verification_choices = serializers.SerializerMethodField()
    may_verify = serializers.SerializerMethodField()

    def get_verification_choices(self, claim):
        """The states the ledger carries, in the model's own order and words.

        `verified` is offered with its precondition visible, so a screen can say
        "needs something in hand" before the reviewer presses it rather than
        after the server refuses.
        """
        attached = evidence_state.corroborating_evidence(claim)
        return [
            {
                "value": code,
                "label": evidence_state.label(code),
                "needs_note": code in evidence_state.NOTE_REQUIRED_STATES,
                "needs_evidence": code in evidence_state.EVIDENCE_REQUIRED_STATES,
                "evidence_attached": attached,
            }
            for code in evidence_state.STATES
        ]

    def get_may_verify(self, claim):
        """Whether the reading account stands on the operating side of this row.

        The role half of the endpoint's own rule; the reach half was already
        answered, because this row would not have been in the queryset otherwise.
        Null when serialised outside a request — unknown, not a refusal.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return None
        return is_program_team(user)

    class Meta:
        model = ApplicationClaim
        fields = "__all__"
        read_only_fields = [
            "created_at", "claim_id",
            "verification_status", "verified_at", "verified_value",
            "discrepancy_notes", "evidence_status",
        ]


# ─── Assessment ──────────────────────────────────────────────────────────────

class ApplicationAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationAssessment
        fields = "__all__"
        read_only_fields = ["generated_at", "engine_version"]


# ─── Application ─────────────────────────────────────────────────────────────

class AcceleratorApplicationListSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="startup_profile.company_name", read_only=True)
    program_name = serializers.CharField(source="program.name", read_only=True)
    organization_name = serializers.CharField(source="program.organization_name", read_only=True)
    sector = serializers.SerializerMethodField()
    country = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    declared_stage = serializers.SerializerMethodField()
    founder_name = serializers.SerializerMethodField()
    total_claims = serializers.SerializerMethodField()
    unverified_claims = serializers.SerializerMethodField()
    contradicted_claims = serializers.SerializerMethodField()
    verified_claims = serializers.SerializerMethodField()
    reviewer_count = serializers.SerializerMethodField()
    risk_level = serializers.SerializerMethodField()
    risk_reasons = serializers.SerializerMethodField()
    queue_bucket = serializers.SerializerMethodField()
    aging_days = serializers.SerializerMethodField()
    assignments = serializers.SerializerMethodField()
    diligence = serializers.SerializerMethodField()

    class Meta:
        model = AcceleratorApplication
        fields = [
            "id", "company_name", "program", "program_name", "organization_name",
            "status", "automated_screening_tier",
            "program_fit_score", "startup_strength_score",
            "evidence_confidence_score", "application_completeness_score",
            "founder_score", "eligibility_score",
            "stage_conflict_detected", "inferred_stage",
            "sector", "country", "location", "declared_stage", "founder_name",
            "total_claims", "unverified_claims", "contradicted_claims", "verified_claims",
            "reviewer_count",
            "risk_level", "risk_reasons", "queue_bucket",
            "assignments", "diligence",
            "aging_days", "submitted_at", "created_at", "updated_at",
        ]

    # One clock per rendered response so two rows in the same page cannot age
    # differently from each other, and the review-queue row agrees with the
    # consensus report row. The anchor rule itself lives on the model.
    def _clock(self):
        now = self.__dict__.get("_clock_cache")
        if now is None:
            now = self.__dict__["_clock_cache"] = timezone.now()
        return now

    def get_aging_days(self, obj):
        return obj.aging_days(self._clock())

    # Who is on this application. Reviewer identity is staff-only — the
    # scorecard data behind it sits behind IsAcceleratorOrStaff, so a founder
    # must not learn here who is reading their application. The permission class
    # itself is asked, so the two definitions of "staff" cannot drift.
    # Null means "not visible to you", never an empty list implying nobody is
    # assigned.
    def get_assignments(self, obj):
        request = self.context.get("request")
        if request is None or not STAFF_ONLY_PERMISSION.has_permission(request, None):
            return None
        # Same shape as the consensus report's rows: one assignment vocabulary,
        # not two that the UI has to reconcile.
        scored_by = {card.reviewer_id for card in obj.reviewer_assessments.all()}
        now = timezone.now()
        return [
            {
                "id": a.id,
                "reviewer_id": a.reviewer_id,
                "reviewer_name": a.reviewer.full_name,
                "round_id": a.round_id,
                "status": a.status,
                "conflict_status": a.conflict_status,
                "due_at": a.due_at.isoformat() if a.due_at else None,
                "scorecard_filed": a.reviewer_id in scored_by,
                "is_overdue": a.is_overdue(now, a.reviewer_id in scored_by),
            }
            for a in obj.reviewer_assignments.all()
        ]

    # Diligence coverage on this application, tallied server-side so the board,
    # the drawer and the rollup endpoint cannot count it three different ways.
    # Staff-only for the same reason as `assignments` above: it names owners.
    # Null means "not visible to you"; an all-zero dict means the program has
    # not written a question down yet, and the two must stay tellable apart.
    def get_diligence(self, obj):
        request = self.context.get("request")
        if request is None or not STAFF_ONLY_PERMISSION.has_permission(request, None):
            return None
        now = self._clock()
        items = list(obj.diligence_items.all())
        open_items = [i for i in items if i.status in DiligenceItem.OPEN_STATUSES]
        due = [i.due_at for i in open_items if i.due_at is not None]
        return {
            "items": len(items),
            "open": len(open_items),
            "overdue": sum(1 for i in open_items if i.is_overdue(now)),
            "unowned": sum(1 for i in open_items if i.owner_id is None),
            "resolved": sum(1 for i in items if i.status == "resolved"),
            "blocked": sum(1 for i in items if i.status == "blocked"),
            "next_due_at": min(due).isoformat() if due else None,
        }

    # Routing lives in one server module so the review-queue row, its tab and
    # its counter can never be computed by three different rules.
    def _routing(self, obj):
        cache = self.__dict__.setdefault("_routing_cache", {})
        if obj.pk not in cache:
            cache[obj.pk] = queue_routing.route_app(self._ensure_claim_annotations(obj))
        return cache[obj.pk]

    def get_risk_level(self, obj):
        return self._routing(obj)["risk_level"]

    def get_risk_reasons(self, obj):
        return self._routing(obj)["risk_reasons"]

    def get_queue_bucket(self, obj):
        return self._routing(obj)["queue_bucket"]

    # Count fields read viewset annotations when present (no N+1) and fall
    # back to per-row queries only if the annotation is missing. The buckets
    # themselves are `evidence_state`'s: `unverified_claims` is the open bucket,
    # which the payload key has always meant and routing rules have always read.
    def get_total_claims(self, obj):
        v = getattr(obj, "n_claims", None)
        return v if v is not None else obj.claims.count()

    def get_unverified_claims(self, obj):
        v = getattr(obj, "n_unverified", None)
        return v if v is not None else obj.claims.filter(evidence_state.open_q()).count()

    def get_contradicted_claims(self, obj):
        v = getattr(obj, "n_contradicted", None)
        return v if v is not None else obj.claims.filter(evidence_state.contradicted_q()).count()

    def get_verified_claims(self, obj):
        v = getattr(obj, "n_verified", None)
        return v if v is not None else obj.claims.filter(evidence_state.verified_q()).count()

    def get_reviewer_count(self, obj):
        v = getattr(obj, "n_reviewers", None)
        return v if v is not None else obj.reviewer_assessments.count()

    # Fallback for callers that serialise a plain instance: match the viewset's
    # annotation names so routing never re-queries per row.
    def _ensure_claim_annotations(self, obj):
        if not hasattr(obj, "n_unverified"):
            obj.n_unverified = self.get_unverified_claims(obj)
        if not hasattr(obj, "n_contradicted"):
            obj.n_contradicted = self.get_contradicted_claims(obj)
        return obj

    def get_sector(self, obj):
        return obj.startup_profile.sector or None

    def get_country(self, obj):
        return obj.startup_profile.country or None

    def get_location(self, obj):
        if obj.startup_profile.founder_profile_id:
            return obj.startup_profile.founder_profile.location or None
        return None

    def get_declared_stage(self, obj):
        return obj.startup_profile.declared_stage or None

    def get_founder_name(self, obj):
        if obj.startup_profile.founder_profile_id:
            return obj.startup_profile.founder_profile.full_name or None
        return None


class AcceleratorApplicationDetailSerializer(serializers.ModelSerializer):
    startup_profile = StartupApplicationProfileSerializer(read_only=True)
    program = AcceleratorProgramListSerializer(read_only=True)
    assessment = ApplicationAssessmentSerializer(read_only=True)
    claims = ApplicationClaimSerializer(many=True, read_only=True)
    documents = ApplicationDocumentSerializer(many=True, read_only=True)
    responses = QuestionResponseSerializer(many=True, read_only=True)
    reviewer_assessments = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="startup_profile.company_name", read_only=True)

    class Meta:
        model = AcceleratorApplication
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at", "submitted_at"]

    def get_reviewer_assessments(self, obj):
        return ReviewerAssessmentSerializer(obj.reviewer_assessments.all(), many=True).data


class AcceleratorApplicationCreateSerializer(serializers.ModelSerializer):
    """The row a submission creates.

    ``cycle`` is optional on purpose. A founder who names one gets that cycle
    only if it belongs to the program they applied to; one who names nothing is
    filed under the program's single open cycle, and left with no cycle when
    that is ambiguous. Nothing is invented to fill the column.
    """

    cycle = serializers.PrimaryKeyRelatedField(
        queryset=ApplicationCycle.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = AcceleratorApplication
        fields = ["program", "startup_profile", "cycle"]

    def validate_startup_profile(self, profile):
        """A submission is filed by a person about a company *they* represent.

        `startup_profile` arrived as an id resolved against every profile in the
        table, so a founder could attach another company's profile and have its
        numbers, documents and scorecard appear in their own pipeline — and read
        it, since the detail serializer expands the profile through this row.
        An account that runs programs is excepted: it files applications on
        behalf of founders (an import, a desk-created draft), and those rows are
        named by the person who works them.
        """
        user = self.context["request"].user
        if is_program_team(user):
            return profile
        mine = FounderApplicationProfile.objects.filter(user=user).first()
        if mine is None or profile.founder_profile_id != mine.pk:
            raise serializers.ValidationError(
                "That company profile is not yours to apply with.")
        return profile

    def validate(self, data):
        # Prevent duplicate applications
        if AcceleratorApplication.objects.filter(
            program=data["program"],
            startup_profile=data["startup_profile"],
        ).exists():
            raise serializers.ValidationError(
                "An application for this program already exists."
            )
        cycle = data.get("cycle")
        if cycle is not None and cycle.program_id != data["program"].pk:
            raise serializers.ValidationError({
                "cycle": "That intake cycle belongs to another program.",
            })
        data["cycle"] = cycle or ApplicationCycle.objects.current_for(data["program"])
        return data


# ─── Reviewer ────────────────────────────────────────────────────────────────

class ReviewerAssessmentSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source="reviewer.full_name", read_only=True)
    reviewer_email = serializers.CharField(source="reviewer.email", read_only=True)

    class Meta:
        model = ReviewerAssessment
        fields = "__all__"
        # The signed-in human owns the ballot — a client-supplied `reviewer`
        # would let one reviewer's score be filed under someone else's name.
        read_only_fields = ["submitted_at", "updated_at", "reviewer"]


class ReviewAssignmentSerializer(serializers.ModelSerializer):
    """One reviewer's seat on one application in one review round.

    Ownership, not a verdict and not a gate: the row records who the program
    asked, while `scorecard_filed` is what proves a human actually reviewed it.
    An assignment obliges nothing, and any eligible reviewer may still file a
    scorecard without being assigned.
    """

    reviewer_name = serializers.CharField(source="reviewer.full_name", read_only=True)
    reviewer_email = serializers.CharField(source="reviewer.email", read_only=True)
    # `reviewer` is the writable FK id; `reviewer_id` is also emitted so this
    # payload and the `assignments` array on an application row use one key, and
    # the UI never has to wonder which of the two it is holding.
    reviewer_id = serializers.IntegerField(read_only=True)
    assigned_by_name = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    scorecard_filed = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    may_remove = serializers.SerializerMethodField()

    class Meta:
        model = ReviewAssignment
        fields = [
            "id", "application", "company_name", "reviewer", "reviewer_id", "reviewer_name",
            "reviewer_email", "round_id", "status", "conflict_status", "due_at",
            "assigned_at", "assigned_by", "assigned_by_name", "scorecard_filed",
            "is_overdue", "may_remove", "notes",
        ]
        # The person who pressed "assign" is recorded by the server, never
        # supplied by the client.
        read_only_fields = ["assigned_at", "assigned_by"]

    def get_assigned_by_name(self, obj):
        return obj.assigned_by.full_name if obj.assigned_by else None

    def get_company_name(self, obj):
        return obj.application.startup_profile.company_name

    def get_scorecard_filed(self, obj):
        """Prefer the viewset's annotation; only fall back to a query when a
        caller serialises a bare instance."""
        v = getattr(obj, "scorecard_filed", None)
        if v is not None:
            return bool(v)
        return obj.application.reviewer_assessments.filter(reviewer_id=obj.reviewer_id).exists()

    def get_is_overdue(self, obj):
        """The server's clock, not the browser's.

        The rule itself lives on the model so the seat rows on an application
        and this row cannot drift apart.
        """
        return obj.is_overdue(timezone.now(), self.get_scorecard_filed(obj))

    def get_may_remove(self, obj):
        """Whether the reading account may take this seat off the application.

        The same rule `perform_destroy` enforces, answered here so the button a
        person sees and the request they can make cannot disagree. Null when
        this row is serialised outside a request (nothing to decide against) —
        that is unknown, not a refusal.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return None
        return bool(
            user.is_staff
            or obj.assigned_by_id == user.id
            or obj.reviewer_id == user.id
            or obj.application.program.created_by_id == user.id
        )

    def validate_reviewer(self, value):
        return require_program_team_user(value, "a review seat")

    def validate_round_id(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("A review round label is required.")
        return cleaned

    def validate(self, attrs):
        application = attrs.get("application") or getattr(self.instance, "application", None)
        reviewer = attrs.get("reviewer") or getattr(self.instance, "reviewer", None)
        round_id = attrs.get("round_id") or getattr(self.instance, "round_id", None)
        clash = ReviewAssignment.objects.filter(
            application=application, reviewer=reviewer, round_id=round_id
        ).exclude(pk=getattr(self.instance, "pk", None))
        if clash.exists():
            raise serializers.ValidationError(
                {"reviewer": f"{reviewer.full_name} is already assigned to "
                             f"{round_id} of this application."}
            )
        return attrs


# ─── Due diligence items ─────────────────────────────────────────────────────

class DiligenceItemSerializer(serializers.ModelSerializer):
    """One diligence question, who owns it, and whether it is past due.

    `is_overdue` is computed here from the model's single rule with one clock
    per response, so a board row and its drawer can never disagree about
    whether the same item has slipped. A missing due date is reported as no
    deadline, never as overdue.
    """

    company_name = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    owner_email = serializers.SerializerMethodField()
    # `owner` is the writable FK id; `owner_id` is also emitted so this payload
    # and the per-application `diligence` rollup use one key for the same fact.
    owner_id = serializers.IntegerField(source="owner.id", read_only=True, allow_null=True)
    created_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = DiligenceItem
        fields = [
            "id", "application", "company_name", "question", "area", "status",
            "owner", "owner_id", "owner_name", "owner_email", "due_at", "is_overdue",
            "resolution_note", "resolved_at", "created_by", "created_by_name",
            "created_at", "updated_at",
        ]
        # The closer is recorded by the server, and so is who opened the item.
        read_only_fields = ["created_at", "updated_at", "resolved_at", "created_by"]

    # One clock per rendered response, exactly like the application rows, so
    # every item on a page ages against the same instant.
    def _clock(self):
        now = self.__dict__.get("_clock_cache")
        if now is None:
            now = self.__dict__["_clock_cache"] = timezone.now()
        return now

    def get_company_name(self, obj):
        return obj.application.startup_profile.company_name

    def get_owner_name(self, obj):
        return obj.owner.full_name if obj.owner else None

    def get_owner_email(self, obj):
        return obj.owner.email if obj.owner else None

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else None

    def get_is_overdue(self, obj):
        return obj.is_overdue(self._clock())

    def validate_question(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Write the question a person has to clear.")
        return cleaned

    def validate_area(self, value):
        return (value or "").strip()

    def validate_owner(self, value):
        if value is None:
            return value
        return require_program_team_user(value, "a diligence question")


class ReviewerDisagreementSerializer(serializers.ModelSerializer):
    # Bare reviewer_a/reviewer_b integers tell a reader nothing about WHO
    # disagrees, which pushed the UI to dump the detector's prose blob. These
    # are derived from the two scorecards already select_related by the viewset.
    application_name = serializers.SerializerMethodField()
    dimension_a = serializers.SerializerMethodField()
    dimension_b = serializers.SerializerMethodField()
    reviewer_a_name = serializers.SerializerMethodField()
    reviewer_b_name = serializers.SerializerMethodField()
    variance_points = serializers.SerializerMethodField()

    class Meta:
        model = ReviewerDisagreement
        fields = "__all__"
        read_only_fields = ["detected_at"]

    def get_application_name(self, obj):
        return obj.application.startup_profile.company_name

    def _dim_key(self, obj):
        return f"{str(obj.dimension).strip().lower()}_score"

    def get_dimension_a(self, obj):
        return getattr(obj.reviewer_a, self._dim_key(obj), None)

    def get_dimension_b(self, obj):
        return getattr(obj.reviewer_b, self._dim_key(obj), None)

    def get_reviewer_a_name(self, obj):
        return obj.reviewer_a.reviewer.full_name or obj.reviewer_a.reviewer.email

    def get_reviewer_b_name(self, obj):
        return obj.reviewer_b.reviewer.full_name or obj.reviewer_b.reviewer.email

    def get_variance_points(self, obj):
        # variance_pct is stored as the 1-10 gap over a 10-point scale.
        return round(obj.variance_pct / 10.0, 1)


# ─── Interview ───────────────────────────────────────────────────────────────

class InterviewSessionSerializer(serializers.ModelSerializer):
    interviewer_name = serializers.SerializerMethodField()
    transcript_turn_count = serializers.SerializerMethodField()
    claims_recorded_from_it = serializers.SerializerMethodField()

    class Meta:
        model = InterviewSession
        fields = "__all__"
        # A transcript is append-only through /interviews/{id}/transcript/, so
        # that the server owns every turn's timestamp and who recorded it. A
        # plain PATCH that replaced the whole array could rewrite when a
        # founder said something — which is the one thing a record of what was
        # said has to keep.
        read_only_fields = ["created_at", "transcript"]

    def to_representation(self, instance):
        """The founder's own interview record is not the interviewers' notes.

        A founder may see the session on their application — when it was, what
        round, whether it happened. What they must not read is the interviewers'
        side of the room or which staff member wrote it up, which is the same
        disclosure `assignments` above refuses to make. So the body is withheld
        and the count is not: `None` means "you cannot see this", `[]` means
        nothing was said on record, and only the second one is a zero.
        """
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request is None or not STAFF_ONLY_PERMISSION.has_permission(request, None):
            data["transcript"] = None
        return data

    def get_interviewer_name(self, obj):
        if obj.interviewer:
            return obj.interviewer.full_name or obj.interviewer.email
        return "Pitchmic ML"

    def get_transcript_turn_count(self, obj):
        return len(obj.transcript or [])

    def get_claims_recorded_from_it(self, obj):
        """How many claims a human has pinned to this session.

        Counted on the row it describes, so a list of sessions never has to be
        joined in the browser to say "nothing was recorded from this call".
        """
        return obj.derived_claims.count()


# ─── Committee ───────────────────────────────────────────────────────────────

class CommitteeDecisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommitteeDecision
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]


# ─── Evidence Request ────────────────────────────────────────────────────────

class EvidenceRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenceRequest
        fields = "__all__"
        read_only_fields = ["created_at", "resolved_at"]


# ─── Cohort / Membership ─────────────────────────────────────────────────────

class MilestoneTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MilestoneTemplate
        exclude = ["program"]


class StartupMilestoneSerializer(serializers.ModelSerializer):
    template_title = serializers.CharField(source="template.title", read_only=True)
    template_category = serializers.CharField(source="template.category", read_only=True)
    template_week = serializers.IntegerField(source="template.week_number", read_only=True)

    class Meta:
        model = StartupMilestone
        fields = "__all__"
        read_only_fields = ["updated_at"]


class ProgramMembershipSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(
        source="application.startup_profile.company_name", read_only=True
    )
    milestones = StartupMilestoneSerializer(many=True, read_only=True)
    milestones_complete = serializers.SerializerMethodField()
    milestones_total = serializers.SerializerMethodField()

    class Meta:
        model = ProgramMembership
        fields = "__all__"
        read_only_fields = ["enrolled_at"]

    def get_milestones_complete(self, obj):
        return obj.milestones.filter(status="complete").count()

    def get_milestones_total(self, obj):
        return obj.milestones.count()


# ─── Continuous Assessment ───────────────────────────────────────────────────

class ContinuousAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContinuousAssessment
        fields = "__all__"
        read_only_fields = ["recorded_at"]


# ─── Pipeline View ───────────────────────────────────────────────────────────

class PipelineSerializer(serializers.Serializer):
    """Summary for the accelerator Pipeline tab (Kanban columns)."""
    program_id = serializers.IntegerField(read_only=True)
    program_name = serializers.CharField(read_only=True)
    tiers = serializers.DictField(read_only=True)
    columns = serializers.DictField(read_only=True)
    funnel_counts = serializers.DictField(read_only=True)
    avg_scores = serializers.DictField(read_only=True)


# ─── Audit Trail ─────────────────────────────────────────────────────────────

class ApplicationAuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.SerializerMethodField()

    class Meta:
        model = ApplicationAuditEvent
        fields = [
            "id", "application", "from_stage", "to_stage",
            "actor", "actor_email", "reason", "policy_version",
            "evidence_snapshot", "snapshot_hash", "is_automated", "timestamp",
        ]
        read_only_fields = ["timestamp", "snapshot_hash"]

    def get_actor_email(self, obj):
        if obj.actor:
            return obj.actor.email
        return "System / ML" if obj.is_automated else None


# ─── User / Organization Context ─────────────────────────────────────────────

class ActiveContextSerializer(serializers.Serializer):
    """The currently active org + program context for the logged-in user.

    ``role`` describes the *account*. It is null when the account carries no
    recognised role rather than defaulting to a title nobody awarded.

    ``program_roles`` is the narrower answer, and the one the older field could
    never give: the seats this account actually holds in the program it is
    working in, read off ``ProgramStaffMembership``. Empty is not "member" and
    not "nobody" — it says this account works the program through some other
    grant, usually because it created it.
    """
    organization_id = serializers.IntegerField(allow_null=True)
    organization_name = serializers.CharField(allow_null=True)
    program_id = serializers.IntegerField(allow_null=True)
    program_name = serializers.CharField(allow_null=True)
    role = serializers.CharField(allow_null=True)
    role_code = serializers.CharField(allow_null=True)
    is_program_creator = serializers.BooleanField()
    can_configure_program = serializers.BooleanField()
    program_roles = serializers.ListField(
        child=serializers.DictField(), allow_empty=True)


class OrganizationSummarySerializer(serializers.Serializer):
    """An organization reached through a program the user can see.

    ``id`` is a real ``AcceleratorOrganization`` key, or null when the program
    only carries its free-text ``organization_name`` — which is every seeded
    program today. The previous shape handed out the program's own primary key
    as an organization id and attached a role and permission list that no table
    backs, so the client could "switch" into an entity that does not exist.
    """
    id = serializers.IntegerField(allow_null=True)
    name = serializers.CharField()
    linked = serializers.BooleanField()
    program_ids = serializers.ListField(child=serializers.IntegerField())


class UserContextResponseSerializer(serializers.Serializer):
    """Full context blob returned by GET /accelerator/context/."""
    user_id = serializers.IntegerField()
    email = serializers.CharField()
    organizations = OrganizationSummarySerializer(many=True)
    active_context = ActiveContextSerializer()


class SwitchContextSerializer(serializers.Serializer):
    """Input for POST /accelerator/context/switch/.

    There is deliberately no ``role`` field. A role the client asserts is not a
    role the server knows, and echoing one back let the browser choose its own
    authority level. An old client that still sends it is ignored.
    """
    organization_id = serializers.IntegerField(required=False, allow_null=True)
    program_id = serializers.IntegerField(required=False, allow_null=True)
