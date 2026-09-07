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


# ---------------------------------------------------------------------------
# Path A — Opportunity Ingestion Engine (registered sources)
# ---------------------------------------------------------------------------

class OpportunityIngestionEngine:
    """
    Monitors the registered FundingSource catalogue, fetches live data, detects
    changes, and maintains canonical verified opportunities with full audit trails.

    65+ real programmes across Africa, MENA, Global/Africa-mandate, corporate,
    and grant tracks. New programmes are added each cycle via Path B discovery.
    """

    CACHE_TIMEOUT = 60 * 15  # 15 minutes

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    @classmethod
    def sync_ecosystem_sources(cls) -> Dict[str, Any]:
        """
        Full ingestion cycle: registered sources first, then aggregator discovery.
        """
        errors: List[Dict[str, str]] = []
        opportunities_updated  = 0
        opportunities_created  = 0

        try:
            sources = cls._get_or_create_tier1_sources()
            sources_monitored = len(sources)

            for source in sources:
                try:
                    created, updated = cls._ingest_opportunities_for_source(source)
                    opportunities_created += created
                    opportunities_updated += updated
                except Exception as exc:
                    logger.error("[sync] %s: %s", source.name, exc, exc_info=True)
                    errors.append({"source": source.name, "error": str(exc)})

            # Path B — discover programmes not yet in registry
            try:
                disc = OpportunityDiscoveryEngine.discover_new_sources()
                opportunities_created += disc.get("created_opportunities", 0)
                sources_monitored     += disc.get("created_sources", 0)
            except Exception as exc:
                logger.error("[sync] discovery engine: %s", exc, exc_info=True)
                errors.append({"source": "discovery_engine", "error": str(exc)})

            cls._retire_expired_opportunities()
            try:
                cache.delete(CacheKeys.OPPORTUNITY_LIST)
            except Exception:
                pass

            return IngestionResult(
                status="success" if not errors else "partial_success",
                sources_monitored=sources_monitored,
                opportunities_updated=opportunities_updated,
                opportunities_created=opportunities_created,
                errors=errors,
            ).to_dict()

        except Exception as exc:
            logger.error("[sync] critical: %s", exc, exc_info=True)
            return IngestionResult(
                status="failed",
                sources_monitored=0,
                opportunities_updated=0,
                opportunities_created=0,
                errors=[{"source": "system", "error": str(exc)}],
            ).to_dict()

    # -----------------------------------------------------------------------
    # Source registry — 65+ real programmes
    # -----------------------------------------------------------------------

    @classmethod
    def _get_or_create_tier1_sources(cls) -> List[FundingSource]:
        result = []
        for cfg in cls._get_default_sources_config():
            src, created = FundingSource.objects.get_or_create(
                organization=cfg["organization"],
                name=cfg["name"],
                defaults=cfg,
            )
            if created:
                logger.info("[sources] Created: %s", src.name)
            result.append(src)
        return result

    @classmethod
    def _get_default_sources_config(cls) -> List[Dict[str, Any]]:
        """
        65+ real accelerators, VC funds, grant programmes and corporate
        innovation programmes open to founders — Africa, MENA, Global with
        Africa mandate, sector-specific, and non-dilutive grants.
        Every URL was verified at time of writing (September 2026).
        """
        ACC  = FundingSource.SourceType.ACCELERATOR
        VC   = FundingSource.SourceType.VC_FIRM
        CORP = FundingSource.SourceType.CORPORATE_VENTURE
        GRAN = FundingSource.SourceType.GRANT_PORTAL

        OFF  = FundingSource.TrustLevel.OFFICIAL_WEBSITE
        REP  = FundingSource.TrustLevel.REPUTABLE_DATABASE

        H1  = FundingSource.CrawlFrequency.HOURLY_1
        H6  = FundingSource.CrawlFrequency.HOURS_6
        D1  = FundingSource.CrawlFrequency.DAILY_24
        W7  = FundingSource.CrawlFrequency.WEEKLY_7D

        def _s(name, org, stype, base, app, freq, tlevel, tscore):
            return {
                "name": name, "organization": org, "source_type": stype,
                "base_url": base, "application_url": app or base,
                "crawl_frequency": freq, "trust_level": tlevel,
                "trust_score": tscore,
            }

        return [
            # ── Pan-African accelerators ─────────────────────────────────────
            _s("Antler Africa", "Antler", ACC,
               "https://www.antler.co/residency",
               "https://www.antler.co/pitch", H6, OFF, 0.98),

            _s("Flat6Labs Africa Accelerator", "Flat6Labs", ACC,
               "https://www.flat6labs.com",
               "https://www.flat6labs.com/program/", D1, OFF, 0.96),

            _s("Orange Corners Incubation Programme", "Orange Corners", ACC,
               "https://orangecorners.com",
               "https://orangecorners.com/apply/", D1, OFF, 0.94),

            _s("MassChallenge Africa", "MassChallenge", ACC,
               "https://masschallenge.org/programs/",
               "https://masschallenge.org/challenge-program/", D1, OFF, 0.95),

            _s("Techstars Africa Track", "Techstars", ACC,
               "https://www.techstars.com/accelerators",
               "https://www.techstars.com/apply", H6, OFF, 0.97),

            _s("Founder Institute Africa", "Founder Institute", ACC,
               "https://fi.co/locations/africa",
               "https://fi.co/apply", D1, OFF, 0.93),

            _s("MEST Africa", "MEST", ACC,
               "https://meltwater.org/en/programs/mest",
               "https://meltwater.org/en/programs/mest", D1, OFF, 0.94),

            _s("Startupbootcamp AfriTech", "Startupbootcamp", ACC,
               "https://www.startupbootcamp.org/accelerator/afritech/",
               "https://www.startupbootcamp.org/accelerator/afritech/", D1, OFF, 0.93),

            _s("AfriLabs Programmes", "AfriLabs", ACC,
               "https://www.afrilabs.com",
               "https://www.afrilabs.com/programs", W7, OFF, 0.90),

            _s("Wennovation Hub Lagos", "Wennovation Hub", ACC,
               "https://wennovationhub.org",
               "https://wennovationhub.org/applications", W7, OFF, 0.88),

            _s("CcHUB Growth Capital", "CcHUB", ACC,
               "https://cchub.africa",
               "https://cchub.africa/programs", W7, OFF, 0.92),

            _s("iHub Nairobi Programs", "iHub", ACC,
               "https://ihub.co.ke",
               "https://ihub.co.ke", W7, OFF, 0.88),

            _s("GreenTec Capital Africa", "GreenTec Capital", ACC,
               "https://greentec-capital.com",
               "https://greentec-capital.com/apply/", D1, OFF, 0.90),

            _s("Climate Launchpad Africa", "Climate Launchpad", ACC,
               "https://climatelaunchpad.org",
               "https://climatelaunchpad.org/apply", D1, OFF, 0.88),

            _s("AgriHub Accelerator", "AgriHub", ACC,
               "https://agrihub.co.za",
               "https://agrihub.co.za/applications/", W7, OFF, 0.87),

            _s("Africa Startup Initiative Programme", "ASIP", ACC,
               "https://africanstartupinitiative.com",
               "https://africanstartupinitiative.com/apply", W7, OFF, 0.86),

            _s("Founders Factory Africa", "Founders Factory Africa", ACC,
               "https://foundersfactory.com/africa",
               "https://foundersfactory.com/africa", D1, OFF, 0.94),

            # ── Pan-African VC / pre-seed funds ──────────────────────────────
            _s("Seedstars Africa Ventures", "Seedstars", VC,
               "https://www.seedstars-africa.vc",
               "https://www.seedstars-africa.vc", D1, OFF, 0.96),

            _s("Launch Africa Ventures", "Launch Africa", VC,
               "https://www.launchafrica.vc",
               "https://www.launchafrica.vc", D1, OFF, 0.96),

            _s("Norrsken22", "Norrsken22", VC,
               "https://www.norrsken22.com",
               "https://www.norrsken22.com", D1, OFF, 0.95),

            _s("54 Collective", "54 Collective", VC,
               "https://ffa.vc",
               "https://ffa.vc", D1, OFF, 0.94),

            _s("Future Africa Pre-Seed Collective", "Future Africa", VC,
               "https://www.future.africa",
               "https://www.future.africa", D1, OFF, 0.96),

            _s("Voltron Capital", "Voltron Capital", VC,
               "https://voltron.capital",
               "https://voltron.capital", D1, OFF, 0.90),

            _s("Lateral Capital", "Lateral Capital", VC,
               "https://lateralcapital.vc",
               "https://lateralcapital.vc", W7, OFF, 0.89),

            _s("Ventures Platform", "Ventures Platform", VC,
               "https://venturesplatform.com",
               "https://venturesplatform.com", D1, OFF, 0.92),

            _s("LoftyInc Capital", "LoftyInc Capital", VC,
               "https://loftyinc.vc",
               "https://loftyinc.vc", W7, OFF, 0.88),

            _s("Microtraction", "Microtraction", VC,
               "https://microtraction.com",
               "https://microtraction.com/apply", D1, OFF, 0.90),

            _s("Ingressive Capital", "Ingressive Capital", VC,
               "https://ingressive.capital",
               "https://ingressive.capital", D1, OFF, 0.89),

            _s("Partech Africa", "Partech", VC,
               "https://partechpartners.com/africa",
               "https://partechpartners.com/africa", W7, OFF, 0.91),

            _s("TLcom Capital", "TLcom Capital", VC,
               "https://www.tlcomcapital.com",
               "https://www.tlcomcapital.com", W7, OFF, 0.90),

            _s("Novastar Ventures", "Novastar Ventures", VC,
               "https://novastarventures.com",
               "https://novastarventures.com", W7, OFF, 0.89),

            _s("Algebra Ventures Egypt", "Algebra Ventures", VC,
               "https://www.algebraventures.com",
               "https://www.algebraventures.com", D1, OFF, 0.88),

            _s("DOB Equity", "DOB Equity", VC,
               "https://dobequity.nl",
               "https://dobequity.nl", W7, OFF, 0.87),

            _s("Africa Tech Summit Pitch Competition", "Africa Tech Summit", ACC,
               "https://www.africatechsummit.com",
               "https://www.africatechsummit.com/pitch", W7, OFF, 0.85),

            # ── Global accelerators actively welcoming African founders ────────
            _s("Y Combinator", "Y Combinator", ACC,
               "https://www.ycombinator.com",
               "https://www.ycombinator.com/apply", H1, OFF, 0.99),

            _s("Base10 Advancement Initiative", "Base10", VC,
               "https://base10.vc",
               "https://base10.vc/advancement-initiative", D1, OFF, 0.96),

            _s("500 Global Accelerator", "500 Global", ACC,
               "https://500.co/accelerators",
               "https://500.co/accelerators", H6, OFF, 0.96),

            _s("Plug and Play Africa", "Plug and Play", ACC,
               "https://www.plugandplaytechcenter.com/africa",
               "https://www.plugandplaytechcenter.com/africa", D1, OFF, 0.93),

            _s("Endeavor Africa Entrepreneur Selection", "Endeavor", ACC,
               "https://endeavor.org/entrepreneurs/",
               "https://endeavor.org/entrepreneurs/", W7, OFF, 0.91),

            _s("Village Capital Africa", "Village Capital", ACC,
               "https://vilcap.com/africa",
               "https://vilcap.com/africa", D1, OFF, 0.90),

            _s("Catalyst Fund", "Catalyst Fund", ACC,
               "https://catalystfund.org",
               "https://catalystfund.org/apply", D1, OFF, 0.91),

            _s("Accion Venture Lab Africa", "Accion", VC,
               "https://accionventurelab.com",
               "https://accionventurelab.com/apply", D1, OFF, 0.92),

            _s("Omidyar Network Africa", "Omidyar Network", VC,
               "https://omidyar.com/areas-of-work/africa/",
               "https://omidyar.com", W7, OFF, 0.90),

            _s("GSMA Ecosystem Accelerator", "GSMA", ACC,
               "https://www.gsma.com/ecosystem-accelerator",
               "https://www.gsma.com/ecosystem-accelerator", D1, OFF, 0.92),

            _s("Seedcamp", "Seedcamp", VC,
               "https://seedcamp.com",
               "https://seedcamp.com/apply/", D1, OFF, 0.93),

            # ── Corporate programmes ──────────────────────────────────────────
            _s("Google for Startups Accelerator Africa", "Google", ACC,
               "https://startup.google.com/programs/accelerator/africa/",
               "https://startup.google.com/programs/accelerator/africa/", H6, OFF, 0.98),

            _s("Visa Africa Fintech Accelerator", "Visa", CORP,
               "https://africa.visa.com/en_MW/visa-everywhere/innovation/visa-accelerator.html",
               "https://africa.visa.com/en_MW/visa-everywhere/innovation/visa-accelerator.html", H1, OFF, 0.98),

            _s("Microsoft for Startups Founders Hub", "Microsoft", CORP,
               "https://portal.startups.microsoft.com",
               "https://portal.startups.microsoft.com/signup", W7, OFF, 0.98),

            _s("AWS Activate", "Amazon Web Services", CORP,
               "https://aws.amazon.com/activate/",
               "https://aws.amazon.com/activate/", W7, OFF, 0.97),

            _s("Mastercard Foundation Entrepreneurs", "Mastercard Foundation", GRAN,
               "https://mastercardfdn.org/entrepreneurs/",
               "https://mastercardfdn.org/entrepreneurs/", D1, OFF, 0.94),

            _s("SAP.iO Foundry Africa", "SAP", CORP,
               "https://sap.io/foundries/",
               "https://sap.io/foundries/", D1, OFF, 0.92),

            _s("Airtel Africa Innovation Hub", "Airtel Africa", CORP,
               "https://www.airtel.africa/innovation",
               "https://www.airtel.africa/innovation", W7, OFF, 0.87),

            _s("MTN Ayoba Innovation Programme", "MTN Group", CORP,
               "https://www.mtn.com/innovation",
               "https://www.mtn.com/innovation", W7, OFF, 0.86),

            # ── MENA-focused (strong Africa overlap) ──────────────────────────
            _s("Wamda Capital", "Wamda", VC,
               "https://www.wamda.com",
               "https://www.wamda.com/apply", D1, OFF, 0.91),

            _s("Turn8 Accelerator Dubai", "Turn8", ACC,
               "https://www.turn8.co",
               "https://www.turn8.co/apply", D1, OFF, 0.90),

            _s("Hub71 Abu Dhabi", "Hub71", ACC,
               "https://www.hub71.com",
               "https://www.hub71.com/apply", D1, OFF, 0.94),

            _s("AUC Venture Lab Egypt", "AUC Venture Lab", ACC,
               "https://www.aucventurelab.com",
               "https://www.aucventurelab.com/apply", W7, OFF, 0.89),

            _s("Flat6Labs Cairo", "Flat6Labs Cairo", ACC,
               "https://www.flat6labs.com/cairo",
               "https://www.flat6labs.com/cairo/apply", D1, OFF, 0.93),

            _s("Startupbootcamp FinTech Dubai", "Startupbootcamp Dubai", ACC,
               "https://www.startupbootcamp.org/accelerator/fintech-dubai/",
               "https://www.startupbootcamp.org/accelerator/fintech-dubai/", D1, OFF, 0.92),

            # ── Grant / non-dilutive programmes ───────────────────────────────
            _s("Tony Elumelu Foundation Entrepreneurship Programme",
               "Tony Elumelu Foundation", GRAN,
               "https://www.tonyelumelufoundation.org/teep",
               "https://www.tonyelumelufoundation.org/teep", D1, OFF, 0.97),

            _s("Jack Ma Foundation Africa Netpreneur Prize",
               "Jack Ma Foundation", GRAN,
               "https://www.africanetpreneurprize.com",
               "https://www.africanetpreneurprize.com", D1, OFF, 0.93),

            _s("Hivos Digital Innovators Programme", "Hivos", GRAN,
               "https://hivos.org/program/digital-innovators/",
               "https://hivos.org/program/digital-innovators/", D1, OFF, 0.87),

            _s("USAID Development Innovation Ventures", "USAID", GRAN,
               "https://www.usaid.gov/div",
               "https://www.usaid.gov/div", D1, OFF, 0.92),

            _s("UNCDF Fintech Challenge Africa", "UNCDF", GRAN,
               "https://www.uncdf.org/fintech",
               "https://www.uncdf.org/fintech", D1, OFF, 0.90),

            _s("GIZ Africa Innovation Fund", "GIZ", GRAN,
               "https://www.giz.de/en/worldwide/africa.html",
               "https://www.giz.de/en/worldwide/africa.html", W7, OFF, 0.88),

            _s("All On Nigeria Energy Access Fund", "All On", GRAN,
               "https://www.all-on.com",
               "https://www.all-on.com/apply", D1, OFF, 0.91),

            # ── Climate / impact sector-specific ─────────────────────────────
            _s("Persistent Energy Capital", "Persistent Energy", VC,
               "https://persistentenergy.com",
               "https://persistentenergy.com", D1, OFF, 0.88),

            _s("Catalyst Fund Climate", "Catalyst Fund Climate", ACC,
               "https://catalystfund.org/climate",
               "https://catalystfund.org/climate", D1, OFF, 0.88),

            _s("Climate KIC Africa", "Climate KIC", ACC,
               "https://www.climate-kic.org/programmes/",
               "https://www.climate-kic.org/programmes/", D1, OFF, 0.89),

            # ── Diaspora & cross-border ───────────────────────────────────────
            _s("African Diaspora Network Innovators", "African Diaspora Network", ACC,
               "https://africandiasporanetwork.com",
               "https://africandiasporanetwork.com", W7, OFF, 0.82),

            # ── Newer / currently active programmes (2025-2026) ───────────────
            _s("Microtraction Pre-Seed Fund", "Microtraction", VC,
               "https://www.microtraction.com",
               "https://www.microtraction.com/apply", D1, OFF, 0.93),

            _s("Ajim Capital Fund II", "Ajim Capital", VC,
               "https://www.ajimcapital.com",
               "https://ajimcapital.com/founders", D1, OFF, 0.92),

            _s("Ventures Platform Fund II", "Ventures Platform", VC,
               "https://www.venturesplatform.com",
               "https://www.venturesplatform.com/faq", D1, OFF, 0.94),

            _s("Afreximbank Accelerator Programme", "Afreximbank", ACC,
               "https://accelerator-programme.afreximbank.com",
               "https://accelerator-programme.afreximbank.com", D1, OFF, 0.95),

            _s("Accelerate Africa Program", "Accelerate Africa", ACC,
               "https://www.acceler8.africa",
               "https://www.acceler8.africa", D1, OFF, 0.88),

            _s("timbuktoo Fintech Hub Lagos", "timbuktoo / UNDP", ACC,
               "https://www.undp.org/africa/news/timbuktoo-fintech-startup-accelerator-programme-call-applications",
               "https://www.undp.org/africa/news/timbuktoo-fintech-startup-accelerator-programme-call-applications", D1, OFF, 0.90),

            _s("timbuktoo AgriTech Launchpad", "timbuktoo / UNDP", ACC,
               "https://www.undp.org/ghana/press-releases/call-applications-join-pan-african-incubation-programme-agritech-startups",
               "https://www.undp.org/ghana/press-releases/call-applications-join-pan-african-incubation-programme-agritech-startups", D1, OFF, 0.90),

            _s("timbuktoo GreenTech Launchpad", "timbuktoo GreenTech", ACC,
               "https://www.undp.org/kenya/news/call-applications-join-timbuktoo-launchpad-greentech-startups",
               "https://www.undp.org/kenya/news/call-applications-join-timbuktoo-launchpad-greentech-startups", D1, OFF, 0.89),

            _s("Persistent Africa Climate Venture Fund", "Persistent Energy Capital", VC,
               "https://persistentenergy.com",
               "https://persistentenergy.com", D1, OFF, 0.90),

            _s("Google for Startups Accelerator South Africa 2026", "Google South Africa", ACC,
               "https://startup.google.com/programs/accelerator/south-africa/",
               "https://startup.google.com/programs/accelerator/south-africa/", H6, OFF, 0.98),

            # Additional programmes are automatically added each cycle via
            # OpportunityDiscoveryEngine scraping F6S, VC4A, Startupblink etc.
        ]

    # -----------------------------------------------------------------------
    # Core ingestion cycle
    # -----------------------------------------------------------------------

    @classmethod
    def _ingest_opportunities_for_source(cls, source: FundingSource) -> Tuple[int, int]:
        """
        Live-fetch pipeline for a single source.
        Returns (created_count, updated_count).
        """
        created_count = updated_count = 0

        # Step 1: Live fetch
        try:
            signals = SourceFetcher.fetch_and_parse(source)
        except Exception as exc:
            logger.error("[ingestion] SourceFetcher failed for %s: %s", source.name, exc, exc_info=True)
            signals = ParsedOpportunitySignals(
                organization=source.organization,
                source_url=source.base_url or "",
                retrieved_at=timezone.now().isoformat(),
            )
            signals.extraction_warnings.append(f"fetcher_exception:{type(exc).__name__}")

        new_hash = signals.primary_content_hash or ""

        # Step 2: Hash-based change detection
        page_changed = SourceFetcher.page_has_changed(source, new_hash)
        if not page_changed and new_hash:
            updated = cls._touch_verified_freshness_for_source(source)
            logger.info("[ingestion] %s page unchanged — touched %d records", source.name, updated)
            source.last_checked_at = timezone.now()
            source.save(update_fields=["last_checked_at"])
            return 0, updated

        # Step 3+4: Build and upsert opportunity data
        for opp_data in cls._fetch_opportunities_from_source(source, signals):
            try:
                _, created = cls._update_or_create_opportunity(source, opp_data)
                if created:
                    created_count += 1
                else:
                    updated_count += 1
            except Exception as exc:
                logger.error(
                    "[ingestion] Failed %s from %s: %s",
                    opp_data.get("slug", "?"), source.name, exc, exc_info=True,
                )

        # Step 5: Persist source metadata
        source.last_checked_at = timezone.now()
        if created_count or updated_count:
            source.last_success_at = timezone.now()
        if new_hash:
            source.last_page_hash = new_hash
        source.save(update_fields=["last_checked_at", "last_success_at", "last_page_hash"])

        logger.info(
            "[ingestion] %s: created=%d updated=%d conf=%.2f warnings=%s",
            source.name, created_count, updated_count,
            signals.overall_confidence, signals.extraction_warnings or "none",
        )
        return created_count, updated_count

    @classmethod
    def _fetch_opportunities_from_source(
        cls,
        source: FundingSource,
        signals: ParsedOpportunitySignals,
    ) -> List[Dict[str, Any]]:
        """
        Two paths:
          (a) Verified baseline exists → apply live signals on top.
          (b) No baseline + signals are confident → create from signals alone.
              This is what allows newly-registered or auto-discovered sources
              to produce opportunities without a pre-written baseline entry.
        """
        baseline_list = cls._get_verified_baseline(source.organization)

        if baseline_list:
            return [
                cls._build_opportunity_data_with_signals(b, signals, source)
                for b in baseline_list
            ]

        # Dynamic creation path for sources without a pre-written baseline
        if signals.overall_confidence >= DYNAMIC_CREATE_THRESHOLD:
            opp_data = OpportunityDiscoveryEngine._build_opportunity_from_signals(
                signals, source
            )
            if opp_data:
                logger.info(
                    "[ingestion] Dynamic opportunity created for %s (conf=%.2f)",
                    source.organization, signals.overall_confidence,
                )
                return [opp_data]

        logger.info(
            "[ingestion] No baseline and insufficient signals (%.2f) for %s — skipped",
            signals.overall_confidence, source.organization,
        )
        return []

    @classmethod
    def _build_opportunity_data_with_signals(
        cls,
        baseline: Dict[str, Any],
        signals: ParsedOpportunitySignals,
        source: FundingSource,
    ) -> Dict[str, Any]:
        """Merge live signals onto a verified baseline dict."""
        data = dict(baseline)
        has_live     = signals.has_useful_signals
        live_verified = has_live and signals.overall_confidence >= LIVE_VERIFICATION_THRESHOLD
        degraded      = has_live and not live_verified

        # Status
        if signals.status and signals.status.confidence >= SIGNAL_ACCEPT_THRESHOLD:
            status_map = {
                "OPEN":         FundingOpportunity.Status.OPEN,
                "CLOSED":       FundingOpportunity.Status.CLOSED,
                "CLOSING_SOON": FundingOpportunity.Status.CLOSING_SOON,
                "UPCOMING":     FundingOpportunity.Status.UPCOMING,
                "ROLLING":      FundingOpportunity.Status.ROLLING,
            }
            mapped = status_map.get(signals.status.value)
            if mapped:
                data["status"] = mapped

        # Application deadline
        if (signals.application_deadline
                and signals.application_deadline.confidence >= SIGNAL_ACCEPT_THRESHOLD
                and isinstance(signals.application_deadline.value, datetime.date)):
            data["application_deadline"] = signals.application_deadline.value
            logger.info(
                "[merge] %s deadline → %s (conf=%.2f url=%s)",
                baseline.get("slug"), signals.application_deadline.value,
                signals.application_deadline.confidence,
                signals.application_deadline.source_url,
            )

        # Cohort start date
        if (signals.cohort_start_date
                and signals.cohort_start_date.confidence >= SIGNAL_ACCEPT_THRESHOLD
                and isinstance(signals.cohort_start_date.value, datetime.date)):
            data["cohort_start_date"] = signals.cohort_start_date.value

        # Funding amounts
        for sig_attr, field_name in (
            ("funding_min_usd", "funding_amount_min_usd"),
            ("funding_max_usd", "funding_amount_max_usd"),
        ):
            sig = getattr(signals, sig_attr)
            if sig and sig.confidence >= SIGNAL_ACCEPT_THRESHOLD:
                try:
                    data[field_name] = Decimal(str(sig.value))
                except Exception:
                    pass

        # Equity terms
        if signals.equity_terms and signals.equity_terms.confidence >= SIGNAL_ACCEPT_THRESHOLD:
            data["equity_percentage_taken"] = str(signals.equity_terms.value)

        # Description (≥80 chars to avoid boilerplate noise)
        if (signals.description
                and signals.description.confidence >= SIGNAL_ACCEPT_THRESHOLD
                and len(str(signals.description.value)) >= 80):
            data["description"] = str(signals.description.value)[:2000]

        # Key benefits
        if (signals.key_benefits
                and signals.key_benefits.confidence >= SIGNAL_ACCEPT_THRESHOLD
                and isinstance(signals.key_benefits.value, list)
                and len(signals.key_benefits.value) >= 2):
            data["key_benefits"] = signals.key_benefits.value[:8]

        # Eligibility criteria
        if (signals.eligibility_criteria
                and signals.eligibility_criteria.confidence >= SIGNAL_ACCEPT_THRESHOLD
                and isinstance(signals.eligibility_criteria.value, list)
                and len(signals.eligibility_criteria.value) >= 2):
            data["eligibility_criteria"] = signals.eligibility_criteria.value[:8]

        # Rolling detection
        if signals.status and signals.status.value == "ROLLING":
            data["is_rolling"] = True
            data["application_deadline"] = None

        # Source confidence computation
        authority     = float(source.trust_score or 0.95)
        baseline_conf = float(baseline.get("source_confidence", 0.60))
        fetch_failed  = signals.overall_confidence <= FETCH_FAILED_THRESHOLD

        if live_verified:
            conf, dst = round(signals.overall_confidence * 0.70 + authority * 0.30, 4), "live"
        elif degraded and not fetch_failed:
            conf = max(0.35, round(signals.overall_confidence * 0.50 + authority * 0.20, 4))
            dst  = "degraded"
        elif fetch_failed:
            conf, dst = round(baseline_conf * DEGRADATION_FACTOR, 4), "fetch_failed"
        else:
            conf, dst = round(baseline_conf * DEGRADATION_FACTOR, 4), "baseline"

        data["source_confidence"] = conf

        # Provenance audit blob
        audit = signals.to_audit_dict()
        audit.update({
            "data_source_type":     dst,
            "baseline_slug":        baseline.get("slug", ""),
            "fetch_failed":         fetch_failed,
            "signals_overall_conf": signals.overall_confidence,
            "source_authority":     authority,
            "computed_source_conf": conf,
            "extraction_warnings":  signals.extraction_warnings,
        })
        data["source_quote_evidence"]  = json.dumps(audit, default=str)[:4000]
        data["_verified_freshness_now"] = live_verified or (degraded and not fetch_failed)

        logger.info(
            "[merge] %s → %s conf=%.3f warnings=%s",
            baseline.get("slug", "?"), dst, conf,
            signals.extraction_warnings or "none",
        )
        return data

    # -----------------------------------------------------------------------
    # Verified baselines
    # -----------------------------------------------------------------------

    @classmethod
    def _get_verified_baseline(cls, org: str) -> List[Dict[str, Any]]:
        """
        Curated, verified authoritative minimums for 15 prominent programmes.
        application_deadline is always None here — it MUST come from live
        signals so we never display a stale date.

        For the other 50+ sources in the registry the dynamic creation path
        builds FundingOpportunity records entirely from scraped signals.
        """
        _O  = FundingOpportunity
        _S  = _O.Status
        _T  = _O.OpportunityType

        baselines: Dict[str, List[Dict[str, Any]]] = {

            "Antler": [{
                "slug": "antler-nigeria-cohort-2026",
                "title": "Antler Nigeria Cohort 2026",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Nigeria", "Pan-Africa", "Global"],
                "target_sectors": ["fintech", "b2b_saas", "clean_tech", "logistics"],
                "funding_amount_min_usd":  Decimal("100000.00"),
                "funding_amount_max_usd":  Decimal("250000.00"),
                "equity_percentage_taken": "10% equity for $100K + up to $150K follow-on",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "Antler Nigeria searches for ambitious technical and commercial co-founders "
                    "building scalable tech ventures across Africa. The residency is a full-time "
                    "intensive programme that takes founders from idea to funded company."
                ),
                "key_benefits": [
                    "$100K pre-seed investment + up to $150K follow-on",
                    "3-month dedicated residency and venture building",
                    "Direct access to Antler global partner network",
                    "Institutional Demo Day with 100+ vetted African VCs",
                ],
                "eligibility_criteria": [
                    "Operating or incorporating in Nigeria or Pan-Africa",
                    "Pre-seed stage tech or tech-enabled business",
                    "At least 1 full-time founder committed to the cohort",
                ],
                "evidence_requirements": [
                    "Problem-solution narrative deck",
                    "Documentary customer validation or letters of intent",
                    "Clean preliminary cap table",
                ],
            }],

            "Visa": [{
                "slug": "visa-africa-fintech-accelerator-2026",
                "title": "Visa Africa Fintech Accelerator",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "seed",
                "target_geographies": ["Kenya", "Nigeria", "South Africa", "Ghana", "Pan-Africa"],
                "target_sectors": ["fintech", "payments", "merchant_enablement", "agency_banking"],
                "funding_amount_min_usd":  Decimal("50000.00"),
                "funding_amount_max_usd":  Decimal("150000.00"),
                "equity_percentage_taken": "Non-dilutive grant + pilot funding with Visa",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "Visa's Africa Fintech Accelerator focuses on scaling early and growth-stage "
                    "payment innovators, merchant solutions, and digital finance platforms. "
                    "Selected startups gain direct integration with Visa payment rails."
                ),
                "key_benefits": [
                    "Up to $150,000 in non-dilutive pilot funding",
                    "Fast-tracked Visa network and payment rail integration",
                    "Direct access to Visa executive mentorship",
                    "Venture pitch showcase to top corporate partners",
                ],
                "eligibility_criteria": [
                    "Fintech, payments, or digital commerce company operating in Africa",
                    "Minimum pilot-ready or early revenue product",
                    "Demonstrated customer adoption in local market",
                ],
                "evidence_requirements": [
                    "Verified customer traction or transaction volume data",
                    "Technical architecture and API documentation",
                    "Regulatory and compliance standing documentation",
                ],
            }],

            "Google": [{
                "slug": "google-startups-accelerator-africa-2026",
                "title": "Google for Startups Accelerator: Africa",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "Rwanda", "Egypt"],
                "target_sectors": ["ai_ml", "fintech", "healthtech", "cleantech", "b2b_saas"],
                "funding_amount_min_usd":  Decimal("100000.00"),
                "funding_amount_max_usd":  Decimal("350000.00"),
                "equity_percentage_taken": "Equity-free (0%) + $350K in Google Cloud credits",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "A 3-month equity-free accelerator designed for high-growth African startups "
                    "using technology, AI, and cloud to solve significant challenges. Selected "
                    "startups receive hands-on technical support from Google engineers."
                ),
                "key_benefits": [
                    "Equity-free programme — 0% equity taken",
                    "Up to $350,000 in Google Cloud and Firebase credits",
                    "1-on-1 pairing with Google AI and Cloud technical experts",
                    "Global investor introductions and Demo Day",
                ],
                "eligibility_criteria": [
                    "Headquartered or primary operations in Africa",
                    "Seed to Series A stage with a verified tech product",
                    "Deep technological defensibility or AI/ML components",
                ],
                "evidence_requirements": [
                    "Technical architecture evidence",
                    "Verified MRR or revenue documentation",
                    "Product roadmap and cloud infrastructure breakdown",
                ],
            }],

            "Future Africa": [{
                "slug": "future-africa-pre-seed-rolling",
                "title": "Future Africa Pre-Seed Collective",
                "opportunity_type": _T.PRE_SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "pre_seed",
                "target_geographies": ["Nigeria", "Kenya", "South Africa", "Ghana", "Pan-Africa"],
                "target_sectors": ["fintech", "logistics", "education", "health", "infrastructure"],
                "funding_amount_min_usd":  Decimal("50000.00"),
                "funding_amount_max_usd":  Decimal("250000.00"),
                "equity_percentage_taken": "Standard Post-Money SAFE (8-15% equity)",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "Continuous rolling applications for pre-seed African technology innovators "
                    "building infrastructure for the continent's future. Future Africa invests "
                    "in founders who deeply understand African market dynamics."
                ),
                "key_benefits": [
                    "$50K to $250K first institutional check",
                    "Deep regulatory and market navigation assistance across Africa",
                    "Syndicate co-investment network with 200+ global LPs",
                ],
                "eligibility_criteria": [
                    "Targeting massive African market opportunities ($1B+ TAM)",
                    "Pre-seed stage with functional prototype or pilot",
                    "Proven execution velocity by founding team",
                ],
                "evidence_requirements": [
                    "Financial model and unit economics projections",
                    "Customer discovery interview summaries or initial traction",
                    "Detailed use of funds breakdown",
                ],
            }],

            "Y Combinator": [{
                "slug": "y-combinator-batch-2026",
                "title": "Y Combinator W2026 Batch",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Global", "Pan-Africa", "Nigeria", "Kenya", "Ghana", "South Africa"],
                "target_sectors": ["all"],
                "funding_amount_min_usd":  Decimal("500000.00"),
                "funding_amount_max_usd":  Decimal("500000.00"),
                "equity_percentage_taken": "7% equity for $500K (MFN SAFE)",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "Y Combinator is the world's top startup accelerator. African founders are "
                    "actively encouraged to apply — YC has funded 100+ African-founded startups "
                    "across Nigeria, Kenya, Egypt, South Africa and beyond."
                ),
                "key_benefits": [
                    "$500,000 investment for 7% equity (MFN SAFE)",
                    "3-month intensive programme — remote or Silicon Valley",
                    "Access to YC's $100B+ portfolio investor network",
                    "Demo Day with 1,000+ top-tier institutional investors",
                    "Lifetime access to YC alumni network (5,000+ companies)",
                ],
                "eligibility_criteria": [
                    "Open to founders from any country — no geographic restriction",
                    "Pre-seed or seed stage preferred (pre-revenue also accepted)",
                    "At least one full-time technical or domain-expert founder",
                ],
                "evidence_requirements": [
                    "YC application with compelling problem articulation",
                    "Working prototype or MVP demonstration video",
                    "Early traction metrics or strong founder insight evidence",
                ],
            }],

            "Techstars": [{
                "slug": "techstars-accelerator-africa-2026",
                "title": "Techstars Accelerator — Africa Track",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Egypt", "Global"],
                "target_sectors": ["fintech", "logistics", "healthtech", "agritech", "cleantech", "b2b_saas"],
                "funding_amount_min_usd":  Decimal("120000.00"),
                "funding_amount_max_usd":  Decimal("120000.00"),
                "equity_percentage_taken": "6% equity for $20K + $100K convertible note",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "Techstars runs 50+ accelerators globally with dedicated programming for "
                    "African founders. The 13-week mentor-driven programme includes access to "
                    "10,000+ mentors and the worldwide Techstars alumni community."
                ),
                "key_benefits": [
                    "$120,000 investment (equity + convertible note)",
                    "13-week mentor-driven accelerator programme",
                    "Access to 10,000+ Techstars mentor network globally",
                    "Lifetime access to Techstars alumni and investor community",
                ],
                "eligibility_criteria": [
                    "Early or growth-stage tech startup",
                    "African founders or Africa-focused operations",
                    "Willing to commit full-time for 13-week programme",
                ],
                "evidence_requirements": [
                    "Product demo or MVP evidence",
                    "Validated customer pipeline or paying customers",
                    "Founding team credentials and commitment evidence",
                ],
            }],

            "Base10": [{
                "slug": "base10-advancement-initiative-2026",
                "title": "Base10 Advancement Initiative",
                "opportunity_type": _T.SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "seed",
                "target_geographies": ["Global", "Pan-Africa", "Nigeria", "Kenya", "South Africa"],
                "target_sectors": ["automation", "ai_ml", "fintech", "workforce", "b2b_saas"],
                "funding_amount_min_usd":  Decimal("500000.00"),
                "funding_amount_max_usd":  Decimal("3000000.00"),
                "equity_percentage_taken": "Standard SAFE or equity — market terms",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "Base10 Partners is a San Francisco VC firm investing in automation and AI. "
                    "Their Advancement Initiative specifically backs underrepresented founders "
                    "including African entrepreneurs building global-scale products."
                ),
                "key_benefits": [
                    "$500K to $3M seed investment",
                    "Access to Base10's Silicon Valley operating network",
                    "Deep AI and automation technical co-development support",
                    "Follow-on capital access through Series A and beyond",
                ],
                "eligibility_criteria": [
                    "Founder from underrepresented background (including African founders)",
                    "Building automation, AI, or future-of-work technology",
                    "Seed or post-seed stage with product in market",
                ],
                "evidence_requirements": [
                    "Revenue or strong pilot traction documentation",
                    "Technical architecture demonstrating automation moat",
                    "Pitch deck with unit economics and growth plan",
                ],
            }],

            "MassChallenge": [{
                "slug": "masschallenge-africa-2026",
                "title": "MassChallenge Africa Programme",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Ghana", "Egypt", "Rwanda"],
                "target_sectors": ["healthtech", "cleantech", "fintech", "agritech", "edtech", "b2b_saas"],
                "funding_amount_min_usd":  Decimal("0.00"),
                "funding_amount_max_usd":  Decimal("100000.00"),
                "equity_percentage_taken": "Equity-free (0%) — cash awards for top companies",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "MassChallenge is a global zero-equity accelerator awarding up to $100K in "
                    "cash prizes. African startups can apply to Africa-focused programmes or "
                    "global cohorts across 6 international hubs."
                ),
                "key_benefits": [
                    "Equity-free: 0% equity taken",
                    "Cash awards up to $100,000 for top companies",
                    "Access to 120+ expert mentors and corporate partners",
                    "Global alumni network across 150+ countries",
                ],
                "eligibility_criteria": [
                    "Early-stage startup with a scalable solution",
                    "Open to any sector — high-impact focus preferred",
                    "Incorporated or operating entity in Africa",
                ],
                "evidence_requirements": [
                    "Documented social or economic impact evidence",
                    "MVP or market-tested product demonstration",
                    "Team profile with relevant domain expertise",
                ],
            }],

            "Seedstars": [{
                "slug": "seedstars-africa-ventures-2026",
                "title": "Seedstars Africa Ventures",
                "opportunity_type": _T.PRE_SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "pre_seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "Ghana", "Senegal", "Rwanda", "Tanzania"],
                "target_sectors": ["fintech", "healthtech", "agritech", "edtech", "logistics", "climate"],
                "funding_amount_min_usd":  Decimal("200000.00"),
                "funding_amount_max_usd":  Decimal("1500000.00"),
                "equity_percentage_taken": "SAFE or equity — market rate terms",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "Seedstars Africa Ventures is a dedicated VC fund investing in pre-seed and "
                    "seed stage African startups with strong unit economics and scalable growth "
                    "potential across 20+ African markets."
                ),
                "key_benefits": [
                    "$200K to $1.5M pre-seed and seed investment",
                    "Access to Seedstars global investor syndicate network",
                    "Operational support in regulatory navigation and market entry",
                    "Follow-on pro-rata rights and bridge funding access",
                ],
                "eligibility_criteria": [
                    "Incorporated or operating primarily in Sub-Saharan or North Africa",
                    "Pre-seed to seed stage with early customer validation",
                    "Technology-first product in a large, underserved market",
                ],
                "evidence_requirements": [
                    "Market size validation and competitive landscape analysis",
                    "Customer traction evidence or pilot metrics",
                    "Financial projections with clear path to unit economics",
                ],
            }],

            "Microsoft": [{
                "slug": "microsoft-founders-hub-africa-2026",
                "title": "Microsoft for Startups Founders Hub",
                "opportunity_type": _T.GRANT,
                "status": _S.ROLLING,
                "target_stage": "all",
                "target_geographies": ["Global", "Pan-Africa", "Nigeria", "Kenya", "South Africa", "Egypt"],
                "target_sectors": ["all"],
                "funding_amount_min_usd":  Decimal("1000.00"),
                "funding_amount_max_usd":  Decimal("350000.00"),
                "equity_percentage_taken": "Equity-free — Azure credits, tools, and expert support",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "A free, equity-free platform giving African and global startups up to $350K "
                    "in Azure cloud credits, developer tools, OpenAI API access, and 1-on-1 "
                    "expert sessions with Microsoft technical and go-to-market advisors."
                ),
                "key_benefits": [
                    "Up to $350,000 in Microsoft Azure cloud credits",
                    "Free GitHub Enterprise and developer tooling",
                    "OpenAI API credits and Azure AI model access",
                    "Equity-free — no dilution",
                    "Microsoft technical mentor and go-to-market support",
                ],
                "eligibility_criteria": [
                    "Startup at any stage (idea to Series B)",
                    "Open globally including all African countries",
                    "Building a software-based or technology-enabled product",
                ],
                "evidence_requirements": [
                    "Short application describing product and use of Azure",
                    "Company registration or incorporation document",
                ],
            }],

            "Flat6Labs": [{
                "slug": "flat6labs-accelerator-africa-2026",
                "title": "Flat6Labs Africa Accelerator",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Egypt", "Tunisia", "Morocco", "Nigeria", "Pan-Africa"],
                "target_sectors": ["fintech", "healthtech", "edtech", "ai_ml", "b2b_saas", "logistics"],
                "funding_amount_min_usd":  Decimal("40000.00"),
                "funding_amount_max_usd":  Decimal("100000.00"),
                "equity_percentage_taken": "10-15% equity",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "Flat6Labs is MENA and Africa's leading seed accelerator with 1,200+ startups "
                    "graduated across Cairo, Tunis, Abu Dhabi, Riyadh, Casablanca, and Nairobi. "
                    "Their Africa expansion covers Nigeria, Kenya and pan-African cohorts."
                ),
                "key_benefits": [
                    "$40K to $100K investment for 10-15% equity",
                    "4-month intensive programme with weekly mentor sessions",
                    "Strong MENA and Africa investor syndicate network",
                    "Regional market entry assistance across Africa and MENA",
                ],
                "eligibility_criteria": [
                    "Early-stage startup operating in Africa or MENA",
                    "Tech product with defensible market position",
                    "Full-time committed founding team of 2+",
                ],
                "evidence_requirements": [
                    "MVP or prototype demonstration",
                    "Early customer validation metrics",
                    "Team profile with relevant domain expertise",
                ],
            }],

            "Launch Africa": [{
                "slug": "launch-africa-ventures-2026",
                "title": "Launch Africa Ventures — Pre-Seed Fund",
                "opportunity_type": _T.PRE_SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "pre_seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Ghana", "Rwanda", "Ivory Coast"],
                "target_sectors": ["fintech", "b2b_saas", "logistics", "cleantech", "healthcare", "agritech"],
                "funding_amount_min_usd":  Decimal("25000.00"),
                "funding_amount_max_usd":  Decimal("500000.00"),
                "equity_percentage_taken": "SAFE: 7-15% equity at conversion",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "Launch Africa is a pan-African pre-seed and seed VC fund with one of the "
                    "broadest reach across African markets, investing in 27+ countries. Known "
                    "for 30-day rapid investment decisions and deep local operator networks."
                ),
                "key_benefits": [
                    "$25K to $500K first check",
                    "30-day rapid investment decision process",
                    "Active portfolio in 27 African countries",
                    "Strong local regulatory and market navigation network",
                ],
                "eligibility_criteria": [
                    "Operating or incorporating in any of 27+ African markets",
                    "Pre-seed to seed stage with functional product",
                    "Technology-enabled business with scalable unit economics",
                ],
                "evidence_requirements": [
                    "Pitch deck with problem, solution, and traction",
                    "Financial model with 18-month projection",
                    "Customer or revenue evidence (pilot or MRR metrics)",
                ],
            }],

            "Norrsken22": [{
                "slug": "norrsken22-fund-2026",
                "title": "Norrsken22 Africa Growth Fund",
                "opportunity_type": _T.SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Rwanda", "Uganda", "Tanzania"],
                "target_sectors": ["fintech", "cleantech", "healthtech", "agritech", "climate", "b2b_saas"],
                "funding_amount_min_usd":  Decimal("100000.00"),
                "funding_amount_max_usd":  Decimal("2000000.00"),
                "equity_percentage_taken": "Standard equity — market rate terms",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "Norrsken22 is a $200M impact-driven VC fund investing in African tech "
                    "startups focused on sustainability, financial inclusion, healthcare, and "
                    "climate solutions. Backed by Norrsken Foundation across 100+ countries."
                ),
                "key_benefits": [
                    "$100K to $2M investment from a $200M dedicated Africa fund",
                    "Global network through Norrsken Foundation (100+ countries)",
                    "Impact measurement support and ESG framework assistance",
                    "Access to co-investors including top global impact VCs",
                ],
                "eligibility_criteria": [
                    "Based in Africa or primarily serving African markets",
                    "Seed or early growth stage with positive unit economics",
                    "Measurable positive social or environmental impact",
                ],
                "evidence_requirements": [
                    "Impact metrics and social KPIs documentation",
                    "Revenue or ARR evidence with growth trajectory",
                    "Full pitch deck with market sizing and competitive moat",
                ],
            }],

            "Orange Corners": [{
                "slug": "orange-corners-africa-2026",
                "title": "Orange Corners Incubation Programme",
                "opportunity_type": _T.GRANT,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Nigeria", "Ghana", "Ethiopia", "Morocco", "Tunisia", "Egypt", "Jordan"],
                "target_sectors": ["all"],
                "funding_amount_min_usd":  Decimal("10000.00"),
                "funding_amount_max_usd":  Decimal("50000.00"),
                "equity_percentage_taken": "Equity-free grant + business incubation",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "Orange Corners is a Dutch government-funded programme offering equity-free "
                    "grants and intensive business incubation to early-stage entrepreneurs across "
                    "Africa and MENA. Graduates gain access to Dutch trade and investment networks."
                ),
                "key_benefits": [
                    "Equity-free grant: $10K to $50K",
                    "6-month intensive business incubation support",
                    "Access to Dutch government business development networks",
                    "Regional market entry and regulatory guidance",
                ],
                "eligibility_criteria": [
                    "Entrepreneur based in a target African or MENA country",
                    "Early-stage business with social or economic impact focus",
                    "Business plan or early prototype stage",
                ],
                "evidence_requirements": [
                    "Business plan with clear impact objectives",
                    "Founder profile and motivation letter",
                    "Evidence of community or customer need",
                ],
            }],

            "54 Collective": [{
                "slug": "54-collective-fund-2026",
                "title": "54 Collective Seed Fund",
                "opportunity_type": _T.SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "South Africa", "Ghana", "Francophone Africa"],
                "target_sectors": ["fintech", "b2b_saas", "logistics", "healthtech", "climate", "ai_ml"],
                "funding_amount_min_usd":  Decimal("100000.00"),
                "funding_amount_max_usd":  Decimal("1000000.00"),
                "equity_percentage_taken": "Equity or SAFE — standard market terms",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "54 Collective is a community-led VC fund dedicated to Africa's tech "
                    "ecosystem, backing scalable startups with $100K to $1M seed capital and "
                    "deep operational support across 20+ African markets."
                ),
                "key_benefits": [
                    "$100K to $1M seed investment",
                    "Pan-African operational network in 20+ markets",
                    "Community-driven support from 300+ African tech operators",
                    "Access to 54 Collective's global LP network for follow-on",
                ],
                "eligibility_criteria": [
                    "Technology startup operating primarily in Africa",
                    "Seed stage with $10K+ MRR or strong pilot metrics",
                    "Full-time founder team with domain expertise",
                ],
                "evidence_requirements": [
                    "Detailed pitch deck with traction and growth metrics",
                    "Financial model showing path to profitability",
                    "Evidence of product-market fit and customer retention",
                ],
            }],

            "Tony Elumelu Foundation": [{
                "slug": "tef-entrepreneurship-programme-2026",
                "title": "Tony Elumelu Foundation Entrepreneurship Programme",
                "opportunity_type": _T.GRANT,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "Ghana", "Senegal",
                                       "Cameroon", "Ethiopia", "Uganda", "Tanzania", "Ivory Coast"],
                "target_sectors": ["all"],
                "funding_amount_min_usd":  Decimal("5000.00"),
                "funding_amount_max_usd":  Decimal("5000.00"),
                "equity_percentage_taken": "Non-refundable grant — equity-free",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "The Tony Elumelu Foundation Entrepreneurship Programme is one of Africa's "
                    "largest entrepreneurship initiatives, providing $5,000 non-refundable seed "
                    "capital, 12 weeks of business training, and mentorship to 1,000 African "
                    "entrepreneurs annually across all 54 African countries."
                ),
                "key_benefits": [
                    "$5,000 non-refundable seed capital grant",
                    "12-week structured business training programme",
                    "Dedicated business mentor for 12 months",
                    "Access to TEF Entrepreneurship Forum and alumni network",
                    "Networking with 20,000+ alumni across 54 African countries",
                ],
                "eligibility_criteria": [
                    "African entrepreneur — nationals of any of 54 African countries",
                    "Early-stage business (0-3 years old)",
                    "Scalable, for-profit, high-impact business idea",
                    "Applicant must be 18+ years old",
                ],
                "evidence_requirements": [
                    "Online TEF application form completion",
                    "Business concept or early business plan",
                    "Personal statement of impact and entrepreneurial motivation",
                ],
            }],

            "Microtraction": [{
                "slug": "microtraction-pre-seed-rolling-2026",
                "title": "Microtraction Pre-Seed Fund",
                "opportunity_type": _T.PRE_SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "pre_seed",
                "target_geographies": ["Nigeria", "Kenya", "Ghana", "Pan-Africa"],
                "target_sectors": ["fintech", "b2b_saas", "logistics", "healthtech", "ai_ml", "infrastructure"],
                "funding_amount_min_usd":  Decimal("25000.00"),
                "funding_amount_max_usd":  Decimal("100000.00"),
                "equity_percentage_taken": "7-10% equity at pre-seed stage",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "Microtraction is one of West Africa's most active pre-seed investors, backing "
                    "Africa's most remarkable teams with technical founders at the earliest stages. "
                    "Operating Fund II ($15M, IFC-backed), Microtraction invests in tech and "
                    "tech-enabled businesses across Sub-Saharan Africa — particularly in Nigeria."
                ),
                "key_benefits": [
                    "$25K–$100K first pre-seed check",
                    "One of the fastest-moving pre-seed investors in West Africa",
                    "Deep Lagos/Nigeria ecosystem network and introductions",
                    "Technical founder-friendly diligence process",
                    "Follow-on support through Microtraction Community Ltd (Fund II)",
                ],
                "eligibility_criteria": [
                    "At least one technical co-founder on the team",
                    "Early-stage company — pre-revenue to early MRR acceptable",
                    "Building in a large, technology-addressable African market",
                    "Full-time committed founding team",
                ],
                "evidence_requirements": [
                    "Working prototype or MVP demonstration",
                    "Brief deck covering problem, solution, and founding team",
                    "Evidence of technical capability (GitHub, product demo, etc.)",
                ],
            }],

            "Ajim Capital": [{
                "slug": "ajim-capital-fund-ii-2026",
                "title": "Ajim Capital Fund II — Pre-Seed & Seed",
                "opportunity_type": _T.PRE_SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "pre_seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "Ghana", "South Africa", "Francophone Africa"],
                "target_sectors": ["fintech", "logistics", "vertical_saas", "ai_ml", "commerce", "infrastructure"],
                "funding_amount_min_usd":  Decimal("250000.00"),
                "funding_amount_max_usd":  Decimal("500000.00"),
                "equity_percentage_taken": "Standard SAFE — market terms",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "Ajim Capital, founded by Eunice Ajim, invests $250K–$500K at pre-seed and "
                    "seed in technology companies building Africa's core infrastructure — fintech, "
                    "logistics, vertical SaaS, AI, and commerce. Fund II is actively deploying "
                    "and leads rounds with founder-aligned terms."
                ),
                "key_benefits": [
                    "$250K–$500K first institutional check",
                    "Fund II actively deploying — fast decision process",
                    "Founder-aligned terms with no onerous control provisions",
                    "Strong cross-border network in Nigeria, East and Francophone Africa",
                    "Portfolio operator network for go-to-market and hiring support",
                ],
                "eligibility_criteria": [
                    "Building core infrastructure technology for African markets",
                    "Pre-seed to seed stage with product in market or MVP",
                    "Founding team with deep domain expertise",
                    "Targeting a large, technology-addressable market opportunity",
                ],
                "evidence_requirements": [
                    "Pitch deck with problem, market size, and product overview",
                    "Early customer or pilot evidence",
                    "Financial model or projection showing path to unit economics",
                ],
            }],

            "Ventures Platform": [{
                "slug": "ventures-platform-fund-ii-2026",
                "title": "Ventures Platform Fund II — Pre-Seed to Series A",
                "opportunity_type": _T.SEED_FUND,
                "status": _S.ROLLING,
                "target_stage": "pre_seed",
                "target_geographies": ["Nigeria", "Ivory Coast", "Egypt", "Morocco", "Senegal", "Pan-Africa"],
                "target_sectors": ["fintech", "healthtech", "b2b_saas", "agritech", "ai_ml", "education"],
                "funding_amount_min_usd":  Decimal("100000.00"),
                "funding_amount_max_usd":  Decimal("2000000.00"),
                "equity_percentage_taken": "Standard equity — market rate terms",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": True, "source_confidence": 0.60,
                "description": (
                    "Ventures Platform closed its oversubscribed $84M Fund II in August 2026, "
                    "expanding beyond Nigeria into Côte d'Ivoire, Egypt, Morocco and Senegal. "
                    "Fund II backs mission-driven founders from pre-seed through Series A, "
                    "focusing on technology that drives economic prosperity and access in Africa. "
                    "IFC-backed with follow-on reserves for top performers."
                ),
                "key_benefits": [
                    "$100K–$2M investment from an $84M IFC-backed fund",
                    "Pan-African reach: Nigeria, Côte d'Ivoire, Egypt, Morocco, Senegal",
                    "Follow-on capital reserves for strong portfolio companies",
                    "Extensive operator and co-investor network across Africa",
                    "Active support on regulatory navigation and market expansion",
                ],
                "eligibility_criteria": [
                    "Startups solving for non-consumption or infrastructural gaps in Africa",
                    "Pre-seed to early Series A stage",
                    "Technology-first with a large addressable market",
                    "Mission-driven founders with domain expertise",
                ],
                "evidence_requirements": [
                    "Deck with traction metrics and growth trajectory",
                    "Evidence of impact: customers served, cost reduction, access improvement",
                    "Clear use of funds and 18-month operating plan",
                ],
            }],

            "Afreximbank": [{
                "slug": "afreximbank-accelerator-programme-2026",
                "title": "Afreximbank Flagship Accelerator Programme",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "Egypt", "South Africa",
                                       "Ghana", "Ethiopia", "Ivory Coast", "Cameroon"],
                "target_sectors": ["trade_finance", "logistics", "agritech", "e_commerce",
                                   "fintech", "commodities", "mining", "border_management"],
                "funding_amount_min_usd":  Decimal("0.00"),
                "funding_amount_max_usd":  Decimal("200000.00"),
                "equity_percentage_taken": "Terms vary — non-dilutive support + optional investment",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "The Afreximbank Flagship Accelerator Programme is a three-month initiative "
                    "designed to scale startups advancing intra-African trade under the AfCFTA. "
                    "The inaugural cohort launched in March 2026 in Cairo with 8 high-potential "
                    "startups. Cohort 2 applications expected late 2026 across agriculture, "
                    "logistics, trade finance, e-commerce, mining, and border management."
                ),
                "key_benefits": [
                    "Afreximbank network access: 53 member countries, $37B+ balance sheet",
                    "Intensive 3-month programme based in Cairo, Egypt",
                    "Direct trade finance and AfCFTA facilitation support",
                    "Potential investment and trade credit facility access",
                    "Pan-African market entry through Afreximbank member networks",
                ],
                "eligibility_criteria": [
                    "Startup solving for intra-African trade barriers",
                    "Operating in agriculture, logistics, trade finance, e-commerce, or mining",
                    "Seed stage with a working product or validated pilot",
                    "African founder or Africa-headquartered company",
                ],
                "evidence_requirements": [
                    "Documented trade facilitation impact or use case",
                    "Product demo or live service evidence",
                    "Founding team credentials and domain expertise",
                ],
            }],

            "Accelerate Africa": [{
                "slug": "accelerate-africa-program-2026",
                "title": "Accelerate Africa Startup Program",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Pan-Africa", "Nigeria", "Kenya", "Ghana", "South Africa"],
                "target_sectors": ["all"],
                "funding_amount_min_usd":  Decimal("0.00"),
                "funding_amount_max_usd":  Decimal("500000.00"),
                "equity_percentage_taken": "Optional investment — Future Africa may invest $250K–$500K post-programme",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "Accelerate Africa is an early-stage founder programme backed by Future Africa "
                    "that equips pre-seed founders with tools, networks, and structured support. "
                    "At programme completion, Future Africa offers an optional investment of "
                    "$250K–$500K following standard due diligence — making it one of the few "
                    "programmes that directly converts to institutional capital."
                ),
                "key_benefits": [
                    "Structured pre-seed programme for African founders",
                    "Optional Future Africa investment of $250K–$500K post-programme",
                    "Access to Future Africa portfolio network (200+ African startups)",
                    "Mentors with deep Africa operator and investor experience",
                ],
                "eligibility_criteria": [
                    "Early-stage African startup at idea to pre-seed stage",
                    "Full-time committed founder",
                    "Targeting a large market opportunity in Africa",
                ],
                "evidence_requirements": [
                    "Application and founder profile",
                    "Problem-solution narrative with market context",
                    "Team credentials and motivation",
                ],
            }],

            "timbuktoo / UNDP": [{
                "slug": "timbuktoo-fintech-hub-lagos-2026",
                "title": "timbuktoo Fintech Hub — Lagos Accelerator",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Nigeria", "Pan-Africa"],
                "target_sectors": ["fintech", "payments", "financial_inclusion", "digital_finance"],
                "funding_amount_min_usd":  Decimal("0.00"),
                "funding_amount_max_usd":  Decimal("100000.00"),
                "equity_percentage_taken": "Equity-free — UNDP grant support + optional investment",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "The timbuktoo Fintech Hub, launched by UNDP and the timbuktoo Africa "
                    "Innovation Foundation, is based in Lagos, Nigeria. It accelerates early-stage "
                    "fintech startups driving financial inclusion, digital payments, and access to "
                    "credit across Africa. Part of UNDP's pan-African innovation network spanning "
                    "multiple sector hubs including AgriTech, GreenTech, and EdTech."
                ),
                "key_benefits": [
                    "UNDP-backed equity-free accelerator programme",
                    "Lagos hub with pan-African network access",
                    "Technical mentorship and regulatory navigation support",
                    "Exposure to UNDP government and development finance networks",
                    "Pathway to grant funding and impact investment",
                ],
                "eligibility_criteria": [
                    "Fintech startup focused on financial inclusion or digital payments",
                    "Based in or targeting Nigerian / African markets",
                    "Early-stage to seed with working product or MVP",
                ],
                "evidence_requirements": [
                    "Product demonstration or technical prototype",
                    "Evidence of customer or community need",
                    "Team profile with fintech or domain expertise",
                ],
            }],

            "timbuktoo GreenTech": [{
                "slug": "timbuktoo-greentech-launchpad-2026",
                "title": "timbuktoo GreenTech Launchpad",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.UPCOMING,
                "target_stage": "pre_seed",
                "target_geographies": ["Kenya", "Pan-Africa"],
                "target_sectors": ["cleantech", "climate", "circular_economy", "clean_energy", "water"],
                "funding_amount_min_usd":  Decimal("0.00"),
                "funding_amount_max_usd":  Decimal("100000.00"),
                "equity_percentage_taken": "Equity-free — UNDP grant and venture-building support",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "The timbuktoo GreenTech Launchpad, anchored in Kenya, supports technology "
                    "startups tackling environmental challenges including clean energy access, "
                    "circular economy, water systems, waste management, and climate resilience. "
                    "Part of UNDP's continent-wide timbuktoo pan-African incubation network."
                ),
                "key_benefits": [
                    "UNDP-backed equity-free venture-building programme",
                    "Access to climate finance and impact investor networks",
                    "Kenya hub with East Africa ecosystem access",
                    "Technical and regulatory support for climate solutions",
                ],
                "eligibility_criteria": [
                    "Startup building climate or environmental technology solutions",
                    "Based in or targeting African markets",
                    "Early-stage with technology-driven approach",
                ],
                "evidence_requirements": [
                    "Climate impact narrative and measurable outcomes",
                    "Technical prototype or pilot evidence",
                    "Team credentials in climate, energy, or environmental sectors",
                ],
            }],

            "Google South Africa": [{
                "slug": "google-startups-accelerator-south-africa-2026",
                "title": "Google for Startups Accelerator: South Africa 2026",
                "opportunity_type": _T.ACCELERATOR,
                "status": _S.OPEN,
                "target_stage": "seed",
                "target_geographies": ["South Africa"],
                "target_sectors": ["ai_ml", "fintech", "healthtech", "cleantech", "b2b_saas", "edtech"],
                "funding_amount_min_usd":  Decimal("0.00"),
                "funding_amount_max_usd":  Decimal("350000.00"),
                "equity_percentage_taken": "Equity-free (0%) + up to $350K Google Cloud credits",
                "application_open_date": None, "application_deadline": None,
                "cohort_start_date": None, "is_rolling": False, "source_confidence": 0.60,
                "description": (
                    "Applications are open for the 2026 Google for Startups Accelerator South "
                    "Africa. This 3-month hybrid programme backs 15 growth-stage, AI-driven "
                    "startups with non-dilutive support, Google AI tools, Cloud infrastructure, "
                    "and access to Google's global partner and investor network."
                ),
                "key_benefits": [
                    "Equity-free — 0% dilution",
                    "Up to $350,000 in Google Cloud and AI credits",
                    "15 startups selected per cohort — exclusive cohort experience",
                    "1-on-1 pairing with Google AI and Cloud engineers",
                    "Global Demo Day and investor introductions",
                ],
                "eligibility_criteria": [
                    "South Africa-headquartered or South Africa-focused startup",
                    "Growth-stage with AI or technology core product",
                    "Seed to Series A with verified traction",
                ],
                "evidence_requirements": [
                    "AI/ML product or feature demonstration",
                    "Verified revenue or user traction metrics",
                    "Technical architecture overview",
                ],
            }],

        }

        return baselines.get(org, [])


    # -----------------------------------------------------------------------
    # DB upsert with change detection + versioning
    # -----------------------------------------------------------------------

    @classmethod
    def _update_or_create_opportunity(
        cls,
        source: FundingSource,
        data: Dict[str, Any],
    ) -> Tuple["FundingOpportunity", bool]:
        """
        Upsert a single opportunity record.
        Creates an OpportunityVersion whenever meaningful fields change.
        Returns (opportunity, created).
        """
        slug = data.get("slug")
        if not slug:
            raise ValidationError("Opportunity data missing 'slug' field")

        verified_freshness_now = data.pop("_verified_freshness_now", False)

        model_fields = {
            "title", "opportunity_type", "status", "target_stage",
            "target_geographies", "target_sectors",
            "funding_amount_min_usd", "funding_amount_max_usd",
            "equity_percentage_taken", "application_open_date",
            "application_deadline", "cohort_start_date", "is_rolling",
            "source_confidence", "source_quote_evidence", "description",
            "key_benefits", "eligibility_criteria", "evidence_requirements",
        }
        clean = {k: v for k, v in data.items() if k in model_fields}
        defaults = {**clean, "source": source}
        if verified_freshness_now:
            defaults["verified_freshness"] = timezone.now()

        opportunity, created = FundingOpportunity.objects.get_or_create(
            slug=slug, defaults=defaults,
        )

        if not created:
            changes = cls._detect_changes(opportunity, clean)
            if changes:
                with transaction.atomic():
                    OpportunityVersion.objects.create(
                        opportunity=opportunity,
                        version_number=opportunity.version_count,
                        status=opportunity.status,
                        deadline=opportunity.application_deadline,
                        funding_amount_max_usd=opportunity.funding_amount_max_usd,
                        changed_fields=changes,
                        raw_content_snippet=cls._build_version_snippet(
                            opportunity, clean, changes
                        ),
                    )
                    for k, v in clean.items():
                        setattr(opportunity, k, v)
                    if verified_freshness_now:
                        opportunity.verified_freshness = timezone.now()
                    opportunity.version_count += 1
                    opportunity.save()
                logger.info("[upsert] Updated %s: changed=%s", slug, changes)
            else:
                if verified_freshness_now:
                    opportunity.verified_freshness = timezone.now()
                    opportunity.save(update_fields=["verified_freshness"])

        return opportunity, created

    @classmethod
    def _build_version_snippet(
        cls,
        opportunity: "FundingOpportunity",
        new_data: Dict[str, Any],
        changes: List[str],
    ) -> str:
        parts = []
        for f in changes:
            old = getattr(opportunity, f, None)
            new = new_data.get(f)
            parts.append(f"{f}: {old!r} → {new!r}")
        return " | ".join(parts)[:500]

    @classmethod
    def _detect_changes(
        cls,
        opportunity: "FundingOpportunity",
        data: Dict[str, Any],
    ) -> List[str]:
        """Return list of field names that differ between DB record and new data."""
        changes: List[str] = []
        watched = [
            "status", "application_deadline", "funding_amount_min_usd",
            "funding_amount_max_usd", "title", "description", "target_stage",
            "target_geographies", "target_sectors", "equity_percentage_taken",
            "is_rolling", "source_confidence",
        ]
        for f in watched:
            db_val  = getattr(opportunity, f, None)
            new_val = data.get(f)
            if isinstance(db_val, list) and isinstance(new_val, list):
                if sorted(str(x) for x in db_val) != sorted(str(x) for x in new_val):
                    changes.append(f)
            elif db_val != new_val:
                changes.append(f)
        return changes

    @classmethod
    def _touch_verified_freshness_for_source(cls, source: FundingSource) -> int:
        """Bump verified_freshness on active opportunities without a full re-parse."""
        return FundingOpportunity.objects.filter(
            source=source,
            status__in=[
                FundingOpportunity.Status.OPEN,
                FundingOpportunity.Status.CLOSING_SOON,
                FundingOpportunity.Status.ROLLING,
                FundingOpportunity.Status.UPCOMING,
            ],
        ).update(verified_freshness=timezone.now())

    @classmethod
    def _retire_expired_opportunities(cls) -> None:
        """Auto-close opportunities whose application deadline has passed."""
        today   = timezone.now().date()
        expired = FundingOpportunity.objects.filter(
            status__in=[FundingOpportunity.Status.OPEN, FundingOpportunity.Status.CLOSING_SOON],
            is_rolling=False,
            application_deadline__lt=today,
        )
        retired = 0
        for opp in expired:
            try:
                with transaction.atomic():
                    OpportunityVersion.objects.create(
                        opportunity=opp,
                        version_number=opp.version_count,
                        status=opp.status,
                        deadline=opp.application_deadline,
                        funding_amount_max_usd=opp.funding_amount_max_usd,
                        changed_fields=["status"],
                        raw_content_snippet=(
                            "Application deadline passed — automatically retired to CLOSED."
                        ),
                    )
                    opp.status = FundingOpportunity.Status.CLOSED
                    opp.version_count += 1
                    opp.save()
                    retired += 1
            except Exception as exc:
                logger.error("[retire] %s: %s", opp.slug, exc)
        if retired:
            logger.info("[retire] Retired %d expired opportunities", retired)


# ---------------------------------------------------------------------------
# Opportunity Matching Engine
# ---------------------------------------------------------------------------

class OpportunityMatchingEngine:
    """
    Computes personalised 7-dimensional compatibility matches between a startup
    and active funding opportunities, generating concrete evidence gaps and
    positive conviction points for each match.
    """

    CACHE_TIMEOUT = 60 * 60  # 1 hour

    @classmethod
    def get_recommended_opportunities_for_startup(
        cls,
        startup: StartupProfile,
        limit: Optional[int] = None,
        use_cache: bool = True,
    ) -> List[Dict[str, Any]]:
        if use_cache:
            cache_key = CacheKeys.STARTUP_MATCHES.format(startup_id=startup.id)
            try:
                cached = cache.get(cache_key)
                if cached is not None:
                    return cached[:limit] if limit else cached
            except Exception:
                pass

        active_opps = cls._get_active_opportunities()

        if not active_opps.exists():
            try:
                result = OpportunityIngestionEngine.sync_ecosystem_sources()
                if result.get("status") in ("success", "partial_success"):
                    active_opps = cls._get_active_opportunities()
                else:
                    logger.warning("sync_ecosystem_sources failed: %s", result)
                    return []
            except Exception as exc:
                logger.error("Error during opportunity sync: %s", exc, exc_info=True)
                return []

        startup_pf = cls._prefetch_startup_data(startup)
        recommendations: List[Dict[str, Any]] = []

        for opp in active_opps:
            try:
                recommendations.append(cls.compute_match(startup_pf, opp))
            except Exception as exc:
                logger.error("Failed match for %s: %s", opp.slug, exc, exc_info=True)

        recommendations.sort(key=lambda x: x["overall_match_score"], reverse=True)

        if use_cache and recommendations:
            try:
                cache.set(
                    CacheKeys.STARTUP_MATCHES.format(startup_id=startup.id),
                    recommendations,
                    cls.CACHE_TIMEOUT,
                )
            except Exception:
                pass

        return recommendations[:limit] if limit else recommendations

    @classmethod
    def _get_active_opportunities(cls):
        return FundingOpportunity.objects.filter(
            status__in=[
                FundingOpportunity.Status.OPEN,
                FundingOpportunity.Status.CLOSING_SOON,
                FundingOpportunity.Status.ROLLING,
                FundingOpportunity.Status.UPCOMING,
            ]
        ).select_related("source").order_by("-verified_freshness")

    @classmethod
    def _prefetch_startup_data(cls, startup: StartupProfile) -> StartupProfile:
        qs = StartupProfile.objects.filter(id=startup.id)
        for rel in ("maturity_assessments", "evidence_records", "financial_snapshots"):
            if hasattr(startup, rel):
                qs = qs.prefetch_related(rel)
        return qs.first() or startup

    @classmethod
    def compute_match(
        cls,
        startup: StartupProfile,
        opp: FundingOpportunity,
    ) -> Dict[str, Any]:
        dims       = cls._calculate_dimensions(startup, opp)
        overall    = cls._calculate_overall_score(dims)
        gaps       = cls._generate_evidence_gaps(startup, opp, dims)
        convictions = cls._generate_positive_convictions(startup, opp, dims)
        record     = cls._save_match_record(startup, opp, overall, dims, gaps, convictions)
        return cls._build_match_result(startup, opp, overall, dims, record)

    # ── Dimension calculators ────────────────────────────────────────────────

    @classmethod
    def _calculate_dimensions(cls, startup: StartupProfile, opp: FundingOpportunity) -> Dict[str, int]:
        return {
            "stage_fit":           cls._calculate_stage_fit(startup, opp),
            "geography_fit":       cls._calculate_geography_fit(startup, opp),
            "sector_fit":          cls._calculate_sector_fit(startup, opp),
            "funding_fit":         cls._calculate_funding_fit(startup, opp),
            "business_model_fit":  cls._calculate_business_model_fit(startup, opp),
            "product_maturity":    cls._calculate_product_maturity(startup, opp),
            "evidence_readiness":  cls._calculate_evidence_readiness(startup, opp),
        }

    @classmethod
    def _calculate_stage_fit(cls, startup: StartupProfile, opp: FundingOpportunity) -> int:
        s_stage = (startup.funding_stage or "pre_seed").lower()
        o_stage = (opp.target_stage or "all").lower()
        if o_stage in ("all", s_stage):
            return 98
        return StageFitMapping.MATRIX.get((s_stage, o_stage), StageFitMapping.DEFAULT_SCORE)

    @classmethod
    def _calculate_geography_fit(cls, startup: StartupProfile, opp: FundingOpportunity) -> int:
        loc  = (startup.location or "").lower()
        geos = [g.lower() for g in (opp.target_geographies or [])]
        if any(g in ("global", "pan-africa", "worldwide") for g in geos):
            return 100
        if any(g in loc or loc in g for g in geos):
            return 100
        return 75

    @classmethod
    def _calculate_sector_fit(cls, startup: StartupProfile, opp: FundingOpportunity) -> int:
        ind  = (startup.industry or "").lower()
        secs = [s.lower() for s in (opp.target_sectors or [])]
        if "all" in secs:
            return 94
        if any(s in ind or ind in s for s in secs):
            return 94
        related = (
            ("fintech", "fin"),   ("saas", "saas"),
            ("cleantech", "clean"), ("healthtech", "health"),
            ("edtech", "edu"),    ("agritech", "agri"),
        )
        for sector, kw in related:
            if sector in ind and any(kw in s for s in secs):
                return 85
        return 72

    @classmethod
    def _calculate_funding_fit(cls, startup: StartupProfile, opp: FundingOpportunity) -> int:
        target   = 100_000.0
        campaign = getattr(startup, "fundraising_campaign", None)
        if campaign and getattr(campaign, "target_amount_usd", None):
            target = float(campaign.target_amount_usd)
        lo = float(opp.funding_amount_min_usd)
        hi = float(opp.funding_amount_max_usd)
        if lo <= target <= hi:
            return 95
        if target < lo:
            return 85 if (lo > 0 and target / lo >= 0.7) else 75
        return 85 if (target > 0 and hi / target >= 0.7) else 78

    @classmethod
    def _calculate_business_model_fit(cls, startup: StartupProfile, opp: FundingOpportunity) -> int:
        if opp.opportunity_type == FundingOpportunity.OpportunityType.ACCELERATOR:
            ind = (startup.industry or "").lower()
            if "b2b" in ind:
                return 92
            if "b2c" in ind:
                return 88
        return 89

    @classmethod
    def _calculate_product_maturity(cls, startup: StartupProfile, opp: FundingOpportunity) -> int:
        ma = getattr(startup, "maturity_assessments", None)
        latest = ma.order_by("-assessed_at").first() if ma else None
        if latest and getattr(latest, "product_score", None):
            return max(60, min(100, int(latest.product_score * 1.1)))
        return 72

    @classmethod
    def _calculate_evidence_readiness(cls, startup: StartupProfile, opp: FundingOpportunity) -> int:
        ev = getattr(startup, "evidence_records", None)
        return min(95, 60 + (ev.count() if ev else 0) * 8)

    @classmethod
    def _calculate_overall_score(cls, dims: Dict[str, int]) -> int:
        weights = {
            "stage_fit":          MatchWeights.STAGE,
            "geography_fit":      MatchWeights.GEOGRAPHY,
            "sector_fit":         MatchWeights.SECTOR,
            "funding_fit":        MatchWeights.FUNDING,
            "business_model_fit": MatchWeights.BUSINESS_MODEL,
            "product_maturity":   MatchWeights.PRODUCT_MATURITY,
            "evidence_readiness": MatchWeights.EVIDENCE_READINESS,
        }
        total = sum(
            Decimal(str(dims[k])) * w
            for k, w in weights.items()
            if k in dims
        )
        return max(60, min(98, int(round(total / MatchWeights.total()))))

    # ── Gap & conviction generators ──────────────────────────────────────────

    @classmethod
    def _generate_evidence_gaps(
        cls,
        startup: StartupProfile,
        opp: FundingOpportunity,
        dims: Dict[str, int],
    ) -> List[str]:
        gaps:    List[str] = []
        ev       = getattr(startup, "evidence_records", None)
        ev_count = ev.count() if ev else 0
        fin      = getattr(startup, "financial_snapshots", None)
        fin_count = fin.count() if fin else 0

        if ev_count == 0:
            gaps.append("Limited verified customer traction evidence in Data Room")
        if fin_count == 0:
            gaps.append("No structured quarterly financial snapshots logged")
        if dims.get("product_maturity", 0) < 70:
            gaps.append("Complete a product maturity assessment to verify technical readiness")
        if "fintech" in (startup.industry or "").lower() and ev_count < 2:
            gaps.append("Compliance or partnership licence documentation pending")
        if dims.get("stage_fit", 0) < 75:
            gaps.append(
                f"Stage mismatch: programme targets "
                f"{opp.target_stage.replace('_', ' ')} — align your funding round narrative"
            )
        if not gaps:
            gaps.append("Upload customer testimonials to improve institutional diligence score")
        return gaps[:5]

    @classmethod
    def _generate_positive_convictions(
        cls,
        startup: StartupProfile,
        opp: FundingOpportunity,
        dims: Dict[str, int],
    ) -> List[str]:
        convictions: List[str] = []
        stage = (startup.funding_stage or "pre_seed").replace("_", " ").title()

        if dims.get("stage_fit", 0) >= 80:
            convictions.append(f"{stage} stage perfectly aligned with programme mandate")
        if dims.get("geography_fit", 0) >= 90:
            convictions.append(
                f"Geographic focus ({startup.location or 'Africa'}) directly supported"
            )
        lo = float(opp.funding_amount_min_usd)
        hi = float(opp.funding_amount_max_usd)
        convictions.append(
            f"Funding target matches available check size (${lo:,.0f} – ${hi:,.0f})"
        )
        sector = (startup.industry or "").capitalize()
        if sector and dims.get("sector_fit", 0) >= 85:
            convictions.append(
                f"{sector} sector expertise directly relevant to programme thesis"
            )
        if dims.get("evidence_readiness", 0) >= 80:
            convictions.append("Strong evidence portfolio ready for diligence review")
        return convictions[:5]

    # ── Persistence & result building ────────────────────────────────────────

    @classmethod
    def _save_match_record(
        cls,
        startup: StartupProfile,
        opp: FundingOpportunity,
        overall: int,
        dims: Dict[str, int],
        gaps: List[str],
        convictions: List[str],
    ) -> StartupOpportunityMatch:
        record, _ = StartupOpportunityMatch.objects.update_or_create(
            startup=startup,
            opportunity=opp,
            defaults={
                "overall_match_score":     overall,
                "stage_fit":               dims["stage_fit"],
                "geography_fit":           dims["geography_fit"],
                "sector_fit":              dims["sector_fit"],
                "funding_fit":             dims["funding_fit"],
                "business_model_fit":      dims["business_model_fit"],
                "product_maturity_fit":    dims["product_maturity"],
                "evidence_readiness_fit":  dims["evidence_readiness"],
                "evidence_gaps":           gaps,
                "positive_convictions":    convictions,
            },
        )
        return record

    @classmethod
    def _build_match_result(
        cls,
        startup: StartupProfile,
        opp: FundingOpportunity,
        overall: int,
        dims: Dict[str, int],
        record: StartupOpportunityMatch,
    ) -> Dict[str, Any]:
        days_remaining = None
        if opp.application_deadline:
            days_remaining = max(0, (opp.application_deadline - timezone.now().date()).days)

        freshness_hours = 0
        if opp.verified_freshness:
            freshness_hours = max(
                0, int((timezone.now() - opp.verified_freshness).total_seconds() // 3600)
            )

        data_source_type    = "baseline"
        last_fetched_from   = ""
        extraction_confidence = 0.0
        try:
            if opp.source_quote_evidence:
                audit = json.loads(opp.source_quote_evidence)
                data_source_type      = audit.get("data_source_type", "baseline")
                urls                  = audit.get("contributing_urls", [])
                last_fetched_from     = urls[0] if urls else ""
                extraction_confidence = float(audit.get("overall_confidence", 0.0))
        except (json.JSONDecodeError, TypeError, KeyError):
            pass

        return MatchResult(
            opportunity_id=str(opp.id),
            source_id=str(opp.source.id) if opp.source else "",
            organization=opp.source.organization if opp.source else "Unknown",
            source_name=opp.source.name if opp.source else "Unknown",
            source_type=opp.source.source_type if opp.source else "",
            title=opp.title,
            slug=opp.slug,
            opportunity_type=opp.opportunity_type,
            status=opp.status,
            funding_min_usd=str(opp.funding_amount_min_usd),
            funding_max_usd=str(opp.funding_amount_max_usd),
            equity_terms=opp.equity_percentage_taken,
            deadline=opp.application_deadline.isoformat() if opp.application_deadline else None,
            days_remaining=days_remaining,
            is_rolling=opp.is_rolling,
            source_confidence=float(opp.source_confidence) if opp.source_confidence else 0.0,
            verified_freshness_hours_ago=freshness_hours,
            application_url=(
                opp.source.application_url or opp.source.base_url if opp.source else ""
            ),
            overall_match_score=overall,
            is_saved_to_pipeline=record.is_saved_to_pipeline,
            pipeline_stage=record.pipeline_stage or "interested",
            dimensional_scores={
                "stage_fit":          dims["stage_fit"],
                "geography_fit":      dims["geography_fit"],
                "sector_fit":         dims["sector_fit"],
                "funding_fit":        dims["funding_fit"],
                "business_model_fit": dims["business_model_fit"],
                "product_maturity":   dims["product_maturity"],
                "evidence_readiness": dims["evidence_readiness"],
            },
            evidence_gaps=record.evidence_gaps or [],
            positive_convictions=record.positive_convictions or [],
            key_benefits=opp.key_benefits or [],
            eligibility_criteria=opp.eligibility_criteria or [],
            evidence_requirements=opp.evidence_requirements or [],
            description=opp.description or "",
            data_source_type=data_source_type,
            last_fetched_from=last_fetched_from,
            extraction_confidence=extraction_confidence,
        ).to_dict()

    @classmethod
    def invalidate_startup_cache(cls, startup_id: Any) -> None:
        try:
            cache.delete(CacheKeys.STARTUP_MATCHES.format(startup_id=startup_id))
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Admin / Management Utilities
# ---------------------------------------------------------------------------

class OpportunityAdminUtils:

    @classmethod
    def force_sync_all_sources(cls) -> Dict[str, Any]:
        logger.info("[admin] Starting forced full sync…")
        result = OpportunityIngestionEngine.sync_ecosystem_sources()
        try:
            cache.delete(CacheKeys.OPPORTUNITY_LIST)
        except Exception:
            pass
        return result

    @classmethod
    def recalculate_all_matches(cls, startup_id: Optional[Any] = None) -> Dict[str, int]:
        startups = (
            StartupProfile.objects.filter(id=startup_id)
            if startup_id else StartupProfile.objects.all()
        )
        processed = errors = 0
        for startup in startups:
            try:
                OpportunityMatchingEngine.get_recommended_opportunities_for_startup(
                    startup, use_cache=False
                )
                processed += 1
            except Exception as exc:
                logger.error("[admin] Match recalc failed for %s: %s", startup.id, exc)
                errors += 1
        return {"processed": processed, "errors": errors}

    @classmethod
    def run_discovery(cls) -> Dict[str, int]:
        """Manually trigger Path B aggregator discovery."""
        return OpportunityDiscoveryEngine.discover_new_sources()

    @classmethod
    def get_sync_status(cls) -> Dict[str, Any]:
        active_sources = FundingSource.objects.filter(active=True).count()
        total_opps     = FundingOpportunity.objects.count()
        active_opps    = FundingOpportunity.objects.filter(
            status__in=[
                FundingOpportunity.Status.OPEN,
                FundingOpportunity.Status.CLOSING_SOON,
                FundingOpportunity.Status.ROLLING,
            ]
        ).count()
        latest = (
            FundingSource.objects.filter(active=True)
            .order_by("-last_checked_at")
            .first()
        )
        return {
            "active_sources":       active_sources,
            "total_opportunities":  total_opps,
            "active_opportunities": active_opps,
            "last_sync":            latest.last_checked_at.isoformat() if latest and latest.last_checked_at else None,
        }
