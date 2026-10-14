"""Rollback-only smoke: document filing records what happened, nothing more.

Doctrine under test:
- A file arriving is not a fact being confirmed. This endpoint has no parser,
  so it may not produce counts, confidences or a verification outcome — it
  records that a founder filed something against a claim, and leaves the
  checking to a named human.
- Missing is not zero. A document that backs no declared figure carries no
  number, and no ClaimEvidence row is written, because that row's counters
  default to 0 and a 0 nobody measured reads to the committee as "checked,
  found none".
- A claim's category has to be one the taxonomy actually has.
- **The extraction port says when nothing stands behind it.** `extraction_status`
  is a column on a four-step pipeline, and this deployment has no parser, so a
  screen that renders it as a step reports a queue nobody started. The port is
  asked first, and its absence is a named failure rather than an empty list — an
  empty list is a finding ("read it, nothing material in it") and the two are not
  interchangeable.
- **The engine's states do not import as decisions.** `intelligence_engine` has
  its own five-word verification vocabulary, and its `verified` and `contradicted`
  are reachable by a rule with no reviewer in the loop. A fact arriving from there
  starts an open claim and nothing more.
"""
import os
import shutil
import tempfile
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.http import Http404
from django.test import override_settings
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.accelerator import evidence_state
from apps.accelerator import evidence_extraction as extraction
from apps.accelerator import views as acc_views
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationClaim,
    ApplicationDocument,
    ClaimEvidence,
    FounderApplicationProfile,
    StartupApplicationProfile,
)

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def _raises(exc_type, call):
    """True when `call` raises exactly this refusal.

    Used where the check is about *not* answering — a port that returns an empty
    list instead of naming its absence would pass a `== []` assertion while
    teaching the next screen to lie.
    """
    try:
        call()
    except exc_type:
        return True
    except Exception:  # noqa: BLE001 - a different crash is not the refusal asked for
        return False
    return False


def make_request(path, payload=None, user=None):
    inner = (
        factory.post(path)
        if payload is None
        else factory.post(path, payload, format="json")
    )
    req = Request(inner, parsers=[JSONParser()])
    req.user = user
    return req


def file_document(user, app_id, payload):
    """POST /applications/{id}/upload-document/ — Response, or the raised error."""
    req = make_request(f"/api/v1/accelerator/applications/{app_id}/upload-document/", payload, user=user)
    vs = acc_views.AcceleratorApplicationViewSet()
    vs.request = req
    vs.action = "upload_document"
    vs.kwargs = {"pk": str(app_id)}
    vs.format_kwarg = None
    try:
        return vs.upload_document(req, pk=app_id)
    except (ValidationError, PermissionDenied, Http404) as exc:
        return exc


def upload_document(user, app_id, upload, document_type="lois"):
    """Same endpoint, but carrying an actual file part."""
    inner = factory.post(
        f"/api/v1/accelerator/applications/{app_id}/upload-document/",
        {"document_type": document_type, "file": upload},
        format="multipart",
    )
    req = Request(inner, parsers=[MultiPartParser()])
    req.user = user
    vs = acc_views.AcceleratorApplicationViewSet()
    vs.request = req
    vs.action = "upload_document"
    vs.kwargs = {"pk": str(app_id)}
    vs.format_kwarg = None
    return vs.upload_document(req, pk=app_id)


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    staff = User.objects.create_user(email=f"doc-staff-{tag}@x.io", password="x", role="accelerator")
    founder = User.objects.create_user(email=f"doc-founder-{tag}@x.io", password="x", role="startup")
    stranger = User.objects.create_user(email=f"doc-stranger-{tag}@x.io", password="x", role="startup")

    prog = AcceleratorProgram.objects.create(
        name=f"Documents Program {tag}", slug=f"docs-{tag}", created_by=staff,
        sector_focus="fintech", stage_focus="seed",
    )

    silent = User.objects.create_user(email=f"doc-silent-{tag}@x.io", password="x", role="startup")

    def make_app(company, owner, **declare):
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=owner, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", sector_tags="fintech", geography="NG",
            **declare,
        )
        return AcceleratorApplication.objects.create(
            program=prog, startup_profile=sp, submitted_by=owner, status="DD_IN_PROGRESS",
        )

    declared_app = make_app("LoudCo", founder, loi_count=37, mrr_usd=12500,
                            incorporated=True, incorporation_country="Nigeria")
    quiet_app = make_app("QuietCo", silent)           # nothing declared anywhere
    stranger_app = make_app("SomeoneElse", stranger, loi_count=5)

    # ── 1. Filing a document records the filing ──────────────────────────────
    resp = file_document(founder, declared_app.id, {
        "document_type": "lois",
        "file_name": "signed-lois-q3.pdf",
        "file_url": "https://media.test.test/media/accelerator/lois-q3.pdf",
    })
    ok("a founder can file evidence for their own application", resp.status_code == 201)
    doc = ApplicationDocument.objects.get(application=declared_app)
    ok("the document keeps the address it was given, not a made-up one",
       doc.file_url == "https://media.test.test/media/accelerator/lois-q3.pdf")
    ok("and the name it was given", doc.file_name == "signed-lois-q3.pdf")
    ok("extraction is reported as pending, because nothing was parsed",
       doc.extraction_status == "pending" and doc.extracted_at is None)
    ok("and no claims are claimed to have been extracted from the file",
       doc.extracted_claims_count == 0)

    claim = ApplicationClaim.objects.get(source_document=doc)
    ok("filing produces exactly one claim",
       ApplicationClaim.objects.filter(source_document=doc).count() == 1)
    ok("it is pending — the file arriving proved nothing",
       claim.verification_status == "pending")
    ok("nothing was written into verified_value", claim.verified_value == {})
    ok("no forensic narrative was invented", claim.discrepancy_notes == "")
    ok("and no ClaimEvidence row, whose zeroes would read as findings",
       not ClaimEvidence.objects.filter(claim=claim).exists())
    ok("the category is one the taxonomy actually has",
       claim.category in {value for value, _label in ApplicationClaim.CATEGORY_CHOICES})
    ok("a document backing traction is treated as critical", claim.materiality == "critical")
    ok("the evidence is marked provided, which is what actually happened",
       claim.evidence_status == "provided")
    ok("the claim quotes the declared figure from the stored profile",
       "37 letters of intent" in claim.claim_text)
    ok("it attributes the file, and does not say the file proves it",
       "signed-lois-q3.pdf filed as" in claim.claim_text
       and "verified" not in claim.claim_text.lower())
    ok("the founder is the one asserting", claim.founder_asserted is True)

    ok("every document type the model offers has a mapping, so filing one "
       "cannot raise a KeyError",
       {v for v, _l in ApplicationDocument.DOCUMENT_TYPE_CHOICES}
       == set(acc_views.DOCUMENT_CLAIM_KINDS))

    # ── 2. Nothing declared, nothing invented ────────────────────────────────
    quiet_resp = file_document(silent, quiet_app.id, {
        "document_type": "lois",
        "file_url": "https://media.test.test/media/accelerator/unlabelled.pdf",
    })
    ok("a document can still be filed when no figure was declared", quiet_resp.status_code == 201)
    quiet_claim = ApplicationClaim.objects.get(application=quiet_app)
    ok("and the resulting claim carries no number at all",
       not any(ch.isdigit() for ch in quiet_claim.claim_text.replace(quiet_claim.claim_id, "")))
    ok("it says what it is: a file was filed",
       quiet_claim.claim_text.startswith("unlabelled.pdf filed as"))
    ok("the name falls back to the stored path, never to 'Document.pdf'",
       ApplicationDocument.objects.get(application=quiet_app).file_name == "unlabelled.pdf")

    # ── 3. The rest of the taxonomy behaves the same way ─────────────────────
    for doc_type, expect_category in [("incorporation", "regulatory"),
                                      ("financial_model", "revenue"),
                                      ("patents", "ip"),
                                      ("cap_table", "funding"),
                                      ("founder_cv", "team")]:
        before = ApplicationClaim.objects.filter(application=declared_app).count()
        r = file_document(founder, declared_app.id, {
            "document_type": doc_type,
            "file_name": f"{doc_type}.pdf",
            "file_url": f"https://media.test.test/media/accelerator/{doc_type}.pdf",
        })
        made = ApplicationClaim.objects.filter(application=declared_app).count()
        ok(f"{doc_type} files as a claim", r.status_code == 201 and made == before + 1)
        row = ApplicationClaim.objects.filter(application=declared_app).order_by("-id").first()
        ok(f"{doc_type} is categorised {expect_category}, not a made-up label",
           row.category == expect_category)
        ok(f"{doc_type} is never auto-verified", row.verification_status == "pending")
    ok("a declared incorporation country is quoted, not defaulted to a guess",
       "Nigeria" in ApplicationClaim.objects.filter(
           application=declared_app, category="regulatory").first().claim_text)
    ok("and the MRR figure quoted is the one the founder declared",
       "$12,500" in ApplicationClaim.objects.filter(
           application=declared_app, category="revenue").first().claim_text)

    # ── 4. Refusals ──────────────────────────────────────────────────────────
    bad_type = file_document(founder, declared_app.id, {
        "document_type": "vibes", "file_url": "https://media.test.test/x.pdf"})
    ok("an unknown document type is refused", getattr(bad_type, "status_code", None) == 400)
    no_file = file_document(founder, declared_app.id, {"document_type": "lois"})
    ok("a document with neither a file nor an address is refused",
       getattr(no_file, "status_code", None) == 400)
    ok("and no row is written for either refusal",
       ApplicationDocument.objects.filter(application=declared_app).count() == 6)
    ok("no claim came out of the refused calls either",
       ApplicationClaim.objects.filter(application=declared_app).count() == 6)
    intrusion = file_document(stranger, declared_app.id, {
        "document_type": "lois", "file_url": "https://media.test.test/x.pdf"})
    ok("another founder's application is not filed against",
       isinstance(intrusion, Http404))
    own = file_document(stranger, stranger_app.id, {
        "document_type": "lois", "file_url": "https://media.test.test/mine.pdf"})
    ok("but a founder may still file for the application they submitted",
       own.status_code == 201)

    # ── 5. A real upload is stored, and its own address is what gets recorded ─
    tmp_media = tempfile.mkdtemp(prefix="pitchmic-smoke-media-")
    try:
        with override_settings(MEDIA_ROOT=tmp_media, ALLOWED_HOSTS=["testserver"]):
            uploaded = SimpleUploadedFile("term-sheet.pdf", b"%PDF-1.4 smoke",
                                          content_type="application/pdf")
            up_resp = upload_document(silent, quiet_app.id, uploaded)
        ok("an actual file part is accepted", up_resp.status_code == 201)
        up_doc = ApplicationDocument.objects.filter(application=quiet_app).order_by("-id").first()
        ok("it is stored under this application's own folder, not a fabricated "
           "bucket URL",
           f"{settings.MEDIA_URL}accelerator/applications/{quiet_app.id}/" in up_doc.file_url
           and "pitchmic.storage" not in up_doc.file_url)
        stored = os.path.join(tmp_media, up_doc.file_url.split(settings.MEDIA_URL, 1)[-1])
        ok("and the bytes really are on disk", os.path.exists(stored))
        ok("the displayed name is the one the founder sent, not a placeholder",
           up_doc.file_name == "term-sheet.pdf")
        ok("the size recorded is the size sent", up_doc.file_size_bytes == len(b"%PDF-1.4 smoke"))
        ok("and the mime type is the one the upload carried",
           up_doc.mime_type == "application/pdf")
        up_claim = ApplicationClaim.objects.get(source_document=up_doc)
        ok("storing a file still verifies nothing",
           up_claim.verification_status == "pending" and up_claim.verified_value == {})
    finally:
        shutil.rmtree(tmp_media, ignore_errors=True)
    ok("the endpoint stays open to the submitting founder — no staff-only "
       "permission was bolted onto the action",
       acc_views.AcceleratorApplicationViewSet.upload_document.kwargs.get("permission_classes") is None
       and acc_views.AcceleratorApplicationViewSet.permission_classes == [IsAuthenticated])

    # ── 6. The extraction port ───────────────────────────────────────────────
    ok("nothing stands behind the port in this deployment",
       not extraction.has_extractors())
    raised = None
    try:
        extraction.extract_from(doc)
    except extraction.EvidenceExtractionUnavailable as exc:
        raised = exc
    ok("so reading a document through it is a named failure, not an empty list",
       raised is not None)
    ok("...and the failure names the document type it could not read",
       raised is not None and "lois" in str(raised))

    state = extraction.extraction_state(doc)
    ok("the readout carries the column and its meaning together",
       state["status"] == "pending" and state["label"] == "Pending")
    ok("...and says out loud that no queue is coming",
       state["can_extract"] is False and "No extractor is wired" in state["detail"])

    ok("a statement cannot be filed under a category the taxonomy does not have",
       _raises(ValueError, lambda: extraction.ExtractedStatement(
           text="MRR is 12,500 dollars", category="vibes", materiality="high")))
    ok("...nor under a materiality it does not have",
       _raises(ValueError, lambda: extraction.ExtractedStatement(
           text="MRR is 12,500 dollars", category="revenue", materiality="extreme")))
    ok("...and it cannot be empty, which would be a word spent on nothing",
       _raises(ValueError, lambda: extraction.ExtractedStatement(
           text="   ", category="revenue", materiality="high")))

    class _ProbeExtractor:
        name = "probe"

        def can_read(self, document):
            return document.document_type == "lois"

        def extract(self, document):
            return [extraction.ExtractedStatement(
                text="61 LOIs listed on page 3", category="commercial_traction",
                materiality="critical", locator="page 3")]

    probe = _ProbeExtractor()
    extraction.register(probe)
    try:
        ok("a wired extractor is visible in the port, not assumed by a screen",
           extraction.has_extractors() and extraction.extraction_state(doc)["can_extract"] is True)
        ok("...and it reads the document it claims", len(extraction.extract_from(doc)) == 1)
        before = ApplicationClaim.objects.filter(application=declared_app).count()
        wired = file_document(founder, declared_app.id, {
            "document_type": "lois",
            "file_name": "wired-lois.pdf",
            "file_url": "https://media.test.test/media/accelerator/wired-lois.pdf",
        })
        made = ApplicationClaim.objects.filter(application=declared_app)
        ok("an upload through a wired extractor files what it found",
           wired.status_code == 201 and made.count() == before + 2)
        extracted = made.order_by("-id").first()
        ok("...as a claim that is open, because reading a file is not checking it",
           extracted.claim_text == "61 LOIs listed on page 3"
           and extracted.verification_status == "pending")
        ok("...and the document says complete with the count it actually filed",
           ApplicationDocument.objects.get(pk=wired.data["id"]).extraction_status == "complete"
           and ApplicationDocument.objects.get(pk=wired.data["id"]).extracted_claims_count == 1)
        ok("the filing itself is still recorded alongside it",
           made.filter(claim_text__contains="wired-lois.pdf filed as").exists())
        other = file_document(founder, declared_app.id, {
            "document_type": "patents", "file_url": "https://media.test.test/p.pdf"})
        ok("a document the wired extractor does not claim is still filed, unread",
           other.status_code == 201
           and ApplicationDocument.objects.get(pk=other.data["id"]).extraction_status == "pending")
    finally:
        extraction.unregister(probe)
    ok("and the port goes back to empty when the probe leaves",
       not extraction.has_extractors())

    # ── 7. The vocabulary next door ──────────────────────────────────────────
    ok("the engine's states are read off its own field, not copied here",
       set(evidence_state.engine_states()) == {
           "extracted", "verified", "contradicted", "stale", "rejected"})
    ok("...so a code the engine does not carry is refused by name",
       _raises(evidence_state.UnmappableState,
               lambda: evidence_state.from_engine("fully_checked")))
    imported = {code: evidence_state.from_engine(code)
                for code in evidence_state.engine_states()}
    ok("every engine state arrives as one open claim, and no other state",
       set(imported.values()) == {evidence_state.PENDING})
    ok("...including its `verified`, which a rule can reach with no reviewer in "
       "the room",
       imported["verified"] == evidence_state.PENDING)
    ok("...and the state it arrives as is not one of the human-decided ones",
       evidence_state.ENGINE_IMPORT_STATE not in evidence_state.HUMAN_DECIDED_STATES)
    ok("the engine's own wording is still available as provenance",
       evidence_state.engine_label("stale") == "Stale - superseded by newer fact")

    ok("a human's `verified` crosses outward",
       evidence_state.to_engine(evidence_state.VERIFIED) == "verified")
    ok("...and so does `contradicted`",
       evidence_state.to_engine(evidence_state.CONTRADICTED) == "contradicted")
    for local in (evidence_state.UNVERIFIED, evidence_state.PARTIALLY_VERIFIED,
                  evidence_state.FLAGGED):
        ok(f"`{local}` has no engine word and refuses rather than rounding to the "
           "nearest one",
           _raises(evidence_state.UnmappableState,
                   lambda code=local: evidence_state.to_engine(code)))
    ok("...and a value that is not a state at all is refused the same way",
       _raises(evidence_state.UnmappableState, lambda: evidence_state.to_engine("done")))
    ok("the outward map only ever points at words the engine actually carries",
       set(evidence_state.TO_ENGINE.values()) <= set(evidence_state.engine_states()))
    ok("and everything it maps from is a state this ledger declares",
       set(evidence_state.TO_ENGINE) <= set(evidence_state.STATES))

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
