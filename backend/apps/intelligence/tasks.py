"""
apps.intelligence.tasks
=======================
Celery tasks for the intelligence pipeline.
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 2},
    name="intelligence.run_due_diligence",
)
def run_due_diligence_task(self, startup_id: int, report_id: int) -> dict:
    """
    Execute the multi-agent due diligence pipeline for a startup.
    Updates the DueDiligenceReport record in-place as stages complete.
    """
    from django.utils import timezone

    from apps.intelligence.models import DueDiligenceReport
    from apps.intelligence.pipeline import run_due_diligence
    from apps.users.models import StartupProfile

    try:
        report = DueDiligenceReport.objects.get(pk=report_id)
        startup = StartupProfile.objects.prefetch_related(
            "team_members", "pitches"
        ).get(pk=startup_id)
    except (DueDiligenceReport.DoesNotExist, StartupProfile.DoesNotExist) as exc:
        logger.error("run_due_diligence_task: %s", exc)
        return {"error": str(exc)}

    report.status = "running"
    report.started_at = timezone.now()
    report.save(update_fields=["status", "started_at", "updated_at"])

    try:
        result = run_due_diligence(startup)
        for field, value in result.items():
            setattr(report, field, value)
        report.save()
        logger.info("Due diligence complete: startup=%s verdict=%s", startup_id, result["verdict"])
        return {"startup_id": startup_id, "verdict": result["verdict"], "score": result["overall_score"]}
    except Exception as exc:
        report.status = "failed"
        report.save(update_fields=["status", "updated_at"])
        logger.exception("Due diligence pipeline failed: startup=%s", startup_id)
        raise


@shared_task(
    bind=True,
    name="intelligence.sync_success_prediction",
)
def sync_success_prediction(self, startup_id: int) -> dict:
    """
    Copy analytics.FundraisingPrediction data into intelligence.StartupSuccessPrediction
    and annotate with the agent pipeline results if a completed report exists.
    """
    from apps.analytics.models import FundraisingPrediction
    from apps.intelligence.models import DueDiligenceReport, StartupSuccessPrediction
    from apps.users.models import StartupProfile

    try:
        startup = StartupProfile.objects.get(pk=startup_id)
    except StartupProfile.DoesNotExist:
        return {"error": "not_found"}

    defaults: dict = {
        "pipeline_type": "heuristic",
        "model_version": "v1",
    }

    # Merge analytics prediction if available
    try:
        pred = FundraisingPrediction.objects.get(startup=startup)
        defaults.update({
            "success_probability": pred.success_probability,
            "confidence_interval_lower": pred.confidence_lower,
            "confidence_interval_upper": pred.confidence_upper,
            "exit_prediction": pred.exit_prediction,
            "investor_roi": pred.investor_roi,
            "market_potential": pred.market_potential,
            "growth_trajectory": pred.growth_trajectory,
            "risk_profile": pred.risk_profile,
            "benchmarks": pred.benchmarks,
            "scalability_score": pred.scalability_score,
            "uniqueness_score": pred.uniqueness_score,
            "top_features": pred.top_features,
            "explanation": pred.explanation,
            "model_version": pred.model_version,
        })
    except FundraisingPrediction.DoesNotExist:
        pass

    # Merge agent pipeline results if a completed report exists
    try:
        report = DueDiligenceReport.objects.filter(
            startup=startup, status="complete"
        ).order_by("-completed_at").first()
        if report:
            defaults["pipeline_type"] = "agent_pipeline"
            defaults["competitive_intelligence"] = report.market_analysis
    except DueDiligenceReport.DoesNotExist:
        pass

    StartupSuccessPrediction.objects.update_or_create(startup=startup, defaults=defaults)
    return {"startup_id": startup_id, "pipeline_type": defaults["pipeline_type"]}


@shared_task(
    bind=True,
    name="intelligence.send_triage_webhook_callback",
)
def send_triage_webhook_callback(self, callback_url: str, payload: dict) -> dict:
    """
    Delivers triage assessment results asynchronously to partner callback URL (Antler Hub / CRMs).
    """
    import urllib.request
    import json
    try:
        req = urllib.request.Request(
            callback_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"status": resp.status, "delivered": True}
    except Exception as exc:
        logger.warning("Failed to send triage webhook callback to %s: %s", callback_url, exc)
        return {"status": "error", "error": str(exc)}


@shared_task(
    bind=True,
    name="intelligence.dispatch_crm_webhook_task",
)
def dispatch_crm_webhook_task(self, target_url: str, event_type: str, data: dict) -> dict:
    """
    Dispatches real-time venture events (e.g. stealth founder detected, fast-track recommendation)
    to external CRM integrations (Affinity, Attio, Slack).
    """
    import json
    import urllib.request
    payload = {
        "event": event_type,
        "timestamp": timezone.now().isoformat() if "timezone" in globals() else "",
        "data": data,
    }
    try:
        req = urllib.request.Request(
            target_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "PitchMic-Intelligence/2.0"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"status": resp.status, "success": True}
    except Exception as exc:
        logger.warning("Failed to dispatch CRM webhook to %s: %s", target_url, exc)
        return {"status": "error", "error": str(exc)}


@shared_task(
    name="intelligence.scheduled_stealth_discovery_cron",
)
def scheduled_stealth_discovery_cron() -> dict:
    """
    Periodic cron job executing continuous sweeps across GitHub, domains, patents, and African/MENA registries.
    """
    from apps.intelligence.collectors import (
        DomainRegistrationCollector,
        EmergingMarketsCollector,
        EntityResolutionEngine,
        GitHubActivityCollector,
        PatentCollector,
    )
    from apps.intelligence.models import StealthFounderSignal

    keywords = ["ai", "fintech", "payments", "infrastructure", "deeptech"]
    total_signals = []

    for kw in keywords:
        gh = GitHubActivityCollector().collect(kw)
        dom = DomainRegistrationCollector().collect(kw)
        pat = PatentCollector().collect(kw)
        reg = EmergingMarketsCollector().collect("CAC", kw)
        total_signals.extend(gh + dom + pat + reg)

    for s in total_signals:
        StealthFounderSignal.objects.create(
            source=s.source,
            founder_name=s.founder_name,
            company_name=s.company_name or "",
            signal_type=s.signal_type,
            confidence=s.confidence,
            metadata=s.metadata,
            jurisdiction=s.metadata.get("country_code", "GLOBAL"),
        )

    resolver = EntityResolutionEngine()
    resolved = resolver.resolve_signals(total_signals)

    return {
        "signals_discovered": len(total_signals),
        "founders_resolved": len(resolved),
    }


