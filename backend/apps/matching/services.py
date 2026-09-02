"""
apps.matching.services
======================
MatchmakingService — multi-dimensional compatibility scoring between
StartupProfile and InvestorProfile instances.

Design choices
--------------
* Pure Python — no heavyweight ML dependency required at inference time.
  Embeddings are pre-computed and cached on the profile records by the
  nightly Celery task; this service only reads them.
* Semantic similarity falls back gracefully to 0 when embeddings are absent
  so the service degrades cleanly without breaking the API.
* Scoring logic is intentionally separate from the Celery task so it can be
  unit-tested without a worker.
"""
from __future__ import annotations

import logging
import math
from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from apps.users.models import InvestorProfile, StartupProfile

logger = logging.getLogger(__name__)

# Dimension weights — must sum to 1.0
_WEIGHTS: dict[str, float] = {
    "industry": 0.30,
    "stage": 0.25,
    "ticket_size": 0.25,
    "location": 0.10,
    "semantic": 0.10,
}


def _overlap_ratio(set_a: set, set_b: set) -> float:
    """Jaccard-like overlap between two sets, returns 0 for empty."""
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / max(len(set_a | set_b), 1)


def _cosine(vec_a: list[float], vec_b: list[float]) -> float:
    """Cosine similarity between two equal-length vectors."""
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _parse_csv(value: str) -> set[str]:
    """Split a comma-separated string into a lowercase set."""
    return {s.strip().lower() for s in value.split(",") if s.strip()}


def score_match(
    startup: "StartupProfile",
    investor: "InvestorProfile",
) -> dict[str, float]:
    """
    Compute and return a dictionary of per-dimension scores plus the weighted
    composite.  All scores are in [0, 1].
    """
    #  Industry 
    startup_industries = _parse_csv(startup.niche) | _parse_csv(startup.industry)
    investor_industries = (
        _parse_csv(investor.preferred_industries) | _parse_csv(investor.niche)
    )
    industry_score = _overlap_ratio(startup_industries, investor_industries)

    #  Funding stage 
    startup_stage = startup.funding_stage.lower() if startup.funding_stage else ""
    investor_stages = {s.lower() for s in (investor.preferred_stages or [])}
    if not startup_stage or not investor_stages:
        stage_score = 0.5  # neutral when data is missing
    elif startup_stage in investor_stages:
        stage_score = 1.0
    else:
        stage_score = 0.0

    #  Ticket size 
    asking: Decimal | None = None
    try:
        # Use the latest published pitch asking_amount as proxy
        pitch = startup.pitches.filter(is_draft=False).order_by("-pitched_at").first()
        if pitch and pitch.asking_amount:
            asking = pitch.asking_amount
    except Exception:  # noqa: BLE001
        pass

    inv_min: Decimal | None = investor.check_size_min or investor.investment_range_min
    inv_max: Decimal | None = investor.check_size_max or investor.investment_range_max

    if asking and inv_min and inv_max and inv_max > inv_min:
        if inv_min <= asking <= inv_max:
            ticket_size_score = 1.0
        else:
            # Partial credit: inversely proportional to distance outside range
            distance = float(min(abs(asking - inv_min), abs(asking - inv_max)))
            range_size = float(inv_max - inv_min)
            ticket_size_score = max(0.0, 1.0 - (distance / range_size))
    else:
        ticket_size_score = 0.5  # neutral

    #  Location 
    startup_location = (startup.location or "").lower()
    investor_geo: list[str] = [g.lower() for g in (investor.geographic_focus or [])]
    if not startup_location or not investor_geo:
        location_score = 0.5
    elif any(g in startup_location or startup_location in g for g in investor_geo):
        location_score = 1.0
    else:
        location_score = 0.0

    #  Semantic similarity 
    semantic_score = 0.0
    if startup.embedding_vector and investor.embedding_vector:
        try:
            semantic_score = max(
                0.0,
                _cosine(startup.embedding_vector, investor.embedding_vector),
            )
        except Exception:  # noqa: BLE001
            logger.warning("Cosine similarity failed for startup=%s investor=%s", startup.pk, investor.pk)

    #  Weighted composite 
    dimensions = {
        "industry": industry_score,
        "stage": stage_score,
        "ticket_size": ticket_size_score,
        "location": location_score,
        "semantic": semantic_score,
    }
    compatibility = sum(_WEIGHTS[k] * v for k, v in dimensions.items())

    return {
        "compatibility_score": round(compatibility, 4),
        "industry_score": round(industry_score, 4),
        "stage_score": round(stage_score, 4),
        "ticket_size_score": round(ticket_size_score, 4),
        "location_score": round(location_score, 4),
        "semantic_score": round(semantic_score, 4),
    }
