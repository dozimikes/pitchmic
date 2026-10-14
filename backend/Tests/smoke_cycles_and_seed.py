"""Rollback-only smoke: application cycles, and two doors that were open too wide.

Doctrine under test:

- A cycle's schedule is its own, and an absent date stays absent. A cycle nobody
  put dates on reports "unscheduled" — not "closed", not "deadline in 0 days".
  ``target_cohort_size`` is required on create because the model's
  ``default=15`` is what an unplanned cycle looks like, not what a director
  decided.
- Impossible schedules are refused rather than stored, including when a PATCH
  moves only one end of the window.
- Cycles are read only inside programs the account actually works in, and
  written only inside ones it runs: reading a public program's calendar is not
  a licence to change it. Listing them used to be the only way to read another
  organization's schedule, and no write path was guarded at all.
- Deleting a cycle applications point at is refused: that link is ``SET_NULL``,
  so the delete would detach live rows without saying so.
- ``seed-defaults/`` writes programs and questions. It answered anonymous POSTs.
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
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    FounderApplicationProfile,
    StartupApplicationProfile,
)
from apps.accelerator.models_os import ApplicationCycle, ProgramStaffMembership
from apps.accelerator.serializers import (
    AcceleratorApplicationCreateSerializer,
    cohort_runtime,
)
from apps.accelerator.serializers_config import ApplicationCycleSerializer

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def payload_rows(data):
    """Both paginated and plain list bodies, so the assertion isn't coupled to
    whatever pagination happens to be configured."""
    return data["results"] if isinstance(data, dict) and "results" in data else data


def as_request(user):
    """Serializer context with a signed-in caller.

    A serializer that proves the caller against the row they name needs the
    request the view would have given it; a direct call without one is asking
    the question with nobody in the room.
    """
    req = factory.post("/")
    req.user = user
    return {"request": req}


def rows_for(cycles):
    return {c.pk for c in payload_rows(cycles)}


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    now = timezone.now()
    today = timezone.localdate()

    staff = User.objects.create_user(
        email=f"cyc-staff-{tag}@x.io", password="x", role="accelerator")
    outsider = User.objects.create_user(
        email=f"cyc-outsider-{tag}@x.io", password="x", role="accelerator")
    founder = User.objects.create_user(
        email=f"cyc-founder-{tag}@x.io", password="x", role="startup")

    def make_program(label, **kw):
        return AcceleratorProgram.objects.create(
            name=f"Cycle {label} {tag}",
            slug=f"cycle-{label}-{tag}",
            organization_name="Northstar Ventures",
            sector_focus="fintech",
            stage_focus="seed",
            **kw,
        )

    home = make_program("home", is_public=False, created_by=staff)
    # A published program somebody else runs, with `staff` on its staff. That is
    # what lets the two reach questions be asked apart: reading another program's
    # intake calendar comes from the membership the program wrote, and reading it
    # is not a licence to move it.
    public = make_program("public", is_public=True, created_by=outsider)
    away = make_program("away", is_public=False, created_by=outsider)
    ProgramStaffMembership.objects.create(user=staff, program=public, role="manager")

    def make_cycle(program, label, **kw):
        kw.setdefault("target_cohort_size", 10)
        return ApplicationCycle.objects.create(
            program=program, name=f"{label} {tag}", **kw)

    inside = make_cycle(
        home, "inside",
        open_date=now - timedelta(days=5), deadline=now + timedelta(days=20),
        cohort_start_date=today - timedelta(days=20),
        cohort_end_date=today + timedelta(days=100))
    unscheduled = make_cycle(home, "unscheduled")
    not_yet = make_cycle(
        home, "not-yet", open_date=now + timedelta(days=10),
        # Half a day of slack, so ".days" of the difference cannot straddle a
        # midnight boundary between the fixture and the serializer.
        deadline=now + timedelta(days=30, hours=12))
    past = make_cycle(
        home, "past", open_date=now - timedelta(days=40),
        deadline=now - timedelta(days=10))
    published = make_cycle(public, "published", deadline=now + timedelta(days=3))
    away_cycle = make_cycle(away, "away", deadline=now + timedelta(days=3))
    empties = make_cycle(home, "deletable")

    # ── 1. derived fields: what the schedule says, and nothing else ──────────
    d_inside = ApplicationCycleSerializer(inside).data
    d_unsched = ApplicationCycleSerializer(unscheduled).data
    d_notyet = ApplicationCycleSerializer(not_yet).data
    d_past = ApplicationCycleSerializer(past).data

    ok("a cycle with no dates is unscheduled, not closed",
       d_unsched["scheduled_window"]["state"] == "unscheduled")
    ok("an unscheduled cycle reports no opens and no closes, rather than 0 days",
       d_unsched["scheduled_window"]["opens_at"] is None
       and d_unsched["scheduled_window"]["closes_at"] is None
       and d_unsched["days_until_deadline"] is None)
    ok("before the window opens it says so",
       d_notyet["scheduled_window"]["state"] == "not_yet_open")
    ok("days until the deadline counts real days left",
       d_notyet["days_until_deadline"] == 30)
    ok("inside the window it says so",
       d_inside["scheduled_window"]["state"] == "inside_window")
    ok("after the deadline the state carries that, so the clamped 0 is not the only signal",
       d_past["scheduled_window"]["state"] == "past_deadline"
       and d_past["days_until_deadline"] == 0)
    ok("counts are real zeros, not dashes",
       d_unsched["application_count"] == 0 and d_unsched["accepted_count"] == 0)

    # The cohort week uses the same function the program chip does, so the two
    # cannot tell different stories about the same pair of dates.
    expect = cohort_runtime(inside)
    ok("the cycle's cohort runtime comes from the shared helper",
       d_inside["cohort_runtime"] == expect)
    ok("20 days in is week 3 of an 18-week span",
       expect["week"] == 3 and expect["total_weeks"] == 18)
    ok("the 12-week default does not leak into a cycle readout",
       all(12 not in (ApplicationCycleSerializer(c).data["cohort_runtime"].values())
           for c in (inside, unscheduled, not_yet, past)))

    founder_profile = FounderApplicationProfile.objects.create(user=founder)
    startup = StartupApplicationProfile.objects.create(
        founder_profile=founder_profile, company_name=f"Kola Logistics {tag}")
    app = AcceleratorApplication.objects.create(
        program=home, startup_profile=startup, submitted_by=founder,
        cycle=inside, status="SUBMITTED")

    d2 = ApplicationCycleSerializer(inside).data
    ok("a submission linked to the cycle is counted",
       d2["application_count"] == 1 and d2["accepted_count"] == 0)
    app.status = "ACCEPTED"
    app.save(update_fields=["status"])
    ok("accepted counts are a separate number from the total",
       ApplicationCycleSerializer(inside).data["accepted_count"] == 1
       and ApplicationCycleSerializer(inside).data["application_count"] == 1)

    # ── 2. impossible schedules are refused ──────────────────────────────────
    def invalid(payload, field, partial=False, instance=None):
        s = ApplicationCycleSerializer(instance=instance, data=payload, partial=partial)
        return not s.is_valid() and field in s.errors

    ok("a deadline before the window opens cannot be stored",
       invalid({"program_id": home.pk, "name": "bad", "target_cohort_size": 5,
                "open_date": (now + timedelta(days=10)).isoformat(),
                "deadline": now.isoformat()}, "deadline"))
    ok("a cohort that ends before it starts cannot be stored",
       invalid({"program_id": home.pk, "name": "bad2", "target_cohort_size": 5,
                "cohort_start_date": today.isoformat(),
                "cohort_end_date": (today - timedelta(days=5)).isoformat()},
               "cohort_end_date"))
    ok("no target size means nobody said how big the cohort is",
       invalid({"program_id": home.pk, "name": "no-size"}, "target_cohort_size"))
    ok("a cycle has to belong to a program",
       invalid({"name": "orphan", "target_cohort_size": 5}, "program_id"))
    ok("moving only the deadline is still checked against the stored opening",
       invalid({"deadline": (inside.open_date - timedelta(days=1)).isoformat()},
               "deadline", partial=True, instance=inside))
    ok("a valid one-sided update still goes through",
       ApplicationCycleSerializer(
           instance=inside, data={"deadline": (now + timedelta(days=25)).isoformat()},
           partial=True).is_valid())

    # ── 3. who may see and write cycles ──────────────────────────────────────
    list_view = cfg_views.ApplicationCycleViewSet.as_view(
        {"get": "list", "post": "create"})
    detail_view = cfg_views.ApplicationCycleViewSet.as_view(
        {"get": "retrieve", "delete": "destroy"})

    def as_list(user, **params):
        req = factory.get("/api/v1/accelerator/application-cycles/", params)
        if user is not None:
            force_authenticate(req, user=user)
        return list_view(req)

    def as_post(user, payload):
        req = factory.post("/api/v1/accelerator/application-cycles/", payload, format="json")
        if user is not None:
            force_authenticate(req, user=user)
        return list_view(req)

    def as_detail(user, cycle, method="get", payload=None):
        handlers = {"delete": {"delete": "destroy"},
                    "patch": {"patch": "partial_update"}}
        view = cfg_views.ApplicationCycleViewSet.as_view(
            handlers.get(method, {"get": "retrieve"}))
        url = f"/api/v1/accelerator/application-cycles/{cycle.pk}/"
        req = (getattr(factory, method)(url, payload, format="json")
               if payload is not None else getattr(factory, method)(url))
        if user is not None:
            force_authenticate(req, user=user)
        return view(req, pk=cycle.pk)

    ok("an anonymous caller cannot read cycles",
       as_list(None).status_code in (401, 403))

    founder_ids = {r["id"] for r in payload_rows(as_list(founder).data)}
    ok("a founder only sees cycles of programs published for intake",
       founder_ids == {published.pk})
    ok("a founder never sees another program's calendar",
       not ({inside.pk, unscheduled.pk, not_yet.pk, past.pk} & founder_ids))

    staff_ids = {r["id"] for r in payload_rows(as_list(staff).data)}
    ok("an account sees the cycles of the programs it works in",
       {inside.pk, unscheduled.pk, not_yet.pk, past.pk, empties.pk, published.pk} == staff_ids)
    ok("...and not another team's cycle", away_cycle.pk not in staff_ids)
    passerby = User.objects.create_user(email=f"cyc-nosy-{tag}@x.io", password="x",
                                        role="accelerator")
    ok("a team with no relationship reads nobody's calendar, published or not",
       rows_for(as_list(passerby).data) == set())

    outsider_detail = as_detail(outsider, inside)
    ok("reading one cycle of a program the account is not in is a 404, not a leak",
       outsider_detail.status_code == 404)

    scoped = as_list(staff, program_id=home.pk)
    ok("the program filter narrows to that program",
       {r["id"] for r in payload_rows(scoped.data)}
       == {inside.pk, unscheduled.pk, not_yet.pk, past.pk, empties.pk})

    ok("a founder cannot open a cycle",
       as_post(founder, {"program_id": home.pk, "name": "x",
                         "target_cohort_size": 5}).status_code in (401, 403))

    before = ApplicationCycle.objects.count()
    crossed = as_post(staff, {"program_id": away.pk, "name": f"crossed {tag}",
                              "target_cohort_size": 5})
    ok("a cycle is opened only in a program this account runs",
       crossed.status_code == 400
       and ApplicationCycle.objects.count() == before)
    # The wider half of the same hole: a public program sits on the catalogue,
    # so every accelerator account can read it — and used to be able to move its
    # intake dates with it, because the create guard asked the read question.
    borrowed = as_post(staff, {"program_id": public.pk, "name": f"borrowed {tag}",
                               "target_cohort_size": 5})
    ok("reading a program the account staffs is not a licence to open its "
       "intake windows",
       borrowed.status_code == 400
       and not ApplicationCycle.objects.filter(name=f"borrowed {tag}").exists())
    moved = as_detail(staff, published, method="patch",
                      payload={"deadline": (now - timedelta(days=2)).isoformat()})
    published.refresh_from_db()
    ok("...nor to reschedule a window of a program it does not run",
       moved.status_code == 400
       and published.deadline != (now - timedelta(days=2)))
    kept = as_detail(staff, inside, method="patch",
                     payload={"deadline": (now + timedelta(days=30, hours=12)).isoformat()})
    inside.refresh_from_db()
    ok("the program's own account still moves its own schedule",
       kept.status_code == 200
       and inside.deadline == (now + timedelta(days=30, hours=12)))

    created = as_post(staff, {"program_id": home.pk, "name": f"new cycle {tag}",
                              "target_cohort_size": 7,
                              "open_date": now.isoformat(),
                              "deadline": (now + timedelta(days=14)).isoformat()})
    new_cycle = ApplicationCycle.objects.filter(name=f"new cycle {tag}").first()
    ok("a stated size is stored as stated",
       created.status_code == 201 and new_cycle is not None
       and new_cycle.target_cohort_size == 7)
    ok("the created cycle landed in the program that was named",
       new_cycle is not None and new_cycle.program_id == home.pk)

    refused = as_detail(staff, inside, method="delete")
    ok("deleting a cycle applications point at is refused",
       refused.status_code == 409 and refused.data.get("application_count") == 1)
    ok("...and the cycle, its link and the count survive the attempt",
       ApplicationCycle.objects.filter(pk=inside.pk).exists()
       and AcceleratorApplication.objects.filter(pk=app.pk, cycle_id=inside.pk).exists()
       and ApplicationCycleSerializer(ApplicationCycle.objects.get(pk=inside.pk)).data
       ["application_count"] == 1)

    gone = as_detail(staff, empties, method="delete")
    ok("an empty cycle can still be deleted",
       gone.status_code == 204 and not ApplicationCycle.objects.filter(pk=empties.pk).exists())

    # ── 4. the seed endpoint no longer answers strangers ─────────────────────
    seed_url = "/api/v1/accelerator/seed-defaults/"
    programs_before = AcceleratorProgram.objects.count()
    anon_seed = acc_views.SeedAcceleratorDefaultsView.as_view()
    req = factory.post(seed_url, {}, format="json")
    denied = anon_seed(req)
    ok("an anonymous POST cannot seed programs and questions",
       denied.status_code in (401, 403)
       and AcceleratorProgram.objects.count() == programs_before)

    req = factory.post(seed_url, {}, format="json")
    force_authenticate(req, user=founder)
    ok("a founder cannot seed either",
       acc_views.SeedAcceleratorDefaultsView.as_view()(req).status_code in (401, 403)
       and AcceleratorProgram.objects.count() == programs_before)

    # ── 5. which cycle a submission is filed under ───────────────────────────
    def open_cycle(program, label, **kw):
        kw.setdefault("open_date", now - timedelta(days=1))
        kw.setdefault("deadline", now + timedelta(days=9))
        return ApplicationCycle.objects.create(
            program=program, name=f"{label} {tag}", target_cohort_size=5, **kw)

    single = make_program("single", is_public=False, created_by=staff)
    overlapping = make_program("overlapping", is_public=False, created_by=staff)
    drafted = make_program("drafted", is_public=False, created_by=staff)
    none_at_all = make_program("none-at-all", is_public=False, created_by=staff)
    expired = make_program("expired", is_public=False, created_by=staff)
    lone = open_cycle(single, "lone")
    first = open_cycle(overlapping, "first")
    open_cycle(overlapping, "second")
    open_cycle(drafted, "draft", status="DRAFT")
    open_cycle(expired, "shut", open_date=now - timedelta(days=30),
               deadline=now - timedelta(days=2))

    ok("a single open window files the submission under it",
       ApplicationCycle.objects.current_for(single) == lone)
    ok("two overlapping windows are not settled by a coin flip",
       ApplicationCycle.objects.current_for(overlapping) is None)
    ok("a cycle nobody opened is not a window",
       ApplicationCycle.objects.current_for(drafted) is None)
    ok("a program with no cycles files nothing",
       ApplicationCycle.objects.current_for(none_at_all) is None)
    ok("a window whose deadline has passed is closed",
       ApplicationCycle.objects.current_for(expired) is None)

    def submit(program, cycle=None):
        payload = {"program": program.pk, "startup_profile": startup.pk}
        if cycle is not None:
            payload["cycle"] = cycle.pk
        ser = AcceleratorApplicationCreateSerializer(data=payload,
                                                     context=as_request(founder))
        valid = ser.is_valid()
        return (ser, valid, ser.save(submitted_by=founder) if valid else None)

    # One startup profile can apply to many programs (the uniqueness rule is
    # per program + profile), so each case below just names a different program.
    _, valid, filed = submit(single)
    ok("a submission names no cycle and still lands in the open one",
       valid and filed is not None and filed.cycle_id == lone.pk)

    program_b = make_program("stamping-b", is_public=False, created_by=staff)
    open_cycle(program_b, "b1")
    open_cycle(program_b, "b2")
    _, valid_b, filed_b = submit(program_b)
    ok("an ambiguous program leaves the application uncycled rather than guessed",
       valid_b and filed_b is not None and filed_b.cycle_id is None)

    program_c = make_program("stamping-c", is_public=False, created_by=staff)
    named = open_cycle(program_c, "named")
    open_cycle(program_c, "also")
    _, valid_c, filed_c = submit(program_c, cycle=named)
    ok("a cycle the submission names is honoured over the ambiguity",
       valid_c and filed_c is not None and filed_c.cycle_id == named.pk)

    crossed_program = make_program("crossed", is_public=False, created_by=staff)
    crossed_ser = AcceleratorApplicationCreateSerializer(data={
        "program": crossed_program.pk, "startup_profile": startup.pk, "cycle": lone.pk,
    }, context=as_request(founder))
    ok("a cycle from another program's window cannot be claimed",
       not crossed_ser.is_valid() and "cycle" in crossed_ser.errors)

    # The company behind a submission is as much a claim as the cycle is: it was
    # an id resolved against every profile in the table.
    stranger = StartupApplicationProfile.objects.create(
        founder_profile=FounderApplicationProfile.objects.create(
            user=User.objects.create_user(email=f"cs-stranger-{tag}@x.io",
                                          password="x", role="startup")),
        company_name=f"Not Yours {tag}")
    stolen_ser = AcceleratorApplicationCreateSerializer(data={
        "program": home.pk, "startup_profile": stranger.pk,
    }, context=as_request(founder))
    ok("a founder cannot file an application under another company's profile",
       not stolen_ser.is_valid()
       and "startup_profile" in stolen_ser.errors
       and not AcceleratorApplication.objects.filter(
           program=home, startup_profile=stranger).exists())

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
for name, passed in checks:
    print(f"{'PASS' if passed else 'FAIL'}  {name}")
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
raise SystemExit(1 if failed else 0)
