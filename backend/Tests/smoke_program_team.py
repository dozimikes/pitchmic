"""Rollback-only smoke: the program's own team — who may seat a person, and what
that seat is worth.

Doctrine under test:

- **A seat is the only way a second human comes to work a program.** Reach used to
  be `created_by` or the front door being open, which left a two-person team with
  no shape at all: `ProgramStaffMembership` was read by the reach rule, by the
  reviewer-candidate pool and by the role member counts, and written by nothing.
  This is the surface that writes it.
- **A seat grants read and work, never configuration.** The seated account may
  open the tenant's records and file work inside them; it may not change how the
  program judges founders, seat anyone else, or add a stage. That is
  `program_write_rule = "manage"`, and it is what keeps "add a colleague" from
  becoming "hand over the methodology".
- **A seat cannot be claimed.** Every write to this table names a program, and the
  guard refuses any program the caller does not own — so no account widens its own
  reach by POSTing a membership for itself.
- **The outbox holds the actor, because the row cannot.** The model has no actor
  column, so the endpoint reports no "seated by" rather than attributing the seat
  to somebody plausible, and the event naming who did it is written beside it.
- **A founder is not seatable.** Seating an account on the founder side of the
  door would hand it the program's whole record layer — exactly the read the reach
  rule exists to refuse.
- **The recovery path for an unowned program is named, not defaulted.** A row
  with no `created_by` reaches only staff, so for anyone who means to run it the
  program is dead. `claim_program` gives it an owner when a human asks for that
  by name, refuses to move a program that already has one, and records the claim
  with no actor, because a shell command has none.
"""
import io
import os
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import transaction
from django.http import Http404
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accelerator import views as acc_views
from apps.accelerator import views_config as cfg
from apps.accelerator.models import AcceleratorProgram
from apps.accelerator.models_config import EventOutbox, ProgramStage
from apps.accelerator.models_os import ProgramStaffMembership
from apps.accelerator.permissions import programs_owned_by, programs_visible_to
from apps.accelerator.tenant import catalogue_programs, may_configure_program

User = get_user_model()
factory = APIRequestFactory()
checks = []

STAFF = cfg.ProgramStaffMembershipViewSet
STAGES = cfg.ProgramStageViewSet
BASE = "/api/v1/accelerator/program-staff/"


def ok(name, cond):
    checks.append((name, bool(cond)))


def _request(cls, method, path, user, action, payload=None, **kwargs):
    inner = (
        getattr(factory, method)(path)
        if payload is None
        else getattr(factory, method)(path, payload, format="json")
    )
    req = Request(inner, parsers=[JSONParser()])
    req.user = user
    vs = cls()
    vs.request = req
    vs.action = action
    vs.kwargs = kwargs
    vs.format_kwarg = None
    return vs, req


def run(cls, method, path, user, payload=None, action=None, **kwargs):
    """Call an action directly and hand back (response, exception).

    Direct calls skip `initial()`, so the permission class is not consulted; what
    is under test here is the tenant rules in `get_queryset` and the write guard,
    which run either way.
    """
    action = action or {
        "get": "list", "post": "create", "patch": "partial_update",
        "delete": "destroy",
    }[method]
    vs, req = _request(cls, method, path, user, action, payload, **kwargs)
    fn = getattr(vs, action)
    try:
        return fn(req, **kwargs), None
    except Exception as exc:  # noqa: BLE001 - the refusal is the result
        return None, exc


def rows_of(resp):
    if resp is None:
        return None
    data = resp.data
    return data["results"] if isinstance(data, dict) and "results" in data else data


def roster(user, program=None):
    path = BASE + (f"?program_id={program.pk}" if program is not None else "")
    resp, exc = run(STAFF, "get", path, user)
    return exc or rows_of(resp)


def seat(user, payload):
    return run(STAFF, "post", BASE, user, payload)


def reaches(user, program):
    return programs_visible_to(user).filter(pk=program.pk).exists()


def seats_of(worker, program):
    return ProgramStaffMembership.objects.filter(user=worker, program=program)


def stages(user, program):
    resp, exc = run(STAGES, "get", f"/api/v1/accelerator/stages/?program_id={program.pk}",
                    user)
    return exc or [r["name"] for r in rows_of(resp)]


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]

    def make_user(who, kind="accelerator", **kw):
        return User.objects.create_user(
            email=f"team-{who}-{tag}@x.io", password="x", role=kind,
            first_name=who.title(), **kw)

    owner = make_user("owner")
    worker = make_user("worker")
    rival = make_user("rival")
    admin = make_user("admin", is_staff=True)
    founder = make_user("founder", kind="startup")
    dormant = make_user("dormant")
    dormant.is_active = False
    dormant.save(update_fields=["is_active"])

    prog = AcceleratorProgram.objects.create(
        name=f"Team Program {tag}", slug=f"team-{tag}",
        organization_name="Northstar", created_by=owner, is_public=False,
        sector_focus="fintech", stage_focus="seed",
    )
    away = AcceleratorProgram.objects.create(
        name=f"Team Rival {tag}", slug=f"team-away-{tag}",
        organization_name="Otherlab", created_by=rival, is_public=True,
        sector_focus="healthtech", stage_focus="series_a",
    )
    ProgramStage.objects.create(program=prog, name="Screening", order=1)

    # ── 1. Before a seat exists, the team is one person wide ────────────────
    ok("an unseated colleague reaches none of the program",
       not reaches(worker, prog) and not reaches(rival, prog))
    ok("...and reads none of its stages", stages(worker, prog) == [])
    ok("...and none of its roster", roster(worker, prog) == [])
    ok("the program's own account is the only one that owns it",
       list(programs_owned_by(owner)) == [prog]
       and list(programs_owned_by(rival)) == [away])

    # ── 2. A seat is handed out, never taken ───────────────────────────────
    resp, err = seat(rival, {"program_id": prog.pk, "user": worker.id,
                             "role": "reviewer"})
    ok("a rival account cannot seat anyone inside another program",
       isinstance(err, ValidationError) and resp is None)
    ok("...and the refusal wrote nothing", seats_of(worker, prog).count() == 0)
    resp, err = seat(worker, {"program_id": prog.pk, "user": worker.id,
                              "role": "director"})
    ok("an account cannot grant itself a seat", isinstance(err, ValidationError))
    ok("...so reach is not a claim", not reaches(worker, prog))
    resp, err = seat(founder, {"program_id": prog.pk, "user": founder.id,
                               "role": "reviewer"})
    ok("a founder is not seatable, not even by nobody's program",
       isinstance(err, ValidationError))
    ok("...because a seat is a read grant for the whole record layer",
       not seats_of(founder, prog).exists())

    resp, err = seat(owner, {"program_id": prog.pk, "user": worker.id,
                             "role": "committee"})
    committee = seats_of(worker, prog).first()
    ok("the program's own account seats a colleague", err is None and committee is not None)
    ok("the created row names the person and the role as stored",
       resp is not None and resp.data["user_email"] == worker.email
       and resp.data["role"] == "committee" and resp.data["role_label"] == "Selection Committee")
    ok("it reports when the seat was written",
       resp is not None and resp.data["member_since"] is not None)
    ok("...and invents nobody who wrote it",
       resp is not None and not ({"seated_by", "added_by", "created_by"} & set(resp.data)))

    # ── 3. What the seat is worth, and what it is not ───────────────────────
    ok("a seat is a reach grant", reaches(worker, prog))
    ok("...but never an ownership grant",
       not programs_owned_by(worker).filter(pk=prog.pk).exists())
    ok("a seated account is listed the program it works in",
       catalogue_programs(worker).filter(pk=prog.pk).exists())
    ok("the seated colleague reads the program's stages",
       stages(worker, prog) == ["Screening"])
    ok("...and the roster they now sit on",
       [r["user_email"] for r in roster(worker, prog)] == [worker.email])
    resp, err = run(STAGES, "post", "/api/v1/accelerator/stages/", worker,
                    {"program_id": prog.pk, "name": "Sneak In", "order": 9})
    ok("a seat does not configure the program",
       isinstance(err, ValidationError) and not ProgramStage.objects.filter(
           name="Sneak In").exists())
    resp, err = seat(worker, {"program_id": prog.pk, "user": rival.id,
                              "role": "mentor"})
    ok("a seat does not let the seated person seat others",
       isinstance(err, ValidationError) and not seats_of(rival, prog).exists())

    # ── 4. The refusals that keep the roster honest ─────────────────────────
    resp, err = seat(owner, {"program_id": prog.pk, "user": worker.id,
                             "role": "committee"})
    ok("the same person cannot hold the same seat twice",
       isinstance(err, ValidationError) and resp is None)
    ok("...and the refusal left one row, not two", seats_of(worker, prog).count() == 1)
    resp, err = seat(owner, {"program_id": prog.pk, "user": worker.id,
                             "role": "sponsor"})
    ok("a second role for the same person is a second seat",
       err is None and seats_of(worker, prog).count() == 2)
    resp, err = seat(owner, {"program_id": prog.pk, "user": admin.id, "role": "chief"})
    ok("a role the model does not carry is refused rather than stored",
       isinstance(err, ValidationError) and not seats_of(admin, prog).exists())
    resp, err = seat(owner, {"program_id": prog.pk, "user": dormant.id,
                             "role": "reviewer"})
    ok("a deactivated account is not seatable",
       isinstance(err, ValidationError)
       and not seats_of(dormant, prog).exists())
    resp, err = seat(owner, {"program_id": away.pk, "user": admin.id,
                             "role": "reviewer"})
    ok("one program's account cannot seat people inside another's",
       isinstance(err, ValidationError) and not seats_of(admin, away).exists())
    resp, err = seat(owner, {"user": admin.id, "role": "reviewer"})
    ok("a seat with no program is refused by name, not by a 500",
       isinstance(err, ValidationError) and "program_id" in str(err))

    # ── 5. The outbox carries the actor the row has no column for ───────────
    events = list(EventOutbox.objects.filter(program=prog,
                                             event_type="program_staff_seated"))
    ok("each seat granted is published once", len(events) == 2)
    ok("...and every one names the human who granted it",
       {e.actor_id for e in events} == {owner.id})
    ok("...with the person and the role it seated",
       {(e.payload.get("member_id"), e.payload.get("role")) for e in events}
       == {(worker.id, "committee"), (worker.id, "sponsor")})

    # ── 6. Revoking is a decision with two shapes ───────────────────────────
    ok("the roster reports both seats this person holds",
       sorted(r["role"] for r in roster(owner, prog)) == ["committee", "sponsor"])
    resp, err = run(STAFF, "patch", f"{BASE}{committee.pk}/", owner,
                    {"is_active": False}, pk=str(committee.pk))
    committee.refresh_from_db()
    ok("a seat can be deactivated without deleting the record",
       err is None and committee.is_active is False)
    sponsor_seat = seats_of(worker, prog).get(role="sponsor")
    ok("...while the person's other live seat still carries the reach, because "
       "grants are per-seat", reaches(worker, prog))
    run(STAFF, "patch", f"{BASE}{sponsor_seat.pk}/", owner,
        {"is_active": False}, pk=str(sponsor_seat.pk))
    ok("deactivating the last live seat ends it", not reaches(worker, prog))
    resp, err = run(STAFF, "patch", f"{BASE}{committee.pk}/", owner,
                    {"is_active": True}, pk=str(committee.pk))
    ok("re-activating a seat brings the reach back",
       reaches(worker, prog) and seats_of(worker, prog).filter(is_active=True).count() == 1)
    resp, err = run(STAFF, "patch", f"{BASE}{committee.pk}/", rival,
                    {"is_active": False}, pk=str(committee.pk))
    ok("a rival cannot even reach the row to revoke it",
       isinstance(err, (NotFound, ValidationError, Http404)))
    ok("...and the seat is still active",
       ProgramStaffMembership.objects.filter(pk=committee.pk, is_active=True).exists())

    sponsor = seats_of(worker, prog).get(role="sponsor")
    resp, err = run(STAFF, "delete", f"{BASE}{sponsor.pk}/", owner, pk=str(sponsor.pk))
    ok("the program's own account can remove a seat outright",
       err is None and not ProgramStaffMembership.objects.filter(pk=sponsor.pk).exists())
    ok("...and the removal names its actor in the outbox",
       EventOutbox.objects.filter(
           program=prog, event_type="program_staff_unseated", actor=owner,
           payload__membership_id=sponsor.pk).exists())
    ok("the surviving seat still carries the reach", reaches(worker, prog))
    resp, err = run(STAFF, "delete", f"{BASE}{committee.pk}/", worker,
                    pk=str(committee.pk))
    ok("a seated account cannot delete its own seat", isinstance(err, ValidationError))
    ok("...which is why the seat is still there",
       ProgramStaffMembership.objects.filter(pk=committee.pk).exists())

    # ── 7. The roster read is a tenant read ─────────────────────────────────
    ok("a rival reads none of another program's roster, scoped or not",
       roster(rival, prog) == [] and roster(rival) == [])
    ok("a founder reads none of it either", roster(founder, prog) == [])
    staff_rows = roster(admin)
    ok("platform staff read the roster whole",
       isinstance(staff_rows, list)
       and {(r["user_email"], r["role"]) for r in staff_rows}
       >= {(worker.email, "committee")})
    ok("...and every row they get is a seat the database holds",
       all(ProgramStaffMembership.objects.filter(pk=r["id"]).exists()
           for r in staff_rows))

    # ── 8. What the seat is worth to the account holding it ────────────────
    def context_of(user, program):
        inner = factory.post("/api/v1/accelerator/context/switch/",
                             {"program_id": program.pk}, format="json")
        force_authenticate(inner, user=user)
        return acc_views.SwitchContextView.as_view()(inner)

    owner_ctx = context_of(owner, prog).data["active_context"]
    ok("the account that made the program is told it may configure it",
       owner_ctx["can_configure_program"] is True)
    ok("...and that it holds no seat, because it holds the program",
       owner_ctx["program_roles"] == [])
    worker_ctx = context_of(worker, prog).data["active_context"]
    ok("the seated account may work the program but is told it may not configure it",
       worker_ctx["program_id"] == prog.pk
       and worker_ctx["can_configure_program"] is False)
    ok("...and is told which seat it holds, in the model's own words",
       [(r["code"], r["label"]) for r in worker_ctx["program_roles"]]
       == [("committee", "Selection Committee")])
    run(STAFF, "patch", f"{BASE}{committee.pk}/", owner,
        {"is_active": False}, pk=str(committee.pk))
    after = context_of(worker, prog)
    ok("with its last seat deactivated the account is refused the program it "
       "used to work, by name rather than as an empty context",
       after.status_code == 400 and "program_id" in after.data)
    run(STAFF, "patch", f"{BASE}{committee.pk}/", owner,
        {"is_active": True}, pk=str(committee.pk))
    ok("...and the seat coming back is the only thing that put it there",
       context_of(worker, prog).data["active_context"]["program_roles"]
       == [{"code": "committee", "label": "Selection Committee",
            "membership_id": committee.pk}])

    # ── 9. The role list is the model's, not the screen's ───────────────────
    resp, err = run(STAFF, "get", BASE + "role-options/", owner, action="role_options")
    choices = dict(ProgramStaffMembership._meta.get_field("role").choices)
    ok("the endpoint answers with the roles a seat may carry", err is None)
    ok("...which are exactly the model's choices, labels included",
       resp is not None and {r["value"]: r["label"] for r in rows_of(resp)} == choices)

    # ── 10. The named recovery path for a program nobody owns ──────────────
    # An unowned row is not "owned by the platform" — it is reachable only by
    # staff, which is a dead program for anyone who means to run it. The fix is
    # a command a human names, not a default that hands reach out silently.
    def claim(*argv, **kw):
        out = io.StringIO()
        try:
            call_command("claim_program", *argv, stdout=out, **kw)
        except CommandError as exc:
            return None, exc
        return out.getvalue(), None

    orphan = AcceleratorProgram.objects.create(
        name=f"Team Orphan {tag}", slug=f"team-orphan-{tag}",
        organization_name="Nowhere", created_by=None, is_public=True,
        sector_focus="climate", stage_focus="pre_seed",
    )
    ok("an unowned program is out of reach for an account that holds nothing in "
       "it, even through an open front door", not reaches(worker, orphan))
    ok("...and that nobody outside staff may configure it",
       may_configure_program(orphan, owner) is False
       and may_configure_program(orphan, worker) is False)
    ok("a staff account does reach it, which is the fallback and not an owner — "
       "the program still has nobody who means to run it",
       may_configure_program(orphan, admin) is True)

    text, err = claim("--list-unowned")
    ok("--list-unowned reports the orphan without claiming it",
       err is None and orphan.slug in text and not reaches(owner, orphan))
    text, err = claim(orphan.slug, "--to", owner.email, "--dry-run")
    ok("a dry run says what it would do and writes nothing",
       err is None and "dry run" in text and orphan.created_by_id is None)

    events_before = EventOutbox.objects.filter(event_type="program_claimed").count()
    text, err = claim(orphan.slug, "--to", owner.email)
    orphan.refresh_from_db()
    ok("the claim names an owner, and that account can now reach the program",
       err is None and orphan.created_by_id == owner.pk and reaches(owner, orphan)
       and may_configure_program(orphan, owner) is True)
    ok("...which is what lets it seat a team, the thing nothing could do before",
       seat(owner, {"program_id": orphan.pk, "user": worker.id,
                    "role": "reviewer"})[1] is None)
    claimed = EventOutbox.objects.filter(event_type="program_claimed", program=orphan)
    ok("the outbox records the claim with no actor, because a shell command has none",
       claimed.count() == 1 and claimed.first().actor_id is None)
    ok("...and a claim is the only new event the run wrote",
       EventOutbox.objects.filter(event_type="program_claimed").count()
       == events_before + 1)

    text, err = claim(orphan.slug, "--to", owner.email)
    ok("re-running the claim reports the fact and writes nothing",
       err is None and "already owned" in text
       and EventOutbox.objects.filter(event_type="program_claimed").count()
       == events_before + 1)
    text, err = claim(orphan.slug, "--to", worker.email)
    ok("an owned program cannot be re-claimed, so a typo cannot move a tenant",
       isinstance(err, CommandError) and "transfer" in str(err))
    orphan.refresh_from_db()
    ok("...and the refusal left the same owner on the row",
       orphan.created_by_id == owner.pk)
    text, err = claim(orphan.slug, "--to", founder.email)
    ok("a founder-side account cannot be handed a program, which would be the "
       "same read the seat rules refuse", isinstance(err, CommandError))
    text, err = claim(orphan.slug, "--to", dormant.email)
    ok("...and neither can a deactivated account, which cannot log in to run it",
       isinstance(err, CommandError) and "deactivated" in str(err))
    text, err = claim(f"no-such-{tag}", "--to", owner.email)
    ok("a program nothing carries is refused by name rather than writing to nil",
       isinstance(err, CommandError) and f"no-such-{tag}" in str(err))

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
