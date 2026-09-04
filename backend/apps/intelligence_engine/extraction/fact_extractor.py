"""
apps.intelligence_engine.extraction.fact_extractor
====================================================
AIFactExtractor — extracts structured facts from SourceDocument text.

Pipeline:
  SourceDocument.clean_text
        ↓
  Layer 1: JSON-LD structured data (Schema.org)        conf: 0.90–0.98
  Layer 2: Open Graph / meta tags                      conf: 0.70–0.85
  Layer 3: RSS item structured fields                  conf: 0.72–0.88
  Layer 4: Regex + context-proximity scoring           conf: 0.50–0.92
  Layer 5: AI LLM extraction (via AIGateway)           conf: 0.78–0.95
  Layer 6: Anchor / heuristic fallback                 conf: 0.35–0.65

Critical rule (from architecture spec):
  "LLM extracts facts, NOT invents them."
  The LLM output goes through DeterministicValidator before any fact
  is accepted into the DB.  If a value cannot be corroborated by at
  least one deterministic signal (regex / structured data), it is
  stored with extraction_method="ai_llm" and confidence capped at 0.82.
  The validation step in EvidenceEngine can then confirm or reject it.
"""
from __future__ import annotations

import datetime
import json
import logging
import math
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ─── Optional dateutil ───────────────────────────────────────────────────────
try:
    from dateutil import parser as du_parser
    _HAS_DATEUTIL = True
except ImportError:
    _HAS_DATEUTIL = False

# ─── Configuration ────────────────────────────────────────────────────────────
_MIN_CONFIDENCE       = 0.50
_AI_CONFIDENCE_CAP    = 0.82   # LLM facts capped until deterministically corroborated
_AI_MAX_TOKENS        = 1200
_AI_TEMPERATURE       = 0.05   # Near-zero for deterministic extraction

# ─── Month map ────────────────────────────────────────────────────────────────
_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}

_MONTHS_PATTERN = (
    r"january|february|march|april|may|june|july|august|september|"
    r"october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec"
)
_ORD = r"(?:st|nd|rd|th)?"

_DATE_PATTERNS: List[re.Pattern] = [
    re.compile(r"\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b"),
    re.compile(rf"\b({_MONTHS_PATTERN})\s+(\d{{1,2}}){_ORD},?\s*(\d{{4}})\b", re.I),
    re.compile(rf"\b(\d{{1,2}}){_ORD}\s+({_MONTHS_PATTERN})\s+(\d{{4}})\b", re.I),
    re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b"),
]

_DEADLINE_CONTEXTS: List[Tuple[re.Pattern, float]] = [
    (re.compile(r"(?:application|apply|submit(?:ting)?)\s*(?:deadline|closes?|due|by)\s*:?\s*$", re.I), 0.42),
    (re.compile(r"(?:last|final)\s+day\s+(?:to\s+apply|for\s+applications?)\s*:?\s*$", re.I), 0.40),
    (re.compile(r"(?:applications?\s+)?(?:closes?|ends?|due)\s+(?:on\s+)?$", re.I), 0.37),
    (re.compile(r"deadline\s*:?\s*$", re.I), 0.35),
    (re.compile(r"(?:by|before|until|no\s+later\s+than)\s+$", re.I), 0.30),
    (re.compile(r"(?:closes?|ends?)\s+$", re.I), 0.25),
]

_STATUS_SIGNALS: List[Tuple[re.Pattern, float, str]] = [
    (re.compile(r"rolling\s+(?:basis\s+)?applications?", re.I), 0.95, "ROLLING"),
    (re.compile(r"apply\s+any\s*time", re.I), 0.92, "ROLLING"),
    (re.compile(r"no\s+(?:set\s+)?(?:application\s+)?deadline", re.I), 0.90, "ROLLING"),
    (re.compile(r"applications?\s+(?:are\s+)?(?:now\s+)?closed", re.I), 0.95, "CLOSED"),
    (re.compile(r"no\s+longer\s+accepting\s+applications?", re.I), 0.95, "CLOSED"),
    (re.compile(r"deadline\s+(?:has\s+)?passed", re.I), 0.90, "CLOSED"),
    (re.compile(r"closing\s+soon", re.I), 0.90, "CLOSING_SOON"),
    (re.compile(r"last\s+(?:chance|call|day[s]?)\s+to\s+apply", re.I), 0.90, "CLOSING_SOON"),
    (re.compile(r"final\s+(?:call|deadline|day[s]?)", re.I), 0.83, "CLOSING_SOON"),
    (re.compile(r"applications?\s+(?:will\s+)?open\s+soon", re.I), 0.92, "OPENING_SOON"),
    (re.compile(r"(?:next\s+)?cohort\s+(?:is\s+)?(?:coming|announced|planned)", re.I), 0.88, "OPENING_SOON"),
    (re.compile(r"applications?\s+(?:are\s+)?(?:now\s+)?open", re.I), 0.93, "OPEN"),
    (re.compile(r"now\s+accepting\s+applications?", re.I), 0.92, "OPEN"),
    (re.compile(r"open\s+for\s+applications?", re.I), 0.90, "OPEN"),
    (re.compile(r"apply\s+now", re.I), 0.72, "OPEN"),
]

_MONEY_RANGE_RE = re.compile(
    r"(?:USD\s*|US\$|\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(K|M|B|thousand|million|billion)?"
    r"\s*(?:to|[-\u2013\u2014])\s*"
    r"(?:USD\s*|US\$|\$)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(K|M|B|thousand|million|billion)?",
    re.I,
)
_MONEY_SINGLE_RE = re.compile(
    r"(?:USD\s*|US\$|\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(K|M|B|thousand|million|billion)?",
    re.I,
)
_MULTIPLIERS = {
    "k": 1_000, "m": 1_000_000, "b": 1_000_000_000,
    "thousand": 1_000, "million": 1_000_000, "billion": 1_000_000_000,
}
_EQUITY_FREE_RE = re.compile(
    r"(?:equity[- ]free|0\s*%\s*equity|no\s*equity\s*(?:taken)?|non[- ]dilutive)", re.I
)
_EQUITY_PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*(?:equity|stake|ownership|dilution)", re.I)
_LIST_ITEM_RE  = re.compile(
    r"(?:^|\n)\s*(?:[•·▪◦‣⁃*\-–—]|\d+[.):])\s*(.{15,280})",
    re.MULTILINE,
)
_BENEFITS_RE   = re.compile(
    r"(?:what\s+you(?:'ll)?\s+(?:get|receive|gain)|benefits?|perks?|"
    r"program\s+(?:includes?|offers?)|why\s+apply)", re.I,
)
_ELIGIBILITY_RE = re.compile(
    r"(?:eligib(?:ility|le)|who\s+(?:can|should|is)\s+apply|"
    r"requirements?|criteria|ideal\s+(?:candidate|founder))", re.I,
)


# ─── Extracted fact DTO ───────────────────────────────────────────────────────

@dataclass
class ExtractedFact:
    """A single fact extracted from a document with full provenance."""
    fact_type:         str
    raw_value:         str
    normalized_value:  Any
    confidence:        float
    extraction_method: str   # json_ld | og_meta | rss | regex_context | regex_plain | ai_llm | heuristic
    evidence_snippet:  str
    context_window:    str = ""
    locator:           str = ""
    unit:              str = ""
    source_url:        str = ""

    def is_reliable(self) -> bool:
        return self.confidence >= _MIN_CONFIDENCE


@dataclass
class ExtractionResult:
    """All facts extracted from a single SourceDocument."""
    document_id:    str
    source_org:     str
    source_url:     str
    facts:          List[ExtractedFact] = field(default_factory=list)
    warnings:       List[str]           = field(default_factory=list)
    overall_confidence: float = 0.0
    ai_used:        bool = False

    def by_type(self, fact_type: str) -> List[ExtractedFact]:
        return [f for f in self.facts if f.fact_type == fact_type]

    def best(self, fact_type: str) -> Optional[ExtractedFact]:
        matches = self.by_type(fact_type)
        return max(matches, key=lambda f: f.confidence) if matches else None


# ─── AI extraction schema ────────────────────────────────────────────────────

_AI_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "application_status": {
            "type": "string",
            "enum": ["OPEN", "CLOSED", "CLOSING_SOON", "OPENING_SOON", "ROLLING", "UNKNOWN"],
            "description": "Current application status"
        },
        "application_deadline": {
            "type": ["string", "null"],
            "description": "ISO-8601 deadline date (YYYY-MM-DD) or null if not found"
        },
        "cohort_start_date": {
            "type": ["string", "null"],
            "description": "ISO-8601 program start date or null"
        },
        "funding_min_usd": {
            "type": ["number", "null"],
            "description": "Minimum funding amount in USD or null"
        },
        "funding_max_usd": {
            "type": ["number", "null"],
            "description": "Maximum funding amount in USD or null"
        },
        "equity_terms": {
            "type": ["string", "null"],
            "description": "Equity/dilution terms e.g. '7% equity', 'equity-free', null"
        },
        "is_equity_free": {
            "type": "boolean",
            "description": "True if program takes no equity"
        },
        "target_geographies": {
            "type": "array", "items": {"type": "string"},
            "description": "Countries or regions eligible"
        },
        "target_sectors": {
            "type": "array", "items": {"type": "string"},
            "description": "Industry sectors targeted"
        },
        "target_stages": {
            "type": "array", "items": {"type": "string"},
            "description": "Startup stages e.g. pre_seed, seed, series_a"
        },
        "key_benefits": {
            "type": "array", "items": {"type": "string"},
            "description": "Top 5 benefits of the program"
        },
        "eligibility_criteria": {
            "type": "array", "items": {"type": "string"},
            "description": "Eligibility requirements"
        },
        "program_description": {
            "type": ["string", "null"],
            "description": "One-paragraph program description, 80-300 chars"
        },
        "is_rolling_applications": {
            "type": "boolean",
            "description": "True if applications are accepted on a rolling basis"
        },
        "confidence_notes": {
            "type": "string",
            "description": "Brief note on extraction confidence / caveats"
        },
    },
    "required": ["application_status", "is_equity_free", "is_rolling_applications"],
}

_AI_SYSTEM_PROMPT = """You are a funding opportunity intelligence extractor for Pitchmic.
Extract ONLY facts explicitly stated in the provided text.
Do NOT invent, infer, or guess values that are not clearly present.
If a value is absent, return null (not a placeholder).
Your output will be validated against deterministic signals — fabricated values will be rejected.
Return valid JSON matching the provided schema."""


# ─── AIFactExtractor ─────────────────────────────────────────────────────────

class AIFactExtractor:
    """
    Multi-layer fact extraction pipeline.

    Layer priority (highest confidence first):
      1. JSON-LD structured data
      2. Open Graph / meta tags
      3. RSS structured fields
      4. Regex + context scoring
      5. AI LLM (via AIGateway) — validates against layer 1-4 signals
      6. Anchor/heuristic fallback for JS-heavy pages

    The extractor NEVER writes to the DB — it returns ExtractionResult.
    EvidenceEngine handles DB persistence and conflict resolution.
    """

    def __init__(self, use_ai: bool = True):
        self.use_ai = use_ai

    def extract(self, document: Any, source: Any) -> ExtractionResult:
        """
        Main entry point. document is a SourceDocument instance.
        source is a SourceRegistry instance.
        """
        result = ExtractionResult(
            document_id=str(document.id),
            source_org=getattr(source, "organization", ""),
            source_url=document.url or getattr(source, "base_url", ""),
        )

        text      = document.clean_text or ""
        struct    = document.structured_data or {}
        doc_url   = document.url or ""
        doc_type  = document.document_type

        # ── Layer 1: JSON-LD ──────────────────────────────────────────────
        json_ld = struct.get("json_ld") or struct.get("json-ld")
        if json_ld and isinstance(json_ld, dict):
            self._extract_from_json_ld(json_ld, doc_url, result)

        # ── Layer 2: OG / meta ────────────────────────────────────────────
        og = struct.get("og") or struct.get("og_meta")
        if og and isinstance(og, dict):
            self._extract_from_og(og, doc_url, result)

        # ── Layer 3: RSS items ────────────────────────────────────────────
        rss_items = struct.get("rss_items")
        if rss_items and isinstance(rss_items, list):
            self._extract_from_rss(rss_items, doc_url, result)

        # ── Layer 4: Regex + context ──────────────────────────────────────
        if text:
            self._extract_regex(text, doc_url, result)

        # ── Layer 5: AI LLM ───────────────────────────────────────────────
        if self.use_ai and text and len(text) >= 150:
            ai_facts = self._extract_ai(text, doc_url, result)
            result.facts.extend(ai_facts)
            if ai_facts:
                result.ai_used = True

        # ── Layer 6: Anchor heuristic for thin pages ──────────────────────
        if len(text) < 200 and document.raw_html if hasattr(document, "raw_html") else False:
            self._extract_anchor_heuristics(
                getattr(document, "raw_html", ""), doc_url, result
            )

        # Overall confidence = weighted average of best facts per type
        result.overall_confidence = self._compute_overall_confidence(result.facts)

        logger.info(
            "[extractor] %s | %d facts | conf=%.2f | ai=%s | warnings=%s",
            source.organization if source else "?",
            len(result.facts), result.overall_confidence,
            result.ai_used, result.warnings,
        )
        return result

    # ─────────────────────────────────────────────────────────────────────────
    # Layer 1: JSON-LD
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_from_json_ld(
        self, ld: Dict[str, Any], url: str, result: ExtractionResult
    ) -> None:
        for field_name in ("applicationDeadline", "validThrough", "endDate"):
            raw = ld.get(field_name)
            if raw and isinstance(raw, str):
                parsed = self._parse_date(raw)
                if parsed and self._is_future(parsed):
                    result.facts.append(ExtractedFact(
                        fact_type="deadline", raw_value=raw,
                        normalized_value=parsed.isoformat(),
                        confidence=0.93, extraction_method="json_ld",
                        evidence_snippet=f"JSON-LD {field_name}: {raw}",
                        source_url=url,
                    ))
                    break

        start = ld.get("startDate")
        if start and isinstance(start, str):
            parsed = self._parse_date(start)
            if parsed and self._is_future(parsed):
                result.facts.append(ExtractedFact(
                    fact_type="cohort_start", raw_value=start,
                    normalized_value=parsed.isoformat(),
                    confidence=0.90, extraction_method="json_ld",
                    evidence_snippet=f"JSON-LD startDate: {start}",
                    source_url=url,
                ))

        desc = ld.get("description")
        if desc and isinstance(desc, str) and len(desc) >= 60:
            result.facts.append(ExtractedFact(
                fact_type="description", raw_value=desc[:1000],
                normalized_value=desc[:1000],
                confidence=0.87, extraction_method="json_ld",
                evidence_snippet=desc[:200], source_url=url,
            ))

        offers = ld.get("offers")
        if isinstance(offers, dict):
            for key, ft in (("lowPrice", "funding_min"), ("price", "funding_min"),
                             ("highPrice", "funding_max")):
                price = offers.get(key)
                if price is not None:
                    try:
                        amt = float(str(price).replace(",", ""))
                        result.facts.append(ExtractedFact(
                            fact_type=ft, raw_value=str(price),
                            normalized_value=amt, unit="USD",
                            confidence=0.82, extraction_method="json_ld",
                            evidence_snippet=f"JSON-LD offers.{key}: {price}",
                            source_url=url,
                        ))
                    except ValueError:
                        pass

    # ─────────────────────────────────────────────────────────────────────────
    # Layer 2: OG / meta
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_from_og(
        self, og: Dict[str, str], url: str, result: ExtractionResult
    ) -> None:
        desc = (og.get("og:description") or og.get("description") or
                og.get("twitter:description") or "")
        if desc and len(desc) >= 50:
            if not result.best("description") or result.best("description").confidence < 0.73:
                result.facts.append(ExtractedFact(
                    fact_type="description", raw_value=desc[:1000],
                    normalized_value=desc[:1000],
                    confidence=0.72, extraction_method="og_meta",
                    evidence_snippet=desc[:200], source_url=url,
                ))

    # ─────────────────────────────────────────────────────────────────────────
    # Layer 3: RSS
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_from_rss(
        self, items: List[Dict], url: str, result: ExtractionResult
    ) -> None:
        combined = " ".join(
            f"{item.get('title','')} {item.get('summary','')}" for item in items[:15]
        )
        if not combined.strip():
            return
        # Run regex on combined RSS text at slightly lower confidence
        temp = ExtractionResult(document_id="", source_org="", source_url=url)
        self._extract_regex(combined, url, temp, base_confidence_multiplier=0.90)
        for f in temp.facts:
            f.extraction_method = "rss"
        result.facts.extend(temp.facts)

        if items and not result.best("status"):
            result.facts.append(ExtractedFact(
                fact_type="status", raw_value="OPEN",
                normalized_value="OPEN", confidence=0.67,
                extraction_method="rss",
                evidence_snippet=f"RSS feed active: {len(items)} recent items",
                source_url=url,
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # Layer 4: Regex + context scoring
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_regex(
        self, text: str, url: str, result: ExtractionResult,
        base_confidence_multiplier: float = 1.0,
    ) -> None:
        m = base_confidence_multiplier

        # Status
        s = self._detect_status(text, url, m)
        if s and (not result.best("status") or s.confidence > result.best("status").confidence):
            result.facts.append(s)

        # Deadline
        d = self._detect_deadline(text, url, m)
        if d and (not result.best("deadline") or d.confidence > result.best("deadline").confidence):
            result.facts.append(d)

        # Funding range
        mn, mx = self._detect_money(text, url, m)
        if mn:
            result.facts.append(mn)
        if mx:
            result.facts.append(mx)

        # Equity
        eq = self._detect_equity(text, url, m)
        if eq:
            result.facts.append(eq)

        # Benefits
        ben = self._detect_list_section(text, _BENEFITS_RE, "benefit", url, m)
        if ben:
            result.facts.extend(ben)

        # Eligibility
        elig = self._detect_list_section(text, _ELIGIBILITY_RE, "eligibility", url, m)
        if elig:
            result.facts.extend(elig)

        # Description (longest useful paragraph)
        desc = self._detect_description(text, url, m)
        if desc and (not result.best("description") or desc.confidence > result.best("description").confidence):
            result.facts.append(desc)

        # Cohort year ref
        cy = self._detect_cohort_ref(text, url, m)
        if cy:
            result.facts.append(cy)

    def _detect_deadline(
        self, text: str, url: str, m: float = 1.0
    ) -> Optional[ExtractedFact]:
        today = datetime.date.today()
        flat  = " ".join(re.split(r"(?<=[.!?\n])\s+", text))
        candidates: List[Tuple[float, datetime.date, str, str]] = []

        for pat in _DATE_PATTERNS:
            for match in pat.finditer(flat):
                raw = match.group(0)
                parsed = self._parse_date(raw)
                if not parsed or parsed <= today:
                    continue
                ctx_start = max(0, match.start() - 80)
                ctx_before = flat[ctx_start:match.start()]
                bonus = 0.0
                method = "regex_plain"
                snippet = raw
                for ctx_pat, b in _DEADLINE_CONTEXTS:
                    if ctx_pat.search(ctx_before) and b > bonus:
                        bonus = b
                        method = "regex_context"
                        snippet = ctx_before[-40:].strip() + " " + raw
                conf = min(0.98, (0.50 + bonus) * m)
                candidates.append((conf, parsed, snippet.strip(), method))

        if not candidates:
            return None
        candidates.sort(key=lambda x: (-x[0], x[1]))
        best = candidates[0]
        if best[0] < _MIN_CONFIDENCE:
            return None
        return ExtractedFact(
            fact_type="deadline", raw_value=best[1].isoformat(),
            normalized_value=best[1].isoformat(),
            confidence=best[0], extraction_method=best[3],
            evidence_snippet=best[2][:300], source_url=url,
        )

    def _detect_status(
        self, text: str, url: str, m: float = 1.0
    ) -> Optional[ExtractedFact]:
        hits: Dict[str, List[Tuple[float, str]]] = {}
        for pat, conf, sv in _STATUS_SIGNALS:
            for match in pat.finditer(text):
                snippet = text[max(0, match.start()-20):match.end()+20].strip()
                hits.setdefault(sv, []).append((conf, snippet))

        if not hits:
            return None
        best_sv, best_score, best_snip = None, 0.0, ""
        for sv, hl in hits.items():
            avg = sum(h[0] for h in hl) / len(hl)
            score = min(0.98, avg * math.sqrt(len(hl)) * m)
            if score > best_score:
                best_score, best_sv, best_snip = score, sv, hl[0][1]

        if best_sv is None or best_score < _MIN_CONFIDENCE:
            return None
        return ExtractedFact(
            fact_type="status", raw_value=best_sv,
            normalized_value=best_sv,
            confidence=best_score, extraction_method="regex_context",
            evidence_snippet=best_snip[:300], source_url=url,
        )

    def _detect_money(
        self, text: str, url: str, m: float = 1.0
    ) -> Tuple[Optional[ExtractedFact], Optional[ExtractedFact]]:
        for match in _MONEY_RANGE_RE.finditer(text):
            snippet = text[max(0, match.start()-30):match.end()+30].strip()
            lo = self._parse_money(match.group(1), match.group(2))
            hi = self._parse_money(match.group(3), match.group(4))
            if lo and hi and lo <= hi:
                return (
                    ExtractedFact(
                        fact_type="funding_min", raw_value=str(lo), normalized_value=lo,
                        unit="USD", confidence=0.84 * m,
                        extraction_method="regex_context",
                        evidence_snippet=snippet, source_url=url,
                    ),
                    ExtractedFact(
                        fact_type="funding_max", raw_value=str(hi), normalized_value=hi,
                        unit="USD", confidence=0.84 * m,
                        extraction_method="regex_context",
                        evidence_snippet=snippet, source_url=url,
                    ),
                )
        # Single amount fallback
        amounts = []
        for match in list(_MONEY_SINGLE_RE.finditer(text))[:10]:
            v = self._parse_money(match.group(1), match.group(2))
            if v and v >= 1000:
                amounts.append(v)
        if not amounts:
            return None, None
        amounts.sort()
        snippet = f"Amounts detected: {amounts}"
        min_sig = ExtractedFact(
            fact_type="funding_min", raw_value=str(amounts[0]), normalized_value=amounts[0],
            unit="USD", confidence=0.66 * m, extraction_method="regex_plain",
            evidence_snippet=snippet, source_url=url,
        )
        max_sig = ExtractedFact(
            fact_type="funding_max", raw_value=str(amounts[-1]), normalized_value=amounts[-1],
            unit="USD", confidence=0.66 * m, extraction_method="regex_plain",
            evidence_snippet=snippet, source_url=url,
        ) if len(amounts) > 1 else None
        return min_sig, max_sig

    def _detect_equity(
        self, text: str, url: str, m: float = 1.0
    ) -> Optional[ExtractedFact]:
        match = _EQUITY_FREE_RE.search(text)
        if match:
            snippet = text[max(0, match.start()-20):match.end()+30].strip()
            return ExtractedFact(
                fact_type="equity", raw_value="equity_free",
                normalized_value="Equity-free (0% equity)",
                confidence=0.90 * m, extraction_method="regex_context",
                evidence_snippet=snippet, source_url=url,
            )
        matches = list(_EQUITY_PCT_RE.finditer(text))
        if matches:
            match = matches[0]
            pct = float(match.group(1))
            snippet = text[max(0, match.start()-30):match.end()+40].strip()
            return ExtractedFact(
                fact_type="equity", raw_value=f"{pct}%",
                normalized_value=f"{pct}% equity",
                confidence=0.78 * m, extraction_method="regex_context",
                evidence_snippet=snippet, source_url=url,
            )
        return None

    def _detect_list_section(
        self, text: str, section_re: re.Pattern,
        fact_type: str, url: str, m: float = 1.0,
    ) -> List[ExtractedFact]:
        facts: List[ExtractedFact] = []
        sec_match = section_re.search(text)
        if not sec_match:
            return facts
        chunk = text[sec_match.start():sec_match.start() + 1500]
        items: List[str] = []
        for li in _LIST_ITEM_RE.finditer(chunk):
            item = li.group(1).strip()
            if len(item) >= 12:
                items.append(item)
                if len(items) >= 8:
                    break
        if not items:
            return facts
        for item in items:
            facts.append(ExtractedFact(
                fact_type=fact_type, raw_value=item,
                normalized_value=item,
                confidence=0.72 * m, extraction_method="regex_context",
                evidence_snippet=item, source_url=url,
            ))
        return facts

    def _detect_description(
        self, text: str, url: str, m: float = 1.0
    ) -> Optional[ExtractedFact]:
        segments = re.split(r"\n{2,}|\.\s{2,}", text)
        segments.sort(key=len, reverse=True)
        boilerplate = re.compile(
            r"(?:cookie|privacy\s+policy|terms\s+of|copyright|all\s+rights|404|javascript)", re.I
        )
        for seg in segments[:6]:
            seg = seg.strip()
            if len(seg) >= 80 and not boilerplate.search(seg):
                return ExtractedFact(
                    fact_type="description", raw_value=seg[:1200],
                    normalized_value=seg[:1200],
                    confidence=0.68 * m, extraction_method="regex_plain",
                    evidence_snippet=seg[:200], source_url=url,
                )
        return None

    def _detect_cohort_ref(
        self, text: str, url: str, m: float = 1.0
    ) -> Optional[ExtractedFact]:
        for pat in [
            re.compile(r"\b(202[4-9]|203\d)\s+(?:cohort|batch|class|program)", re.I),
            re.compile(r"\bcohort\s+(202[4-9]|203\d)\b", re.I),
        ]:
            match = pat.search(text)
            if match:
                snippet = text[max(0, match.start()-10):match.end()+20].strip()
                return ExtractedFact(
                    fact_type="cohort_year", raw_value=match.group(0),
                    normalized_value=match.group(0),
                    confidence=0.75 * m, extraction_method="regex_plain",
                    evidence_snippet=snippet, source_url=url,
                )
        return None

    def _extract_anchor_heuristics(
        self, raw_html: str, url: str, result: ExtractionResult
    ) -> None:
        anchors = " ".join(
            re.sub(r"<[^>]+>", "", m.group(1)).strip()
            for m in re.finditer(r'<a[^>]*>(.*?)</a>', raw_html, re.I | re.S)
        )
        attrs = " ".join(
            m.group(1) for m in re.finditer(
                r'(?:alt|title|aria-label)=["\']([^"\']{10,200})["\']', raw_html, re.I
            )
        )
        combined = f"{anchors} {attrs}".strip()
        if not combined:
            return
        temp = ExtractionResult(document_id="", source_org="", source_url=url)
        self._extract_regex(combined, url, temp, base_confidence_multiplier=0.65)
        for f in temp.facts:
            f.extraction_method = "heuristic"
        result.facts.extend(temp.facts)

    # ─────────────────────────────────────────────────────────────────────────
    # Layer 5: AI LLM extraction
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_ai(
        self, text: str, url: str, result: ExtractionResult
    ) -> List[ExtractedFact]:
        """
        Use AIGateway to extract structured facts from the document text.
        LLM output is validated against existing deterministic signals.
        Facts that contradict high-confidence deterministic signals are rejected.
        Facts not corroborated are kept but capped at _AI_CONFIDENCE_CAP.
        """
        try:
            from apps.intelligence.gateway import AIGateway
        except ImportError:
            result.warnings.append("ai_gateway_unavailable")
            return []

        # Build a compact representation (truncate to ~4000 chars for token budget)
        compact_text = text[:4000] if len(text) > 4000 else text
        prompt = (
            f"Extract funding opportunity information from the following page text.\n\n"
            f"PAGE TEXT:\n{compact_text}\n\n"
            f"Return JSON matching the schema provided."
        )

        try:
            ai_resp = AIGateway.execute_prompt(
                prompt=prompt,
                system_instruction=_AI_SYSTEM_PROMPT,
                expected_schema=_AI_EXTRACTION_SCHEMA,
                max_tokens=_AI_MAX_TOKENS,
                temperature=_AI_TEMPERATURE,
            )
        except Exception as exc:
            result.warnings.append(f"ai_extraction_failed:{type(exc).__name__}")
            return []

        if ai_resp.get("status") != "success":
            result.warnings.append(f"ai_gateway_error:{ai_resp.get('error','')}")
            return []

        structured = ai_resp.get("structured_output")
        if not isinstance(structured, dict):
            result.warnings.append("ai_output_not_dict")
            return []

        facts = self._ai_output_to_facts(structured, url, result)
        return facts

    def _ai_output_to_facts(
        self, ai_data: Dict[str, Any], url: str, result: ExtractionResult
    ) -> List[ExtractedFact]:
        """Convert validated AI output dict to ExtractedFact list."""
        facts: List[ExtractedFact] = []
        validator = DeterministicValidator(result.facts)

        def _add(fact_type: str, raw: Any, normalized: Any,
                 unit: str = "", snippet: str = "") -> None:
            if raw is None:
                return
            # Check against deterministic signals
            determ_best = result.best(fact_type)
            if determ_best and determ_best.confidence >= 0.80:
                # High-confidence deterministic signal exists — only add if AI agrees
                if not validator.agrees(fact_type, normalized, determ_best):
                    result.warnings.append(
                        f"ai_rejected_{fact_type}_conflicts_determ"
                    )
                    return
                ai_conf = min(determ_best.confidence + 0.03, 0.97)
            else:
                ai_conf = _AI_CONFIDENCE_CAP

            facts.append(ExtractedFact(
                fact_type=fact_type, raw_value=str(raw),
                normalized_value=normalized, unit=unit,
                confidence=ai_conf, extraction_method="ai_llm",
                evidence_snippet=snippet or f"AI extraction: {str(raw)[:100]}",
                source_url=url,
            ))

        status = ai_data.get("application_status")
        if status and status != "UNKNOWN":
            _add("status", status, status,
                 snippet=f"AI: application_status={status}")

        deadline = ai_data.get("application_deadline")
        if deadline:
            parsed = self._parse_date(str(deadline))
            if parsed and self._is_future(parsed):
                _add("deadline", deadline, parsed.isoformat(),
                     snippet=f"AI: deadline={deadline}")

        cohort_start = ai_data.get("cohort_start_date")
        if cohort_start:
            parsed = self._parse_date(str(cohort_start))
            if parsed and self._is_future(parsed):
                _add("cohort_start", cohort_start, parsed.isoformat(),
                     snippet=f"AI: cohort_start={cohort_start}")

        fund_min = ai_data.get("funding_min_usd")
        if fund_min is not None:
            try:
                _add("funding_min", fund_min, float(fund_min), unit="USD",
                     snippet=f"AI: funding_min_usd={fund_min}")
            except (TypeError, ValueError):
                pass

        fund_max = ai_data.get("funding_max_usd")
        if fund_max is not None:
            try:
                _add("funding_max", fund_max, float(fund_max), unit="USD",
                     snippet=f"AI: funding_max_usd={fund_max}")
            except (TypeError, ValueError):
                pass

        equity = ai_data.get("equity_terms")
        if equity:
            _add("equity", equity, equity, snippet=f"AI: equity_terms={equity}")

        desc = ai_data.get("program_description")
        if desc and len(desc) >= 60:
            _add("description", desc[:1000], desc[:1000],
                 snippet=f"AI: {desc[:100]}")

        for benefit in (ai_data.get("key_benefits") or [])[:6]:
            if benefit and len(benefit) >= 10:
                facts.append(ExtractedFact(
                    fact_type="benefit", raw_value=benefit,
                    normalized_value=benefit,
                    confidence=_AI_CONFIDENCE_CAP * 0.90,
                    extraction_method="ai_llm",
                    evidence_snippet=f"AI benefit: {benefit[:80]}",
                    source_url=url,
                ))

        for crit in (ai_data.get("eligibility_criteria") or [])[:6]:
            if crit and len(crit) >= 10:
                facts.append(ExtractedFact(
                    fact_type="eligibility", raw_value=crit,
                    normalized_value=crit,
                    confidence=_AI_CONFIDENCE_CAP * 0.88,
                    extraction_method="ai_llm",
                    evidence_snippet=f"AI eligibility: {crit[:80]}",
                    source_url=url,
                ))

        return facts

    # ─────────────────────────────────────────────────────────────────────────
    # Utilities
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_date(raw: str) -> Optional[datetime.date]:
        raw = raw.strip()
        if _HAS_DATEUTIL:
            try:
                return du_parser.parse(raw, dayfirst=False, yearfirst=True).date()
            except Exception:
                pass
        try:
            return datetime.date.fromisoformat(raw[:10])
        except ValueError:
            pass
        m = re.search(
            rf"({_MONTHS_PATTERN})\s+(\d{{1,2}}),?\s+(\d{{4}})", raw, re.I,
        )
        if m:
            mn = _MONTH_MAP.get(m.group(1)[:3].lower())
            if mn:
                try:
                    return datetime.date(int(m.group(3)), mn, int(m.group(2)))
                except ValueError:
                    pass
        return None

    @staticmethod
    def _is_future(d: datetime.date) -> bool:
        today = datetime.date.today()
        return today < d <= today + datetime.timedelta(days=365 * 3)

    @staticmethod
    def _parse_money(amount_str: Optional[str], mult_str: Optional[str]) -> Optional[float]:
        if not amount_str:
            return None
        try:
            amount = float(amount_str.replace(",", ""))
            if mult_str:
                amount *= _MULTIPLIERS.get(mult_str.lower(), 1)
            return amount
        except (ValueError, AttributeError):
            return None

    @staticmethod
    def _compute_overall_confidence(facts: List[ExtractedFact]) -> float:
        """
        Two-component confidence score (same logic as opportunity_fetcher):

        1. Precision  = weighted avg confidence of FOUND fact types
        2. Coverage   = fraction of the importance budget that was covered

        Final = precision * (0.60 + 0.40 * coverage)

        Minimum non-zero floor of 0.15 so "something extracted" is
        distinguishable from "fetch completely failed" (0.0).
        """
        priority = {
            "status":       0.30,
            "deadline":     0.25,
            "funding_max":  0.20,
            "equity":       0.10,
            "description":  0.10,
            "cohort_year":  0.05,
        }
        total_weight = sum(priority.values())   # 1.0

        # Best (highest confidence) fact per type
        best: Dict[str, float] = {}
        for f in sorted(facts, key=lambda x: -x.confidence):
            if f.fact_type in priority and f.fact_type not in best:
                best[f.fact_type] = f.confidence

        if not best:
            return 0.0

        found_weight = sum(priority[ft] for ft in best)
        precision    = sum(conf * priority[ft] for ft, conf in best.items()) / found_weight
        coverage     = found_weight / total_weight
        combined     = precision * (0.60 + 0.40 * coverage)

        return round(min(1.0, max(0.15, combined)), 3)


# ─── DeterministicValidator ───────────────────────────────────────────────────

class DeterministicValidator:
    """
    Validates AI-extracted facts against deterministic signals.
    Prevents LLM fabrication from entering the canonical store.
    """

    def __init__(self, deterministic_facts: List[ExtractedFact]):
        self._by_type: Dict[str, List[ExtractedFact]] = {}
        for f in deterministic_facts:
            if f.extraction_method != "ai_llm":
                self._by_type.setdefault(f.fact_type, []).append(f)

    def agrees(
        self, fact_type: str, ai_value: Any, determ_fact: ExtractedFact
    ) -> bool:
        """
        Returns True if the AI value is consistent with the deterministic signal.
        Tolerance: ±30 days for dates, ±25% for money amounts.
        """
        if fact_type == "deadline":
            try:
                ai_date   = datetime.date.fromisoformat(str(ai_value)[:10])
                det_date  = datetime.date.fromisoformat(str(determ_fact.normalized_value)[:10])
                return abs((ai_date - det_date).days) <= 30
            except (ValueError, TypeError):
                return True   # can't compare — allow

        if fact_type in ("funding_min", "funding_max"):
            try:
                ai_amt  = float(ai_value)
                det_amt = float(determ_fact.normalized_value)
                if det_amt == 0:
                    return True
                return abs(ai_amt - det_amt) / det_amt <= 0.25
            except (TypeError, ValueError):
                return True

        if fact_type == "status":
            return str(ai_value).upper() == str(determ_fact.normalized_value).upper()

        return True   # for other types, allow AI supplementation
