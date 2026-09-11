"""
apps.intelligence_engine.tasks
================================
Celery tasks for the Pitchmic Intelligence Engine.

Scheduled tasks (add to CELERY_BEAT_SCHEDULE in settings):

  "ie_crawl_due_sources": {
      "task": "intelligence_engine.crawl_due_sources",
      "schedule": crontab(minute="*/30"),      # every 30 minutes
  },
  "ie_recompute_investor_theses": {
      "task": "intelligence_engine.recompute_investor_theses",
      "schedule": crontab(hour="3", minute="0"),  # daily at 03:00
  },
  "ie_retire_expired_opportunities": {
      "task": "intelligence_engine.retire_expired_opportunities",
      "schedule": crontab(hour="0", minute="30"),  # daily at 00:30
  },

On-demand tasks:
  intelligence_engine.crawl_single_source.delay(source_id)
  intelligence_engine.assess_startup_readiness.delay(startup_id)
  intelligence_engine.build_funding_path.delay(startup_id)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from celery import shared_task

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Ingestion tasks
# ---------------------------------------------------------------------------

@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 2},
    name="intelligence_engine.crawl_due_sources",
    soft_time_limit=480,
    time_limit=600,
)
def crawl_due_sources(self, limit: int = 30) -> Dict[str, Any]:
    """
    Crawl all sources that are overdue for a fetch.
    Runs the full FetchDispatcher pipeline:
      fetch → persist snapshot → hash diff → extract → upsert opportunity
    """
    from apps.intelligence_engine.ingestion.crawl_engine import FetchDispatcher
    logger.info("[task] crawl_due_sources starting (limit=%d)", limit)
    result = FetchDispatcher(run_extraction=True).run_all_due(limit=limit)
    logger.info("[task] crawl_due_sources complete: %s", result)
    return result


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 2},
    name="intelligence_engine.crawl_single_source",
    soft_time_limit=120,
    time_limit=150,
)
def crawl_single_source(self, source_id: str) -> Dict[str, Any]:
    """On-demand crawl for a single SourceRegistry entry (by UUID string)."""
    from apps.intelligence_engine.ingestion.crawl_engine import FetchDispatcher
    logger.info("[task] crawl_single_source source_id=%s", source_id)
    return FetchDispatcher(run_extraction=True).run_single(source_id)


@shared_task(
    bind=True,
    retry_kwargs={"max_retries": 1},
    name="intelligence_engine.seed_source_registry",
)
def seed_source_registry(self) -> Dict[str, Any]:
    """Seed default SourceRegistry entries. Idempotent - safe to run multiple times."""
    from apps.intelligence_engine.ingestion.source_registry import SourceRegistryService
    created = SourceRegistryService().seed_default_sources()
    return {"sources_created": created}


# ---------------------------------------------------------------------------
# Intelligence tasks
# ---------------------------------------------------------------------------

@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 1},
    name="intelligence_engine.recompute_investor_theses",
    soft_time_limit=300,
    time_limit=360,
)
def recompute_investor_theses(self) -> Dict[str, Any]:
    """Recompute thesis_alignment_pct and momentum_score for all investors."""
    from apps.intelligence_engine.intelligence.investor_graph import InvestorIntelligenceEngine
    result = InvestorIntelligenceEngine().recompute_all_theses()
    logger.info("[task] recompute_investor_theses: %s", result)
    return result


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 1},
    name="intelligence_engine.assess_startup_readiness",
    soft_time_limit=120,
    time_limit=150,
)
def assess_startup_readiness(self, startup_id: str) -> Dict[str, Any]:
    """
    Assess and persist readiness scores for a startup across all active opportunities.
    Triggered when a startup profile is updated.
    """
    from apps.intelligence_engine.intelligence.readiness_engine import ReadinessEngine
    from apps.users.models import StartupProfile

    try:
        startup = StartupProfile.objects.get(id=startup_id)
    except StartupProfile.DoesNotExist:
        logger.warning("[task] assess_startup_readiness: startup %s not found", startup_id)
        return {"error": "startup_not_found"}

    engine   = ReadinessEngine()
    assessed = 0
    errors   = 0

    from apps.intelligence_engine.models_opportunities import OpportunityLifecycle
    opps = OpportunityLifecycle.objects.filter(
        lifecycle_status__in=["open", "rolling", "closing", "opening_soon", "verified"]
    )

    for opp in opps:
        try:
            engine.assess(startup, opp, persist=True)
            assessed += 1
        except Exception as exc:
            logger.error("[task] assess %s/%s failed: %s", startup_id, opp.slug, exc)
            errors += 1

    return {"startup_id": startup_id, "assessed": assessed, "errors": errors}


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 1},
    name="intelligence_engine.build_funding_path",
    soft_time_limit=60,
    time_limit=90,
)
def build_funding_path(self, startup_id: str) -> Dict[str, Any]:
    """
    Build and persist a FundingPath for a startup.
    Called after readiness scores are computed.
    """
    from apps.intelligence_engine.intelligence.funding_path import FundingPathEngine
    from apps.users.models import StartupProfile

    try:
        startup = StartupProfile.objects.get(id=startup_id)
    except StartupProfile.DoesNotExist:
        return {"error": "startup_not_found"}

    engine = FundingPathEngine()
    path = engine.build_path(
        startup_id=startup_id,
        startup_name=getattr(startup, "company_name", "") or f"Startup {startup_id}",
        current_stage=getattr(startup, "funding_stage", "pre_seed") or "pre_seed",
        startup_sector=getattr(startup, "industry", "") or "",
        startup_geography=getattr(startup, "location", "") or "",
        target_raise_usd=None,
        horizon_months=18,
    )

    return {
        "startup_id":    startup_id,
        "path_id":       str(path.id),
        "total_steps":   path.total_steps,
        "potential_usd": path.total_potential_usd,
    }


# ---------------------------------------------------------------------------
# Maintenance tasks
# ---------------------------------------------------------------------------

@shared_task(
    bind=True,
    name="intelligence_engine.retire_expired_opportunities",
    soft_time_limit=60,
)
def retire_expired_opportunities(self) -> Dict[str, Any]:
    """
    Auto-retire OpportunityLifecycle records past their deadline.
    Also retires matching.FundingOpportunity records for backward compat.
    """
    import datetime
    from django.utils import timezone
    from apps.intelligence_engine.models_opportunities import OpportunityLifecycle
    from apps.intelligence_engine.models_core import ChangeEvent

    today = datetime.date.today()
    expired = OpportunityLifecycle.objects.filter(
        lifecycle_status__in=["open", "closing"],
        is_rolling=False,
        application_deadline__lt=today,
    )

    retired = 0
    for opp in expired:
        old_status = opp.lifecycle_status
        opp.lifecycle_status = OpportunityLifecycle.LifecycleStatus.CLOSED
        opp.save(update_fields=["lifecycle_status"])
        ChangeEvent.objects.create(
            entity_type="opportunity",
            entity_id=str(opp.id),
            entity_name=opp.title,
            field_name="lifecycle_status",
            old_value=old_status,
            new_value="closed",
            severity=ChangeEvent.Severity.CRITICAL,
        )
        retired += 1

    # Also retire matching.FundingOpportunity
    try:
        from apps.matching.models_opportunity import FundingOpportunity
        FundingOpportunity.objects.filter(
            status__in=["OPEN", "CLOSING_SOON"],
            is_rolling=False,
            application_deadline__lt=today,
        ).update(status="CLOSED")
    except Exception as exc:
        logger.error("[task] FundingOpportunity retire failed: %s", exc)

    logger.info("[task] retire_expired_opportunities: retired=%d", retired)
    return {"retired": retired}


@shared_task(
    bind=True,
    name="intelligence_engine.recompute_freshness_scores",
    soft_time_limit=120,
)
def recompute_freshness_scores(self) -> Dict[str, Any]:
    """Recompute freshness_score for all active OpportunityLifecycle records."""
    from apps.intelligence_engine.models_opportunities import OpportunityLifecycle

    updated = 0
    for opp in OpportunityLifecycle.objects.filter(
        lifecycle_status__in=["open", "rolling", "closing", "opening_soon", "verified"]
    ):
        try:
            opp.compute_freshness()
            opp.save(update_fields=["freshness_score", "recency_factor"])
            updated += 1
        except Exception as exc:
            logger.error("[task] freshness recompute %s: %s", opp.slug, exc)

    return {"updated": updated}
