"""Rollback-only smoke: POST /accelerator/applications/batch-analyze/.

Doctrine under test:
- Triage ranks, it does not decide. The endpoint may move a row SUBMITTED →
  SCREENING (that is what a tier means) and it writes an audit row for it, but it
  never accepts, rejects or advances past SCREENING.
- What it computes is persisted — tier plus the eligibility row — so the screens
  that read those columns stop showing a run that never happened.
- Rows the caller may not touch are reported as not run rather than quietly
  dropped, so "5 selected" can honestly come back as "3 ran".
- Only program staff can run it. A founder cannot screen their own pipeline.
"""
import os
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import views as acc_views
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAuditEvent,
    FounderApplicationProfile,
    StartupApplicationProfile,
)
from apps.accelerator.permissions import IsAcceleratorOrStaff

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def post_batch(user, payload):
    req = Request(factory.post("/api/v1/accelerator/applications/batch-analyze/", payload, format="json"),
                  parsers=[JSONParser()])
    req.user = user
    vs = acc_views.AcceleratorApplicationViewSet()
    vs.request = req
    vs.action = "batch_analyze"
    vs.kwargs = {}
    vs.format_kwarg = None
    try:
        return vs.batch_analyze(req).data, None
    except (ValidationError, PermissionDenied) as exc:
        return None, exc


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    owner = User.objects.create_user(email=f"bt-owner-{tag}@x.io", password="x", role="accelerator")
    rival = User.objects.create_user(email=f"bt-rival-{tag}@x.io", password="x", role="accelerator")
    founder = User.objects.create_user(email=f"bt-founder-{tag}@x.io", password="x", role="startup")

    prog = AcceleratorProgram.objects.create(
        name=f"Triage Program {tag}", slug=f"triage-{tag}", created_by=owner,
        sector_focus="fintech", stage_focus="seed",
    )
    # Another accelerator's program, not published: the caller can read the row
    # through the role-wide list scope but must not be able to re-rank it.
    other = AcceleratorProgram.objects.create(
        name=f"Triage Other {tag}", slug=f"triage-other-{tag}", created_by=rival, is_public=False,
    )
    # The caller's own program with nothing in review scope.
    empty_prog = AcceleratorProgram.objects.create(
        name=f"Triage Empty {tag}", slug=f"triage-empty-{tag}", created_by=owner, is_public=False,
    )

    def make_app(company, *, status="SUBMITTED", fit=90, strength=90, evidence=90, program=None):
        person = User.objects.create_user(email=f"bt-{company.lower()}-{tag}@x.io", password="x", role="startup")
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=person, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", sector_tags="fintech", geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=program or prog, startup_profile=sp, submitted_by=founder, status=status,
            program_fit_score=fit, startup_strength_score=strength, evidence_confidence_score=evidence,
        )

    strong = make_app("StrongCo")
    weak = make_app("WeakCo", fit=50, strength=50, evidence=50)
    draft = make_app("DraftCo", status="DRAFT")
    withdrawn = make_app("GoneCo", status="WITHDRAWN")
    elsewhere = make_app("ElsewhereCo", program=other)
    decided = make_app("DecidedCo", status="ACCEPTED")
    shortlisted = make_app("ShortlistedCo", status="SHORTLISTED")

    # ── 1. Access ────────────────────────────────────────────────────────────
    investor = User.objects.create_user(email=f"bt-investor-{tag}@x.io", password="x", role="investor")
    ok("an investor cannot run screening — it is the program team's write",
       isinstance(post_batch(investor, {"application_ids": [strong.id]})[1], PermissionDenied))
    data, err = post_batch(founder, {"application_ids": [strong.id]})
    ok("a founder cannot run triage", isinstance(err, PermissionDenied))
    data, err = post_batch(owner, {})
    ok("an empty request is refused", isinstance(err, ValidationError))
    ok("the refusal names the field it needs",
       isinstance(err, ValidationError) and "application_ids" in err.detail)
    ok("nothing ran under any refusal",
       not AcceleratorApplication.objects.filter(automated_screening_tier__gt="").exists())

    # ── 2. It ranks and persists, and stops there ────────────────────────────
    data, err = post_batch(owner, {"application_ids": [strong.id, weak.id, draft.id, withdrawn.id]})
    ok("a scoped run succeeds", err is None and data is not None)
    by_id = {r["application_id"]: r for r in (data or {}).get("results", [])}
    strong.refresh_from_db(); weak.refresh_from_db()
    ok("the strong row lands in Tier A", by_id.get(strong.id, {}).get("tier") == "A" and strong.automated_screening_tier == "A")
    ok("the weak row lands in Tier C", by_id.get(weak.id, {}).get("tier") == "C" and weak.automated_screening_tier == "C")
    ok("a screened row reports its new status", by_id.get(strong.id, {}).get("status") == "SCREENING")
    ok("SUBMITTED moves to SCREENING and no further",
       strong.status == "SCREENING" and weak.status == "SCREENING")
    ok("nothing was accepted or rejected by the run",
       not AcceleratorApplication.objects.filter(
           id__in=[strong.id, weak.id], status__in=["ACCEPTED", "REJECTED", "WAITLISTED"]
       ).exists())
    ok("the eligibility row was written, not just returned",
       strong.eligibility_checked_at is not None and bool(strong.eligibility_breakdown))
    ok("the response carries the same eligibility number the row holds",
       abs(by_id[strong.id]["eligibility_score"] - strong.eligibility_score) < 1e-6)
    audit = ApplicationAuditEvent.objects.filter(application=strong, is_automated=True).order_by("-id").first()
    ok("the triage is in the audit ledger", audit is not None)
    ok("the audit says a tier was assigned", audit is not None and "Tier" in audit.reason)

    # ── 3. Rows it must not touch ────────────────────────────────────────────
    ok("the two out-of-scope rows ran", data["ran"] == 2)
    ok("a draft and a withdrawn row are counted as not run, not as failures",
       data["not_run"] == 2 and data["failed"] == 0)
    ok("they kept no tier", draft.automated_screening_tier == "" and withdrawn.automated_screening_tier == "")
    ok("requested is the number sent, not the number left after filtering", data["requested"] == 4)

    hidden = post_batch(owner, {"application_ids": [elsewhere.id]})
    ok("a program the caller cannot work in runs nothing", hidden[0]["ran"] == 0 if hidden[0] else False)
    ok("and says so instead of pretending",
       hidden[0]["requested"] == 1 and hidden[0]["not_run"] == 1 if hidden[0] else False)
    elsewhere.refresh_from_db()
    ok("the untouched row still has no tier", elsewhere.automated_screening_tier == "")

    # ── 4. A decided row is re-ranked but never moved backwards ──────────────
    data, err = post_batch(owner, {"application_ids": [decided.id, shortlisted.id]})
    decided.refresh_from_db(); shortlisted.refresh_from_db()
    ok("an ACCEPTED row keeps its status through a re-screen", decided.status == "ACCEPTED")
    ok("a SHORTLISTED row keeps its status too", shortlisted.status == "SHORTLISTED")
    ok("both still got a fresh tier",
       decided.automated_screening_tier == "A" and shortlisted.automated_screening_tier == "A")
    ok("the run reports both as ran", data["ran"] == 2 and data["not_run"] == 0)

    # ── 5. Whole-program scope, and the refusal when nothing qualifies ───────
    make_app("LateDraftCo", status="DRAFT", program=empty_prog)
    data, err = post_batch(owner, {"program_id": prog.id})
    ok("a program-scoped run is accepted", err is None and data["ran"] == 4)
    ok("a program run's denominator is the program's rows, drafts included",
       data["requested"] == 6 and data["not_run"] == 2)
    ok("the program's drafts are excluded from it",
       all(r["application_id"] != draft.id for r in data["results"]))
    empty, err = post_batch(owner, {"program_id": empty_prog.id})
    ok("a program with nothing to run returns 400 rather than a silent success",
       err is None and empty["ran"] == 0 and empty["not_run"] == 1 and empty["error"])
    ok("the draft in that program kept no tier",
       AcceleratorApplication.objects.get(startup_profile__company_name="LateDraftCo").automated_screening_tier == "")
    ok("an id list of the wrong type is refused, not coerced",
       isinstance(post_batch(owner, {"application_ids": "not-a-list"})[1], ValidationError))

    # ── 6. A duplicate selection runs once ───────────────────────────────────
    dup, _ = post_batch(owner, {"application_ids": [strong.id, strong.id, strong.id]})
    ok("a repeated id is not run three times", dup["ran"] == 1 and dup["requested"] == 1)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
