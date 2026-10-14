"""Rollback-only smoke: what week the cohort is in, and who holds a role.

Doctrine under test:

- A model default is not a plan. ``program_duration_weeks`` is 12 on every
  program created without one, so the sidebar's "Wk 7 / 12" was arithmetic on a
  default rather than a schedule anyone recorded. The week number now comes from
  ``cohort_start_date`` / ``cohort_end_date`` only, and a cohort with no dates
  says it has no dates.
- Missing is not zero. ``ProgramMembership`` links startups to cohorts and has no
  role column, so counting it made every role read "0 Active" forever. A role
  whose people cannot be tied to it returns null, which the screen shows as a
  dash. A real zero is a different answer and must stay a number.
- A program's configuration list is that program's. The roles screen listed
  every program's roles while letting you edit what it showed.
"""
import os
import uuid
from datetime import timedelta

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accelerator import views as acc_views
from apps.accelerator import views_config as cfg_views
from apps.accelerator.models import AcceleratorProgram
from apps.accelerator.models_config import ProgramRole
from apps.accelerator.models_os import ProgramStaffMembership
from apps.accelerator.serializers import (
    AcceleratorProgramDetailSerializer,
    AcceleratorProgramListSerializer,
    cohort_runtime,
)
from apps.accelerator.serializers_config import ProgramRoleSerializer

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def payload_rows(data):
    """Both paginated and plain list bodies, so the assertion isn't coupled to
    whatever pagination happens to be configured."""
    return data["results"] if isinstance(data, dict) and "results" in data else data


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    today = timezone.localdate()

    # The programs have an owner, because that is what makes them somebody's to
    # read. `is_public` puts one on the marketplace; it does not put its
    # configuration on another team's desk.
    runner = User.objects.create_user(email=f"runtime-runner-{tag}@x.io",
                                      password="x", role="accelerator")

    def make(label, **kw):
        return AcceleratorProgram.objects.create(
            name=f"Runtime {label} {tag}",
            slug=f"runtime-{label}-{tag}",
            organization_name="Northstar Ventures",
            is_public=True,
            created_by=runner,
            sector_focus="fintech",
            stage_focus="seed",
            **kw,
        )

    # ── 1. cohort_runtime reads the two schedule dates and nothing else ──────
    no_dates = make("no-dates")
    upcoming = make("upcoming", cohort_start_date=today + timedelta(days=30),
                    cohort_end_date=today + timedelta(days=100))
    running = make("running", cohort_start_date=today - timedelta(days=20),
                   cohort_end_date=today + timedelta(days=120))
    start_only = make("start-only", cohort_start_date=today - timedelta(days=20))
    ended = make("ended", cohort_start_date=today - timedelta(days=100),
                 cohort_end_date=today - timedelta(days=5))
    starts_today = make("starts-today", cohort_start_date=today,
                        cohort_end_date=today + timedelta(days=6))
    backwards = make("backwards", cohort_start_date=today - timedelta(days=10),
                     cohort_end_date=today - timedelta(days=20))
    other = make("other")

    ok("a program with no dates is unscheduled, not week 1",
       cohort_runtime(no_dates) == {"phase": "unscheduled", "week": None, "total_weeks": None})
    ok("the 12-week model default never becomes the denominator",
       no_dates.program_duration_weeks == 12
       and cohort_runtime(no_dates)["total_weeks"] is None)
    ok("a cohort that has not started reports upcoming with no week",
       cohort_runtime(upcoming)["phase"] == "upcoming"
       and cohort_runtime(upcoming)["week"] is None)
    ok("its length still comes from its own dates",
       cohort_runtime(upcoming)["total_weeks"] == 11)  # 70 days
    rt_running = cohort_runtime(running, today=today)
    ok("a live cohort reports its week",
       rt_running["phase"] == "running" and rt_running["week"] == 3)  # 20 days in
    ok("and its total from the end date, not the default",
       rt_running["total_weeks"] == 21)  # 140 days
    ok("day zero of a cohort is week 1, not week 0",
       cohort_runtime(starts_today, today=today)["week"] == 1
       and cohort_runtime(starts_today, today=today)["total_weeks"] == 1)
    ok("a cohort with a start but no end is running with an unknown total",
       cohort_runtime(start_only, today=today)["phase"] == "running"
       and cohort_runtime(start_only, today=today)["week"] == 3
       and cohort_runtime(start_only, today=today)["total_weeks"] is None)
    ok("a passed cohort is ended, not week negative",
       cohort_runtime(ended, today=today)["phase"] == "ended"
       and cohort_runtime(ended, today=today)["week"] is None)
    ok("end-before-start yields no total instead of a negative one",
       cohort_runtime(backwards, today=today)["total_weeks"] is None
       and cohort_runtime(backwards, today=today)["phase"] == "ended")
    # The dates on these rows are what the serializer must read, so a hardcoded
    # week anywhere in the serializer would fail these.
    list_data = AcceleratorProgramListSerializer(start_only).data
    ok("the programs list carries cohort_runtime",
       list_data.get("cohort_runtime", {}).get("phase") == "running"
       and list_data["cohort_runtime"]["total_weeks"] is None)
    ok("the programs list exposes the end date it used",
       "cohort_end_date" in list_data)
    detail_data = AcceleratorProgramDetailSerializer(running).data
    ok("the detail serializer carries cohort_runtime too",
       detail_data.get("cohort_runtime", {}).get("week") == 3)
    ok("an unscheduled program serialises no week",
       AcceleratorProgramListSerializer(no_dates).data["cohort_runtime"]["week"] is None)

    # ── 2. member_count counts staff, and says null when it cannot ───────────
    def staff(program, who, role, is_active=True):
        user = User.objects.create_user(
            email=f"staff-{who}-{tag}@x.io", password="x", role="accelerator"
        )
        return ProgramStaffMembership.objects.create(
            user=user, program=program, role=role, is_active=is_active
        )

    director_role = ProgramRole.objects.create(
        program=running, name="Program Director", slug="program-director"
    )
    reviewer_role = ProgramRole.objects.create(program=running, name="Reviewer", slug="reviewer")
    committee_role = ProgramRole.objects.create(
        program=running, name="Selection Committee", slug="selection-committee"
    )
    bespoke_role = ProgramRole.objects.create(program=running, name="Ghana Lead", slug="ghana-lead")
    orgwide_role = ProgramRole.objects.create(program=None, name="Reviewer", slug="reviewer")
    other_director = ProgramRole.objects.create(program=other, name="Program Director", slug="program-director")

    staff(running, "d1", "director")
    staff(running, "d2", "director")
    staff(running, "d3", "director", is_active=False)
    staff(other, "d4", "director")
    staff(running, "c1", "committee")

    def count(role):
        return ProgramRoleSerializer(role).data["member_count"]

    ok("a role counts the program's active staff carrying it", count(director_role) == 2)
    ok("an inactive membership is not counted", count(director_role) != 3)
    ok("another program's staff are not counted", count(other_director) == 1)
    ok("a role the staff roster can carry counts zero when nobody holds it",
       count(reviewer_role) == 0)
    ok("a slug the roster cannot carry is unknown, not zero",
       count(bespoke_role) is None)
    ok("an organization-wide role has no single program to count",
       count(orgwide_role) is None)
    ok("the roster's own label folds onto its code", count(committee_role) == 1)

    # ── 3. the roles endpoint is scoped to one program ───────────────────────
    reader = runner

    def role_list(program_id, as_user=None):
        req = factory.get("/api/v1/accelerator/program-roles/", {"program_id": program_id})
        force_authenticate(req, user=as_user or reader)
        resp = cfg_views.ProgramRoleViewSet.as_view({"get": "list"})(req)
        return resp

    resp_running = role_list(running.pk)
    ok("the roles list answers an authenticated reader", resp_running.status_code == 200)
    rows_running = payload_rows(resp_running.data)
    ids_running = {row["id"] for row in rows_running}
    ok("one program's role list is not every program's",
       other_director.pk not in ids_running and director_role.pk in ids_running)
    ok("everything it returns belongs to the program asked for",
       ids_running == {director_role.pk, reviewer_role.pk, committee_role.pk, bespoke_role.pk})
    row_director = next(r for r in rows_running if r["id"] == director_role.pk)
    ok("the endpoint carries member_count through to the screen",
       row_director["member_count"] == 2)
    row_bespoke = next(r for r in rows_running if r["id"] == bespoke_role.pk)
    ok("the endpoint passes null through as null", row_bespoke["member_count"] is None)

    resp_other = role_list(other.pk)
    ids_other = {row["id"] for row in payload_rows(resp_other.data)}
    ok("the other program sees only its own roles",
       ids_other == {other_director.pk})

    # The dev database carries its own programs, so this asserts the fixture's
    # rows rather than a count: a published program's configuration stays with
    # the team that runs it.
    stranger = User.objects.create_user(email=f"roles-stranger-{tag}@x.io",
                                        password="x", role="accelerator")
    resp_stranger = role_list(running.pk, as_user=stranger)
    stranger_rows = (payload_rows(resp_stranger.data)
                     if resp_stranger.status_code == 200 else [])
    ok("a team with no relationship to the program is handed none of its roles",
       not ({row["id"] for row in stranger_rows}
            & {director_role.pk, reviewer_role.pk, committee_role.pk, bespoke_role.pk}))

    # ── 4. the schedule editor's contract: PATCH dates, get a real week back ─
    writer = User.objects.create_user(email=f"schedule-writer-{tag}@x.io",
                                      password="x", role="accelerator")
    program_view = acc_views.AcceleratorProgramViewSet.as_view({"patch": "partial_update"})

    def patch_program(payload):
        req = factory.patch(f"/api/v1/accelerator/programs/{no_dates.pk}/", payload, format="json")
        force_authenticate(req, user=writer)
        # The factory-built request carries no URL kwargs, so the lookup is passed in.
        return program_view(req, pk=no_dates.pk)

    start_saved = today - timedelta(days=16)
    end_saved = today + timedelta(days=25)
    resp_patch = patch_program(
        {"cohort_start_date": start_saved.isoformat(),
         "cohort_end_date": end_saved.isoformat()}
    )
    ok("an accelerator account can record the schedule", resp_patch.status_code == 200)
    no_dates.refresh_from_db()
    ok("the dates are stored as dates",
       no_dates.cohort_start_date == start_saved and no_dates.cohort_end_date == end_saved)
    rt_saved = cohort_runtime(no_dates, today=today)
    ok("the same program now reports a real week",
       rt_saved["phase"] == "running" and rt_saved["week"] == 3)
    ok("and a total from the end date, not the 12-week default",
       rt_saved["total_weeks"] == 6)  # 41 days
    resp_clear = patch_program(
        {"cohort_start_date": None, "cohort_end_date": None}
    )
    no_dates.refresh_from_db()
    ok("an empty schedule saves null, not a blank string or a stale date",
       resp_clear.status_code == 200
       and no_dates.cohort_start_date is None and no_dates.cohort_end_date is None)
    ok("a cleared cohort is unscheduled again, not week 1",
       cohort_runtime(no_dates)["phase"] == "unscheduled")

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
