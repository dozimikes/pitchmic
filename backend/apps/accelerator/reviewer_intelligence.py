"""
apps.accelerator.reviewer_intelligence
======================================
Reviewer Intelligence & Calibration Service (Phase 2).

Provides:
1. Intelligent Reviewer Matching:
   - Topic/sector expertise matching against startup domain.
   - Workload & capacity balancing (respects availability_hours and max_active_reviews).
   - Strict conflict-of-interest check against disclosed entities.
2. Scoring Pattern & Calibration Analytics:
   - Inter-reviewer agreement and dimension-level variance detection.
   - Flags significant variances into ReviewerDisagreement records.
   - Computes reviewer tendency (balanced, lenient, harsh) for decision support.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from django.contrib.auth import get_user_model
from django.db.models import Avg

from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ReviewerAssessment,
    ReviewerDisagreement,
    ReviewerProfile,
)

User = get_user_model()
logger = logging.getLogger(__name__)

CORPORATE_STOPWORDS = {
    "inc", "incorporated", "ltd", "limited", "corp", "corporation",
    "llc", "co", "company", "group", "labs", "lab", "technologies",
    "technology", "tech", "solutions", "ventures", "capital", "partners",
    "global", "holdings", "io", "ai", "app"
}


def _has_entity_conflict(entity_name: str, company_name: str) -> bool:
    """
    Robust entity conflict matching preventing false positives from short substrings
    (e.g., 'AI', 'In', 'Tech') while correctly flagging exact or significant token overlaps.
    """
    if not entity_name or not company_name:
        return False

    norm_entity = re.sub(r"[^a-z0-9]", "", entity_name.lower())
    norm_company = re.sub(r"[^a-z0-9]", "", company_name.lower())
    if norm_entity and norm_entity == norm_company:
        return True

    # Tokenize words >= 3 chars ignoring standard corporate stop words
    entity_tokens = {
        t for t in re.findall(r"\b[a-z0-9]+\b", entity_name.lower())
        if len(t) >= 3 and t not in CORPORATE_STOPWORDS
    }
    company_tokens = {
        t for t in re.findall(r"\b[a-z0-9]+\b", company_name.lower())
        if len(t) >= 3 and t not in CORPORATE_STOPWORDS
    }

    if not entity_tokens or not company_tokens:
        return norm_entity == norm_company and len(norm_entity) >= 3

    overlap = entity_tokens.intersection(company_tokens)
    return len(overlap) > 0


class ReviewerIntelligence:
    """
    Reviewer assignment recommendations, conflict detection, and calibration analysis.
    """

    def __init__(self, program: AcceleratorProgram):
        self.program = program
        self.runtime = program.get_runtime()

    def get_assignment_recommendations(
        self, application: AcceleratorApplication, limit: int = 5
    ) -> list[dict[str, Any]]:
        """
        Ranks available reviewers for an application based on:
        - Domain/sector alignment
        - Stage alignment
        - Current review workload vs capacity
        - Disclosed conflicts of interest (immediate filter/disqualification)
        """
        startup = application.startup_profile
        sector = (startup.sector or "").lower()
        stage = (startup.declared_stage or "").lower()
        company_name = startup.company_name.lower()

        profiles = ReviewerProfile.objects.filter(is_active=True).select_related("user")
        recommendations = []

        for prof in profiles:
            # 1. Conflict of interest check
            conflicts = prof.conflict_disclosures or []
            has_conflict = False
            conflict_reason = ""
            for conf in conflicts:
                entity = str(conf.get("entity", "")).strip()
                if entity and _has_entity_conflict(entity, startup.company_name):
                    has_conflict = True
                    conflict_reason = f"Conflict disclosed: {conf.get('type', 'relationship')} with {conf.get('entity')}"
                    break

            if has_conflict:
                continue

            # 2. Sector match score (0–40)
            sector_score = 0.0
            prof_sectors = [s.lower() for s in (prof.sector_expertise or [])]
            if sector and any(s in sector for s in prof_sectors):
                sector_score = 40.0
            elif not prof_sectors:
                sector_score = 20.0  # Generalist

            # 3. Stage match score (0–30)
            stage_score = 0.0
            prof_stages = prof.stage_expertise or {}
            if stage in prof_stages:
                stage_score = min(30.0, float(prof_stages[stage]) * 3.0)
            else:
                stage_score = 15.0

            # 4. Workload penalty (0–30)
            active_reviews = ReviewerAssessment.objects.filter(
                reviewer=prof.user,
                application__status__in=["SCREENING", "SHORTLISTED"]
            ).count()
            capacity = max(1, prof.max_active_reviews)
            load_ratio = min(1.0, active_reviews / capacity)
            workload_score = round(30.0 * (1.0 - load_ratio), 1)

            total_match_score = round(sector_score + stage_score + workload_score, 1)

            recommendations.append({
                "reviewer_id": prof.user.id,
                "name": prof.user.full_name or prof.user.email,
                "email": prof.user.email,
                "title": prof.title,
                "organization": prof.organization,
                "total_match_score": total_match_score,
                "sector_match_score": sector_score,
                "stage_match_score": stage_score,
                "workload_score": workload_score,
                "active_reviews": active_reviews,
                "max_capacity": capacity,
                "total_completed": prof.total_reviews_completed,
            })

        # Sort by highest match score
        recommendations.sort(key=lambda x: x["total_match_score"], reverse=True)
        return recommendations[:limit]

    def detect_and_record_disagreements(
        self, application: AcceleratorApplication, variance_threshold_pct: float = 25.0
    ) -> list[ReviewerDisagreement]:
        """
        Compares all pairs of submitted reviewer assessments for this application.
        When score variance on any dimension exceeds threshold (default 25%), creates
        a ReviewerDisagreement record.
        """
        reviews = list(
            ReviewerAssessment.objects.filter(application=application).select_related("reviewer")
        )
        if len(reviews) < 2:
            return []

        dimensions = [d["name"] for d in self.runtime.get_scoring_dimensions()]
        if not dimensions:
            dimensions = ["founder", "market", "product", "team", "traction"]

        created_disagreements = []

        for i in range(len(reviews)):
            for j in range(i + 1, len(reviews)):
                rev_a = reviews[i]
                rev_b = reviews[j]

                for dim in dimensions:
                    score_a = rev_a.get_dimension_score(dim)
                    score_b = rev_b.get_dimension_score(dim)
                    diff = abs(score_a - score_b)
                    max_score = max(score_a, score_b, 1.0)
                    variance_pct = round((diff / max_score) * 100, 1)

                    if variance_pct >= variance_threshold_pct:
                        # Avoid duplicates
                        existing = ReviewerDisagreement.objects.filter(
                            application=application,
                            dimension=dim,
                            reviewer_a=rev_a,
                            reviewer_b=rev_b,
                        ).first()

                        if not existing:
                            disagreement = ReviewerDisagreement.objects.create(
                                application=application,
                                dimension=dim,
                                variance_pct=variance_pct,
                                reviewer_a=rev_a,
                                reviewer_b=rev_b,
                                resolution_notes=f"Auto-detected variance: {rev_a.reviewer.email} ({score_a:.1f}) vs {rev_b.reviewer.email} ({score_b:.1f}) on {dim}.",
                            )
                            created_disagreements.append(disagreement)

        return created_disagreements

    def get_calibration_report(self) -> dict[str, Any]:
        """
        Analyzes all reviewers in this program to compute dimension variance,
        scoring tendencies, and inter-reviewer reliability.
        """
        reviews = ReviewerAssessment.objects.filter(
            application__program=self.program
        ).select_related("reviewer")

        if not reviews.exists():
            return {
                "program_id": self.program.id,
                "total_reviews": 0,
                "reviewers_analyzed": 0,
                "dimension_averages": {},
                "reviewer_profiles": [],
            }

        # Global dimension averages
        dimensions = [d["name"] for d in self.runtime.get_scoring_dimensions()]
        if not dimensions:
            dimensions = ["founder", "market", "product", "team", "traction"]

        dim_sums = {d: 0.0 for d in dimensions}
        dim_counts = {d: 0 for d in dimensions}
        reviewer_data: dict[int, dict[str, Any]] = {}

        for r in reviews:
            uid = r.reviewer_id
            if uid not in reviewer_data:
                reviewer_data[uid] = {
                    "reviewer_id": uid,
                    "name": r.reviewer.full_name or r.reviewer.email,
                    "email": r.reviewer.email,
                    "review_count": 0,
                    "total_conviction": 0.0,
                    "dim_scores": {d: [] for d in dimensions},
                }

            reviewer_data[uid]["review_count"] += 1
            reviewer_data[uid]["total_conviction"] += r.overall_conviction

            for d in dimensions:
                score = r.get_dimension_score(d)
                dim_sums[d] += score
                dim_counts[d] += 1
                reviewer_data[uid]["dim_scores"][d].append(score)

        global_dim_averages = {
            d: round(dim_sums[d] / max(1, dim_counts[d]), 2) for d in dimensions
        }

        # Analyze each reviewer's calibration relative to the cohort median
        reviewer_summaries = []
        for uid, data in reviewer_data.items():
            count = data["review_count"]
            avg_conviction = round(data["total_conviction"] / max(1, count), 2)
            dim_avgs = {
                d: round(sum(scores) / max(1, len(scores)), 2)
                for d, scores in data["dim_scores"].items()
            }

            # Determine scoring tendency
            diffs = [dim_avgs[d] - global_dim_averages[d] for d in dimensions if d in dim_avgs]
            mean_diff = sum(diffs) / max(1, len(diffs)) if diffs else 0.0

            if mean_diff >= 1.0:
                tendency = "lenient"
            elif mean_diff <= -1.0:
                tendency = "critical"
            else:
                tendency = "balanced"

            reviewer_summaries.append({
                "reviewer_id": uid,
                "name": data["name"],
                "email": data["email"],
                "review_count": count,
                "avg_conviction": avg_conviction,
                "dimension_averages": dim_avgs,
                "relative_delta": round(mean_diff, 2),
                "tendency": tendency,
            })

        return {
            "program_id": self.program.id,
            "total_reviews": reviews.count(),
            "reviewers_analyzed": len(reviewer_summaries),
            "global_dimension_averages": global_dim_averages,
            "disagreements_count": ReviewerDisagreement.objects.filter(application__program=self.program).count(),
            "reviewers": reviewer_summaries,
        }
