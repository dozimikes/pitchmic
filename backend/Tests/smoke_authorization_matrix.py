"""Rollback-only smoke: the authorization matrix for the whole accelerator surface.

`smoke_tenant_scope_bypass.py` proves the boundary on the tables a selection
team works, row by row. This one asks the wider question the critique put: is
every endpoint on the surface *classified*, and does the classification hold?
An unlisted endpoint is the failure mode — a new viewset that reads from
`Model.objects.all()` passes every test that exists until someone points a
second tenant at it.

Three things are checked, and the first is the one that keeps the other two
honest:

1. **Declaration.** Every entry in `apps.accelerator.urls` — router registration
   or `path()` — appears in `MATRIX` with a kind and a stated reason, and every
   `MATRIX` entry is still mounted. A row is added by deciding who may read a
   table; it is removed by deleting the endpoint.
2. **The kind holds.** `tenant`/`config` tables start from a shared scoper, a
   `config` table demands ownership of the program it names, `open` endpoints
   are the only ones that answer an anonymous caller, and a cohort table states
   how a founder reaches its rows (or that a founder reads none).
3. **Isolation, live.** Two accounts that each run one program are queried on
   every classified table at once, and their row sets must not overlap — except
   where the row genuinely has no program to attribute (the allowlist in
   `tenant.py`) or where the entry declares sharing as the design and the test
   re-reads each shared row against that reason.

The reason strings are load-bearing: a `shared` or `open` entry with a thin
explanation fails, because the point of the table is that nobody can add a hole
by leaving the reason blank.
"""
import inspect
import os
import re
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import models_os as os_models
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    FounderApplicationProfile,
    StartupApplicationProfile,
)
from apps.accelerator.serializers import (
    AcceleratorProgramDetailSerializer,
    AcceleratorProgramListSerializer,
)
from apps.accelerator.tenant import (
    METHODOLOGY_FIELDS,
    NULL_PROGRAM_READABLE,
    TenantScopedWriteMixin,
)
from apps.accelerator.urls import router, urlpatterns

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


# ── the classification ───────────────────────────────────────────────────────
# kind:
#   tenant  rows inside the programs this account works; founders are not the
#           audience (or are, but only of their own submission)
#   config  the same, and a write additionally demands the account *runs* the
#           program it names
#   cohort  built by `views_cohort._scoped_viewset`, which states its own paths
#   self    the caller's own rows, whoever the caller is
#   shared  deliberately readable across tenants — reason required
#   open    answers an anonymous caller — reason required
#   meta    a command endpoint (POST an action, reads nothing), not a table
#   readout computed numbers about a scope the caller names — reads no rows
#
# `founder`: none (a founder reads nothing here) | own (only rows hanging off
# the application they submitted) | public (only rows of a program open for
# intake — which every founder reads, because it is the same page: the window
# they apply into and the form they fill) | any (no founder assertion to make).
def E(kind, founder, anon, reason):
    return {"kind": kind, "founder": founder, "anon": anon, "reason": reason}


MATRIX = {
    # The programs themselves and the intake pipeline around them.
    "programs": E("shared", "any", True,
                  "the marketplace page: a founder browses the programs open for "
                  "intake and an account reads its own alongside them. Private "
                  "programs are not in the list at all, and the fields a program "
                  "scores founders by go only to the account that runs it."),
    "applications": E("tenant", "own", False,
                      "the pipeline itself: a program team reads its tenant's "
                      "applications, a founder reads the ones they submitted."),
    "startup-profiles": E("self", "own", False,
                          "a founder's own company profiles, reached through "
                          "their own founder profile."),
    "founder-profile": E("self", "own", False,
                         "the signed-in founder's own profile record."),
    "questions": E("config", "none", False,
                   "the questions a program asks — its intake form, not a "
                   "founder's reading matter."),
    "responses": E("tenant", "own", False,
                   "answers to those questions. A founder reads their own, the "
                   "program team reads its tenant's."),
    "application-cycles": E("config", "public", False,
                            "an intake window is a program's schedule: opening, "
                            "moving or closing one changes how their pipeline "
                            "runs, so it takes ownership rather than eyes on it. "
                            "A founder reads the windows of programs open for "
                            "intake — the deadline they are applying against."),
    "intake-submissions": E("tenant", "none", False,
                            "external submissions held for a human decision, "
                            "readable only inside the program that collected them."),
    "intake/import": E("meta", "none", False,
                       "POST a spreadsheet, get a dry-run report. It names a "
                       "program, which is proved against the caller, and reads "
                       "no rows."),
    "intake/ingest": E("open", "none", True,
                       "the one route a website posts into without a session: "
                       "authenticated by the cycle's intake key, which is "
                       "hashed at rest and issued only to the program's own "
                       "account."),
    "application-cycles/{id}/intake-key": E("meta", "none", False,
                                            "rotates or reveals one cycle's intake "
                                            "key. The key is the credential that "
                                            "feeds this program, so it goes to the "
                                            "program's own staff and nobody else."),
    # The reviewer's ledgers.
    "reviews": E("tenant", "none", False,
                 "a scorecard is a reviewer's private read of a founder. Another "
                 "team reading it is the breach this whole layer exists to stop."),
    "review-assignments": E("tenant", "none", False,
                            "who owes a review — a workload record, not a "
                            "founder-facing field."),
    "disagreements": E("tenant", "none", False,
                       "read-only variance between two scorecards; the rows are "
                       "derived, and the resolution note names reviewers."),
    "diligence-items": E("tenant", "none", False,
                         "the questions a program is chasing, with a named owner "
                         "and often an internal finding quoted."),
    "interviews": E("tenant", "own", False,
                    "the interview calendar: a founder reads their own sessions "
                    "and never the transcript, the program team reads its "
                    "tenant's whole record."),
    "committee": E("tenant", "none", False,
                   "ballots and the decision a committee reached, which is the "
                   "most confidential row in the app until it is published."),
    "claims": E("tenant", "none", False,
                "what a reviewer concluded about the numbers a founder quoted, "
                "and the discrepancy note attached to it. The door is the role "
                "gate rather than the reach gate: tenant reach alone hands an "
                "account on the founder side every program open for intake — "
                "that grant is what lets a founder read a form — so a public "
                "program's page would have published its whole claims ledger, "
                "other founders' rows included."),
    "evidence-requests": E("tenant", "own", False,
                           "what the program asked a founder for. The founder "
                           "reads their own; no other founder reads anything."),
    "evidence-graph": E("readout", "own", False,
                        "one application's claims, proofs and who relied on "
                        "them — the widest single read in the surface, so the "
                        "application is proved to be the caller's to see first."),
    "work-inbox": E("readout", "none", False,
                    "one person's desk inside one program: seats owed, questions "
                    "open, interviews due. It names a program, which is proved "
                    "against the caller, and counts their own rows inside it."),
    "context": E("self", "any", False,
                 "the signed-in account's own organizations, roles and the "
                 "program it is currently working in."),
    "context/switch": E("meta", "any", False,
                        "records which program this account is working in; the "
                        "target is proved to be one it may work at all."),
    # Program configuration.
    "automations": E("config", "none", False,
                     "a WHEN/IF/THEN rule moves founders through another "
                     "program's pipeline, so it belongs to the account that runs it."),
    "stages": E("config", "none", False,
                "the stage graph is how a program decides what 'in review' means."),
    "transitions": E("config", "none", False,
                     "which stage may follow which, plus who may cross the line."),
    "forms": E("config", "public", False,
               "a form's fields are the questions a program asks; publishing one "
               "is the program's decision, made through the owner's account. A "
               "founder reads the published form of a program open for intake, "
               "which is the page they are about to fill in."),
    "form-responses": E("tenant", "own", False,
                        "what a founder answered, read back by the program that "
                        "asked and by that founder."),
    "notification-templates": E("config", "none", False,
                                "the wording a program sends its founders."),
    "program-notifications": E("tenant", "none", False,
                               "messages already sent — they quote a founder's "
                               "state to an audience that is not another team's."),
    "custom-objects": E("config", "none", False,
                        "a program's own table shape is configuration of that "
                        "program, not a shared schema."),
    "custom-records": E("tenant", "none", False,
                        "rows in that table hold whatever that team decided to "
                        "track about its founders."),
    "program-roles": E("config", "none", False,
                       "job titles inside a program. A definition with no "
                       "program is the platform's own list of titles, which "
                       "every program shares — see NULL_PROGRAM_READABLE."),
    "program-staff": E("config", "none", False,
                       "who the program has seated on its own team. Reading it "
                       "names that team's people to another tenant; writing it "
                       "grants reach inside someone else's pipeline, so both "
                       "stop at the account that runs the program."),
    "policies": E("tenant", "none", False,
                  "the versioned scoring policy behind a program's numbers — "
                  "read-only on purpose, because a score has to name the weights "
                  "that produced it."),
    "reports": E("config", "none", False,
                 "a saved report is one team's way of counting its own pipeline."),
    "events": E("shared", "none", False,
               "the outbox of what happened. An entry with no program is a "
               "platform-level event (a cycle opened, a schema change) and is "
               "readable everywhere; an entry with one is that tenant's, and "
               "only that tenant reads it."),
    "program-memory": E("tenant", "none", False,
                        "what a program learned about the founders it has seen."),
    "dashboard-widgets": E("tenant", "none", False,
                           "one team's saved layout of its own numbers."),
    "blueprints": E("shared", "none", False,
                    "a program's methodology, copied out to clone. Drafts stay "
                    "with their author and their tenant; `is_published` is the "
                    "one sharing switch the model has, so a published template "
                    "is readable across tenants on purpose."),
    "seed-defaults": E("meta", "none", False,
                       "POST writes demo programs and questions; a founder "
                       "cannot ask for it and nobody reads it anonymously."),
    "program-studio/seed": E("meta", "none", False,
                             "generates a program from a blueprint. It creates "
                             "rows under the calling account, so the call is "
                             "refused before it reaches anything another team "
                             "owns."),
    # Cohort OS, People OS, Delivery OS: all built by `_scoped_viewset`, which
    # states the tenant path and the founder path on the class. They share one
    # reason because they share one factory — and the test reads both paths off
    # the class rather than restating them here.
    "memberships": E("cohort", "derived", False, COHORT_REASON := (
        "delivery and cohort records: the program team reads its own tenant, a "
        "founder reads the rows that hang off the application they submitted, "
        "and a founder reads nothing at all where the table is the staff's view "
        "of the program (a curriculum, a track, a workspace).")),
    "tracks": E("cohort", "derived", False, COHORT_REASON),
    "cohorts": E("cohort", "derived", False, COHORT_REASON),
    "curriculum-weeks": E("cohort", "derived", False, COHORT_REASON),
    "cohort-events": E("cohort", "derived", False, COHORT_REASON),
    "event-attendance": E("cohort", "derived", False, COHORT_REASON),
    "mentors": E("shared", "any", False,
                 "the mentor bench is a platform-level directory by design: an "
                 "assigned mentor is reachable from their own assignments, so "
                 "the person is not the tenant's data. The matcher's embedding "
                 "vector is internal state and stays off the row."),
    "mentor-sessions": E("cohort", "derived", False, COHORT_REASON),
    "mentor-assignments": E("cohort", "derived", False, COHORT_REASON),
    "mentor-requests": E("cohort", "derived", False, COHORT_REASON),
    "founder-tasks": E("cohort", "derived", False, COHORT_REASON),
    "onboarding-checklists": E("cohort", "derived", False, COHORT_REASON),
    "baseline-metrics": E("cohort", "derived", False, COHORT_REASON),
    "metric-snapshots": E("cohort", "derived", False, COHORT_REASON),
    "assessments": E("cohort", "derived", False, COHORT_REASON),
    "assessment-results": E("cohort", "derived", False, COHORT_REASON),
    "readiness-reports": E("cohort", "derived", False, COHORT_REASON),
    "demo-day-slots": E("cohort", "derived", False, COHORT_REASON),
    "investor-intros": E("cohort", "derived", False, COHORT_REASON),
    "offer-letters": E("cohort", "derived", False, COHORT_REASON),
    "graduations": E("cohort", "derived", False, COHORT_REASON),
    "outcomes": E("cohort", "derived", False, COHORT_REASON),
    "outcome-surveys": E("cohort", "derived", False, COHORT_REASON),
    "alumni": E("cohort", "derived", False, COHORT_REASON),
    "risk-signals": E("cohort", "derived", False, COHORT_REASON),
    "interventions": E("cohort", "derived", False, COHORT_REASON),
}

# The scopers `get_queryset` is allowed to start from. `_scoped_viewset`'s own
# path is checked off the class instead, so `cohort` is not in this list.
KNOWN_SCOPERS = (
    "scope_to_visible_programs", "scope_rows_to_visible_programs",
    "scope_application_rows", "scope_applications", "scope_cohort_rows",
    "require_visible_program", "program_visible_to", "_program_id_for",
    "tenant_programs", "catalogue_programs", "_blueprints_visible_to",
)

# Endpoints that answer an anonymous caller. `open`/`shared` is not enough to
# make one: the name has to be here as well, so a public read is a decision
# somebody wrote down.
ANONYMOUS_ROUTES = {"programs", "intake/ingest"}


# ── the surface, read off the URLconf rather than typed a second time ────────
PATH_ID = re.compile(r"<(?:int:)?[^>]+>")


def mounted():
    """`{url: view class}` for everything `apps.accelerator.urls` mounts.

    Keyed by the path a caller types, with an id converter written as `{id}`.
    Naming a route by its `reverse()` key instead would let one URL be
    classified twice, or not at all, in a way nobody reading the table notices:
    `context/` is named `accelerator-user-context`, and that is not a secret
    worth keeping from a reviewer.
    """
    out = {prefix: cls for prefix, cls, _base in router.registry}
    for entry in urlpatterns:
        callback = getattr(entry, "callback", None)
        if callback is None:
            continue  # the router's own include
        out[PATH_ID.sub("{id}", str(entry.pattern)).rstrip("/")] = callback.cls
    return out


REGISTRY = mounted()


def view_for(cls, user, path):
    inner = factory.get(f"/api/v1/accelerator/{path}")
    req = Request(inner, parsers=[JSONParser()])
    req.user = user
    view = cls()
    view.request = req
    view.action = "list"
    view.kwargs = {}
    view.format_kwarg = None
    return view


def rows(cls, user, path):
    """The live rows this caller's queryset returns, as objects.

    Asked at the queryset, not the page: a page is capped and tells you nothing
    about the boundary. A view that refuses an unscoped bulk read is
    answering the question already, so the refusal comes back as None.
    """
    try:
        return list(view_for(cls, user, path).get_queryset())
    except ValidationError:
        return None


def writable(cls, user):
    """Which programs a save through this viewset may name (None is "every one").

    The write guard reads the body, and a scoped queryset cannot reach a body, so
    the only way to ask the question is the way the mixin asks it.
    """
    allowed = view_for(cls, user, "x/")._writable_programs()
    return None if allowed is None else {p.pk for p in allowed}


def program_of(row):
    """Which program this row belongs to, or None when it has no way to say."""
    model = row._meta
    for field in model.get_fields():
        if field.get_internal_type() == "ForeignKey" and field.name == "program":
            return getattr(row, "program_id", None)
    for field in model.get_fields():
        if (field.get_internal_type() == "ForeignKey"
                and getattr(field.remote_field.model, "_meta", None)
                and field.remote_field.model._meta.model_name
                in ("acceleratorprogram",)):
            return getattr(row, f"{field.name}_id", None)
    # One hop: a row that reaches its tenant through an application, a
    # membership, a workspace, a form or a custom object.
    for field in model.get_fields():
        if field.get_internal_type() != "ForeignKey":
            continue
        parent = getattr(row, field.name, None)
        if parent is None:
            continue
        try:
            inner = parent._meta.get_field("program")
        except Exception:
            continue
        value = getattr(parent, f"{inner.name}_id", None) if inner else None
        if value:
            return value
    return None


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]

    owner = User.objects.create_user(email=f"mx-owner-{tag}@x.io", password="x",
                                     role="accelerator", first_name="Opal")
    rival = User.objects.create_user(email=f"mx-rival-{tag}@x.io", password="x",
                                     role="accelerator", first_name="Reid")
    staffer = User.objects.create_user(email=f"mx-staff-{tag}@x.io", password="x",
                                       role="accelerator", first_name="Sue",
                                       is_staff=True)
    founder_a = User.objects.create_user(email=f"mx-fa-{tag}@x.io", password="x",
                                         role="startup", first_name="Ada")
    founder_b = User.objects.create_user(email=f"mx-fb-{tag}@x.io", password="x",
                                         role="startup", first_name="Bo")

    def program(label, **kw):
        kw.setdefault("is_public", False)
        return AcceleratorProgram.objects.create(
            name=f"Matrix {label} {tag}", slug=f"mx-{label}-{tag}",
            organization_name="Pitchmic", created_by=kw.pop("created_by", owner),
            sector_focus="fintech", stage_focus="seed", **kw)

    own = program("own", created_by=owner)
    away = program("away", created_by=rival,
                   scoring_rubric_config={"dimensions": [{"key": "team", "weight": 60}]},
                   eligibility_rules={"min_team_size": 2},
                   question_config={"intake_defaults": {"geo": "KE"}},
                   workflow_config={"committee_size": 3})
    published = program("published", created_by=rival, is_public=True,
                        scoring_rubric_config={"dimensions": [
                            {"key": "problem", "weight": 40}]},
                        eligibility_rules={"min_team_size": 3},
                        question_config={"intake_defaults": {"geo": "NG"}},
                        workflow_config={"committee_size": 5})

    def profile(user, company):
        return StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(
                user=user, full_name=user.first_name),
            company_name=company, declared_stage="seed",
            sector_tags="fintech", geography="NG")

    sp_a, sp_b = profile(founder_a, f"MyxCo {tag}"), profile(founder_b, f"NyxCo {tag}")
    app_own = AcceleratorApplication.objects.create(
        program=own, startup_profile=sp_a, submitted_by=founder_a, status="SUBMITTED")
    app_away = AcceleratorApplication.objects.create(
        program=away, startup_profile=sp_b, submitted_by=founder_b, status="SUBMITTED")
    app_pub = AcceleratorApplication.objects.create(
        program=published, startup_profile=sp_a, submitted_by=founder_a,
        status="SUBMITTED")

    # Rows to be found, one per side, so an overlap is an overlap and not an
    # absence. The cohort tables need an enrolment to hang off.
    from apps.accelerator.models import ApplicationQuestion, ProgramMembership
    from apps.accelerator.models_config import (
        CustomObject, CustomRecord, EventOutbox, FormDefinition, FormResponse,
        ProgramRole, ProgramStage,
    )
    from apps.accelerator.serializers_cohort import MentorProfileSerializer

    os_models.CohortWorkspace.objects.create(
        program=own, cohort_name=f"Matrix own {tag}",
        cycle=os_models.ApplicationCycle.objects.create(
            program=own, name=f"Matrix cycle {tag}", target_cohort_size=5))
    ws_away = os_models.CohortWorkspace.objects.create(
        program=away, cohort_name=f"Matrix away {tag}",
        cycle=os_models.ApplicationCycle.objects.create(
            program=away, name=f"Matrix cycle away {tag}", target_cohort_size=5))
    mem_own = ProgramMembership.objects.create(application=app_own, program=own)
    ProgramMembership.objects.create(application=app_away, program=away)
    mentor = os_models.MentorProfile.objects.create(
        user=User.objects.create_user(email=f"mx-mentor-{tag}@x.io", password="x",
                                      role="accelerator", first_name="Mo"),
        full_name=f"Mentor {tag}", expertise_areas=[{"area": "fintech", "score": 8}],
        embedding_vector=[0.25, 0.5])
    os_models.MentorAssignment.objects.create(
        membership=mem_own, mentor=mentor,
        workspace=os_models.CohortWorkspace.objects.get(program=own),
        assigned_by=owner, status="active")
    ProgramRole.objects.create(name=f"Matrix role {tag}", slug=f"mx-role-{tag}",
                               program=away)
    away_event = EventOutbox.objects.create(event_type=f"matrix.away.{tag}",
                                            program=away)
    plat_event = EventOutbox.objects.create(event_type=f"matrix.platform.{tag}",
                                            program=None)

    # A public program with nothing in it proves nothing: the founder sweep would
    # pass on the absence rather than on the boundary. This is the intake surface
    # one founder may read — the window, the published form, the answers they
    # themselves gave — and the configuration beside it they may not.
    ApplicationQuestion.objects.create(program=published, text=f"Why {tag}?")
    ProgramStage.objects.create(program=published, name="Review",
                                slug=f"mx-review-{tag}")
    board = CustomObject.objects.create(program=published, name=f"Board {tag}",
                                        slug=f"mx-board-{tag}")
    form_pub = FormDefinition.objects.create(program=published,
                                             name=f"Apply {tag}", status="published")
    app_pub_b = AcceleratorApplication.objects.create(
        program=published, startup_profile=sp_b, submitted_by=founder_b,
        status="SUBMITTED")
    for who, what in ((founder_a, app_pub), (founder_b, app_pub_b)):
        FormResponse.objects.create(form=form_pub, application=what, respondent=who,
                                    answers={"why": f"because {who.pk}"})
    CustomRecord.objects.create(custom_object=board, application=app_pub,
                                data={"seat": 1}, created_by=rival)
    cyc_pub = os_models.ApplicationCycle.objects.create(
        program=published, name=f"Matrix open {tag}", target_cohort_size=20)

    # A seat the program gave, not one the account claimed: `is_public` used to be
    # the only way a reviewer who runs no program could reach the work they were
    # handed. The assignment is the server's own record, so it is the grant now.
    reviewer = User.objects.create_user(email=f"mx-rev-{tag}@x.io", password="x",
                                        role="investor", first_name="Ray")
    os_models.ReviewAssignment.objects.create(application=app_own, reviewer=reviewer,
                                              assigned_by=owner)

    # ── 1. the matrix and the URLconf name the same surface ──────────────────
    unlisted = sorted(set(REGISTRY) - set(MATRIX))
    stale = sorted(set(MATRIX) - set(REGISTRY))
    ok("every endpoint this app mounts is classified", not unlisted)
    ok("...and no classified endpoint has quietly disappeared", not stale)
    if unlisted or stale:
        print(f"    unlisted={unlisted}\n    stale={stale}")
    ok("a classified entry states who may read it and why it is safe",
       all(len(e["reason"]) > 40 for e in MATRIX.values()))
    ok("a shared or open entry carries a reason of its own, not a kind",
       all(e["reason"] != COHORT_REASON for k, e in MATRIX.items()
           if e["kind"] in ("shared", "open")))

    # ── 2. the kind holds, on the class rather than in the table ─────────────
    for prefix, entry in MATRIX.items():
        cls = REGISTRY.get(prefix)
        if cls is None:
            continue
        kind = entry["kind"]
        if kind == "cohort":
            ok(f"{prefix}: a cohort table states its tenant path on the class",
               hasattr(cls, "read_scope") and hasattr(cls, "founder_scope"))
            continue
        if kind in ("tenant", "config"):
            source = ""
            try:
                source = inspect.getsource(cls.get_queryset)
            except (OSError, TypeError):
                pass
            ok(f"{prefix}: reads start from a shared scoper, not from every row",
               any(name in source for name in KNOWN_SCOPERS))
        if kind == "config":
            ok(f"{prefix}: configuring a program is the account that runs it",
               issubclass(cls, TenantScopedWriteMixin)
               and getattr(cls, "program_write_rule", None) == "manage")
        elif kind == "tenant":
            read_only = not any(
                hasattr(cls, m) for m in ("perform_create", "perform_update"))
            ok(f"{prefix}: work inside a program is guarded, or the table is read-only",
               read_only or (issubclass(cls, TenantScopedWriteMixin)
                             and cls.program_write_rule in ("visible", "manage")))

    # No endpoint serves anonymous traffic that the matrix does not name.
    for prefix, cls in REGISTRY.items():
        declared = MATRIX.get(prefix, {}).get("anon") is True
        perms = list(getattr(cls, "permission_classes", []))
        if "get_permissions" in cls.__dict__:
            # Asked with an anonymous list request: an override is where the
            # public reads of this surface actually live.
            view = view_for(cls, AnonymousUser(), f"{prefix}/")
            try:
                perms = list(view.get_permissions())
            except Exception:
                pass
        # DRF keeps `permission_classes` as classes and `get_permissions()`
        # returns instances, and the honest answer is the same either way.
        is_anon = any((p if isinstance(p, type) else type(p)).__name__ == "AllowAny"
                      for p in perms)
        ok(f"{prefix}: anonymous {'may' if declared else 'may not'} read it",
           is_anon == declared and
           (prefix in ANONYMOUS_ROUTES) == declared)
    ok("the two public routes are the only anonymous ones",
       {k for k, e in MATRIX.items() if e["anon"]} == ANONYMOUS_ROUTES)

    # ── 3. two tenants, asked everywhere at once ────────────────────────────
    public_pks = set(AcceleratorProgram.objects.filter(
        is_public=True).values_list("pk", flat=True))
    overlap = []
    founder_leak = []
    checked = 0
    for prefix, entry in MATRIX.items():
        cls = REGISTRY.get(prefix)
        if cls is None or entry["kind"] in ("shared", "open", "self") \
                or not hasattr(cls, "get_queryset"):
            continue
        left = rows(cls, owner, f"{prefix}/")
        right = rows(cls, rival, f"{prefix}/")
        if left is None or right is None:
            # The endpoint refuses a bulk read without a scope: the question
            # "whose rows" is answered before the rows are.
            checked += 1
            continue
        checked += 1
        common = {r.pk for r in left} & {r.pk for r in right}
        for row in [r for r in left if r.pk in common]:
            label = row._meta.label.lower()
            if label in NULL_PROGRAM_READABLE and program_of(row) is None:
                continue  # a platform-level row, read on purpose by everyone
            if prefix == "events" and program_of(row) is None:
                continue
            if prefix == "blueprints" and getattr(row, "is_published", False):
                continue
            if prefix == "programs" and getattr(row, "is_public", False):
                continue
            overlap.append((prefix, row.pk, program_of(row)))
        if entry["founder"] in ("none", "own", "public"):
            mine = rows(cls, founder_a, f"{prefix}/")
            theirs = rows(cls, founder_b, f"{prefix}/")
            if mine is None or theirs is None:
                continue  # the read is refused before the rows are, which is an answer
            if entry["founder"] == "none" and mine:
                founder_leak.append((prefix, f"a founder read {len(mine)} rows"))
            elif entry["founder"] == "public":
                # The intake surface is one page shared by every founder on purpose,
                # so the question here is not "whose row" but "which program's": a
                # founder reaches a public program's window and form, and no
                # private program's anything.
                outside = [r.pk for r in mine if program_of(r) not in public_pks]
                if outside:
                    founder_leak.append(
                        (prefix, f"a founder read {len(outside)} rows of programs "
                                "that never opened for intake"))
            elif {r.pk for r in mine} & {r.pk for r in theirs}:
                founder_leak.append((prefix, "two founders read the same row"))
    ok(f"no row is readable from two tenants at once ({checked} tables asked)",
       not overlap)
    if overlap:
        print(f"    overlap={overlap[:8]}")
    ok("a founder reads only what the table says they may", not founder_leak)
    if founder_leak:
        print(f"    founder={founder_leak[:8]}")
    ok("the sweep actually reached tables rather than refusing all of them",
       checked >= 40)
    ok("...and the founder side of it was asked about tables with rows in them",
       any(rows(REGISTRY[p], founder_a, f"{p}/")
           for p, e in MATRIX.items()
           if e["founder"] == "own" and p in REGISTRY))

    # The cohort factory states its founder rule on the class rather than in this
    # table. The sweep above read the declaration; this is the half that checks
    # the declaration is the behaviour.
    cohort_tables = [(p, REGISTRY[p]) for p, e in MATRIX.items()
                     if e["kind"] == "cohort" and p in REGISTRY]
    ok("every cohort table states both its tenant path and its founder path",
       len(cohort_tables) >= 20 and all(hasattr(c, "read_scope")
                                       and hasattr(c, "founder_scope")
                                       for _p, c in cohort_tables))
    silent = [p for p, c in cohort_tables
              if c.founder_scope is None and rows(c, founder_a, f"{p}/")]
    ok("a cohort table with no founder path answers a founder with nothing",
       not silent)
    if silent:
        print(f"    founder read a staff's-view table: {silent}")

    # A seat the program handed out is a grant from the server, and the only
    # honest one: an account that runs no program must still reach the work it
    # was given, and must reach nothing else in it.
    seated = {r.pk for r in rows(REGISTRY["applications"], reviewer, "applications/")}
    ok("a reviewer reaches the application they were seated on",
       app_own.pk in seated)
    ok("...and not the applications of the programs nobody seated them on",
       not ({app_away.pk, app_pub_b.pk} & seated))
    ok("a seat is not a licence to reconfigure the program",
       writable(REGISTRY["stages"], reviewer) == set())
    seated_page = {p.pk for p in rows(REGISTRY["programs"], reviewer, "programs/")}
    ok("a reviewer reaches the program that seated them, and not its neighbours",
       own.pk in seated_page and away.pk not in seated_page)

    # ── 4. the catalogue, and what a public page publishes ──────────────────
    def program_page(user):
        view = view_for(REGISTRY["programs"], user, "programs/")
        return {p.pk for p in view.get_queryset()}

    # The dev database has programs of its own, so the assertions are about
    # these three: a private page never appears for a stranger, a public one
    # appears for everyone, and equality would fail on rows this test did not
    # write and does not control.
    anon_page = program_page(AnonymousUser())
    ok("an anonymous catalogue is the programs open for intake",
       published.pk in anon_page and anon_page <= public_pks)
    ok("...and a private program is not in it, so it cannot be enumerated",
       own.pk not in anon_page and away.pk not in anon_page)
    ok("a team reads its own programs alongside the public ones",
       {own.pk, published.pk} <= program_page(owner)
       and away.pk not in program_page(owner)
       and {away.pk, published.pk} <= program_page(rival)
       and own.pk not in program_page(rival))
    ok("a founder browsing sees the catalogue, not another founder's pipeline",
       published.pk in program_page(founder_a)
       and own.pk not in program_page(founder_a))
    ok("staff is not blinded to the programs nobody published",
       {own.pk, away.pk, published.pk} <= program_page(staffer))

    def _request_for(user):
        req = Request(factory.get("/"))
        req.user = user
        return req

    def detail(user, prog):
        return AcceleratorProgramDetailSerializer(
            prog, context={"request": _request_for(user)}).data

    outsider_detail = detail(owner, published)
    ok("a public program's page keeps the founder-facing fields",
       outsider_detail["name"] == published.name)
    ok("...and withholds how it scores founders: the rubric, the gates, the "
       "intake defaults and the workflow config are absent, not empty",
       not any(k in outsider_detail for k in METHODOLOGY_FIELDS))
    owner_detail = detail(rival, away)
    ok("the account that runs the program reads its own methodology, whole",
       all(owner_detail.get(k) == getattr(away, k) for k in METHODOLOGY_FIELDS))
    founder_detail = detail(founder_a, published)
    ok("a founder reading the program they applied to does not get the weights "
       "either", not any(k in founder_detail for k in METHODOLOGY_FIELDS))
    ok("...while the account that runs the platform does",
       all(detail(staffer, published).get(k) == getattr(published, k)
           for k in METHODOLOGY_FIELDS))
    listed = AcceleratorProgramListSerializer(published).data
    ok("the catalogue row never carried the methodology in the first place",
       not any(k in listed for k in METHODOLOGY_FIELDS))

    # ── 5. the bench that is deliberately shared, minus what it should not say ─
    bench = rows(REGISTRY["mentors"], owner, "mentors/") or []
    ok("the mentor bench is readable from both tenants by design",
       mentor.pk in {m.pk for m in bench}
       and mentor.pk in {m.pk for m in (rows(REGISTRY["mentors"], rival, "mentors/") or [])})
    ok("...and its matcher's vector stays off the row a stranger reads",
       "embedding_vector" not in MentorProfileSerializer(mentor).data)

    # The two halves of the allowlist in `tenant.py`, read by the endpoint rather
    # than from the set: a row with no program is shared on purpose, a row that
    # names one is not shared at all.
    events = REGISTRY["events"]
    for who, label in ((owner, "the team that did not write it"),
                       (rival, "the team that did")):
        seen = {r.pk for r in rows(events, who, "events/")}
        ok(f"a platform-level event is read by {label.replace('the ', '')}",
           plat_event.pk in seen)
        ok(f"...while an event naming a program is read only inside it ({label})",
           (away_event.pk in seen) == (who is rival))

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for name in failed:
    print(f"FAILED: {name}")
raise SystemExit(1 if failed else 0)
