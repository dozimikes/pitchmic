"""Rollback-only smoke: interview transcript capture and interview-sourced claims.

Doctrine under test:
- A transcript is evidence about who said what, so the speaker is a chosen
  field, the clock is the server's, and the line can only be appended. A
  reviewer who could rewind or overwrite a turn could move a founder's
  sentence to a different moment.
- Writing a transcript down is a staff act. A founder must not be able to
  author what "the founder said" on someone else's session.
- Recording an interview answer as a claim is a human decision about what was
  an assertion worth checking. The claim lands unverified, citing the session
  and the turn number, and enters the same evidence graph as every deck claim.
- Nothing is invented from a line that does not exist: a claim can only cite a
  turn already on the transcript, and citing the same turn twice is refused.
- Missing is not zero and not a verdict: a session with no transcript reads as
  no turns on record, and an interview claim carries no more trust than the
  sentence it came from.
"""
import os
import uuid
from datetime import datetime, timedelta
from datetime import datetime, timedelta

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accelerator import views as acc_views
from apps.accelerator import views_intel as acc_intel
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAuditEvent,
    ApplicationClaim,
    FounderApplicationProfile,
    InterviewSession,
    StartupApplicationProfile,
)
from apps.accelerator.permissions import IsAcceleratorOrStaff
from apps.accelerator.serializers import InterviewSessionSerializer

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
    inner = (
        getattr(factory, method)(path)
        if payload is None
        else getattr(factory, method)(path, payload, format="json")
    )
    req = Request(inner, parsers=[JSONParser()])
    if user is not None:
        req.user = user
    return req


def write_transcript(user, session_id, payload):
    """POST /interviews/{id}/transcript/ through the routed view, so the
    @action(permission_classes=…) the router passes to as_view() is what runs."""
    return routed(user, "transcript", "capture_transcript", session_id, payload)


def claim_from_turn(user, session_id, payload):
    return routed(user, "record-claim", "record_transcript_claim", session_id, payload)


def routed(user, url_path, method_name, session_id, payload):
    inner = factory.post(f"/api/v1/accelerator/interviews/{session_id}/{url_path}/",
                         payload, format="json")
    force_authenticate(inner, user=user)
    action_func = getattr(acc_views.InterviewSessionViewSet, method_name)
    view = acc_views.InterviewSessionViewSet.as_view(
        {"post": method_name}, **action_func.kwargs)
    return view(inner, pk=session_id)


def graph_of(user, app_id):
    req = make_request("get", f"/api/v1/accelerator/evidence-graph/?application_id={app_id}", user=user)
    view = acc_intel.EvidenceGraphView()
    view.request = req
    view.format_kwarg = None
    try:
        return view.get(req)
    except (ValidationError, PermissionDenied) as exc:
        return exc


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    interviewer = User.objects.create_user(email=f"tx-int-{tag}@x.io", password="x",
                                           role="accelerator", first_name="Iru", last_name="Interviewer")
    founder = User.objects.create_user(email=f"tx-founder-{tag}@x.io", password="x", role="startup")
    other_founder = User.objects.create_user(email=f"tx-other-{tag}@x.io", password="x", role="startup")

    prog = AcceleratorProgram.objects.create(
        name=f"Transcript Program {tag}", slug=f"tx-{tag}", created_by=interviewer,
        sector_focus="fintech", stage_focus="seed",
    )

    def make_app(company, owner):
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=owner, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", sector_tags="fintech", geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=prog, startup_profile=sp, submitted_by=owner, status="INTERVIEW_SCHEDULED",
        )

    app = make_app("TalkTrack Co", founder)
    elsewhere = make_app("Quiet Co", other_founder)

    session = InterviewSession.objects.create(
        application=app, interview_type="human_video", round_number=1,
        interviewer=interviewer, status="scheduled",
    )
    other_session = InterviewSession.objects.create(
        application=elsewhere, interview_type="human_video", round_number=1,
        interviewer=interviewer, status="scheduled",
    )

    # ── 1. The append rule lives in one place, and it is the model's ─────────
    resp = write_transcript(interviewer, session.id, {"turns": [
        {"speaker": "interviewer", "text": "What did revenue look like last quarter?"},
        {"speaker": "founder", "text": "We closed the quarter at 42,000 dollars of MRR."},
    ]})
    ok("program staff can write a transcript down", isinstance(resp.status_code, int) and resp.status_code == 201)
    session.refresh_from_db()
    ok("two turns are on record", len(session.transcript) == 2)
    ok("turns are numbered from zero in the order they arrived",
       [t["turn"] for t in session.transcript] == [0, 1])
    ok("the speaker travels with the sentence",
       session.transcript[1]["speaker"] == "founder")
    ok("the timestamp is the server's, not something a client supplied",
       # the payload carried only speaker and text, yet every turn is stamped
       set(session.transcript[0]) == {"turn", "speaker", "text", "timestamp",
                                      "recorded_by", "recorded_by_id"}
       and datetime.fromisoformat(session.transcript[0]["timestamp"]).tzinfo is not None
       and abs(timezone.now() - datetime.fromisoformat(session.transcript[0]["timestamp"]))
       < timedelta(minutes=5))
    ok("who typed it up is recorded separately from who spoke",
       session.transcript[0]["recorded_by"] == "Iru Interviewer"
       and session.transcript[0]["recorded_by_id"] == interviewer.id)
    ok("a transcript on record means the session is no longer merely booked",
       session.status == "in_progress")
    ok("the response says how much is on record",
       resp.data["transcript_turns"] == 2 and resp.data["turns_added"] == 2)

    second = write_transcript(interviewer, session.id, {"turns": [
        {"speaker": "team_member", "text": "Two of those deals were renewals, not new logos."},
    ]})
    session.refresh_from_db()
    ok("a second write appends rather than replaces", len(session.transcript) == 3)
    ok("earlier turns keep their numbering and their text",
       session.transcript[0]["text"].startswith("What did revenue")
       and session.transcript[1]["text"].startswith("We closed"))
    ok("the new turn continues the sequence", session.transcript[2]["turn"] == 2)
    ok("and is attributed to whoever spoke it",
       second.data["session"]["transcript"][-1]["speaker"] == "team_member")

    audit = ApplicationAuditEvent.objects.filter(
        application=app, action_type="interview_transcript_recorded").first()
    ok("writing a transcript down is in the audit ledger", audit is not None)
    ok("the audit counts what was added", audit is not None and "2 turns" in audit.reason)
    ok("a transcript event is a human act, not automated screening",
       audit is not None and audit.is_automated is False)
    ok("a transcript event moves no stage", audit is not None and audit.from_stage == audit.to_stage)

    # ── 2. Refusals on the way in ────────────────────────────────────────────
    bad_speaker = write_transcript(interviewer, session.id, {"turns": [
        {"speaker": "the market", "text": "MRR is fine."}]})
    ok("an invented speaker is refused — attribution is the point",
       getattr(bad_speaker, "status_code", None) == 400)
    ok("and nothing was stored for it",
       len(InterviewSession.objects.get(pk=session.id).transcript) == 3)
    blank = write_transcript(interviewer, session.id, {"turns": [{"speaker": "founder", "text": "   "}]})
    ok("an empty turn records nothing and is refused", blank.status_code == 400)
    empty = write_transcript(interviewer, session.id, {"turns": []})
    ok("an empty transcript write is refused", empty.status_code == 400)
    not_list = write_transcript(interviewer, session.id, {"turns": "we talked"})
    ok("turns must be turns, not a blob", not_list.status_code == 400)
    oversized = write_transcript(interviewer, session.id, {"turns": [
        {"speaker": "founder", "text": "x" * 4001}]})
    ok("an over-long turn is refused", oversized.status_code == 400)
    flood = write_transcript(interviewer, session.id,
                             {"turns": [{"speaker": "founder", "text": f"t{i}"} for i in range(101)]})
    ok("one write cannot flood the transcript", flood.status_code == 400)
    mixed = write_transcript(interviewer, session.id, {"turns": [
        {"speaker": "founder", "text": "a real line"}, {"speaker": "ghost", "text": "another"}]})
    ok("one bad turn rejects the whole batch, so nothing half-lands", mixed.status_code == 400)
    ok("and the transcript is still exactly three turns long",
       len(InterviewSession.objects.get(pk=session.id).transcript) == 3)

    # ── 3. The transcript cannot be rewritten by the generic endpoint ────────
    transcript_field = InterviewSessionSerializer().get_fields()["transcript"]
    ok("transcript is read-only on the session serializer", transcript_field.read_only is True)
    ok("and is listed as read-only so a PATCH cannot even name it",
       "transcript" in InterviewSessionSerializer.Meta.read_only_fields)

    # ── 4. Only staff write transcripts ──────────────────────────────────────
    # @action(permission_classes=…) is not set on the function directly — the
    # router forwards it to as_view(), so it is read out of the action's kwargs.
    ok("the transcript endpoint is staff-only",
       acc_views.InterviewSessionViewSet.capture_transcript.kwargs.get("permission_classes")
       == [IsAcceleratorOrStaff])
    ok("so is the record-a-claim endpoint",
       acc_views.InterviewSessionViewSet.record_transcript_claim.kwargs.get("permission_classes")
       == [IsAcceleratorOrStaff])
    ok("and a founder is refused outright",
       IsAcceleratorOrStaff().has_permission(make_request("post", "/", user=founder), None) is False)
    founder_resp = write_transcript(founder, session.id, {"turns": [{"speaker": "founder", "text": "hi"}]})
    ok("the refusal is a 403, not a silent no-op", founder_resp.status_code == 403)
    ok("and nothing was written by it",
       len(InterviewSession.objects.get(pk=session.id).transcript) == 3)
    founder_claim = claim_from_turn(founder, session.id, {"turn": 1, "category": "revenue",
                                                          "materiality": "high"})
    ok("a founder cannot author what 'the founder said' on their own session either",
       founder_claim.status_code == 403)
    ok("a founder still reads their own session",
       viewset(acc_views.InterviewSessionViewSet,
               make_request("get", "/api/v1/accelerator/interviews/", user=founder), "list"
               ).get_queryset().filter(pk=session.id).exists())
    ok("but never somebody else's",
       not viewset(acc_views.InterviewSessionViewSet,
                   make_request("get", "/api/v1/accelerator/interviews/", user=other_founder), "list"
                   ).get_queryset().filter(pk=session.id).exists())

    # ── 5. A human decides which answer was a claim worth checking ───────────
    resp = claim_from_turn(interviewer, session.id, {
        "turn": 1, "category": "revenue", "materiality": "critical"})
    ok("a transcript line can be recorded as a claim", resp.status_code == 201)
    claim = ApplicationClaim.objects.get(pk=resp.data["id"])
    ok("it arrives unverified — an interview claim is as trustworthy as its sentence",
       claim.verification_status == "pending")
    ok("it is marked as coming from the interview", claim.source == "interview")
    ok("it cites the session it was heard in", claim.source_interview_id == session.id)
    ok("and the exact turn", claim.source_transcript_turn == 1)
    ok("with no statement invented: it defaults to what was said",
       claim.claim_text == session.transcript[1]["text"])
    ok("a founder's own line is the founder asserting", claim.founder_asserted is True)
    ok("and it is flagged as needing evidence", claim.evidence_required is True)
    ok("the claim carries an id", claim.claim_id.startswith("C-"))

    audit = ApplicationAuditEvent.objects.filter(application=app,
                                                 action_type="interview_claim_recorded").first()
    ok("recording a claim from a transcript is audited", audit is not None)
    ok("the audit says it is unverified", audit is not None and "unverified" in audit.reason)
    ok("a claim event moves no stage", audit is not None and audit.from_stage == audit.to_stage)

    dup = claim_from_turn(interviewer, session.id, {"turn": 1, "category": "revenue",
                                                    "materiality": "critical"})
    ok("the same sentence cannot be recorded twice", getattr(dup, "status_code", None) == 409)
    ok("and no second row appeared",
       ApplicationClaim.objects.filter(source_interview=session).count() == 1)

    ghost = claim_from_turn(interviewer, session.id, {"turn": 99, "category": "revenue",
                                                      "materiality": "critical"})
    ok("a claim cannot cite a turn that was never spoken", getattr(ghost, "status_code", None) == 400)
    ok("and the reason says so",
       "does not exist" in str(ghost.data["turn"]) or "not on this session" in str(ghost.data["turn"]))
    bad_cat = claim_from_turn(interviewer, session.id, {"turn": 2, "category": "vibes",
                                                        "materiality": "critical"})
    ok("an unknown category is refused", getattr(bad_cat, "status_code", None) == 400)
    bad_mat = claim_from_turn(interviewer, session.id, {"turn": 2, "category": "team",
                                                        "materiality": "definitely"})
    ok("an unknown materiality is refused", getattr(bad_mat, "status_code", None) == 400)
    interviewer_claim = claim_from_turn(interviewer, session.id, {
        "turn": 0, "statement": "The interviewer asked about quarterly revenue.",
        "category": "other", "materiality": "low"})
    ok("another turn can be recorded too", interviewer_claim.status_code == 201)
    ok("but a reviewer's own line is not the founder asserting",
       ApplicationClaim.objects.get(pk=interviewer_claim.data["id"]).founder_asserted is False)

    session.refresh_from_db()
    write_transcript(interviewer, session.id, {"turns": [{"speaker": "founder", "text": "One more thing."}]})
    reloaded = ApplicationClaim.objects.get(pk=claim.pk)
    ok("a later append does not move what an existing claim cites",
       reloaded.source_transcript_turn == 1
       and session.transcript_turn(1)["text"] == reloaded.claim_text)

    # ── 6. The graph shows where a claim was heard ───────────────────────────
    ApplicationClaim.objects.create(
        application=app, claim_id=f"Z-{tag}", claim_text="We have a patent pending.",
        category="ip", materiality="high", source="application_answer",
        verification_status="pending",
    )
    payload = graph_of(interviewer, app.id)
    ok("the evidence graph still serves", payload.status_code == 200)
    body = payload.data
    by_id = {c["id"]: c for c in body["claims"]}
    heard = by_id[claim.pk]
    ok("an interview claim carries its provenance", heard["interview"] is not None)
    ok("naming the session, round and type",
       heard["interview"]["session_id"] == session.id
       and heard["interview"]["round_number"] == 1
       and heard["interview"]["interview_type"] == "human_video")
    ok("the turn number and who said it",
       heard["interview"]["turn"] == 1 and heard["interview"]["speaker"] == "founder")
    ok("and when it was said, from the stored turn",
       heard["interview"]["said_at"] == session.transcript_turn(1)["timestamp"])
    ok("a deck/application claim carries no interview provenance",
       by_id[[k for k, c in by_id.items() if c["source"] == "application_answer"][0]]["interview"] is None)
    interview_nodes = [n for n in body["graph"]["nodes"] if n["kind"] == "interview"]
    ok("the graph draws the session as one node, not one per claim", len(interview_nodes) == 1)
    ok("and names it after the round", "Round 1" in interview_nodes[0]["label"])
    ok("with the session's own status", interview_nodes[0]["status"] == session.status)
    heard_links = [l for l in body["graph"]["links"] if l["kind"] == "heard_in"]
    ok("every interview-sourced claim is linked from that node",
       {l["target"] for l in heard_links} == {f"claim:{c.pk}" for c in
                                              ApplicationClaim.objects.filter(source_interview=session)})
    ok("and the link points the real way: session to claim",
       all(l["source"] == f"interview:{session.id}" for l in heard_links))
    ok("an application with no transcript reports none, rather than an empty claim",
       graph_of(interviewer, elsewhere.id).data["claims"] == [])

    # ── 7. Counts the panel reads come off stored rows ───────────────────────
    session.refresh_from_db()
    data = InterviewSessionSerializer(session, context={"request": make_request("get", "/", user=interviewer)}).data
    ok("the session says how many turns are on record", data["transcript_turn_count"] == 4)
    ok("and how many claims were recorded out of it", data["claims_recorded_from_it"] == 2)
    ok("a session nothing was written down for reads as zero turns, not missing",
       InterviewSessionSerializer(other_session).data["transcript_turn_count"] == 0)

    # ── 8. A client cannot set the clock, even by sending one ────────────────
    write_transcript(interviewer, session.id, {"turns": [
        {"speaker": "founder", "text": "Backdate me.", "timestamp": "2019-01-01T00:00:00+00:00",
         "turn": 99, "recorded_by": "Somebody Else"}]})
    stamped = InterviewSession.objects.get(pk=session.id).transcript
    last = stamped[-1]
    ok("an extra timestamp in the payload is ignored, not stored",
       not last["timestamp"].startswith("2019"))
    ok("a client cannot choose its own turn number", last["turn"] == 4)
    ok("nor sign the entry as somebody else",
       last["recorded_by"] == "Iru Interviewer" and last["recorded_by_id"] == interviewer.id)
    ok("and the earlier record is untouched",
       [t["turn"] for t in stamped] == [0, 1, 2, 3, 4]
       and stamped[1]["text"].startswith("We closed the quarter"))

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)