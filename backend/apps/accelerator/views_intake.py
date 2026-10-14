"""
apps.accelerator.views_intake
=============================
Receiving applications that arrive from outside the dashboard.

Three surfaces, with deliberately different authority:

* ``IngestSubmissionView`` — the only unauthenticated write in the accelerator.
  Its authority is the cycle's intake key, which a director issued on purpose;
  the program and cycle come from that key, never from the request body, so a
  sender cannot aim a submission at somebody else's program. What it can create
  is a staged row, nothing more.
* ``IntakeImportView`` — a staff upload of CSV/TSV/XLSX/XLSM/JSON. Preview first:
  ``commit=false`` writes nothing and returns the per-row verdicts, so a column
  mapped onto the wrong heading is visible before it becomes data.
* ``ExternalIntakeSubmissionViewSet`` — the queue a person reads, plus accept and
  dismiss. Accepting is where an identity is asserted, so it is the one place
  that writes the application spine, and it records who did it.

A staged submission is not an application and is never counted as one anywhere.
"""
from __future__ import annotations

import json
import uuid

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .intake import (
    CANONICAL_FIELDS,
    IntakeAlreadyFiled,
    IntakeFormatError,
    IntakeNotReady,
    NON_BLOCKING_CODES,
    accept_submission,
    issue_intake_key,
    hash_intake_key,
    mark_queue_repeats,
    normalize_table,
    payload_too_large,
    queue_identities,
    read_table_upload,
    suggest_mapping,
)
from .models import AcceleratorProgram
from .models_os import ApplicationCycle, ExternalIntakeSubmission
from .permissions import IsAcceleratorOrStaff
from .serializers_config import ExternalIntakeSubmissionSerializer
from .tenant import (
    positive_int,
    program_visible_to,
    require_visible_program,
    scope_to_visible_programs,
)

# Closed windows stop receiving. Dates are not the test: a key is what opens a
# door, and these two statuses are a person having shut it.
CLOSED_CYCLE_STATUSES = ("ARCHIVED", "COMPLETED")

PREVIEW_ROWS_RETURNED = 100


class ExternalIntakeSubmissionViewSet(viewsets.ReadOnlyModelViewSet):
    """The staged queue, for the people who work it.

    Read is confined to programs the account actually works in — this table
    holds other organisations' founder details. Accept and dismiss additionally
    require staff, and both record the account that did it. Neither is available
    in bulk: a row becomes an application one decision at a time.
    """

    serializer_class = ExternalIntakeSubmissionSerializer
    permission_classes = [IsAcceleratorOrStaff]

    def get_queryset(self):
        # The shared scoper rather than a hand-rolled `program__in`: staff work
        # every program's queue, an accelerator its own plus those published for
        # intake, and a `?program_id=` may only narrow that — with a malformed
        # id refused by name instead of raising inside the filter.
        queryset = scope_to_visible_programs(
            ExternalIntakeSubmission.objects.select_related(
                "program", "cycle", "application", "decided_by"
            ),
            self.request,
        )
        params = self.request.query_params
        cycle_id = params.get("cycle_id")
        if cycle_id:
            queryset = queryset.filter(
                cycle_id=positive_int(cycle_id, "cycle_id"))
        state = params.get("status")
        if state:
            queryset = queryset.filter(status=state)
        return queryset.order_by("-created_at")

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """File this submission as a real application, under a named decision.

        The founder account is reused if the email already has one, and opened
        unable to sign in otherwise — no password, not verified — because what a
        third party asserted is not proof of who owns an address. The person
        clicking this is the one asserting it, and that is on the record.
        """
        submission = self.get_object()
        try:
            application, founder_created = accept_submission(submission, decided_by=request.user)
        except IntakeNotReady as exc:
            raise ValidationError({"detail": str(exc)})
        except IntakeAlreadyFiled as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({
            "detail": "Filed as an application.",
            "submission": ExternalIntakeSubmissionSerializer(submission).data,
            "application_id": application.id,
            # The UI has to say this out loud: an account exists that cannot log
            # in yet, and the founder claims it through the normal verification.
            "founder_account_created": founder_created,
        })

    @action(detail=True, methods=["post"])
    def dismiss(self, request, pk=None):
        """Set a staged row aside, with the reason the person gave.

        Dismissing is not deleting: an intake that was refused is part of why the
        funnel looks like it does, and the row keeps the payload it arrived with.
        """
        submission = self.get_object()
        if submission.status != "staged":
            raise ValidationError({"detail": "That submission has already been decided."})
        note = (request.data.get("note") or "").strip()
        submission.status = "dismissed"
        submission.note = note
        submission.decided_by = request.user
        submission.decided_at = timezone.now()
        submission.save(update_fields=["status", "note", "decided_by", "decided_at", "updated_at"])
        return Response({
            "detail": "Dismissed. Nothing was filed.",
            "submission": ExternalIntakeSubmissionSerializer(submission).data,
        })


class IntakeImportView(APIView):
    """Preview and commit a CSV/TSV/XLSX/XLSM/JSON upload into the staged queue.

    Two things are refused rather than fixed. A file whose header row cannot be
    read is refused, because inventing column names would file founders' answers
    under headings nobody chose. And a row missing the founder email or company
    name is still staged — with the gap listed — because the person importing 400
    rows should see which 3 are incomplete, not lose the batch to them.
    """

    permission_classes = [IsAcceleratorOrStaff]
    parser_classes = [MultiPartParser, JSONParser]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "No file was uploaded."})
        program_id = request.data.get("program_id")
        if not program_id:
            raise ValidationError({"program_id": "Name the program these rows belong to."})
        require_visible_program(request.user, program_id)
        visible = AcceleratorProgram.objects.filter(pk=program_id).first()
        if visible is None:
            raise PermissionDenied("This account does not work in that program.")

        cycle = None
        cycle_id = request.data.get("cycle_id")
        if cycle_id:
            cycle = ApplicationCycle.objects.filter(
                pk=positive_int(cycle_id, "cycle_id"), program=visible).first()
            if cycle is None:
                raise ValidationError({"cycle_id": "That cycle is not part of this program."})

        try:
            headers, rows = read_table_upload(upload)
        except IntakeFormatError as exc:
            raise ValidationError({"file": str(exc)})

        mapping = self._mapping(request, headers)
        commit = str(request.data.get("commit", "")).lower() in ("1", "true", "yes")

        prepared = normalize_table(headers, rows, mapping)
        # A second import of the same file is the ordinary way a queue gets
        # doubled, so the rows that repeat something already waiting are named
        # here — in the preview, before anybody commits.
        in_queue = queue_identities(visible.pk, cycle.pk if cycle is not None else None)
        repeats = mark_queue_repeats(prepared, in_queue)
        unmapped = [h for h in headers if h not in set(mapping.values())]
        counts = {
            "rows": len(prepared),
            "with_issues": sum(1 for row in prepared if row["issues"]),
            # A row missing an email, a company name, or holding a malformed
            # address can be staged but not accepted. A duplicate inside the file
            # and a repeat of a queued row are flags to read, not blocks: accept
            # still refuses to file the same founder's company in twice.
            "can_accept": sum(
                1 for row in prepared
                if not [i for i in row["issues"] if i["code"] not in NON_BLOCKING_CODES]
            ),
            "already_in_queue": repeats,
        }

        if not commit:
            return Response({
                "committed": False,
                "headers": headers,
                "unmapped_headers": unmapped,
                "suggested_mapping": suggest_mapping(headers),
                "mapping": mapping,
                "counts": counts,
                "rows": prepared[:PREVIEW_ROWS_RETURNED],
                "rows_truncated": len(prepared) > PREVIEW_ROWS_RETURNED,
            })

        batch_ref = uuid.uuid4()
        accepted, already_staged, stored = 0, 0, []
        for record in prepared:
            if any(i["code"] == "already_in_queue" for i in record["issues"]):
                # Counted as the same row arriving again, not as new work. Writing
                # it twice would make the queue a place where the same founder
                # waits in two lines.
                already_staged += 1
                continue
            try:
                with transaction.atomic():
                    submission = ExternalIntakeSubmission.objects.create(
                        program=visible,
                        cycle=cycle,
                        source="spreadsheet",
                        batch_ref=batch_ref,
                        external_id=record["external_id"],
                        founder_email=record["founder_email"],
                        founder_name=record["founder_name"],
                        company_name=record["company_name"],
                        raw_payload=record["payload"],
                        issues=record["issues"],
                    )
                stored.append(ExternalIntakeSubmissionSerializer(submission).data)
                accepted += 1
            except IntegrityError:
                # The same reference from the same cycle is already in the queue.
                # Reporting it beats quietly counting it as new work.
                already_staged += 1

        return Response({
            "committed": True,
            "batch_ref": str(batch_ref),
            "counts": {**counts, "stored": accepted, "already_staged": already_staged},
            "rows": stored[:PREVIEW_ROWS_RETURNED],
            "rows_truncated": len(stored) > PREVIEW_ROWS_RETURNED,
        }, status=status.HTTP_201_CREATED)

    def _mapping(self, request, headers: list) -> dict:
        """{canonical field: header} — sent by the client, or suggested from the file.

        An explicit mapping is validated rather than trusted loosely: a field
        outside the four is meaningless here, and a header that is not in the
        file would silently empty the column it names.
        """
        raw = request.data.get("mapping")
        if isinstance(raw, str) and raw.strip():
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                raise ValidationError({"mapping": "That is not a JSON object of fields to headers."})
        if not isinstance(raw, dict) or not raw:
            return suggest_mapping(headers)
        unknown = [k for k in raw if k not in CANONICAL_FIELDS]
        if unknown:
            raise ValidationError({"mapping": f"Unknown fields: {', '.join(unknown)}."})
        return {k: v for k, v in raw.items() if v}


class IngestSubmissionView(APIView):
    """The door an accelerator's own website posts through.

    No session, no user, no role claim: the intake key *is* the authority, and
    the program and cycle are read off the key server-side, so a sender cannot
    address another organisation's queue or choose which window a founder lands
    in. Every other input is stored as received and held for a person.

    What this deliberately does not do: create an application, run screening, or
    tell the sender anything about the program's internal state. The response is
    a receipt, because a founder's form has no business knowing queue details.
    There is no rate limit here — this endpoint should sit behind the deployment's
    edge throttling, and a program that wants to stop receiving rotates the key.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        key = (request.data.get("intake_key") or "").strip()
        if not key:
            raise ValidationError({"intake_key": "This endpoint needs the cycle's intake key."})
        cycle = ApplicationCycle.objects.filter(
            intake_key_hash=hash_intake_key(key)
        ).select_related("program").first()
        if cycle is None:
            # Same answer for "never existed" and "already rotated": a wrong key
            # should not learn anything by getting a different error.
            raise PermissionDenied("That intake key is not recognised.")
        if cycle.status in CLOSED_CYCLE_STATUSES:
            raise ValidationError({"detail": "This intake window is closed."})

        payload = request.data.get("payload")
        if payload is not None and not isinstance(payload, dict):
            raise ValidationError({"payload": "Extra answers have to be an object of name to value."})
        if payload is not None and payload_too_large(payload):
            raise ValidationError({"payload": "That submission is too large to store as given."})

        def text(field: str) -> str:
            value = request.data.get(field)
            return ("" if value is None else str(value)).strip()

        email = text("founder_email").lower()
        if email and len(email) > 254:
            raise ValidationError({"founder_email": "That email is too long to be an address."})

        external_id = text("external_id") or None
        existing = (
            ExternalIntakeSubmission.objects.filter(cycle=cycle, external_id=external_id).first()
            if external_id else None
        )
        if existing is not None:
            # Idempotent on the sender's own reference: a form that retries after
            # a timeout must not file the founder twice, and the retry gets the
            # same receipt it got before.
            return Response({"received": True, "duplicate": True}, status=status.HTTP_200_OK)

        issues = []
        if not email:
            issues.append({
                "code": "missing_founder_email", "field": "founder_email",
                "message": "The sending form did not include an email address.",
            })
        if not text("company_name"):
            issues.append({
                "code": "missing_company_name", "field": "company_name",
                "message": "The sending form did not include a company name.",
            })

        try:
            with transaction.atomic():
                ExternalIntakeSubmission.objects.create(
                    program=cycle.program,
                    cycle=cycle,
                    source="website",
                    external_id=external_id,
                    founder_email=email,
                    founder_name=text("founder_name"),
                    company_name=text("company_name"),
                    raw_payload=payload or {},
                    issues=issues,
                )
        except IntegrityError:
            return Response({"received": True, "duplicate": True}, status=status.HTTP_200_OK)

        return Response({"received": True}, status=status.HTTP_202_ACCEPTED)


class CycleIntakeKeyView(APIView):
    """Issue, show-what-exists, and seal a cycle's intake key.

    The plaintext key is returned by exactly one call — the one that issues it.
    ``rotate`` seals the previous key by replacing its hash, which is the point:
    there is no way to read a stored key back out, so a lost key is rotated and
    the program's own form has to be updated.
    """

    permission_classes = [IsAcceleratorOrStaff]

    def get(self, request, pk):
        cycle = self._cycle(request, pk)
        return Response(self._state(cycle))

    def post(self, request, pk):
        cycle = self._cycle(request, pk)
        intent = (request.data.get("action") or "issue").strip().lower()
        if intent == "seal":
            cycle.intake_key_hash = ""
            cycle.intake_key_hint = ""
            cycle.intake_key_set_at = None
            cycle.intake_key_set_by = None
            cycle.save(update_fields=[
                "intake_key_hash", "intake_key_hint", "intake_key_set_at",
                "intake_key_set_by", "updated_at",
            ])
            return Response({**self._state(cycle), "detail": "This cycle no longer receives."})
        if intent not in ("issue", "rotate"):
            raise ValidationError({"action": "Only issue and seal are supported."})
        if intent == "issue" and cycle.intake_key_hash:
            raise ValidationError({"detail": "A key is already live. Rotate it to replace it."})

        key, digest, hint = issue_intake_key()
        cycle.intake_key_hash = digest
        cycle.intake_key_hint = hint
        cycle.intake_key_set_at = timezone.now()
        cycle.intake_key_set_by = request.user
        cycle.save(update_fields=[
            "intake_key_hash", "intake_key_hint", "intake_key_set_at",
            "intake_key_set_by", "updated_at",
        ])
        return Response({
            **self._state(cycle),
            "intake_key": key,
            "detail": (
                "Store this key now — it is shown once and cannot be recovered. "
                "Rotating it cuts off the previous key immediately."
            ),
        }, status=status.HTTP_201_CREATED if intent == "issue" else status.HTTP_200_OK)

    def _cycle(self, request, pk) -> ApplicationCycle:
        if not IsAcceleratorOrStaff().has_permission(request, self):
            raise PermissionDenied("Only program staff can open or seal an intake door.")
        # A path segment is caller text too: refused as a bad id, not a 500.
        cycle = ApplicationCycle.objects.filter(pk=positive_int(pk, "cycle_id")).first()
        if cycle is None:
            # 404 rather than 403: an unseen cycle is not a permission problem to
            # explain, and explaining it would confirm which ids exist.
            raise NotFound("No such cycle for this account.")
        if not program_visible_to(cycle.program, request.user):
            raise PermissionDenied("This account does not work in that program.")
        return cycle

    @staticmethod
    def _state(cycle) -> dict:
        return {
            "cycle_id": cycle.id,
            "program_id": cycle.program_id,
            "intake_open": bool(cycle.intake_key_hash),
            "hint": cycle.intake_key_hint or None,
            "issued_at": cycle.intake_key_set_at,
            "issued_by": cycle.intake_key_set_by.email if cycle.intake_key_set_by_id else None,
        }
