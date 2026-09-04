"""
apps.intelligence.deck_parser
==============================
Pitch deck extraction & dynamic signal parsing pipeline.
Supports PPTX and PDF formats with multi-currency normalisation,
dynamic metric parsing, math verification, and contradiction detection.
"""
from __future__ import annotations

import io
import logging
import re
import string
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from pptx import Presentation
    from pptx.util import Pt
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False


class EvidenceState(str, Enum):
    VERIFIED_EMPIRICAL = "verified_empirical"   # Backed by empirical data, citations, APIs
    SEED_PROXY         = "seed_proxy"           # Modelled forward-looking proxy
    FOUNDER_CLAIMED    = "founder_claimed"      # Self-reported assertion
    UNAVAILABLE        = "unavailable"          # Not present / not yet measurable


@dataclass
class NormalisedSlide:
    page: int
    title: str
    text_blocks: List[str]
    tables: List[List[List[str]]]
    chart_descriptions: List[str]
    raw_text: str


@dataclass
class ExtractedClaim:
    text: str
    category: str        # market_size | traction | unit_economics | team | product | regulatory | ip | gtm
    slide_no: int
    evidence_state: EvidenceState
    raw_value: Optional[str] = None
    confidence: float = 0.5


@dataclass
class ExtractedMetric:
    name: str            # cac | ltv | tam | sam | som | arr | mrr | burn_rate | runway | gross_margin | cac_ltv
    raw_text: str
    value: Optional[float] = None
    normalized_usd_value: Optional[float] = None
    currency: Optional[str] = None
    unit: Optional[str] = None
    slide_no: int = 0
    evidence_state: EvidenceState = EvidenceState.FOUNDER_CLAIMED
    is_projection: bool = False


@dataclass
class MathCheck:
    metric: str
    claimed_value: Optional[float]
    calculated_value: Optional[float]
    is_consistent: bool
    delta_pct: Optional[float]
    note: str


@dataclass
class NormalisedDeck:
    slides: List[NormalisedSlide]
    claims: List[ExtractedClaim]
    metrics: List[ExtractedMetric]
    math_checks: List[MathCheck]
    contradictions: List[str]
    missing_slide_types: List[str]
    full_text: str
    extraction_method: str
    extraction_confidence: float
    slide_count: int


# Currency Normalisation FX Rates (configurable baseline)
FX_RATES_TO_USD = {
    "USD": 1.0,
    "NGN": 1.0 / 1500.0,
    "EUR": 1.08,
    "GBP": 1.28,
    "CAD": 0.74,
}

_NUM_PATTERN = r"([\d,]+(?:\.\d+)?)\s*(?:k|K|m|M|B|b|bn|million|billion|thousand)?"
_CURRENCY_PATTERNS = [
    (r"\$", "USD"),
    (r"₦", "NGN"),
    (r"€", "EUR"),
    (r"£", "GBP"),
    (r"USD", "USD"),
    (r"NGN", "NGN"),
    (r"EUR", "EUR"),
    (r"GBP", "GBP"),
]

METRIC_PATTERNS: Dict[str, List[str]] = {
    "cac": [
        r"(?:cac|customer acquisition cost|acquisition cost)\s*[:=~]?\s*(?:\$|€|£|₦|USD|NGN)?\s*" + _NUM_PATTERN,
    ],
    "ltv": [
        r"(?:ltv|lifetime value|life.?time value|customer value)\s*[:=~]?\s*(?:\$|€|£|₦|USD|NGN)?\s*" + _NUM_PATTERN,
    ],
    "cac_ltv": [
        r"(?:ltv\s*/\s*cac|cac\s*:\s*ltv|ltv\s*:\s*cac)\s*[:=~]?\s*(\d+(?:\.\d+)?)\s*[×x:]?",
        r"(\d+(?:\.\d+)?)\s*[×x]\s*(?:ltv|return|payback)",
    ],
    "gross_margin": [
        r"(?:gross margin|gross.margin|margin)\s*[:=~]?\s*([\d.]+)\s*%",
    ],
    "arr": [
        r"(?:arr|annual recurring revenue|annual revenue)\s*[:=~]?\s*(?:\$|€|£|₦|USD|NGN)?\s*" + _NUM_PATTERN,
    ],
    "mrr": [
        r"(?:mrr|monthly recurring revenue)\s*[:=~]?\s*(?:\$|€|£|₦|USD|NGN)?\s*" + _NUM_PATTERN,
    ],
    "burn_rate": [
        r"(?:monthly burn|burn rate|burn)\s*[:=~]?\s*(?:\$|€|£|₦|USD|NGN)?\s*" + _NUM_PATTERN,
    ],
    "runway": [
        r"(?:runway)\s*[:=~]?\s*(\d+)\s*months?",
        r"(\d+)\s*months?\s*runway",
    ],
    "tam": [
        r"(?:tam|total addressable market|market size)\s*[:=~]?\s*(?:\$|€|£|₦|USD|NGN)?\s*" + _NUM_PATTERN,
    ],
    "sam": [
        r"(?:sam|serviceable addressable market)\s*[:=~]?\s*(?:\$|€|£|₦|USD|NGN)?\s*" + _NUM_PATTERN,
    ],
    "som": [
        r"(?:som|serviceable obtainable market)\s*[:=~]?\s*(?:\$|€|£|₦|USD|NGN)?\s*" + _NUM_PATTERN,
    ],
    "users": [
        r"([\d,]+)\s*(?:active\s+)?(?:users?|merchants?|customers?|clients?|subscribers?)",
    ],
    "pilots": [
        r"(\d+)\s*(?:signed\s+)?(?:pilots?|lois?|letters of intent|design partners?)",
    ],
}

_MULTIPLIER = {
    "k": 1_000, "K": 1_000, "thousand": 1_000,
    "m": 1_000_000, "M": 1_000_000, "million": 1_000_000,
    "b": 1_000_000_000, "B": 1_000_000_000, "bn": 1_000_000_000, "billion": 1_000_000_000,
}

def _parse_raw_number(raw: str) -> Optional[float]:
    raw = raw.strip().replace(",", "")
    match = re.search(r"([\d.]+)\s*([kKmMbB]|bn|million|billion|thousand)?", raw)
    if not match:
        return None
    try:
        val = float(match.group(1))
        suffix = match.group(2) or ""
        return val * _MULTIPLIER.get(suffix, 1)
    except ValueError:
        return None


class DeckParser:
    @classmethod
    def extract_text_from_file(cls, file_bytes: bytes, filename: str = "deck.pdf") -> str:
        """Extracts plain text from file bytes with fallback for mock tests."""
        parsed = cls.parse(file_bytes, filename=filename)
        if parsed.full_text and len(parsed.full_text.strip()) > 10:
            return parsed.full_text
        try:
            return file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            return ""

    @classmethod
    def parse(cls, file_bytes: bytes, filename: str = "") -> NormalisedDeck:
        ext = filename.lower().split(".")[-1] if "." in filename else ""
        slides: List[NormalisedSlide] = []
        full_text = ""
        confidence = 0.0
        method = "fallback_scan"

        if ext == "pptx" or (not ext and file_bytes[:4] == b"PK\x03\x04"):
            slides, full_text, confidence = cls._extract_pptx(file_bytes)
            method = "native_pptx" if slides else "fallback_scan"

        if not slides and (ext == "pdf" or (not ext and file_bytes[:4] == b"%PDF")):
            slides, full_text, confidence, method = cls._extract_pdf(file_bytes)

        if not slides:
            full_text, confidence = cls._fallback_scan(file_bytes)
            method = "fallback_scan"
            slides = [NormalisedSlide(
                page=1, title="Deck Document", text_blocks=[full_text[:3000]],
                tables=[], chart_descriptions=[], raw_text=full_text,
            )]

        claims = cls._extract_claims(slides)
        metrics = cls._extract_metrics(full_text, slides)
        math_checks = cls._run_math_checks(metrics)
        contradictions = cls._detect_contradictions(slides, metrics)
        missing_slides = cls._detect_missing_slides(slides)

        return NormalisedDeck(
            slides=slides,
            claims=claims,
            metrics=metrics,
            math_checks=math_checks,
            contradictions=contradictions,
            missing_slide_types=missing_slides,
            full_text=full_text,
            extraction_method=method,
            extraction_confidence=confidence,
            slide_count=len(slides),
        )

    @classmethod
    def _extract_pptx(cls, data: bytes) -> Tuple[List[NormalisedSlide], str, float]:
        if not PPTX_AVAILABLE:
            return [], "", 0.0
        try:
            prs = Presentation(io.BytesIO(data))
            slides = []
            all_text = []
            for i, slide in enumerate(prs.slides, start=1):
                blocks = []
                tables = []
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        t = "\n".join(p.text.strip() for p in shape.text_frame.paragraphs if p.text.strip())
                        if t:
                            blocks.append(t)
                    if shape.has_table:
                        tbl = [[c.text.strip() for c in r.cells] for r in shape.table.rows]
                        tables.append(tbl)
                raw = "\n".join(blocks)
                all_text.append(raw)
                slides.append(NormalisedSlide(
                    page=i, title=blocks[0].split("\n")[0] if blocks else f"Slide {i}",
                    text_blocks=blocks, tables=tables, chart_descriptions=[], raw_text=raw,
                ))
            full = "\n\n".join(all_text)
            return slides, full, 0.95 if full.strip() else 0.3
        except Exception as e:
            logger.warning(f"PPTX parse failed: {e}")
            return [], "", 0.0

    @classmethod
    def _extract_pdf(cls, data: bytes) -> Tuple[List[NormalisedSlide], str, float, str]:
        if not PYMUPDF_AVAILABLE:
            return [], "", 0.0, "unavailable"
        try:
            doc = fitz.open(stream=data, filetype="pdf")
            slides = []
            all_text = []
            method = "native_pdf"
            for i, page in enumerate(doc, start=1):
                txt = page.get_text("text").strip()
                if len(txt) < 30:
                    try:
                        pix = page.get_pixmap(dpi=150)
                        ocr_pdf = fitz.open()
                        ocr_page = ocr_pdf.new_page(width=pix.width, height=pix.height)
                        ocr_page.insert_image(ocr_page.rect, pixmap=pix)
                        txt = ocr_page.get_text("text").strip() or txt
                        method = "ocr_pdf"
                    except Exception:
                        pass
                blocks = [b.strip() for b in txt.split("\n") if b.strip()]
                all_text.append(txt)
                slides.append(NormalisedSlide(
                    page=i, title=blocks[0] if blocks else f"Slide {i}",
                    text_blocks=blocks, tables=[], chart_descriptions=[], raw_text=txt,
                ))
            full = "\n\n".join(all_text)
            return slides, full, 0.90 if method == "native_pdf" else 0.75, method
        except Exception as e:
            logger.warning(f"PDF parse failed: {e}")
            return [], "", 0.0, "failed"

    @classmethod
    def _fallback_scan(cls, data: bytes) -> Tuple[str, float]:
        printable_set = set(string.printable.encode("ascii"))
        raw = "".join(chr(b) if b in printable_set else " " for b in data)
        cleaned = re.sub(r"\s+", " ", raw).strip()
        return cleaned[:25000], 0.40

    @classmethod
    def _extract_claims(cls, slides: List[NormalisedSlide]) -> List[ExtractedClaim]:
        claims: List[ExtractedClaim] = []
        categories = {
            "problem": ["problem", "pain", "friction", "bottleneck", "challenge", "loss", "reconciliation"],
            "solution": ["solution", "platform", "engine", "algorithm", "architecture", "non-custodial", "api"],
            "market_size": ["tam", "sam", "market size", "billion", "trillion", "addressable"],
            "unit_economics": ["cac", "ltv", "margin", "payback", "churn", "nrr", "arpu", "pricing"],
            "gtm": ["gtm", "distribution", "partner", "channel", "referral", "acquisition", "pipeline"],
            "traction": ["pilot", "loi", "customer", "merchant", "user", "mrr", "arr", "gmv", "growth"],
            "team": ["founder", "technical", "engineer", "experience", "previously", "exited", "phd", "cto"],
            "regulatory": ["license", "cbn", "sec", "compliance", "non-custodial", "gdpr", "aml", "kyc"],
            "ip": ["patent", "proprietary", "trade secret", "copyright", "trademark", "patent pending"],
        }
        for s in slides:
            for line in s.text_blocks:
                line_clean = line.strip()
                if len(line_clean) < 15:
                    continue
                lower = line_clean.lower()
                for cat, keywords in categories.items():
                    if any(k in lower for k in keywords):
                        is_proj = any(p in lower for p in ["will", "expect", "projected", "forecast", "target", "by 202"])
                        ev = EvidenceState.SEED_PROXY if is_proj else (
                            EvidenceState.VERIFIED_EMPIRICAL if any(v in lower for v in ["github", "audited", "verified", "live api", "signed"]) else EvidenceState.FOUNDER_CLAIMED
                        )
                        claims.append(ExtractedClaim(
                            text=line_clean[:220],
                            category=cat,
                            slide_no=s.page,
                            evidence_state=ev,
                            confidence=0.85 if ev == EvidenceState.VERIFIED_EMPIRICAL else 0.65,
                        ))
                        break
        return claims

    @classmethod
    def _extract_metrics(cls, full_text: str, slides: List[NormalisedSlide]) -> List[ExtractedMetric]:
        metrics: List[ExtractedMetric] = []
        seen = set()
        for m_name, patterns in METRIC_PATTERNS.items():
            for pat in patterns:
                for match in re.finditer(pat, full_text, re.IGNORECASE):
                    raw = match.group(0)
                    if m_name in seen:
                        continue
                    num_val = None
                    for g in match.groups():
                        if g:
                            num_val = _parse_raw_number(g)
                            if num_val is not None:
                                break
                    currency = "USD"
                    for cur_regex, cur_code in _CURRENCY_PATTERNS:
                        if re.search(cur_regex, raw):
                            currency = cur_code
                            break
                    usd_val = (num_val * FX_RATES_TO_USD.get(currency, 1.0)) if num_val is not None else None
                    slide_no = 1
                    for s in slides:
                        if raw[:20] in s.raw_text:
                            slide_no = s.page
                            break
                    is_proj = any(p in raw.lower() for p in ["target", "projected", "forecast", "expected"])
                    metrics.append(ExtractedMetric(
                        name=m_name,
                        raw_text=raw.strip()[:100],
                        value=num_val,
                        normalized_usd_value=usd_val,
                        currency=currency,
                        slide_no=slide_no,
                        evidence_state=EvidenceState.SEED_PROXY if is_proj else EvidenceState.FOUNDER_CLAIMED,
                        is_projection=is_proj,
                    ))
                    seen.add(m_name)
        return metrics

    @classmethod
    def _run_math_checks(cls, metrics: List[ExtractedMetric]) -> List[MathCheck]:
        checks: List[MathCheck] = []
        m_dict = {m.name: m for m in metrics}

        cac = m_dict.get("cac")
        ltv = m_dict.get("ltv")
        ratio = m_dict.get("cac_ltv")

        if cac and cac.normalized_usd_value and ltv and ltv.normalized_usd_value and cac.normalized_usd_value > 0:
            calc_ratio = round(ltv.normalized_usd_value / cac.normalized_usd_value, 2)
            if ratio and ratio.value:
                delta = abs(calc_ratio - ratio.value) / max(calc_ratio, 0.01)
                consistent = delta <= 0.15
                checks.append(MathCheck(
                    metric="LTV / CAC Multiple",
                    claimed_value=ratio.value,
                    calculated_value=calc_ratio,
                    is_consistent=consistent,
                    delta_pct=round(delta * 100, 1),
                    note=f"Deck claims {ratio.value}x; Calculated LTV÷CAC = {calc_ratio}x"
                         + (" (Consistent)" if consistent else f" - Discrepancy of {round(delta*100, 1)}%"),
                ))
            else:
                checks.append(MathCheck(
                    metric="LTV / CAC Multiple",
                    claimed_value=None,
                    calculated_value=calc_ratio,
                    is_consistent=True,
                    delta_pct=None,
                    note=f"Modelled CAC:LTV multiple = {calc_ratio}x ($ {ltv.normalized_usd_value:,.0f} ÷ $ {cac.normalized_usd_value:,.0f})",
                ))

        burn = m_dict.get("burn_rate")
        runway = m_dict.get("runway")
        if burn and burn.normalized_usd_value and runway and runway.value:
            implied_cash = burn.normalized_usd_value * runway.value
            checks.append(MathCheck(
                metric="Implied Cash at Current Burn",
                claimed_value=None,
                calculated_value=round(implied_cash, 0),
                is_consistent=True,
                delta_pct=None,
                note=f"Burn ${burn.normalized_usd_value:,.0f}/mo × {runway.value:.0f} mos runway = ${implied_cash:,.0f} cash requirement",
            ))

        gm = m_dict.get("gross_margin")
        if gm and gm.value is not None:
            consistent = (15.0 <= gm.value <= 95.0)
            checks.append(MathCheck(
                metric="Gross Margin Realism",
                claimed_value=gm.value,
                calculated_value=None,
                is_consistent=consistent,
                delta_pct=None,
                note=f"Gross margin of {gm.value}% " + ("is within standard software bounds." if consistent else "is outside standard software bounds (15%-95%)."),
            ))

        return checks

    @classmethod
    def _detect_contradictions(cls, slides: List[NormalisedSlide], metrics: List[ExtractedMetric]) -> List[str]:
        contradictions = []
        full_lower = " ".join(s.raw_text.lower() for s in slides)
        has_prerev = any(w in full_lower for w in ["pre-revenue", "pre revenue", "$0 revenue", "zero revenue"])
        has_arr = any(m.name in ["arr", "mrr"] and m.value and m.value > 100 for m in metrics)
        if has_prerev and has_arr:
            contradictions.append("Deck declares pre-revenue status on one slide, but claims active recurring ARR/MRR elsewhere.")
        has_nocustomers = any(w in full_lower for w in ["no customers", "pre-customer", "0 users"])
        has_users = any(m.name in ["users", "pilots"] and m.value and m.value > 10 for m in metrics)
        if has_nocustomers and has_users:
            contradictions.append("Contradictory user metrics: claims zero customers while stating active user counts.")
        return contradictions

    @classmethod
    def _detect_missing_slides(cls, slides: List[NormalisedSlide]) -> List[str]:
        full_lower = " ".join(s.raw_text.lower() for s in slides)
        essential = {
            "Problem Statement": ["problem", "pain", "bottleneck", "friction", "challenge"],
            "Solution & Architecture": ["solution", "product", "platform", "how it works", "engine"],
            "Market Opportunity (TAM)": ["tam", "sam", "market size", "opportunity", "addressable"],
            "Business Model & Pricing": ["business model", "pricing", "monetization", "unit economics", "revenue model"],
            "Competitive Landscape & Moat": ["competition", "competitive", "landscape", "moat", "vs", "competitors"],
            "Go-To-Market & Distribution": ["gtm", "go to market", "distribution", "channels", "acquisition"],
            "Team & Founder Pedigree": ["team", "founders", "background", "experience", "advisors", "leadership"],
            "Fundraise & Use of Funds": ["ask", "fundraising", "raising", "use of funds", "allocation", "target round"],
        }
        missing = []
        for name, keywords in essential.items():
            if not any(k in full_lower for k in keywords):
                missing.append(name)
        return missing
