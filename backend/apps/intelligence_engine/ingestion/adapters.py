"""
apps.intelligence_engine.ingestion.adapters
============================================
Fetch adapters — one per source strategy.

Priority dispatch order (use the cheapest reliable source first):
  API  >  RSS  >  SITEMAP  >  STATIC_HTML  >  BROWSER  >  PDF  >  MANUAL

Each adapter returns an AdapterResult which the CrawlEngine persists as
SourceSnapshot + SourceDocument records.

Adapters never write to the DB directly — they only fetch and parse.
All persistence happens in crawl_engine.py.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependencies (graceful fallback on all)
# ---------------------------------------------------------------------------
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False

try:
    import trafilatura
    _HAS_TRAFILATURA = True
except ImportError:
    _HAS_TRAFILATURA = False

try:
    import feedparser
    _HAS_FEEDPARSER = True
except ImportError:
    _HAS_FEEDPARSER = False

try:
    from dateutil import parser as du_parser
    _HAS_DATEUTIL = True
except ImportError:
    _HAS_DATEUTIL = False

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_TIMEOUT_S      = 25
_MAX_BYTES      = 5 * 1024 * 1024   # 5 MB
_RETRY_TOTAL    = 3
_RETRY_BACKOFF  = 1.5
_SITEMAP_LIMIT  = 120
_RSS_ITEM_LIMIT = 40
_POLITE_DELAY_S = 0.35

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
]

_BASE_HEADERS: Dict[str, str] = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "DNT": "1",
    "Connection": "keep-alive",
}

# ---------------------------------------------------------------------------
# Data transfer object
# ---------------------------------------------------------------------------

@dataclass
class AdapterResult:
    """Unified output from any adapter. CrawlEngine persists this."""
    url: str
    http_status: int
    fetch_method: str           # requests | urllib | feedparser | api | pdf | failed
    content_hash: str
    raw_html: str
    text_content: str           # clean readable text
    structured_data: Dict[str, Any] = field(default_factory=dict)
    fetch_duration_ms: int = 0
    fetch_error: str = ""
    response_headers: Dict[str, str] = field(default_factory=dict)
    document_type: str = "html"  # html | rss | json | pdf | sitemap
    sub_results: List["AdapterResult"] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.http_status == 200

    @property
    def char_count(self) -> int:
        return len(self.text_content)


# ---------------------------------------------------------------------------
# Base adapter
# ---------------------------------------------------------------------------

class BaseAdapter:
    """Shared HTTP utilities used by all adapters."""

    @classmethod
    def _ua_headers(cls) -> Dict[str, str]:
        return {**_BASE_HEADERS, "User-Agent": random.choice(_USER_AGENTS)}

    @classmethod
    def _stable_hash(cls, content: str) -> str:
        # Strip dynamic elements before hashing
        stable = re.sub(
            r"<(?:script|style|noscript)(?:\s[^>]*)?>.*?</(?:script|style|noscript)>"
            r"|<!--.*?-->"
            r'|\bdata-(?:timestamp|time|nonce|cache)[^\s>]*="[^"]*"',
            "", content, flags=re.DOTALL | re.I,
        )
        stable = re.sub(r"\s+", " ", stable).strip().lower()
        return hashlib.sha256(stable.encode("utf-8", errors="replace")).hexdigest()

    @classmethod
    def _raw_get(cls, url: str, headers: Optional[Dict] = None, timeout: int = 15) -> str:
        hdrs = headers or cls._ua_headers()
        if _HAS_REQUESTS:
            try:
                r = requests.get(url, headers=hdrs, timeout=timeout, allow_redirects=True)
                if r.status_code == 200:
                    return r.text
                return ""
            except Exception:
                pass
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read(512 * 1024).decode("utf-8", errors="replace")
        except Exception:
            return ""

    @classmethod
    def _fetch_page(cls, url: str) -> AdapterResult:
        """Core single-page GET with retry, UA rotation, streaming."""
        from django.utils import timezone
        hdrs = cls._ua_headers()
        t0 = time.monotonic()
        retrieved_at = timezone.now().isoformat()

        if _HAS_REQUESTS:
            result = cls._requests_get(url, hdrs)
        else:
            result = cls._urllib_get(url, hdrs)

        result.fetch_duration_ms = int((time.monotonic() - t0) * 1000)
        if result.ok and result.raw_html:
            result.text_content = cls._extract_text(result.raw_html)
        return result

    @classmethod
    def _requests_get(cls, url: str, headers: Dict) -> AdapterResult:
        session = requests.Session()
        retry = Retry(
            total=_RETRY_TOTAL, backoff_factor=_RETRY_BACKOFF,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"], raise_on_status=False,
        )
        session.mount("https://", HTTPAdapter(max_retries=retry))
        session.mount("http://", HTTPAdapter(max_retries=retry))
        try:
            resp = session.get(url, headers=headers, timeout=_TIMEOUT_S,
                               allow_redirects=True, stream=True)
            buf = b""
            for chunk in resp.iter_content(chunk_size=65536):
                buf += chunk
                if len(buf) >= _MAX_BYTES:
                    break
            resp.close()
            session.close()
            raw = buf.decode("utf-8", errors="replace")
            return AdapterResult(
                url=resp.url or url, http_status=resp.status_code,
                fetch_method="requests",
                content_hash=cls._stable_hash(raw),
                raw_html=raw, text_content="",
                response_headers=dict(resp.headers),
            )
        except Exception as exc:
            logger.debug("[adapter] requests failed %s: %s — fallback urllib", url, exc)
            return cls._urllib_get(url, headers)

    @classmethod
    def _urllib_get(cls, url: str, headers: Dict) -> AdapterResult:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
                raw = resp.read(_MAX_BYTES).decode("utf-8", errors="replace")
            return AdapterResult(
                url=url, http_status=200, fetch_method="urllib",
                content_hash=cls._stable_hash(raw),
                raw_html=raw, text_content="",
            )
        except urllib.error.HTTPError as exc:
            return cls._failed(url, str(exc), exc.code)
        except (urllib.error.URLError, socket.timeout, OSError) as exc:
            return cls._failed(url, str(exc))
        except Exception as exc:
            return cls._failed(url, str(exc))

    @classmethod
    def _failed(cls, url: str, error: str, status: int = 0) -> AdapterResult:
        return AdapterResult(
            url=url, http_status=status, fetch_method="failed",
            content_hash="", raw_html="", text_content="",
            fetch_error=error[:1000],
        )

    @classmethod
    def _extract_text(cls, html: str) -> str:
        """Best-effort text extraction: trafilatura > BS4 > regex."""
        if _HAS_TRAFILATURA:
            try:
                result = trafilatura.extract(
                    html, include_links=False, include_images=False,
                    no_fallback=False, favor_recall=True,
                )
                if result and len(result) > 100:
                    return result
            except Exception:
                pass

        if _HAS_BS4:
            try:
                soup = BeautifulSoup(html, "lxml" if _lxml_ok() else "html.parser")
                for tag in soup.find_all(["script", "style", "noscript", "nav", "footer", "aside"]):
                    tag.decompose()
                return " ".join(soup.stripped_strings)
            except Exception:
                pass

        # Regex fallback
        text = re.sub(r"<(?:script|style)[^>]*>.*?</(?:script|style)>", " ", html,
                      flags=re.DOTALL | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        for ent, rep in {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ",
                         "&quot;": '"', "&#39;": "'"}.items():
            text = text.replace(ent, rep)
        return re.sub(r"\s+", " ", text).strip()

    @classmethod
    def _extract_json_ld(cls, html: str) -> Optional[Dict[str, Any]]:
        """Extract best JSON-LD block from HTML."""
        matches = re.findall(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html, re.DOTALL | re.I,
        )
        best: Optional[Dict] = None
        best_score = 0
        for m in matches:
            try:
                data = json.loads(m.strip())
                items = data.get("@graph", [data]) if isinstance(data, dict) else [data]
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    t = item.get("@type", "")
                    score = 0
                    if t in ("Event", "EducationalEvent"): score = 10
                    elif t in ("EducationalOccupationalProgram", "Course"): score = 9
                    elif t == "FAQPage": score = 4
                    elif t in ("Organization", "LocalBusiness"): score = 3
                    score += sum(1 for k in ("startDate","endDate","validThrough",
                                             "applicationDeadline","description","offers") if k in item)
                    if score > best_score:
                        best_score = score
                        best = item
            except (json.JSONDecodeError, AttributeError):
                continue
        return best

    @classmethod
    def _extract_og_meta(cls, html: str) -> Dict[str, str]:
        """Extract OG/Twitter/meta tags."""
        og: Dict[str, str] = {}
        for m in re.finditer(
            r'<meta\s+(?:[^>]*\s)?(?:property|name)=["\']([^"\']+)["\'][^>]*content=["\']([^"\']*)["\']',
            html, re.I,
        ):
            og[m.group(1)] = m.group(2)
        for m in re.finditer(
            r'<meta\s+(?:[^>]*\s)?content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']([^"\']+)["\']',
            html, re.I,
        ):
            og[m.group(2)] = m.group(1)
        return og


# ---------------------------------------------------------------------------
# StaticHTMLAdapter
# ---------------------------------------------------------------------------

class StaticHTMLAdapter(BaseAdapter):
    """
    Multi-page static HTML crawl:
      1. base_url
      2. application_url (if different)
      3. Up to 4 relevant sub-pages (keyword-matched anchors)
    """

    _SUBPAGE_RE = re.compile(
        r"(?:apply|application|program|cohort|accelerat|invest|fund|grant"
        r"|deadline|eligib|criteria|batch|startup|founder)",
        re.I,
    )

    @classmethod
    def fetch(cls, source: Any) -> AdapterResult:
        base_url = getattr(source, "base_url", "") or ""
        app_url  = getattr(source, "application_url", "") or ""
        seen: set = set()
        pages: List[AdapterResult] = []

        def _get(url: str) -> Optional[AdapterResult]:
            url = url.strip().rstrip("/")
            if not url or url in seen:
                return None
            seen.add(url)
            r = cls._fetch_page(url)
            if r.ok:
                pages.append(r)
            return r if r.ok else None

        base_result = _get(base_url)
        if app_url != base_url:
            _get(app_url)

        if base_result and base_result.raw_html:
            for sub in cls._discover_subpages(base_result.raw_html, base_url)[:4]:
                _get(sub)
                time.sleep(_POLITE_DELAY_S)

        if not pages:
            return cls._failed(base_url, "all_pages_failed")

        # Primary result is the base page; sub_results hold additional pages
        primary = pages[0]
        primary.sub_results = pages[1:]
        # Merge structured data from all pages
        for page in pages:
            ld = cls._extract_json_ld(page.raw_html)
            if ld:
                primary.structured_data.setdefault("json_ld", ld)
            og = cls._extract_og_meta(page.raw_html)
            if og:
                primary.structured_data.setdefault("og", og)

        return primary

    @classmethod
    def _discover_subpages(cls, raw_html: str, base_url: str) -> List[str]:
        urls: List[str] = []
        seen: set = set()
        parsed = urllib.parse.urlparse(base_url)
        domain = parsed.netloc

        href_re = re.compile(r'<a\s[^>]*href=["\']([^"\'#?][^"\']*)["\'][^>]*>(.*?)</a>', re.I | re.S)
        for m in href_re.finditer(raw_html):
            href = m.group(1).strip()
            text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
            if not cls._SUBPAGE_RE.search(href) and not cls._SUBPAGE_RE.search(text):
                continue
            abs_url = urllib.parse.urljoin(base_url, href)
            p = urllib.parse.urlparse(abs_url)
            if p.netloc != domain or abs_url in seen:
                continue
            if any(abs_url.endswith(e) for e in (".pdf", ".png", ".jpg", ".zip")):
                continue
            seen.add(abs_url)
            urls.append(abs_url)
        return urls


# ---------------------------------------------------------------------------
# RSSAdapter
# ---------------------------------------------------------------------------

class RSSAdapter(BaseAdapter):
    """
    RSS / Atom feed adapter.
    Probes common feed paths; uses feedparser if available, else XML.
    """

    _FEED_PATHS = [
        "/feed", "/feed.xml", "/rss", "/rss.xml", "/atom.xml",
        "/blog/feed", "/news/feed", "/updates/feed",
    ]

    @classmethod
    def fetch(cls, source: Any) -> AdapterResult:
        base = getattr(source, "base_url", "") or ""
        rss_url = getattr(source, "rss_url", "") or ""
        parsed = urllib.parse.urlparse(base)
        origin = f"{parsed.scheme}://{parsed.netloc}"

        candidates = []
        if rss_url:
            candidates.append(rss_url)
        candidates.extend(origin + p for p in cls._FEED_PATHS)

        hdrs = {**_BASE_HEADERS, "User-Agent": random.choice(_USER_AGENTS),
                "Accept": "application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8"}

        for url in candidates:
            raw = cls._raw_get(url, headers=hdrs, timeout=12)
            if not raw:
                continue
            if not ("<rss" in raw[:500] or "<feed" in raw[:500] or "<channel" in raw[:800]):
                continue

            items, text = cls._parse_feed(raw, url)
            return AdapterResult(
                url=url, http_status=200, fetch_method="feedparser" if _HAS_FEEDPARSER else "xml",
                content_hash=cls._stable_hash(raw),
                raw_html=raw, text_content=text,
                structured_data={"rss_items": items},
                document_type="rss",
            )

        return cls._failed(base, "no_rss_feed_found")

    @classmethod
    def _parse_feed(cls, raw: str, url: str) -> tuple[List[Dict], str]:
        items: List[Dict] = []
        texts: List[str] = []

        if _HAS_FEEDPARSER:
            feed = feedparser.parse(raw)
            for entry in feed.entries[:_RSS_ITEM_LIMIT]:
                item = {
                    "title": getattr(entry, "title", ""),
                    "link":  getattr(entry, "link",  ""),
                    "summary": cls._strip_tags(getattr(entry, "summary", "")),
                    "published": getattr(entry, "published", ""),
                }
                items.append(item)
                texts.append(f"{item['title']} {item['summary']}")
        else:
            try:
                root = ET.fromstring(raw)
            except ET.ParseError:
                raw_clean = re.sub(r'\s+xmlns(?::\w+)?="[^"]+"', "", raw)
                try:
                    root = ET.fromstring(raw_clean)
                except ET.ParseError:
                    return items, ""

            for el in root.findall(".//item")[:_RSS_ITEM_LIMIT]:
                item: Dict[str, str] = {}
                for tag in ("title", "link", "description", "pubDate"):
                    child = el.find(tag)
                    if child is not None and child.text:
                        item[tag] = cls._strip_tags(child.text)
                if item:
                    items.append(item)
                    texts.append(f"{item.get('title','')} {item.get('description','')}")

        return items, " ".join(texts)

    @classmethod
    def _strip_tags(cls, html: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


# ---------------------------------------------------------------------------
# SitemapAdapter
# ---------------------------------------------------------------------------

class SitemapAdapter(BaseAdapter):
    """
    Sitemap XML discovery → select relevant program/opportunity pages → fetch them.
    Falls back to static HTML if no sitemap found.
    """

    _SITEMAP_PATHS = [
        "/sitemap.xml", "/sitemap_index.xml", "/sitemap/sitemap.xml",
        "/sitemap-programs.xml", "/sitemap-pages.xml",
    ]
    _RELEVANT_RE = re.compile(
        r"(?:apply|program|accelerat|cohort|fund|grant|invest|deadline|fellowship|startup)",
        re.I,
    )

    @classmethod
    def fetch(cls, source: Any) -> AdapterResult:
        base = getattr(source, "base_url", "") or ""
        parsed = urllib.parse.urlparse(base)
        origin = f"{parsed.scheme}://{parsed.netloc}"

        candidate_sm = getattr(source, "sitemap_url", "") or ""
        paths = ([candidate_sm] if candidate_sm else []) + [origin + p for p in cls._SITEMAP_PATHS]

        relevant_urls: List[str] = []
        for sm_url in paths:
            raw = cls._raw_get(sm_url, timeout=10)
            if not raw or ("<urlset" not in raw and "<sitemapindex" not in raw):
                continue
            relevant_urls = cls._extract_sitemap_urls(raw)
            if relevant_urls:
                logger.info("[sitemap] found %d relevant URLs from %s", len(relevant_urls), sm_url)
                break

        if not relevant_urls:
            # Fall back to static HTML
            logger.debug("[sitemap] no sitemap found for %s — falling back to static", base)
            return StaticHTMLAdapter.fetch(source)

        pages: List[AdapterResult] = []
        for url in relevant_urls[:6]:
            r = cls._fetch_page(url)
            if r.ok:
                pages.append(r)
            time.sleep(_POLITE_DELAY_S)

        if not pages:
            return cls._failed(base, "sitemap_pages_all_failed")

        primary = pages[0]
        primary.sub_results = pages[1:]
        return primary

    @classmethod
    def _extract_sitemap_urls(cls, xml_raw: str) -> List[str]:
        urls: List[str] = []
        try:
            root = ET.fromstring(xml_raw)
        except ET.ParseError:
            return urls
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        for loc in root.findall(".//sm:loc", ns):
            u = (loc.text or "").strip()
            if u and cls._RELEVANT_RE.search(u):
                urls.append(u)
                if len(urls) >= _SITEMAP_LIMIT:
                    break
        return urls


# ---------------------------------------------------------------------------
# APIAdapter
# ---------------------------------------------------------------------------

class APIAdapter(BaseAdapter):
    """
    Direct API fetch adapter.  Reads the API key from the environment
    variable specified in source.api_key_env_var.  Never stores keys.
    """

    @classmethod
    def fetch(cls, source: Any) -> AdapterResult:
        endpoint = getattr(source, "api_endpoint", "") or getattr(source, "base_url", "")
        if not endpoint:
            return cls._failed("", "no_api_endpoint")

        api_key_env = getattr(source, "api_key_env_var", "") or ""
        auth_header = getattr(source, "api_auth_header", "X-Api-Key") or "X-Api-Key"

        headers = cls._ua_headers()
        headers["Accept"] = "application/json"
        if api_key_env:
            api_key = os.environ.get(api_key_env, "")
            if api_key:
                headers[auth_header] = api_key

        t0 = time.monotonic()
        if _HAS_REQUESTS:
            try:
                resp = requests.get(endpoint, headers=headers, timeout=_TIMEOUT_S)
                raw = resp.text
                status = resp.status_code
            except Exception as exc:
                return cls._failed(endpoint, str(exc))
        else:
            try:
                req = urllib.request.Request(endpoint, headers=headers)
                with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                    raw = r.read(_MAX_BYTES).decode("utf-8", errors="replace")
                    status = r.status
            except Exception as exc:
                return cls._failed(endpoint, str(exc))

        ms = int((time.monotonic() - t0) * 1000)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {}

        text = cls._json_to_text(data)

        return AdapterResult(
            url=endpoint, http_status=status, fetch_method="api",
            content_hash=cls._stable_hash(raw),
            raw_html=raw, text_content=text,
            structured_data={"api_response": data},
            document_type="json",
            fetch_duration_ms=ms,
        )

    @classmethod
    def _json_to_text(cls, data: Any, depth: int = 0) -> str:
        if depth > 4:
            return ""
        if isinstance(data, str):
            return data
        if isinstance(data, (int, float, bool)):
            return str(data)
        if isinstance(data, list):
            return " ".join(cls._json_to_text(item, depth + 1) for item in data[:20])
        if isinstance(data, dict):
            parts = []
            for k, v in list(data.items())[:30]:
                parts.append(f"{k}: {cls._json_to_text(v, depth + 1)}")
            return " ".join(parts)
        return ""


# ---------------------------------------------------------------------------
# PDFAdapter
# ---------------------------------------------------------------------------

class PDFAdapter(BaseAdapter):
    """
    PDF / document adapter.  Downloads the file, extracts text via PyMuPDF
    (fitz) if available, else returns the raw binary in structured_data.
    """

    @classmethod
    def fetch(cls, source: Any) -> AdapterResult:
        url = getattr(source, "base_url", "") or ""
        if not url:
            return cls._failed("", "no_url")

        t0 = time.monotonic()
        if _HAS_REQUESTS:
            try:
                resp = requests.get(url, headers=cls._ua_headers(), timeout=_TIMEOUT_S, stream=True)
                buf = b""
                for chunk in resp.iter_content(65536):
                    buf += chunk
                    if len(buf) >= _MAX_BYTES:
                        break
                status = resp.status_code
            except Exception as exc:
                return cls._failed(url, str(exc))
        else:
            try:
                req = urllib.request.Request(url, headers=cls._ua_headers())
                with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                    buf = r.read(_MAX_BYTES)
                    status = r.status
            except Exception as exc:
                return cls._failed(url, str(exc))

        ms = int((time.monotonic() - t0) * 1000)
        text = cls._extract_pdf_text(buf)

        return AdapterResult(
            url=url, http_status=status, fetch_method="pdf",
            content_hash=hashlib.sha256(buf).hexdigest(),
            raw_html="", text_content=text,
            structured_data={"pdf_byte_length": len(buf)},
            document_type="pdf",
            fetch_duration_ms=ms,
        )

    @classmethod
    def _extract_pdf_text(cls, buf: bytes) -> str:
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=buf, filetype="pdf")
            pages_text = []
            for page in doc:
                pages_text.append(page.get_text())
            return "\n".join(pages_text)[:50000]
        except Exception:
            return ""


# ---------------------------------------------------------------------------
# Adapter registry
# ---------------------------------------------------------------------------

STRATEGY_ADAPTER_MAP: Dict[str, type] = {
    "api":     APIAdapter,
    "rss":     RSSAdapter,
    "sitemap": SitemapAdapter,
    "static":  StaticHTMLAdapter,
    "pdf":     PDFAdapter,
    # "browser": BrowserAdapter,   # Playwright — not default; add when needed
    "manual":  StaticHTMLAdapter,  # user-submitted: treat as static
}


def get_adapter(fetch_strategy: str) -> type:
    """Return the adapter class for a given fetch strategy string."""
    return STRATEGY_ADAPTER_MAP.get(fetch_strategy, StaticHTMLAdapter)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lxml_ok() -> bool:
    try:
        import lxml  # noqa: F401
        return True
    except ImportError:
        return False
