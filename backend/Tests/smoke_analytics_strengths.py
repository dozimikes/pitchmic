"""Rollback-only smoke: the pool "Top Strengths" ladder + cohort deltas.

Doctrine under test:
- A pool ranking is computed on the SERVER from stored ApplicationAssessment
  dimension scores — never re-derived from a page of rows in the browser.
- Missing is not zero: a dimension left at the model default (score 0.0 with no
  recorded confidence) is excluded from both the average and the denominator,
  so an unscored dimension cannot drag a ranking down or appear as "0".
- Aggregates (recommendation/stage/evidence/completeness) are not dimensions
  and never enter the ladder.
- cohort_deltas are honest: null when there is no prior program to compare
  against, never a fabricated 0%.
"""
import os
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import views as acc_views
from apps.accelerator.interview_guide import dimension_score_fields, pool_strength_ladder
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAssessment,
    FounderApplicationProfile,
    StartupApplicationProfile,
)

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


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


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    staff = User.objects.create_user(email=f"ts-staff-{tag}@x.io", password="x", role="accelerator")

    def new_program(name):
        return AcceleratorProgram.objects.create(
            name=f"{name} {tag}", slug=f"{name.lower().replace(' ', '-')}-{tag}",
            created_by=staff, sector_focus="fintech", stage_focus="seed",
        )

    prog = new_program("Strengths Program")
    founder_user = User.objects.create_user(email=f"ts-f-{tag}@x.io", password="x", role="startup")
    sp = StartupApplicationProfile.objects.create(
        founder_profile=FounderApplicationProfile.objects.create(user=founder_user, full_name="F One"),
        company_name="AlphaCo", declared_stage="seed", product_stage="mvp",
        revenue_status="pre_revenue", sector_tags="fintech", industry="payments", geography="NG",
    )
    app = AcceleratorApplication.objects.create(
        program=prog, startup_profile=sp, submitted_by=staff, status="SCREENING",
    )
    # Traction clearly strongest, market next, revenue genuinely weak-but-scored,
    # team left unscored (0.0 + no confidence) so it must NOT appear.
    ApplicationAssessment.objects.create(
        application=app,
        traction_score=90.0, traction_confidence=0.7,
        market_score=70.0, market_confidence=0.6,
        revenue_score=20.0, revenue_confidence=0.5,
        team_score=0.0, team_confidence=0.0,
        founder_score=0.0, founder_confidence=0.4,  # genuine zero WITH confidence → counts
        recommendation_confidence=0.9, stage_confidence=0.8, evidence_confidence=0.9,
    )

    # ── 1. The dimension set is derived, aggregates excluded ─────────────────
    fields = dimension_score_fields()
    ok("traction is a framework dimension", "traction_score" in fields)
    ok("team is a framework dimension", "team_score" in fields)
    ok("recommendation aggregate is not a dimension", not any(f.startswith("recommendation") for f in fields))
    ok("evidence aggregate is not a dimension", "evidence_confidence" not in fields)
    ok("stage aggregate is not a dimension", not any(f.startswith("stage") for f in fields))

    # ── 2. Ranking + the missing-is-not-zero gate ────────────────────────────
    ladder = pool_strength_ladder([app.assessment])
    by_key = {row["key"]: row for row in ladder}
    ok("unscored dimension is excluded entirely", "team" not in by_key)
    ok("genuine zero with confidence is kept", "founder" in by_key and by_key["founder"]["avg_score"] == 0.0)
    ok("ranked highest first", [r["key"] for r in ladder] == sorted(
        (r["key"] for r in ladder), key=lambda k: (-by_key[k]["avg_score"], by_key[k]["label"])))
    ok("traction ranks first", ladder[0]["key"] == "traction")
    ok("scores normalised to 0-100", by_key["traction"]["avg_score"] == 90.0)
    ok("denominator counts only scored rows", by_key["traction"]["scored_count"] == 1)
    ok("no aggregate leaks into the ladder", not {"recommendation", "stage", "evidence", "completeness"} & set(by_key))

    # ── 3. Averaging across applications, unscored excluded from denominator ─
    app2 = AcceleratorApplication.objects.create(
        program=prog,
        startup_profile=StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(
                user=User.objects.create_user(email=f"ts-f2-{tag}@x.io", password="x", role="startup"),
                full_name="F Two"),
            company_name="BetaCo", declared_stage="seed", product_stage="mvp",
            revenue_status="pre_revenue", sector_tags="fintech", industry="payments", geography="NG",
        ),
        submitted_by=staff, status="SCREENING",
    )
    # Beta scored traction mid and never scored market (default) → market stays
    # at Alpha's 70.0 with denominator 1, and now outranks the averaged traction.
    ApplicationAssessment.objects.create(
        application=app2, traction_score=40.0, traction_confidence=0.6,
    )
    ladder2 = pool_strength_ladder(
        ApplicationAssessment.objects.filter(application__program=prog)
    )
    b2 = {r["key"]: r for r in ladder2}
    ok("market average ignores the unscored row", b2["market"]["avg_score"] == 70.0)
    ok("market denominator is the one scored row", b2["market"]["scored_count"] == 1)
    ok("traction averages both scored rows", b2["traction"]["avg_score"] == 65.0 and b2["traction"]["scored_count"] == 2)
    ok("averaging can re-rank the pool", ladder2[0]["key"] == "market")

    # ── 4. Endpoint surface + honest cohort deltas ───────────────────────────
    res = call_summary(staff, prog.pk)
    ok("summary returns 200", res.status_code == 200)
    ok("endpoint carries the ladder", res.data["strengths"] == ladder2)
    ok("strengths is ranked at the API too", [r["key"] for r in res.data["strengths"]][0] == "market")

    cd = res.data["cohort_deltas"]
    ok("no prior program yet means null deltas", cd["previous_program"] is None and cd["metrics"] is None)

    # Create an EARLIER program by the same owner so a baseline exists.
    prev = new_program("Prior Cohort")
    AcceleratorApplication.objects.create(
        program=prev,
        startup_profile=StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(
                user=User.objects.create_user(email=f"ts-f3-{tag}@x.io", password="x", role="startup"),
                full_name="F Three"),
            company_name="GammaCo", declared_stage="seed", product_stage="mvp",
            revenue_status="pre_revenue", sector_tags="fintech", industry="payments", geography="NG",
        ),
        submitted_by=staff, status="ACCEPTED",
    )
    # Re-point prog's created_at to now (default) — prev is created after, so it
    # becomes the most recent OTHER program; either way a baseline must appear.
    res2 = call_summary(staff, prog.pk)
    cd2 = res2.data["cohort_deltas"]
    ok("a second owned program yields a baseline", cd2["previous_program"] is not None)
    ok("baseline metrics carry the delta keys", cd2["metrics"] is not None and {
        "total", "processed", "review_queue", "selected"} <= set(cd2["metrics"]))
    # The prior program has nobody still in the active funnel (its one
    # application is ACCEPTED), so review_queue has a zero prior denominator —
    # the honest answer is null, never a divide-by-zero and never 0%.
    ok("a zero prior denominator is null not a divide-by-zero", cd2["metrics"]["review_queue"] is None)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
