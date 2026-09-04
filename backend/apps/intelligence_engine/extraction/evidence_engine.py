"""
apps.intelligence_engine.extraction.evidence_engine
====================================================
EvidenceEngine — persists extracted facts with full provenance,
detects conflicts across sources, and computes canonical field values.

Responsibilities:
  1. Persist ExtractedFact → RawFact + FactEvidence (DB records)
  2. Archive superseded facts as FactVersion
  3. Detect conflicts when sources disagree → ConflictRecord
  4. Resolve conflicts via trust-tier hierarchy
  5. Compute per-field confidence scores for the canonical opportunity record
  6. Emit ChangeEvent when canonical values change

Architecture principle:
  "Don't store: deadline = October 31, 2026
   Store: deadline.value + deadline.source_url + deadline.retrieved_at
          + deadline.evidence + deadline.confidence + deadline.status"
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from django.db import transaction
from django.utils import timezone

from apps.intelligence_engine.models_core import (
    SourceDocument,
    SourceRegistry,
    RawFact,
    FactEvidence,
    FactVersion,
    ChangeEvent,
    ConflictRecord,
)
from apps.intelligence_engine.extraction.fact_extractor import ExtractedFact, ExtractionResult

logger = logging.getLogger(__name__)

# Conflict threshold: if two sources give values this far apart, raise a conflict
_DATE_CONFLICT_DAYS   = 14     # > 14 days apart → conflict
_MONEY_CONFLICT_PCT   = 0.30   # > 30% apart → conflict
_TIER_TRUST_ORDER     = {"T1": 0, "T2": 1, "T3": 2, "T4": 3}


# ---------------------------------------------------------------------------
# EvidenceEngine
# ---------------------------------------------------------------------------

class EvidenceEngine:
    """
    Transforms an ExtractionResult into DB-backed RawFact + FactEvidence records
    with conflict detection and canonical value resolution.
    """

    def persist(
        self,
        extraction: ExtractionResult,
        document: SourceDocument,
        source: SourceRegistry,
        subject_entity: str,
        subject_entity_type: str = "opportunity",
    ) -> Dict[str, Any]:
        """
        Persist all facts from an ExtractionResult.
        Returns a summary dict: {field → canonical_value, field_confidence, ...}
        """
        now = timezone.now()
        persisted: List[RawFact] = []
        conflicts_raised = 0

        with transaction.atomic():
            for ef in extraction.facts:
                if not ef.is_reliable():
                    continue
                try:
                    fact, evidence = self._persist_fact(
                        ef, document, source, subject_entity, subject_entity_type, now
                    )
                    persisted.append(fact)

                    # Check for conflict with existing facts of same type/subject
                    conflict = self._check_conflict(fact, subject_entity)
                    if conflict:
                        conflicts_raised += 1

                except Exception as exc:
                    logger.error(
                        "[evidence] persist_fact failed %s/%s: %s",
                        subject_entity, ef.fact_type, exc, exc_info=True,
                    )

        # Build canonical value map (best fact per type)
        canonical = self._build_canonical_map(subject_entity, subject_entity_type)
        canonical["_persisted_count"] = len(persisted)
        canonical["_conflicts_raised"] = conflicts_raised

        logger.info(
            "[evidence] %s: persisted=%d conflicts=%d canonical_fields=%d",
            subject_entity, len(persisted), conflicts_raised,
            len([k for k in canonical if not k.startswith("_")]),
        )
        return canonical

    # -----------------------------------------------------------------------
    # Fact persistence
    # -----------------------------------------------------------------------

    def _persist_fact(
        self,
        ef: ExtractedFact,
        document: SourceDocument,
        source: SourceRegistry,
        subject_entity: str,
        subject_entity_type: str,
        now: Any,
    ) -> Tuple[RawFact, FactEvidence]:
        """
        Create or update a RawFact and its FactEvidence.

        If a fact of the same type + subject already exists:
          - If the new confidence is higher → archive old as FactVersion, update fact
          - If the new confidence is lower  → only create FactEvidence (additional source)
        """
        existing = (
            RawFact.objects
            .filter(
                subject_entity=subject_entity,
                fact_type=self._map_fact_type(ef.fact_type),
                source=source,
            )
            .order_by("-extracted_at")
            .first()
        )

        fact_type_key = self._map_fact_type(ef.fact_type)

        if existing:
            if ef.confidence > existing.confidence:
                # Archive the existing version
                FactVersion.objects.create(
                    fact=existing,
                    version_number=existing.factversion_set.count() + 1
                    if hasattr(existing, "factversion_set") else 1,
                    raw_value=existing.raw_value,
                    normalized_value=existing.normalized_value,
                    confidence=existing.confidence,
                    verification_status=existing.verification_status,
                    evidence_snippet=existing.raw_value[:500],
                    source_url=document.url,
                    reason=f"superseded_by_higher_confidence:{ef.confidence:.2f}",
                )
                # Update the existing fact with the new better value
                existing.raw_value          = str(ef.raw_value)
                existing.normalized_value   = ef.normalized_value
                existing.confidence         = ef.confidence
                existing.extraction_method  = ef.extraction_method
                existing.verification_status = RawFact.VerificationStatus.EXTRACTED
                existing.extracted_at       = now
                existing.save()
                fact = existing
            else:
                fact = existing
                # Still create evidence for the additional source
        else:
            fact = RawFact.objects.create(
                document=document,
                source=source,
                fact_type=fact_type_key,
                subject_entity=subject_entity,
                subject_entity_type=subject_entity_type,
                raw_value=str(ef.raw_value)[:2000],
                normalized_value=ef.normalized_value,
                unit=ef.unit,
                source_tier=source.tier,
                confidence=ef.confidence,
                extraction_method=ef.extraction_method,
                verification_status=RawFact.VerificationStatus.EXTRACTED,
                extracted_at=now,
            )

        evidence = FactEvidence.objects.create(
            fact=fact,
            source_url=ef.source_url or document.url,
            evidence_snippet=ef.evidence_snippet[:2000],
            context_window=ef.context_window[:500],
            locator=ef.locator,
            extraction_method=ef.extraction_method,
            confidence=ef.confidence,
            retrieved_at=now,
            content_hash=document.content_hash,
        )

        return fact, evidence

    # -----------------------------------------------------------------------
    # Conflict detection
    # -----------------------------------------------------------------------

    def _check_conflict(self, new_fact: RawFact, subject_entity: str) -> bool:
        """
        Check if a new fact conflicts with existing facts from different sources.
        Raises ConflictRecord if conflict detected.
        Returns True if a new conflict was created.
        """
        existing_facts = (
            RawFact.objects
            .filter(
                subject_entity=subject_entity,
                fact_type=new_fact.fact_type,
                verification_status__in=[
                    RawFact.VerificationStatus.EXTRACTED,
                    RawFact.VerificationStatus.VERIFIED,
                ],
            )
            .exclude(id=new_fact.id)
            .select_related("source")
        )

        if not existing_facts.exists():
            return False

        for old_fact in existing_facts:
            if self._values_conflict(new_fact.fact_type, new_fact.normalized_value,
                                      old_fact.normalized_value):
                self._create_or_update_conflict(new_fact, old_fact, subject_entity)
                return True

        return False

    def _values_conflict(
        self, fact_type: str, val_a: Any, val_b: Any
    ) -> bool:
        """Returns True if two values for the same fact type are meaningfully different."""
        if val_a is None or val_b is None:
            return False

        if fact_type == "deadline":
            try:
                import datetime
                date_a = datetime.date.fromisoformat(str(val_a)[:10])
                date_b = datetime.date.fromisoformat(str(val_b)[:10])
                return abs((date_a - date_b).days) > _DATE_CONFLICT_DAYS
            except (ValueError, TypeError):
                return str(val_a) != str(val_b)

        if fact_type in ("funding_min", "funding_max"):
            try:
                a, b = float(val_a), float(val_b)
                if b == 0:
                    return False
                return abs(a - b) / b > _MONEY_CONFLICT_PCT
            except (TypeError, ValueError):
                return str(val_a) != str(val_b)

        if fact_type == "status":
            return str(val_a).upper() != str(val_b).upper()

        return False

    def _create_or_update_conflict(
        self, new_fact: RawFact, old_fact: RawFact, subject_entity: str
    ) -> None:
        conflict, created = ConflictRecord.objects.get_or_create(
            field_name=new_fact.fact_type,
            subject_entity=subject_entity,
            resolution_status=ConflictRecord.ResolutionStatus.OPEN,
            defaults={"subject_entity_type": new_fact.subject_entity_type},
        )

        # Build conflicting facts list
        new_entry = {
            "value": new_fact.normalized_value,
            "raw_value": new_fact.raw_value,
            "source_url": new_fact.document.url if new_fact.document_id else "",
            "source_tier": new_fact.source_tier,
            "confidence": new_fact.confidence,
            "extraction_method": new_fact.extraction_method,
            "retrieved_at": new_fact.extracted_at.isoformat(),
        }
        old_entry = {
            "value": old_fact.normalized_value,
            "raw_value": old_fact.raw_value,
            "source_url": old_fact.document.url if old_fact.document_id else "",
            "source_tier": old_fact.source_tier,
            "confidence": old_fact.confidence,
            "extraction_method": old_fact.extraction_method,
            "retrieved_at": old_fact.extracted_at.isoformat(),
        }

        facts_list = conflict.conflicting_facts or []
        # Only add if not already present
        existing_vals = {json.dumps(f, sort_keys=True, default=str) for f in facts_list}
        for entry in [old_entry, new_entry]:
            key = json.dumps(entry, sort_keys=True, default=str)
            if key not in existing_vals:
                facts_list.append(entry)
                existing_vals.add(key)

        conflict.conflicting_facts = facts_list
        conflict.save(update_fields=["conflicting_facts"])

        # Auto-resolve by trust hierarchy
        conflict.auto_resolve()

        logger.info(
            "[conflict] %s field=%s — %d sources disagree → resolved=%s",
            subject_entity, new_fact.fact_type, len(facts_list),
            conflict.recommended_value,
        )

    # -----------------------------------------------------------------------
    # Canonical value map
    # -----------------------------------------------------------------------

    def _build_canonical_map(
        self, subject_entity: str, subject_entity_type: str
    ) -> Dict[str, Any]:
        """
        Build a canonical {field → value} map from the highest-confidence
        verified/extracted facts for this subject.

        Conflict-resolved values take precedence over raw highest-confidence.
        """
        canonical: Dict[str, Any] = {}
        field_confidence: Dict[str, float] = {}
        field_evidence: Dict[str, str] = {}
        field_source_urls: Dict[str, str] = {}

        # Check for conflict-resolved values first
        for conflict in ConflictRecord.objects.filter(
            subject_entity=subject_entity,
            resolution_status__in=[
                ConflictRecord.ResolutionStatus.AUTO,
                ConflictRecord.ResolutionStatus.MANUAL,
            ],
        ):
            canonical[conflict.field_name] = conflict.resolved_value
            field_confidence[conflict.field_name] = 0.90  # post-resolution confidence

        # Fill remaining fields from best RawFact
        facts_qs = (
            RawFact.objects
            .filter(
                subject_entity=subject_entity,
                verification_status__in=[
                    RawFact.VerificationStatus.EXTRACTED,
                    RawFact.VerificationStatus.VERIFIED,
                ],
            )
            .order_by("-confidence")
            .select_related("source", "document")
        )

        for fact in facts_qs:
            ft = fact.fact_type
            if ft not in canonical:
                canonical[ft] = fact.normalized_value
                field_confidence[ft] = fact.confidence
                # Attach evidence info
                ev = fact.evidence_records.order_by("-confidence").first()
                if ev:
                    field_evidence[ft]    = ev.evidence_snippet[:300]
                    field_source_urls[ft] = ev.source_url

        canonical["_confidence"]   = field_confidence
        canonical["_evidence"]     = field_evidence
        canonical["_source_urls"]  = field_source_urls
        return canonical

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _map_fact_type(extracted_type: str) -> str:
        """Map extractor fact_type strings to RawFact.FactType choices."""
        mapping = {
            "status":       RawFact.FactType.APPLICATION_STATUS,
            "deadline":     RawFact.FactType.APPLICATION_DEADLINE,
            "cohort_start": RawFact.FactType.COHORT_START_DATE,
            "funding_min":  RawFact.FactType.FUNDING_AMOUNT_MIN,
            "funding_max":  RawFact.FactType.FUNDING_AMOUNT_MAX,
            "equity":       RawFact.FactType.EQUITY_TERMS,
            "benefit":      RawFact.FactType.KEY_BENEFIT,
            "eligibility":  RawFact.FactType.ELIGIBILITY,
            "description":  RawFact.FactType.DESCRIPTION,
            "cohort_year":  RawFact.FactType.COHORT_YEAR,
            "geography":    RawFact.FactType.GEOGRAPHY,
            "sector":       RawFact.FactType.SECTOR,
            "stage":        RawFact.FactType.STAGE,
        }
        return mapping.get(extracted_type, RawFact.FactType.GENERAL)
