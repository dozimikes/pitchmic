"""
backend.apps.matching.opportunity_fetcher
=========================================
Advanced multi-strategy web intelligence fetcher for funding opportunity sources.

Extraction hierarchy (highest to lowest confidence):
  1. JSON-LD structured data  (Schema.org Event / EducationalOccupationalProgram / FAQPage)
  2. Open Graph / <meta> tag extraction
  3. RSS / Atom feed parsing
  4. Sitemap URL discovery + selective sub-page crawling
  5. Regex with sentence-context scoring (deadline-keyword proximity weighting)
  6. Plain regex (no context, lower confidence)
  7. JS-heavy fallback: anchor-text + visible-text heuristics

Every extracted value carries full provenance:
  - confidence       : calibrated 0.0-1.0 score
  - evidence_snippet : exact page text that produced this value
  - extraction_method: "json_ld" | "og_meta" | "rss" | "sitemap" |
                       "regex_context" | "regex_plain" | "heuristic"
  - source_url       : URL the signal was fetched from
  - retrieved_at     : ISO 8601 timestamp

Architecture:
  SourceFetcher
    fetch_and_parse(source)        Full pipeline entry point
    fetch(source)                  Single-page HTTP GET with retry/backoff + UA rotation
    fetch_multi(source)            Multi-page crawl (base + app URL + sub-pages + sitemap)
    fetch_rss(source)              RSS / Atom feed parser
    parse_signals(result, source)  Full multi-strategy extraction pipeline
    merge_multi_page_signals()     Fuse signals across multiple fetched pages
    normalize_and_hash(html)       SHA-256 stable content fingerprint
    page_has_changed(source, hash) Hash-based change detection
"""
from __future__ import annotations

import datetime
import hashlib
import json
import logging
import math
import random
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Optional enhanced dependencies
# ---------------------------------------------------------------------------
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry  # type: ignore[import-untyped]
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False
    logger.info("[fetcher] requests not available — falling back to stdlib urllib")

try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False
    logger.info("[fetcher] beautifulsoup4 not available — using regex on raw HTML")

try:
    from dateutil import parser as du_parser  # type: ignore[import-untyped]
    _HAS_DATEUTIL = True
except ImportError:
    _HAS_DATEUTIL = False
    logger.info("[fetcher] python-dateutil not available — using stdlib date parsing")


# ---------------------------------------------------------------------------
# Fetch configuration
# ---------------------------------------------------------------------------
_FETCH_TIMEOUT_S = 22
_MAX_CONTENT_BYTES = 4 * 1024 * 1024   # 4 MB HTML cap
_RETRY_MAX = 3
_RETRY_BACKOFF_FACTOR = 1.5
_MIN_SIGNAL_CONFIDENCE = 0.65
_SUBPAGE_CRAWL_LIMIT = 4
_RSS_ITEM_LIMIT = 30
_POLITE_CRAWL_DELAY_S = 0.35           # seconds between sub-page requests

# Rotating UA pool
_USER_AGENTS: List[str] = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) "
        "Gecko/20100101 Firefox/129.0"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15"
    ),
    (
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
    ),
]

_BASE_HEADERS: Dict[str, str] = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    # NOTE: Accept-Encoding is intentionally omitted from the base headers.
    # The requests library handles decompression automatically, so it adds
    # its own Accept-Encoding when _HAS_REQUESTS is True.
    # The urllib fallback path (_fetch_with_urllib / _raw_get) explicitly sets
    # "Accept-Encoding: identity" to request uncompressed responses, avoiding
    # the gzip/brotli mojibake bug that occurs when raw compressed bytes are
    # decoded as UTF-8 text.
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "DNT": "1",
}

_RSS_HEADERS: Dict[str, str] = {
    "Accept": (
        "application/rss+xml,application/atom+xml,"
        "application/xml,text/xml;q=0.9,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
}

# ---------------------------------------------------------------------------
# Sub-page / feed discovery paths
# ---------------------------------------------------------------------------
_SUBPAGE_HREF_RE = re.compile(
    r"(?:apply|application|program|cohort|accelerat|invest|fund|grant"
    r"|deadline|eligib|criteria|batch|startup|founder)",
    re.I,
)

_COMMON_RSS_PATHS: List[str] = [
    "/feed", "/feed.xml", "/rss", "/rss.xml", "/atom.xml",
    "/blog/feed", "/news/feed", "/updates/feed",
]

_COMMON_SITEMAP_PATHS: List[str] = [
    "/sitemap.xml", "/sitemap_index.xml", "/sitemap/sitemap.xml",
    "/sitemap-programs.xml", "/sitemap-pages.xml",
]

# ---------------------------------------------------------------------------
# Date patterns
# ---------------------------------------------------------------------------
_MONTHS = (
    r"january|february|march|april|may|june|july|august|september|"
    r"october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec"
)
_ORD = r"(?:st|nd|rd|th)?"

_DATE_PATTERNS: List[re.Pattern] = [
    # ISO-8601: 2026-09-30
    re.compile(r"\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b"),
    # US long: September 30, 2026 / Sep 30th 2026
    re.compile(rf"\b({_MONTHS})\s+(\d{{1,2}}){_ORD},?\s*(\d{{4}})\b", re.I),
    # UK long: 30 September 2026
    re.compile(rf"\b(\d{{1,2}}){_ORD}\s+({_MONTHS})\s+(\d{{4}})\b", re.I),
    # Short numeric: 30/09/2026
    re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b"),
]

# ---------------------------------------------------------------------------
# Deadline context patterns  (text before the date, confidence bonus)
# ---------------------------------------------------------------------------
_DEADLINE_CONTEXTS: List[Tuple[re.Pattern, float]] = [
    (re.compile(r"(?:application|apply|submit(?:ting)?)\s*(?:deadline|closes?|due|by)\s*:?\s*$", re.I), 0.42),
    (re.compile(r"(?:last|final)\s+day\s+(?:to\s+apply|for\s+applications?)\s*:?\s*$", re.I), 0.40),
    (re.compile(r"(?:applications?\s+)?(?:closes?|ends?|due)\s+(?:on\s+)?$", re.I), 0.37),
    (re.compile(r"deadline\s*:?\s*$", re.I), 0.35),
    (re.compile(r"(?:by|before|until|no\s+later\s+than)\s+$", re.I), 0.30),
    (re.compile(r"(?:closes?|ends?)\s+$", re.I), 0.25),
    (re.compile(r"(?:program|cohort)\s+(?:start[s]?|begin[s]?)\s*:?\s*$", re.I), 0.12),
]

# ---------------------------------------------------------------------------
# Status signal patterns
# ---------------------------------------------------------------------------
_STATUS_SIGNALS: List[Tuple[re.Pattern, float, str]] = [
    # ROLLING
    (re.compile(r"rolling\s+(?:basis\s+)?applications?", re.I), 0.95, "ROLLING"),
    (re.compile(r"apply\s+any\s*time", re.I), 0.92, "ROLLING"),
    (re.compile(r"no\s+(?:set\s+)?(?:application\s+)?deadline", re.I), 0.90, "ROLLING"),
    (re.compile(r"ongoing\s+(?:investment\s+)?(?:process|applications?)", re.I), 0.88, "ROLLING"),
    (re.compile(r"continuously?\s+(?:accepting|reviewing)\s+applications?", re.I), 0.87, "ROLLING"),
    # CLOSED
    (re.compile(r"applications?\s+(?:are\s+)?(?:now\s+)?closed", re.I), 0.95, "CLOSED"),
    (re.compile(r"no\s+longer\s+accepting\s+applications?", re.I), 0.95, "CLOSED"),
    (re.compile(r"this\s+(?:cohort|program|round)\s+(?:is\s+)?closed", re.I), 0.93, "CLOSED"),
    (re.compile(r"applications?\s+(?:have\s+)?closed", re.I), 0.92, "CLOSED"),
    (re.compile(r"deadline\s+(?:has\s+)?passed", re.I), 0.90, "CLOSED"),
    # CLOSING_SOON
    (re.compile(r"closing\s+soon", re.I), 0.90, "CLOSING_SOON"),
    (re.compile(r"last\s+(?:chance|call|day[s]?)\s+to\s+apply", re.I), 0.90, "CLOSING_SOON"),
    (re.compile(r"applications?\s+clos(?:e|ing)\s+(?:this|next)\s+(?:week|few\s+days)", re.I), 0.88, "CLOSING_SOON"),
    (re.compile(r"final\s+(?:call|deadline|day[s]?)", re.I), 0.83, "CLOSING_SOON"),
    (re.compile(r"(?:spots?\s+are\s+)?(?:limited|filling\s+(?:fast|up))", re.I), 0.70, "CLOSING_SOON"),
    # UPCOMING
    (re.compile(r"applications?\s+(?:will\s+)?open\s+soon", re.I), 0.92, "UPCOMING"),
    (re.compile(r"(?:next\s+)?cohort\s+(?:is\s+)?(?:coming|announced|planned|confirmed)", re.I), 0.88, "UPCOMING"),
    (re.compile(r"opening\s+(?:in\s+)?\d+\s+(?:days?|weeks?|months?)", re.I), 0.85, "UPCOMING"),
    (re.compile(r"coming\s+soon", re.I), 0.68, "UPCOMING"),
    (re.compile(r"stay\s+tuned", re.I), 0.52, "UPCOMING"),
    # OPEN
    (re.compile(r"applications?\s+(?:are\s+)?(?:now\s+)?open", re.I), 0.93, "OPEN"),
    (re.compile(r"now\s+accepting\s+applications?", re.I), 0.92, "OPEN"),
    (re.compile(r"open\s+for\s+applications?", re.I), 0.90, "OPEN"),
    (re.compile(r"accepting\s+applications?", re.I), 0.85, "OPEN"),
    (re.compile(r"apply\s+now", re.I), 0.72, "OPEN"),
    (re.compile(r"start\s+(?:your\s+)?application", re.I), 0.68, "OPEN"),
    (re.compile(r"submit\s+(?:your\s+)?application", re.I), 0.65, "OPEN"),
]

# ---------------------------------------------------------------------------
# Money patterns
# ---------------------------------------------------------------------------
_MONEY_RANGE_RE = re.compile(
    r"(?:USD\s*|US\$|\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*"
    r"(K|M|B|thousand|million|billion)?"
    r"\s*(?:to|[-\u2013\u2014])\s*"
    r"(?:USD\s*|US\$|\$)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*"
    r"(K|M|B|thousand|million|billion)?",
    re.I,
)
_MONEY_SINGLE_RE = re.compile(
    r"(?:USD\s*|US\$|\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*"
    r"(K|M|B|thousand|million|billion)?",
    re.I,
)
_MULTIPLIERS: Dict[str, float] = {
    "k": 1_000, "m": 1_000_000, "b": 1_000_000_000,
    "thousand": 1_000, "million": 1_000_000, "billion": 1_000_000_000,
}

# ---------------------------------------------------------------------------
# Equity patterns
# ---------------------------------------------------------------------------
_EQUITY_PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*(?:equity|stake|ownership|dilution)", re.I)
_EQUITY_FREE_RE = re.compile(
    r"(?:equity[- ]free|0\s*%\s*equity|no\s*equity\s*(?:taken)?|non[- ]dilutive)", re.I
)

# ---------------------------------------------------------------------------
# List / section patterns for benefits and eligibility
# ---------------------------------------------------------------------------
_LIST_ITEM_RE = re.compile(
    r"(?:^|\n)\s*(?:[•·\u25aa\u25e6\u2023\u2043*\-\u2013\u2014]|\d+[.):])\s*(.{15,250})",
    re.MULTILINE,
)
_BENEFITS_SECTION_RE = re.compile(
    r"(?:what\s+you(?:'ll)?\s+(?:get|receive|gain)|benefits?|perks?|"
    r"program\s+(?:includes?|offers?)|why\s+apply|what\s+we\s+offer)",
    re.I,
)
_ELIGIBILITY_SECTION_RE = re.compile(
    r"(?:eligib(?:ility|le)|who\s+(?:can|should|is|qualifies?)\s+apply|"
    r"requirements?|criteria|ideal\s+(?:candidate|founder|applicant)|"
    r"we\s+(?:are\s+)?looking\s+for)",
    re.I,
)

# ---------------------------------------------------------------------------
# Stable-hash stripping
# ---------------------------------------------------------------------------
_STRIP_DYNAMIC_RE = re.compile(
    r"<(?:script|style|noscript)(?:\s[^>]*)?>.*?</(?:script|style|noscript)>"
    r"|<!--.*?-->"
    r'|\bdata-(?:timestamp|time|nonce|cache)[^\s>]*="[^"]*"'
    r"|currentTime\b[^;]*;",
    re.DOTALL | re.I,
)


# ---------------------------------------------------------------------------
# Data transfer objects
# ---------------------------------------------------------------------------

@dataclass
class FetchResult:
    """Outcome of a single HTTP fetch attempt."""
    url: str
    status_code: int
    content_hash: str
    raw_html: str
    text_content: str
    fetch_duration_ms: int
    fetch_method: str       # "requests" | "urllib" | "rss" | "failed"
    error: Optional[str] = None
    retrieved_at: str = ""
    is_rss: bool = False
    is_sitemap: bool = False

    @property
    def ok(self) -> bool:
        return self.status_code == 200


@dataclass
class ExtractedSignal:
    """A single extracted data signal with full provenance."""
    value: Any
    confidence: float
    evidence_snippet: str
    extraction_method: str   # "json_ld"|"og_meta"|"rss"|"regex_context"|"regex_plain"|"heuristic"
    source_url: str
    retrieved_at: str = ""

    def is_reliable(self, threshold: float = _MIN_SIGNAL_CONFIDENCE) -> bool:
        return self.confidence >= threshold


@dataclass
class ParsedOpportunitySignals:
    """All intelligence signals extracted from a fetched page (or merged set of pages)."""
    organization: str
    source_url: str
    retrieved_at: str

    application_deadline: Optional[ExtractedSignal] = None
    cohort_start_date: Optional[ExtractedSignal] = None
    status: Optional[ExtractedSignal] = None
    funding_min_usd: Optional[ExtractedSignal] = None
    funding_max_usd: Optional[ExtractedSignal] = None
    equity_terms: Optional[ExtractedSignal] = None
    description: Optional[ExtractedSignal] = None
    key_benefits: Optional[ExtractedSignal] = None       # value is List[str]
    eligibility_criteria: Optional[ExtractedSignal] = None  # value is List[str]
    cohort_year_ref: Optional[ExtractedSignal] = None

    overall_confidence: float = 0.0
    extraction_warnings: List[str] = field(default_factory=list)

    # Raw structured blobs preserved for audit
    json_ld_data: Optional[Dict[str, Any]] = None
    og_data: Optional[Dict[str, str]] = None
    rss_items: Optional[List[Dict[str, str]]] = None

    # All URLs that contributed signals
    contributing_urls: List[str] = field(default_factory=list)
    # The primary page content hash (for change detection storage)
    primary_content_hash: str = ""

    @property
    def has_useful_signals(self) -> bool:
        return any([
            self.application_deadline,
            self.status,
            self.funding_min_usd,
            self.funding_max_usd,
            self.equity_terms,
        ])

    def to_audit_dict(self) -> Dict[str, Any]:
        """Full provenance serialised for source_quote_evidence storage."""

        def _sig(s: Optional[ExtractedSignal]) -> Optional[Dict]:
            if s is None:
                return None
            return {
                "value": str(s.value),
                "confidence": round(s.confidence, 4),
                "evidence_snippet": s.evidence_snippet[:300],
                "extraction_method": s.extraction_method,
                "source_url": s.source_url,
                "retrieved_at": s.retrieved_at,
            }

        return {
            "overall_confidence": self.overall_confidence,
            "contributing_urls": self.contributing_urls,
            "extracted_at": self.retrieved_at,
            "signals": {
                "status": _sig(self.status),
                "application_deadline": _sig(self.application_deadline),
                "cohort_start_date": _sig(self.cohort_start_date),
                "funding_min_usd": _sig(self.funding_min_usd),
                "funding_max_usd": _sig(self.funding_max_usd),
                "equity_terms": _sig(self.equity_terms),
                "description": _sig(self.description),
                "key_benefits": _sig(self.key_benefits),
                "eligibility_criteria": _sig(self.eligibility_criteria),
            },
            "warnings": self.extraction_warnings,
        }


# ---------------------------------------------------------------------------
# Core fetcher
# ---------------------------------------------------------------------------

class SourceFetcher:
    """
    Fetches and parses funding opportunity pages from official source URLs.

    Primary entry point::

        signals = SourceFetcher.fetch_and_parse(source)
        if signals.has_useful_signals:
            # apply signals to opportunity baseline data

    Change-detection integration::

        result = SourceFetcher.fetch(source)
        if SourceFetcher.page_has_changed(source, result.content_hash):
            signals = SourceFetcher.parse_signals(result, source)
    """

    # -----------------------------------------------------------------------
    # Primary entry point
    # -----------------------------------------------------------------------

    @classmethod
    def fetch_and_parse(cls, source: Any) -> ParsedOpportunitySignals:
        """
        Full pipeline: multi-page crawl + RSS + signal merge.
        Never raises — always returns a ParsedOpportunitySignals (possibly empty).
        """
        from django.utils import timezone
        retrieved_at = timezone.now().isoformat()

        try:
            all_results = cls.fetch_multi(source)

            # Attempt RSS as supplementary source
            try:
                rss = cls.fetch_rss(source)
                if rss and rss.ok:
                    all_results.append(rss)
            except Exception as exc:
                logger.debug("[fetcher] RSS fetch failed for %s: %s", source.organization, exc)

            if not all_results:
                sig = ParsedOpportunitySignals(
                    organization=source.organization,
                    source_url=getattr(source, "base_url", "") or "",
                    retrieved_at=retrieved_at,
                )
                sig.extraction_warnings.append("all_fetch_strategies_failed")
                return sig

            per_page: List[ParsedOpportunitySignals] = []
            for result in all_results:
                if result.ok:
                    try:
                        per_page.append(cls.parse_signals(result, source))
                    except Exception as exc:
                        logger.warning(
                            "[fetcher] parse_signals error %s: %s",
                            result.url, exc, exc_info=True,
                        )

            if not per_page:
                sig = ParsedOpportunitySignals(
                    organization=source.organization,
                    source_url=getattr(source, "base_url", "") or "",
                    retrieved_at=retrieved_at,
                )
                sig.extraction_warnings.append("parse_failed_all_pages")
                return sig

            merged = cls.merge_multi_page_signals(per_page)
            # Store primary page hash (first successful non-RSS result)
            for r in all_results:
                if r.ok and not r.is_rss and r.content_hash:
                    merged.primary_content_hash = r.content_hash
                    break
            return merged

        except Exception as exc:
            logger.error(
                "[fetcher] fetch_and_parse critical failure for %s: %s",
                getattr(source, "organization", "?"), exc, exc_info=True,
            )
            sig = ParsedOpportunitySignals(
                organization=getattr(source, "organization", "unknown"),
                source_url=getattr(source, "base_url", "") or "",
                retrieved_at=retrieved_at,
            )
            sig.extraction_warnings.append(f"critical_fetch_failure:{type(exc).__name__}")
            return sig

    # -----------------------------------------------------------------------
    # Fetch methods
    # -----------------------------------------------------------------------

    @classmethod
    def fetch(cls, source: Any) -> FetchResult:
        """Single page GET with retry/backoff and UA rotation."""
        from django.utils import timezone
        url = getattr(source, "base_url", "") or getattr(source, "application_url", "")
        retrieved_at = timezone.now().isoformat()

        if not url:
            return cls._failed_result("", "No URL configured", retrieved_at)

        headers = cls._build_headers()
        t0 = time.monotonic()

        result = (
            cls._fetch_with_requests(url, headers, retrieved_at)
            if _HAS_REQUESTS
            else cls._fetch_with_urllib(url, headers, retrieved_at)
        )
        result.fetch_duration_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "[fetcher] fetch(%s) => %d in %dms via %s",
            url, result.status_code, result.fetch_duration_ms, result.fetch_method,
        )
        return result

    @classmethod
    def fetch_multi(cls, source: Any) -> List[FetchResult]:
        """
        Multi-page crawl:
          1. base_url
          2. application_url (if different)
          3. Relevant sub-pages discovered from base page
          4. Sitemap-discovered program pages
        """
        from django.utils import timezone
        retrieved_at = timezone.now().isoformat()
        results: List[FetchResult] = []
        seen: set = set()

        def _get(url: str) -> Optional[FetchResult]:
            url = url.strip().rstrip("/")
            if not url or url in seen:
                return None
            seen.add(url)
            hdrs = cls._build_headers()
            r = (
                cls._fetch_with_requests(url, hdrs, retrieved_at)
                if _HAS_REQUESTS
                else cls._fetch_with_urllib(url, hdrs, retrieved_at)
            )
            if r.ok:
                results.append(r)
                return r
            logger.debug("[fetcher] %s returned %d", url, r.status_code)
            return None

        base_url = getattr(source, "base_url", "") or ""
        app_url = getattr(source, "application_url", "") or ""

        base_result = _get(base_url)

        if app_url and app_url != base_url:
            _get(app_url)

        # Sub-page discovery
        if base_result and base_result.raw_html:
            sub_urls = cls._discover_subpages(base_result.raw_html, base_url)
            for u in sub_urls[:_SUBPAGE_CRAWL_LIMIT]:
                _get(u)
                time.sleep(_POLITE_CRAWL_DELAY_S)

        # Sitemap discovery
        for sm_url in cls._discover_from_sitemap(base_url, seen)[:2]:
            _get(sm_url)
            time.sleep(_POLITE_CRAWL_DELAY_S)

        logger.info(
            "[fetcher] fetch_multi(%s) crawled %d page(s)",
            getattr(source, "organization", "?"), len(results),
        )
        return results

    @classmethod
    def fetch_rss(cls, source: Any) -> Optional[FetchResult]:
        """Probe common RSS/Atom feed paths and return the first valid feed."""
        from django.utils import timezone
        retrieved_at = timezone.now().isoformat()
        base = getattr(source, "base_url", "") or ""
        if not base:
            return None

        parsed = urllib.parse.urlparse(base)
        origin = f"{parsed.scheme}://{parsed.netloc}"

        candidates: List[str] = []
        rss_url = getattr(source, "rss_url", None)
        if rss_url:
            candidates.append(rss_url)
        candidates.extend(origin + p for p in _COMMON_RSS_PATHS)

        hdrs = {**_RSS_HEADERS, "User-Agent": random.choice(_USER_AGENTS)}

        for url in candidates:
            try:
                raw = cls._raw_get(url, hdrs, timeout=10)
                if raw and ("<rss" in raw[:200] or "<feed" in raw[:200] or "<channel" in raw[:500]):
                    text = cls._extract_rss_text(raw)
                    return FetchResult(
                        url=url,
                        status_code=200,
                        content_hash=cls.normalize_and_hash(raw),
                        raw_html=raw,
                        text_content=text,
                        fetch_duration_ms=0,
                        fetch_method="rss",
                        retrieved_at=retrieved_at,
                        is_rss=True,
                    )
            except Exception:
                continue
        return None

    # -----------------------------------------------------------------------
    # Signal parsing
    # -----------------------------------------------------------------------

    @classmethod
    def parse_signals(cls, result: FetchResult, source: Any) -> ParsedOpportunitySignals:
        """Full multi-strategy extraction pipeline on a single FetchResult."""
        from django.utils import timezone
        retrieved_at = timezone.now().isoformat()

        sig = ParsedOpportunitySignals(
            organization=getattr(source, "organization", ""),
            source_url=result.url,
            retrieved_at=retrieved_at,
        )
        sig.contributing_urls.append(result.url)

        if not result.ok or not result.raw_html:
            sig.extraction_warnings.append("fetch_failed_or_empty")
            return sig

        # RSS path
        if result.is_rss:
            cls._parse_rss_signals(result, sig)
            sig.overall_confidence = cls._compute_overall_confidence(sig)
            return sig

        # HTML path — build soup + text
        soup = None
        if _HAS_BS4:
            try:
                soup = BeautifulSoup(
                    result.raw_html,
                    "lxml" if _is_lxml_available() else "html.parser",
                )
                result.text_content = extract_text_from_soup(soup)
            except Exception:
                result.text_content = cls._strip_tags(result.raw_html)
        if not result.text_content:
            result.text_content = cls._strip_tags(result.raw_html)

        text = result.text_content or ""

        # Layer 1: JSON-LD
        if soup:
            ld = cls._extract_json_ld(soup, result.url)
            if ld:
                sig.json_ld_data = ld
                cls._apply_json_ld_signals(ld, sig, result.url, retrieved_at)

        # Layer 2: OG / meta
        if soup:
            og = cls._extract_og_meta(soup, result.url)
            if og:
                sig.og_data = og
                cls._apply_og_signals(og, sig, result.url, retrieved_at)

        # Layer 3: Regex / context
        if text:
            cls._apply_regex_signals(text, sig, result.url, retrieved_at, soup)

        # Heuristic fallback for JS-heavy thin pages
        if len(text) < 200:
            sig.extraction_warnings.append("thin_text_possible_js_heavy_page")
            cls._apply_anchor_heuristics(result.raw_html, sig, result.url, retrieved_at)

        sig.overall_confidence = cls._compute_overall_confidence(sig)
        logger.info(
            "[fetcher] %s parsed from %s | confidence=%.2f status=%s deadline=%s",
            getattr(source, "organization", "?"), result.url, sig.overall_confidence,
            sig.status.value if sig.status else "N/A",
            sig.application_deadline.value if sig.application_deadline else "N/A",
        )
        return sig

    @classmethod
    def _apply_regex_signals(
        cls,
        text: str,
        sig: ParsedOpportunitySignals,
        url: str,
        retrieved_at: str,
        soup: Any,
    ) -> None:
        """Apply all regex-based extractors to text."""
        # Status
        s = cls._extract_status(text, url, retrieved_at)
        if s and (not sig.status or s.confidence > sig.status.confidence):
            sig.status = s

        # Deadline
        d = cls._extract_deadline(text, url, retrieved_at)
        if d and (not sig.application_deadline or d.confidence > sig.application_deadline.confidence):
            sig.application_deadline = d

        # Money
        mn, mx = cls._extract_money(text, url, retrieved_at)
        if mn and (not sig.funding_min_usd or mn.confidence > sig.funding_min_usd.confidence):
            sig.funding_min_usd = mn
        if mx and (not sig.funding_max_usd or mx.confidence > sig.funding_max_usd.confidence):
            sig.funding_max_usd = mx

        # Equity
        if not sig.equity_terms:
            eq = cls._extract_equity(text, url, retrieved_at)
            if eq:
                sig.equity_terms = eq

        # Benefits
        if not sig.key_benefits:
            ben = cls._extract_section_list(text, soup, _BENEFITS_SECTION_RE, url, retrieved_at, "key_benefits")
            if ben:
                sig.key_benefits = ben

        # Eligibility
        if not sig.eligibility_criteria:
            elig = cls._extract_section_list(text, soup, _ELIGIBILITY_SECTION_RE, url, retrieved_at, "eligibility")
            if elig:
                sig.eligibility_criteria = elig

        # Description
        if not sig.description:
            desc = cls._extract_description(text, soup, url, retrieved_at)
            if desc:
                sig.description = desc

        # Cohort reference
        if not sig.cohort_year_ref:
            cy = cls._extract_cohort_ref(text, url, retrieved_at)
            if cy:
                sig.cohort_year_ref = cy

    # -----------------------------------------------------------------------
    # Merge across pages
    # -----------------------------------------------------------------------

    @classmethod
    def merge_multi_page_signals(
        cls, pages: List[ParsedOpportunitySignals]
    ) -> ParsedOpportunitySignals:
        """Fuse signals from multiple pages. Best-confidence wins per field."""
        if not pages:
            raise ValueError("merge_multi_page_signals requires at least one signals object")
        if len(pages) == 1:
            return pages[0]

        merged = pages[0]
        all_urls: List[str] = list(merged.contributing_urls)

        def _better(
            existing: Optional[ExtractedSignal], candidate: Optional[ExtractedSignal]
        ) -> bool:
            if candidate is None:
                return False
            if existing is None:
                return True
            return candidate.confidence > existing.confidence

        for page in pages[1:]:
            all_urls.extend(page.contributing_urls)
            if _better(merged.application_deadline, page.application_deadline):
                merged.application_deadline = page.application_deadline
            if _better(merged.cohort_start_date, page.cohort_start_date):
                merged.cohort_start_date = page.cohort_start_date
            if _better(merged.status, page.status):
                merged.status = page.status
            if _better(merged.funding_min_usd, page.funding_min_usd):
                merged.funding_min_usd = page.funding_min_usd
            if _better(merged.funding_max_usd, page.funding_max_usd):
                merged.funding_max_usd = page.funding_max_usd
            if _better(merged.equity_terms, page.equity_terms):
                merged.equity_terms = page.equity_terms
            if _better(merged.description, page.description):
                merged.description = page.description
            if _better(merged.key_benefits, page.key_benefits):
                merged.key_benefits = page.key_benefits
            if _better(merged.eligibility_criteria, page.eligibility_criteria):
                merged.eligibility_criteria = page.eligibility_criteria
            if _better(merged.cohort_year_ref, page.cohort_year_ref):
                merged.cohort_year_ref = page.cohort_year_ref
            if merged.json_ld_data is None and page.json_ld_data:
                merged.json_ld_data = page.json_ld_data
            if page.rss_items:
                merged.rss_items = (merged.rss_items or []) + page.rss_items
            merged.extraction_warnings.extend(page.extraction_warnings)

        # Deduplicate preserving order
        merged.contributing_urls = list(dict.fromkeys(all_urls))
        merged.overall_confidence = cls._compute_overall_confidence(merged)
        return merged

    # -----------------------------------------------------------------------
    # Content hashing & change detection
    # -----------------------------------------------------------------------

    @classmethod
    def normalize_and_hash(cls, html: str) -> str:
        """
        SHA-256 of stable page content (scripts, timestamps, nonces removed).
        Only changes when meaningful content changes.
        """
        normalized = _STRIP_DYNAMIC_RE.sub("", html)
        normalized = re.sub(r"\s+", " ", normalized).strip().lower()
        return hashlib.sha256(normalized.encode("utf-8", errors="replace")).hexdigest()

    @classmethod
    def page_has_changed(cls, source: Any, new_hash: str) -> bool:
        """
        Compare new_hash against the source's stored last_page_hash.
        Returns True when content changed or no prior hash is stored.
        """
        old_hash = (getattr(source, "last_page_hash", "") or "").strip()
        changed = old_hash != new_hash
        if not changed:
            logger.debug(
                "[fetcher] page_has_changed(%s) = False — hash unchanged",
                getattr(source, "organization", "?"),
            )
        return changed

    # -----------------------------------------------------------------------
    # Private: HTTP
    # -----------------------------------------------------------------------

    @classmethod
    def _build_headers(cls) -> Dict[str, str]:
        return {**_BASE_HEADERS, "User-Agent": random.choice(_USER_AGENTS)}

    @classmethod
    def _raw_get(cls, url: str, headers: Dict, timeout: int = 10) -> str:
        """Minimal raw GET returning text. Used for RSS / sitemap probing."""
        if _HAS_REQUESTS:
            r = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
            if r.status_code == 200:
                return r.text
            return ""
        # urllib path: strip Accept-Encoding to avoid compressed bytes being decoded as text
        safe_headers = {
            k: v for k, v in headers.items()
            if k.lower() != "accept-encoding"
        }
        safe_headers["Accept-Encoding"] = "identity"
        req = urllib.request.Request(url, headers=safe_headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw_bytes = resp.read(512 * 1024)

            content_encoding = (
                resp.headers.get("Content-Encoding", "")
                or resp.headers.get("content-encoding", "")
            ).lower().strip()
            if content_encoding == "gzip" or raw_bytes[:2] == b"\x1f\x8b":
                import gzip as _gzip
                try:
                    raw_bytes = _gzip.decompress(raw_bytes)
                except Exception:
                    pass
            elif content_encoding == "deflate":
                import zlib as _zlib
                try:
                    raw_bytes = _zlib.decompress(raw_bytes)
                except Exception:
                    try:
                        raw_bytes = _zlib.decompress(raw_bytes, -15)
                    except Exception:
                        pass

            charset = "utf-8"
            ct = resp.headers.get("Content-Type", "") or ""
            if "charset=" in ct:
                declared = ct.split("charset=")[-1].split(";")[0].strip().strip('"')
                if declared:
                    charset = declared
            return raw_bytes.decode(charset, errors="replace")

    @classmethod
    def _fetch_with_requests(cls, url: str, headers: Dict, retrieved_at: str) -> FetchResult:
        session = requests.Session()
        retry = Retry(
            total=_RETRY_MAX,
            backoff_factor=_RETRY_BACKOFF_FACTOR,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        try:
            resp = session.get(
                url, headers=headers, timeout=_FETCH_TIMEOUT_S,
                allow_redirects=True, stream=True,
            )
            buf = b""
            for chunk in resp.iter_content(chunk_size=65536):
                buf += chunk
                if len(buf) >= _MAX_CONTENT_BYTES:
                    break
            resp.close()
            session.close()

            raw_html = buf.decode("utf-8", errors="replace")
            return FetchResult(
                url=resp.url or url,
                status_code=resp.status_code,
                content_hash=cls.normalize_and_hash(raw_html),
                raw_html=raw_html,
                text_content="",
                fetch_duration_ms=0,
                fetch_method="requests",
                retrieved_at=retrieved_at,
            )
        except Exception as exc:
            logger.debug("[fetcher] requests failed for %s: %s — retrying urllib", url, exc)
            return cls._fetch_with_urllib(url, headers, retrieved_at)

    @classmethod
    def _fetch_with_urllib(cls, url: str, headers: Dict, retrieved_at: str) -> FetchResult:
        try:
            # urllib does NOT auto-decompress — strip the Accept-Encoding header so
            # the server returns plain text, avoiding gzip/brotli mojibake when the
            # requests library is unavailable.
            safe_headers = {
                k: v for k, v in headers.items()
                if k.lower() != "accept-encoding"
            }
            safe_headers["Accept-Encoding"] = "identity"  # explicitly request no compression

            req = urllib.request.Request(url, headers=safe_headers)
            with urllib.request.urlopen(req, timeout=_FETCH_TIMEOUT_S) as resp:
                raw_bytes: bytes = resp.read(_MAX_CONTENT_BYTES)

                # Defensive decompression: even with identity requested, some
                # servers still return compressed content (misconfigured CDNs).
                # Detect and decompress transparently so we never store raw bytes.
                content_encoding = (
                    resp.headers.get("Content-Encoding", "")
                    or resp.headers.get("content-encoding", "")
                ).lower().strip()

                if content_encoding == "gzip" or (
                    raw_bytes[:2] == b"\x1f\x8b"  # gzip magic bytes
                ):
                    import gzip as _gzip
                    try:
                        raw_bytes = _gzip.decompress(raw_bytes)
                    except Exception as decomp_exc:
                        logger.warning(
                            "[fetcher] gzip decompression failed for %s: %s", url, decomp_exc
                        )

                elif content_encoding == "deflate":
                    import zlib as _zlib
                    try:
                        # Try both with and without the zlib header
                        try:
                            raw_bytes = _zlib.decompress(raw_bytes)
                        except _zlib.error:
                            raw_bytes = _zlib.decompress(raw_bytes, -15)
                    except Exception as decomp_exc:
                        logger.warning(
                            "[fetcher] deflate decompression failed for %s: %s", url, decomp_exc
                        )

                elif content_encoding == "br":
                    # Brotli requires the brotli package; if not available, fall back to
                    # re-fetching without any encoding preference rather than storing garbage.
                    try:
                        import brotli as _brotli  # type: ignore[import]
                        raw_bytes = _brotli.decompress(raw_bytes)
                    except ImportError:
                        logger.debug(
                            "[fetcher] brotli not installed — re-requesting %s without compression",
                            url,
                        )
                        # Re-request without Accept-Encoding to avoid brotli
                        plain_headers = dict(safe_headers)
                        plain_headers.pop("Accept-Encoding", None)
                        plain_req = urllib.request.Request(url, headers=plain_headers)
                        with urllib.request.urlopen(plain_req, timeout=_FETCH_TIMEOUT_S) as plain_resp:
                            raw_bytes = plain_resp.read(_MAX_CONTENT_BYTES)

                # Detect charset from Content-Type header
                charset = "utf-8"
                content_type = (
                    resp.headers.get("Content-Type", "")
                    or resp.headers.get("content-type", "")
                )
                if "charset=" in content_type:
                    declared = content_type.split("charset=")[-1].split(";")[0].strip().strip('"')
                    if declared:
                        charset = declared

                raw_html = raw_bytes.decode(charset, errors="replace")

            return FetchResult(
                url=url,
                status_code=200,
                content_hash=cls.normalize_and_hash(raw_html),
                raw_html=raw_html,
                text_content=cls._strip_tags(raw_html),
                fetch_duration_ms=0,
                fetch_method="urllib",
                retrieved_at=retrieved_at,
            )
        except (urllib.error.HTTPError,) as exc:
            return cls._failed_result(url, str(exc), retrieved_at, exc.code)
        except (urllib.error.URLError, socket.timeout, OSError) as exc:
            return cls._failed_result(url, str(exc), retrieved_at)
        except Exception as exc:
            return cls._failed_result(url, str(exc), retrieved_at)

    @classmethod
    def _failed_result(
        cls, url: str, error: str, retrieved_at: str, status_code: int = 0
    ) -> FetchResult:
        return FetchResult(
            url=url, status_code=status_code, content_hash="",
            raw_html="", text_content="", fetch_duration_ms=0,
            fetch_method="failed", error=error, retrieved_at=retrieved_at,
        )

    # -----------------------------------------------------------------------
    # Private: Sub-page discovery
    # -----------------------------------------------------------------------

    @classmethod
    def _discover_subpages(cls, raw_html: str, base_url: str) -> List[str]:
        """
        Find relevant sub-page URLs from the base page.
        Uses anchor href + text pattern matching.
        Returns absolute deduplicated URLs, same domain only.
        """
        urls: List[str] = []
        seen: set = set()
        parsed_base = urllib.parse.urlparse(base_url)
        base_domain = parsed_base.netloc

        # Match <a href="..."> tags
        href_re = re.compile(r'<a\s[^>]*href=["\']([^"\'#?][^"\']*)["\'][^>]*>(.*?)</a>', re.I | re.S)
        for m in href_re.finditer(raw_html):
            href = m.group(1).strip()
            anchor_text = re.sub(r"<[^>]+>", "", m.group(2)).strip()

            if not _SUBPAGE_HREF_RE.search(href) and not _SUBPAGE_HREF_RE.search(anchor_text):
                continue

            abs_url = urllib.parse.urljoin(base_url, href)
            parsed = urllib.parse.urlparse(abs_url)

            # Same domain only, skip files / anchors
            if (
                parsed.netloc != base_domain
                or abs_url in seen
                or any(abs_url.endswith(ext) for ext in (".pdf", ".png", ".jpg", ".zip"))
                or parsed.fragment
            ):
                continue

            seen.add(abs_url)
            urls.append(abs_url)

        return urls

    @classmethod
    def _discover_from_sitemap(cls, base_url: str, already_seen: set) -> List[str]:
        """
        Probe known sitemap paths and return program-relevant URLs.
        """
        if not base_url:
            return []
        parsed = urllib.parse.urlparse(base_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        hdrs = {**_BASE_HEADERS, "User-Agent": random.choice(_USER_AGENTS)}
        urls: List[str] = []

        for path in _COMMON_SITEMAP_PATHS:
            sm_url = origin + path
            try:
                raw = cls._raw_get(sm_url, hdrs, timeout=8)
                if not raw or "<urlset" not in raw and "<sitemapindex" not in raw:
                    continue

                # Parse sitemap XML
                root = ET.fromstring(raw)
                ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
                for loc in root.findall(".//sm:loc", ns):
                    u = (loc.text or "").strip()
                    if u and u not in already_seen and _SUBPAGE_HREF_RE.search(u):
                        urls.append(u)
                        if len(urls) >= _SUBPAGE_CRAWL_LIMIT * 2:
                            break

                if urls:
                    logger.debug("[fetcher] sitemap found at %s, %d relevant URLs", sm_url, len(urls))
                    break
            except Exception:
                continue

        return urls

    # -----------------------------------------------------------------------
    # Private: RSS parsing
    # -----------------------------------------------------------------------

    @classmethod
    def _extract_rss_text(cls, raw: str) -> str:
        """Extract combined text from RSS/Atom items for regex signal extraction."""
        texts: List[str] = []
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            # Try stripping namespaces
            raw_clean = re.sub(r'\s+xmlns(?::\w+)?="[^"]+"', "", raw)
            try:
                root = ET.fromstring(raw_clean)
            except ET.ParseError:
                return ""

        # RSS 2.0
        for item in root.findall(".//item")[:_RSS_ITEM_LIMIT]:
            for tag in ("title", "description", "content:encoded", "summary"):
                el = item.find(tag)
                if el is not None and el.text:
                    texts.append(cls._strip_tags(el.text))

        # Atom
        for entry in root.findall(".//{http://www.w3.org/2005/Atom}entry")[:_RSS_ITEM_LIMIT]:
            for tag in (
                "{http://www.w3.org/2005/Atom}title",
                "{http://www.w3.org/2005/Atom}summary",
                "{http://www.w3.org/2005/Atom}content",
            ):
                el = entry.find(tag)
                if el is not None and el.text:
                    texts.append(cls._strip_tags(el.text))

        return " ".join(texts)

    @classmethod
    def _parse_rss_signals(cls, result: FetchResult, sig: ParsedOpportunitySignals) -> None:
        """Extract signals from an RSS FetchResult."""
        text = result.text_content or cls._extract_rss_text(result.raw_html)
        retrieved_at = sig.retrieved_at

        # Parse items for structured data
        items: List[Dict[str, str]] = []
        try:
            root = ET.fromstring(result.raw_html)
            for item in root.findall(".//item")[:_RSS_ITEM_LIMIT]:
                entry: Dict[str, str] = {}
                for tag in ("title", "link", "description", "pubDate"):
                    el = item.find(tag)
                    if el is not None and el.text:
                        entry[tag] = el.text.strip()
                if entry:
                    items.append(entry)
        except Exception:
            pass

        sig.rss_items = items

        if text:
            s = cls._extract_status(text, result.url, retrieved_at)
            if s:
                sig.status = s
            d = cls._extract_deadline(text, result.url, retrieved_at)
            if d:
                sig.application_deadline = d

        # RSS confirms we can at least say "has activity"
        if items and not sig.status:
            sig.status = ExtractedSignal(
                value="OPEN",
                confidence=0.67,
                evidence_snippet=f"RSS feed active with {len(items)} recent items",
                extraction_method="rss",
                source_url=result.url,
                retrieved_at=retrieved_at,
            )

    # -----------------------------------------------------------------------
    # Private: JSON-LD extraction
    # -----------------------------------------------------------------------

    @classmethod
    def _extract_json_ld(cls, soup: Any, url: str) -> Optional[Dict[str, Any]]:
        """Extract and return the most useful JSON-LD block from the page."""
        best: Optional[Dict] = None
        best_score = 0

        for tag in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(tag.string or "{}")
            except (json.JSONDecodeError, AttributeError):
                continue

            # Handle @graph array
            items = data.get("@graph", [data]) if isinstance(data, dict) else [data]
            for item in items:
                score = cls._score_json_ld_item(item)
                if score > best_score:
                    best_score = score
                    best = item

        return best

    @classmethod
    def _score_json_ld_item(cls, item: Any) -> int:
        if not isinstance(item, dict):
            return 0
        t = item.get("@type", "")
        score = 0
        if t in ("Event", "EducationalEvent", "BusinessEvent"):
            score += 10
        elif t in ("EducationalOccupationalProgram", "Course", "ProgramMembership"):
            score += 9
        elif t in ("Organization", "LocalBusiness"):
            score += 5
        elif t == "FAQPage":
            score += 4
        for key in ("startDate", "endDate", "validThrough", "applicationDeadline",
                    "offers", "price", "description", "name"):
            if key in item:
                score += 1
        return score

    @classmethod
    def _apply_json_ld_signals(
        cls,
        ld: Dict[str, Any],
        sig: ParsedOpportunitySignals,
        url: str,
        retrieved_at: str,
    ) -> None:
        """Apply JSON-LD fields to signal objects."""
        for field_name in ("applicationDeadline", "validThrough", "endDate"):
            raw_date = ld.get(field_name)
            if raw_date and isinstance(raw_date, str):
                parsed = cls._parse_date_string(raw_date)
                if parsed and cls._is_plausible_future_date(parsed):
                    sig.application_deadline = ExtractedSignal(
                        value=parsed, confidence=0.92,
                        evidence_snippet=f"JSON-LD {field_name}: {raw_date}",
                        extraction_method="json_ld",
                        source_url=url, retrieved_at=retrieved_at,
                    )
                    break

        start_raw = ld.get("startDate")
        if start_raw and isinstance(start_raw, str):
            parsed = cls._parse_date_string(start_raw)
            if parsed and cls._is_plausible_future_date(parsed):
                sig.cohort_start_date = ExtractedSignal(
                    value=parsed, confidence=0.90,
                    evidence_snippet=f"JSON-LD startDate: {start_raw}",
                    extraction_method="json_ld",
                    source_url=url, retrieved_at=retrieved_at,
                )

        desc = ld.get("description")
        if desc and isinstance(desc, str) and len(desc) > 50 and not sig.description:
            sig.description = ExtractedSignal(
                value=desc[:1000], confidence=0.85,
                evidence_snippet=desc[:200],
                extraction_method="json_ld",
                source_url=url, retrieved_at=retrieved_at,
            )

        offers = ld.get("offers")
        if isinstance(offers, dict):
            for price_key, target in (("lowPrice", "min"), ("price", "min"), ("highPrice", "max")):
                price = offers.get(price_key)
                if price:
                    try:
                        amount = float(str(price).replace(",", ""))
                        esig = ExtractedSignal(
                            value=amount, confidence=0.80,
                            evidence_snippet=f"JSON-LD offers.{price_key}: {price}",
                            extraction_method="json_ld",
                            source_url=url, retrieved_at=retrieved_at,
                        )
                        if target == "min":
                            sig.funding_min_usd = esig
                        else:
                            sig.funding_max_usd = esig
                    except ValueError:
                        pass

    # -----------------------------------------------------------------------
    # Private: OG / meta extraction
    # -----------------------------------------------------------------------

    @classmethod
    def _extract_og_meta(cls, soup: Any, url: str) -> Dict[str, str]:
        og: Dict[str, str] = {}
        for tag in soup.find_all("meta"):
            prop = tag.get("property", "") or tag.get("name", "")
            content = tag.get("content", "")
            if prop and content:
                og[str(prop)] = str(content)
        return og

    @classmethod
    def _apply_og_signals(
        cls, og: Dict[str, str], sig: ParsedOpportunitySignals, url: str, retrieved_at: str
    ) -> None:
        desc = (
            og.get("og:description")
            or og.get("description")
            or og.get("twitter:description")
        )
        if desc and len(desc) > 40 and not sig.description:
            sig.description = ExtractedSignal(
                value=desc[:1000], confidence=0.72,
                evidence_snippet=desc[:200],
                extraction_method="og_meta",
                source_url=url, retrieved_at=retrieved_at,
            )

    # -----------------------------------------------------------------------
    # Private: Regex signal extractors
    # -----------------------------------------------------------------------

    @classmethod
    def _extract_deadline(
        cls, text: str, url: str, retrieved_at: str
    ) -> Optional[ExtractedSignal]:
        """
        Extract application deadline using context-proximity scoring.
        Returns highest-confidence future date signal above threshold.
        """
        today = datetime.date.today()
        candidates: List[Tuple[float, datetime.date, str, str]] = []

        full_text = " ".join(re.split(r"(?<=[.!?\n])\s+", text))

        for pat in _DATE_PATTERNS:
            for m in pat.finditer(full_text):
                raw_match = m.group(0)
                parsed = cls._parse_date_string(raw_match)
                if not parsed or parsed <= today:
                    continue

                start = max(0, m.start() - 80)
                context_before = full_text[start:m.start()]

                base_conf = 0.50
                method = "regex_plain"
                best_bonus = 0.0
                best_snippet = ""

                for ctx_pat, bonus in _DEADLINE_CONTEXTS:
                    ctx_m = ctx_pat.search(context_before)
                    if ctx_m and bonus > best_bonus:
                        best_bonus = bonus
                        best_snippet = context_before[ctx_m.start():]
                        method = "regex_context"

                conf = min(0.98, base_conf + best_bonus)
                snippet = f"{best_snippet.strip()} {raw_match}".strip()
                candidates.append((conf, parsed, snippet, method))

        if not candidates:
            return None

        candidates.sort(key=lambda x: (-x[0], x[1]))
        best = candidates[0]
        if best[0] < _MIN_SIGNAL_CONFIDENCE:
            return None

        return ExtractedSignal(
            value=best[1], confidence=best[0],
            evidence_snippet=best[2][:300],
            extraction_method=best[3],
            source_url=url, retrieved_at=retrieved_at,
        )

    @classmethod
    def _extract_status(
        cls, text: str, url: str, retrieved_at: str
    ) -> Optional[ExtractedSignal]:
        """
        Detect funding program status using signal fusion:
        multiple pattern hits on the same status boost confidence via sqrt(n).
        """
        hits: Dict[str, List[Tuple[float, str]]] = {}

        for pattern, confidence, status_value in _STATUS_SIGNALS:
            for m in pattern.finditer(text):
                snippet = text[max(0, m.start() - 20):m.end() + 20].strip()
                hits.setdefault(status_value, []).append((confidence, snippet))

        if not hits:
            return None

        best_status = None
        best_score = 0.0
        best_snippet = ""

        for status_value, hit_list in hits.items():
            avg_conf = sum(h[0] for h in hit_list) / len(hit_list)
            fused = min(0.98, avg_conf * math.sqrt(len(hit_list)))
            if fused > best_score:
                best_score = fused
                best_status = status_value
                best_snippet = hit_list[0][1]

        if best_status is None or best_score < _MIN_SIGNAL_CONFIDENCE:
            return None

        return ExtractedSignal(
            value=best_status, confidence=best_score,
            evidence_snippet=best_snippet[:300],
            extraction_method="regex_context",
            source_url=url, retrieved_at=retrieved_at,
        )

    @classmethod
    def _extract_money(
        cls, text: str, url: str, retrieved_at: str
    ) -> Tuple[Optional[ExtractedSignal], Optional[ExtractedSignal]]:
        """Return (min_signal, max_signal) funding amount pair."""
        for m in _MONEY_RANGE_RE.finditer(text):
            snippet = text[max(0, m.start() - 30):m.end() + 30].strip()
            low = cls._parse_money_value(m.group(1), m.group(2))
            high = cls._parse_money_value(m.group(3), m.group(4))
            if low and high and low <= high:
                return (
                    ExtractedSignal(
                        value=low, confidence=0.82,
                        evidence_snippet=snippet,
                        extraction_method="regex_context",
                        source_url=url, retrieved_at=retrieved_at,
                    ),
                    ExtractedSignal(
                        value=high, confidence=0.82,
                        evidence_snippet=snippet,
                        extraction_method="regex_context",
                        source_url=url, retrieved_at=retrieved_at,
                    ),
                )

        amounts: List[float] = []
        for m in list(_MONEY_SINGLE_RE.finditer(text))[:10]:
            v = cls._parse_money_value(m.group(1), m.group(2))
            if v and v >= 1000:
                amounts.append(v)

        if not amounts:
            return None, None

        amounts.sort()
        snippet = f"Detected amounts: {amounts}"
        min_sig = ExtractedSignal(
            value=amounts[0], confidence=0.68,
            evidence_snippet=snippet,
            extraction_method="regex_plain",
            source_url=url, retrieved_at=retrieved_at,
        )
        max_sig = (
            ExtractedSignal(
                value=amounts[-1], confidence=0.68,
                evidence_snippet=snippet,
                extraction_method="regex_plain",
                source_url=url, retrieved_at=retrieved_at,
            )
            if len(amounts) > 1 else None
        )
        return min_sig, max_sig

    @classmethod
    def _extract_equity(
        cls, text: str, url: str, retrieved_at: str
    ) -> Optional[ExtractedSignal]:
        """Extract equity / dilution signal."""
        m = _EQUITY_FREE_RE.search(text)
        if m:
            snippet = text[max(0, m.start() - 20):m.end() + 30].strip()
            return ExtractedSignal(
                value="Equity-free (0% equity taken)", confidence=0.88,
                evidence_snippet=snippet,
                extraction_method="regex_context",
                source_url=url, retrieved_at=retrieved_at,
            )

        matches = list(_EQUITY_PCT_RE.finditer(text))
        if not matches:
            return None

        m = matches[0]
        pct = float(m.group(1))
        snippet = text[max(0, m.start() - 30):m.end() + 40].strip()
        return ExtractedSignal(
            value=f"{pct}% equity", confidence=0.78,
            evidence_snippet=snippet,
            extraction_method="regex_context",
            source_url=url, retrieved_at=retrieved_at,
        )

    @classmethod
    def _extract_section_list(
        cls,
        text: str,
        soup: Any,
        section_re: re.Pattern,
        url: str,
        retrieved_at: str,
        label: str,
    ) -> Optional[ExtractedSignal]:
        """
        Extract a list of items from a named section (benefits / eligibility).
        First tries BS4 list elements near the section header;
        falls back to regex on text.
        """
        items: List[str] = []

        # BS4 path: find the section header, then grab sibling <ul>/<ol> items
        if soup:
            try:
                header = soup.find(string=section_re)
                if header:
                    parent = header.find_parent()
                    if parent:
                        ul = parent.find_next(["ul", "ol"])
                        if ul:
                            for li in ul.find_all("li")[:10]:
                                txt = li.get_text(" ", strip=True)
                                if len(txt) > 10:
                                    items.append(txt)
            except Exception:
                pass

        # Regex fallback: find the section and grab list items below it
        if not items:
            m = section_re.search(text)
            if m:
                chunk = text[m.start():m.start() + 1200]
                for li_m in _LIST_ITEM_RE.finditer(chunk):
                    txt = li_m.group(1).strip()
                    if txt and len(txt) > 10:
                        items.append(txt)
                        if len(items) >= 8:
                            break

        if not items:
            return None

        return ExtractedSignal(
            value=items[:8],
            confidence=0.75,
            evidence_snippet="; ".join(items[:3]),
            extraction_method="regex_context",
            source_url=url, retrieved_at=retrieved_at,
        )

    @classmethod
    def _extract_description(
        cls,
        text: str,
        soup: Any,
        url: str,
        retrieved_at: str,
    ) -> Optional[ExtractedSignal]:
        """
        Extract best program description paragraph.
        Prefers BS4 <p> elements; falls back to longest clean text segment.
        """
        candidate = ""

        # BS4 path: first substantial <p> not matching boilerplate
        if soup:
            for p in soup.find_all("p"):
                txt = p.get_text(" ", strip=True)
                boilerplate_re = re.compile(
                    r"(?:cookie|privacy\s+policy|terms\s+of|copyright|all\s+rights|404)", re.I
                )
                if len(txt) >= 80 and not boilerplate_re.search(txt):
                    candidate = txt[:1200]
                    break

        # Regex fallback: split on double newlines, find longest clean segment
        if not candidate:
            segments = re.split(r"\n{2,}|\.\s{2,}", text)
            segments.sort(key=len, reverse=True)
            for seg in segments[:5]:
                seg = seg.strip()
                if len(seg) >= 80:
                    candidate = seg[:1200]
                    break

        if not candidate:
            return None

        return ExtractedSignal(
            value=candidate, confidence=0.70,
            evidence_snippet=candidate[:200],
            extraction_method="regex_plain",
            source_url=url, retrieved_at=retrieved_at,
        )

    @classmethod
    def _extract_cohort_ref(
        cls, text: str, url: str, retrieved_at: str
    ) -> Optional[ExtractedSignal]:
        """Extract cohort year / batch reference (e.g. '2026 cohort', 'W25 batch')."""
        patterns = [
            re.compile(r"\b(202[4-9]|203\d)\s+(?:cohort|batch|class|program)", re.I),
            re.compile(r"\b(?:W|S|F)(?:2[0-9])\s+(?:batch|cohort|class)", re.I),
            re.compile(r"\bcohort\s+(202[4-9]|203\d)\b", re.I),
        ]
        for pat in patterns:
            m = pat.search(text)
            if m:
                snippet = text[max(0, m.start() - 10):m.end() + 20].strip()
                return ExtractedSignal(
                    value=m.group(0), confidence=0.75,
                    evidence_snippet=snippet,
                    extraction_method="regex_plain",
                    source_url=url, retrieved_at=retrieved_at,
                )
        return None

    @classmethod
    def _apply_anchor_heuristics(
        cls,
        raw_html: str,
        sig: ParsedOpportunitySignals,
        url: str,
        retrieved_at: str,
    ) -> None:
        """
        Heuristic fallback for JS-heavy pages that return thin visible text.
        Extracts anchor text and visible non-tag text from raw HTML.
        """
        # Collect all anchor text
        anchor_re = re.compile(r'<a[^>]*>(.*?)</a>', re.I | re.S)
        anchor_texts = " ".join(
            re.sub(r"<[^>]+>", "", m.group(1)).strip()
            for m in anchor_re.finditer(raw_html)
        )

        # Also grab alt attributes and title attributes
        attr_re = re.compile(r'(?:alt|title|aria-label)=["\']([^"\']{10,200})["\']', re.I)
        attr_texts = " ".join(m.group(1) for m in attr_re.finditer(raw_html))

        combined = f"{anchor_texts} {attr_texts}"

        if not combined.strip():
            return

        if not sig.status:
            s = cls._extract_status(combined, url, retrieved_at)
            if s:
                s.confidence = min(s.confidence, 0.70)  # cap confidence for heuristic
                s.extraction_method = "heuristic"
                sig.status = s

        if not sig.application_deadline:
            d = cls._extract_deadline(combined, url, retrieved_at)
            if d:
                d.confidence = min(d.confidence, 0.65)
                d.extraction_method = "heuristic"
                sig.application_deadline = d

    # -----------------------------------------------------------------------
    # Private: utilities
    # -----------------------------------------------------------------------

    @classmethod
    def _parse_date_string(cls, raw: str) -> Optional[datetime.date]:
        if not raw:
            return None
        raw = raw.strip()

        if _HAS_DATEUTIL:
            try:
                return du_parser.parse(raw, dayfirst=False, yearfirst=True).date()
            except Exception:
                pass

        # ISO 8601 fallback
        try:
            return datetime.date.fromisoformat(raw[:10])
        except ValueError:
            pass

        month_map = {
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
            "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        }
        m = re.search(
            rf"({_MONTHS})\s+(\d{{1,2}}),?\s+(\d{{4}})",
            raw, re.I,
        )
        if m:
            month_num = month_map.get(m.group(1)[:3].lower())
            if month_num:
                try:
                    return datetime.date(int(m.group(3)), month_num, int(m.group(2)))
                except ValueError:
                    pass
        return None

    @classmethod
    def _is_plausible_future_date(cls, d: datetime.date) -> bool:
        today = datetime.date.today()
        return today < d <= today + datetime.timedelta(days=365 * 3)

    @classmethod
    def _parse_money_value(
        cls, amount_str: Optional[str], multiplier_str: Optional[str]
    ) -> Optional[float]:
        if not amount_str:
            return None
        try:
            amount = float(amount_str.replace(",", ""))
            if multiplier_str:
                amount *= _MULTIPLIERS.get(multiplier_str.lower(), 1)
            return amount
        except (ValueError, AttributeError):
            return None

    @classmethod
    def _strip_tags(cls, html: str) -> str:
        """Lightweight HTML -> plain text (used when BS4 unavailable)."""
        text = re.sub(
            r"<(?:script|style)[^>]*>.*?</(?:script|style)>", " ", html,
            flags=re.DOTALL | re.I,
        )
        text = re.sub(r"<[^>]+>", " ", text)
        entities = {
            "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ",
            "&quot;": '"', "&#39;": "'", "&apos;": "'",
        }
        for ent, rep in entities.items():
            text = text.replace(ent, rep)
        return re.sub(r"\s+", " ", text).strip()

    @classmethod
    def _compute_overall_confidence(cls, sig: ParsedOpportunitySignals) -> float:
        """
        Two-component confidence score:

        1. Precision  = weighted average confidence of FOUND signals
                        (denominator = weight of found slots only)
        2. Coverage   = fraction of total weight that was found
                        (penalises pages where we found very little)

        Final = precision * (0.60 + 0.40 * coverage)
             → A page where every found signal is high-confidence but only
               description was found scores ~0.50 instead of 0.07.
             → A page where all 6 slots are found at 0.90 scores ~0.90.
             → A page with zero signals scores 0.0.

        Minimum non-zero floor is 0.15 so the ingestion pipeline can still
        distinguish "something extracted" from "fetch completely failed".
        """
        slots = [
            (sig.status,               0.30),
            (sig.application_deadline, 0.25),
            (sig.funding_max_usd,      0.20),
            (sig.equity_terms,         0.10),
            (sig.description,          0.10),
            (sig.cohort_year_ref,      0.05),
        ]
        total_weight      = sum(w for _, w in slots)          # always 1.0
        found_slots       = [(s, w) for s, w in slots if s is not None]
        found_weight      = sum(w for _, w in found_slots)

        if not found_slots:
            return 0.0

        # Precision: average confidence weighted by slot importance
        precision = sum(s.confidence * w for s, w in found_slots) / found_weight

        # Coverage: what fraction of the importance budget was found
        coverage = found_weight / total_weight

        # Combined: precision is primary, coverage modulates it
        combined = precision * (0.60 + 0.40 * coverage)

        # Minimum floor for "something was extracted"
        combined = max(0.15, combined)

        return round(min(1.0, combined), 3)


# ---------------------------------------------------------------------------
# BS4 utilities
# ---------------------------------------------------------------------------

def extract_text_from_soup(soup: Any) -> str:
    """Extract clean readable text from a BeautifulSoup tree."""
    for tag in soup.find_all(["script", "style", "noscript", "nav", "footer", "header", "aside"]):
        tag.decompose()
    return " ".join(soup.stripped_strings)


def _is_lxml_available() -> bool:
    try:
        import lxml  # noqa: F401
        return True
    except ImportError:
        return False
