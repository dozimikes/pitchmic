"""Rollback-only smoke: the claim verification loop and the vocabulary around it.

Doctrine under test:

- **`verified` is a human act, not a field.** The states have been on the model
  since the first batch and the readouts that count them have too; nothing in the
  codebase could move a claim off `pending`. A counter that can only ever read
  zero is not a safe counter — it renders as "nothing is wrong with these claims"
  when it means "nobody has looked". Now there is one write path, and it records
  who took the step.
- **The word needs something in hand.** `verified` refuses a claim with nothing
  attached, because that would record only that a button was pressed. Every other
  decision needs its reason in words, including sending a decided claim back to
  `pending` — a silent reopen is indistinguishable from a claim nobody examined.
- **An interview answer is a source, not corroboration.** The founder saying it
  is why the claim exists. If that were enough to verify it, every application
  would verify itself by talking.
- **Attribution lives where the schema can hold it.** `ApplicationClaim` has no
  verifier column, so the readout invents none; the event outbox row carries the
  actor, and the note carries the reason with the name already in the codebase's
  own label.
- **One place says what the buckets are.** The open/decided/contradicted
  definitions come from `evidence_state`, and the source scan at the end fails if
  a status literal is re-typed into a view.
"""
import os
import uuid
from pathlib import Path

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import transaction
from django.urls import resolve
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accelerator import evidence_state
from apps.accelerator.models import (
    AcceleratorApplication, AcceleratorProgram, ApplicationClaim, ApplicationDocument,
    FounderApplicationProfile, StartupApplicationProfile,
)
from apps.accelerator.models_config import EventOutbox
from apps.accelerator.models_os import ProgramStaffMembership
from apps.accelerator.serializers import ApplicationClaimSerializer
from apps.accelerator.tenant import (
    scope_rows_to_visible_programs, tenant_programs,
)
from apps.accelerator.views_intel import ApplicationClaimViewSet

from django.contrib.auth import get_user_model

User = get_user_model()
factory = APIRequestFactory()
checks = []
BASE = "/api/v1/accelerator/claims/"


def ok(name, cond):
    checks.append((name, bool(cond)))


def call(claim, method, user, payload=None, code=None):
    """Send the request down the routed URL; return (response, exception).

    Routed rather than hand-built, because a direct viewset call skips
    `initial()` — so the permission class never runs and a serializer refusal
    arrives as a Python exception instead of the 400 a client sees. Both of
    those are the thing under test here: who may take this step, and what a
    refusal actually says.
    """
    path = f"{BASE}{claim.pk}/" + (
        code if code is not None else ("verification/" if method == "post" else ""))
    req = (getattr(factory, method)(path) if payload is None
           else getattr(factory, method)(path, payload, format="json"))
    force_authenticate(req, user=user)
    route = resolve(path)
    try:
        return route.func(req, *route.args, **route.kwargs), None
    except Exception as exc:  # noqa: BLE001 - a crash is a finding, not a pass
        return None, exc


def listed(user, query=""):
    """GET the claims collection the way a client does, for the list-scope checks."""
    path = BASE + query
    req = factory.get(path)
    force_authenticate(req, user=user)
    route = resolve(path)
    try:
        return route.func(req, *route.args, **route.kwargs), None
    except Exception as exc:  # noqa: BLE001 - a crash is a finding, not a pass
        return None, exc


def claims_of(app):
    return list(ApplicationClaim.objects.filter(application=app).order_by("pk"))


def as_request(user, path):
    """A DRF request carrying this user, for the checks made below the view.

    The permission class and the scoper are two different pieces of work, and a
    status code only proves the first one ran.
    """
    req = Request(factory.get(path), parsers=[JSONParser()])
    req.user = user
    return req


def claims_reachable_by(user):
    return {c.pk for c in scope_rows_to_visible_programs(
        ApplicationClaim.objects.all(), as_request(user, BASE),
        "application__program")}


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]

    def make_user(who, kind="accelerator"):
        return User.objects.create_user(
            email=f"verify-{who}-{tag}@x.io", password="x", role=kind,
            first_name=who.title(), last_name="Seat")

    owner = make_user("owner")
    reviewer = make_user("reviewer")
    rival = make_user("rival")
    founder = make_user("founder", kind="startup")
    founder_profile = FounderApplicationProfile.objects.create(
        user=founder, full_name=founder.full_name)

    prog = AcceleratorProgram.objects.create(
        name=f"Verify Program {tag}", slug=f"verify-{tag}",
        organization_name="Northstar", created_by=owner, is_public=False,
        sector_focus="fintech", stage_focus="seed",
    )
    away = AcceleratorProgram.objects.create(
        name=f"Verify Away {tag}", slug=f"verify-away-{tag}",
        organization_name="Otherlab", created_by=rival, is_public=False,
        sector_focus="healthtech", stage_focus="seed",
    )
    ProgramStaffMembership.objects.create(user=reviewer, program=prog, role="committee")

    def make_app(program, company, submitter=None, profile=None):
        """One founder, one canonical profile, applications as needed.

        `FounderApplicationProfile` is OneToOne with the account, so two programs
        see two company snapshots of the same human — which is the shape the rest
        of the system assumes.
        """
        startup = StartupApplicationProfile.objects.create(
            founder_profile=profile or founder_profile, company_name=company,
            declared_stage="seed", sector_tags="fintech", geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=program, startup_profile=startup,
            submitted_by=submitter or founder, status="SUBMITTED")

    app = make_app(prog, "VerifyCo")
    away_app = make_app(away, "VerifyCo")

    doc = ApplicationDocument.objects.create(
        application=app, document_type="lois",
        file_url="https://files.test/signed-loi-pack.pdf",
        file_name="signed-loi-pack.pdf")
    with_doc = ApplicationClaim.objects.create(
        application=app, claim_text="We have 100 signed LOIs", category="revenue",
        materiality="high", source="document", source_document=doc,
        verification_status=evidence_state.PENDING)
    bare = ApplicationClaim.objects.create(
        application=app, claim_text="Revenue doubled every quarter", category="revenue",
        materiality="high", source="application_answer",
        verification_status=evidence_state.PENDING)

    # ── 1. The vocabulary is the model's ─────────────────────────────────────
    ok("the module states exactly the states the column can hold",
       evidence_state.LABELS == dict(
           ApplicationClaim._meta.get_field("verification_status").choices))
    ok("open and decided are disjoint",
       not set(evidence_state.OPEN_STATES) & set(evidence_state.DECIDED_STATES))
    ok("...and together with `flagged` they are the whole vocabulary",
       set(evidence_state.OPEN_STATES) | set(evidence_state.DECIDED_STATES)
       | {evidence_state.FLAGGED} == set(evidence_state.STATES))
    ok("every human-settled state demands either evidence or a reason",
       set(evidence_state.HUMAN_DECIDED_STATES)
       <= set(evidence_state.NOTE_REQUIRED_STATES)
       | set(evidence_state.EVIDENCE_REQUIRED_STATES))

    # ── 2. Read is a tenant read ────────────────────────────────────────────
    # Every check here demands the status code itself. A crash is not a refusal,
    # and an assertion written as "no response, or 404" passes on a 500.
    resp, exc = call(with_doc, "get", owner)
    ok("the program's own account reads the claim",
       exc is None and resp.status_code == status.HTTP_200_OK
       and resp.data["id"] == with_doc.pk)
    resp, exc = call(with_doc, "get", reviewer)
    ok("...and so does a seated committee member, which is the point of a seat",
       exc is None and resp.status_code == status.HTTP_200_OK)
    resp, exc = call(with_doc, "get", rival)
    ok("a rival account does not read it — the claim answers as not there",
       exc is None and resp.status_code == status.HTTP_404_NOT_FOUND)
    resp, exc = call(with_doc, "get", founder)
    ok("the founder whose claim it is cannot read the operating-side ledger — the "
       "wrong side of the door, so 403 rather than the 404 a rival gets",
       exc is None and resp.status_code == status.HTTP_403_FORBIDDEN)
    resp, exc = call(with_doc, "post", founder, {
        "state": "verified", "note": "I have the receipts."})
    ok("...and cannot verify their own claim, which is the same refusal one layer "
       "deeper",
       exc is None and resp.status_code == status.HTTP_403_FORBIDDEN)
    ok("...and the attempt left the claim exactly where ingestion put it",
       ApplicationClaim.objects.filter(
           pk=with_doc.pk, verification_status=evidence_state.PENDING).exists())

    # The leak this route was born with, stated as a case rather than a rule:
    # `tenant_programs` gives an account on the founder side every program open
    # for intake — right for the form they fill in, wrong for the diligence ledger
    # behind it. Read those two together and a founder's own session could list
    # every public program's claims, other founders' applications and the notes a
    # reviewer wrote about them included.
    open_prog = AcceleratorProgram.objects.create(
        name=f"Verify Open {tag}", slug=f"verify-open-{tag}",
        organization_name="Northstar", created_by=owner, is_public=True,
        sector_focus="fintech", stage_focus="seed")
    stranger = make_user("stranger", kind="startup")
    stranger_profile = FounderApplicationProfile.objects.create(
        user=stranger, full_name=stranger.full_name)
    stranger_app = make_app(open_prog, "StrangerCo", submitter=stranger,
                            profile=stranger_profile)
    stranger_claim = ApplicationClaim.objects.create(
        application=stranger_app, claim_text="We are already profitable",
        category="revenue", materiality="high", source="application_answer",
        verification_status=evidence_state.PENDING)
    resp, exc = call(stranger_claim, "get", founder)
    ok("one founder cannot read another founder's claim out of a program that is "
       "open for intake",
       exc is None and resp.status_code == status.HTTP_403_FORBIDDEN)
    resp, exc = listed(founder)
    ok("...nor the ledger as a whole, which is where the widened read actually bit",
       exc is None and resp.status_code == status.HTTP_403_FORBIDDEN)
    # Two layers refuse now, and both are worth asserting because they answer to
    # different callers. The door stops an HTTP request; the scoper below it is
    # what a readout that never asks the role question — a count on a screen, an
    # export, a batch job — would have leaned on. The middle check says the reach
    # rule on its own was genuinely too wide, so the bottom one is not decoration.
    ok("...and the reach rule alone would still have admitted them, so this is "
       "closed by role and not by scope",
       tenant_programs(founder).filter(pk=open_prog.pk).exists())
    ok("...while the scoper itself hands a founder nothing to count",
       not claims_reachable_by(founder))
    ok("...and hands the program's own account the rows it works on",
       claims_reachable_by(owner) >= {c.pk for c in claims_of(app)})
    # The list is a second, separate leak: `get_object` can be scoped correctly
    # while `get_queryset` for the collection is not. Both accounts here hold a
    # couple of rows, so page one is the whole set — the check is containment,
    # because the dev database has real claims in it and an empty-list assertion
    # would be a claim about the world, not about this code.
    mine = {c.pk for c in claims_of(app)}
    resp, exc = listed(owner)
    ok("the collection is scoped the same way — the owner's page holds their claims",
       exc is None and resp.status_code == 200
       and mine <= {r["id"] for r in resp.data["results"]})
    resp, exc = listed(rival)
    ok("...and a rival's page holds none of them",
       exc is None and resp.status_code == 200
       and not mine & {r["id"] for r in resp.data["results"]})

    # ── 3. There is no way to set the state without recording the act ───────
    # Tested through the real URLconf rather than a hand-built view map: what a
    # client can do is decided by what the router registered, and a check that
    # asks the viewset nicely would pass on a route that only exists in the test.
    route = resolve(f"{BASE}{with_doc.pk}/")
    # `actions` is the verb→handler map the router bound, and HEAD rides along with
    # GET. What must not appear is a verb that reaches the row.
    ok("the routed claim answers reads only — no verb on it reaches the row",
       set(getattr(route.func, "actions", {}) or {}) == {"get", "head"}
       and set(route.func.actions.values()) == {"retrieve"})
    ok("...and the view behind that URL is the claim viewset itself, so the check "
       "above is about this resource and not a placeholder answering the path",
       getattr(route.func, "cls", None) is ApplicationClaimViewSet)
    req = factory.patch(f"{BASE}{with_doc.pk}/",
                        {"verification_status": "verified"}, format="json")
    force_authenticate(req, user=owner)
    ok("...so a PATCH asserting the state is refused before it reaches the row",
       route.func(req, *route.args, **route.kwargs).status_code
       == status.HTTP_405_METHOD_NOT_ALLOWED)
    writable = {n for n, f in ApplicationClaimSerializer().get_fields().items()
                if not f.read_only}
    ok("...and the read serializer does not carry the verification columns as writable",
       not {"verification_status", "verified_at", "discrepancy_notes",
            "evidence_status"} & writable)

    # ── 3b. The readout carries the offer, in the server's own words ─────────
    # A screen that keeps its own copy of the state list is how a button ends up
    # offering `verified` on a claim with nothing attached — the client's list
    # drifts from the model's, and the refusal then arrives after the click.
    resp, exc = call(with_doc, "get", reviewer)
    offered = {c["value"]: c for c in (resp.data["verification_choices"] if resp else [])}
    ok("the claim row arrives with the states the model actually carries",
       exc is None and set(offered) == set(evidence_state.STATES))
    ok("...and in the model's order, so a dropdown reads top-to-bottom as the "
       "ledger does",
       [c["value"] for c in resp.data["verification_choices"]]
       == list(evidence_state.STATES))
    ok("...and each one is labelled with the model's own wording",
       all(offered[code]["label"] == evidence_state.label(code)
           for code in offered))
    ok("`verified` is the one state whose precondition is a thing rather than a "
       "sentence",
       offered[evidence_state.VERIFIED]["needs_evidence"] is True
       and offered[evidence_state.VERIFIED]["needs_note"] is False)
    ok("...and every other decision asks for the reason in words",
       offered[evidence_state.CONTRADICTED]["needs_note"] is True
       and offered[evidence_state.PENDING]["needs_note"] is True
       and offered[evidence_state.PENDING]["needs_evidence"] is False)
    ok("on this claim the document it was extracted from is named as what is in "
       "hand",
       offered[evidence_state.VERIFIED]["evidence_attached"]
       == ["the document it was extracted from"])

    unsourced = ApplicationClaim.objects.create(
        application=app, claim_text="We grew 40% last quarter", category="revenue",
        materiality="medium", source="application_answer",
        verification_status=evidence_state.PENDING)
    resp, exc = call(unsourced, "get", reviewer)
    offered_bare = {c["value"]: c for c in resp.data["verification_choices"]}
    ok("a claim with nothing attached says so, rather than offering a free `verified`",
       exc is None and offered_bare[evidence_state.VERIFIED]["needs_evidence"] is True
       and offered_bare[evidence_state.VERIFIED]["evidence_attached"] == [])
    ok("and the reading account is told whether it may decide, so the control and "
       "the request cannot disagree",
       resp.data["may_verify"] is True)
    bare_row = ApplicationClaimSerializer(with_doc).data
    ok("serialised outside a request the answer is null — unknown, not a refusal",
       bare_row["may_verify"] is None)

    # ── 4. A decision needs its reason ──────────────────────────────────────
    resp, exc = call(with_doc, "post", reviewer, {"state": "contradicted"})
    ok("contradicted without a reason is refused, by field name",
       exc is None and resp.status_code == 400 and "note" in resp.data)
    with_doc.refresh_from_db()
    ok("...and the claim is still where ingestion left it",
       with_doc.verification_status == evidence_state.PENDING
       and with_doc.discrepancy_notes == "")
    resp, exc = call(with_doc, "post", reviewer, {"state": "not-a-state"})
    ok("a state the model does not carry is refused, and the refusal lists the real ones",
       exc is None and resp.status_code == 400 and "contradicted" in str(resp.data))

    resp, exc = call(with_doc, "post", reviewer, {
        "state": "contradicted", "note": "Only 61 of the 100 are signed and current."})
    with_doc.refresh_from_db()
    ok("with the reason given, a seated reviewer settles the claim",
       exc is None and resp is not None and resp.status_code == 200
       and with_doc.verification_status == evidence_state.CONTRADICTED)
    ok("...the note is kept with its author and date, not alone",
       "61 of the 100" in with_doc.discrepancy_notes
       and reviewer.full_name in with_doc.discrepancy_notes)
    ok("...the timestamp says a human settled it",
       with_doc.verified_at is not None and with_doc.verified_at <= timezone.now())
    event = EventOutbox.objects.filter(event_type="claim_verification_recorded",
                                       application=app).order_by("-id").first()
    ok("the outbox names who decided, which the row cannot",
       event is not None and event.actor_id == reviewer.pk
       and event.payload["from"] == evidence_state.PENDING
       and event.payload["to"] == evidence_state.CONTRADICTED)
    ok("...and it names the program, so the audit trail is scoped like the data",
       event.program_id == prog.pk)

    # ── 5. `verified` needs something in hand ───────────────────────────────
    resp, exc = call(bare, "post", owner, {"state": "verified"})
    ok("a claim with nothing attached cannot be verified, so the word means something",
       exc is None and resp.status_code == 400 and "state" in resp.data)
    ok("...and the refusal says what to attach rather than failing quietly",
       "attached" in str(resp.data.get("state", "")))
    resp, exc = call(with_doc, "post", owner, {"state": "verified"})
    with_doc.refresh_from_db()
    ok("the same claim with a document behind it can be, and a note stays optional there",
       exc is None and resp is not None and resp.status_code == 200
       and with_doc.verification_status == evidence_state.VERIFIED)
    ok("...and the earlier reason is still on the row, below the new one",
       with_doc.discrepancy_notes.count("61 of the 100") == 1)

    # ── 6. Reopening is a decision too ──────────────────────────────────────
    resp, exc = call(with_doc, "post", owner, {"state": evidence_state.PENDING})
    ok("sending a settled claim back needs a reason",
       exc is None and resp.status_code == 400 and "note" in resp.data)
    resp, exc = call(with_doc, "post", owner, {
        "state": evidence_state.PENDING,
        "note": "Founder sent the countersigned pack; needs a fresh look."})
    with_doc.refresh_from_db()
    ok("with the reason it is allowed, and the settlement stamp goes with the decision",
       exc is None and resp is not None and resp.status_code == 200
       and with_doc.verification_status == evidence_state.PENDING
       and with_doc.verified_at is None)
    resp, exc = call(bare, "post", owner, {
        "state": evidence_state.PENDING, "note": "Undo nothing."})
    ok("...and reopening a claim nobody ever decided is refused as the no-op it is",
       exc is None and resp.status_code == 400)

    # ── 7. Reach, from the other side ───────────────────────────────────────
    rival_claim = ApplicationClaim.objects.create(
        application=away_app, claim_text="Patent granted", category="ip",
        materiality="high", source="application_answer",
        verification_status=evidence_state.PENDING)
    resp, exc = call(rival_claim, "post", owner, {
        "state": "flagged", "note": "Check the registry."})
    ok("another program cannot settle a claim it cannot even read",
       exc is None and resp.status_code == status.HTTP_404_NOT_FOUND)
    ok("...and the refusal wrote no event for it",
       not EventOutbox.objects.filter(application=away_app,
                                      event_type="claim_verification_recorded").exists())
    resp, exc = call(with_doc, "post", reviewer, {
        "state": "flagged", "note": "Second reader please."})
    ok("a seated reviewer may flag, which is work rather than configuration",
       exc is None and resp is not None and resp.status_code == 200)
    ok("...and the flag is the model's own word for the state",
       resp.data["verification_status"] == evidence_state.FLAGGED
       and evidence_state.label(evidence_state.FLAGGED) == "Flagged")

    # ── 8. The literals do not come back ────────────────────────────────────
    root = Path(os.path.dirname(os.path.abspath(__file__))).parent / "apps" / "accelerator"
    drifted = []
    for path in sorted(root.glob("*.py")):
        if path.name in {"evidence_state.py"}:
            continue
        text = path.read_text(encoding="utf-8")
        if '"pending", "unverified"' in text or "verification_status__in=" in text:
            drifted.append(path.name)
    ok("no view re-types the open bucket; the question is asked in one place",
       drifted == [])

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
