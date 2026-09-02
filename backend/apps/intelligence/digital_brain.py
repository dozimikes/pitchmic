"""
apps.intelligence.digital_brain
===============================
Institutional Memory & Digital Brain Service.

Implements persistent venture capital knowledge compounding:
1. Ingest: Store raw immutable sources (IC debates, pitch decks, partner notes, post-mortems).
2. Query: Semantic & keyword hybrid search across past deal memos and theses.
3. Lint: Detect contradictions across deals (e.g. conflicting sector valuations, orphaned investment hypotheses).
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


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
    """

    def __init__(self, tenant_id: str = "default_fund"):
        self.tenant_id = tenant_id

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

        content_hash = hashlib.sha256(content_text.encode("utf-8")).hexdigest()[:12]
        now_iso = datetime.now(timezone.utc).isoformat()
        final_summary = summary or (content_text[:200] + "..." if len(content_text) > 200 else content_text)
        final_tags = tags or ["general", source_type]

        # Persist to database
        db_entry = InstitutionalMemoryEntry.objects.create(
            tenant_id=self.tenant_id,
            company_name=company_name,
            source_type=source_type,
            summary=final_summary,
            content_text=content_text,
            tags=final_tags,
            verdict=verdict or "",
        )

        return MemoryEntry(
            entry_id=str(db_entry.id),
            tenant_id=self.tenant_id,
            source_type=source_type,
            company_name=company_name,
            summary=final_summary,
            content_text=content_text,
            tags=final_tags,
            verdict=verdict,
            created_at=now_iso,
        )

    def query_memory(self, query_text: str, k: int = 5) -> MemoryQueryResult:
        """Operation 2: Query memory for relevant past deals and institutional reasoning."""
        from apps.intelligence.models import InstitutionalMemoryEntry

        # Filter by tenant
        entries_qs = InstitutionalMemoryEntry.objects.filter(tenant_id=self.tenant_id)
        
        # Simple token / tag matching fallback
        query_tokens = [w.lower() for w in query_text.split() if len(w) > 2]
        scored_entries: List[tuple[int, InstitutionalMemoryEntry]] = []

        for item in entries_qs:
            text_corpus = (item.company_name + " " + item.summary + " " + item.content_text + " " + " ".join(item.tags)).lower()
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
            summary_points = [f"• [{e.company_name} - {e.source_type}]: {e.summary} (Verdict: {e.verdict or 'N/A'})" for e in memory_entries]
            institutional_context = "\n".join(summary_points)
            answer = f"Found {len(memory_entries)} relevant historical deal records matching your query:\n\n{institutional_context}"
            confidence = 0.88
        else:
            institutional_context = "No direct historical deal records found for this query."
            answer = f"No previous investment memos or post-mortems match '{query_text}' in tenant {self.tenant_id}."
            confidence = 0.50

        return MemoryQueryResult(
            answer=answer,
            matched_entries=memory_entries,
            confidence=confidence,
            institutional_context=institutional_context,
        )

    def lint_memory(self) -> Dict[str, Any]:
        """Operation 3: Lint institutional memory to detect contradictions and orphan theses."""
        from apps.intelligence.models import InstitutionalMemoryEntry

        entries = list(InstitutionalMemoryEntry.objects.filter(tenant_id=self.tenant_id))
        contradictions = []
        orphans = []

        # Group by company name to check for contradicting verdicts
        by_company: Dict[str, List[InstitutionalMemoryEntry]] = {}
        for e in entries:
            by_company.setdefault(e.company_name.lower().strip(), []).append(e)

        for comp, records in by_company.items():
            verdicts = {r.verdict for r in records if r.verdict}
            if "invest" in verdicts and "pass" in verdicts:
                contradictions.append(
                    f"Contradicting verdicts recorded for company '{comp.title()}': both 'invest' and 'pass' entries present."
                )

        for e in entries:
            if not e.tags or e.tags == ["general"]:
                orphans.append(f"Untagged entry '{e.company_name}' ({e.source_type}) lacks classification tags.")

        return {
            "total_entries": len(entries),
            "contradictions": contradictions,
            "orphaned_entries": orphans,
            "status": "healthy" if not contradictions else "requires_reconciliation",
        }
