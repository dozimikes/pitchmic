"""
apps.users.signals
==================
Signal handlers for the users app.

on_startup_profile_updated
    When a StartupProfile is updated (financial / industry fields changed),
    queues embedding + match score + prediction refresh.

on_investor_profile_updated
    When an InvestorProfile is updated, queues investor embedding refresh
    so matching scores reflect the new preferences.

Handlers are connected in UsersConfig.ready().
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_save

logger = logging.getLogger(__name__)


def on_startup_profile_updated(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    """Trigger ML refresh on startup profile changes (excluding new creations)."""
    # Skip the very first creation — the registration flow fires this before
    # any useful data is present; let the first pitch publish do the real work.
    if created:
        return

    startup_id: int = instance.pk
    try:
        from apps.matching.tasks import (
            compute_and_cache_embedding,
            update_match_scores_for_startup,
        )
        from apps.analytics.tasks import update_predictions_for_startup

        compute_and_cache_embedding.apply_async(
            args=["startup", startup_id], queue="ml", countdown=5
        )
        update_match_scores_for_startup.apply_async(
            args=[startup_id], queue="ml", countdown=15
        )
        update_predictions_for_startup.apply_async(
            args=[startup_id], queue="ml", countdown=20
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to queue ML refresh for startup_id=%s on profile update", startup_id
        )


def on_investor_profile_updated(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    """Refresh investor embedding when preferences or industries change."""
    if created:
        return

    investor_id: int = instance.pk
    try:
        from apps.matching.tasks import compute_and_cache_embedding

        compute_and_cache_embedding.apply_async(
            args=["investor", investor_id], queue="ml", countdown=5
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to queue embedding refresh for investor_id=%s", investor_id
        )
