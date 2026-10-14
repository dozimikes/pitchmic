"""Rollback-only smoke: tenant scope of /accelerator/applications/.

Doctrine under test:
- A role says which side of the table you sit on; it does not say whose pipeline
  you are on. An accelerator account reaches the programs it created, the ones
  that staffed it and the ones that seated it on a review — and nothing else.
  ``is_public`` opens intake to *founders*; it never opens one team's pipeline
  to another team, so a published program's rows are invisible to a rival that
  holds no relationship to it.
- Staff is a wider gate, not a smaller one. Admins run the platform, so they see
  every row; ``programs_visible_to`` alone would not hand them that.
- One queryset, one answer. The list, the row, the aggregate counters and the
  write actions all read through ``get_queryset()``, so a foreign id is a 404
  everywhere rather than a 200 with an empty body in one place and a real change
  in another.
- A founder sees its own submissions. Another founder's row does not exist for
  them, and neither does it appear in a count.
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

from apps.accelerator import views as acc_views
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    FounderApplicationProfile,
    StartupApplicationProfile,
)
from apps.accelerator.models_os import ProgramStaffMembership
from apps.accelerator.permissions import programs_visible_to

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def call(cls, method, path, user, action, payload=None, **kwargs):
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


def list_rows(user, query=""):
    """GET /applications/ — the page of company names the caller can see."""
    vs, req = call(acc_views.AcceleratorApplicationViewSet, "get",
                   f"/api/v1/accelerator/applications/{query}", user, "list")
    data = vs.list(req).data
    rows = data["results"] if isinstance(data, dict) and "results" in data else data
    return {r["company_name"] for r in rows}, data


def retrieve(user, pk):
    vs, req = call(acc_views.AcceleratorApplicationViewSet, "get",
                   f"/api/v1/accelerator/applications/{pk}/", user, "retrieve", pk=str(pk))
    try:
        return vs.retrieve(req, pk=str(pk)), None
    except Http404 as exc:
        return None, exc


def total_count(user, query=""):
    vs, req = call(acc_views.AcceleratorApplicationViewSet, "get",
                   f"/api/v1/accelerator/applications/screening-summary/{query}", user,
                   "screening_summary")
    return vs.screening_summary(req).data["total"]


def transition(user, pk, to_status, payload_user_role=None):
    vs, req = call(acc_views.AcceleratorApplicationViewSet, "post",
                   f"/api/v1/accelerator/applications/{pk}/transition-status/", user,
                   "transition_status", {"status": to_status}, pk=str(pk))
    try:
        return vs.transition_status(req, pk=str(pk)), None
    except (Http404, PermissionDenied, ValidationError) as exc:
        return None, exc


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    mine = User.objects.create_user(email=f"ts-mine-{tag}@x.io", password="x", role="accelerator",
                                    first_name="Mira", last_name="Owner")
    rival = User.objects.create_user(email=f"ts-rival-{tag}@x.io", password="x", role="accelerator",
                                     first_name="Rex", last_name="Rival")
    investor = User.objects.create_user(email=f"ts-inv-{tag}@x.io", password="x", role="investor")
    admin = User.objects.create_user(email=f"ts-admin-{tag}@x.io", password="x", role="admin",
                                     is_staff=True, is_superuser=True)
    founder_a = User.objects.create_user(email=f"ts-fa-{tag}@x.io", password="x", role="startup")
    founder_b = User.objects.create_user(email=f"ts-fb-{tag}@x.io", password="x", role="startup")

    own_prog = AcceleratorProgram.objects.create(
        name=f"Scope Own {tag}", slug=f"scope-own-{tag}", created_by=mine, is_public=False,
    )
    rival_prog = AcceleratorProgram.objects.create(
        name=f"Scope Rival {tag}", slug=f"scope-rival-{tag}", created_by=rival, is_public=False,
    )
    # Somebody else's program, published for intake. `mine` is on its staff — the
    # grant that reaches a second person. The point of the fixture is that the
    # reach comes from the membership and not from `is_public`: a published
    # program is open to founders, which does not make it every accelerator's.
    outsider = User.objects.create_user(email=f"ts-out-{tag}@x.io", password="x",
                                        role="accelerator", first_name="Ivo")
    staff_prog = AcceleratorProgram.objects.create(
        name=f"Scope Staffed {tag}", slug=f"scope-staffed-{tag}",
        created_by=outsider, is_public=True,
    )
    ProgramStaffMembership.objects.create(user=mine, program=staff_prog, role="manager")

    def make_app(company, program, submitter):
        person = User.objects.create_user(
            email=f"ts-{company.lower()}-{tag}@x.io", password="x", role="startup",
        )
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=person, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", sector_tags="fintech", geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=program, startup_profile=sp, submitted_by=submitter, status="SCREENING",
        )

    mine_a = make_app("MineAlpha", own_prog, founder_a)
    mine_b = make_app("MineBeta", own_prog, founder_b)
    theirs = make_app("TheirCo", rival_prog, founder_a)
    staffed = make_app("StaffedCo", staff_prog, founder_a)

    # ── 1. The list answers with the caller's tenants only ───────────────────
    seen, _ = list_rows(mine)
    ok("an accelerator sees its own program's rows", {"MineAlpha", "MineBeta"} <= seen)
    ok("a staff membership reaches the program that granted it", "StaffedCo" in seen)
    ok("another accelerator's private pipeline is not in the list", "TheirCo" not in seen)
    seen_rival, _ = list_rows(rival)
    ok("the boundary is symmetric: the rival does not see mine either",
       seen_rival == {"TheirCo"})
    ok("...and publishing a program does not put its rows on a rival's desk",
       "StaffedCo" not in seen_rival)
    ok("the rival's list is not empty, so the filter is a scope and not a wall",
       len(seen_rival) == 1)

    # ── 2. The row itself, not just the page ─────────────────────────────────
    resp, err = retrieve(mine, theirs.pk)
    ok("a foreign application is a 404, not a stripped 200", isinstance(err, Http404))
    resp_own, err_own = retrieve(mine, mine_a.pk)
    ok("the caller's own row still resolves", err_own is None and resp_own is not None)
    ok("the row that resolves is the one that was asked for",
       resp_own is not None and resp_own.data["company_name"] == "MineAlpha")

    # ── 3. Counts come from the same queryset ───────────────────────────────
    ok("the aggregate total excludes the foreign row", total_count(mine) == 3)
    ok("and a program filter cannot be used to reach it",
       total_count(mine, f"?program_id={rival_prog.id}") == 0)
    ok("the same filter keeps the caller's own program intact",
       total_count(mine, f"?program_id={own_prog.id}") == 2)
    ok("staff counts every row, including the rival's", total_count(admin) == 4)

    # ── 4. Writes are held to the same line ─────────────────────────────────
    resp, err = transition(mine, theirs.pk, "SHORTLISTED")
    ok("an accelerator cannot move another tenant's application", isinstance(err, Http404))
    theirs.refresh_from_db()
    ok("and the refusal left the row where it was", theirs.status == "SCREENING")
    resp, err = transition(mine, mine_a.pk, "SHORTLISTED")
    ok("the same call on its own row is not refused by scope",
       not isinstance(err, (Http404, PermissionDenied)))
    ok("an investor cannot transition status at all",
       isinstance(transition(investor, mine_a.pk, "REJECTED")[1], PermissionDenied))

    # ── 5. The two staff-side shapes are different, on purpose ──────────────
    seen_inv, _ = list_rows(investor)
    ok("an investor with no relationship to a program sees none of its rows",
       seen_inv == set())
    ProgramStaffMembership.objects.create(user=investor, program=staff_prog,
                                          role="sponsor")
    ok("...and the membership is what changes that, not the program's publicity",
       set(list_rows(investor)[0]) == {"StaffedCo"})
    seen_admin, _ = list_rows(admin)
    ok("staff is the wider gate: every program in the database",
       seen_admin == {"MineAlpha", "MineBeta", "TheirCo", "StaffedCo"})
    ok("programs_visible_to alone would have blinded that account to all of them",
       not programs_visible_to(admin).filter(pk__in=[own_prog.pk, rival_prog.pk]).exists())

    # ── 6. Founders are isolated from each other ────────────────────────────
    seen_fa, _ = list_rows(founder_a)
    ok("a founder sees the applications it submitted",
       seen_fa == {"MineAlpha", "TheirCo", "StaffedCo"})
    seen_fb, _ = list_rows(founder_b)
    ok("and not another founder's row in the same program", seen_fb == {"MineBeta"})
    ok("a founder's aggregate counts only its own rows", total_count(founder_b) == 1)
    _, fb_err = retrieve(founder_b, mine_a.pk)
    ok("a founder cannot retrieve a row it did not submit", isinstance(fb_err, Http404))

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
