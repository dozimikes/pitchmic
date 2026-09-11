"""
apps.intelligence_engine.ingestion.crawl_engine
================================================
CrawlEngine - orchestrates the full ingestion pipeline for a single source:

  1. Dispatch adapter (via SourceRegistryService)
  2. Persist raw AdapterResult as SourceSnapshot + SourceDocument
  3. Compute content hash and compare against last_page_hash
  4. If unchanged → skip extraction, update verified_freshness only
  5. If changed   → hand off to ExtractionPipeline
  6. Record ChangeEvent for any diffs

FetchDispatcher runs CrawlEngine.run() across all due sources, with
configurable concurrency via Celery or sync loop.

Pipeline:
  SourceRegistry
      ↓
  SourceRegistryService.fetch()
      ↓
  CrawlEngine.persist_snapshot()
      ↓
  hash diff?
      ├── unchanged → touch_freshness()
      └── changed   → ExtractionPipeline.run(document)
                           ↓
                      OpportunityParser.ingest()
                           ↓
                      FundingOpportunity DB upsert
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, List, Optional

from django.db import transaction
from django.utils import timezone

from apps.intelligence_engine.models_core import (
    SourceRegistry,
    SourceSnapshot,
    SourceDocument,
    ChangeEvent,
)
from apps.intelligence_engine.ingestion.adapters import AdapterResult
from apps.intelligence_engine.ingestion.source_registry import SourceRegistryService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CrawlResult DTO
# ---------------------------------------------------------------------------

class CrawlResult:
    __slots__ = (
        "source_name", "http_status", "content_changed", "snapshot_id",
        "document_ids", "facts_extracted", "opportunities_upserted",
        "errors", "duration_ms",
    )

    def __init__(self, source_name: str):
        self.source_name          = source_name
        self.http_status          = 0
        self.content_changed      = False
        self.snapshot_id          = ""
        self.document_ids: List[str] = []
        self.facts_extracted      = 0
        self.opportunities_upserted = 0
        self.errors: List[str]    = []
        self.duration_ms          = 0

    def to_dict(self) -> Dict[str, Any]:
        return {k: getattr(self, k) for k in self.__slots__}


# ---------------------------------------------------------------------------
# CrawlEngine
# ---------------------------------------------------------------------------

class CrawlEngine:
    """
    Runs a single source through the full fetch → persist → diff → extract pipeline.
    """

    def __init__(self, run_extraction: bool = True):
        self.registry_svc  = SourceRegistryService()
        self.run_extraction = run_extraction

    def run(self, source: SourceRegistry) -> CrawlResult:
        """Full pipeline for one source. Never raises - all errors are captured."""
        result = CrawlResult(source.name)
        t0 = timezone.now()

        try:
            # 1. Fetch
            adapter_result = self.registry_svc.fetch(source)
            result.http_status = adapter_result.http_status

            if not adapter_result.ok:
                result.errors.append(
                    f"fetch_failed: HTTP {adapter_result.http_status} - {adapter_result.fetch_error}"
                )
                result.duration_ms = int((timezone.now() - t0).total_seconds() * 1000)
                return result

            # 2. Persist snapshot
            snapshot = self.persist_snapshot(source, adapter_result)
            result.snapshot_id = str(snapshot.id)

            # 3. Hash diff
            content_changed = snapshot.content_changed
            result.content_changed = content_changed

            if not content_changed:
                logger.info("[crawl] %s - page unchanged, skipping extraction", source.name)
                self._touch_opportunities(source)
                result.duration_ms = int((timezone.now() - t0).total_seconds() * 1000)
                return result

            # 4. Persist documents
            documents = self.persist_documents(snapshot, adapter_result)
            result.document_ids = [str(d.id) for d in documents]

            # 5. Run extraction pipeline
            if self.run_extraction and documents:
                try:
                    from apps.intelligence_engine.extraction.pipeline import ExtractionPipeline
                    for doc in documents:
                        pipeline_result = ExtractionPipeline().run(doc, source)
                        result.facts_extracted        += pipeline_result.get("facts_extracted", 0)
                        result.opportunities_upserted += pipeline_result.get("opportunities_upserted", 0)
                        result.errors.extend(pipeline_result.get("errors", []))
                except Exception as exc:
                    logger.error("[crawl] extraction pipeline failed %s: %s",
                                 source.name, exc, exc_info=True)
                    result.errors.append(f"extraction_error: {exc}")

        except Exception as exc:
            logger.error("[crawl] run() crashed for %s: %s", source.name, exc, exc_info=True)
            result.errors.append(f"crawl_crash: {exc}")

        result.duration_ms = int((timezone.now() - t0).total_seconds() * 1000)
        return result

    # -----------------------------------------------------------------------
    # Persistence
    # -----------------------------------------------------------------------

    def persist_snapshot(
        self, source: SourceRegistry, adapter_result: AdapterResult
    ) -> SourceSnapshot:
        """
        Persist an immutable SourceSnapshot.
        Sets content_changed=True when the hash differs from the previous snapshot.
        """
        prev_hash = source.last_page_hash or ""
        new_hash  = adapter_result.content_hash or ""
        changed   = (prev_hash != new_hash) or (not prev_hash)

        snapshot = SourceSnapshot.objects.create(
            source          = source,
            url             = adapter_result.url or source.base_url,
            http_status     = adapter_result.http_status,
            content_hash    = new_hash,
            content_changed = changed,
            raw_html        = adapter_result.raw_html[:10_000_000],   # 10 MB hard cap
            text_content    = adapter_result.text_content[:2_000_000],
            response_headers = adapter_result.response_headers,
            fetch_duration_ms = adapter_result.fetch_duration_ms,
            fetch_method    = adapter_result.fetch_method,
            fetch_error     = adapter_result.fetch_error,
        )

        if changed and prev_hash:
            # Log a ChangeEvent for the page hash flip
            ChangeEvent.objects.create(
                entity_type = "source_page",
                entity_id   = str(source.id),
                entity_name = source.name,
                field_name  = "page_content_hash",
                old_value   = prev_hash,
                new_value   = new_hash,
                severity    = ChangeEvent.Severity.LOW,
                snapshot    = snapshot,
            )

        return snapshot

    def persist_documents(
        self, snapshot: SourceSnapshot, adapter_result: AdapterResult
    ) -> List[SourceDocument]:
        """
        Persist SourceDocument records from the AdapterResult.
        One primary document plus one per sub-result (multi-page crawl).
        """
        source = snapshot.source
        docs: List[SourceDocument] = []

        results_to_persist = [adapter_result] + adapter_result.sub_results

        for ar in results_to_persist:
            if not ar.ok:
                continue
            doc_type = self._map_document_type(ar.document_type)
            doc = SourceDocument.objects.create(
                snapshot        = snapshot,
                source          = source,
                document_type   = doc_type,
                url             = ar.url or source.base_url,
                clean_text      = ar.text_content[:2_000_000],
                structured_data = ar.structured_data,
                content_hash    = ar.content_hash,
                http_status     = ar.http_status,
                char_count      = ar.char_count,
            )
            docs.append(doc)

        return docs

    @staticmethod
    def _map_document_type(adapter_type: str) -> str:
        return {
            "html":    SourceDocument.DocumentType.HTML_PAGE,
            "rss":     SourceDocument.DocumentType.RSS_FEED,
            "json":    SourceDocument.DocumentType.JSON_API,
            "pdf":     SourceDocument.DocumentType.PDF,
            "sitemap": SourceDocument.DocumentType.SITEMAP,
        }.get(adapter_type, SourceDocument.DocumentType.HTML_PAGE)

    def _touch_opportunities(self, source: SourceRegistry) -> None:
        """
        When page hash is unchanged, only bump verified_freshness on
        active opportunities tied to this source, without re-extracting.
        """
        try:
            from apps.matching.models_opportunity import FundingOpportunity
            FundingOpportunity.objects.filter(
                source__organization=source.organization,
                status__in=["OPEN", "CLOSING_SOON", "ROLLING", "UPCOMING"],
            ).update(verified_freshness=timezone.now())
        except Exception as exc:
            logger.debug("[crawl] touch_opportunities failed: %s", exc)


# ---------------------------------------------------------------------------
# FetchDispatcher - runs CrawlEngine across multiple sources
# ---------------------------------------------------------------------------

class FetchDispatcher:
    """
    Orchestrates crawls across all due sources.
    Used by the Celery periodic task.
    """

    def __init__(self, run_extraction: bool = True):
        self.engine       = CrawlEngine(run_extraction=run_extraction)
        self.registry_svc = SourceRegistryService()

    def run_all_due(self, limit: int = 50) -> Dict[str, Any]:
        """
        Fetch all sources overdue for a crawl.
        Returns summary dict.
        """
        sources = self.registry_svc.get_due_sources(limit=limit)
        logger.info("[dispatcher] %d sources due for crawl", len(sources))

        results: List[CrawlResult] = []
        for source in sources:
            try:
                r = self.engine.run(source)
                results.append(r)
                logger.info(
                    "[dispatcher] %s → http=%d changed=%s facts=%d opps=%d errors=%d",
                    source.name, r.http_status, r.content_changed,
                    r.facts_extracted, r.opportunities_upserted, len(r.errors),
                )
            except Exception as exc:
                logger.error("[dispatcher] %s crashed: %s", source.name, exc, exc_info=True)

        total_facts  = sum(r.facts_extracted for r in results)
        total_opps   = sum(r.opportunities_upserted for r in results)
        total_errors = sum(len(r.errors) for r in results)
        changed      = sum(1 for r in results if r.content_changed)

        return {
            "sources_checked":        len(results),
            "pages_changed":          changed,
            "total_facts_extracted":  total_facts,
            "opportunities_upserted": total_opps,
            "total_errors":           total_errors,
            "completed_at":           timezone.now().isoformat(),
        }

    def run_single(self, source_id: str) -> Dict[str, Any]:
        """Run a single source by UUID. Used by on-demand tasks."""
        try:
            source = SourceRegistry.objects.get(id=source_id)
        except SourceRegistry.DoesNotExist:
            return {"error": "source_not_found", "source_id": source_id}
        result = self.engine.run(source)
        return result.to_dict()
