from __future__ import annotations

import logging
from typing import Any, Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.utils import timezone

from apps.accelerator import queue_routing
from apps.accelerator.evidence_state import claim_exposure_annotations
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAssessment,
    CommitteeDecision,
    InterviewSession,
    ReviewerAssessment,
    ReviewerDisagreement,
)
from apps.accelerator.pipeline import ApplicationPipeline

User = get_user_model()
logger = logging.getLogger(__name__)

# Minimum number of DISTINCT committee member votes required before a final
# decision can be recorded. Lives server-side only — clients read it, never set it.
IC_QUORUM_MIN_VOTES = 2

TERMINAL_VOTE_CLOSURE_STATUSES = ("ACCEPTED", "REJECTED", "WITHDRAWN")

QUORUM_SUMMARY_KEYS = ("yes", "conditional", "pass", "total_votes", "quorum_required", "quorum_met")


def tally_committee_votes(application: AcceleratorApplication) -> dict[str, Any]:
    """Derive the IC vote tally from stored individual_votes rows.

    The database is the source of truth: counts are recomputed from the
    ballots themselves, never from a client-supplied summary. One voter holds
    one ballot per application — the newest write wins across workspace rows.
    """
    by_voter: dict[Any, dict[str, Any]] = {}
    # `.all()` (not .order_by()) keeps any prefetched cache; the sort is done in
    # Python so "newest write wins" holds without an extra query per candidate.
    decisions = sorted(application.committee_decisions.all(), key=lambda cd: (cd.created_at, cd.id))
    for cd in decisions:
        for v in cd.individual_votes or []:
            if not isinstance(v, dict):
                continue
            by_voter[v.get("voter_id")] = v
    votes = list(by_voter.values())

    return {
        "yes": sum(1 for v in votes if v.get("vote") == "YES"),
        "conditional": sum(1 for v in votes if v.get("vote") == "CONDITIONAL"),
        "pass": sum(1 for v in votes if v.get("vote") == "PASS"),
        "total_votes": len(votes),
        "quorum_required": IC_QUORUM_MIN_VOTES,
        "quorum_met": len(votes) >= IC_QUORUM_MIN_VOTES,
        "votes": votes,
    }


def latest_decision(application: AcceleratorApplication) -> Optional[CommitteeDecision]:
    """Newest recorded committee decision, or None while the candidate is open.

    Reads the prefetched relation so walking a whole program costs no extra
    queries per decided row.
    """
    rows = sorted(application.committee_decisions.all(), key=lambda cd: (cd.created_at, cd.id))
    return rows[-1] if rows else None


# ApplicationAssessment holds "{dimension}_confidence" only for the dimensions
# the ML engine actually scored. These three are aggregates, not dimensions, so
# they must never match a framework dimension name.
_NON_DIMENSION_CONFIDENCE_FIELDS = ("recommendation", "stage", "evidence")


def dimension_confidence(
    assessment: Optional[ApplicationAssessment], dimension_name: str
) -> Optional[float]:
    """Confidence (%) the assessment holds for one Selection Framework dimension.

    Matched by name token (so `founder_quality` finds `founder_confidence`)
    rather than a hard-coded label table. Returns None when the engine never
    scored that dimension — a custom program dimension does not inherit another
    dimension's confidence.
    """
    if assessment is None:
        return None
    tokens = {
        t for t in str(dimension_name).lower().split("_")
        if t and t not in ("score", "quality", "fit", "dimension", "assessment")
    }
    if not tokens:
        return None
    for field in assessment._meta.get_fields():
        fname = getattr(field, "name", "")
        if not fname.endswith("_confidence"):
            continue
        base = fname[: -len("_confidence")]
        if base in _NON_DIMENSION_CONFIDENCE_FIELDS:
            continue
        if tokens & set(base.split("_")):
            raw = getattr(assessment, fname, None)
            if raw is None:
                return None
            value = float(raw)
            return round(value * 100.0 if value <= 1.0 else value, 1)
    return None


def mean_conviction(reviews) -> Optional[float]:
    """Mean overall_conviction (1-10) across the scorecards given.

    ``None`` when nobody has filed one — an unrated candidate must never look
    like a zero-rated candidate."""
    scores = [float(r.overall_conviction) for r in reviews if r.overall_conviction is not None]
    if not scores:
        return None
    return round(sum(scores) / len(scores), 1)


class DecisionRoom:
    """
    Selection workspace service: aggregated pipeline funnel, dynamic candidate ranking,
    rich multi-perspective candidate dossiers, and auditable committee decision recording.
    """

    def __init__(self, program: AcceleratorProgram):
        self.program = program
        self.runtime = program.get_runtime()

    def _extract_application_dimension_scores(
        self, application: AcceleratorApplication, reviews: Optional[list[ReviewerAssessment]] = None
    ) -> dict[str, float]:
        """
        Dynamically extracts or infers scores (0-100) for every active policy dimension.
        If reviewer assessments exist, averages their dimension scores.
        Otherwise falls back to automated assessment and core application metrics.
        """
        active_dimensions = self.runtime.get_scoring_dimensions()
        scores: dict[str, float] = {}

        if reviews is None:
            reviews = list(application.reviewer_assessments.all())

        for dim in active_dimensions:
            dname = dim["name"]
            # 1. If reviews exist, average the scores for this dimension
            if reviews:
                dim_vals = [r.get_dimension_score(dname) for r in reviews]
                # Scale 1-10 to 0-100 if values are on 1-10 scale
                avg_val = sum(dim_vals) / len(dim_vals)
                scores[dname] = avg_val * 10.0 if avg_val <= 10.0 else avg_val
            else:
                # 2. Heuristic mapping from automated screening metrics
                dlower = dname.lower()
                if any(k in dlower for k in ["founder", "team", "talent"]):
                    scores[dname] = float(application.founder_score or 50.0)
                elif any(k in dlower for k in ["market", "strategic", "alignment"]):
                    scores[dname] = float(application.program_fit_score or 50.0)
                elif any(k in dlower for k in ["traction", "growth", "commercial", "adoption"]):
                    scores[dname] = float(application.startup_strength_score or 50.0)
                elif any(k in dlower for k in ["evidence", "novelty", "tech", "product"]):
                    scores[dname] = float(application.evidence_confidence_score or 50.0)
                else:
                    scores[dname] = float(application.program_fit_score or 50.0)

        return scores

    def get_selection_summary(self) -> dict[str, Any]:
        """
        Returns selection overview:
        - Funnel numbers (total, eligible, shortlisted, interviewed, committee, seats)
        - Ranked candidate list derived from program-specific scoring dimensions & weights
        """
        apps = (
            self.program.applications.select_related("startup_profile", "assessment")
            .prefetch_related(
                # select_related inside the prefetch so listing each candidate's
                # raters does not fan out into one user query per scorecard.
                Prefetch(
                    "reviewer_assessments",
                    queryset=ReviewerAssessment.objects.select_related("reviewer"),
                ),
                Prefetch(
                    "committee_decisions",
                    queryset=CommitteeDecision.objects.select_related("decided_by"),
                ),
            )
            .annotate(
                rev_count=Count("reviewer_assessments", distinct=True),
                unresolved_disagreements=Count(
                    "reviewer_disagreements",
                    filter=Q(reviewer_disagreements__resolved=False),
                    distinct=True,
                ),
                # Annotated once rather than per row: the rail shows claim
                # exposure next to each candidate and this endpoint already
                # walks every application in the program. The bundle is the same
                # one every other application readout uses, so the denominators
                # cannot disagree between the decision rail and the review queue.
                **claim_exposure_annotations(),
            )
            .all()
        )

        app_list = list(apps)
        status_counts: dict[str, int] = {}
        for a in app_list:
            status_counts[a.status] = status_counts.get(a.status, 0) + 1

        total = len(app_list)
        submitted = status_counts.get("SUBMITTED", 0)
        screening = status_counts.get("SCREENING", 0)
        shortlisted = status_counts.get("SHORTLISTED", 0)
        interviewed = status_counts.get("INTERVIEW_COMPLETE", 0)
        committee = status_counts.get("COMMITTEE_REVIEW", 0)
        accepted = status_counts.get("ACCEPTED", 0)
        rejected = status_counts.get("REJECTED", 0)
        waitlisted = status_counts.get("WAITLISTED", 0)

        candidates = []
        for app in app_list:
            if app.status in ["WITHDRAWN", "DRAFT"]:
                continue

            reviews = list(app.reviewer_assessments.all())
            dim_scores = self._extract_application_dimension_scores(app, reviews=reviews)
            weighted_score = self.runtime.compute_weighted_score(
                dimension_scores=dim_scores,
                stage=app.startup_profile.declared_stage,
                sector=app.startup_profile.sector,
            )
            cd = latest_decision(app)

            candidates.append({
                "application_id": app.id,
                "company_name": app.startup_profile.company_name,
                "submitted_at": app.submitted_at.isoformat() if app.submitted_at else None,
                "sector": app.startup_profile.sector,
                "stage": app.startup_profile.declared_stage,
                "status": app.status,
                "tier": app.automated_screening_tier,
                "weighted_score": weighted_score,
                "program_fit_score": app.program_fit_score,
                "startup_strength_score": app.startup_strength_score,
                "evidence_confidence_score": app.evidence_confidence_score,
                "reviewer_count": getattr(app, "rev_count", len(reviews)),
                "reviewers": [
                    {
                        "id": r.reviewer_id,
                        "name": (r.reviewer.full_name or r.reviewer.email) if r.reviewer else None,
                    }
                    for r in reviews
                ],
                "has_disagreements": getattr(app, "unresolved_disagreements", 0) > 0,
                # Mean of the humans' 1-10 conviction, computed here so the room
                # never re-derives it in the browser (None = nobody has scored).
                "mean_human_conviction": mean_conviction(reviews),
                "contradicted_claims": getattr(app, "n_contradicted", 0) or 0,
                "unverified_claims": getattr(app, "n_unverified", 0) or 0,
                "stage_conflict_detected": app.stage_conflict_detected,
                # Screening risk is routed by the same server module the review
                # queue uses, so the room and the queue never disagree.
                "risk": queue_routing.risk_of({
                    "status": app.status,
                    "tier": app.automated_screening_tier,
                    "stage_conflict": app.stage_conflict_detected,
                    "contradicted_claims": getattr(app, "n_contradicted", 0) or 0,
                    "unverified_claims": getattr(app, "n_unverified", 0) or 0,
                    "evidence_score": app.evidence_confidence_score,
                    "completeness": app.application_completeness_score,
                }),
                "votes": tally_committee_votes(app),
                # Null while the candidate is still open — the select list must
                # never show a placeholder date or a made-up decider.
                "final_decision": None
                if cd is None
                else {
                    "decision": cd.decision,
                    "decided_by": (cd.decided_by.full_name or cd.decided_by.email)
                    if cd.decided_by
                    else None,
                    "decided_at": cd.decided_at.isoformat(),
                    "rationale": cd.notes,
                },
            })

        # Sort candidates descending by weighted_score
        candidates.sort(key=lambda c: c["weighted_score"], reverse=True)

        return {
            "program_id": self.program.id,
            "program_name": self.program.name,
            "program_version": self.program.program_version,
            "target_cohort_size": self.program.target_cohort_size,
            "ic_quorum": {"min_votes": IC_QUORUM_MIN_VOTES},
            "funnel": {
                "total": total,
                "submitted": submitted,
                "screening": screening,
                "shortlisted": shortlisted,
                "interviewed": interviewed,
                "committee": committee,
                "accepted": accepted,
                "waitlisted": waitlisted,
                "rejected": rejected,
                "seats_remaining": max(0, self.program.target_cohort_size - accepted),
            },
            "candidates": candidates,
        }

    def get_candidate_card(self, application: AcceleratorApplication) -> dict[str, Any]:
        """
        Constructs a comprehensive candidate evaluation dossier:
        - Program Fit & weighted score
        - Evidence & Claims verification summary
        - Reviewer scorecards + disagreements
        - Interview notes & scores
        - Risk flags & contradictions
        """
        startup = application.startup_profile
        assessment = getattr(application, "assessment", None)

        # 1. Reviewer scorecards
        review_rows = list(application.reviewer_assessments.select_related("reviewer").all())
        reviews = []
        for r in review_rows:
            reviews.append({
                "reviewer_id": r.reviewer.id,
                "reviewer_name": r.reviewer.full_name or r.reviewer.email,
                "recommendation": r.recommendation,
                "overall_conviction": r.overall_conviction,
                "dimension_scores": r.dimension_scores,
                "founder_score": r.founder_score,
                "market_score": r.market_score,
                "product_score": r.product_score,
                "team_score": r.team_score,
                "traction_score": r.traction_score,
                "notes": r.notes,
                "strengths": r.strengths,
                "concerns": r.concerns,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            })

        # 2. Reviewer disagreements
        disagreements = []
        for d in application.reviewer_disagreements.all():
            disagreements.append({
                "id": d.id,
                "dimension": d.dimension,
                "variance_pct": d.variance_pct,
                "resolved": d.resolved,
                "resolution_notes": d.resolution_notes,
            })

        # 3. Interviews
        interviews = []
        for iv in application.interviews.all():
            interviews.append({
                "id": iv.id,
                "interview_type": iv.interview_type,
                "round_number": iv.round_number,
                "status": iv.status,
                "overall_score": iv.overall_interview_score,
                "scheduled_at": iv.scheduled_at.isoformat() if iv.scheduled_at else None,
                "notes": iv.interviewer_notes,
            })

        # 4. Committee Decisions
        committee_decisions = []
        for cd in application.committee_decisions.select_related("decided_by").all():
            committee_decisions.append({
                "id": cd.id,
                "decision": cd.decision,
                "decided_by": cd.decided_by.email if cd.decided_by else "System",
                "notes": cd.notes,
                "stipulations": cd.stipulations,
                "voting_summary": cd.voting_summary,
                "decided_at": cd.decided_at.isoformat(),
            })

        # 5. Claims breakdown
        claims = []
        for c in application.claims.select_related("evidence_detail").all():
            try:
                ev = c.evidence_detail
            except Exception:
                ev = None
            claims.append({
                "id": c.id,
                "claim_id": c.claim_id,
                "category": c.category,
                "claim_text": c.claim_text,
                "materiality": c.materiality,
                "verification_status": c.verification_status,
                "confidence": ev.confidence if ev else 0.0,
            })

        # 6. Loop-back evidence requests (real DD state, not a client guess)
        evidence_requests = []
        for er in application.evidence_requests.select_related("requested_by").all():
            evidence_requests.append({
                "id": er.id,
                "status": er.status,
                "requested_by": (er.requested_by.full_name or er.requested_by.email) if er.requested_by else None,
                "requested_items": er.requested_items,
                "message_to_founder": er.message_to_founder,
                "response_deadline": er.response_deadline.isoformat() if er.response_deadline else None,
                "founder_response": er.founder_response,
                "created_at": er.created_at.isoformat(),
                "resolved_at": er.resolved_at.isoformat() if er.resolved_at else None,
            })

        # Policy-weighted score
        dim_scores = self._extract_application_dimension_scores(application)
        weighted_score = self.runtime.compute_weighted_score(
            dimension_scores=dim_scores,
            stage=startup.declared_stage,
            sector=startup.sector,
        )

        # The program's own Selection Framework rows: which dimensions this
        # program scores on, their stage/sector-adjusted weights, and the score
        # each holds. Clients must not carry a hard-coded dimension list — a
        # program that dropped "product" would otherwise still be shown it.
        dimension_weights = self.runtime.get_dimension_weights(
            stage=startup.declared_stage, sector=startup.sector
        )
        dimension_rows = [
            {
                "name": d["name"],
                "label": d.get("label") or d["name"].replace("_", " ").title(),
                "description": d.get("description") or "",
                "weight": dimension_weights.get(d["name"], d.get("weight", 0.0)),
                "score": round(float(dim_scores.get(d["name"], 0.0)), 1),
                "confidence": dimension_confidence(assessment, d["name"]),
            }
            for d in self.runtime.get_scoring_dimensions()
        ]

        return {
            "application_id": application.id,
            "company_name": startup.company_name,
            "description": startup.product_description or startup.industry,
            "website": startup.website,
            "sector": startup.sector,
            "stage": startup.declared_stage,
            "country": startup.country,
            "status": application.status,
            "submitted_at": application.submitted_at.isoformat() if application.submitted_at else None,
            "automated_screening_tier": application.automated_screening_tier,
            "scores": {
                "weighted_score": weighted_score,
                "program_fit_score": application.program_fit_score,
                "startup_strength_score": application.startup_strength_score,
                "evidence_confidence_score": application.evidence_confidence_score,
                "eligibility_score": application.eligibility_score,
                "founder_score": application.founder_score,
            },
            "dimension_scores": dimension_rows,
            "assessment": {
                "overall_recommendation": assessment.overall_recommendation if assessment else "NONE",
                "recommendation_confidence": assessment.recommendation_confidence if assessment else 0.0,
                "recommendation_reasoning": assessment.recommendation_reasoning if assessment else "",
                "risk_flags": assessment.risk_flags if assessment else [],
                "bull_case": assessment.bull_case if assessment else [],
                "bear_case": assessment.bear_case if assessment else [],
                "contradictions": assessment.contradictions_detected if assessment else [],
            },
            "reviewers": reviews,
            "mean_human_conviction": mean_conviction(review_rows),
            "disagreements": disagreements,
            "interviews": interviews,
            "committee_decisions": committee_decisions,
            # Tally + de-duplicated ballots, derived here so no client re-implements
            # the "newest write per voter wins" rule.
            "vote_tally": tally_committee_votes(application),
            "claims": claims,
            "evidence_requests": evidence_requests,
        }

    @transaction.atomic
    def record_decision(
        self,
        application: AcceleratorApplication,
        decision: str,
        actor: Optional[Any] = None,
        rationale: str = "",
        stipulations: Optional[list[str]] = None,
        voting_summary: Optional[dict[str, Any]] = None,
    ) -> CommitteeDecision:
        """
        Records a formal selection decision, creates a CommitteeDecision record,
        transitions application stage via ApplicationPipeline, and logs full audit trail.
        """
        valid_decisions = ["ACCEPTED", "REJECTED", "WAITLISTED", "EVIDENCE_REQUESTED", "DEFERRED"]
        if decision not in valid_decisions:
            raise ValueError(f"Invalid decision '{decision}'. Must be one of {valid_decisions}")

        # Quorum: recomputed from the stored ballots, not from whatever the
        # caller sent — and it gates the decision. A committee of one cannot
        # finalize here.
        tally = tally_committee_votes(application)
        if not tally["quorum_met"]:
            raise ValueError(
                f"Committee quorum not met: {tally['total_votes']} of "
                f"{IC_QUORUM_MIN_VOTES} required distinct votes cast."
            )
        summary = {**(voting_summary or {})}
        for key in ("yes", "conditional", "pass", "total_votes", "quorum_required", "quorum_met"):
            summary[key] = tally[key]

        # Record CommitteeDecision
        committee_record = CommitteeDecision.objects.create(
            application=application,
            decision=decision,
            decided_by=actor,
            notes=rationale,
            stipulations=stipulations or [],
            vote_summary=summary,
            decided_at=timezone.now(),
        )

        # Advance application stage via audited pipeline
        pipeline = ApplicationPipeline(application)
        target_stage = decision
        if decision == "ACCEPTED":
            target_stage = "ACCEPTED"
        elif decision == "REJECTED":
            target_stage = "REJECTED"
        elif decision == "WAITLISTED":
            target_stage = "WAITLISTED"
        elif decision == "EVIDENCE_REQUESTED":
            target_stage = "EVIDENCE_REQUESTED"
        elif decision == "DEFERRED":
            target_stage = "DEFERRED"

        # Compute immutable SHA-256 snapshot hash of the dossier & decision
        import hashlib, json
        snapshot_payload = {
            "application_id": application.id,
            "company_name": application.startup_profile.company_name,
            "decision": decision,
            "decided_by": getattr(actor, "email", "System"),
            "startup_strength_score": application.startup_strength_score,
            "claims_count": application.claims.count(),
            "decided_at": committee_record.decided_at.isoformat(),
            "rationale": rationale,
            "quorum_met": summary.get("quorum_met", True),
        }
        snapshot_hash = hashlib.sha256(
            json.dumps(snapshot_payload, sort_keys=True).encode("utf-8")
        ).hexdigest()

        pipeline.advance(
            to_stage=target_stage,
            actor=actor,
            reason=f"Committee decision recorded: {decision}. {rationale}".strip(),
            evidence_snapshot=snapshot_payload,
            snapshot_hash=snapshot_hash,
            is_automated=False,
        )

        return committee_record
