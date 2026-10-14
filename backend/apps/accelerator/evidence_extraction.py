"""
apps.accelerator.evidence_extraction
====================================
The port a document is read through, and the name of the answer when nothing
stands behind it.

Until now the question "what has been read out of this file?" had one answer in
code and a different one in prose. `ApplicationDocument.extraction_status`
carries four states — pending, processing, complete, failed — and the only
writer in the app sets `pending` and stops
(`AcceleratorApplicationViewSet.upload_document`), which is correct as far as it
goes. The incorrect part was everywhere that state was then *read*: a status
column saying "pending" in a system with no extractor reads to a reviewer as
"queued, coming shortly", and the reviewer waits for a number that no code will
ever fill in. `ReviewerWorkspace` went further and told them to "upload documents
to trigger the claim extraction engine", describing an engine that is not there.

So this module does two things and refuses a third.

*It states the port.* An extractor is anything that can be handed a document and
return `ExtractedStatement`s. The shape is checked against the model's own
choices, so a new extractor cannot invent a category the ledger does not carry —
the same rule `positive_int` applies to an id.

*It names the absence.* `extract_from` raises `EvidenceExtractionUnavailable`
rather than returning `[]`. An empty list is a finding — "read it, nothing
material in it" — and the two are not interchangeable, exactly as a withheld
resource is not an empty one. Callers that cannot say which of the two happened
must not render a number.

*It does not provide an extractor.* That is deliberate and stated here rather
than left to be discovered: the registry is empty on purpose in this batch, so
every read through it currently raises, and every surface that renders an
extraction state renders the reason instead of a progress bar.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol

from .models import ApplicationClaim, ApplicationDocument

#: The vocabulary a statement may be filed under, read off the model rather than
#: restated here, so a new category appears the moment it is a real choice.
CATEGORIES: tuple[str, ...] = tuple(value for value, _label in ApplicationClaim.CATEGORY_CHOICES)
MATERIALITIES: tuple[str, ...] = tuple(value for value, _label in ApplicationClaim.MATERIALITY_CHOICES)

#: The model's own four words for what has happened to a file.
DOCUMENT_STATUSES: dict[str, str] = dict(ApplicationDocument.EXTRACTION_STATUS_CHOICES)


@dataclass(frozen=True)
class ExtractedStatement:
    """One material assertion found in a document, before anyone has checked it.

    `locator` is where in the file it was found — a page, a slide, a table. It is
    not decoration: a reviewer who is asked to believe that a financial model
    says a number has to be able to go and look at it, which is the difference
    between evidence and a transcription.
    """

    text: str
    category: str
    materiality: str
    locator: str = ""

    def __post_init__(self):
        for field, allowed, given in (
            ("category", CATEGORIES, self.category),
            ("materiality", MATERIALITIES, self.materiality),
        ):
            if given not in allowed:
                raise ValueError(
                    f"Unknown {field}: {given!r}. An extracted statement can "
                    f"only be filed as one of: {', '.join(allowed)}.")
        if not self.text.strip():
            raise ValueError(
                "An extracted statement with no text records that a word was "
                "spent on nothing.")


class EvidenceExtractionUnavailable(RuntimeError):
    """Nothing standing behind the port can read this document.

    Carries the document's own identity so the caller can say *which* file this
    is about rather than reporting a generic failure.
    """

    def __init__(self, document, reason: str | None = None):
        self.document_id = getattr(document, "pk", None)
        self.document_type = getattr(document, "document_type", None)
        self.reason = reason or (
            "No extractor is wired into this deployment, so nothing has read "
            "this file and nothing is queued to.")
        super().__init__(self.reason)


class EvidenceExtractor(Protocol):
    """What this app asks for when it wants a document read."""

    name: str

    def can_read(self, document) -> bool:
        """Whether this extractor is the right one for this document."""
        ...

    def extract(self, document) -> Iterable[ExtractedStatement]:
        """The assertions found in the document. Empty means none were found."""
        ...


_REGISTRY: list[EvidenceExtractor] = []


def register(extractor: EvidenceExtractor) -> None:
    """Put an extractor behind the port.

    Append rather than replace, so two extractors over one document kind are a
    decision someone can see in `extractors()` rather than a silent precedence
    rule.
    """
    if extractor in _REGISTRY:
        return
    _REGISTRY.append(extractor)


def unregister(extractor: EvidenceExtractor) -> None:
    if extractor in _REGISTRY:
        _REGISTRY.remove(extractor)


def extractors() -> tuple[EvidenceExtractor, ...]:
    return tuple(_REGISTRY)


def has_extractors() -> bool:
    """The one question a status column cannot answer on its own."""
    return bool(_REGISTRY)


def extract_from(document) -> list[ExtractedStatement]:
    """Read a document through whatever stands behind the port.

    Raises `EvidenceExtractionUnavailable` when nothing can read it, including
    when an extractor is wired but does not claim this document type — a
    registered pitch-deck reader is not a bank-statement reader, and reporting
    "nothing found" for the mismatch would file a plumbing fact as a finding
    about the startup.
    """
    matching = [e for e in _REGISTRY if e.can_read(document)]
    if not matching:
        named = ", ".join(sorted({e.name for e in _REGISTRY})) or "none"
        raise EvidenceExtractionUnavailable(
            document,
            reason=(
                f"No extractor claims this document type "
                f"({document.document_type!r}). Extractors wired: {named}."))
    found: list[ExtractedStatement] = []
    for extractor in matching:
        found.extend(extractor.extract(document))
    return found


def extraction_state(document) -> dict:
    """What this document's extraction status means for whoever is reading it.

    One dict, so a screen cannot render `extraction_status` as a progress step
    without also rendering whether a step is even possible. `complete` with zero
    claims is a finding; `pending` with no extractor wired is not.
    """
    status = document.extraction_status
    label = DOCUMENT_STATUSES.get(status, status)
    if status == "pending":
        detail = (
            "Nothing has been read out of this file."
            + (" No extractor is wired, so nothing is queued to read it."
               if not has_extractors() else
               " An extractor is wired; it has not run on this document yet.")
        )
    elif status == "processing":
        detail = ("An extractor is working on this file now."
                  if has_extractors() else
                  "No extractor is wired, so this row cannot be true.")
    elif status == "complete":
        detail = (f"{document.extracted_claims_count} claim(s) filed from this "
                  "document.")
    elif status == "failed":
        detail = "An extractor tried and did not produce a result."
    else:
        detail = f"Unrecognised extraction status {status!r}."
    return {
        "status": status,
        "label": label,
        "can_extract": has_extractors(),
        "detail": detail,
    }
