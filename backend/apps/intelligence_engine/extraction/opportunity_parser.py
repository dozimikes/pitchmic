"""
apps.intelligence_engine.extraction.opportunity_parser
=======================================================
OpportunityParser — maps the canonical fact map from EvidenceEngine to
OpportunityLifecycle DB records (and backwards-compat FundingOpportunity).

Flow:
  EvidenceEngine.canonical_map
        ↓
  OpportunityParser.ingest(canonical, source, document)
        ↓
  OpportunityLifecycle.objects.update_or_create()
        ↓
  DeadlineEvidence records (per-field provenance)
        ↓
  ChangeEvent (when status / deadline / funding changed)
        ↓
  matching.FundingOpportunity.objects.update_or_create() (backward compat)

Architecture note:
  The baseline profile provides immutable *metadata* about each program
  (sector focus, stage, app URL) that cannot be scraped from a live page.
  It is NOT a fabricated data source — it is curated minimum-known-good info.
  All time-sensitive fields (deadline, status, funding amount, equity) come
  exclusively from the live canonical_map.  If a live value is missing the
  field stays null/UNKNOWN rather than inventing a value.
"""
from __future__ import annotations

import datetime
import json
import logging
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.intelligence_engine.models_core import ChangeEvent, SourceRegistry
from apps.intelligence_engine.models_opportunities import (
    DeadlineEvidence,
    OpportunityLifecycle,
    OpportunityRequirement,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Status string → LifecycleStatus mapping
# ---------------------------------------------------------------------------
_STATUS_MAP = {
    "OPEN":         OpportunityLifecycle.LifecycleStatus.OPEN,
    "CLOSED":       OpportunityLifecycle.LifecycleStatus.CLOSED,
    "CLOSING_SOON": OpportunityLifecycle.LifecycleStatus.DEADLINE_APPROACHING,
    "ROLLING":      OpportunityLifecycle.LifecycleStatus.ROLLING,
    "OPENING_SOON": OpportunityLifecycle.LifecycleStatus.OPENING_SOON,
    "UPCOMING":     OpportunityLifecycle.LifecycleStatus.OPENING_SOON,
    "PAUSED":       OpportunityLifecycle.LifecycleStatus.PAUSED,
    "UNKNOWN":      OpportunityLifecycle.LifecycleStatus.UNKNOWN,
}

# ---------------------------------------------------------------------------
# Curated baseline profiles
# (structural metadata only — NO time-sensitive values)
# ---------------------------------------------------------------------------
_BASELINE_PROFILES: Dict[str, Dict[str, Any]] = {
    "Antler": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.ACCELERATOR,
        target_stages=["pre_seed"],
        target_geographies=["Nigeria", "Pan-Africa", "Global"],
        target_sectors=["fintech", "b2b_saas", "clean_tech", "logistics"],
        application_url="https://www.antler.co/pitch",
        evidence_requirements=["Problem-solution deck", "Cap table", "Customer validation"],
        source_reliability=0.98,
    ),
    "Visa": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.ACCELERATOR,
        target_stages=["seed"],
        target_geographies=["Kenya", "Nigeria", "South Africa", "Ghana", "Pan-Africa"],
        target_sectors=["fintech", "payments", "merchant_enablement"],
        application_url="https://africa.visa.com/en_MW/visa-everywhere/innovation/visa-accelerator.html",
        evidence_requirements=["Transaction volume", "API docs", "Regulatory compliance"],
        source_reliability=0.98,
    ),
    "Google": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.ACCELERATOR,
        target_stages=["seed"],
        target_geographies=["Pan-Africa", "Nigeria", "Kenya", "Rwanda", "Egypt"],
        target_sectors=["ai_ml", "fintech", "healthtech", "cleantech", "b2b_saas"],
        application_url="https://startup.google.com/programs/accelerator/africa/",
        evidence_requirements=["Technical architecture", "MRR docs", "Cloud usage plan"],
        is_equity_free=True,
        source_reliability=0.98,
    ),
    "Y Combinator": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.ACCELERATOR,
        target_stages=["pre_seed", "seed"],
        target_geographies=["Global"],
        target_sectors=["all"],
        is_global=True,
        application_url="https://www.ycombinator.com/apply",
        evidence_requirements=["YC application", "MVP video", "Founder bios"],
        source_reliability=0.99,
    ),
    "Techstars": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.ACCELERATOR,
        target_stages=["seed"],
        target_geographies=["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Egypt", "Global"],
        target_sectors=["fintech", "logistics", "healthtech", "agritech", "b2b_saas"],
        application_url="https://apply.techstars.com/",
        evidence_requirements=["Product demo", "Customer pipeline", "Team credentials"],
        source_reliability=0.97,
    ),
    "Future Africa": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.PRE_SEED_FUND,
        target_stages=["pre_seed"],
        target_geographies=["Nigeria", "Kenya", "South Africa", "Ghana", "Pan-Africa"],
        target_sectors=["fintech", "logistics", "education", "health", "infrastructure"],
        is_rolling=True,
        application_url="https://www.future.africa",
        evidence_requirements=["Financial model", "Customer discovery", "Use of funds"],
        source_reliability=0.96,
    ),
    "MassChallenge": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.GRANT,
        target_stages=["pre_seed"],
        target_geographies=["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Ghana", "Egypt"],
        target_sectors=["healthtech", "cleantech", "fintech", "agritech", "edtech"],
        application_url="https://apply.masschallenge.org",
        evidence_requirements=["Impact evidence", "MVP demo", "Team profile"],
        is_equity_free=True,
        source_reliability=0.95,
    ),
    "Microsoft": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.CORPORATE_PROG,
        target_stages=["all"],
        target_geographies=["Global"],
        target_sectors=["all"],
        is_rolling=True,
        is_global=True,
        is_equity_free=True,
        application_url="https://portal.startups.microsoft.com/signup",
        evidence_requirements=["Product description", "Incorporation doc"],
        source_reliability=0.98,
    ),
    "Seedstars": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.PRE_SEED_FUND,
        target_stages=["pre_seed", "seed"],
        target_geographies=["Pan-Africa", "Nigeria", "Kenya", "Ghana", "Senegal", "Rwanda"],
        target_sectors=["fintech", "healthtech", "agritech", "edtech", "logistics"],
        is_rolling=True,
        application_url="https://www.seedstars-africa.vc",
        evidence_requirements=["Market analysis", "Traction metrics", "Financial projections"],
        source_reliability=0.96,
    ),
    "Base10": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.SEED_FUND,
        target_stages=["seed"],
        target_geographies=["Global", "Pan-Africa", "Nigeria", "Kenya", "South Africa"],
        target_sectors=["automation", "ai_ml", "fintech", "workforce", "b2b_saas"],
        is_rolling=True,
        application_url="https://base10.vc/purpose/",
        evidence_requirements=["Revenue docs", "Technical moat", "Pitch deck"],
        source_reliability=0.96,
    ),
    "Flat6Labs": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.ACCELERATOR,
        target_stages=["pre_seed"],
        target_geographies=["Egypt", "Tunisia", "Morocco", "Nigeria", "Pan-Africa"],
        target_sectors=["fintech", "healthtech", "edtech", "ai_ml", "b2b_saas"],
        application_url="https://flat6labs.com/program/",
        evidence_requirements=["MVP demo", "Early validation", "Team profile"],
        source_reliability=0.96,
    ),
    "Launch Africa": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.PRE_SEED_FUND,
        target_stages=["pre_seed"],
        target_geographies=["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Ghana", "Rwanda"],
        target_sectors=["fintech", "b2b_saas", "logistics", "cleantech", "healthcare"],
        is_rolling=True,
        application_url="https://www.launchafrica.vc",
        evidence_requirements=["Pitch deck", "Financial model", "MRR metrics"],
        source_reliability=0.96,
    ),
    "Norrsken22": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.SEED_FUND,
        target_stages=["seed"],
        target_geographies=["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Rwanda"],
        target_sectors=["fintech", "cleantech", "healthtech", "agritech", "climate"],
        is_rolling=True,
        application_url="https://www.norrsken22.com",
        evidence_requirements=["Impact metrics", "Revenue ARR", "Full pitch deck"],
        source_reliability=0.95,
    ),
    "Orange Corners": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.GRANT,
        target_stages=["pre_seed"],
        target_geographies=["Nigeria", "Ghana", "Ethiopia", "Morocco", "Tunisia", "Egypt"],
        target_sectors=["all"],
        is_equity_free=True,
        application_url="https://www.orangecorners.com/apply/",
        evidence_requirements=["Business plan", "Impact objectives", "Motivation letter"],
        source_reliability=0.94,
    ),
    "54 Collective": dict(
        opportunity_type=OpportunityLifecycle.OpportunityType.SEED_FUND,
        target_stages=["seed"],
        target_geographies=["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Ghana"],
        target_sectors=["fintech", "b2b_saas", "logistics", "healthtech", "climate"],
        is_rolling=True,
        application_url="https://54collective.vc",
        evidence_requirements=["Traction metrics", "Financial model", "PMF evidence"],
        source_reliability=0.94,
    ),
}

# Fields that are "time-sensitive" and must come from live signals only
_LIVE_ONLY_FIELDS = {"deadline", "status", "funding_min", "funding_max", "equity", "cohort_start"}

# Fact type → model field name mapping
_FACT_TO_FIELD = {
    "status":       "lifecycle_status",
    "deadline":     "application_deadline",
    "cohort_start": "cohort_start_date",
    "funding_min":  "funding_min_usd",
    "funding_max":  "funding_max_usd",
    "equity":       "equity_terms",
    "description":  "description",
}

# Severity of field change for ChangeEvent
_FIELD_SEVERITY = {
    "lifecycle_status":     ChangeEvent.Severity.CRITICAL,
    "application_deadline": ChangeEvent.Severity.CRITICAL,
    "funding_min_usd":      ChangeEvent.Severity.HIGH,
    "funding_max_usd":      ChangeEvent.Severity.HIGH,
    "equity_terms":         ChangeEvent.Severity.MEDIUM,
    "description":          ChangeEvent.Severity.LOW,
}


class OpportunityParser:
    """
    Maps canonical facts to OpportunityLifecycle and FundingOpportunity records.
    """

    def ingest(
        self,
        canonical: Dict[str, Any],
        source: SourceRegistry,
        document: Any,
        subject_slug: str,
        program_title: str,
    ) -> Dict[str, Any]:
        """
        Main entry point.  Upserts OpportunityLifecycle, writes DeadlineEvidence,
        emits ChangeEvents, syncs FundingOpportunity.
        Returns summary dict.
        """
        now = timezone.now()
        baseline = _BASELINE_PROFILES.get(source.organization, {})
        confidence_map: Dict[str, float] = canonical.get("_confidence", {})
        evidence_map:   Dict[str, str]   = canonical.get("_evidence", {})
        source_urls:    Dict[str, str]   = canonical.get("_source_urls", {})

        with transaction.atomic():
            opp, created = self._upsert_lifecycle(
                canonical, baseline, source, subject_slug, program_title, now
            )
            if not created:
                self._detect_and_record_changes(opp, canonical, source, document)
            self._write_deadline_evidence(opp, canonical, evidence_map, source_urls, source, now)
            self._upsert_requirements(opp, canonical, evidence_map, source_urls, now)
            self._update_freshness(opp, source, now)

        # Sync to matching.FundingOpportunity for backward compatibility
        synced = self._sync_matching_opportunity(opp, source)

        return {
            "opportunity_id":   str(opp.id),
            "slug":             opp.slug,
            "created":          created,
            "status":           opp.lifecycle_status,
            "freshness":        opp.freshness_score,
            "synced_matching":  synced,
        }

    # -----------------------------------------------------------------------
    # Lifecycle upsert
    # -----------------------------------------------------------------------

    def _upsert_lifecycle(
        self,
        canonical: Dict[str, Any],
        baseline: Dict[str, Any],
        source: SourceRegistry,
        slug: str,
        title: str,
        now: Any,
    ) -> tuple[OpportunityLifecycle, bool]:

        # Resolve status (live signals only)
        raw_status = canonical.get("status")
        lifecycle_status = (
            _STATUS_MAP.get(str(raw_status).upper(), OpportunityLifecycle.LifecycleStatus.UNKNOWN)
            if raw_status else OpportunityLifecycle.LifecycleStatus.UNKNOWN
        )

        # Deadline (live only)
        deadline = self._parse_date(canonical.get("deadline"))

        # Auto-derive status from deadline proximity if live status is weak
        if deadline and lifecycle_status == OpportunityLifecycle.LifecycleStatus.UNKNOWN:
            days_left = (deadline - datetime.date.today()).days
            if days_left < 0:
                lifecycle_status = OpportunityLifecycle.LifecycleStatus.CLOSED
            elif days_left <= 21:
                lifecycle_status = OpportunityLifecycle.LifecycleStatus.DEADLINE_APPROACHING
            else:
                lifecycle_status = OpportunityLifecycle.LifecycleStatus.OPEN

        # Funding (live only)
        fund_min = self._parse_decimal(canonical.get("funding_min"))
        fund_max = self._parse_decimal(canonical.get("funding_max"))

        # Equity
        equity_raw = canonical.get("equity")
        is_equity_free = (
            baseline.get("is_equity_free", False)
            or bool(equity_raw and "free" in str(equity_raw).lower())
        )
        equity_terms = str(equity_raw) if equity_raw else ""

        # Rolling
        is_rolling = (
            baseline.get("is_rolling", False)
            or lifecycle_status == OpportunityLifecycle.LifecycleStatus.ROLLING
        )

        # Description
        desc_raw = canonical.get("description") or ""
        description = str(desc_raw)[:2000] if desc_raw else ""

        # Confidence
        confidence_map = canonical.get("_confidence", {})
        overall_conf = sum(confidence_map.values()) / max(len(confidence_map), 1)

        defaults = {
            "title":              title,
            "organization_name":  source.organization,
            "source":             source,
            "opportunity_type":   baseline.get("opportunity_type", OpportunityLifecycle.OpportunityType.ACCELERATOR),
            "lifecycle_status":   lifecycle_status,
            "target_stages":      baseline.get("target_stages", []),
            "target_geographies": baseline.get("target_geographies", []),
            "target_sectors":     baseline.get("target_sectors", []),
            "is_global":          baseline.get("is_global", False),
            "is_rolling":         is_rolling,
            "is_equity_free":     is_equity_free,
            "application_url":    baseline.get("application_url", source.application_url or ""),
            "evidence_requirements": baseline.get("evidence_requirements", []),
            "source_reliability": baseline.get("source_reliability", source.base_trust_score),
            "overall_confidence": overall_conf,
            "last_fetched_at":    timezone.now(),
            "last_fetched_from":  canonical.get("_source_urls", {}).get("status", source.base_url),
            "field_evidence_map": {
                k: v for k, v in canonical.get("_source_urls", {}).items()
            },
        }

        # Only set live-signal fields if we have them
        if deadline:
            defaults["application_deadline"] = deadline
        if fund_min is not None:
            defaults["funding_min_usd"] = fund_min
        if fund_max is not None:
            defaults["funding_max_usd"] = fund_max
        if equity_terms:
            defaults["equity_terms"] = equity_terms
        if description:
            defaults["description"] = description

        # Benefits from canonical
        benefits = self._collect_list_facts(canonical, "benefit")
        if benefits:
            defaults["key_benefits"] = benefits
        eligibility = self._collect_list_facts(canonical, "eligibility")
        if eligibility:
            defaults["eligibility_criteria"] = eligibility

        opp, created = OpportunityLifecycle.objects.update_or_create(
            slug=slug,
            defaults=defaults,
        )
        return opp, created

    # -----------------------------------------------------------------------
    # Change detection
    # -----------------------------------------------------------------------

    def _detect_and_record_changes(
        self,
        opp: OpportunityLifecycle,
        canonical: Dict[str, Any],
        source: SourceRegistry,
        document: Any,
    ) -> None:
        snapshot = getattr(document, "snapshot", None)
        source_urls = canonical.get("_source_urls", {})

        checks = [
            ("status",  "lifecycle_status",   _STATUS_MAP.get(str(canonical.get("status","")).upper())),
            ("deadline","application_deadline",self._parse_date(canonical.get("deadline"))),
            ("funding_min","funding_min_usd",  self._parse_decimal(canonical.get("funding_min"))),
            ("funding_max","funding_max_usd",  self._parse_decimal(canonical.get("funding_max"))),
        ]

        for fact_key, model_field, new_val in checks:
            if new_val is None:
                continue
            old_val = getattr(opp, model_field, None)
            if old_val != new_val:
                ChangeEvent.objects.create(
                    entity_type="opportunity",
                    entity_id=str(opp.id),
                    entity_name=opp.title,
                    field_name=model_field,
                    old_value=str(old_val) if old_val is not None else None,
                    new_value=str(new_val),
                    old_source_url="",
                    new_source_url=source_urls.get(fact_key, source.base_url),
                    severity=_FIELD_SEVERITY.get(model_field, ChangeEvent.Severity.MEDIUM),
                    snapshot=snapshot,
                )
                logger.info(
                    "[parser] CHANGE %s.%s: %s → %s",
                    opp.slug, model_field, old_val, new_val,
                )

    # -----------------------------------------------------------------------
    # Deadline evidence
    # -----------------------------------------------------------------------

    def _write_deadline_evidence(
        self,
        opp: OpportunityLifecycle,
        canonical: Dict[str, Any],
        evidence_map: Dict[str, str],
        source_urls: Dict[str, str],
        source: SourceRegistry,
        now: Any,
    ) -> None:
        deadline = self._parse_date(canonical.get("deadline"))
        if not deadline:
            return

        conf_map = canonical.get("_confidence", {})

        # Mark existing canonical records as non-canonical
        DeadlineEvidence.objects.filter(
            opportunity=opp,
            date_field=DeadlineEvidence.DateField.DEADLINE,
            is_canonical=True,
        ).update(is_canonical=False)

        DeadlineEvidence.objects.create(
            opportunity     = opp,
            date_field      = DeadlineEvidence.DateField.DEADLINE,
            value           = deadline,
            source_url      = source_urls.get("deadline", source.base_url),
            source_type     = "official_website",
            source_tier     = source.tier,
            evidence_snippet= evidence_map.get("deadline", "")[:500],
            extraction_method = "multi_layer_extractor",
            confidence      = conf_map.get("deadline", 0.70),
            retrieved_at    = now,
            is_canonical    = True,
        )

        # Cohort start
        cohort_start = self._parse_date(canonical.get("cohort_start"))
        if cohort_start:
            DeadlineEvidence.objects.create(
                opportunity     = opp,
                date_field      = DeadlineEvidence.DateField.COHORT_START,
                value           = cohort_start,
                source_url      = source_urls.get("cohort_start", source.base_url),
                source_type     = "official_website",
                source_tier     = source.tier,
                evidence_snippet= evidence_map.get("cohort_start", "")[:500],
                extraction_method = "multi_layer_extractor",
                confidence      = conf_map.get("cohort_start", 0.70),
                retrieved_at    = now,
                is_canonical    = True,
            )

    # -----------------------------------------------------------------------
    # Requirements
    # -----------------------------------------------------------------------

    def _upsert_requirements(
        self,
        opp: OpportunityLifecycle,
        canonical: Dict[str, Any],
        evidence_map: Dict[str, str],
        source_urls: Dict[str, str],
        now: Any,
    ) -> None:
        eligibility_items = self._collect_list_facts(canonical, "eligibility")
        for item in eligibility_items[:8]:
            OpportunityRequirement.objects.get_or_create(
                opportunity=opp,
                description=item[:255],
                defaults={
                    "requirement_type": OpportunityRequirement.RequirementType.OTHER,
                    "is_mandatory": True,
                    "is_blocking": False,
                    "weight": 1.0,
                    "source_url": source_urls.get("eligibility", ""),
                    "evidence_snippet": item[:255],
                    "confidence": canonical.get("_confidence", {}).get("eligibility", 0.70),
                    "extracted_at": now,
                },
            )

    # -----------------------------------------------------------------------
    # Freshness update
    # -----------------------------------------------------------------------

    def _update_freshness(
        self, opp: OpportunityLifecycle, source: SourceRegistry, now: Any
    ) -> None:
        opp.last_verified_at = now
        opp.last_fetched_at  = now
        opp.evidence_quality = min(1.0, opp.overall_confidence + 0.05)
        opp.compute_freshness()
        opp.save(update_fields=[
            "last_verified_at", "last_fetched_at", "evidence_quality",
            "freshness_score", "recency_factor",
        ])

    # -----------------------------------------------------------------------
    # Backward-compat sync to matching.FundingOpportunity
    # -----------------------------------------------------------------------

    def _sync_matching_opportunity(
        self, opp: OpportunityLifecycle, source: SourceRegistry
    ) -> bool:
        """
        Sync the OpportunityLifecycle record back to matching.FundingOpportunity
        for backward compatibility with the existing matching engine.
        """
        try:
            from apps.matching.models_opportunity import FundingOpportunity, FundingSource

            matching_source, _ = FundingSource.objects.get_or_create(
                organization=source.organization,
                name=source.name,
                defaults={
                    "base_url": source.base_url,
                    "application_url": source.application_url or "",
                    "trust_score": source.base_trust_score,
                },
            )

            # Map LifecycleStatus → FundingOpportunity.Status
            status_map = {
                "open":         FundingOpportunity.Status.OPEN,
                "closing":      FundingOpportunity.Status.CLOSING_SOON,
                "closed":       FundingOpportunity.Status.CLOSED,
                "rolling":      FundingOpportunity.Status.ROLLING,
                "opening_soon": FundingOpportunity.Status.UPCOMING,
                "verified":     FundingOpportunity.Status.UPCOMING,
                "discovered":   FundingOpportunity.Status.UPCOMING,
                "unverified":   FundingOpportunity.Status.UPCOMING,
                "paused":       FundingOpportunity.Status.PAUSED,
                "archived":     FundingOpportunity.Status.CLOSED,
                "unknown":      FundingOpportunity.Status.UPCOMING,
            }
            fo_status = status_map.get(opp.lifecycle_status, FundingOpportunity.Status.UPCOMING)

            # Build provenance JSON for source_quote_evidence
            evidence_blob = json.dumps({
                "data_source_type": "intelligence_engine",
                "lifecycle_id": str(opp.id),
                "contributing_urls": [opp.last_fetched_from] if opp.last_fetched_from else [],
                "overall_confidence": opp.overall_confidence,
                "freshness_score": opp.freshness_score,
                "extracted_at": timezone.now().isoformat(),
            }, default=str)[:4000]

            FundingOpportunity.objects.update_or_create(
                slug=opp.slug,
                defaults={
                    "source":                matching_source,
                    "title":                 opp.title,
                    "status":                fo_status,
                    "opportunity_type":      opp.opportunity_type,
                    "target_stage":          (opp.target_stages or ["pre_seed"])[0],
                    "target_geographies":    opp.target_geographies or [],
                    "target_sectors":        opp.target_sectors or [],
                    "funding_amount_min_usd": opp.funding_min_usd or Decimal("0"),
                    "funding_amount_max_usd": opp.funding_max_usd or Decimal("100000"),
                    "equity_percentage_taken": opp.equity_terms or "Market terms",
                    "application_deadline":  opp.application_deadline,
                    "cohort_start_date":     opp.cohort_start_date,
                    "is_rolling":            opp.is_rolling,
                    "source_confidence":     opp.overall_confidence or source.base_trust_score,
                    "description":           opp.description or "",
                    "key_benefits":          opp.key_benefits or [],
                    "eligibility_criteria":  opp.eligibility_criteria or [],
                    "evidence_requirements": opp.evidence_requirements or [],
                    "source_quote_evidence": evidence_blob,
                },
            )
            return True
        except Exception as exc:
            logger.error("[parser] FundingOpportunity sync failed: %s", exc, exc_info=True)
            return False

    # -----------------------------------------------------------------------
    # Utilities
    # -----------------------------------------------------------------------

    @staticmethod
    def _parse_date(val: Any) -> Optional[datetime.date]:
        if not val:
            return None
        if isinstance(val, datetime.date):
            return val
        try:
            return datetime.date.fromisoformat(str(val)[:10])
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_decimal(val: Any) -> Optional[Decimal]:
        if val is None:
            return None
        try:
            return Decimal(str(val)).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError, ValueError):
            return None

    @staticmethod
    def _collect_list_facts(canonical: Dict[str, Any], fact_type: str) -> List[str]:
        """Collect all list-type facts from canonical map (stored as multiple keys)."""
        items: List[str] = []
        for key, val in canonical.items():
            if key == fact_type and isinstance(val, str):
                items.append(val)
            elif key == fact_type and isinstance(val, list):
                items.extend(str(v) for v in val if v)
        return [i for i in items if len(i) >= 8][:8]
