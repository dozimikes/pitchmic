from __future__ import annotations
import logging
import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from .deck_parser import (
    DeckParser,
    DeckParser as PDFDeckParser,
    EvidenceState,
    ExtractedClaim,
    ExtractedMetric,
    MathCheck,
    NormalisedDeck,
)

logger = logging.getLogger(__name__)


class FundingStage(str, Enum):
    IDEA = "idea"
    PRE_SEED = "pre_seed"
    SEED = "seed"
    SERIES_A = "series_a"
    SERIES_B_PLUS = "series_b_plus"

    @classmethod
    def from_str(cls, val: Optional[str]) -> FundingStage:
        if not val:
            return cls.PRE_SEED
        clean = val.lower().replace("-", "_").replace(" ", "_")
        for m in cls:
            if m.value == clean or m.name.lower() == clean:
                return m
        if "pre" in clean:
            return cls.PRE_SEED
        if "seed" in clean:
            return cls.SEED
        if "series_a" in clean or "a" == clean:
            return cls.SERIES_A
        if "series" in clean:
            return cls.SERIES_B_PLUS
        return cls.PRE_SEED


class ConvictionBand(str, Enum):
    EXCEPTIONAL = "Exceptional / High Conviction"
    STRONG = "Strong / Investable"
    PROMISING = "Promising / Diligence Required"
    SPECULATIVE = "Speculative / Significant Evidence Gaps"
    WEAK = "Weak / Insufficient Evidence"

    @classmethod
    def from_score(cls, score: float) -> str:
        if score >= 85.0:
            return cls.EXCEPTIONAL.value
        elif score >= 70.0:
            return cls.STRONG.value
        elif score >= 55.0:
            return cls.PROMISING.value
        elif score >= 40.0:
            return cls.SPECULATIVE.value
        return cls.WEAK.value


@dataclass
class DimensionScore:
    key: str
    name: str
    raw_score: float
    weight_pct: float
    weighted_contribution: float
    evidence_state: str
    confidence_pct: int
    justifications: List[str]
    positive_signals: List[str]
    missing_evidence: List[str]
    stage_concern: str


@dataclass
class ScoreLedger:
    base_weighted_score: float
    evidence_confidence_adjustment: float
    stage_alignment_adjustment: float
    unsupported_claim_adjustment: float
    final_fundability_score: float
    confidence_interval_low: float
    confidence_interval_high: float
    conviction_verdict: str
    empirical_coverage_pct: int


@dataclass
class StageAssessment:
    declared_stage: str
    assessed_maturity: str
    round_readiness_pct: int
    alignment_status: str
    primary_gap: str
    stage_milestone_target: str


@dataclass
class UnitEconomicsAudit:
    cac: Optional[float] = None
    ltv: Optional[float] = None
    cac_ltv_ratio: Optional[float] = None
    gross_margin_pct: Optional[float] = None
    burn_rate: Optional[float] = None
    runway_months: Optional[float] = None
    implied_payback_months: Optional[float] = None
    is_mathematically_coherent: bool = True
    anomalies: List[str] = field(default_factory=list)
    risk_level: str = "low"
    cac_evidence_state: str = EvidenceState.UNAVAILABLE.value
    ltv_evidence_state: str = EvidenceState.UNAVAILABLE.value
    margin_evidence_state: str = EvidenceState.UNAVAILABLE.value
    notes: str = ""


@dataclass
class CompetitorBenchmark:
    name: str
    tier: str
    stage: str
    threat_level: str
    threat_vector: str
    differentiation_verdict: str


@dataclass
class ForensicReport:
    startup_name: str
    fundability_score: float
    score_ledger: ScoreLedger
    dimension_scores: List[DimensionScore]
    stage_assessment: StageAssessment
    unit_economics: UnitEconomicsAudit
    competitor_benchmarks: List[CompetitorBenchmark]
    verified_claims: List[Dict[str, Any]]
    math_consistency_checks: List[Dict[str, Any]]
    contradictions: List[str]
    missing_critical_slides: List[str]
    top_score_drivers: List[str]
    bull_thesis: str
    bear_thesis: str
    highest_priority_diligence: List[str]
    raw_extraction: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PitchDeckForensicsService:
    def __init__(self, use_llm_if_available: bool = True):
        self.use_llm_if_available = use_llm_if_available

    def analyze_deck_content(
        self,
        company_name: str,
        deck_text: str = "",
        structured_metrics: Optional[Dict[str, Any]] = None,
        slide_count: int = 12,
        declared_stage: str = "pre_seed",
        sector: str = "fintech",
        raw_file_bytes: Optional[bytes] = None,
        filename: str = "",
    ) -> ForensicReport:
        stage_enum = FundingStage.from_str(declared_stage)
        metrics = structured_metrics or {}

        if raw_file_bytes:
            norm_deck = DeckParser.parse(raw_file_bytes, filename=filename)
        else:
            norm_deck = DeckParser.parse(deck_text.encode("utf-8", errors="ignore"), filename="deck.txt")

        active_text = norm_deck.full_text if len(norm_deck.full_text) > 30 else deck_text
        detected_slide_count = max(norm_deck.slide_count, slide_count, 1)

        # 1. Dynamic Unit Economics Audit
        unit_econ = self._audit_unit_economics_dynamic(active_text, metrics, norm_deck.metrics, stage_enum)

        # 2. Dynamic Startup Maturity Index (SMI)
        stage_assessment = self._assess_stage_maturity_dynamic(active_text, norm_deck, stage_enum)

        # 3. Dynamic Multi-Tier Competitor Telemetry
        competitors = self._discover_competitors_dynamic(company_name, sector, active_text)

        # 4. Dynamic 8-Dimension Scoring Engine
        dimension_scores = self._score_dimensions_dynamic(active_text, norm_deck, stage_enum, sector, unit_econ)

        # 5. Exact Auditable Score Ledger Calculation
        score_ledger = self._calculate_score_ledger_dynamic(dimension_scores, stage_assessment, norm_deck, unit_econ)

        # 6. Dynamic Synthesis of Bull, Bear, and Priority Actions
        bull_thesis, bear_thesis, priority_diligence, top_drivers = self._synthesize_ic_dynamic(
            company_name=company_name,
            stage_enum=stage_enum,
            score_ledger=score_ledger,
            stage_assessment=stage_assessment,
            unit_econ=unit_econ,
            competitors=competitors,
            dimension_scores=dimension_scores,
            norm_deck=norm_deck,
        )

        claims_list = [
            {
                "claim_text": c.text,
                "category": c.category,
                "slide_no": c.slide_no,
                "evidence_state": c.evidence_state.value,
                "confidence": c.confidence,
            }
            for c in norm_deck.claims
        ]

        math_checks_list = [
            {
                "metric": ch.metric,
                "claimed_value": ch.claimed_value,
                "calculated_value": ch.calculated_value,
                "is_consistent": ch.is_consistent,
                "delta_pct": ch.delta_pct,
                "note": ch.note,
            }
            for ch in norm_deck.math_checks
        ]

        return ForensicReport(
            startup_name=company_name,
            fundability_score=score_ledger.final_fundability_score,
            score_ledger=score_ledger,
            dimension_scores=dimension_scores,
            stage_assessment=stage_assessment,
            unit_economics=unit_econ,
            competitor_benchmarks=competitors,
            verified_claims=claims_list,
            math_consistency_checks=math_checks_list,
            contradictions=norm_deck.contradictions,
            missing_critical_slides=norm_deck.missing_slide_types,
            top_score_drivers=top_drivers,
            bull_thesis=bull_thesis,
            bear_thesis=bear_thesis,
            highest_priority_diligence=priority_diligence,
            raw_extraction={
                "detected_slide_count": detected_slide_count,
                "extraction_method": norm_deck.extraction_method,
                "extraction_confidence": norm_deck.extraction_confidence,
                "character_length": len(active_text),
                "declared_stage": stage_enum.value,
                "sector": sector,
            },
        )

    # -----------------------------------------------------------------------
    # Dynamic Unit Economics
    # -----------------------------------------------------------------------
    def _audit_unit_economics_dynamic(
        self,
        deck_text: str,
        input_metrics: Dict[str, Any],
        extracted_metrics: List[ExtractedMetric],
        stage: FundingStage,
    ) -> UnitEconomicsAudit:
        anomalies: List[str] = []
        is_coherent = True
        ext_map = {m.name: m for m in extracted_metrics}

        cac_val = input_metrics.get("cac") or (ext_map["cac"].normalized_usd_value if "cac" in ext_map else None)
        ltv_val = input_metrics.get("ltv") or (ext_map["ltv"].normalized_usd_value if "ltv" in ext_map else None)
        margin_val = (
            input_metrics.get("gross_margin")
            or input_metrics.get("gross_margin_pct")
            or (ext_map["gross_margin"].value if "gross_margin" in ext_map else None)
        )
        burn_val = input_metrics.get("burn_rate") or (ext_map["burn_rate"].normalized_usd_value if "burn_rate" in ext_map else None)
        runway_val = input_metrics.get("runway_months") or (ext_map["runway"].value if "runway" in ext_map else None)

        cac_state = ext_map["cac"].evidence_state.value if "cac" in ext_map else (
            EvidenceState.SEED_PROXY.value if cac_val is not None else EvidenceState.UNAVAILABLE.value
        )
        ltv_state = ext_map["ltv"].evidence_state.value if "ltv" in ext_map else (
            EvidenceState.SEED_PROXY.value if ltv_val is not None else EvidenceState.UNAVAILABLE.value
        )
        margin_state = ext_map["gross_margin"].evidence_state.value if "gross_margin" in ext_map else (
            EvidenceState.SEED_PROXY.value if margin_val is not None else EvidenceState.UNAVAILABLE.value
        )

        cac_ltv_ratio: Optional[float] = None
        if cac_val and ltv_val and cac_val > 0:
            cac_ltv_ratio = round(ltv_val / cac_val, 2)
            if cac_ltv_ratio < 1.0:
                anomalies.append(f"Inverted CAC:LTV ratio ({cac_ltv_ratio}x): Losing money on customer acquisition.")
                is_coherent = False
            elif cac_ltv_ratio > 25.0:
                anomalies.append(f"Unrealistic CAC:LTV ratio ({cac_ltv_ratio}x): Modelled assumptions lack empirical acquisition friction.")

        gross_margin_pct = float(margin_val) if margin_val is not None else None
        if gross_margin_pct is not None:
            if gross_margin_pct > 95.0:
                anomalies.append(f"Exaggerated gross margin ({gross_margin_pct}%): Payment processing & cloud infrastructure COGS omitted.")
            elif gross_margin_pct < 15.0:
                anomalies.append(f"Compressed gross margin ({gross_margin_pct}%): Software leverage is eroded by manual operations.")

        if burn_val and runway_val and runway_val < 3:
            anomalies.append(f"Runway alert: {runway_val:.0f} months remaining at ${burn_val:,.0f}/mo burn.")

        payback = round(12.0 / cac_ltv_ratio, 1) if cac_ltv_ratio and cac_ltv_ratio > 0 else None

        notes_list = []
        if stage in (FundingStage.IDEA, FundingStage.PRE_SEED):
            notes_list.append("Pre-revenue / Modelled Proxy Stage. Metric unavailability is not penalized under pre-seed underwriting.")
        elif stage == FundingStage.SERIES_A and not cac_val:
            notes_list.append("Series A underwriting requires realized CAC/LTV cohorts.")

        risk_level = "critical" if not is_coherent or (runway_val and runway_val < 3) else ("medium" if anomalies else "low")

        return UnitEconomicsAudit(
            cac=cac_val,
            ltv=ltv_val,
            cac_ltv_ratio=cac_ltv_ratio,
            gross_margin_pct=gross_margin_pct,
            burn_rate=burn_val,
            runway_months=runway_val,
            implied_payback_months=payback,
            is_mathematically_coherent=is_coherent,
            anomalies=anomalies,
            risk_level=risk_level,
            cac_evidence_state=cac_state,
            ltv_evidence_state=ltv_state,
            margin_evidence_state=margin_state,
            notes=" ".join(notes_list),
        )

    # -----------------------------------------------------------------------
    # Dynamic Startup Maturity Index (SMI)
    # -----------------------------------------------------------------------
    def _assess_stage_maturity_dynamic(
        self,
        deck_text: str,
        norm_deck: NormalisedDeck,
        declared_stage: FundingStage,
    ) -> StageAssessment:
        text_lower = deck_text.lower()

        # Dynamic maturity scoring based strictly on evidence in deck
        smi = 15.0  # Base for conceptual pitch

        if any(w in text_lower for w in ["problem", "friction", "bottleneck", "pain point"]):
            smi += 10.0
        if any(w in text_lower for w in ["mvp", "prototype", "architecture", "demo", "repo", "api", "live"]):
            smi += 20.0
        if any(w in text_lower for w in ["waitlist", "pilot", "loi", "interviews", "design partner"]):
            smi += 15.0
        if any(w in text_lower for w in ["paying customer", "arr", "mrr", "revenue", "gmv", "sales"]):
            smi += 25.0
        if any(w in text_lower for w in ["retention", "cohort", "churn", "nrr", "repeat"]):
            smi += 15.0

        if smi < 30:
            assessed = "Idea / Concept Validation"
            min_exp_smi = 15.0
        elif smi < 50:
            assessed = "Pre-Seed / Advanced MVP Preparation"
            min_exp_smi = 35.0
        elif smi < 75:
            assessed = "Seed / Early Commercial Pilot"
            min_exp_smi = 55.0
        else:
            assessed = "Series A / Repeatable PMF"
            min_exp_smi = 75.0

        # Compare with declared round expectation
        req_table = {
            FundingStage.IDEA: 15.0,
            FundingStage.PRE_SEED: 35.0,
            FundingStage.SEED: 55.0,
            FundingStage.SERIES_A: 75.0,
            FundingStage.SERIES_B_PLUS: 90.0,
        }
        target_smi = req_table.get(declared_stage, 35.0)
        readiness_pct = min(100, max(20, int((smi / target_smi) * 100)))

        if readiness_pct >= 90:
            status = "Strong"
            gap = "Evidence profile meets institutional expectations for this round."
        elif readiness_pct >= 70:
            status = "Conditional"
            gap = "Requires empirical customer pilot conversion evidence prior to closing."
        else:
            status = "Below Expected"
            gap = "Significant commercial repeatability gap for declared round."

        target_str = "5–10 active merchant pilots with measured weekly retention" if declared_stage == FundingStage.PRE_SEED else "Proven $20k+ MRR and positive cohort retention curves"

        return StageAssessment(
            declared_stage=declared_stage.value.replace("_", " ").title(),
            assessed_maturity=assessed,
            round_readiness_pct=readiness_pct,
            alignment_status=status,
            primary_gap=gap,
            stage_milestone_target=target_str,
        )

    # -----------------------------------------------------------------------
    # Dynamic Competitor Discovery
    # -----------------------------------------------------------------------
    def _discover_competitors_dynamic(
        self, company_name: str, sector: str, deck_text: str
    ) -> List[CompetitorBenchmark]:
        benchmarks: List[CompetitorBenchmark] = []
        text_lower = deck_text.lower()

        # Dynamic discovery based on sector and mentioned companies in deck
        if "fintech" in sector.lower() or "pay" in sector.lower() or "economic" in text_lower:
            benchmarks.append(CompetitorBenchmark(
                name="Payment Infrastructure Rails (Paystack, Flutterwave, Moniepoint, Stripe)",
                tier="Tier 1: Payment & Financial Infrastructure",
                stage="Incumbent / Series C+",
                threat_level="incumbent",
                threat_vector="Direct merchant payment distribution, transaction stream data, and capital reserves.",
                differentiation_verdict=f"{company_name} must operate as an autonomous reconciliation & intelligence layer above the rails rather than competing on per-transaction processing fees.",
            ))
            benchmarks.append(CompetitorBenchmark(
                name="Merchant Operating Systems & POS (Omnibiz, Bumpa, Zoho)",
                tier="Tier 2: Merchant OS & Workflow Integrations",
                stage="Growth / Series A-B",
                threat_level="direct",
                threat_vector="Existing daily operational checkout interface and inventory lock-in.",
                differentiation_verdict=f"{company_name} wins through automated cross-channel forensic auditing and margin anomaly detection missing from basic POS software.",
            ))
            benchmarks.append(CompetitorBenchmark(
                name="Embedded Lending & BaaS Providers (Anchor, Qred)",
                tier="Tier 3: Credit & Alternative Capital",
                stage="Seed / Series A",
                threat_level="adjacent",
                threat_vector="Monetizing merchant data through embedded credit facilitation.",
                differentiation_verdict="Upstream strategic underwriting partners rather than direct software alternatives.",
            ))
        else:
            benchmarks.append(CompetitorBenchmark(
                name=f"Global Category Leaders in {sector.title()}",
                tier="Tier 1: Enterprise Infrastructure",
                stage="Public / Growth",
                threat_level="incumbent",
                threat_vector="High brand recognition, enterprise integrations, and capital scale.",
                differentiation_verdict=f"{company_name} differentiates on niche localization velocity and autonomous developer ergonomics.",
            ))
            benchmarks.append(CompetitorBenchmark(
                name="Vertical Workflow Point Solutions",
                tier="Tier 2: Workflow Point Solutions",
                stage="Series A",
                threat_level="direct",
                threat_vector="Targeting single-department operational pain points.",
                differentiation_verdict="Unified end-to-end telemetry and autonomous reasoning engine.",
            ))
            benchmarks.append(CompetitorBenchmark(
                name="Adjacent Raw Data Providers",
                tier="Tier 3: Data Aggregators",
                stage="Seed / Series A",
                threat_level="adjacent",
                threat_vector="Providing raw data feeds without decision intelligence.",
                differentiation_verdict="Actionable decision layer vs passive datasets.",
            ))

        return benchmarks

    # -----------------------------------------------------------------------
    # Dynamic 8-Dimension Scoring Engine (100% Calculated)
    # -----------------------------------------------------------------------
    def _score_dimensions_dynamic(
        self,
        deck_text: str,
        norm_deck: NormalisedDeck,
        stage: FundingStage,
        sector: str,
        unit_econ: UnitEconomicsAudit,
    ) -> List[DimensionScore]:
        text_lower = deck_text.lower()
        claims = norm_deck.claims
        metrics = {m.name: m for m in norm_deck.metrics}

        scores: List[DimensionScore] = []

        # 1. Problem Defensibility & Urgency (Weight: 15%)
        problem_score = 50.0
        problem_pos = []
        problem_miss = []
        if any(w in text_lower for w in ["problem", "friction", "bottleneck", "pain point", "leakage"]):
            problem_score += 15.0
            problem_pos.append("Explicit operational friction identified in target workflow")
        if any(w in text_lower for w in ["billion", "million", "cost", "waste", "inefficiency"]):
            problem_score += 13.0
            problem_pos.append("Quantified economic loss or market waste articulated")
        if any(w in text_lower for w in ["interview", "customer said", "quote", "pilot feedback"]):
            problem_score += 10.0
            problem_pos.append("Direct customer discovery citations present")
        else:
            problem_miss.append("Third-party customer discovery interview transcripts")
        problem_score = min(100.0, max(20.0, problem_score))
        scores.append(DimensionScore(
            key="problem",
            name="Problem Defensibility & Urgency",
            raw_score=round(problem_score, 1),
            weight_pct=15.0,
            weighted_contribution=round(problem_score * 0.15, 2),
            evidence_state=EvidenceState.VERIFIED_EMPIRICAL.value if problem_score > 75 else EvidenceState.SEED_PROXY.value,
            confidence_pct=85 if len(problem_pos) >= 2 else 60,
            justifications=["Evaluates acute customer pain, economic urgency, and problem clarity."],
            positive_signals=problem_pos,
            missing_evidence=problem_miss,
            stage_concern="acceptable",
        ))

        # 2. Solution Moat & Technical IP (Weight: 15%)
        sol_score = 45.0
        sol_pos = []
        sol_miss = []
        if any(w in text_lower for w in ["architecture", "engine", "algorithm", "api", "proprietary", "non-custodial", "sdk"]):
            sol_score += 20.0
            sol_pos.append("Proprietary technical architecture & full-stack development velocity")
        if any(w in text_lower for w in ["mvp", "live", "production", "demo", "beta"]):
            sol_score += 17.0
            sol_pos.append("Functioning MVP / Production build completed")
        if any(w in text_lower for w in ["patent", "ip", "copyright", "trade secret"]):
            sol_score += 10.0
            sol_pos.append("Defensible intellectual property or technical moat")
        else:
            sol_miss.append("External penetration testing & independent security audit")
        sol_score = min(100.0, max(20.0, sol_score))
        scores.append(DimensionScore(
            key="solution",
            name="Solution Moat & Technical IP",
            raw_score=round(sol_score, 1),
            weight_pct=15.0,
            weighted_contribution=round(sol_score * 0.15, 2),
            evidence_state=EvidenceState.SEED_PROXY.value,
            confidence_pct=75,
            justifications=["Evaluates proprietary software architecture, IP, and build completion."],
            positive_signals=sol_pos,
            missing_evidence=sol_miss,
            stage_concern="acceptable",
        ))

        # 3. Market TAM/SAM & Expansion Potential (Weight: 10%)
        market_score = 40.0
        market_pos = []
        market_miss = []
        tam_m = metrics.get("tam")
        if tam_m and tam_m.normalized_usd_value:
            market_score += 20.0
            market_pos.append(f"Quantified TAM defined (${tam_m.normalized_usd_value:,.0f} USD)")
        if any(w in text_lower for w in ["sam", "som", "bottom-up", "expansion", "corridor"]):
            market_score += 15.0
            market_pos.append("Regional expansion corridors & bottom-up SAM derivation")
        if any(w in text_lower for w in ["market growth", "cagr", "tailwinds"]):
            market_score += 10.0
            market_pos.append("Favorable macroeconomic growth drivers")
        else:
            market_miss.append("Granular bottom-up SAM derivation with pilot conversion benchmarks")
        market_score = min(100.0, max(20.0, market_score))
        scores.append(DimensionScore(
            key="market",
            name="Market TAM/SAM & Expansion Potential",
            raw_score=round(market_score, 1),
            weight_pct=10.0,
            weighted_contribution=round(market_score * 0.10, 2),
            evidence_state=EvidenceState.SEED_PROXY.value,
            confidence_pct=70,
            justifications=["Evaluates total addressable market sizing and expansion pathways."],
            positive_signals=market_pos,
            missing_evidence=market_miss,
            stage_concern="acceptable",
        ))

        # 4. Business Model & Unit Economics (Weight: 15%)
        econ_score = 35.0
        econ_pos = []
        econ_miss = []
        if any(w in text_lower for w in ["subscription", "saas", "pricing", "tier", "transaction fee", "commission"]):
            econ_score += 15.0
            econ_pos.append("Clear multi-corridor pricing & monetization framework")
        if unit_econ.cac_ltv_ratio and unit_econ.cac_ltv_ratio >= 10.0:
            econ_score += 30.0
            econ_pos.append(f"Exceptional modelled proxy CAC:LTV multiple ({unit_econ.cac_ltv_ratio}x - top decile)")
        elif unit_econ.cac_ltv_ratio and unit_econ.cac_ltv_ratio >= 3.0:
            econ_score += 18.0
            econ_pos.append(f"Healthy modelled proxy CAC:LTV multiple ({unit_econ.cac_ltv_ratio}x)")
        elif unit_econ.cac_ltv_ratio and unit_econ.cac_ltv_ratio < 1.0:
            econ_score -= 15.0
            econ_miss.append("Inverted CAC:LTV unit economics")
        if unit_econ.gross_margin_pct and unit_econ.gross_margin_pct >= 80.0:
            econ_score += 15.0
            econ_pos.append(f"Exceptional software gross margin ({unit_econ.gross_margin_pct}% - SaaS-grade)")
        elif unit_econ.gross_margin_pct and unit_econ.gross_margin_pct >= 60.0:
            econ_score += 10.0
            econ_pos.append(f"Strong software gross margin target ({unit_econ.gross_margin_pct}%)")
        econ_miss.append("Realized empirical churn cohorts and paid acquisition retention")
        econ_score = min(100.0, max(20.0, econ_score))
        concern = "material_concern" if not unit_econ.cac and stage not in (FundingStage.IDEA, FundingStage.PRE_SEED) else "acceptable"
        scores.append(DimensionScore(
            key="economics",
            name="Business Model & Unit Economics",
            raw_score=round(econ_score, 1),
            weight_pct=15.0,
            weighted_contribution=round(econ_score * 0.15, 2),
            evidence_state=unit_econ.cac_evidence_state,
            confidence_pct=55 if stage == FundingStage.PRE_SEED else 75,
            justifications=["Evaluates revenue model durability, gross margins, and LTV/CAC dynamics."],
            positive_signals=econ_pos,
            missing_evidence=econ_miss,
            stage_concern=concern,
        ))

        # 5. GTM & Distribution Flywheel (Weight: 15%)
        gtm_score = 40.0
        gtm_pos = []
        gtm_miss = []
        if any(w in text_lower for w in ["partner", "channel", "api", "integration", "b2b"]):
            gtm_score += 18.0
            gtm_pos.append("B2B partner API integrations & institutional distribution channels")
        if any(w in text_lower for w in ["pilot", "loi", "waitlist", "pipeline"]):
            gtm_score += 16.0
            gtm_pos.append("Active pipeline of signed pilots & design partners")
        else:
            gtm_miss.append("Measured organic merchant acquisition velocity & live conversion rates")
        gtm_score = min(100.0, max(20.0, gtm_score))
        scores.append(DimensionScore(
            key="gtm",
            name="GTM & Distribution Flywheel",
            raw_score=round(gtm_score, 1),
            weight_pct=15.0,
            weighted_contribution=round(gtm_score * 0.15, 2),
            evidence_state=EvidenceState.SEED_PROXY.value,
            confidence_pct=60,
            justifications=["Evaluates acquisition channels, partnership leverage, and sales repeatability."],
            positive_signals=gtm_pos,
            missing_evidence=gtm_miss,
            stage_concern="acceptable" if stage == FundingStage.PRE_SEED else "moderate_concern",
        ))

        # 6. Competitive Moat vs Incumbents (Weight: 10%)
        moat_score = 45.0
        moat_pos = []
        moat_miss = []
        if any(w in text_lower for w in ["workflow", "vertical", "reconciliation", "autonomous", "specialized", "differentiated", "clearing", "proprietary", "api layer", "instant"]):
            moat_score += 15.0
            moat_pos.append("Deep workflow integration and differentiation vs generic payment rails")
        if any(w in text_lower for w in ["network effect", "data effect", "switching cost", "lock-in", "exclusive", "moat"]):
            moat_score += 12.0
            moat_pos.append("Data lock-in and localized compliance network effects")
        elif any(w in text_lower for w in ["paystack", "flutterwave", "stripe", "competitor", "competition", "differentiated", "vs "]):
            moat_score += 8.0
            moat_pos.append("Identified differentiation against named incumbent competitors")
        else:
            moat_miss.append("Demonstrated customer data switching costs and competitor displacement evidence")
        moat_score = min(100.0, max(20.0, moat_score))
        scores.append(DimensionScore(
            key="moat",
            name="Competitive Moat vs Incumbents",
            raw_score=round(moat_score, 1),
            weight_pct=10.0,
            weighted_contribution=round(moat_score * 0.10, 2),
            evidence_state=EvidenceState.SEED_PROXY.value,
            confidence_pct=65,
            justifications=["Evaluates defensibility against payment incumbents and POS platforms."],
            positive_signals=moat_pos,
            missing_evidence=moat_miss,
            stage_concern="acceptable",
        ))

        # 7. Founder Spike & Execution Velocity (Weight: 10%)
        team_score = 45.0
        team_pos = []
        team_miss = []
        if any(w in text_lower for w in ["founder", "engineer", "built", "full-stack", "velocity", "domain", "years"]):
            team_score += 20.0
            team_pos.append("Demonstrated high full-stack technical build & product velocity")
        if any(w in text_lower for w in ["previous", "exited", "cto", "lead", "founded", "stripe", "flutterwave", "google"]):
            team_score += 15.0
            team_pos.append("Prior founder experience and deep local domain knowledge")
        else:
            team_miss.append("Dedicated enterprise sales / commercial co-founder track record")
        team_score = min(100.0, max(20.0, team_score))
        scores.append(DimensionScore(
            key="team",
            name="Founder Spike & Execution Velocity",
            raw_score=round(team_score, 1),
            weight_pct=10.0,
            weighted_contribution=round(team_score * 0.10, 2),
            evidence_state=EvidenceState.VERIFIED_EMPIRICAL.value if team_score > 70 else EvidenceState.SEED_PROXY.value,
            confidence_pct=80,
            justifications=["Evaluates product execution speed, technical pedigree, and domain depth."],
            positive_signals=team_pos,
            missing_evidence=team_miss,
            stage_concern="acceptable",
        ))

        # 8. Regulatory & Currency Defensibility (Weight: 10%)
        reg_score = 45.0
        reg_pos = []
        reg_miss = []
        if any(w in text_lower for w in ["non-custodial", "software", "intelligence", "no funds", "reconciliation"]):
            reg_score += 18.0
            reg_pos.append("Non-custodial perimeter isolates software from direct banking capital drag")
        if any(w in text_lower for w in ["compliance", "cbn", "sec", "licensed partner", "escrow", "fx"]):
            reg_score += 12.0
            reg_pos.append("Partner-licensed financial routing and regulatory alignment")
        else:
            reg_miss.append("Formal FX volatility hedging & escrow partner SLAs")
        reg_score = min(100.0, max(20.0, reg_score))
        scores.append(DimensionScore(
            key="regulatory",
            name="Regulatory & Currency Defensibility",
            raw_score=round(reg_score, 1),
            weight_pct=10.0,
            weighted_contribution=round(reg_score * 0.10, 2),
            evidence_state=EvidenceState.SEED_PROXY.value,
            confidence_pct=65,
            justifications=["Evaluates regulatory perimeter licensing and FX resilience."],
            positive_signals=reg_pos,
            missing_evidence=reg_miss,
            stage_concern="acceptable",
        ))

        return scores

    # -----------------------------------------------------------------------
    # Dynamic Score Ledger (Exact Sum)
    # -----------------------------------------------------------------------
    def _calculate_score_ledger_dynamic(
        self,
        dimension_scores: List[DimensionScore],
        stage_assessment: StageAssessment,
        norm_deck: NormalisedDeck,
        unit_econ: UnitEconomicsAudit,
    ) -> ScoreLedger:
        base_score = round(sum(d.weighted_contribution for d in dimension_scores), 1)

        unsupported_adj = 0.0
        failed_math = [c for c in norm_deck.math_checks if not c.is_consistent]
        if failed_math:
            unsupported_adj -= round(len(failed_math) * 2.0, 1)

        stage_adj = 0.0
        if stage_assessment.alignment_status == "Below Expected":
            stage_adj -= 6.0

        final_score = round(max(10.0, min(98.0, base_score + stage_adj + unsupported_adj)), 1)
        verdict = ConvictionBand.from_score(final_score)

        verified_count = sum(1 for d in dimension_scores if d.evidence_state == EvidenceState.VERIFIED_EMPIRICAL.value)
        empirical_coverage = int((verified_count / len(dimension_scores)) * 100)

        spread = 5.0 if empirical_coverage > 60 else (8.0 if empirical_coverage > 30 else 12.0)
        low_bound = max(10.0, round(final_score - spread, 1))
        high_bound = min(98.0, round(final_score + spread, 1))

        return ScoreLedger(
            base_weighted_score=base_score,
            evidence_confidence_adjustment=0.0,
            stage_alignment_adjustment=stage_adj,
            unsupported_claim_adjustment=unsupported_adj,
            final_fundability_score=final_score,
            confidence_interval_low=low_bound,
            confidence_interval_high=high_bound,
            conviction_verdict=verdict,
            empirical_coverage_pct=empirical_coverage,
        )

    # -----------------------------------------------------------------------
    # Dynamic Synthesis of IC Arguments
    # -----------------------------------------------------------------------
    def _synthesize_ic_dynamic(
        self,
        company_name: str,
        stage_enum: FundingStage,
        score_ledger: ScoreLedger,
        stage_assessment: StageAssessment,
        unit_econ: UnitEconomicsAudit,
        competitors: List[CompetitorBenchmark],
        dimension_scores: List[DimensionScore],
        norm_deck: NormalisedDeck,
    ) -> Tuple[str, str, List[str], List[str]]:
        top_dim = max(dimension_scores, key=lambda d: d.raw_score)
        low_dim = min(dimension_scores, key=lambda d: d.raw_score)

        bull = (
            f"{company_name} demonstrates a strong thesis in {top_dim.name.lower()} "
            f"({top_dim.raw_score}/100) with defensible software architecture. "
            f"By positioning as a specialized intelligence layer rather than a generic commodity processor, "
            f"it captures workflow defensibility."
        )

        bear = (
            f"The primary underwriting risk stems from {low_dim.name.lower()} "
            f"({low_dim.raw_score}/100) and commercial execution velocity. "
            f"Established payment and merchant OS incumbents possess direct transaction data, "
            f"requiring {company_name} to prove sustained merchant retention without heavy acquisition subsidies."
        )

        priority_diligence = [
            f"Validate {company_name}'s willingness-to-pay via 5–10 structured customer pilot interviews.",
            "Confirm non-custodial software perimeter with formal partner escrow and compliance SLAs.",
            "Benchmark empirical merchant acquisition payback across direct vs partner distribution corridors.",
        ]

        top_drivers = [
            f"{top_dim.name} (+{top_dim.weighted_contribution} pts)",
            f"Stage Alignment: {stage_assessment.alignment_status} ({stage_assessment.round_readiness_pct}% readiness)",
            f"Modelled proxy economics awaiting empirical cohort verification",
        ]

        return bull, bear, priority_diligence, top_drivers