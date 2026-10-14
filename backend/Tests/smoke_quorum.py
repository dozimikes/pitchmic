"""Rollback-only smoke: committee vote casting + quorum enforcement.

Asserts the doctrine: the database's stored ballots are the single source of
truth for the tally, quorum gates finalization on the server, and no
client-supplied voting summary can override the recomputed counts.
"""
import os, django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.test import APIRequestFactory
from rest_framework.request import Request
from rest_framework.parsers import JSONParser

from apps.accelerator.models import (
    AcceleratorProgram, AcceleratorApplication, StartupApplicationProfile,
    FounderApplicationProfile, CommitteeDecision,
)
from apps.accelerator.decision_room import DecisionRoom, tally_committee_votes
from apps.accelerator import views as acc_views
from apps.accelerator.models_os import ProgramStaffMembership


class Roll(Exception):
    pass


User = get_user_model()
factory = APIRequestFactory()
checks = []


def cast_vote(user, payload):
    req = Request(
        factory.post("/api/v1/accelerator/committee/cast-vote/", payload, format="json"),
        parsers=[JSONParser()],
    )
    req.user = user
    vs = acc_views.CommitteeDecisionViewSet()
    vs.request = req
    return vs.cast_vote(req)


with transaction.atomic():
    owner = User.objects.create_user(email="q-founder@x.io", password="x", role="startup")
    r1 = User.objects.create_user(email="q-voter1@x.io", password="x", role="accelerator")
    r2 = User.objects.create_user(email="q-voter2@x.io", password="x", role="accelerator")
    fp = FounderApplicationProfile.objects.create(user=owner, full_name="Q Founder")
    sp = StartupApplicationProfile.objects.create(
        founder_profile=fp, company_name="QuorumCo", declared_stage="seed",
        product_stage="mvp", revenue_status="pre_revenue", sector_tags="fintech",
        industry="payments", geography="NG",
    )
    prog = AcceleratorProgram.objects.create(
        name="Quorum Program", created_by=owner, sector_focus="fintech", stage_focus="seed",
        scoring_rubric_config={"version": "1.0", "dimensions": []},
    )
    # The committee reaches this program through a membership, not through an
    # open door: the owner here is a founder account and is_public is True by
    # default, which used to be enough to read every program's records.
    for voter in (r1, r2):
        ProgramStaffMembership.objects.create(user=voter, program=prog, role="committee")
    app = AcceleratorApplication.objects.create(
        program=prog, startup_profile=sp, submitted_by=owner, status="COMMITTEE_REVIEW",
    )

    # 1. Empty ballot box: quorum not met, finalize refused with 0 votes.
    t0 = tally_committee_votes(app)
    checks.append(("empty tally has 0 votes", t0["total_votes"] == 0))
    checks.append(("empty tally quorum not met", t0["quorum_met"] is False))
    try:
        DecisionRoom(prog).record_decision(application=app, decision="ACCEPTED", actor=r1, rationale="x")
        checks.append(("0 votes blocks finalize", False))
    except ValueError as exc:
        checks.append(("0 votes blocks finalize", "quorum not met" in str(exc).lower()))
        checks.append(("0-vote message is truthful", "0 of 2" in str(exc)))

    # 2. First ballot via the endpoint: response tally includes the new vote.
    res1 = cast_vote(r1, {"application_id": app.id, "vote": "YES", "conviction_score": 9, "notes": "strong"})
    q1 = res1.data["quorum"]
    checks.append(("first vote returns 1 ballot", q1["total_votes"] == 1))
    checks.append(("first vote not yet quorate", q1["quorum_met"] is False))
    checks.append(("first vote yes count 1", q1["yes"] == 1))

    # 3. 1 of 2 still blocks finalization.
    try:
        DecisionRoom(prog).record_decision(application=app, decision="ACCEPTED", actor=r1, rationale="x")
        checks.append(("1 vote blocks finalize", False))
    except ValueError as exc:
        checks.append(("1 vote blocks finalize", "1 of 2" in str(exc)))

    # 4. Re-voting replaces your own ballot — still one distinct vote.
    res_rv = cast_vote(r1, {"application_id": app.id, "vote": "PASS", "conviction_score": 3})
    qrv = res_rv.data["quorum"]
    checks.append(("re-vote keeps 1 distinct ballot", qrv["total_votes"] == 1))
    checks.append(("re-vote updates the choice", qrv["pass"] == 1 and qrv["yes"] == 0))

    # 5. Invalid vote type rejected.
    res_bad = cast_vote(r2, {"application_id": app.id, "vote": "MAYBE"})
    checks.append(("invalid vote -> 400", res_bad.status_code == 400))

    # 6. Second distinct voter makes quorum.
    res2 = cast_vote(r2, {"application_id": app.id, "vote": "YES", "conviction_score": 7})
    q2 = res2.data["quorum"]
    checks.append(("2 distinct votes meet quorum", q2["total_votes"] == 2 and q2["quorum_met"] is True))
    checks.append(("tally yes=1 pass=1", q2["yes"] == 1 and q2["pass"] == 1))

    # 7. Finalize now succeeds, and a hostile client summary is overridden
    #    by the server-derived counts.
    record = DecisionRoom(prog).record_decision(
        application=app, decision="ACCEPTED", actor=r2, rationale="Committee approves.",
        voting_summary={"yes": 99, "total_votes": 99, "quorum_met": True},
    )
    checks.append(("quorate finalize records", CommitteeDecision.objects.filter(id=record.id).exists()))
    checks.append(("client summary overridden", record.vote_summary["yes"] == 1 and record.vote_summary["total_votes"] == 2))
    app.refresh_from_db()
    checks.append(("status advanced to ACCEPTED", app.status == "ACCEPTED"))

    # 8. Voting is closed once the application is in a terminal status.
    res_closed = cast_vote(r2, {"application_id": app.id, "vote": "PASS"})
    checks.append(("vote after decision -> 400", res_closed.status_code == 400))
    checks.append(("closed message", "voting is closed" in str(res_closed.data.get("error", "")).lower()))

    try:
        raise Roll
    except Roll:
        pass
    transaction.set_rollback(True)

failed = [name for name, ok in checks if not ok]
for name, ok in checks:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{len(checks) - len(failed)}/{len(checks)} quorum smoke checks passed")
raise SystemExit(1 if failed else 0)
