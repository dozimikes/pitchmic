"""
apps.intelligence_engine.ingestion.source_registry
====================================================
SourceRegistryService — manages the SourceRegistry model records and
dispatches fetches to the correct adapter based on tier + strategy.

Replaces _get_default_sources_config() in opportunity_service.py.
Sources are now DB records, not hard-coded Python lists.

Tier dispatch priority:
  T1 official source  →  API > RSS > SITEMAP > STATIC
  T2 structured data  →  API > RSS > STATIC
  T3 secondary        →  RSS > STATIC
  T4 social           →  STATIC (low confidence)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from django.utils import timezone
from django.utils.text import slugify

from apps.intelligence_engine.models_core import SourceRegistry
from apps.intelligence_engine.ingestion.adapters import (
    AdapterResult,
    get_adapter,
    StaticHTMLAdapter,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Default source definitions (seeds the DB — NOT hard-coded opportunity data)
# ---------------------------------------------------------------------------

DEFAULT_SOURCES: List[Dict[str, Any]] = [
    # ── Tier 1: Official accelerator / VC websites ─────────────────────────
    dict(
        name="Antler Africa", organization="Antler",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.SIX_HOUR,
        base_trust_score=0.98,
        base_url="https://www.antler.co/residency",
        application_url="https://www.antler.co/pitch",
    ),
    dict(
        name="Visa Africa Fintech Accelerator", organization="Visa",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.HOURLY,
        base_trust_score=0.98,
        base_url="https://africa.visa.com/en_MW/visa-everywhere/innovation/visa-accelerator.html",
        application_url="https://africa.visa.com/en_MW/visa-everywhere/innovation/visa-accelerator.html",
    ),
    dict(
        name="Google for Startups Accelerator Africa", organization="Google",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.SITEMAP,
        crawl_frequency=SourceRegistry.CrawlFrequency.SIX_HOUR,
        base_trust_score=0.98,
        base_url="https://startup.google.com/programs/accelerator/africa/",
        application_url="https://startup.google.com/programs/accelerator/africa/",
        sitemap_url="https://startup.google.com/sitemap.xml",
    ),
    dict(
        name="Y Combinator", organization="Y Combinator",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.HOURLY,
        base_trust_score=0.99,
        base_url="https://www.ycombinator.com/apply",
        application_url="https://www.ycombinator.com/apply",
        rss_url="https://www.ycombinator.com/blog/feed.xml",
    ),
    dict(
        name="Techstars Accelerator", organization="Techstars",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.SITEMAP,
        crawl_frequency=SourceRegistry.CrawlFrequency.SIX_HOUR,
        base_trust_score=0.97,
        base_url="https://www.techstars.com/accelerators",
        application_url="https://apply.techstars.com/",
    ),
    dict(
        name="Future Africa Early Stage Fund", organization="Future Africa",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.96,
        base_url="https://www.future.africa",
        application_url="https://www.future.africa",
    ),
    dict(
        name="MassChallenge Africa", organization="MassChallenge",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.BROWSER,  # Cloudflare bot-protected — needs browser UA
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.95,
        base_url="https://masschallenge.org/programs/",
        application_url="https://masschallenge.org/challenge-program/",
    ),
    dict(
        name="Microsoft for Startups Founders Hub", organization="Microsoft",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.WEEKLY,
        base_trust_score=0.98,
        base_url="https://portal.startups.microsoft.com",
        application_url="https://portal.startups.microsoft.com/signup",
    ),
    dict(
        name="Seedstars Africa Ventures", organization="Seedstars",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.96,
        base_url="https://www.seedstars-africa.vc",
        application_url="https://www.seedstars-africa.vc",
    ),
    dict(
        name="Base10 Partners", organization="Base10",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.96,
        base_url="https://base10.vc",
        application_url="https://base10.vc/purpose/",
    ),
    dict(
        name="Flat6Labs Africa", organization="Flat6Labs",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.96,
        base_url="https://flat6labs.com",
        application_url="https://flat6labs.com/program/",
    ),
    dict(
        name="Launch Africa Ventures", organization="Launch Africa",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.96,
        base_url="https://www.launchafrica.vc",
        application_url="https://www.launchafrica.vc",
    ),
    dict(
        name="Norrsken22", organization="Norrsken22",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.95,
        base_url="https://www.norrsken22.com",
        application_url="https://www.norrsken22.com",
    ),
    dict(
        name="Orange Corners", organization="Orange Corners",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.STATIC,
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.94,
        base_url="https://www.orangecorners.com",
        application_url="https://www.orangecorners.com/apply/",
    ),
    dict(
        name="54 Collective", organization="54 Collective",
        tier=SourceRegistry.Tier.TIER_1_OFFICIAL,
        fetch_strategy=SourceRegistry.FetchStrategy.BROWSER,  # Cloudflare SSL 526 — needs browser
        crawl_frequency=SourceRegistry.CrawlFrequency.DAILY,
        base_trust_score=0.90,
        base_url="https://54collective.vc",
        application_url="https://54collective.vc",
    ),
    # ── Tier 2: Structured news / aggregators with RSS ─────────────────────
    dict(
        name="TechCabal — Africa Tech News", organization="TechCabal",
        tier=SourceRegistry.Tier.TIER_3_SECONDARY,
        fetch_strategy=SourceRegistry.FetchStrategy.RSS,
        crawl_frequency=SourceRegistry.CrawlFrequency.HOURLY,
        base_trust_score=0.70,
        base_url="https://techcabal.com",
        rss_url="https://techcabal.com/feed/",
    ),
    dict(
        name="Disrupt Africa — Startup Funding News", organization="Disrupt Africa",
        tier=SourceRegistry.Tier.TIER_3_SECONDARY,
        fetch_strategy=SourceRegistry.FetchStrategy.RSS,
        crawl_frequency=SourceRegistry.CrawlFrequency.HOURLY,
        base_trust_score=0.68,
        base_url="https://disrupt-africa.com",
        rss_url="https://disrupt-africa.com/feed/",
    ),
    dict(
        name="TechCrunch Africa", organization="TechCrunch",
        tier=SourceRegistry.Tier.TIER_3_SECONDARY,
        fetch_strategy=SourceRegistry.FetchStrategy.RSS,
        crawl_frequency=SourceRegistry.CrawlFrequency.HOURLY,
        base_trust_score=0.72,
        base_url="https://techcrunch.com/tag/africa/",
        rss_url="https://techcrunch.com/tag/africa/feed/",
    ),
]


class SourceRegistryService:
    """
    Manages SourceRegistry DB records and dispatches the correct adapter.

    Usage:
        service = SourceRegistryService()
        sources = service.get_due_sources()
        for source in sources:
            result = service.fetch(source)
    """

    def seed_default_sources(self) -> int:
        """
        Idempotently create default source records from DEFAULT_SOURCES.
        Call once (or from a migration / management command).
        Returns number of sources created.
        """
        created = 0
        for config in DEFAULT_SOURCES:
            slug = slugify(config["name"])
            _, was_created = SourceRegistry.objects.get_or_create(
                slug=slug,
                defaults={**config, "slug": slug},
            )
            if was_created:
                created += 1
        logger.info("source_registry.seed: %d new sources created", created)
        return created

    def get_due_sources(self, limit: int = 50) -> List[SourceRegistry]:
        """Return active sources that are overdue for a crawl, ordered by priority."""
        sources = SourceRegistry.objects.filter(is_active=True).order_by(
            "tier", "last_crawled_at"  # None (never crawled) sorts first
        )[:limit * 3]

        due = [s for s in sources if s.is_overdue]
        return due[:limit]

    def fetch(self, source: SourceRegistry) -> AdapterResult:
        """
        Dispatch the right adapter based on source.fetch_strategy.
        Falls back up the tier hierarchy on failure.

        Tier dispatch order:
          T1/T2: try source strategy → fallback static
          T3/T4: try source strategy → fallback static at lower confidence
        """
        adapter_cls = get_adapter(source.fetch_strategy)
        logger.info(
            "[registry] fetching %s via %s (%s)",
            source.name, source.fetch_strategy, adapter_cls.__name__,
        )
        try:
            result = adapter_cls.fetch(source)
        except Exception as exc:
            logger.error("[registry] %s fetch crashed: %s", source.name, exc, exc_info=True)
            result = AdapterResult(
                url=source.base_url, http_status=0, fetch_method="failed",
                content_hash="", raw_html="", text_content="",
                fetch_error=str(exc)[:1000],
            )

        if not result.ok and source.fetch_strategy not in ("static", "manual"):
            logger.warning(
                "[registry] %s %s failed (status=%d) — falling back to static",
                source.name, source.fetch_strategy, result.http_status,
            )
            try:
                result = StaticHTMLAdapter.fetch(source)
            except Exception as exc:
                logger.error("[registry] static fallback also failed: %s", exc)

        if result.ok:
            source.record_success(result.content_hash)
        else:
            source.record_error(result.fetch_error or f"HTTP {result.http_status}")

        return result

    def get_source_by_org(self, organization: str) -> Optional[SourceRegistry]:
        return (
            SourceRegistry.objects
            .filter(organization__iexact=organization, is_active=True)
            .order_by("tier")
            .first()
        )

    def get_all_active(self) -> List[SourceRegistry]:
        return list(SourceRegistry.objects.filter(is_active=True).order_by("tier", "name"))
