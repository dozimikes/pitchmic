"""Rollback-only smoke: the read-only evaluation-policy endpoint.

Doctrine under test:
- A policy version is a record of how past decisions were made, not a setting to
  tweak. The endpoint exposes it read-only; a scorecard anchored to "v1.2" stops
  meaning anything if the API could quietly rewrite v1.2's weights.
- Scope is the programs the account may work in — never "every program" because a
  query parameter was left out. A policy names the weights another accelerator
  judged founders by.
- Field names are the model's own. A consumer that guesses `version_label` or
  `weights` reads undefined and renders zero, so this pins the real names.
- A program with no policy gets an empty list, not a fabricated default policy.
"""
import os
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator.models import AcceleratorProgram
from apps.accelerator.models_os import ProgramStaffMembership
from apps.accelerator.permissions import IsAcceleratorOrStaff
from apps.accelerator.program_policy import ProgramEvaluationPolicy
from apps.accelerator.serializers_config import ProgramEvaluationPolicySerializer
from apps.accelerator.views_config import ProgramEvaluationPolicyViewSet

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def make_request(method, path, user=None, query=""):
    inner = getattr(factory, method)(f"{path}{query}")
    req = Request(inner, parsers=[JSONParser()])
    if user is not None:
        req.user = user
    return req


def policy_list(user, query=""):
    req = make_request("get", "/api/v1/accelerator/policies/", user=user, query=query)
    vs = ProgramEvaluationPolicyViewSet()
    vs.request = req
    vs.action = "list"
    vs.kwargs = {}
    vs.format_kwarg = None
    try:
        resp = vs.list(req)
        return resp.data["results"] if isinstance(resp.data, dict) and "results" in resp.data else resp.data
    except PermissionDenied as exc:
        return exc


def make_policy(program, version, *, active=False, created_by=None, dims=None):
    return ProgramEvaluationPolicy.objects.create(
        program=program,
        version=version,
        is_active=active,
        created_by=created_by,
        scoring_dimensions=dims
        if dims is not None
        else [
            {"name": "founder_quality", "label": "Founder Quality", "weight": 0.5},
            {"name": "traction", "label": "Traction", "weight": 0.5},
        ],
    )


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    owner = User.objects.create_user(email=f"pol-owner-{tag}@x.io", password="x", role="accelerator")
    stranger = User.objects.create_user(email=f"pol-stranger-{tag}@x.io", password="x", role="accelerator")
    founder = User.objects.create_user(email=f"pol-founder-{tag}@x.io", password="x", role="startup")

    mine = AcceleratorProgram.objects.create(name=f"Policy Mine {tag}", slug=f"pol-mine-{tag}", created_by=owner)
    # is_public defaults to True, so a private program has to say so explicitly —
    # otherwise this check proves nothing about scoping.
    theirs = AcceleratorProgram.objects.create(
        name=f"Policy Theirs {tag}", slug=f"pol-theirs-{tag}", created_by=stranger, is_public=False
    )
    public = AcceleratorProgram.objects.create(
        name=f"Policy Public {tag}", slug=f"pol-public-{tag}", created_by=stranger, is_public=True
    )
    # A published program is on the marketplace, which is not the same thing as
    # being another team's methodology library. `owner` reads its policy because
    # the program put them on its staff, so the reach here is a relationship the
    # server wrote rather than a switch a stranger flipped.
    ProgramStaffMembership.objects.create(user=owner, program=public, role="reviewer")
    no_policy = AcceleratorProgram.objects.create(name=f"Policy None {tag}", slug=f"pol-none-{tag}", created_by=owner)

    # ── 1. It is read-only ───────────────────────────────────────────────────
    ok("the policy endpoint offers no write verbs",
       not any(hasattr(ProgramEvaluationPolicyViewSet, m)
               for m in ("create", "update", "partial_update", "destroy")))
    writable = [f for f, rf in ProgramEvaluationPolicySerializer().get_fields().items() if not rf.read_only]
    ok("no policy field is writable through the API", writable == [])
    # A direct viewset call skips DRF's initial(), so ask the gate the question.
    ok("the endpoint is staff-only", ProgramEvaluationPolicyViewSet.permission_classes == [IsAcceleratorOrStaff])
    ok("a founder fails that gate",
       IsAcceleratorOrStaff().has_permission(make_request("get", "/", user=founder), None) is False)
    ok("program staff pass it",
       IsAcceleratorOrStaff().has_permission(make_request("get", "/", user=owner), None) is True)

    # ── 2. Field names are the model's own ───────────────────────────────────
    fields = set(ProgramEvaluationPolicySerializer().get_fields())
    ok("the version the Decision Ledger anchors to is named `version`", "version" in fields)
    ok("weights ride in `scoring_dimensions`", "scoring_dimensions" in fields)
    ok("`is_active`, reviewer minimum and rounds are exposed",
       {"is_active", "min_reviewers_per_application", "review_rounds"} <= fields)
    ok("no invented aliases are exposed", not ({"version_label", "weights", "dimensions"} & fields))

    # ── 3. Scope: my programs, not every program ─────────────────────────────
    make_policy(mine, "v1.0", active=True, created_by=owner)
    make_policy(theirs, "v9.9", active=True, created_by=stranger)
    make_policy(public, "pub-1", active=True, created_by=stranger)

    versions = {r["version"] for r in policy_list(owner)}
    ok("an unscoped list holds my own program's policy", "v1.0" in versions)
    ok("an unscoped list holds the policy of a program the account staffs",
       "pub-1" in versions)
    ok("another accelerator's private policy is not in my list", "v9.9" not in versions)
    # A team with no relationship to the published program at all: no seat, no
    # membership, nothing it created. Publicity is the only link, and it is not a
    # licence to read how another program scores founders.
    passerby = User.objects.create_user(email=f"pol-nosy-{tag}@x.io", password="x",
                                        role="accelerator")
    ok("...and publicity on its own is not a licence to read a rival's methodology",
       policy_list(passerby) == []
       and policy_list(passerby, f"?program_id={public.id}") == [])
    ok("an unscoped list is not every program's policy",
       ProgramEvaluationPolicy.objects.count() == 3 and len(versions) == 2)
    scoped = policy_list(owner, f"?program_id={mine.id}")
    ok("a scoped list holds only that program", [r["program"] for r in scoped] == [mine.id])
    ok("a scope I do not hold returns nothing, not an error",
       policy_list(owner, f"?program_id={theirs.id}") == [])

    # ── 4. Missing is not zero ───────────────────────────────────────────────
    empty = policy_list(owner, f"?program_id={no_policy.id}")
    ok("a program with no policy is an empty list", empty == [])
    ok("the empty case invents no default version", not any(r.get("version") for r in empty))

    # ── 5. What is stored is trustworthy ────────────────────────────────────
    rows = policy_list(owner, f"?program_id={mine.id}")
    row = rows[0]
    ok("weights arrive exactly as stored",
       [d["weight"] for d in row["scoring_dimensions"]] == [0.5, 0.5])
    ok("the reviewer minimum is the model default, not a client number",
       row["min_reviewers_per_application"] == 2)
    ok("the author is named so a policy has a source",
       row["created_by_email"] == f"pol-owner-{tag}@x.io")
    make_policy(mine, "v1.1")  # created_by left unset on purpose
    ok("a policy nobody signed reports no author instead of a guess",
       [r for r in policy_list(owner, f"?program_id={mine.id}") if r["version"] == "v1.1"][0]["created_by_email"] is None)

    bad = ProgramEvaluationPolicy(
        program=mine, version="bad-weights",
        scoring_dimensions=[{"name": "market", "label": "Market", "weight": 0.2}],
    )
    try:
        bad.clean()
        cleaned = None
    except DjangoValidationError as exc:
        cleaned = exc
    ok("weights that do not sum to 1.0 cannot be stored", cleaned is not None)

    # ── 6. One active version, and the list says which ───────────────────────
    older = make_policy(mine, "v0.9")
    newer = make_policy(mine, "v1.2")
    newer.activate()
    ok("activating a version deactivates its siblings",
       ProgramEvaluationPolicy.objects.filter(program=mine, is_active=True).count() == 1)
    ordered = policy_list(owner, f"?program_id={mine.id}")
    ok("the active policy leads the list", ordered[0]["version"] == "v1.2" and ordered[0]["is_active"] is True)
    ok("inactive versions are still readable, and say so",
       [r["is_active"] for r in ordered[1:]] == [False] * (len(ordered) - 1))
    ok("activation stamps an effective date", newer.effective_from is not None)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
