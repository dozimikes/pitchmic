"""Rollback-only smoke: tenant scope of the Program OS configuration layer.

Doctrine under test:
- A role says which side of the table you sit on; it does not say whose pipeline
  you are on. `ReadOnlyOrAccelerator` answers a GET with True for *any*
  authenticated account, so before this rule the config tables — stages, forms,
  roles, templates, reports, records, answers — were one `?program_id=` away
  from being any team's.
- Reads and writes are two different questions. `_by_program` confines the rows
  you can *see*; a POST body names its program itself, and a serializer's
  PrimaryKeyRelatedField resolves that id against the model's manager, not the
  viewset's queryset. `TenantScopedWriteMixin` is the answer to the body.
- Changing how a program judges founders takes owning it. `is_public` is an
  intake switch — it is what lets a founder read the application form and apply —
  so it is neither an edit licence nor a read licence for somebody else's team: a
  rival reads none of a published program's stages and files nothing inside it.
  Recording work *inside* a program does take the wider rule — creator, staff
  membership or a review seat — because the person doing the work is usually not
  the person who created the program.
- A program-less row is nobody's tenant, so reading it is not a leak; writing or
  deleting one is a platform act, and a platform account is the only one that
  may.
- Refusing quietly is not enough: the negative controls below assert the row was
  *not* created, and the out-of-scope form answers exactly as a missing one, so
  the endpoint never enumerates another team's questions.
"""
import os
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import Http404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import views_config as cfg
from apps.accelerator import views_intel as intel
from apps.accelerator.models import AcceleratorApplication, AcceleratorProgram
from apps.accelerator.models_config import (
    CustomObject,
    CustomRecord,
    DashboardReport,
    FormDefinition,
    FormResponse,
    Notification,
    NotificationTemplate,
    ProgramRole,
    ProgramStage,
)
from apps.accelerator.models_os import (
    AcceleratorOrganization,
    ProgramBlueprint,
    ProgramStaffMembership,
)
from apps.accelerator.permissions import programs_owned_by, programs_visible_to

User = get_user_model()
factory = APIRequestFactory()
checks = []


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


def run(cls, method, user, path, payload=None, action=None, **kwargs):
    """Call a viewset action directly and hand back (response, exception).

    Direct calls skip `initial()`, so the permission class is not consulted —
    what is under test here is the tenant rules in `get_queryset` and
    `perform_create`, which run either way. `method` is the HTTP verb the fake
    request carries; `action` is the viewset method, defaulting to the verb's
    own router action.
    """
    action = action or {
        "get": "list", "post": "create", "patch": "partial_update",
        "delete": "destroy",
    }[method]
    vs, req = _request(cls, method, path, user, action, payload, **kwargs)
    fn = {
        "list": vs.list,
        "retrieve": vs.retrieve,
        "create": vs.create,
        "update": vs.update,
        "partial_update": vs.partial_update,
        "destroy": vs.destroy,
    }[action]
    try:
        return fn(req, **kwargs), None
    except (Http404, ValidationError, PermissionDenied) as exc:
        return None, exc


def rows(cls, user, query=""):
    resp, exc = run(cls, "get", user, f"/api/v1/accelerator/{query}")
    if exc is not None:
        return None, exc
    data = resp.data
    items = data["results"] if isinstance(data, dict) and "results" in data else data
    return {r["name"] for r in items}, None


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    owner = User.objects.create_user(email=f"ts-owner-{tag}@x.io", password="x",
                                     role="accelerator", first_name="Mira")
    rival = User.objects.create_user(email=f"ts-rival-{tag}@x.io", password="x",
                                     role="accelerator", first_name="Rex")
    member = User.objects.create_user(email=f"ts-member-{tag}@x.io", password="x",
                                     role="accelerator", first_name="Nia")
    admin = User.objects.create_user(email=f"ts-admin-{tag}@x.io", password="x",
                                     role="admin", is_staff=True, is_superuser=True)
    founder = User.objects.create_user(email=f"ts-founder-{tag}@x.io", password="x",
                                       role="startup", first_name="Fo")

    org = AcceleratorOrganization.objects.create(name=f"Org {tag}", slug=f"org-{tag}")

    def make_program(label, **kw):
        kw.setdefault("is_public", False)
        return AcceleratorProgram.objects.create(
            name=f"CfgScope {label} {tag}", slug=f"cfg-{label}-{tag}",
            organization_name="Pitchmic", organization=org, **kw
        )

    own = make_program("own", created_by=owner)
    away = make_program("away", created_by=rival)
    # `is_public` defaults True: published for intake. That opens the program's
    # door to *founders* — they read its form and apply — and hands a rival team
    # nothing. `member` is on its staff, which is the grant that does reach a
    # second person, and reaches them as a worker rather than an owner.
    published = make_program("published", created_by=rival, is_public=True)
    ProgramStaffMembership.objects.create(user=member, program=published,
                                          role="manager")

    def make_stage(program, label):
        return ProgramStage.objects.create(
            program=program, name=f"Stage {label} {tag}", slug=f"stage-{label}-{tag}",
        )

    s_own, s_away, s_pub = (make_stage(p, l) for p, l in
                            ((own, "own"), (away, "away"), (published, "pub")))
    r_own = ProgramRole.objects.create(name=f"Reviewer {tag}", slug=f"reviewer-{tag}",
                                       program=own)
    r_global = ProgramRole.objects.create(name=f"Global {tag}", slug=f"global-{tag}",
                                          program=None)
    t_away = NotificationTemplate.objects.create(
        program=away, key=f"tpl-{tag}", name=f"Rival template {tag}",
        subject="s", body="b")
    co_away = CustomObject.objects.create(program=away, name=f"Rival object {tag}",
                                          slug=f"rival-object-{tag}")
    co_pub = CustomObject.objects.create(program=published, name=f"Pub object {tag}",
                                         slug=f"pub-object-{tag}")
    f_away = FormDefinition.objects.create(program=away, name=f"Rival form {tag}")
    f_pub = FormDefinition.objects.create(program=published, name=f"Pub form {tag}")

    # ── 1. Reads: the tenant filter, not the caller's query string ───────────
    # The dev database has its own seeded programs, so each assertion names the
    # fixture it is about rather than demanding an exact page.
    seen, _ = rows(cfg.ProgramStageViewSet, owner, "program-stages/")
    ok("an accelerator lists its own program's stages", s_own.name in seen)
    ok("and not another team's stage", s_away.name not in seen)
    ok("a published program's stages are not another team's reading matter",
       s_pub.name not in seen)
    ok("...and the account that staffed it on reads them, which is the "
       "membership's doing and not the program's publicity",
       s_pub.name in rows(cfg.ProgramStageViewSet, member, "program-stages/")[0])
    seen_r, _ = rows(cfg.ProgramStageViewSet, rival, "program-stages/")
    ok("the boundary is symmetric",
       {s_away.name, s_pub.name} <= seen_r and s_own.name not in seen_r)

    # The original leak: `?program_id=` was the only filter, so naming a foreign
    # program *added* its rows to a listing that should have been empty.
    forced, _ = rows(cfg.ProgramStageViewSet, owner,
                     f"program-stages/?program_id={away.pk}")
    ok("a query parameter cannot reach another program's rows", forced == set())
    forced_r, _ = rows(cfg.ProgramStageViewSet, rival,
                       f"program-stages/?program_id={own.pk}")
    ok("...in either direction", forced_r == set())

    roles, _ = rows(cfg.ProgramRoleViewSet, owner, "program-roles/")
    ok("a program-less role survives the read filter (nothing to leak)",
       r_global.name in roles and r_own.name in roles)
    ok("...and so does a rival's, because its program is not in the listing",
       all("Rival" not in n for n in roles))

    tmpl, _ = rows(cfg.NotificationTemplateViewSet, owner, "notification-templates/")
    ok("a rival's notification template is not in the listing", t_away.name not in tmpl)
    ok("...but the account that made it still sees it",
       t_away.name in rows(cfg.NotificationTemplateViewSet, rival,
                           "notification-templates/")[0])

    seen_admin, _ = rows(cfg.ProgramStageViewSet, admin, "program-stages/")
    ok("staff is the wider gate: every program's stages",
       {s_own.name, s_away.name, s_pub.name} <= seen_admin)
    ok("programs_visible_to alone would have blinded that account",
       not programs_visible_to(admin).filter(pk=own.pk).exists()
       and not programs_owned_by(admin).exists())

    # ── 2. Writes: the body cannot name a program the account doesn't own ───
    before = ProgramStage.objects.count()
    resp, exc = run(cfg.ProgramStageViewSet, "post", owner, "program-stages/", {
        "program_id": away.pk, "name": f"Inserted {tag}", "slug": f"ins-{tag}"})
    ok("a stage cannot be created inside another team's program",
       isinstance(exc, ValidationError))
    ok("...and nothing was written on the refusal",
       ProgramStage.objects.count() == before
       and not ProgramStage.objects.filter(name=f"Inserted {tag}").exists())
    ok("the refusal names the field that carried the tenant",
       isinstance(exc, ValidationError) and "program_id" in exc.detail)

    resp, exc = run(cfg.ProgramStageViewSet, "post", member, "program-stages/", {
        "program_id": published.pk, "name": f"Vandal {tag}", "slug": f"vandal-{tag}"})
    ok("a staffed member does not hold the pen: the stage graph is the "
       "creator's to rewrite",
       isinstance(exc, ValidationError)
       and not ProgramStage.objects.filter(name=f"Vandal {tag}").exists())
    ok("...even though that account reads those very rows",
       s_pub.name in rows(cfg.ProgramStageViewSet, member, "program-stages/")[0])

    resp, exc = run(cfg.ProgramStageViewSet, "post", owner, "program-stages/", {
        "program_id": own.pk, "name": f"Added {tag}", "slug": f"added-{tag}"})
    created = ProgramStage.objects.filter(name=f"Added {tag}").first()
    ok("the owning account still configures its own program",
       exc is None and resp is not None and resp.status_code == 201
       and created is not None)

    resp, exc = run(cfg.ProgramStageViewSet, "post", admin, "program-stages/", {
        "program_id": away.pk, "name": f"Admin {tag}", "slug": f"admin-{tag}"})
    ok("staff may configure any program",
       exc is None and ProgramStage.objects.filter(name=f"Admin {tag}").exists())

    # A PATCH that re-points a row at a foreign program is the same act.
    resp, exc = run(cfg.ProgramStageViewSet, "patch", owner,
                    f"program-stages/{s_own.pk}/", {"program_id": away.pk},
                    pk=s_own.pk)
    s_own.refresh_from_db()
    ok("a stage cannot be moved into another program",
       isinstance(exc, ValidationError) and s_own.program_id == own.pk)

    # Editing a rival's row by its primary key never reaches it in the first place.
    resp, exc = run(cfg.ProgramStageViewSet, "patch", owner,
                    f"program-stages/{s_away.pk}/", {"name": "Renamed"}, pk=s_away.pk)
    s_away.refresh_from_db()
    ok("a rival's stage is a 404 to PATCH, not a rename",
       isinstance(exc, Http404) and s_away.name != "Renamed"
       and s_away.name == f"Stage away {tag}")

    # ── 3. Program-less rows are a platform act to write or delete ──────────
    resp, exc = run(cfg.ProgramRoleViewSet, "post", owner, "program-roles/", {
        "name": f"Platform role {tag}", "slug": f"platform-{tag}"})
    ok("an accelerator cannot mint an organization-wide role",
       isinstance(exc, ValidationError)
       and not ProgramRole.objects.filter(name=f"Platform role {tag}").exists())
    resp, exc = run(cfg.ProgramRoleViewSet, "delete", owner,
                    f"program-roles/{r_global.pk}/", action="destroy", pk=r_global.pk)
    ok("...nor delete one, even though reading it is harmless",
       isinstance(exc, ValidationError) and ProgramRole.objects.filter(pk=r_global.pk).exists())
    resp, exc = run(cfg.ProgramRoleViewSet, "patch", owner,
                    f"program-roles/{r_global.pk}/", {"name": "Hijacked"},
                    pk=r_global.pk)
    r_global.refresh_from_db()
    ok("...nor edit one", isinstance(exc, ValidationError) and r_global.name != "Hijacked")

    # Editing one's own program-scoped role without repeating the program works:
    # the instance's own program is the one already vetted.
    resp, exc = run(cfg.ProgramRoleViewSet, "patch", owner,
                    f"program-roles/{r_own.pk}/", {"description": "triage only"},
                    pk=r_own.pk)
    r_own.refresh_from_db()
    ok("a PATCH that omits the program keeps the vetted one",
       exc is None and r_own.description == "triage only")
    resp, exc = run(cfg.ProgramRoleViewSet, "patch", owner,
                    f"program-roles/{r_own.pk}/", {"program_id": None}, pk=r_own.pk)
    r_own.refresh_from_db()
    ok("...but an explicit null is still a platform claim",
       isinstance(exc, ValidationError) and r_own.program_id == own.pk)

    # ── 4. Activity tables take the wider rule ─────────────────────────────
    resp, exc = run(cfg.NotificationViewSet, "post", member, "program-notifications/", {
        "program": published.pk, "subject": "Hi", "body": "There",
        "recipient": founder.pk})
    ok("an account the program staffed can notify about it",
       exc is None and Notification.objects.filter(subject="Hi").exists())

    resp, exc = run(cfg.NotificationViewSet, "post", owner, "program-notifications/", {
        "program": published.pk, "subject": "Pile-on", "body": "No"})
    ok("...while an account that merely sees it published cannot",
       isinstance(exc, ValidationError)
       and not Notification.objects.filter(subject="Pile-on").exists())

    resp, exc = run(cfg.NotificationViewSet, "post", member, "program-notifications/", {
        "program": away.pk, "subject": "Snoop", "body": "No"})
    ok("...and not into a private one either",
       isinstance(exc, ValidationError)
       and not Notification.objects.filter(subject="Snoop").exists())

    resp, exc = run(cfg.CustomRecordViewSet, "post", member, "custom-records/", {
        "custom_object": co_pub.pk, "data": {"note": "seen in review"}})
    ok("a record inside a program the account staffs is allowed",
       exc is None)
    resp, exc = run(cfg.CustomRecordViewSet, "post", member, "custom-records/", {
        "custom_object": co_away.pk, "data": {"note": "x"}})
    ok("...and its program is checked through the object, not the id sent",
       isinstance(exc, ValidationError)
       and not CustomRecord.objects.filter(custom_object=co_away).exists())

    resp, exc = run(cfg.CustomRecordViewSet, "post", owner, "custom-records/", {
        "custom_object": co_away.pk, "data": {}})
    ok("the owner of a different program cannot file into a rival's object either",
       isinstance(exc, ValidationError))

    # ── 5. Form answers: the read rule, and an unknown form stays unknown ──
    resp, exc = run(cfg.FormResponseViewSet, "post", member, "form-responses/", {
        "form": f_pub.pk, "answers": {}})
    ok("an answer to a form in a program the account staffs is allowed", exc is None)

    def submit(user, form_id, application_id=None):
        vs, req = _request(cfg.FormResponseViewSet, "post",
                           f"/api/v1/accelerator/form-responses/submit/", user,
                           "submit")
        body = {"form": form_id, "answers": {}}
        if application_id is not None:
            body["application"] = application_id
        req = Request(factory.post("/api/v1/accelerator/form-responses/submit/",
                                   body, format="json"), parsers=[JSONParser()])
        req.user = user
        vs.request = req
        return vs.submit(req)

    ghost = submit(owner, 999999)
    away_form = submit(owner, f_away.pk)
    ok("a form in a program you do not work in answers exactly like a missing one",
       away_form.status_code == ghost.status_code == 404
       and away_form.data == ghost.data)
    ok("...and no response row was written for it",
       not FormResponse.objects.filter(form=f_away).exists())
    bogus = submit(owner, "not-a-number")
    ok("a non-numeric form id is a 404, not a 500", bogus.status_code == 404)

    good = submit(owner, f_own_id := FormDefinition.objects.create(
        program=own, name=f"Own form {tag}").pk)
    ok("the owning account can still submit its own form",
       good.status_code == 200 and FormResponse.objects.filter(form__name=f"Own form {tag}").exists())

    # An application id in the body must be the caller's to attach answers to.
    from apps.accelerator.models import FounderApplicationProfile, StartupApplicationProfile
    person = User.objects.create_user(email=f"ts-sub-{tag}@x.io", password="x", role="startup")
    sp = StartupApplicationProfile.objects.create(
        founder_profile=FounderApplicationProfile.objects.create(user=person, full_name="Sub"),
        company_name=f"SubCo {tag}", declared_stage="seed", sector_tags="fintech", geography="NG")
    rival_app = AcceleratorApplication.objects.create(
        program=away, startup_profile=sp, submitted_by=person, status="SUBMITTED")
    own_app = AcceleratorApplication.objects.create(
        program=own, startup_profile=sp, submitted_by=person, status="SUBMITTED")
    wrong = submit(owner, f_own_id, application_id=rival_app.pk)
    ok("answers cannot be filed under another program's application",
       wrong.status_code == 400
       and not FormResponse.objects.filter(application=rival_app).exists())
    right = submit(owner, f_own_id, application_id=own_app.pk)
    ok("...and a real one still attaches",
       right.status_code == 200
       and FormResponse.objects.filter(application=own_app).exists())

    # ── 6. Blueprints: a whole methodology in a JSON column ─────────────────
    draft_bp = ProgramBlueprint.objects.create(
        name=f"Rival draft {tag}", organization=org, source_program=away,
        created_by=rival, workflow_snapshot={"stages": [{"name": "secret spine"}]})
    public_bp = ProgramBlueprint.objects.create(
        name=f"Shared {tag}", organization=org, source_program=None,
        created_by=rival, is_published=True)
    my_bp = ProgramBlueprint.objects.create(
        name=f"My draft {tag}", organization=org, source_program=own, created_by=owner)
    seen_bp, _ = rows(intel.ProgramBlueprintViewSet, owner, "program-blueprints/")
    ok("a rival's draft blueprint is not readable", draft_bp.name not in seen_bp)
    ok("a published blueprint is, because publishing means offered for cloning",
       public_bp.name in seen_bp)
    ok("...and one's own draft stays visible", my_bp.name in seen_bp)
    resp, exc = run(intel.ProgramBlueprintViewSet, "get", owner,
                    f"program-blueprints/{draft_bp.pk}/", action="retrieve",
                    pk=draft_bp.pk)
    ok("retrieving a rival's blueprint by id is a 404, not a snapshot download",
       isinstance(exc, Http404))

    vs, req = _request(intel.ProgramBlueprintViewSet, "post",
                       "/api/v1/accelerator/program-blueprints/save_from_program/",
                       rival, "save_from_program")
    req = Request(factory.post("/api/v1/accelerator/program-blueprints/save_from_program/",
                               {"program_id": own.pk, "name": f"Stolen {tag}"},
                               format="json"), parsers=[JSONParser()])
    req.user = member
    vs.request = req
    vs.action = "save_from_program"
    resp = vs.save_from_program(req)
    ok("snapshotting a program you do not own answers as unknown",
       resp.status_code == 404
       and not ProgramBlueprint.objects.filter(name=f"Stolen {tag}").exists())
    req2 = Request(factory.post("/api/v1/accelerator/program-blueprints/save_from_program/",
                                {"program_id": own.pk, "name": f"Mine {tag}",
                                 "organization_id": org.pk},
                                format="json"), parsers=[JSONParser()])
    req2.user = owner
    vs.request = req2
    resp = vs.save_from_program(req2)
    ok("the owning account snapshots its own program",
       resp.status_code == 201 and ProgramBlueprint.objects.filter(name=f"Mine {tag}").exists())
    req3 = Request(factory.post("/api/v1/accelerator/program-blueprints/save_from_program/",
                                {"program_id": own.pk, "name": f"Elsewhere {tag}",
                                 "organization_id": AcceleratorOrganization.objects.create(
                                     name=f"Other org {tag}", slug=f"other-{tag}").pk},
                                format="json"), parsers=[JSONParser()])
    req3.user = owner
    vs.request = req3
    resp = vs.save_from_program(req3)
    ok("...but cannot file the copy on another organization's shelf",
       resp.status_code == 400
       and not ProgramBlueprint.objects.filter(name=f"Elsewhere {tag}").exists())

    # ── 7. Memory compare: an unseen program stays unnamed ─────────────────
    vs, req = _request(intel.ProgramMemoryEntryViewSet, "get",
                       f"/api/v1/accelerator/program-memory/compare/?program_id={away.pk}",
                       owner, "compare")
    req = Request(factory.get(f"/api/v1/accelerator/program-memory/compare/?program_id={away.pk}"),
                  parsers=[JSONParser()])
    req.user = owner
    vs.request = req
    vs.action = "compare"
    resp = vs.compare(req)
    ok("memory compare of a program outside the tenant is a 404",
       resp.status_code == 404)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
