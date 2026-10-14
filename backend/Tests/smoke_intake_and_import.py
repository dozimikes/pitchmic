"""Rollback-only smoke: receiving applications from outside the dashboard.

Doctrine under test:

- **A staged submission is not an application.** Nothing posted from a website
  form or a spreadsheet reaches the funnel by itself. The row waits, with the
  gaps it arrived with listed, until a person accepts or dismisses it, and that
  person is recorded.
- **Identity is asserted by a human, not inferred from a third party's data.**
  Accepting opens a founder account that cannot sign in (no password, not
  verified) or reuses the account that email already has. An address supplied by
  an unauthenticated poster never becomes credentials.
- **The intake key is the authority, and it is scoped.** Program and cycle come
  from the key server-side; a sender naming somebody else's program gets the
  cycle the key belongs to. The key is stored hashed and shown once, so sealing
  or rotating it is the only "recovery".
- **A preview writes nothing, and a column is never guessed at.** Unmatched
  headers stay in the payload under the heading they arrived with rather than
  being filed near a similar word, and a mapped-but-absent column reads as
  missing instead of empty-looking-because-invented.
- **Missing is not zero.** A row without an email is reported as lacking one;
  it is not accepted, not dropped, and not counted as if it said something.
"""
import io
import json
import os
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accelerator import intake as intake_lib
from apps.accelerator import views_intake as intake_views
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    FounderApplicationProfile,
)
from apps.accelerator.models_os import ApplicationCycle, ExternalIntakeSubmission
from apps.accelerator.serializers_config import (
    ApplicationCycleSerializer,
    ExternalIntakeSubmissionSerializer,
)

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


def make_program(label, **kw):
    return AcceleratorProgram.objects.create(
        name=f"Intake {label} {TAG}",
        slug=f"intake-{label}-{TAG}",
        organization_name="Northstar Ventures",
        sector_focus="fintech",
        stage_focus="seed",
        **kw,
    )


def make_cycle(program, label, **kw):
    kw.setdefault("target_cohort_size", 10)
    return ApplicationCycle.objects.create(
        name=f"{label} {TAG}", program=program, **kw
    )


def issue_key(cycle, user, action="rotate"):
    """Call the key endpoint the way the dashboard does, returning its body."""
    request = factory.post("/intake-key", {"action": action}, format="json")
    force_authenticate(request, user=user)
    view = intake_views.CycleIntakeKeyView.as_view()
    response = view(request, pk=cycle.pk)
    return response


def ingest(body, user=None):
    request = factory.post("/intake/ingest/", body, format="json")
    if user is not None:
        force_authenticate(request, user=user)
    return intake_views.IngestSubmissionView.as_view()(request)


def import_file(cycle, program, user, filename, content, **extra):
    data = {
        "file": SimpleUploadedFile(filename, content),
        "program_id": str(program.pk),
    }
    if cycle is not None:
        data["cycle_id"] = str(cycle.pk)
    data.update(extra)
    request = factory.post("/intake/import/", data, format="multipart")
    force_authenticate(request, user=user)
    return intake_views.IntakeImportView.as_view()(request)


def list_submissions(user, **params):
    request = factory.get("/intake-submissions/", params)
    if user is not None:
        force_authenticate(request, user=user)
    view = intake_views.ExternalIntakeSubmissionViewSet.as_view({"get": "list"})
    return view(request)


def rows_of(response):
    data = response.data
    return data["results"] if isinstance(data, dict) and "results" in data else data


def decide(user, submission, method):
    request = factory.post(f"/intake-submissions/{submission.pk}/{method}/", {}, format="json")
    force_authenticate(request, user=user)
    view = intake_views.ExternalIntakeSubmissionViewSet.as_view({"post": method})
    return view(request, pk=submission.pk)


def staged_for(program):
    return ExternalIntakeSubmission.objects.filter(program=program)


TAG = uuid.uuid4().hex[:6]

with transaction.atomic():
    staff = User.objects.create_user(email=f"int-staff-{TAG}@x.io", password="x", role="accelerator")
    outsider = User.objects.create_user(email=f"int-out-{TAG}@x.io", password="x", role="accelerator")
    founder = User.objects.create_user(email=f"int-founder-{TAG}@x.io", password="x", role="startup")

    home = make_program("home", is_public=False, created_by=staff)
    away = make_program("away", is_public=False, created_by=outsider)
    public = make_program("public", is_public=True)

    cycle = make_cycle(home, "open", status="OPEN")
    closed_cycle = make_cycle(home, "archived", status="ARCHIVED")
    away_cycle = make_cycle(away, "away", status="OPEN")

    # ── 1. A cycle with no key has no door ────────────────────────────────────
    ok("a cycle is sealed until someone issues a key", not cycle.intake_key_hash)
    response = ingest({"intake_key": "pmit_not-a-real-key", "founder_email": f"a{TAG}@x.io",
                       "company_name": "Almost"})
    ok("an unknown key is refused", response.status_code == 403)
    ok("nothing was staged by the refused post", staged_for(home).count() == 0)

    # ── 2. Issuing the key ────────────────────────────────────────────────────
    issued = issue_key(cycle, staff, "issue")
    ok("issuing returns 201", issued.status_code == 201)
    plain_key = issued.data.get("intake_key")
    ok("the plaintext key comes back exactly once", bool(plain_key))
    cycle.refresh_from_db()
    ok("the stored value is a hash, not the key", cycle.intake_key_hash != plain_key)
    ok("the hash is the sha256 of the key",
       cycle.intake_key_hash == intake_lib.hash_intake_key(plain_key))
    ok("the hint is a prefix, not the whole key",
       cycle.intake_key_hint == plain_key[:16] and len(cycle.intake_key_hint) < len(plain_key))
    ok("issuing records who opened the door", cycle.intake_key_set_by_id == staff.pk)

    live = issue_key(cycle, staff, "issue")
    ok("a second issue does not silently replace a live key", live.status_code == 400)
    ok("the answer says to rotate instead", "rotate" in str(live.data).lower())
    cycle.refresh_from_db()
    ok("the live key is untouched by the refused issue",
       cycle.intake_key_hash == intake_lib.hash_intake_key(plain_key))
    nonsense = issue_key(cycle, staff, "unseal")
    ok("an action that does not exist is refused", nonsense.status_code == 400)

    get_request = factory.get("/intake-key")
    force_authenticate(get_request, user=staff)
    got = intake_views.CycleIntakeKeyView.as_view()(get_request, pk=cycle.pk)
    ok("reading the state never returns the key", "intake_key" not in got.data)
    ok("reading the state says the door is open", got.data["intake_open"] is True)
    body = json.dumps(got.data, default=str)
    ok("no hash leaks through the state endpoint", cycle.intake_key_hash not in body)

    # ── 3. Posting through the door ──────────────────────────────────────────
    response = ingest({
        "intake_key": plain_key,
        "founder_email": f" Ada@AdaLabs{TAG}.io ".strip(),
        "founder_name": "Ada Okonkwo",
        "company_name": "Ada Labs",
        "external_id": f"form-{TAG}-1",
        "payload": {"How did you hear about us?": "Newsletter", "team_size": 4},
        # A sender naming another program must not be able to aim its submission
        # at somebody else's queue.
        "program_id": away.pk,
        "cycle_id": away_cycle.pk,
    })
    ok("a valid post is accepted", response.status_code == 202)
    ok("the receipt says received", response.data.get("received") is True)
    staged = staged_for(home).first()
    ok("the submission landed in the key's program", staged and staged.program_id == home.pk)
    ok("the submission landed in the key's cycle", staged and staged.cycle_id == cycle.pk)
    ok("the sender's program claim was ignored",
       staged and not staged_for(away).exists())
    ok("an email is stored lowercased", staged.founder_email == f"ada@adalabs{TAG}.io")
    ok("extra answers are kept under the sender's own headings",
       staged.raw_payload.get("How did you hear about us?") == "Newsletter")
    ok("a clean submission has no gaps", staged.issues == [])

    again = ingest({"intake_key": plain_key, "founder_email": f"ada{TAG}@x.io",
                    "company_name": "Ada Labs", "external_id": f"form-{TAG}-1"})
    ok("the same reference posts once", again.status_code == 200 and again.data.get("duplicate") is True)
    ok("no second row for a retried form", staged_for(home).count() == 1)

    gapgy = ingest({"intake_key": plain_key, "founder_name": "Nobody Alone"})
    ok("a submission with no email is still received", gapgy.status_code == 202)
    gap_row = staged_for(home).order_by("-pk").first()
    ok("its missing email is reported", any(i["code"] == "missing_founder_email" for i in gap_row.issues))
    ok("its missing company is reported", any(i["code"] == "missing_company_name" for i in gap_row.issues))
    ok("two gaps block acceptance", len(gap_row.blocking_gaps()) == 2)
    serialised = ExternalIntakeSubmissionSerializer(gap_row).data
    ok("the queue sees can_accept false", serialised["can_accept"] is False)
    ok("the queue sees the gap text", bool(serialised["blocking_gaps"]))

    big = ingest({"intake_key": plain_key, "founder_email": f"big{TAG}@x.io",
                  "company_name": "Big Body", "payload": {"blob": "a" * 70000}})
    ok("an oversized body is refused rather than truncated", big.status_code == 400)
    ok("nothing was staged by the oversized post",
       not staged_for(home).filter(company_name="Big Body").exists())
    wrong_shape = ingest({"intake_key": plain_key, "payload": ["not", "an", "object"]})
    ok("a payload that is not an object is refused", wrong_shape.status_code == 400)

    # Closed windows stop receiving, whatever their dates say.
    sealed = issue_key(closed_cycle, staff)
    closed_key = sealed.data["intake_key"]
    refused = ingest({"intake_key": closed_key, "founder_email": f"late{TAG}@x.io",
                      "company_name": "Too Late"})
    ok("an archived cycle refuses submissions", refused.status_code == 400)
    ok("nothing was staged in the closed cycle", staged_for(cycle.program).filter(cycle=closed_cycle).count() == 0)

    # ── 4. Rotating and sealing ──────────────────────────────────────────────
    rotated = issue_key(cycle, staff)
    new_key = rotated.data["intake_key"]
    ok("rotating returns a different key", new_key != plain_key)
    stale = ingest({"intake_key": plain_key, "founder_email": f"stale{TAG}@x.io",
                    "company_name": "Old Key"})
    ok("the previous key stops working at once", stale.status_code == 403)
    ok("nothing was staged with the old key",
       not staged_for(home).filter(company_name="Old Key").exists())
    seal_request = factory.post("/intake-key", {"action": "seal"}, format="json")
    force_authenticate(seal_request, user=staff)
    sealed_response = intake_views.CycleIntakeKeyView.as_view()(seal_request, pk=cycle.pk)
    ok("sealing closes the door", sealed_response.data["intake_open"] is False)
    cycle.refresh_from_db()
    ok("sealing clears the hash", cycle.intake_key_hash == "")
    after_seal = ingest({"intake_key": new_key, "founder_email": f"post{TAG}@x.io",
                         "company_name": "After Seal"})
    ok("a sealed key is no longer recognised", after_seal.status_code == 403)
    reopen = issue_key(cycle, staff)
    ok("a sealed cycle can be opened again", bool(reopen.data.get("intake_key")))

    reopened_post = ingest({"intake_key": reopen.data["intake_key"],
                           "founder_email": f"x{TAG}@x.io", "company_name": "X"})
    ok("the reissued key works, with no session at all", reopened_post.status_code == 202)
    ok("the reopened door still aims at the key's cycle",
       list(staged_for(home).filter(company_name="X").values_list("cycle_id", flat=True))
       == [cycle.pk])

    # ── 5. Import: a preview that writes nothing ─────────────────────────────
    csv_bytes = (
        "Email,Startup Name,Notes,team_size\r\n"
        f" ada{TAG}@adalabs.io,Ada Labs,met at a conference,4\r\n"
        f" not-an-email,Broken Co,typo in the address,2\r\n"
        f" onlyemail{TAG}@x.io,,no company name,\r\n"
        f" dup{TAG}@x.io,Dup Co,listed twice,1\r\n"
        f" dup{TAG}@x.io,Dup Co,list listed twice,1\r\n"
    ).encode("utf-8")

    before = staged_for(home).count()
    preview = import_file(cycle, home, staff, "apps.csv", csv_bytes, commit="false")
    ok("the preview succeeds", preview.status_code == 200)
    ok("the preview commits nothing", staged_for(home).count() == before)
    ok("the preview says it committed nothing", preview.data["committed"] is False)
    ok("the preview reports every row it read", preview.data["counts"]["rows"] == 5)
    ok("the header row is shown", preview.data["headers"][0] == "Email")
    ok("an unmapped column is named, not dropped",
       "Notes" in preview.data["unmapped_headers"])
    ok("Email is suggested for the founder email",
       preview.data["suggested_mapping"].get("founder_email") == "Email")
    ok("Startup Name is suggested for the company",
       preview.data["suggested_mapping"].get("company_name") == "Startup Name")
    ok("a column nobody mapped is still carried in the payload",
       preview.data["rows"][0]["payload"].get("Notes") == "met at a conference")
    preview_issues = {row["row_number"]: [i["code"] for i in row["issues"]]
                      for row in preview.data["rows"]}
    ok("a bad address is reported as an invalid address",
       "email_invalid" in preview_issues[3])
    ok("a missing company is reported as missing",
       "missing_company_name" in preview_issues[4])
    ok("the second copy in one file is flagged",
       "duplicate_in_file" in preview_issues[6])
    ok("row numbers point at the real spreadsheet rows",
       preview.data["rows"][0]["row_number"] == 2)
    ok("counts separate rows that can be accepted",
       preview.data["counts"]["can_accept"] == 3)

    committed = import_file(cycle, home, staff, "apps.csv", csv_bytes, commit="true")
    ok("the commit writes the rows", committed.status_code == 201)
    ok("all five rows landed", staged_for(home).count() == before + 5)
    ok("the commit counts what it stored", committed.data["counts"]["stored"] == 5)
    ok("an imported row remembers where it came from",
       staged_for(home).filter(source="spreadsheet").count() >= 5)
    ok("one import is one batch",
       staged_for(home).filter(source="spreadsheet").values("batch_ref").distinct().count() == 1)
    ok("the unmapped column survived into the row",
       staged_for(home).filter(company_name="Ada Labs").first().raw_payload.get("Notes")
       == "met at a conference")

    recount = import_file(cycle, home, staff, "apps.csv", csv_bytes, commit="true")
    ok("a re-run reports what it skipped",
       recount.data["counts"]["already_staged"] == 5 and recount.data["counts"]["stored"] == 0)
    ok("a re-added file does not double the queue", staged_for(home).count() == before + 5)
    ok("a row with no company to recognise it by is still matched on its email",
       ExternalIntakeSubmission.objects.filter(
           founder_email__startswith=f"onlyemail{TAG}").count() == 1)

    # An explicit mapping beats the suggestion — and a header that is not in the
    # file produces a missing value, never an invented one.
    ghost = import_file(cycle, home, staff, "apps.csv", csv_bytes,
                        commit="false", mapping=json.dumps({"founder_email": "Ghost Column"}))
    ok("a mapped column that does not exist is refused as missing",
       ghost.status_code == 200
       and any(i["code"] == "missing_founder_email" for i in ghost.data["rows"][0]["issues"]))
    ok("the real email is still kept under its own heading",
       ghost.data["rows"][0]["payload"].get("Email", "").startswith(f"ada{TAG}"))
    bogus = import_file(cycle, home, staff, "apps.csv", csv_bytes,
                        commit="false", mapping=json.dumps({"nope": "Email"}))
    ok("an unknown target field is refused", bogus.status_code == 400)

    unreadable = import_file(cycle, home, staff, "apps.pdf", b"%PDF-1.4 everything")
    ok("a format with no reader is refused, not guessed at", unreadable.status_code == 400)
    empty = import_file(cycle, home, staff, "apps.csv", b"")
    ok("an empty file is refused", empty.status_code == 400)

    tsv = import_file(cycle, home, staff, "apps.tsv",
                      f"founder_name\temail\nAda\tada{TAG}@x.io\n".encode("utf-8"),
                      commit="false")
    ok("a tab-separated file parses on tabs",
       tsv.status_code == 200 and tsv.data["counts"]["rows"] == 1)
    ok("a tab-separated header still maps to a field",
       tsv.data["rows"][0]["founder_name"] == "Ada")

    json_upload = import_file(cycle, home, staff, "apps.json", json.dumps([
        {"applicant_email": f"js{TAG}@x.io", "venture_name": "JSON Co", "pitch": "one line"},
    ]).encode("utf-8"), commit="true")
    ok("a JSON array imports", json_upload.status_code == 201)
    json_row = staged_for(home).filter(company_name="JSON Co").first()
    ok("JSON aliases map onto the same fields",
       json_row and json_row.founder_email == f"js{TAG}@x.io")
    ok("a JSON extra key is kept as payload", json_row.raw_payload.get("pitch") == "one line")

    def workbook_bytes(rows):
        from openpyxl import Workbook
        book = Workbook()
        sheet = book.active
        for row in rows:
            sheet.append(row)
        buffer = io.BytesIO()
        book.save(buffer)
        return buffer.getvalue()

    xlsx = import_file(cycle, home, staff, "apps.xlsx",
                       workbook_bytes([["E-mail", "Company", "Raised (USD)"],
                                       [f"xl{TAG}@x.io", "Excel Co", 250000]]),
                       commit="true")
    ok("an xlsx uploads", xlsx.status_code == 201)
    xl_row = staged_for(home).filter(company_name="Excel Co").first()
    ok("a numeric cell is stored as text, not as 250000.0",
       xl_row and xl_row.raw_payload.get("Raised (USD)") == "250000")
    ok("a header spelled differently still folds onto its field",
       xl_row and xl_row.founder_email == f"xl{TAG}@x.io")

    # ── 6. Who may see the queue ─────────────────────────────────────────────
    anonymous = list_submissions(None)
    ok("the queue is not public", anonymous.status_code in (401, 403))
    founder_view = list_submissions(founder)
    ok("a founder cannot read the queue", founder_view.status_code == 403)
    outsider_rows = rows_of(list_submissions(outsider))
    ok("an account that does not work in the program sees no rows",
       all(r["program_id"] != home.pk for r in outsider_rows))
    staff_rows = rows_of(list_submissions(staff, program_id=home.pk))
    ok("the staff account sees its own program's rows", len(staff_rows) >= 6)
    ok("every row names its program", all(r["program_name"] for r in staff_rows))
    cycle_scoped = rows_of(list_submissions(staff, cycle_id=cycle.pk))
    ok("the queue narrows by cycle", all(r["cycle_id"] == cycle.pk for r in cycle_scoped))
    status_scoped = rows_of(list_submissions(staff, program_id=home.pk, status="staged"))
    ok("the queue narrows by what is still undecided",
       status_scoped and all(r["status"] == "staged" for r in status_scoped))

    # ── 7. Accepting: the human decision that creates the spine ──────────────
    ok("both Ada Labs rows are in the queue",
       staged_for(home).filter(company_name="Ada Labs").count() == 2)
    clean = staged_for(home).filter(company_name="Ada Labs", issues=[]).order_by("pk").first() \
        or staged_for(home).filter(company_name="Ada Labs").order_by("pk").first()

    refused = decide(staff, gap_row, "accept")
    ok("a row without an email cannot be accepted", refused.status_code == 400)
    ok("the refusal lists what is missing", "email" in str(refused.data).lower())
    ok("no application was created by the refusal",
       not AcceleratorApplication.objects.filter(program=home, submitted_by__email__startswith=f"onlyemail{TAG}").exists())

    broken = staged_for(home).filter(company_name="Broken Co").first()
    broken_accept = decide(staff, broken, "accept")
    ok("an address that is not an address cannot be accepted", broken_accept.status_code == 400)
    ok("the queue agrees it cannot be accepted",
       ExternalIntakeSubmissionSerializer(broken).data["can_accept"] is False)
    ok("no account was opened for an address nobody could claim",
       not User.objects.filter(email="not-an-email").exists())

    # The importer's per-row verdict and the queue's accept button are computed
    # in two places. They have to answer the same question the same way, or a
    # preview says "ready" and the decision refuses.
    disagreeing = [
        s.pk for s in ExternalIntakeSubmission.objects.filter(status="staged")
        if ExternalIntakeSubmissionSerializer(s).data["can_accept"] != (
            not [i for i in s.issues if i["code"] not in intake_lib.NON_BLOCKING_CODES]
        )
    ]
    ok("the queue and the importer agree on what can be accepted", not disagreeing)

    accepted = decide(staff, clean, "accept")
    ok("a complete row can be accepted", accepted.status_code == 200)
    ok("accepting says it created an account", accepted.data["founder_account_created"] is True)
    application = AcceleratorApplication.objects.get(pk=accepted.data["application_id"])
    ok("the application sits in the staged submission's cycle", application.cycle_id == cycle.pk)
    ok("the application is submitted, not invented as screened", application.status == "SUBMITTED")
    ok("the application belongs to the program the key pointed at", application.program_id == home.pk)
    ok("the founder account is the one the email named",
       application.submitted_by.email == clean.founder_email)
    claimed = application.submitted_by
    ok("a provisioned account cannot sign in", not claimed.has_usable_password())
    ok("a provisioned account is not verified", claimed.is_verified is False)
    ok("a provisioned account is a founder", claimed.role == User.ROLE_STARTUP)
    profile = FounderApplicationProfile.objects.get(user=claimed)
    ok("the founder profile took the imported name", profile.full_name == "Ada Okonkwo")
    clean.refresh_from_db()
    ok("the staged row records the decision", clean.status == "accepted")
    ok("the staged row says who decided", clean.decided_by_id == staff.pk)
    ok("the staged row links to what it became", clean.application_id == application.pk)

    twice = decide(staff, clean, "accept")
    ok("an accepted row cannot be accepted twice", twice.status_code == 400)

    same_company = ExternalIntakeSubmission.objects.create(
        program=home, cycle=cycle, source="website",
        founder_email=clean.founder_email, company_name=clean.company_name,
    )
    clash = decide(staff, same_company, "accept")
    ok("the same founder's company is not filed into the program twice", clash.status_code == 400)
    ok("the refusal explains itself", "already" in str(clash.data).lower())
    ok("the refused repeat filed nothing of its own",
       AcceleratorApplication.objects.filter(program=home).count() == 1)

    # Reusing a real account: the email already belongs to someone with a password.
    existing = User.objects.create_user(email=f"prev{TAG}@x.io", password="a-real-one",
                                        role="startup")
    FounderApplicationProfile.objects.create(user=existing, full_name="Already Here")
    reused_row = ExternalIntakeSubmission.objects.create(
        program=home, cycle=cycle, source="website",
        founder_email=f"PREV{TAG}@x.io".lower(), founder_name="Imported Name",
        company_name="Reused Co",
    )
    reuse = decide(staff, reused_row, "accept")
    ok("an existing account is reused", reuse.status_code == 200
       and reuse.data["founder_account_created"] is False)
    ok("no second account for an email a person already owns",
       User.objects.filter(email__iexact=f"prev{TAG}@x.io").count() == 1)
    ok("the existing password is untouched",
       User.objects.get(pk=existing.pk).has_usable_password()
       and User.objects.get(pk=existing.pk).check_password("a-real-one"))
    ok("the existing profile keeps the name its owner gave it",
       FounderApplicationProfile.objects.get(user=existing).full_name == "Already Here")

    dismissed = decide(staff, gap_row, "dismiss")
    ok("a row can be dismissed", dismissed.status_code == 200)
    gap_row.refresh_from_db()
    ok("dismissing does not file anything", gap_row.application_id is None)
    ok("dismissing keeps the row for the record",
       ExternalIntakeSubmission.objects.filter(pk=gap_row.pk).exists())
    again_dismiss = decide(staff, gap_row, "dismiss")
    ok("a decided row is not decided twice", again_dismiss.status_code == 400)

    note_row = staged_for(home).filter(company_name="Broken Co").first()
    if note_row:
        decide_request = factory.post(f"/x/{note_row.pk}/dismiss/", {"note": "address typo"},
                                      format="json")
        force_authenticate(decide_request, user=staff)
        decide_note = intake_views.ExternalIntakeSubmissionViewSet.as_view({"post": "dismiss"})(
            decide_request, pk=note_row.pk)
        ok("a dismissal can carry the reason", decide_note.status_code == 200)
        note_row.refresh_from_db()
        ok("the reason is stored", note_row.note == "address typo")

    founder_accept = decide(founder, clean, "accept")
    ok("a founder cannot accept submissions", founder_accept.status_code == 403)

    # ── 8. The cycle readout reflects intake honestly ────────────────────────
    cycle.refresh_from_db()
    closed_cycle.refresh_from_db()
    cycle_data = ApplicationCycleSerializer(cycle).data
    ok("the cycle reports the door as open", cycle_data["intake_open"] is True)
    ok("the cycle reports only a hint of the key",
       cycle_data["intake_key"]["hint"] == cycle.intake_key_hint)
    ok("the key state says who issued it",
       cycle_data["intake_key"]["issued_by"]["email"] == staff.email)
    ok("a decided row leaves the staged count",
       cycle_data["staged_count"]
       == ExternalIntakeSubmission.objects.filter(cycle=cycle, status="staged").count()
       and cycle_data["staged_count"]
       < ExternalIntakeSubmission.objects.filter(cycle=cycle).count())
    ok("applications in a cycle count the accepted submission",
       cycle_data["application_count"] == cycle.applications.count())
    sealed_cycle_data = ApplicationCycleSerializer(closed_cycle).data
    ok("an archived cycle reports the key it was given",
       sealed_cycle_data["intake_open"] is True)
    # The two facts stay two facts: the window has no dates (so "unscheduled",
    # not "closed") and the door a person opened is still recorded as open even
    # though the status refuses posts. Nothing collapses into an inference.
    ok("archiving a cycle does not rewrite its schedule readout",
       sealed_cycle_data["scheduled_window"]["state"] == "unscheduled")

    ok("no application was ever created outside a human decision",
       AcceleratorApplication.objects.filter(
           program__in=[home, away, public]
       ).count() == ExternalIntakeSubmission.objects.filter(
           program__in=[home, away, public], status="accepted"
       ).count())

    transaction.set_rollback(True)

failed = [name for name, passed in checks if not passed]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for name in failed:
    print(f"FAILED: {name}")
print("staged rows are rolled back" if len(checks) else "")
raise SystemExit(1 if failed else 0)
