"""Rollback-only smoke: admissions engine honesty + reviewer calibration endpoints."""
import os, django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db import transaction
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.request import Request
from rest_framework.parsers import JSONParser

from apps.accelerator.models import (
    AcceleratorProgram, AcceleratorApplication, StartupApplicationProfile,
    FounderApplicationProfile, ApplicationAssessment, ReviewerAssessment,
)
from apps.accelerator import views as acc_views
from apps.accelerator.models_os import ProgramStaffMembership


class Roll(Exception):
    pass


User = get_user_model()
factory = APIRequestFactory()

with transaction.atomic():
    owner = User.objects.create_user(email="smoke-founder@x.io", password="x", role="startup")
    r1 = User.objects.create_user(email="smoke-rev1@x.io", password="x", role="accelerator")
    r2 = User.objects.create_user(email="smoke-rev2@x.io", password="x", role="accelerator")
    fp = FounderApplicationProfile.objects.create(
        user=owner, full_name="Smoke Founder", linkedin="li/in/smoke",
        technical_capability_score=8, business_capability_score=4,
        previous_companies=[{"name": "PrevCo"}], cofounders=[{"name": "CFO"}],
    )
    sp = StartupApplicationProfile.objects.create(
        founder_profile=fp, company_name="SmokeCo", declared_stage="seed",
        product_stage="mvp", revenue_status="pre_revenue", mrr_usd=0,
        loi_count=3, pilot_count=0, customer_count=0, incorporated=False,
        sector_tags="fintech", industry="payments", geography="",
    )
    prog = AcceleratorProgram.objects.create(
        name="Smoke Program", created_by=owner, sector_focus="fintech",
        stage_focus="seed", scoring_rubric_config={"version": "1.0", "dimensions": []},
    )
    app = AcceleratorApplication.objects.create(
        program=prog, startup_profile=sp, submitted_by=owner, status="SUBMITTED",
    )
    # The two reviewers are on this program's staff, which is what lets them read
    # each other's scorecards for calibration. A program being published is not
    # that grant — and this one is not published.
    ProgramStaffMembership.objects.create(user=r1, program=prog, role="reviewer")
    ProgramStaffMembership.objects.create(user=r2, program=prog, role="reviewer")

    vs = acc_views.AcceleratorApplicationViewSet()
    vs._run_admissions_engine(app)

    a = ApplicationAssessment.objects.get(application=app)
    checks = []
    checks.append(("founder_conf in [0,1]", 0.0 <= a.founder_confidence <= 1.0))
    checks.append(("founder_conf == 5/6 support", abs(a.founder_confidence - (5 / 6)) < 0.02))
    checks.append(("market_conf low (geo empty)", a.market_confidence <= 0.75))
    checks.append(("no 0.88/0.92 fabrications", a.recommendation_confidence not in (0.88, 0.92, 0.85, 0.75, 0.70, 0.95)))
    checks.append(("completeness real (<100)", 0.0 < app.application_completeness_score < 100.0))
    checks.append(("stage conflict detected", app.stage_conflict_detected))
    checks.append(("bear has unincorporated", any("incorporated" in p["point"].lower() for p in a.bear_case)))
    checks.append(("bull has pilots/LOI", any("LOI" in p["point"] for p in a.bull_case)))
    checks.append(("risk conf == 1.0", all(r["confidence"] == 1.0 for r in app.risk_flags)))
    checks.append(("rec reasoning advisory", "Advisory only" in a.recommendation_reasoning))

    # Calibration: two reviews with one agreeing pair and one disagreeing dim
    ReviewerAssessment.objects.create(
        application=app, reviewer=r1, founder_score=8, market_score=7, product_score=6,
        team_score=7, traction_score=5, overall_conviction=8, recommendation="INTERVIEW",
    )
    ReviewerAssessment.objects.create(
        application=app, reviewer=r2, founder_score=7, market_score=8, product_score=9,
        team_score=6, traction_score=6, overall_conviction=7, recommendation="INTERVIEW",
    )
    req = Request(factory.get("/api/v1/accelerator/reviews/calibration/", {"program_id": prog.id}),
                  parsers=[JSONParser()])
    req.user = r1
    cvs = acc_views.ReviewerAssessmentViewSet()
    cvs.request = req
    cvs.format_kwarg = None
    resp = cvs.calibration(req)
    data = resp.data
    checks.append(("calib total_scorecards==2", data["total_scorecards"] == 2))
    checks.append(("calib agreement computed", isinstance(data["inter_reviewer_agreement_pct"], float)))
    # pairs: founder |8-7|=1 ok, market 1 ok, product |6-9|=3 NOT ok, team 1 ok, traction 1 ok -> 4/5 = 80.0
    checks.append(("calib pct == 80.0", abs(data["inter_reviewer_agreement_pct"] - 80.0) < 0.01))
    checks.append(("calib 2 reviewers", len(data["reviewers"]) == 2))

    req2 = Request(factory.get("/api/v1/accelerator/reviews/my-calibration/"), parsers=[JSONParser()])
    req2.user = r1
    resp2 = cvs.my_calibration(req2)
    checks.append(("my-calib reviews==1", resp2.data["reviews_submitted"] == 1))
    checks.append(("my-calib comparable==5", resp2.data["comparable_dimension_scores"] == 5))

    ok = all(c[1] for c in checks)
    for name, passed in checks:
        print(("PASS" if passed else "FAIL"), name)
    transaction.set_rollback(True)
    print("ROLLBACK OK; overall:", "PASS" if ok else "FAIL")
    raise SystemExit(0 if ok else 1)
