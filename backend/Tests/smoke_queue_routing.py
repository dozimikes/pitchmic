"""Rollback-only smoke: review-queue routing (apps.accelerator.queue_routing).

Doctrine under test:
- One router, on the server. The lane a row shows, the tab it appears under and
  the counter above it are read from the same function — never re-derived in
  the browser, where the drift between cards and tabs used to live.
- Lanes are ATTENTION routing, not admission verdicts.
- Missing is not zero: an absent evidence score or completeness value does not
  push a row into a thin-evidence or incomplete lane.
- Only applications still inside the active funnel get a lane. A decided or
  never-submitted row gets None, not a bucket.
"""
import os
import uuid
from collections import Counter
from datetime import timedelta

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import queue_routing as qr
from apps.accelerator import views as acc_views
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationClaim,
    FounderApplicationProfile,
    StartupApplicationProfile,
)
from apps.accelerator.serializers import AcceleratorApplicationListSerializer

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def sig(**kw):
    """A complete signal dict with neutral defaults (nothing routes on its own)."""
    base = {
        "status": "SCREENING", "tier": "", "stage_conflict": False,
        "contradicted_claims": 0, "unverified_claims": 0,
        "evidence_score": 80.0, "completeness": 90.0,
    }
    base.update(kw)
    return base


def call_summary(user, program_id):
    req = Request(
        factory.get(f"/applications/screening-summary/?program_id={program_id}"),
        parsers=[JSONParser()],
    )
    req.user = user
    vs = acc_views.AcceleratorApplicationViewSet()
    vs.request = req
    vs.format_kwarg = None
    return vs.screening_summary(req)


def call_consensus(user, program_id):
    req = Request(
        factory.get(f"/applications/reviewer-consensus-report/?program_id={program_id}"),
        parsers=[JSONParser()],
    )
    req.user = user
    vs = acc_views.AcceleratorApplicationViewSet()
    vs.request = req
    vs.action = "reviewer_consensus_report"
    vs.kwargs = {}
    vs.format_kwarg = None
    return vs.reviewer_consensus_report(req)


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    staff = User.objects.create_user(email=f"qr-staff-{tag}@x.io", password="x", role="accelerator")
    prog = AcceleratorProgram.objects.create(
        name=f"Routing Program {tag}", slug=f"routing-{tag}", created_by=staff,
        sector_focus="fintech", stage_focus="seed",
    )

    def make_app(company, **kw):
        founder = User.objects.create_user(email=f"qr-f-{company}-{tag}@x.io", password="x", role="startup")
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=founder, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", product_stage="mvp",
            revenue_status="pre_revenue", sector_tags="fintech", industry="payments", geography="NG",
        )
        defaults = dict(program=prog, startup_profile=sp, submitted_by=staff, status="SCREENING")
        defaults.update(kw)
        return AcceleratorApplication.objects.create(**defaults)

    # Scores default to 0.0 on a row that has never been screened, which is a
    # real hold signal — so each case below states the scores it depends on and
    # varies exactly one thing.
    OK_SCORES = dict(evidence_confidence_score=80.0, application_completeness_score=90.0)

    # ── 1. Lane precedence (pure function) ───────────────────────────────────
    ok("tier A routes to priority", qr.queue_bucket(sig(tier="A")) == "priority")
    ok("tier A outranks a contradiction", qr.queue_bucket(sig(tier="A", stage_conflict=True)) == "priority")
    ok("stage conflict routes to investigate", qr.queue_bucket(sig(stage_conflict=True)) == "investigate")
    ok("contradicted claims route to investigate", qr.queue_bucket(sig(contradicted_claims=2)) == "investigate")
    ok("deferred routes to hold", qr.queue_bucket(sig(status="DEFERRED")) == "hold")
    ok("waitlisted routes to hold", qr.queue_bucket(sig(status="WAITLISTED")) == "hold")
    ok("incomplete routes to hold", qr.queue_bucket(sig(completeness=39.9)) == "hold")
    ok("hold beats needs_evidence", qr.queue_bucket(sig(completeness=10, unverified_claims=5)) == "hold")
    ok("many unverified routes to needs_evidence", qr.queue_bucket(sig(unverified_claims=3)) == "needs_evidence")
    ok("thin evidence routes to needs_evidence", qr.queue_bucket(sig(evidence_score=44.9)) == "needs_evidence")
    ok("investigate beats needs_evidence", qr.queue_bucket(sig(contradicted_claims=1, unverified_claims=9)) == "investigate")
    ok("clean and consistent is the wildcard lane", qr.queue_bucket(sig()) == "wildcard")
    ok("exactly one lane per row", qr.queue_bucket(sig()) in qr.QUEUE_BUCKETS)

    # ── 2. Missing is not zero ───────────────────────────────────────────────
    ok("missing evidence score adds no risk point", qr.risk_points(evidence_score=None)[0] == 0)
    ok("missing completeness adds no risk point", qr.risk_points(completeness=None)[0] == 0)
    ok("blank strings are not read as zero", qr.risk_points(evidence_score="", completeness="")[0] == 0)
    ok("NaN never routes", qr._num(float("nan")) is None)
    ok("no signal means no lane, not a hold", qr.queue_bucket(sig(evidence_score=None, completeness=None)) == "wildcard")
    ok("genuine zero evidence still flags", qr.risk_points(evidence_score=0.0)[1] == ["Thin evidence base"])

    # ── 3. Risk thresholds match the deleted browser copy ────────────────────
    ok("3 points is High", qr.risk_level(3) == "High")
    ok("1 point is Medium", qr.risk_level(1) == "Medium")
    ok("0 points is Low", qr.risk_level(0) == "Low")
    conflict = qr.risk_of(sig(stage_conflict=True, contradicted_claims=1))
    ok("conflict + contradiction is High", conflict["level"] == "High" and conflict["points"] == 4)
    ok("reasons are human sentences", all(r[0].isupper() for r in conflict["reasons"]))
    ok("clean row has no reasons", qr.risk_of(sig())["reasons"] == [])

    # ── 4. route_app: lane only inside the active funnel ─────────────────────
    decided = make_app("DecidedCo", status="ACCEPTED", automated_screening_tier="A", **OK_SCORES)
    draft = make_app("DraftCo", status="DRAFT", automated_screening_tier="A")
    ok("accepted application has no lane", qr.route_app(decided)["queue_bucket"] is None)
    ok("draft application has no lane", qr.route_app(draft)["queue_bucket"] is None)
    ok("risk is still reported outside the funnel", qr.route_app(decided)["risk_level"] in ("High", "Medium", "Low"))
    ok("funnel statuses are the router's list", set(acc_views.ACTIVE_FUNNEL_STATUSES) == set(qr.ACTIVE_FUNNEL_STATUSES))

    # ── 5. One program, every lane: serializer rows == server counters ───────
    # Scores default to 0.0 on a row that has never been screened, which is a
    # real hold signal — so each case below states the scores it depends on and
    # varies exactly one thing.
    OK_SCORES = dict(evidence_confidence_score=80.0, application_completeness_score=90.0)
    in_funnel = [
        make_app("PriorityCo", automated_screening_tier="A", **OK_SCORES),
        make_app("InvestigateCo", stage_conflict_detected=True, **OK_SCORES),
        make_app("HoldCo", status="DEFERRED", **OK_SCORES),
        make_app("ThinHoldCo", application_completeness_score=20.0, evidence_confidence_score=80.0),
        make_app("EvidenceCo", evidence_confidence_score=30.0, application_completeness_score=90.0),
        make_app("WildcardCo", **OK_SCORES),
    ]
    ok("an unscreened row holds, it is not a wildcard", qr.route_app(make_app("ZeroCo")).get("queue_bucket") == "hold")
    # A contradicted claim is a real row, not a hand-set counter.
    ApplicationClaim.objects.create(
        application=in_funnel[1], claim_text="NGN 40m MRR", category="commercial_traction",
        materiality="critical", source="application_answer", verification_status="contradicted",
    )
    claim_app = make_app("ClaimsCo", **OK_SCORES)
    for i in range(3):
        ApplicationClaim.objects.create(
            application=claim_app, claim_text=f"Open claim {i}", category="commercial_traction",
            materiality="high", source="application_answer", verification_status="unverified",
        )

    ser = AcceleratorApplicationListSerializer(
        AcceleratorApplication.objects.filter(program=prog).order_by("id"), many=True
    )
    row_lane_of = {r["company_name"]: r["queue_bucket"] for r in ser.data}
    row_risk_of = {r["company_name"]: (r["risk_level"], r["risk_reasons"]) for r in ser.data}
    ok("serializer exposes the routed lane", row_lane_of["PriorityCo"] == "priority")
    ok("serializer lane is null outside the funnel", row_lane_of["DecidedCo"] is None)
    ok("claims drive a row into needs_evidence", row_lane_of["ClaimsCo"] == "needs_evidence")
    ok("contradicted claim drives a row into investigate", row_lane_of["InvestigateCo"] == "investigate")
    ok("thin completeness drives a row into hold", row_lane_of["ThinHoldCo"] == "hold")
    by_app = {
        a.startup_profile.company_name: a
        for a in AcceleratorApplication.objects.filter(program=prog)
    }
    ok("serializer rows and route_app agree per application", all(
        (r["risk_level"], r["risk_reasons"], r["queue_bucket"])
        == (lambda t: (t["risk_level"], t["risk_reasons"], t["queue_bucket"]))(qr.route_app(by_app[r["company_name"]]))
        for r in ser.data
    ))
    ok("unrouted row keeps its risk, drops its lane",
       row_risk_of["DecidedCo"][0] == "Low" and row_lane_of["DecidedCo"] is None
       and row_risk_of["DecidedCo"][1] == [])
    ok("the router never invents a lane outside its set", set(row_lane_of.values()) - {None} <= set(qr.QUEUE_BUCKETS))

    summary = call_summary(staff, prog.pk)
    ok("summary endpoint returns 200", summary.status_code == 200)
    queues = summary.data["queues"]
    ok("every lane key is present", set(queues) == set(qr.QUEUE_BUCKETS))
    ok("counters are a lane tally, not a status filter", sum(queues.values()) == summary.data["review_queue"])
    counted = Counter(l for l in row_lane_of.values() if l is not None)
    ok("counters match the rows exactly", dict(counted) == {k: v for k, v in queues.items() if v})
    ok("investigate counter counts the claim row", queues["investigate"] == counted["investigate"])
    ok("priority counter counts only tier A", queues["priority"] == counted["priority"])
    ok("the router never invents a lane outside its set", set(counted) <= set(qr.QUEUE_BUCKETS))

    # ── 6. Waiting time: one anchor rule, living on the model ────────────────
    # Every screen that shows aging reads AcceleratorApplication.aging_days(),
    # so the review-queue row and the consensus row cannot report two different
    # waits for the same application.
    now = timezone.now()
    old_submit = make_app("OldCo", submitted_at=now - timedelta(days=30), **OK_SCORES)
    legacy = make_app("LegacyCo", submitted_at=None, **OK_SCORES)
    # auto_now_add overwrites a plain save, so the row's own clock moves with an
    # UPDATE — the way a real application predates the run that reads it.
    AcceleratorApplication.objects.filter(pk=legacy.pk).update(created_at=now - timedelta(days=9))

    aged_rows = AcceleratorApplicationListSerializer(
        AcceleratorApplication.objects.filter(program=prog).order_by("id"), many=True
    ).data
    aged = {r["company_name"]: r["aging_days"] for r in aged_rows}
    ok("every list row carries aging_days", all("aging_days" in r for r in aged_rows))
    ok("submitted rows age from submitted_at", aged["OldCo"] == 30)
    ok("a never-submitted row ages from created_at", aged["LegacyCo"] == 9)
    ok("a row created today has waited zero days", aged["WildcardCo"] == 0)
    ok("the serializer reads the model helper", aged["OldCo"] == old_submit.aging_days(now))
    ok("a saved row always has a timestamp to age from", all(v is not None for v in aged.values()))
    ok("an unsaved row has no waiting time to claim",
       AcceleratorApplication(submitted_at=None, created_at=None).aging_days(now) is None)
    consensus = {
        r["company_name"]: r["aging_days"]
        for r in call_consensus(staff, prog.pk).data["rows"]
    }
    ok("both screens report the same wait per row", all(
        v == consensus[k] for k, v in aged.items() if k in consensus
    ))
    ok("the consensus screen still ages the submitted row", consensus["OldCo"] == 30)
    ok("both screens age the never-submitted row the same way",
       consensus["LegacyCo"] == aged["LegacyCo"] == 9)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
