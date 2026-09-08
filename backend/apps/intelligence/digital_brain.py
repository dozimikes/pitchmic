"""
apps.intelligence.digital_brain
===============================
Institutional Memory & Digital Brain Service.

Implements persistent venture capital knowledge compounding:
1. Ingest: Store raw immutable sources (IC debates, pitch decks, partner notes, post-mortems).
2. Query: Semantic & keyword hybrid search across past deal memos and theses.
3. Lint: Detect contradictions across deals (e.g. conflicting sector valuations, orphaned investment hypotheses).

SEC-002: All database access is tenant-scoped.  The service refuses to operate
without a valid ``tenant_id`` and every ORM call goes through the
``for_tenant()`` manager method to prevent cross-tenant data leakage.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_VALID_SOURCE_TYPES = frozenset({
    "ic_memo", "partner_note", "pitch_deck", "post_mortem", "thesis",
    "sector_note", "market_update", "lp_report",
})
_MAX_CONTENT_BYTES = 10 * 1024 * 1024  # 10 MiB hard cap per memory entry
_MAX_TENANT_ID_LEN = 100


@dataclass
class MemoryEntry:
    entry_id: str
    tenant_id: str
    source_type: str  # ic_memo, partner_note, pitch_deck, post_mortem, thesis
    company_name: str
    summary: str
    content_text: str
    tags: List[str]
    verdict: Optional[str]
    created_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MemoryQueryResult:
    answer: str
    matched_entries: List[MemoryEntry]
    confidence: float
    institutional_context: str


class DigitalBrainService:
    """
    Firm-level memory compounding service for VC teams.

    Every public method asserts invariants about ``tenant_id`` and parameter
    validity before touching the database.  All ORM access goes through
    ``InstitutionalMemoryEntry.objects.for_tenant(self.tenant_id)``.
    """

    def __init__(self, tenant_id: str = "default_fund"):
        # SEC-002: Refuse to instantiate without a valid tenant_id.
        assert tenant_id is not None, "DigitalBrainService requires a non-None tenant_id"
        tenant_str = str(tenant_id).strip()
        assert tenant_str, "DigitalBrainService requires a non-blank tenant_id"
        assert len(tenant_str) <= _MAX_TENANT_ID_LEN, (
            f"DigitalBrainService tenant_id exceeds {_MAX_TENANT_ID_LEN} chars"
        )
        self.tenant_id: str = tenant_str
        logger.info("digital_brain.service.init", tenant_id=self.tenant_id)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _validate_ingest_args(
        self,
        company_name: str,
        source_type: str,
        content_text: str,
    ) -> None:
        """Assert preconditions for ingest_source; raise ValueError on failure."""
        if company_name is None or not str(company_name).strip():
            raise ValueError("ingest_source(): company_name must be a non-empty string")
        if len(str(company_name).strip()) > 200:
            raise ValueError("ingest_source(): company_name exceeds 200 characters")
        if source_type is None or not str(source_type).strip():
            raise ValueError("ingest_source(): source_type must be a non-empty string")
        if str(source_type) not in _VALID_SOURCE_TYPES:
            logger.warning(
                "digital_brain.ingest.unknown_source_type",
                tenant_id=self.tenant_id,
                source_type=source_type,
            )
        if content_text is None:
            raise ValueError("ingest_source(): content_text must not be None")
        content_bytes = len(content_text.encode("utf-8"))
        if content_bytes > _MAX_CONTENT_BYTES:
            raise ValueError(
                f"ingest_source(): content_text exceeds {_MAX_CONTENT_BYTES} bytes "
                f"(got {content_bytes})"
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def ingest_source(
        self,
        company_name: str,
        source_type: str,
        content_text: str,
        summary: Optional[str] = None,
        tags: Optional[List[str]] = None,
        verdict: Optional[str] = None,
    ) -> MemoryEntry:
        """Operation 1: Ingest source document into institutional memory."""
        from apps.intelligence.models import InstitutionalMemoryEntry

        # SEC-002 + input validation (assertions and explicit checks)
        assert self.tenant_id, "DigitalBrainService tenant_id not set"
        self._validate_ingest_args(company_name, source_type, content_text)

        final_company = str(company_name).strip()
        final_source_type = str(source_type).strip()
        final_summary = (
            summary.strip()
            if isinstance(summary, str) and summary.strip()
            else (content_text[:200] + "..." if len(content_text) > 200 else content_text)
        )
        if isinstance(tags, list) and tags:
            final_tags = [str(t).strip() for t in tags if str(t).strip()]
        else:
            final_tags = ["general", final_source_type]
        final_verdict = str(verdict).strip() if verdict else ""

        content_hash = hashlib.sha256(content_text.encode("utf-8")).hexdigest()[:12]
        now_iso = datetime.now(timezone.utc).isoformat()

        # Persist to database — tenant_id is explicitly set AND the entry is
        # double-checked with assert_tenant() after creation.
        db_entry = InstitutionalMemoryEntry.objects.create(
            tenant_id=self.tenant_id,
            company_name=final_company,
            source_type=final_source_type,
            summary=final_summary,
            content_text=content_text,
            tags=final_tags,
            verdict=final_verdict,
        )
        db_entry.assert_tenant(self.tenant_id)  # defence-in-depth

        logger.info(
            "digital_brain.ingest.ok",
            tenant_id=self.tenant_id,
            entry_id=db_entry.pk,
            source_type=final_source_type,
            content_hash=content_hash,
        )

        return MemoryEntry(
            entry_id=str(db_entry.id),
            tenant_id=self.tenant_id,
            source_type=final_source_type,
            company_name=final_company,
            summary=final_summary,
            content_text=content_text,
            tags=final_tags,
            verdict=final_verdict or None,
            created_at=now_iso,
        )

    def query_memory(self, query_text: str, k: int = 5) -> MemoryQueryResult:
        """Operation 2: Query memory for relevant past deals and institutional reasoning."""
        from apps.intelligence.models import InstitutionalMemoryEntry

        # SEC-002: guard invariants before any DB access
        assert self.tenant_id, "DigitalBrainService tenant_id not set"
        assert query_text is not None, "query_memory(): query_text must not be None"
        assert isinstance(k, int) and 1 <= k <= 100, (
            f"query_memory(): k must be an int between 1 and 100, got {k!r}"
        )

        # Filter by tenant using the scoped manager method
        entries_qs = InstitutionalMemoryEntry.objects.for_tenant(self.tenant_id)

        # Simple token / tag matching fallback
        query_tokens = [w.lower() for w in str(query_text).split() if len(w) > 2]
        scored_entries: List[tuple[int, InstitutionalMemoryEntry]] = []

        for item in entries_qs:
            # Defence-in-depth: every row re-confirms tenant ownership
            item.assert_tenant(self.tenant_id)
            text_corpus = (
                item.company_name
                + " "
                + item.summary
                + " "
                + item.content_text
                + " "
                + " ".join(item.tags)
            ).lower()
            score = sum(1 for t in query_tokens if t in text_corpus)
            if score > 0 or not query_tokens:
                scored_entries.append((score, item))

        scored_entries.sort(key=lambda x: x[0], reverse=True)
        top_entries = [e[1] for e in scored_entries[:k]]

        memory_entries = [
            MemoryEntry(
                entry_id=str(e.id),
                tenant_id=e.tenant_id,
                source_type=e.source_type,
                company_name=e.company_name,
                summary=e.summary,
                content_text=e.content_text,
                tags=e.tags,
                verdict=e.verdict,
                created_at=e.created_at.isoformat(),
            )
            for e in top_entries
        ]

        if memory_entries:
            summary_points = [
                f"• [{e.company_name} - {e.source_type}]: {e.summary} "
                f"(Verdict: {e.verdict or 'N/A'})"
                for e in memory_entries
            ]
            institutional_context = "\n".join(summary_points)
            answer = (
                f"Found {len(memory_entries)} relevant historical deal records "
                f"matching your query:\n\n{institutional_context}"
            )
            confidence = 0.88
        else:
            institutional_context = "No direct historical deal records found for this query."
            answer = (
                f"No previous investment memos or post-mortems match "
                f"'{query_text}' in tenant {self.tenant_id}."
            )
            confidence = 0.50

        logger.info(
            "digital_brain.query.ok",
            tenant_id=self.tenant_id,
            result_count=len(memory_entries),
            k=k,
        )

        return MemoryQueryResult(
            answer=answer,
            matched_entries=memory_entries,
            confidence=confidence,
            institutional_context=institutional_context,
        )

    def lint_memory(self) -> Dict[str, Any]:
        """Operation 3: Lint institutional memory to detect contradictions and orphan theses."""
        from apps.intelligence.models import InstitutionalMemoryEntry

        # SEC-002: invariants + scoped query
        assert self.tenant_id, "DigitalBrainService tenant_id not set"
        entries = list(InstitutionalMemoryEntry.objects.for_tenant(self.tenant_id))

        # Defence-in-depth tenant assertion on every row
        for e in entries:
            e.assert_tenant(self.tenant_id)

        contradictions: List[str] = []
        orphans: List[str] = []

        # Group by company name to check for contradicting verdicts
        by_company: Dict[str, List[InstitutionalMemoryEntry]] = {}
        for e in entries:
            key = e.company_name.lower().strip() if e.company_name else ""
            if key:
                by_company.setdefault(key, []).append(e)

        for comp, records in by_company.items():
            verdicts = {r.verdict.lower() for r in records if r.verdict and r.verdict.strip()}
            if "invest" in verdicts and "pass" in verdicts:
                contradictions.append(
                    f"Contradicting verdicts recorded for company '{comp.title()}': "
                    f"both 'invest' and 'pass' entries present."
                )

        for e in entries:
            if not e.tags or e.tags == ["general"]:
                orphans.append(
                    f"Untagged entry '{e.company_name}' ({e.source_type}) "
                    f"lacks classification tags."
                )

        logger.info(
            "digital_brain.lint.ok",
            tenant_id=self.tenant_id,
            total_entries=len(entries),
            contradictions=len(contradictions),
            orphans=len(orphans),
        )

        return {
            "total_entries": len(entries),
            "contradictions": contradictions,
            "orphaned_entries": orphans,
            "status": "healthy" if not contradictions else "requires_reconciliation",
        }
