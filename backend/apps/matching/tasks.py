"""
apps.matching.tasks
===================
Celery tasks for the matching engine.

update_all_match_scores   — nightly batch job that computes / refreshes
                            MatchScore rows for all startup × investor pairs.

update_match_scores_for_startup  — single-startup refresh, triggered whenever
                            a startup profile is substantially updated.

compute_and_cache_embedding      — generate a sentence-transformer embedding
                            for a profile and cache it on the model instance.
                            Queued when a pitch or profile changes.
"""
from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    name="matching.update_all_match_scores",
)
def update_all_match_scores(self) -> dict:
    """
    Nightly job — refreshes MatchScore for every startup × investor combination.
    Uses chunked queries to avoid loading the full Cartesian product into memory.
    """
    from apps.matching.models import MatchScore
    from apps.matching.services import score_match
    from apps.users.models import InvestorProfile, StartupProfile

    startups = list(StartupProfile.objects.select_related("user").prefetch_related("pitches").all())
    investors = list(InvestorProfile.objects.select_related("user").all())

    created = updated = errors = 0

    for startup in startups:
        for investor in investors:
            try:
                scores = score_match(startup, investor)
                _, is_new = MatchScore.objects.update_or_create(
                    startup=startup,
                    investor=investor,
                    defaults=scores,
                )
                if is_new:
                    created += 1
                else:
                    updated += 1
            except Exception:  # noqa: BLE001
                errors += 1
                logger.exception(
                    "Score failed startup=%s investor=%s", startup.pk, investor.pk
                )

    summary = {"created": created, "updated": updated, "errors": errors}
    logger.info("update_all_match_scores complete: %s", summary)
    return summary


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    name="matching.update_match_scores_for_startup",
)
def update_match_scores_for_startup(self, startup_id: int) -> dict:
    """
    Refresh all MatchScore rows for a single startup.
    Triggered from signals when a startup profile or pitch changes.
    """
    from apps.matching.models import MatchScore
    from apps.matching.services import score_match
    from apps.users.models import InvestorProfile, StartupProfile

    try:
        startup = StartupProfile.objects.prefetch_related("pitches").get(pk=startup_id)
    except StartupProfile.DoesNotExist:
        logger.warning("update_match_scores_for_startup: startup %s not found", startup_id)
        return {"error": "startup_not_found"}

    investors = InvestorProfile.objects.all()
    created = updated = errors = 0

    for investor in investors:
        try:
            scores = score_match(startup, investor)
            _, is_new = MatchScore.objects.update_or_create(
                startup=startup,
                investor=investor,
                defaults=scores,
            )
            if is_new:
                created += 1
            else:
                updated += 1
        except Exception:  # noqa: BLE001
            errors += 1
            logger.exception("Score failed startup=%s investor=%s", startup.pk, investor.pk)

    return {"startup_id": startup_id, "created": created, "updated": updated, "errors": errors}


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 2},
    name="matching.compute_and_cache_embedding",
)
def compute_and_cache_embedding(self, entity_type: str, entity_id: int) -> bool:
    """
    Generate a sentence-transformer embedding for a startup or investor profile
    and cache it on the instance so score_match() can use it.

    entity_type: "startup" | "investor"

    Falls back gracefully if sentence-transformers is not installed — embeddings
    simply stay null and semantic_score defaults to 0.
    """
    from django.utils import timezone

    try:
        from sentence_transformers import SentenceTransformer  # type: ignore[import]
        encoder = SentenceTransformer("all-MiniLM-L6-v2")
    except ImportError:
        logger.info("sentence-transformers not installed — skipping embedding computation")
        return False

    if entity_type == "startup":
        from apps.users.models import StartupProfile

        try:
            profile = StartupProfile.objects.prefetch_related("pitches").get(pk=entity_id)
        except StartupProfile.DoesNotExist:
            return False

        pitches_text = " ".join(
            f"{p.title} {p.problem} {p.solution}"
            for p in profile.pitches.filter(is_draft=False)[:5]
        )
        text = (
            f"{profile.company_name} {profile.niche} {profile.industry} "
            f"{profile.description} {pitches_text}"
        )
        vector = encoder.encode(text).tolist()
        StartupProfile.objects.filter(pk=entity_id).update(
            embedding_vector=vector,
            embedding_updated_at=timezone.now(),
        )

    elif entity_type == "investor":
        from apps.users.models import InvestorProfile

        try:
            profile = InvestorProfile.objects.get(pk=entity_id)
        except InvestorProfile.DoesNotExist:
            return False

        stages = " ".join(profile.preferred_stages or [])
        text = (
            f"{profile.full_name} {profile.bio} {profile.preferred_industries} "
            f"{profile.niche} {stages}"
        )
        vector = encoder.encode(text).tolist()
        InvestorProfile.objects.filter(pk=entity_id).update(
            embedding_vector=vector,
            embedding_updated_at=timezone.now(),
        )
    else:
        logger.warning("compute_and_cache_embedding: unknown entity_type=%s", entity_type)
        return False

    return True
