"""
apps.pitches.signals
====================
Signal handlers for the pitches app.

on_pitch_saved
    When a pitch is published (draft → published) or updated, queues:
    1. compute_and_cache_embedding - refreshes the startup's semantic vector
    2. update_match_scores_for_startup - refreshes all MatchScore rows
    3. update_predictions_for_startup - refreshes FundraisingPrediction

All handlers are connected in PitchesConfig.ready() to avoid import-time
side effects and circular imports.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_save

logger = logging.getLogger(__name__)


def on_pitch_saved(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    """
    Trigger ML refresh when a pitch is published or significantly updated.
    We only fire on non-draft pitches to avoid spamming tasks during drafting.
    """
    if instance.is_draft:
        return

    # Detect genuine publish events (draft → published) vs. minor updates
    was_draft = getattr(instance, "_loaded_is_draft", True)
    is_significant = created or was_draft or not created

    if not is_significant:
        return

    startup = instance.startup
    startup_id: int = startup.pk

    try:
        from apps.matching.tasks import (
            compute_and_cache_embedding,
            update_match_scores_for_startup,
        )
        from apps.analytics.tasks import update_predictions_for_startup

        # Queue embedding refresh first (low priority, fire and forget)
        compute_and_cache_embedding.apply_async(
            args=["startup", startup_id],
            queue="ml",
            countdown=5,  # small delay so DB write is fully committed
        )

        # Refresh match scores (ML queue)
        update_match_scores_for_startup.apply_async(
            args=[startup_id],
            queue="ml",
            countdown=10,
        )

        # Refresh fundraising prediction (ML queue)
        update_predictions_for_startup.apply_async(
            args=[startup_id],
            queue="ml",
            countdown=15,
        )

    except Exception:  # noqa: BLE001
        # Never let signal handler errors break pitch save transactions
        logger.exception(
            "Failed to queue ML refresh tasks for startup_id=%s after pitch save",
            startup_id,
        )
