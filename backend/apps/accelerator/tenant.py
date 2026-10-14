"""
apps.accelerator.tenant
=======================

The tenant boundary for the accelerator surface, in one module.

Two things are protected and they are not the same thing, so there are two
rules: **role** answers "which side of the table is this account on" (founder
vs program team) and **program** answers "whose programs are these". A role
check alone cannot do the second job — every accelerator account in the system
is inside the role, so an endpoint gated only by role serves one team's
scorecards, transcripts and diligence questions to another.

Programs are created by individuals, not by organizations. There is no
`Organization` above `AcceleratorProgram` here by design: a program is the unit
of tenancy because a program is the unit of accountability. `is_public` is an
intake switch — it is what lets a founder read a program's form and apply — so
it is neither an edit licence nor a read licence for somebody else's pipeline:
it opens the *door* of one program, not the *records* inside it to the other
teams on the platform. `permissions.programs_visible_to` applies that, and
`runs_a_program` is the single answer to which side of the door an account is on.

Every read goes through a scoper and every write goes through a guard, so
"whose rows are these" is asked one way everywhere:

| Need | Use |
| :--- | :--- |
| Rows with a `program` FK | `scope_to_visible_programs` |
| Rows hanging off an application, or reached through a join | `scope_rows_to_visible_programs` |
| The applications themselves (staff / tenant / founder's own) | `scope_applications` |
| Which side of the table this account is on (role) | `is_program_team` |
| A `?program_id=` / `?application_id=` the caller chose | `require_visible_program` |
| A POST/PATCH/DELETE whose **body** names a program | `TenantScopedWriteMixin` |
| The program catalogue a caller may browse (public, their own, those that seated them; all of it for staff) | `catalogue_programs` |
| Whether this reader sees *how* a program judges founders | `methodology_visible_to` |
| A caller-supplied id about to reach a lookup or filter | `positive_int` |

The last one exists because a scoped queryset cannot reach a request body: DRF's
`PrimaryKeyRelatedField` resolves an id against the model's default manager, and
`CreateModelMixin.create()` never routes through `get_object()`. Without the
guard, a create against another tenant's program succeeds and then the list
endpoint hides the row it made — a silent cross-tenant write.
"""
from django.db.models import Q
from rest_framework.exceptions import ValidationError

from .models import AcceleratorProgram
from .permissions import programs_owned_by, programs_visible_to, runs_a_program


# A row with no program cannot be attributed to a tenant, so whether it may be
# read is a decision, not a default. Models listed here are read-visible when
# `program IS NULL`, each for a stated reason; every other model is filtered
# strictly, because a missing program on those is a broken row, not a
# platform-level one, and letting it through would show a misconfigured
# assignment or diligence question to every tenant.
#
# Adding a model here needs a smoke test that asserts the null-row read is
# intentional — otherwise the allowlist silently becomes the hole again.
NULL_PROGRAM_READABLE = {
    "accelerator.programrole": (
        "A role definition the platform ships once and every program shares; "
        "with no program it names a job title, not another team's staffing."
    ),
    "accelerator.eventoutbox": (
        "Platform-level events (a cycle opened, a schema change) are published "
        "with no program context. The payload is an event name plus a subject "
        "id, never another tenant's application data."
    ),
}


def platform_or(user, getter):
    """`getter(user)` for an account that works one tenant's programs, or None
    for "the whole platform" — the shape every gate here reads as *no filter*.

    An anonymous caller gets the empty program set rather than None:
    unauthenticated is not a wider reach than authenticated, and the endpoints
    that let anonymous traffic through still have to answer "which programs?"
    for whoever asks.
    """
    if not getattr(user, "is_authenticated", False):
        return AcceleratorProgram.objects.none()
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return None
    return getter(user)


def tenant_programs(user):
    """The programs whose rows this account may reach, or None for "every one".

    Staff is the wider gate: an admin runs the platform rather than a pipeline,
    and `programs_visible_to` answers "whose programs are these", not "may this
    account oversee all of them". Everyone else gets `programs_visible_to`, which
    is programs they created, programs that seated them on a review, and — for an
    account on the founder side of the door — the programs open for public
    intake, since publishing a form is the act that lets a founder read it and
    fill it in.
    """
    return platform_or(user, programs_visible_to)


def ownable_programs(user):
    """The programs whose *configuration* this save may name, or None (staff)."""
    return platform_or(user, programs_owned_by)


def may_configure_program(program, user):
    """Whether this account may change this program's configuration.

    The same question `TenantScopedWriteMixin` asks of a write body, answered for
    a readout: a screen should render what the server will honour rather than
    infer it from a field the account can edit itself. `False` for no program,
    because there is nothing to configure.
    """
    if program is None:
        return False
    allowed = ownable_programs(user)
    return allowed is None or allowed.filter(pk=program.pk).exists()


def catalogue_programs(user):
    """The programs this caller may see *listed*, or None for "every one" (staff).

    The marketplace question, which is wider than `tenant_programs` in one
    direction and no wider in the others: a public program is listed for anyone
    to find — an anonymous visitor, a founder, and another team browsing what
    the platform has — because a listing is a name, a sector and a deadline.
    The rows inside it are reached through `tenant_programs`, where `is_public`
    grants a founder's reach and not a rival's. `is_active` is a separate,
    cheaper question and belongs to the caller's filter, not to the boundary.

    Staff sees every program, published or not: an admin runs the platform
    rather than a pipeline, and blinding them to private programs would make the
    listing useless to the one account that is entitled to see all of it. A
    reviewer the program *seated*, and an account the program *staffed*, see it
    listed too — a listing is the door they were let through, and
    `tenant_programs` is what bounds the rows behind it.
    """
    if not getattr(user, "is_authenticated", False):
        return AcceleratorProgram.objects.filter(is_public=True)
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return None
    return AcceleratorProgram.objects.filter(
        Q(created_by=user)
        | Q(is_public=True)
        | Q(staff_memberships__user=user, staff_memberships__is_active=True)
        | Q(applications__reviewer_assignments__reviewer=user)
    ).distinct()


# The columns a program decides with, as opposed to the ones it advertises
# itself by. Opening a program for intake publishes its name, its terms and its
# application form; it does not publish the weights the committee scores by, the
# gates that triage founders out, or the defaults its intake form fills in — a
# rival reads those to tune applications to the rubric. Disclosed to the account
# that owns the program (and to staff), which is the `manage` line, not the
# `visible` one.
METHODOLOGY_FIELDS = ("eligibility_rules", "question_config",
                      "scoring_rubric_config", "workflow_config")


def methodology_visible_to(program, user):
    """Whether this reader gets a program's methodology, or only its public face."""
    if not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return True
    return program is not None and program.created_by_id == user.pk


def positive_int(raw, field):
    """A caller-supplied id is text, not a database value.

    A malformed one is refused rather than quietly dropped: ignoring it would
    hand back every row in the tenant to a caller who asked for one program, and
    passing it to a lookup would raise `ValueError` inside the guard that is
    supposed to be answering the question.
    """
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({field: f"{field} must be an integer."})
    if value <= 0:
        raise ValidationError({field: f"{field} must be a positive integer."})
    return value


def _null_program_allowed(queryset, program_field):
    if "__" in program_field:
        # Reached through a required relation: a NULL here means the join is
        # missing, which is a broken row rather than a platform-level one.
        return False
    return queryset.model._meta.label.lower() in NULL_PROGRAM_READABLE


def scope_to_visible_programs(queryset, request, program_field="program",
                              founder_field=None, intake_visible=False):
    """Narrow a queryset to programs the caller works in, then honour their
    `?program_id=`.

    The tenant filter comes **first**, so a query parameter can only narrow the
    result and never widen it. Filtering only by the caller's id let any
    authenticated account read every program's rows — the parameter is the
    caller's, not the server's.

    The caller's *side* of the table decides the rest, because "which programs
    may this account reach" is a different question for the two of them:

    * a program-team account gets its own tenants (plus any program that seated
      it on a review);
    * a founder is not on the operating side of anybody's pipeline. They read a
      table like this only where the table says how: `founder_field` names the
      column that makes a row *theirs* (`"respondent"`, `"recipient"`), and
      `intake_visible=True` declares the table intake-facing — a public
      program's open window and the form it asks founders to fill in are what
      they see on the way in. With neither, a founder reads nothing: the rows
      are a team's configuration, and publishing a program never published them.
    """
    user = request.user
    if not is_program_team(user):
        if not getattr(user, "is_authenticated", False):
            return queryset.none()  # unauthenticated is not a wider reach
        if founder_field:
            queryset = queryset.filter(**{founder_field: user})
        elif intake_visible:
            # For an account on the founder side this set *is* the programs open
            # for intake, which is the whole of the public-facing surface and no
            # more.
            queryset = queryset.filter(
                **{f"{program_field}__in": tenant_programs(user)})
        else:
            return queryset.none()
    else:
        visible = tenant_programs(user)
        if visible is not None:
            if _null_program_allowed(queryset, program_field):
                queryset = queryset.filter(
                    Q(**{f"{program_field}__isnull": True})
                    | Q(**{f"{program_field}__in": visible})
                )
            else:
                queryset = queryset.filter(**{f"{program_field}__in": visible})
    pid = request.query_params.get("program_id") or request.query_params.get("program")
    if pid:
        queryset = queryset.filter(
            **{f"{program_field}_id": positive_int(pid, "program_id")})
    return queryset


def scope_rows_to_visible_programs(queryset, request, program_path):
    """The same rule for rows that reach their tenant through a relation.

    `program_path` is the path to the program (`"application__program"`,
    `"custom_object__program"`). The caller's `?program_id=` narrows on that
    path; `?application_id=` narrows on the row the path starts from, which is
    already inside the tenant the path resolved to.

    The role question is asked first, and a founder is answered with nothing.
    Every table scoped here is the operating side's — scorecards, ballots,
    diligence notes, the claims ledger and what a reviewer concluded about each
    claim — and none of them is a founder's reading matter. Skipping that step
    was a real hole rather than a theoretical one: `tenant_programs` answers an
    account on the founder side with *every program open for intake*, because
    that grant is what lets a founder read a form and fill it in. Reach a
    founder's records through this path with only the tenant rule and one founder
    reads another's claims off a public program — the intake door opens on a
    program's page, not on the files inside it.

    A founder-facing table that reaches its tenant through a join says so where
    its own rule can be read: `scope_application_rows` and `scope_cohort_rows`
    take the column that makes a row the founder's, rather than assuming the
    table has no such thing.
    """
    user = request.user
    if not is_program_team(user):
        return queryset.none()
    visible = tenant_programs(user)
    if visible is not None:
        queryset = queryset.filter(**{f"{program_path}__in": visible})
    qp = request.query_params
    pid = qp.get("program_id") or qp.get("program")
    if pid:
        queryset = queryset.filter(
            **{f"{program_path}_id": positive_int(pid, "program_id")})
    app_id = qp.get("application_id")
    if app_id:
        head = program_path.split("__")[0]
        queryset = queryset.filter(
            **{f"{head}_id": positive_int(app_id, "application_id")})
    return queryset


def is_program_team(user):
    """The *role* question — which side of the table this account is on.

    One definition, in `permissions.runs_a_program`, shared with
    `IsAcceleratorOrStaff` and with the reach rule below: an account cannot be
    allowed to be on the operating side of a pipeline for one endpoint and the
    founder side for another. A program-team account is scoped by tenant, a
    founder is scoped by their own submission, and the two answers are not
    comparable.
    """
    return runs_a_program(user)


def scope_application_rows(queryset, request, application_field="application"):
    """Scope a row that hangs off an application, for whoever is asking.

    Program-team accounts get their own tenants (`application__program` inside
    `tenant_programs`). Everyone else — a founder — gets the rows on the
    application they submitted, which is *narrower* than the tenant rule and is
    deliberately not replaced by it: a founder's own submission must stay
    readable if the program later flips `is_public` off, and a founder must
    never reach another founder's application through a program that happens to
    be public.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return queryset.none()
    if is_program_team(user):
        visible = tenant_programs(user)
        if visible is not None:
            queryset = queryset.filter(
                **{f"{application_field}__program__in": visible}
            )
    else:
        queryset = queryset.filter(**{f"{application_field}__submitted_by": user})
    qp = request.query_params
    pid = qp.get("program_id") or qp.get("program")
    if pid:
        queryset = queryset.filter(
            **{f"{application_field}__program_id": positive_int(pid, "program_id")})
    app_id = qp.get("application_id")
    if app_id:
        queryset = queryset.filter(
            **{f"{application_field}_id": positive_int(app_id, "application_id")})
    return queryset


def scope_applications(queryset, request):
    """The application rows this caller may reach, whichever side they are on.

    Three answers, and the order matters. Staff runs the platform, so they hold
    every pipeline — note that `programs_visible_to` would *not* return
    everything for them, because it answers "whose programs are these", not
    "may this account oversee all of them", which is why staff is its own
    branch. A program-team account is bounded by tenant. Everyone else is a
    founder, and a founder gets the applications they submitted — narrower than
    the tenant rule and deliberately not replaced by it, because a public
    program must not turn its founders into each other's readers.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return queryset.none()
    if is_program_team(user):
        visible = tenant_programs(user)
        if visible is not None:
            queryset = queryset.filter(program__in=visible)
    else:
        queryset = queryset.filter(submitted_by=user)
    return queryset


def scope_cohort_rows(queryset, request, program_path, founder_path=None):
    """Delivery and cohort rows — the tables a *member* of a program is in.

    A program-team account is bounded by tenant, as everywhere else. A founder
    is bounded far tighter: the application they submitted. `founder_path` is
    how this row reaches that application (`"membership__application"`, or
    `"application"` on the enrolment itself); with no such path a founder gets
    nothing, because a program's curriculum, tracks and cohort workspaces are
    the staff's view of the program rather than the founder's.

    A table with no program to reach is not scoped here at all — see the
    mentor bench, which is a platform-level directory by design.
    """
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return queryset.none()
    if is_program_team(user):
        visible = tenant_programs(user)
        if visible is not None:
            queryset = queryset.filter(**{f"{program_path}__in": visible})
        return queryset
    if not founder_path:
        return queryset.none()
    return queryset.filter(**{f"{founder_path}__submitted_by": user})


def program_visible_to(program, user):
    """Whether `user` may reach `program`'s rows at all — the read rule.

    A row with no program answers False: `scope_to_visible_programs` keeps
    allowlisted program-less rows in a listing because reading them leaks no
    tenant, but here the caller has to name one specific program to be checked
    against it.
    """
    visible = tenant_programs(user)
    return visible is None or (program is not None and visible.filter(pk=program.pk).exists())


def require_visible_program(user, program_id, field="program_id"):
    """Prove a caller-supplied program id is the caller's, or refuse.

    Query parameters and action bodies are outside a queryset, so they need
    naming explicitly. The error names the field that carried the tenant, so a
    rejected request says what was wrong with it.
    """
    visible = tenant_programs(user)
    if visible is None or program_id is None:
        return
    if not visible.filter(pk=positive_int(program_id, field)).exists():
        raise ValidationError({
            field: "That program is not one this account works in, so its rows "
                   "cannot be read through this endpoint."
        })


class TenantScopedWriteMixin:
    """Refuse a save whose body names a program this account does not work in.

    Covers create, update and delete. Two rules, because two things are being
    protected: `program_write_rule = "manage"` (the default) demands ownership,
    because the row changes how a pipeline judges founders. `"visible"` is for
    the activity tables — a note, a record, an answer, an assignment, a
    scorecard is work *done inside* a program, and an account that may work a
    published program may record work in it.

    Set `program_source` on a table whose program is reached through a join.
    """

    program_source = "program"
    program_write_rule = "manage"

    _MISSING = object()

    def _writable_programs(self):
        """Programs this save may name, or None for "every one" (platform)."""
        getter = (ownable_programs if self.program_write_rule == "manage"
                  else tenant_programs)
        return getter(self.request.user)

    def _program_of(self, obj):
        value = obj
        for part in self.program_source.split("__"):
            value = getattr(value, part, None)
            if value is None:
                return None
        return value

    def _program_from(self, serializer):
        first, *rest = self.program_source.split("__")
        value = serializer.validated_data.get(first, self._MISSING)
        if value is self._MISSING:
            # A PATCH that leaves the relation out keeps the instance's own,
            # which `get_queryset` already vetted. An explicit null stays null —
            # it is a claim about the row, not an omission.
            value = self._program_of(serializer.instance) if serializer.instance else None
        for part in rest:
            value = getattr(value, part, None) if value is not None else None
        return value

    def _error_key(self, serializer):
        """The request-body name of the field that carried the tenant."""
        first = self.program_source.split("__")[0]
        for name, field in serializer.fields.items():
            if getattr(field, "source", None) == first or name == first:
                return name
        return first

    def _guard_program(self, program, error_key):
        allowed = self._writable_programs()
        if allowed is None:
            return
        if program is None:
            raise ValidationError({error_key: (
                "This account can only save rows inside a program; a row without "
                "one is a platform-wide change, which staff and the platform make, "
                "not an ordinary API caller."
            )})
        if not allowed.filter(pk=program.pk).exists():
            reason = ("own the program" if self.program_write_rule == "manage"
                      else "work in the program")
            raise ValidationError({error_key: (
                f"This account does not {reason}, so it cannot save a row inside it."
            )})

    def _assert_writable(self, serializer):
        program = self._program_from(serializer)
        self._guard_program(program, self._error_key(serializer))
        # A table that reaches its tenant through a join often carries its own
        # `program` column too. When the body names both and they disagree the
        # row belongs to two tenants at once: the listings below read it through
        # the join, a program-level rollup would count it under the column.
        direct = serializer.validated_data.get("program", self._MISSING)
        if (self.program_source != "program" and direct is not self._MISSING
                and direct != program):
            raise ValidationError({"program": (
                "This row's own program is not the program of the record it "
                "points at. A row cannot sit in two programs, so nothing is saved."
            )})

    def perform_create(self, serializer):
        self._assert_writable(serializer)
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._assert_writable(serializer)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        # A program-less row may be read (see NULL_PROGRAM_READABLE) because
        # reading it leaks no tenant. Deleting one is still a platform act.
        self._guard_program(self._program_of(instance), self._error_key(self.get_serializer()))
        super().perform_destroy(instance)
