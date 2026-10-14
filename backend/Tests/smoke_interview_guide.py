"""Rollback-only smoke: the server-built interview guide.

Doctrine under test:
- Probes are derived from stored rows (assessment dimensions, stage conflict,
  bear case, risk flags, claim verification state) — never invented, and never
  a verdict. An interview question is not an admission decision.
- A dimension the engine left at its default is treated as unscored, not as 0.
- Verified claims generate no probe; contradicted ones name the stored
  discrepancy note.
- Same record → same output, deterministically, with no model call.
- Presentation stays with the client: probes carry severity, never a CSS class.
"""
import json
import os
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import views as acc_views
from apps.accelerator.interview_guide import _MAX_CLAIM_PROBES, build_interview_guide
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAssessment,
    ApplicationClaim,
    FounderApplicationProfile,
    StartupApplicationProfile,
)

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def probe_keys(guide):
    return {p["key"] for p in guide["probes"]}


def explore_keys(guide):
    return {p["key"] for p in guide["areas_to_explore"]}


def call_guide(user, app_id):
    req = Request(factory.get(f"/apps/{app_id}/interview-guide/"), parsers=[JSONParser()])
    req.user = user
    vs = acc_views.AcceleratorApplicationViewSet()
    vs.request = req
    vs.kwargs = {"pk": app_id}
    return vs.interview_guide(req, pk=app_id)


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    staff = User.objects.create_user(email=f"ig-staff-{tag}@x.io", password="x", role="accelerator")

    prog = AcceleratorProgram.objects.create(
        name=f"Guide Program {tag}", slug=f"guide-{tag}", created_by=staff,
        sector_focus="fintech", stage_focus="seed",
    )

    def make_app(company):
        founder = User.objects.create_user(email=f"ig-f-{company}-{tag}@x.io", password="x", role="startup")
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=founder, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", product_stage="mvp",
            revenue_status="pre_revenue", sector_tags="fintech", industry="payments", geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=prog, startup_profile=sp, submitted_by=staff,
            status="INTERVIEW_INVITED", submitted_at=timezone.now(),
        )

    app = make_app("GuideCo")
    ApplicationAssessment.objects.create(
        application=app,
        traction_score=40.0, traction_confidence=0.5,   # weak → probe
        market_score=80.0, market_confidence=0.6,        # strong → no probe
        revenue_score=0.0, revenue_confidence=0.0,       # unscored default → no probe
        product_score=0.0, product_confidence=0.7,       # genuinely zero → probe
        founder_score=70.0, founder_confidence=0.6,      # strong → no probe
        declared_stage="scaling", inferred_stage="mvp", stage_conflict=True,
        bear_case=[
            {"point": f"Bear {i}", "strength": "medium"} for i in range(5)
        ],
        risk_flags=[
            {"risk": "Single-key-person dependency", "severity": "high", "mitigation": "Hire a second engineer"},
            {"risk": "Cosmetic flag", "severity": "low"},
        ],
    )

    def claim(text, status_v, notes=""):
        return ApplicationClaim.objects.create(
            application=app, claim_text=text, category="commercial_traction",
            materiality="critical", source="application_answer",
            verification_status=status_v, discrepancy_notes=notes,
        )

    claim("NGN 40m MRR", "contradicted", "Bank statement shows NGN 6m.")
    claim("Enterprise pilot in flight", "pending")
    claim("100 signed LOIs", "verified")

    g = build_interview_guide(app)

    # ── 1. Dimension probes name stored scores only ──────────────────────────
    ok("weak dimension probes", "q-traction" in probe_keys(g) and "q-product" in probe_keys(g))
    ok("strong dimension does not probe", not {"q-market", "q-founder"} & probe_keys(g))
    ok("unscored default is not read as zero", "q-revenue" not in probe_keys(g))
    detail = next(p["detail"] for p in g["probes"] if p["key"] == "q-traction")
    ok("probe quotes the stored score", detail == "ML screening scored traction 40.0/100.")
    ok("assessment presence reported", g["assessment_present"] is True)

    # ── 2. Stage conflict, bear case and risk flags ──────────────────────────
    ok("stage conflict adds a probe and an area", {"q-stage"} <= probe_keys(g) and {"explore-stage"} <= explore_keys(g))
    ok("bear case caps areas at 4", len([k for k in explore_keys(g) if k.startswith("explore-bear-")]) == 4)
    ok("bear case caps probes at 3", len([k for k in probe_keys(g) if k.startswith("q-bear-")]) == 3)
    ok("high risk flag becomes an area", "explore-risk-0" in explore_keys(g))
    ok("low risk flag is ignored", "explore-risk-1" not in explore_keys(g))

    # ── 3. Claims ────────────────────────────────────────────────────────────
    by_key = {p["key"]: p for p in g["probes"]}
    contradicted = [p for k, p in by_key.items() if p["tag"] == "Contradicted claim"]
    unverified = [p for k, p in by_key.items() if p["tag"] == "Unverified claim"]
    ok("contradicted claim probes once", len(contradicted) == 1)
    ok("contradiction quotes stored notes", contradicted and "NGN 6m" in contradicted[0]["question"])
    ok("contradiction severity is high", contradicted and contradicted[0]["severity"] == "high")
    ok("pending claim probes as unverified", len(unverified) == 1 and unverified[0]["severity"] == "info")
    ok("verified claim generates no probe", not any("100 signed LOIs" in p["question"] for p in g["probes"]))
    ok("contradiction also surfaces as an area", any(
        e["tag"] == "Contradiction" for e in g["areas_to_explore"]))
    ok("open_claims counts the ledger not the cap", g["open_claims"] == 2)

    # ── 4. Determinism and payload hygiene ───────────────────────────────────
    ok("same record → same guide", json.dumps(g, sort_keys=True) == json.dumps(build_interview_guide(app), sort_keys=True))
    all_items = g["probes"] + g["areas_to_explore"]
    ok("every probe carries a question and a tag", all(p["question"].strip() and p["tag"].strip() for p in all_items))
    ok("severities are from the allowed set", {p["severity"] for p in all_items} <= {"high", "medium", "info"})
    ok("no styling leaks to the client", not any(
        "text-" in str(v) or "bg-" in str(v) for p in all_items for v in p.values()))
    ok("probes never carry a decision verb", not any(
        w in p["question"].lower() for p in all_items for w in ("reject", "accept", "admit", "exclude")))

    # ── 5. Claim probe cap ───────────────────────────────────────────────────
    for i in range(_MAX_CLAIM_PROBES + 3):
        claim(f"Extra open claim {i}", "unverified")
    capped = build_interview_guide(app)
    claim_probes = [p for p in capped["probes"] if p["key"].startswith("q-claim-")]
    ok("claim probes stop at the cap", len(claim_probes) == _MAX_CLAIM_PROBES)
    ok("open_claims still reports the full ledger", capped["open_claims"] == _MAX_CLAIM_PROBES + 5)

    # ── 6. No assessment at all: claims still drive probes ───────────────────
    bare = make_app("BareCo")
    claim_row = ApplicationClaim.objects.create(
        application=bare, claim_text="We process $1m monthly", category="revenue",
        materiality="critical", source="application_answer", verification_status="unverified",
    )
    bg = build_interview_guide(bare)
    ok("missing assessment is reported", bg["assessment_present"] is False)
    ok("dimension probes need an assessment", bool(probe_keys(bg)) and all(
        k.startswith("q-claim-") for k in probe_keys(bg)))
    ok("claim probe survives without an assessment", bg["probes"][0]["key"] == f"q-claim-{claim_row.pk}")

    # ── 7. Endpoint wiring ───────────────────────────────────────────────────
    res = call_guide(staff, app.pk)
    ok("endpoint returns 200", res.status_code == 200)
    ok("endpoint mirrors the builder", res.data == build_interview_guide(app))
    ok("endpoint scopes to the requested application", res.data["application_id"] == app.pk)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
