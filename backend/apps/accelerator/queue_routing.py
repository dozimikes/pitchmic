"""Review-queue routing and screening risk — one implementation, on the server.

The dashboard used to re-derive both in the browser. That is how the counters
and the tabs came to disagree: the cards read server aggregates while the rows
were bucketed by a local copy of the rules. The API now owns the routing, so a
row, its tab count and its card all come from the same predicates.

Doctrine: these are ATTENTION lanes, not verdicts. Nothing here decides whether
a startup is admitted — it only says where human review should go first.
"""
from __future__ import annotations

from typing import Any, Optional

from . import evidence_state

# Thresholds the lanes are drawn at. A missing score is never read as zero, so
# `None` evidence/completeness contributes nothing.
EVIDENCE_THIN_BELOW = 45.0
COMPLETENESS_HOLD_BELOW = 40.0
UNVERIFIED_CLAIMS_MANY = 3

QUEUE_BUCKETS = ("priority", "investigate", "hold", "needs_evidence", "wildcard")

# Statuses still inside the active funnel. Only these rows get a review-queue
# lane: a decided or never-submitted application is not waiting for attention.
# views.py reads this list for its own aggregates so the two cannot drift.
ACTIVE_FUNNEL_STATUSES = (
    "SUBMITTED", "SCREENING", "SHORTLISTED", "INTERVIEW_INVITED",
    "INTERVIEW_COMPLETE", "COMMITTEE_REVIEW", "EVIDENCE_REQUESTED",
    "WAITLISTED", "DEFERRED",
)


def _num(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return None if n != n else n  # NaN never routes a row


def risk_points(
    *,
    stage_conflict: bool = False,
    contradicted_claims: int = 0,
    unverified_claims: int = 0,
    evidence_score: Any = None,
    completeness: Any = None,
) -> tuple[int, list[str]]:
    """Screening risk as points plus the human-readable reasons behind them."""
    points = 0
    reasons: list[str] = []
    if stage_conflict:
        points += 2
        reasons.append("Declared stage conflicts with metrics")
    if (contradicted_claims or 0) > 0:
        points += 2
        reasons.append("Contradicted claims")
    if (unverified_claims or 0) >= UNVERIFIED_CLAIMS_MANY:
        points += 1
        reasons.append("Multiple unverified claims")
    ev = _num(evidence_score)
    if ev is not None and ev < EVIDENCE_THIN_BELOW:
        points += 1
        reasons.append("Thin evidence base")
    comp = _num(completeness)
    if comp is not None and comp < COMPLETENESS_HOLD_BELOW:
        points += 1
        reasons.append("Incomplete application")
    return points, reasons


def risk_level(points: int) -> str:
    return "High" if points >= 3 else ("Medium" if points >= 1 else "Low")


def signal_fields(app) -> dict[str, Any]:
    """The stored/annotated values routing reads. Claim counts prefer the
    viewset's annotations (no N+1) and fall back to the relation."""
    unverified = getattr(app, "n_unverified", None)
    if unverified is None:
        unverified = app.claims.filter(evidence_state.open_q()).count()
    contradicted = getattr(app, "n_contradicted", None)
    if contradicted is None:
        contradicted = app.claims.filter(evidence_state.contradicted_q()).count()
    return {
        "status": app.status,
        "tier": app.automated_screening_tier,
        "stage_conflict": bool(app.stage_conflict_detected),
        "contradicted_claims": contradicted,
        "unverified_claims": unverified,
        "evidence_score": app.evidence_confidence_score,
        "completeness": app.application_completeness_score,
    }


def risk_of(signals: dict[str, Any]) -> dict[str, Any]:
    points, reasons = risk_points(
        stage_conflict=signals["stage_conflict"],
        contradicted_claims=signals["contradicted_claims"],
        unverified_claims=signals["unverified_claims"],
        evidence_score=signals["evidence_score"],
        completeness=signals["completeness"],
    )
    return {"level": risk_level(points), "points": points, "reasons": reasons}


def queue_bucket(signals: dict[str, Any]) -> str:
    """Exactly one lane per application. Precedence is deliberate:

    priority        tier A — strong evidence and fit, deserves eyes first
    investigate     a contradiction on the record (stage or claim)
    hold            deferred/waitlisted, or too little submitted to assess
    needs_evidence  nothing contradicts, but the claims are unverified or thin
    wildcard        screened, consistent, and simply not in the above lanes
    """
    if signals["tier"] == "A":
        return "priority"
    if signals["stage_conflict"] or (signals["contradicted_claims"] or 0) > 0:
        return "investigate"
    comp = _num(signals["completeness"])
    if signals["status"] in ("DEFERRED", "WAITLISTED") or (
        comp is not None and comp < COMPLETENESS_HOLD_BELOW
    ):
        return "hold"
    ev = _num(signals["evidence_score"])
    if (signals["unverified_claims"] or 0) >= UNVERIFIED_CLAIMS_MANY or (
        ev is not None and ev < EVIDENCE_THIN_BELOW
    ):
        return "needs_evidence"
    return "wildcard"


def route_app(app) -> dict[str, Any]:
    """risk + bucket for one application instance (serializer path)."""
    signals = signal_fields(app)
    risk = risk_of(signals)
    in_funnel = signals["status"] in ACTIVE_FUNNEL_STATUSES
    return {
        "risk_level": risk["level"],
        "risk_points": risk["points"],
        "risk_reasons": risk["reasons"],
        # None, not a lane: a decided or never-submitted application is not
        # waiting for reviewer attention.
        "queue_bucket": queue_bucket(signals) if in_funnel else None,
    }
