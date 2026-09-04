"""
backend.apps.matching.opportunity_service
=========================================
Continuous Funding Opportunity Intelligence & Ingestion Engine.

Two complementary discovery paths
-----------------------------------
Path A — Registered-source refresh  (known programs, 65+ sources)
    _get_or_create_tier1_sources() builds the catalogue on first run.
    SourceFetcher.fetch_and_parse() performs live HTTP fetches.
    _fetch_opportunities_from_source() merges signals onto baselines OR
    creates new FundingOpportunity records dynamically from scraped data
    when no pre-written baseline exists (dynamic creation path).

Path B — Aggregator discovery  (find programs we don't know about yet)
    OpportunityDiscoveryEngine.discover_new_sources() scrapes curated
    aggregator pages (F6S, VC4A, Startupblink, Africa The Big Deal, etc.),
    extracts programme URLs, creates FundingSource records for any URLs not
    already in the registry, immediately fetches them, and creates
    FundingOpportunity records when confidence >= DYNAMIC_CREATE_THRESHOLD.

Signal quality thresholds
--------------------------
  SIGNAL_ACCEPT_THRESHOLD     0.68   live signal overrides a baseline field
  LIVE_VERIFICATION_THRESHOLD 0.40   overall_confidence to mark "live verified"
  DYNAMIC_CREATE_THRESHOLD    0.55   min confidence to create a new opportunity
                                     from scraped signals alone (no baseline)
  FETCH_FAILED_THRESHOLD      0.01   complete fetch failure
  DEGRADATION_FACTOR          0.72   multiply baseline conf when fetch fails
"""
from __future__ import annotations

import datetime
import json
import logging
import re
import time
import urllib.parse
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from django.utils.text import slugify

from apps.matching.models_opportunity import (
    FundingOpportunity,
    FundingSource,
    OpportunityVersion,
    StartupOpportunityMatch,
)
from apps.matching.opportunity_fetcher import ParsedOpportunitySignals, SourceFetcher
from apps.users.models import StartupProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SIGNAL_ACCEPT_THRESHOLD     = 0.68
LIVE_VERIFICATION_THRESHOLD = 0.40
DYNAMIC_CREATE_THRESHOLD    = 0.55
FETCH_FAILED_THRESHOLD      = 0.01
DEGRADATION_FACTOR          = 0.72
MIN_DYNAMIC_DESC_LEN        = 100   # chars — filters boilerplate noise
DISCOVERY_PAGE_LIMIT        = 8     # aggregator pages per discovery run


class MatchWeights:
    STAGE              = Decimal("0.20")
    GEOGRAPHY          = Decimal("0.20")
    SECTOR             = Decimal("0.20")
    FUNDING            = Decimal("0.15")
    BUSINESS_MODEL     = Decimal("0.10")
    PRODUCT_MATURITY   = Decimal("0.10")
    EVIDENCE_READINESS = Decimal("0.05")

    @classmethod
    def total(cls) -> Decimal:
        return (
            cls.STAGE + cls.GEOGRAPHY + cls.SECTOR + cls.FUNDING
            + cls.BUSINESS_MODEL + cls.PRODUCT_MATURITY + cls.EVIDENCE_READINESS
        )


class StageFitMapping:
    MATRIX = {
        ("pre_seed", "pre_seed"): 98,
        ("pre_seed", "seed"):     88,
        ("pre_seed", "series_a"): 70,
        ("seed",     "seed"):     98,
        ("seed",     "pre_seed"): 82,
        ("seed",     "series_a"): 85,
        ("series_a", "series_a"): 98,
        ("series_a", "seed"):     80,
        ("series_a", "pre_seed"): 60,
    }
    DEFAULT_SCORE = 50


class CacheKeys:
    OPPORTUNITY_LIST     = "matching:opportunities:active"
    STARTUP_MATCHES      = "matching:startup:{startup_id}:matches"
    SOURCE_OPPORTUNITIES = "matching:source:{source_id}:opportunities"


# ---------------------------------------------------------------------------
# DTOs
# ---------------------------------------------------------------------------

@dataclass
class MatchResult:
    opportunity_id: str
    source_id: str
    organization: str
    source_name: str
    source_type: str
    title: str
    slug: str
    opportunity_type: str
    status: str
    funding_min_usd: str
    funding_max_usd: str
    equity_terms: Optional[str]
    deadline: Optional[str]
    days_remaining: Optional[int]
    is_rolling: bool
    source_confidence: float
    verified_freshness_hours_ago: int
    application_url: str
    overall_match_score: int
    is_saved_to_pipeline: bool
    dimensional_scores: Dict[str, int]
    evidence_gaps: List[str]
    positive_convictions: List[str]
    key_benefits: List[str]
    eligibility_criteria: List[str]
    evidence_requirements: List[str]
    description: str
    pipeline_stage: str          = field(default="interested")
    data_source_type: str        = field(default="live")
    last_fetched_from: str       = field(default="")
    extraction_confidence: float = field(default=0.0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "opportunity_id":               self.opportunity_id,
            "source_id":                    self.source_id,
            "organization":                 self.organization,
            "source_name":                  self.source_name,
            "source_type":                  self.source_type,
            "title":                        self.title,
            "slug":                         self.slug,
            "opportunity_type":             self.opportunity_type,
            "status":                       self.status,
            "funding_min_usd":              self.funding_min_usd,
            "funding_max_usd":              self.funding_max_usd,
            "equity_terms":                 self.equity_terms,
            "deadline":                     self.deadline,
            "days_remaining":               self.days_remaining,
            "is_rolling":                   self.is_rolling,
            "source_confidence":            self.source_confidence,
            "verified_freshness_hours_ago": self.verified_freshness_hours_ago,
            "application_url":              self.application_url,
            "overall_match_score":          self.overall_match_score,
            "is_saved_to_pipeline":         self.is_saved_to_pipeline,
            "pipeline_stage":               self.pipeline_stage,
            "dimensional_scores":           self.dimensional_scores,
            "evidence_gaps":                self.evidence_gaps,
            "positive_convictions":         self.positive_convictions,
            "key_benefits":                 self.key_benefits,
            "eligibility_criteria":         self.eligibility_criteria,
            "evidence_requirements":        self.evidence_requirements,
            "description":                  self.description,
            "data_source_type":             self.data_source_type,
            "last_fetched_from":            self.last_fetched_from,
            "extraction_confidence":        self.extraction_confidence,
        }


@dataclass
class IngestionResult:
    status: str
    sources_monitored: int
    opportunities_updated: int
    opportunities_created: int
    errors: List[Dict[str, str]] = field(default_factory=list)
    synced_at: str = field(default_factory=lambda: timezone.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status":                self.status,
            "sources_monitored":     self.sources_monitored,
            "opportunities_updated": self.opportunities_updated,
            "opportunities_created": self.opportunities_created,
            "errors":                self.errors,
            "synced_at":             self.synced_at,
        }


# ---------------------------------------------------------------------------
# Path B — Aggregator discovery engine
# ---------------------------------------------------------------------------

class OpportunityDiscoveryEngine:
    """
    Scrapes curated aggregator pages to find funding programmes that are NOT
    yet in the FundingSource registry.

    Aggregators scraped
    -------------------
    F6S, VC4A, Startupblink, Africa The Big Deal, ABAN, Orange Pages Africa,
    Startup Africa Magazine, Crunchbase Hub (Africa accelerators).

    For each new URL discovered:
      1. A FundingSource record is created.
      2. The source is immediately fetched and parsed.
      3. If signal confidence >= DYNAMIC_CREATE_THRESHOLD, a FundingOpportunity
         is created directly from scraped data — no pre-written baseline needed.
    """

    AGGREGATOR_PAGES: List[Dict[str, Any]] = [
        {"url": "https://www.f6s.com/programs/africa",           "trust": 0.82},
        {"url": "https://www.f6s.com/programs/apply",            "trust": 0.82},
        {"url": "https://vc4a.com/ventures/programs",            "trust": 0.80},
        {"url": "https://startupafricamagazine.com/category/funding", "trust": 0.70},
        {"url": "https://aban.africa/programs",                  "trust": 0.78},
        {"url": "https://www.startupblink.com/startup-programs", "trust": 0.72},
        {"url": "https://africathebigdeal.com",                  "trust": 0.75},
        {"url": "https://thebigdeal.substack.com",               "trust": 0.73},
    ]

    _PROGRAM_LINK_RE = re.compile(
        r'href=["\']([^"\'#?]+(?:accelerat|program|cohort|fund|grant|apply|invest)[^"\']*)["\']',
        re.I,
    )

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    @classmethod
    def discover_new_sources(cls, limit: int = DISCOVERY_PAGE_LIMIT) -> Dict[str, int]:
        """
        Scrape aggregator pages, find new programme URLs, create FundingSource
        records, fetch them, and create opportunities from strong signals.
        """
        discovered = created_sources = created_opportunities = skipped = 0

        existing_urls: set = set(
            list(FundingSource.objects.values_list("base_url", flat=True))
            + list(FundingSource.objects.values_list("application_url", flat=True))
        )
        existing_urls.discard(None)
        existing_urls.discard("")
        seen_urls = set(existing_urls)

        pages_scraped = 0
        for agg in cls.AGGREGATOR_PAGES:
            if pages_scraped >= limit:
                break
            try:
                html = cls._raw_fetch(agg["url"])
                if not html or len(html) < 300:
                    continue
                pages_scraped += 1

                for candidate in cls._extract_program_links(html, agg["url"]):
                    if candidate in seen_urls:
                        skipped += 1
                        continue
                    seen_urls.add(candidate)
                    discovered += 1
                    try:
                        src, src_created = cls._register_source(candidate, agg)
                        if src_created:
                            created_sources += 1
                        if cls._ingest_source_dynamically(src):
                            created_opportunities += 1
                    except Exception as exc:
                        logger.warning("[discovery] %s: %s", candidate, exc)

                time.sleep(0.5)
            except Exception as exc:
                logger.warning("[discovery] aggregator %s failed: %s", agg["url"], exc)

        logger.info(
            "[discovery] done — discovered=%d sources=%d opps=%d skipped=%d",
            discovered, created_sources, created_opportunities, skipped,
        )
        return {
            "discovered":            discovered,
            "created_sources":       created_sources,
            "created_opportunities": created_opportunities,
            "skipped":               skipped,
        }

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    @classmethod
    def _raw_fetch(cls, url: str, timeout: int = 15) -> str:
        """Minimal plain-text GET — decompresses gzip transparently."""
        import urllib.request
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36"
                ),
                "Accept":          "text/html,*/*;q=0.9",
                "Accept-Encoding": "identity",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read(2 * 1024 * 1024)
                enc = (resp.headers.get("Content-Encoding") or "").lower()
                if enc == "gzip" or raw[:2] == b"\x1f\x8b":
                    import gzip as _gz
                    try:
                        raw = _gz.decompress(raw)
                    except Exception:
                        pass
                return raw.decode("utf-8", errors="replace")
        except Exception as exc:
            logger.debug("[discovery] raw_fetch %s: %s", url, exc)
            return ""

    @classmethod
    def _extract_program_links(cls, html: str, base_url: str) -> List[str]:
        agg_domain = urllib.parse.urlparse(base_url).netloc
        seen: set = set()
        results: List[str] = []
        for m in cls._PROGRAM_LINK_RE.finditer(html):
            href  = m.group(1).strip()
            abs_u = urllib.parse.urljoin(base_url, href)
            p     = urllib.parse.urlparse(abs_u)
            if p.netloc == agg_domain or not p.scheme.startswith("http"):
                continue
            if any(abs_u.endswith(x) for x in (".pdf", ".png", ".jpg", ".zip")):
                continue
            norm = abs_u.split("?")[0].rstrip("/")
            if norm in seen:
                continue
            seen.add(norm)
            results.append(abs_u)
            if len(results) >= 30:
                break
        return results

    @classmethod
    def _register_source(cls, url: str, agg_meta: Dict[str, Any]) -> Tuple[FundingSource, bool]:
        domain = urllib.parse.urlparse(url).netloc.replace("www.", "").split(".")[0].title()
        return FundingSource.objects.get_or_create(
            base_url=url,
            defaults={
                "name":            f"{domain} Programme",
                "organization":    domain,
                "source_type":     FundingSource.SourceType.ACCELERATOR,
                "application_url": url,
                "crawl_frequency": FundingSource.CrawlFrequency.DAILY_24,
                "trust_level":     FundingSource.TrustLevel.REPUTABLE_DATABASE,
                "trust_score":     agg_meta.get("trust", 0.72),
                "active":          True,
            },
        )

    @classmethod
    def _ingest_source_dynamically(cls, source: FundingSource) -> bool:
        try:
            signals = SourceFetcher.fetch_and_parse(source)
        except Exception as exc:
            logger.warning("[discovery] fetch %s: %s", source.base_url, exc)
            return False
        if signals.overall_confidence < DYNAMIC_CREATE_THRESHOLD:
            return False
        opp_data = cls._build_opportunity_from_signals(signals, source)
        if not opp_data:
            return False
        try:
            _, created = OpportunityIngestionEngine._update_or_create_opportunity(source, opp_data)
            return created
        except Exception as exc:
            logger.warning("[discovery] save %s: %s", source.base_url, exc)
            return False

    @classmethod
    def _build_opportunity_from_signals(
        cls,
        signals: ParsedOpportunitySignals,
        source: FundingSource,
    ) -> Optional[Dict[str, Any]]:
        """Build a FundingOpportunity dict purely from scraped signals."""
        desc = str(signals.description.value) if signals.description else ""
        if len(desc) < MIN_DYNAMIC_DESC_LEN:
            return None

        year      = timezone.now().year
        slug_base = slugify(f"{signals.organization}-{year}")
        slug      = cls._unique_slug(slug_base)

        deadline  = None
        if signals.application_deadline and isinstance(
            signals.application_deadline.value, datetime.date
        ):
            deadline = signals.application_deadline.value

        is_rolling = bool(signals.status and signals.status.value == "ROLLING")

        status_map = {
            "OPEN":         FundingOpportunity.Status.OPEN,
            "CLOSING_SOON": FundingOpportunity.Status.CLOSING_SOON,
            "CLOSED":       FundingOpportunity.Status.CLOSED,
            "ROLLING":      FundingOpportunity.Status.ROLLING,
        }
        status = FundingOpportunity.Status.UPCOMING
        if signals.status:
            status = status_map.get(signals.status.value, status)

        def _dec(sig_attr: str) -> Decimal:
            sig = getattr(signals, sig_attr)
            if sig:
                try:
                    return Decimal(str(sig.value))
                except Exception:
                    pass
            return Decimal("0.00")

        audit = signals.to_audit_dict()
        audit["data_source_type"] = "dynamic_discovery"
        audit["discovered_from"]  = source.base_url

        return {
            "slug":                    slug,
            "title":                   f"{signals.organization} Programme {year}",
            "opportunity_type":        FundingOpportunity.OpportunityType.ACCELERATOR,
            "status":                  status,
            "target_stage":            "pre_seed",
            "target_geographies":      ["Global"],
            "target_sectors":          ["all"],
            "funding_amount_min_usd":  _dec("funding_min_usd"),
            "funding_amount_max_usd":  _dec("funding_max_usd"),
            "equity_percentage_taken": (
                str(signals.equity_terms.value) if signals.equity_terms
                else "Terms not specified"
            ),
            "application_open_date":   None,
            "application_deadline":    deadline,
            "cohort_start_date":       None,
            "is_rolling":              is_rolling,
            "source_confidence":       round(signals.overall_confidence, 4),
            "description":             desc[:2000],
            "key_benefits":            (
                signals.key_benefits.value[:8]
                if signals.key_benefits and isinstance(signals.key_benefits.value, list)
                else []
            ),
            "eligibility_criteria":    (
                signals.eligibility_criteria.value[:8]
                if signals.eligibility_criteria
                   and isinstance(signals.eligibility_criteria.value, list)
                else []
            ),
            "evidence_requirements":   [],
            "source_quote_evidence":   json.dumps(audit, default=str)[:4000],
            "_verified_freshness_now": True,
        }

    @classmethod
    def _unique_slug(cls, base: str) -> str:
        slug, n = base, 1
        while FundingOpportunity.objects.filter(slug=slug).exists():
            slug = f"{base}-{n}"
            n   += 1
        return slug
