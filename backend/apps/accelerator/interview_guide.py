"""Deterministic interview guide, built from stored assessment and claim rows.

Why it lives here: the same evidence gaps must produce the same probes on every
surface (interview workspace, candidate dossier, committee pack), and the
workspace used to re-derive them in the browser from templates. No model call
happens here and nothing is invented — every probe names a stored weak score,
a stored bear-case point, a stored stage conflict or a stored claim.

Probes carry a `severity` (high | medium | info), never styling: the client
owns presentation, this module owns which questions the record justifies.
"""
from __future__ import annotations

from typing import Any, Optional

from apps.accelerator.models import (
    AcceleratorApplication,
    ApplicationAssessment,
    materiality_ordering,
)

# A dimension only counts as weak when the assessment actually scored it below
# this line. A missing score is never weak and never zero.
WEAK_DIMENSION_PCT = 55

# Only these verification states leave a claim open enough to ask about.
OPEN_VERIFICATION_STATES = ("unverified", "contradicted", "pending", "partially_verified")

_MAX_CLAIM_PROBES = 6

# Dimension name -> (probe key, question, tag, severity). Ordered: evidence
# questions first, because those are the ones a founder can answer on the call.
_DIMENSION_PROBES: tuple[tuple[str, str, str, str, str], ...] = (
    ("traction_score", "q-traction",
     "Walk us through your last 90 days of traction and revenue — and who verified "
     "the numbers you submitted.",
     "Traction evidence", "high"),
    ("revenue_score", "q-revenue",
     "Show the revenue line live: which customers paid in the last month, at what "
     "amount, and how much is recurring?",
     "Revenue evidence", "high"),
    ("team_score", "q-team",
     "Who is building this full-time today, what have each of them shipped before, "
     "and who is missing for the next 12 months?",
     "Team depth", "medium"),
    ("founder_score", "q-founder",
     "What is the hardest call you have made as a founder in the last six months, "
     "and what did it cost you?",
     "Founder judgement", "medium"),
    ("product_score", "q-product",
     "What is live that a customer used yesterday — and what in your application is "
     "still only designed?",
     "Product reality", "medium"),
    ("market_score", "q-market",
     "Name ten buyers who would pay for this next quarter. Why them, and what have "
     "you already heard from them?",
     "Market pull", "medium"),
)


def _to_pct(value: Any) -> Optional[float]:
    """Normalise a dimension score to the 0-100 evidence ladder.

    Assessment dimensions are stored 1-10 while aggregates are 0-100; a value
    that is absent or non-numeric stays None rather than becoming 0.
    """
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return round(n * 10.0 if n <= 10.0 else n, 1)


def _humanise(value: str) -> str:
    return " ".join((value or "").replace("-", "_").split()).title() or "—"


# The assessment columns that are aggregates, not Selection Framework
# dimensions — a pool strength ladder must never rank these as if they were a
# scored dimension.
_AGGREGATE_CONFIDENCE_FIELDS = ("recommendation", "stage", "evidence", "completeness")


def dimension_score_fields() -> list[str]:
    """The `*_score` assessment fields that pair with a `*_confidence` field.

    Derived from the model so a dimension is never added here by hand and drifts
    from what the ML engine actually writes. Aggregates (recommendation, stage,
    evidence, completeness) are excluded — they are not framework dimensions.
    """
    names = {f.name for f in ApplicationAssessment._meta.get_fields()}
    out: list[str] = []
    for fname in sorted(names):
        if not fname.endswith("_score"):
            continue
        base = fname[: -len("_score")]
        if base in _AGGREGATE_CONFIDENCE_FIELDS:
            continue
        if f"{base}_confidence" in names:
            out.append(fname)
    return out


def pool_strength_ladder(assessments) -> list[dict[str, Any]]:
    """Rank the framework dimensions by mean stored score across the pool.

    A dimension is only counted on an application that actually scored it: a
    0.0 score with no recorded confidence is an unscored row, not a zero, so it
    is left out of both the average and the denominator. Dimensions no
    application scored return an empty list, never a fabricated ranking.
    """
    fields = dimension_score_fields()
    totals: dict[str, list[float]] = {f: [] for f in fields}
    for a in assessments:
        for field in fields:
            base = field[: -len("_score")]
            raw = getattr(a, field, None)
            pct = _to_pct(raw)
            if pct is None:
                continue
            conf = getattr(a, f"{base}_confidence", 0.0) or 0.0
            if pct == 0.0 and not conf:
                continue  # unscored default, not a zero — missing is not zero
            totals[field].append(pct)

    ladder: list[dict[str, Any]] = []
    for field in fields:
        values = totals[field]
        if not values:
            continue
        base = field[: -len("_score")]
        ladder.append({
            "key": base,
            "label": _humanise(base),
            "avg_score": round(sum(values) / len(values), 1),
            "scored_count": len(values),
        })
    ladder.sort(key=lambda d: (-d["avg_score"], d["label"]))
    return ladder


def build_interview_guide(application: AcceleratorApplication) -> dict[str, Any]:
    """Return the probes and areas-to-explore this application's record justifies."""
    assessment = getattr(application, "assessment", None)
    probes: list[dict[str, Any]] = []
    explore: list[dict[str, Any]] = []

    if assessment is not None:
        for field, key, question, tag, severity in _DIMENSION_PROBES:
            pct = _to_pct(getattr(assessment, field, None))
            if pct is None or pct >= WEAK_DIMENSION_PCT:
                continue
            if pct == 0.0 and not getattr(assessment, f"{field[:-6]}_confidence", 0.0):
                # A 0.0 score with no recorded confidence is the model default of
                # an unscored row, not a judgement that the dimension is zero.
                # Missing is not zero, so no probe is built from it.
                continue
            probes.append({
                "key": key,
                "question": question,
                "tag": tag,
                "severity": severity,
                "detail": f"ML screening scored {field[:-6]} {pct}/100.",
            })

        if getattr(assessment, "stage_conflict", False):
            declared = _humanise(str(getattr(assessment, "declared_stage", "") or ""))
            inferred = _humanise(str(getattr(assessment, "inferred_stage", "") or ""))
            statement = (
                getattr(assessment, "stage_conflict_explanation", "")
                or f"Declared stage ({declared}) does not match the inferred stage ({inferred})."
            )
            explore.append({
                "key": "explore-stage", "question": statement,
                "tag": "Stage conflict", "severity": "high",
            })
            probes.append({
                "key": "q-stage",
                "question": f"You declare {declared} but the evidence reads {inferred}. What has actually shipped?",
                "tag": "Stage conflict", "severity": "high",
            })

        for i, item in enumerate(list(getattr(assessment, "bear_case", []) or [])[:4]):
            point = str(item.get("point") or "").strip() if isinstance(item, dict) else str(item).strip()
            if not point:
                continue
            explore.append({
                "key": f"explore-bear-{i}", "question": point,
                "tag": "Bear case", "severity": "medium",
                "detail": (item.get("strength") if isinstance(item, dict) else None),
            })
            if i < 3:
                probes.append({
                    "key": f"q-bear-{i}",
                    "question": f"{point} — how do you answer this, with evidence rather than intent?",
                    "tag": "Bear case", "severity": "medium",
                })

        for i, flag in enumerate(list(getattr(assessment, "risk_flags", []) or [])[:4]):
            if not isinstance(flag, dict):
                continue
            severity = str(flag.get("severity") or "").lower()
            if severity not in ("high", "critical"):
                continue
            explore.append({
                "key": f"explore-risk-{i}",
                "question": str(flag.get("risk") or "").strip(),
                "tag": f"{severity} risk",
                "severity": "high",
                "detail": flag.get("mitigation"),
            })

    # Claims: name the exact open claim, and quote the discrepancy where the
    # verification record holds one.
    open_claims = [
        c for c in application.claims.order_by(*materiality_ordering())
        if (c.verification_status or "").lower() in OPEN_VERIFICATION_STATES
    ]
    for i, claim in enumerate(open_claims[:_MAX_CLAIM_PROBES]):
        contradicted = (claim.verification_status or "").lower() == "contradicted"
        notes = (claim.discrepancy_notes or "").strip()
        probes.append({
            "key": f"q-claim-{claim.pk}",
            "question": (
                f"You state: \"{claim.claim_text}\". The submitted evidence disagrees"
                f"{f': {notes}' if notes else ''}. Which is right?"
                if contradicted else
                f"You claim: \"{claim.claim_text}\". What can you show us live that evidences it?"
            ),
            "tag": "Contradicted claim" if contradicted else "Unverified claim",
            "severity": "high" if contradicted else "info",
            "detail": notes or None,
        })
        if contradicted:
            explore.append({
                "key": f"explore-claim-{claim.pk}",
                "question": claim.claim_text,
                "tag": "Contradiction",
                "severity": "high",
                "detail": notes or None,
            })

    return {
        "application_id": application.pk,
        "assessment_present": assessment is not None,
        "open_claims": len(open_claims),
        "probes": probes,
        "areas_to_explore": explore,
    }
