"""
apps.analytics.tasks
====================
Celery tasks for the analytics engine.
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
    name="analytics.update_predictions_for_startup",
)
def update_predictions_for_startup(self, startup_id: int) -> dict:
    """
    Compute / refresh FundraisingPrediction for a single startup.
    Called on-demand (profile/pitch save) and from the nightly batch.
    """
    from apps.analytics.models import FundraisingPrediction
    from apps.analytics.services import StartupScoringEngine
    from apps.users.models import StartupProfile

    try:
        startup = (
            StartupProfile.objects.prefetch_related("team_members", "pitches")
            .select_related("user")
            .get(pk=startup_id)
        )
    except StartupProfile.DoesNotExist:
        logger.warning("update_predictions_for_startup: startup %s not found", startup_id)
        return {"error": "not_found"}

    engine = StartupScoringEngine()
    data = engine.score(startup)

    FundraisingPrediction.objects.update_or_create(
        startup=startup,
        defaults=data,
    )
    logger.info("Prediction updated for startup=%s prob=%.3f", startup_id, data["success_probability"])
    return {"startup_id": startup_id, "success_probability": data["success_probability"]}


@shared_task(
    bind=True,
    name="analytics.update_all_predictions",
)
def update_all_predictions(self) -> dict:
    """Nightly batch: refresh predictions for every startup."""
    from apps.users.models import StartupProfile

    ids = list(StartupProfile.objects.values_list("pk", flat=True))
    for startup_id in ids:
        update_predictions_for_startup.delay(startup_id)
    logger.info("Queued prediction updates for %d startups", len(ids))
    return {"queued": len(ids)}


@shared_task(
    bind=True,
    name="analytics.update_investor_behavior",
)
def update_investor_behavior(self, investor_id: int) -> dict:
    """
    Re-derive InvestorBehaviorAnalysis from InvestorIntentSignal rows.
    Run weekly per investor by Celery beat.
    """
    from django.db.models import Avg, Count

    from apps.analytics.models import InvestorBehaviorAnalysis
    from apps.matching.models import InvestorIntentSignal
    from apps.offers.models import Offer
    from apps.users.models import InvestorProfile

    try:
        investor = InvestorProfile.objects.get(pk=investor_id)
    except InvestorProfile.DoesNotExist:
        return {"error": "not_found"}

    signals = InvestorIntentSignal.objects.filter(investor=investor)

    views = signals.filter(signal_type="view")
    total_views = views.count()
    avg_time = views.aggregate(avg=Avg("time_spent_seconds"))["avg"] or 0.0
    offers_sent = signals.filter(signal_type="offer_sent").count()
    offers_accepted = signals.filter(signal_type="offer_accepted").count()
    conversion = offers_sent / total_views if total_views else 0.0

    # Average offer amount from actual Offer rows
    avg_offer = (
        Offer.objects.filter(investor=investor, status__in=["sent", "accepted", "negotiating"])
        .aggregate(avg=Avg("amount"))["avg"]
    )

    InvestorBehaviorAnalysis.objects.update_or_create(
        investor=investor,
        defaults={
            "avg_time_on_pitch_seconds": avg_time,
            "view_to_offer_conversion_rate": round(conversion, 4),
            "total_pitches_viewed": total_views,
            "total_offers_sent": offers_sent,
            "total_offers_accepted": offers_accepted,
            "avg_offer_amount": avg_offer,
        },
    )
    return {"investor_id": investor_id, "conversion_rate": conversion}


@shared_task(
    bind=True,
    name="analytics.record_behavior_event",
)
def record_behavior_event(
    self,
    user_id: int,
    event_type: str,
    session_id: str = "",
    object_id: int | None = None,
    object_type: str = "",
    metadata: dict | None = None,
) -> bool:
    """Fire-and-forget task that appends a UserBehaviorEvent row."""
    from apps.analytics.models import UserBehaviorEvent
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return False

    UserBehaviorEvent.objects.create(
        user=user,
        event_type=event_type,
        session_id=session_id,
        object_id=object_id,
        object_type=object_type,
        metadata=metadata or {},
    )
    return True


@shared_task(
    bind=True,
    name="analytics.update_investor_behavior_all",
)
def update_investor_behavior_all(self) -> dict:
    """Weekly beat task: fan out per-investor behavior analysis."""
    from apps.users.models import InvestorProfile

    ids = list(InvestorProfile.objects.values_list("pk", flat=True))
    for investor_id in ids:
        update_investor_behavior.delay(investor_id)
    logger.info("Queued investor behavior updates for %d investors", len(ids))
    return {"queued": len(ids)}
