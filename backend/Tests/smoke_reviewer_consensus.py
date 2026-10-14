"""Rollback-only smoke: reviewer consensus report + scorecard integrity.

Doctrine under test: consensus numbers are computed by the server from stored
scorecards (never re-derived in the browser), one human gets one live ballot
per application, "ML ran" comes from the screening tier rather than a score
being non-zero, and cross-program bulk reads are refused.
"""
import os, django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.utils import IntegrityError
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
    ReviewerAssessment,
    ReviewerDisagreement,
    StartupApplicationProfile,
)
from apps.accelerator.models_os import ProgramStaffMembership


class Roll(Exception):
    pass


User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def viewset(cls, request, action, **kwargs):
    vs = cls()
    vs.request = request
    vs.action = action
    vs.kwargs = kwargs
    # APIView.initialize_request normally sets this; we bypass as_view().
    vs.format_kwarg = None
    return vs


def make_request(method, path, payload=None, user=None):
    if payload is None:
        inner = getattr(factory, method)(path)
    else:
        inner = getattr(factory, method)(path, payload, format="json")
    req = Request(inner, parsers=[JSONParser()])
    if user is not None:
        req.user = user
    return req


def results_of(response):
    data = response.data
    return data["results"] if isinstance(data, dict) and "results" in data else data


def report(user, program_id):
    req = make_request("get", f"/api/v1/accelerator/applications/reviewer-consensus-report/?program_id={program_id}", user=user)
    return viewset(acc_views.AcceleratorApplicationViewSet, req, "reviewer_consensus_report").reviewer_consensus_report(req)


def reviews_list(user, query=""):
    req = make_request("get", f"/api/v1/accelerator/reviews/{query}", user=user)
    vs = viewset(acc_views.ReviewerAssessmentViewSet, req, "list")
    try:
        return vs.list(req)
    except ValidationError as exc:
        return exc


def submit_review(user, payload):
    req = make_request("post", "/api/v1/accelerator/reviews/", payload, user=user)
    vs = viewset(acc_views.ReviewerAssessmentViewSet, req, "create")
    try:
        vs.create(req)
        return vs
    except (ValidationError, PermissionDenied) as exc:
        vs._error = exc
        return vs


def card(app, reviewer, **scores):
    base = dict(
        founder_score=5, market_score=5, product_score=5, team_score=5, traction_score=5,
        overall_conviction=5,
    )
    base.update(scores)
    return ReviewerAssessment.objects.create(application=app, reviewer=reviewer, **base)


with transaction.atomic():
    founder = User.objects.create_user(email="rc-founder@x.io", password="x", role="startup")
    rv1 = User.objects.create_user(
        email="rc-one@x.io", password="x", role="accelerator", first_name="Rae", last_name="One"
    )
    rv2 = User.objects.create_user(
        email="rc-two@x.io", password="x", role="accelerator", first_name="Rob", last_name="Two"
    )
    rv3 = User.objects.create_user(
        email="rc-three@x.io", password="x", role="accelerator", first_name="Ada", last_name="Three"
    )

    prog = AcceleratorProgram.objects.create(
        name="Consensus Program", slug="consensus-prog", created_by=founder,
        sector_focus="fintech", stage_focus="seed",
        scoring_rubric_config={"version": "1.0", "dimensions": []},
    )
    other_prog = AcceleratorProgram.objects.create(
        name="Other Program", slug="other-prog", created_by=founder,
        sector_focus="healthtech", stage_focus="pre_seed",
        scoring_rubric_config={"version": "1.0", "dimensions": []},
    )

    # The reviewers reach these programs through memberships, not through the
    # catalogue door: created_by here is a founder account and is_public defaults
    # to True, which used to make every program's records readable by anyone.
    for reviewer in (rv1, rv2, rv3):
        ProgramStaffMembership.objects.create(user=reviewer, program=prog, role="reviewer")
    ProgramStaffMembership.objects.create(user=rv1, program=other_prog, role="reviewer")

    def make_app(program, name, status="SCREENING", **kw):
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(
                user=User.objects.create_user(email=f"rc-{name}@x.io", password="x", role="startup"),
                full_name=f"F {name}",
            ),
            company_name=name, declared_stage="seed", product_stage="mvp",
            revenue_status="pre_revenue", sector_tags="fintech", industry="payments",
            geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=program, startup_profile=sp, submitted_by=founder, status=status, **kw
        )

    app_a = make_app(prog, "Alpha")                      # will get two divergent reviews
    app_b = make_app(prog, "Beta")                       # never screened, no reviews
    app_c = make_app(prog, "Gamma", status="DRAFT")     # out of review scope
    app_other = make_app(other_prog, "Elsewhere")

    # ── 1. Empty ledger: honest zeroes, nulls not estimates ────────────────
    r0 = report(rv1, prog.id).data
    ok("draft excluded from review scope", r0["scope"]["review_scope"] == 2 and r0["scope"]["evaluated"] == 2)
    ok("unscored app reports ML as not run", all(
        row["ml"]["screening_ran"] is False and row["ml"]["program_fit"] is None
        for row in r0["rows"]
    ))
    ok("awaiting lane counts both", r0["rollup"]["lanes"]["awaiting_review"] == 2)
    ok("no scorecards recorded", r0["rollup"]["scorecards_recorded"] == 0)
    ok("avg conviction is null not zero", r0["rollup"]["avg_human_conviction"] is None)
    ok("agreement is null not zero", r0["calibration"]["inter_reviewer_agreement_pct"] is None)

    # ── 2. Bulk reads must be program-scoped ───────────────────────────────
    unscoped = reviews_list(rv1)
    ok("unscoped review bulk read refused", isinstance(unscoped, ValidationError))
    scoped = reviews_list(rv1, "?program_id=%d" % prog.id)
    ids = {row["application"] for row in results_of(scoped)}
    ok("scoped list is empty before submissions", ids == set())

    # ── 3. Scorecard submit + one live ballot per human ────────────────────
    vs = submit_review(rv1, {
        "application": app_a.id, "founder_score": 8, "market_score": 7, "product_score": 8,
        "team_score": 7, "traction_score": 8, "overall_conviction": 7.5,
        "recommendation": "INTERVIEW", "notes": "strong team",
    })
    ok("first scorecard accepted", not hasattr(vs, "_error"))
    vs2 = submit_review(rv1, {
        "application": app_a.id, "founder_score": 6, "market_score": 6, "product_score": 6,
        "team_score": 6, "traction_score": 6, "overall_conviction": 6.0,
        "recommendation": "WAITLIST", "notes": "revised after diligence",
    })
    ok("re-submit accepted", not hasattr(vs2, "_error"))
    mine = ReviewerAssessment.objects.filter(application=app_a, reviewer=rv1)
    ok("re-submit edits, not duplicates", mine.count() == 1)
    ok("latest conviction wins", float(mine.first().overall_conviction) == 6.0)

    rows_a = next(r for r in report(rv1, prog.id).data["rows"] if r["application_id"] == app_a.id)
    ok("report counts one reviewer", rows_a["reviewer_count"] == 1)
    ok("single reviewer is not consensus", rows_a["consensus_state"] == "single_reviewer")
    ok("my review surfaced", rows_a["my_review"] is not None and rows_a["my_review"]["recommendation"] == "WAITLIST")

    # ── 4. A real zero stays a zero, and is distinct from never-run ─────────
    app_a.automated_screening_tier = "B"
    app_a.program_fit_score = 0.0
    app_a.save(update_fields=["automated_screening_tier", "program_fit_score"])
    ApplicationAuditEvent.objects.create(
        application=app_a, from_stage="SUBMITTED", to_stage="SCREENING", is_automated=True,
    )
    r_screened = report(rv1, prog.id).data
    row_screened = next(r for r in r_screened["rows"] if r["application_id"] == app_a.id)
    ok("screened tier marks ML ran", row_screened["ml"]["screening_ran"] is True)
    ok("scored 0 is 0, not missing", row_screened["ml"]["program_fit"] == 0.0)
    ok("automated audit event gives run time", row_screened["ml"]["ran_at"] is not None)
    ok("never-run row has no run time", next(
        r for r in r_screened["rows"] if r["application_id"] == app_b.id
    )["ml"]["ran_at"] is None)
    ok("ml rollup splits scored vs not run",
       r_screened["rollup"]["ml_screened"] == 1 and r_screened["rollup"]["ml_not_run"] == 1)

    # ── 5. Divergence across ALL reviewer pairs, with humans named ─────────
    # rv1's live card is all-6s (from the re-submit above); rv2 scores 9s and
    # rv3 scores 2s, so every pair on every dimension is >= 3 points apart.
    # Filed through the API, because variance detection runs on the write path.
    def submit_card(reviewer, value, conviction):
        return submit_review(reviewer, {
            "application": app_a.id, "founder_score": value, "market_score": value,
            "product_score": value, "team_score": value, "traction_score": value,
            "overall_conviction": conviction, "recommendation": "INTERVIEW",
        })

    ok("second reviewer scorecard accepted", not hasattr(submit_card(rv2, 9, 9), "_error"))
    ok("third reviewer scorecard accepted", not hasattr(submit_card(rv3, 2, 2), "_error"))

    r2 = report(rv1, prog.id).data
    row_a = next(r for r in r2["rows"] if r["application_id"] == app_a.id)
    ok("three distinct reviewers counted", row_a["reviewer_count"] == 3)
    ok("divergent state flagged", row_a["consensus_state"] == "divergent")
    ok("human mean over deduped cards", row_a["human_avg_conviction"] == round((6 + 9 + 2) / 3, 1))
    ok("spread is max minus min", row_a["human_conviction_spread_points"] == 7.0)
    ok("open disagreements counted", row_a["open_disagreements"] >= 2)

    # reviewer_a/_b point at the two SCORECARDS, not the people.
    dis = list(ReviewerDisagreement.objects.filter(application=app_a).select_related(
        "reviewer_a", "reviewer_b"))
    pairs = {(d.reviewer_a.reviewer_id, d.reviewer_b.reviewer_id) for d in dis}
    ok("third reviewer compared too", (rv2.id, rv3.id) in pairs or (rv3.id, rv2.id) in pairs)
    wide = next(
        d for d in dis
        if d.dimension == "Traction"
        and {d.reviewer_a.reviewer_id, d.reviewer_b.reviewer_id} == {rv2.id, rv3.id}
    )
    ok("variance_pct is points x10", wide.variance_pct == 70.0)
    ok("disagreement names both humans",
       "Rob Two" in wide.resolution_notes and "Ada Three" in wide.resolution_notes)

    drow = next(
        d for d in r2["disagreements"]
        if d["dimension"] == "Traction" and d["variance_pct"] == 70.0
    )
    ok("serializer exposes reviewer names", drow["reviewer_a_name"] and drow["reviewer_b_name"])
    ok("serializer exposes both scores", drow["dimension_a"] is not None and drow["dimension_b"] is not None)
    ok("variance in points derived", drow["variance_points"] == 7.0)

    # ── 6. Calibration: one implementation, cohort-relative tendency ───────
    cal = r2["calibration"]
    by_name = {x["reviewer_name"]: x for x in cal["reviewers"]}
    ok("tendency computed vs cohort mean", by_name["Rob Two"]["tendency"] == "lenient"
       and by_name["Ada Three"]["tendency"] == "strict"
       and by_name["Rae One"]["tendency"] == "in_line")
    ok("agreement percentage present", cal["inter_reviewer_agreement_pct"] is not None)

    # ── 7. The DB itself refuses a second ballot for one human ─────────────
    try:
        with transaction.atomic():  # savepoint: the failed insert must not poison the outer block
            card(app_a, rv1, founder_score=10, market_score=10, product_score=10, team_score=10,
                 traction_score=10, overall_conviction=10)
        ok("duplicate (application, reviewer) card refused", False)
    except IntegrityError:
        ok("duplicate (application, reviewer) card refused", True)
    r_dup = report(rv1, prog.id).data
    row_dup = next(r for r in r_dup["rows"] if r["application_id"] == app_a.id)
    ok("report still counts three reviewers", row_dup["reviewer_count"] == 3)
    ok("rollup scorecards equal distinct reviewers", r_dup["rollup"]["scorecards_recorded"] == 3)

    # ── 8. Disagreements can be closed by a human, with a reason ──────────
    target = wide
    before_open = next(
        r for r in report(rv1, prog.id).data["rows"] if r["application_id"] == app_a.id
    )["open_disagreements"]
    req_bad = make_request(
        "post", f"/api/v1/accelerator/disagreements/{target.id}/resolve/",
        {"resolution_notes": "   "}, user=rv2,
    )
    vs_bad = viewset(acc_views.ReviewerDisagreementViewSet, req_bad, "resolve", pk=str(target.id))
    try:
        vs_bad.resolve(req_bad, pk=str(target.id))
        ok("resolve without notes rejected", False)
    except ValidationError:
        ok("resolve without notes rejected", True)
    req_ok = make_request(
        "post", f"/api/v1/accelerator/disagreements/{target.id}/resolve/",
        {"resolution_notes": "Walked through the traction evidence together."}, user=rv2,
    )
    vs_ok = viewset(acc_views.ReviewerDisagreementViewSet, req_ok, "resolve", pk=str(target.id))
    resp = vs_ok.resolve(req_ok, pk=str(target.id))
    ok("resolve marks row resolved", resp.data["resolved"] is True)
    ok("resolver recorded", "Rob Two" in resp.data["resolution_notes"])
    after_open = next(
        r for r in report(rv1, prog.id).data["rows"] if r["application_id"] == app_a.id
    )["open_disagreements"]
    ok("resolved row leaves the open count", after_open == before_open - 1)

    # ── 9. No scorecards on unsent or withdrawn applications ───────────────
    vs_draft = submit_review(rv1, {"application": app_c.id, "overall_conviction": 9})
    ok("draft application cannot be scored", isinstance(getattr(vs_draft, "_error", None), ValidationError))

    # ── 10. Program scoping holds in the report itself ─────────────────────
    r_prog = report(rv1, prog.id).data
    r_other = report(rv1, other_prog.id).data
    ok("report only covers its program", {x["application_id"] for x in r_prog["rows"]} == {app_a.id, app_b.id})
    ok("other program has its own rows", {x["application_id"] for x in r_other["rows"]} == {app_other.id})
    ok("consensus data does not bleed across programs", r_other["rollup"]["scorecards_recorded"] == 0)

    try:
        raise Roll
    except Roll:
        pass
    transaction.set_rollback(True)

failed = [name for name, ok_flag in checks if not ok_flag]
for name, ok_flag in checks:
    print(f"  {'PASS' if ok_flag else 'FAIL'}  {name}")
print(f"\n{len(checks) - len(failed)}/{len(checks)} reviewer-consensus smoke checks passed")
raise SystemExit(1 if failed else 0)
