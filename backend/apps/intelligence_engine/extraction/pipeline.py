"""
apps.intelligence_engine.extraction.pipeline
=============================================
ExtractionPipeline — wires AIFactExtractor → EvidenceEngine → OpportunityParser
into a single callable used by CrawlEngine.

Pipeline:
  SourceDocument
      ↓
  AIFactExtractor.extract()        multi-layer fact extraction
      ↓
  EvidenceEngine.persist()         DB fact persistence + conflict detection
      ↓
  OpportunityParser.ingest()       upsert OpportunityLifecycle + FundingOpportunity
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from apps.intelligence_engine.extraction.fact_extractor import AIFactExtractor
from apps.intelligence_engine.extraction.evidence_engine import EvidenceEngine
from apps.intelligence_engine.extraction.opportunity_parser import OpportunityParser
from apps.intelligence_engine.models_core import SourceDocument, SourceRegistry

logger = logging.getLogger(__name__)

# Slug lookup: maps organization name to a canonical slug prefix
_ORG_SLUG_MAP = {
    "Antler":        "antler-nigeria-cohort-2026",
    "Visa":          "visa-africa-fintech-accelerator-2026",
    "Google":        "google-startups-accelerator-africa-2026",
    "Y Combinator":  "y-combinator-batch-2026",
    "Techstars":     "techstars-accelerator-africa-2026",
    "Future Africa": "future-africa-pre-seed-rolling",
    "MassChallenge": "masschallenge-africa-2026",
    "Microsoft":     "microsoft-founders-hub-africa-2026",
    "Seedstars":     "seedstars-africa-ventures-2026",
    "Base10":        "base10-advancement-initiative-2026",
    "Flat6Labs":     "flat6labs-accelerator-africa-2026",
    "Launch Africa": "launch-africa-ventures-2026",
    "Norrsken22":    "norrsken22-fund-2026",
    "Orange Corners":"orange-corners-africa-2026",
    "54 Collective": "54-collective-fund-2026",
}

_ORG_TITLE_MAP = {
    "Antler":        "Antler Nigeria Cohort 2026",
    "Visa":          "Visa Africa Fintech Accelerator",
    "Google":        "Google for Startups Accelerator: Africa",
    "Y Combinator":  "Y Combinator W2026 Batch",
    "Techstars":     "Techstars Accelerator — Africa Track",
    "Future Africa": "Future Africa Pre-Seed Collective",
    "MassChallenge": "MassChallenge Africa Program",
    "Microsoft":     "Microsoft for Startups Founders Hub",
    "Seedstars":     "Seedstars Africa Ventures",
    "Base10":        "Base10 Advancement Initiative",
    "Flat6Labs":     "Flat6Labs Africa Accelerator",
    "Launch Africa": "Launch Africa Ventures — Pre-Seed Fund",
    "Norrsken22":    "Norrsken22 Africa Growth Fund",
    "Orange Corners":"Orange Corners Incubation Programme",
    "54 Collective": "54 Collective Seed Fund",
}


class ExtractionPipeline:
    """Orchestrates fact extraction → evidence persistence → opportunity upsert."""

    def __init__(self, use_ai: bool = True):
        self.extractor = AIFactExtractor(use_ai=use_ai)
        self.evidence  = EvidenceEngine()
        self.parser    = OpportunityParser()

    def run(self, document: SourceDocument, source: SourceRegistry) -> Dict[str, Any]:
        """
        Run the full extraction pipeline for a single document.
        Returns a summary dict with counts and errors.
        """
        org = source.organization
        slug  = _ORG_SLUG_MAP.get(org, f"{org.lower().replace(' ','-')}-program")
        title = _ORG_TITLE_MAP.get(org, f"{org} Program")
        errors = []

        # 1. Extract facts
        try:
            extraction = self.extractor.extract(document, source)
        except Exception as exc:
            logger.error("[pipeline] extractor failed %s: %s", org, exc, exc_info=True)
            return {"facts_extracted": 0, "opportunities_upserted": 0, "errors": [str(exc)]}

        if not extraction.facts:
            logger.info("[pipeline] %s: no facts extracted", org)
            return {"facts_extracted": 0, "opportunities_upserted": 0, "errors": []}

        # 2. Persist to EvidenceEngine
        try:
            canonical = self.evidence.persist(
                extraction=extraction,
                document=document,
                source=source,
                subject_entity=slug,
                subject_entity_type="opportunity",
            )
        except Exception as exc:
            logger.error("[pipeline] evidence persist failed %s: %s", org, exc, exc_info=True)
            errors.append(f"evidence_persist:{exc}")
            canonical = {}

        # 3. Parse into OpportunityLifecycle
        opps_upserted = 0
        try:
            parse_result = self.parser.ingest(
                canonical=canonical,
                source=source,
                document=document,
                subject_slug=slug,
                program_title=title,
            )
            opps_upserted = 1
            logger.info(
                "[pipeline] %s → opp=%s status=%s freshness=%.2f synced=%s",
                org, parse_result.get("slug"), parse_result.get("status"),
                parse_result.get("freshness", 0), parse_result.get("synced_matching"),
            )
        except Exception as exc:
            logger.error("[pipeline] parser failed %s: %s", org, exc, exc_info=True)
            errors.append(f"parser:{exc}")

        return {
            "facts_extracted":        len(extraction.facts),
            "opportunities_upserted": opps_upserted,
            "ai_used":                extraction.ai_used,
            "overall_confidence":     extraction.overall_confidence,
            "errors":                 errors,
        }
