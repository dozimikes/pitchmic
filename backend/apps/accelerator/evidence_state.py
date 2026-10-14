"""
apps.accelerator.evidence_state
===============================
One place that says what a claim's verification state *means*.

The states themselves live on the model — `ApplicationClaim.VERIFICATION_STATUS_CHOICES`
is the source of truth and this module reads them off it rather than keeping a
second list that could drift. What lives here is the interpretation, which six
call sites used to each re-implement as a literal:

    verification_status__in=["pending", "unverified"]   # five times, four files

The duplication was not cosmetic. Two of those five read the pair as one number
and described it to a human as "pending", which is a claim about a state the row
does not hold; and a rule change ("a contradicted claim also owes attention")
would have had to be made in five places, where making it in four and missing one
silently changes what the review queue routes.

The vocabulary, stated once:

``pending``
    Nobody has looked. The claim arrived with the application or an interview
    and is untouched. This is the *initial* state and the only one any ingestion
    path writes today.
``unverified``
    Someone looked and the evidence does not carry it. Not "no evidence exists"
    — "evidence was sought and did not establish the claim".
``partially_verified``
    The evidence establishes less than the claim asserts. "100 signed LOIs" with
    61 current ones found is this state, and the count that matters is the gap,
    not the label.
``verified``
    A named human checked it against evidence and found the claim holds. This is
    the one state a model must not reach for: a machine can attach the evidence
    and say what it found, and the decision that the claim *holds* belongs to a
    reviewer whose identity the record can show.
``contradicted``
    The evidence says something else. The strongest signal in the whole record
    layer, which is why it is separated from "unverified" everywhere a number is
    counted, and never folded into "done".
``flagged``
    A human put a marker on it without deciding: needs a second reader, needs a
    document that does not exist yet, needs the founder on a call.

Two facts about the boundary between these states are worth keeping in mind when
reading the rest of the system, because they are easy to lose:

* **The five non-`pending` states are all human decisions.** `pending` is what
  ingestion leaves behind; reaching any other state takes a reviewer's act on the
  verification endpoint. So a readout that counts them is reporting what humans
  have decided, and a zero there means nobody has looked yet — not that nothing is
  wrong.
* **A state is not a score.** Nothing in the pipeline turns a claim's state into a
  number attached to a candidate; the states route attention, and the decision
  about the candidate stays with the committee.
"""
from __future__ import annotations

from typing import Iterable

from django.db.models import Count, Q

from .models import ApplicationClaim

_FIELD = ApplicationClaim._meta.get_field("verification_status")

#: code -> the model's own label. Read off the field, so a new choice appears here
#: the moment it appears on the model, and a screen offering a title the database
#: does not carry is not possible from this module.
LABELS: dict[str, str] = dict(_FIELD.choices)
STATES: tuple[str, ...] = tuple(LABELS)

PENDING = "pending"
UNVERIFIED = "unverified"
PARTIALLY_VERIFIED = "partially_verified"
VERIFIED = "verified"
CONTRADICTED = "contradicted"
FLAGGED = "flagged"

#: Still owes a look: nobody has examined the evidence, or examined it and not
#: established the claim. These two are one *attention* bucket and two *facts* —
#: anything that reports them must say which one it means.
OPEN_STATES: tuple[str, ...] = (PENDING, UNVERIFIED)

#: A human has decided, in every direction. A claim in this set is not "done";
#: it is settled, which is a different thing.
DECIDED_STATES: tuple[str, ...] = (
    PARTIALLY_VERIFIED, VERIFIED, CONTRADICTED,
)

#: The states that can only be reached by a named human's decision. `pending` is
#: the one state ingestion writes; nothing else may set these by inference.
HUMAN_DECIDED_STATES: tuple[str, ...] = (
    UNVERIFIED, PARTIALLY_VERIFIED, VERIFIED, CONTRADICTED, FLAGGED,
)

#: A decision that changes what a reader believes about a claim has to say why.
#: `pending` is here because sending a decided claim back to it is a decision too
#: — somebody is undoing a call — and the silent version looks exactly like
#: nobody ever looked.
NOTE_REQUIRED_STATES: tuple[str, ...] = (
    PENDING, UNVERIFIED, PARTIALLY_VERIFIED, CONTRADICTED, FLAGGED,
)

#: The one state whose precondition is evidence rather than prose. The others take
#: a reason; this one takes something in hand, because with nothing attached
#: `verified` records only that a button was pressed.
EVIDENCE_REQUIRED_STATES: tuple[str, ...] = (VERIFIED,)


def corroborating_evidence(claim) -> list[str]:
    """What the claim actually has attached, named in the reader's words.

    An interview citation is deliberately not in here. A founder saying it on a
    call is a source for the claim — which is why the claim exists — and it is not
    corroboration of it, or every application would verify itself by talking.
    """
    from .models import ClaimEvidence  # local: this module is imported by models' siblings

    found: list[str] = []
    if getattr(claim, "source_document_id", None):
        found.append("the document it was extracted from")
    if ClaimEvidence.objects.filter(claim_id=claim.pk).exists():
        found.append("a recorded verification result")
    return found



def is_state(value) -> bool:
    return value in LABELS


def label(value) -> str:
    """The model's own wording for a state, or the value it does not know."""
    return LABELS.get(value, value)


# ── query building ────────────────────────────────────────────────────────────

def _q(states: Iterable[str], prefix: str) -> Q:
    return Q(**{f"{prefix}verification_status__in": list(states)})


def open_q(prefix: str = "") -> Q:
    """Claims nobody has settled. `prefix` is the relation, e.g. ``"claims__"``."""
    return _q(OPEN_STATES, prefix)


def contradicted_q(prefix: str = "") -> Q:
    return _q((CONTRADICTED,), prefix)


def verified_q(prefix: str = "") -> Q:
    return _q((VERIFIED,), prefix)


def partially_verified_q(prefix: str = "") -> Q:
    return _q((PARTIALLY_VERIFIED,), prefix)


def decided_q(prefix: str = "") -> Q:
    return _q(DECIDED_STATES, prefix)


def claim_exposure_annotations(prefix: str = "claims") -> dict:
    """The claim counts every application readout shows, annotated once.

    The keys are the ones the serializers, the routing signals and the stored
    automation rules already read, so this bundle changes where the numbers come
    from and not what they mean. `n_unverified` keeps its name while it keeps its
    meaning: it is the *open* bucket — nobody has looked, or looked and not
    established the claim — because routing rules saved in the database and the
    review-queue payload both address it by that name, and quietly redefining it
    as one of its two halves would move candidates between queues with no one
    deciding it.

    The denominator rule it exists to enforce: a claim is either open or decided,
    never both, and `n_contradicted` is counted apart from `n_verified` so
    diligence progress cannot read a contradicted claim as a finished one.
    """
    relation = f"{prefix}__"
    return {
        "n_claims": Count(prefix, distinct=True),
        "n_unverified": Count(prefix, filter=open_q(relation), distinct=True),
        "n_contradicted": Count(prefix, filter=contradicted_q(relation), distinct=True),
        "n_verified": Count(prefix, filter=verified_q(relation), distinct=True),
    }


# ── what the running system can actually reach ────────────────────────────────
#
# `pending` is the only state ingestion writes, so every other state in the
# vocabulary is a human decision by construction: the verification endpoint
# refuses a request that does not arrive as one. A count of `HUMAN_DECIDED_STATES`
# is therefore a report of what reviewers have decided, and a zero there means
# nobody has looked yet — which is not the same fact as "nothing is wrong".

# ── the same words next door: intelligence_engine's RawFact ───────────────────
#
# `apps.intelligence_engine.models_core.RawFact.VerificationStatus` is a second
# five-state vocabulary over the same underlying fact pattern — something was
# read out of a document, and somebody or something has or has not confirmed it.
# The two lists look close enough that a mapping table between them would be
# written in five lines, and those five lines would be wrong in three places:
#
# * The engine's `verified` and `contradicted` are reachable by machines.
#   `EvidenceEngine._check_conflict` raises a contradiction from a value
#   comparison across sources, with no reviewer in the loop. Here, both words are
#   reserved for a named human's act — that reservation is the whole reason the
#   verification endpoint exists. Mapped straight through, an inferred conflict
#   would arrive in the ledger wearing a human's signature, and the count of
#   `HUMAN_DECIDED_STATES` would stop meaning what this module says it means.
# * `rejected` means "failed validation" — a schema or type rule said no. It is
#   not "a person looked for evidence and did not find it" (`unverified`), and
#   folding the two together would report a plumbing outcome as a finding about
#   the startup.
# * `stale` has no counterpart at all: the ledger carries no notion of a claim
#   whose evidence was superseded. The nearest local state would be a rounding,
#   so there is none.
#
# The mapping that survives that is one-directional and narrow: an engine fact
# may only ever *create* an open claim, and a local decision may only be
# published outward in the two words whose meaning both sides agree on.

#: The state a claim created from an engine fact is allowed to start in. Always
#: the one state that asserts nobody has decided anything yet.
ENGINE_IMPORT_STATE = PENDING


class UnmappableState(ValueError):
    """The target vocabulary has no word for this fact.

    Raised rather than answered with the nearest state, because the nearest state
    is a sentence about a human who was not there.
    """


def _engine_choices() -> dict[str, str]:
    """The engine's own list, read off its field rather than copied here.

    A second hardcoded list would be a second source of truth, and the drift this
    module exists to prevent. Imported lazily: the accelerator does not depend on
    the intelligence layer, and this file is read by people who need it to stay
    stand-alone.
    """
    from apps.intelligence_engine.models_core import RawFact

    return dict(RawFact._meta.get_field("verification_status").choices)


def engine_states() -> tuple[str, ...]:
    return tuple(_engine_choices())


def engine_label(code: str) -> str:
    """The engine's own wording, for a readout that shows provenance as itself."""
    return _engine_choices().get(code, code)


#: Local state -> engine state, where both sides mean the same act.
#:
#: `verified` and `contradicted` map because a human's conclusion, once recorded
#: here, *is* the corroboration and the conflict the engine's words describe.
#: `pending` maps to `extracted` — both say "arrived, unexamined".
#:
#: The three that are absent are the point of the table. `unverified` is a
#: reviewer's finding that the evidence does not carry the claim, which the
#: engine's `rejected` (a failed validation rule) does not say;
#: `partially_verified` has no engine word at all; and `flagged` — a marker that
#: deliberately decides nothing — has nowhere to go in a vocabulary with no
#: undecided state. A caller that needs one of those published outward has to add
#: the state to the engine, which is a decision someone can see in a diff.
TO_ENGINE: dict[str, str] = {
    PENDING: "extracted",
    VERIFIED: "verified",
    CONTRADICTED: "contradicted",
}

#: The engine states that travel into the ledger only as provenance, never as a
#: state of their own — which is every one of them, and the reason `from_engine`
#: has a branch rather than a table.


def to_engine(local_state: str) -> str:
    """The engine's word for a state this ledger holds.

    Raises `UnmappableState` rather than guessing. The message names the state and
    lists the local words that do cross, so the caller learns the boundary from
    the refusal.
    """
    if local_state not in LABELS:
        raise UnmappableState(
            f"{local_state!r} is not a state this ledger carries. Known states: "
            f"{', '.join(STATES)}.")
    if local_state not in TO_ENGINE:
        raise UnmappableState(
            f"No intelligence_engine state means {label(local_state)!r}. The "
            f"states that cross are {', '.join(sorted(TO_ENGINE))}; the rest are "
            "human decisions the engine has no word for.")
    return TO_ENGINE[local_state]


def from_engine(engine_state: str) -> str:
    """What to put in `verification_status` for a fact that arrived from the engine.

    `pending`, whatever the engine called it — and the refusal to translate a
    machine's word into a human's is the whole function. A readout that needs to
    show what the extraction layer believed has `engine_label` for that, so the
    engine's state stays visible as provenance instead of being spent as a
    decision. Refuses a state the engine does not carry, by name.
    """
    if engine_state not in _engine_choices():
        raise UnmappableState(
            f"{engine_state!r} is not a state intelligence_engine carries. Known "
            f"states: {', '.join(engine_states())}.")
    return ENGINE_IMPORT_STATE


