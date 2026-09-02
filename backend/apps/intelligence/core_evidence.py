import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class DataClassification(str, Enum):
    PUBLIC = "PUBLIC"
    INTERNAL = "INTERNAL"
    CONFIDENTIAL = "CONFIDENTIAL"
    RESTRICTED = "RESTRICTED"
    HIGHLY_RESTRICTED = "HIGHLY_RESTRICTED"


class VerificationStatus(str, Enum):
    VERIFIED = "VERIFIED"
    CONTRADICTED = "CONTRADICTED"
    UNVERIFIED = "UNVERIFIED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class EvidenceSourceType(str, Enum):
    PITCH_DECK = "PITCH_DECK"
    FINANCIAL_STATEMENT = "FINANCIAL_STATEMENT"
    CAP_TABLE = "CAP_TABLE"
    COMPANY_WEBSITE = "COMPANY_WEBSITE"
    CORPORATE_REGISTRY = "CORPORATE_REGISTRY"
    NEWS_ARTICLE = "NEWS_ARTICLE"
    FOUNDER_INTERVIEW = "FOUNDER_INTERVIEW"
    CRM_METRICS = "CRM_METRICS"
    BANK_FEED = "BANK_FEED"


@dataclass
class EvidenceObservation:
    observation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    metric_key: str = ""
    extracted_value: Any = None
    currency: Optional[str] = "USD"
    unit: Optional[str] = None
    raw_quote: str = ""
    locator: str = ""  # e.g., "slide_4", "page_12_table_2"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    extractor_version: str = "v2.0"
    confidence: float = 1.0


@dataclass
class EvidenceClaim:
    claim_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    subject: str = ""
    metric_key: str = ""
    claimed_value: Any = None
    raw_text: str = ""
    source_type: EvidenceSourceType = EvidenceSourceType.PITCH_DECK
    source_id: str = ""
    locator: str = ""
    classification: DataClassification = DataClassification.CONFIDENTIAL
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ClaimVerificationResult:
    claim_id: str
    status: VerificationStatus
    verified_value: Optional[Any] = None
    delta_percentage: Optional[float] = None
    confidence_score: float = 1.0
    evidence_observations: List[EvidenceObservation] = field(default_factory=list)
    verification_notes: str = ""
    verified_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class EvidenceProvenanceEngine:
    """
    Evidence & Provenance Traceability Engine.
    Ensures every score, assertion, and insight maps strictly to verifiable observations.
    Traceability lineage: Score -> Dimension -> Claims -> Observations -> Source.
    """

    @staticmethod
    def compute_sha256(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    @staticmethod
    def compute_payload_hash(data: Dict[str, Any]) -> str:
        serialized = json.dumps(data, sort_keys=True, default=str).encode("utf-8")
        return hashlib.sha256(serialized).hexdigest()

    @classmethod
    def verify_claim(
        cls,
        claim: EvidenceClaim,
        supporting_observations: List[EvidenceObservation],
        contradicting_observations: Optional[List[EvidenceObservation]] = None,
    ) -> ClaimVerificationResult:
        contradictions = contradicting_observations or []

        if contradictions:
            first_contra = contradictions[0]
            delta = None
            if isinstance(claim.claimed_value, (int, float)) and isinstance(
                first_contra.extracted_value, (int, float)
            ):
                if claim.claimed_value != 0:
                    delta = round(
                        ((first_contra.extracted_value - claim.claimed_value) / claim.claimed_value) * 100,
                        2,
                    )

            return ClaimVerificationResult(
                claim_id=claim.claim_id,
                status=VerificationStatus.CONTRADICTED,
                verified_value=first_contra.extracted_value,
                delta_percentage=delta,
                confidence_score=0.95,
                evidence_observations=contradictions,
                verification_notes=f"Contradiction detected against observation in {first_contra.locator}: {first_contra.raw_quote}",
            )

        if not supporting_observations:
            return ClaimVerificationResult(
                claim_id=claim.claim_id,
                status=VerificationStatus.UNVERIFIED,
                verified_value=None,
                delta_percentage=None,
                confidence_score=0.3,
                evidence_observations=[],
                verification_notes="No external or secondary observation found to corroborate claim.",
            )

        best_obs = supporting_observations[0]
        return ClaimVerificationResult(
            claim_id=claim.claim_id,
            status=VerificationStatus.VERIFIED,
            verified_value=best_obs.extracted_value,
            delta_percentage=0.0,
            confidence_score=best_obs.confidence,
            evidence_observations=supporting_observations,
            verification_notes=f"Corroborated by observation {best_obs.observation_id} in {best_obs.locator}.",
        )

    @classmethod
    def build_score_provenance_ledger(
        cls,
        dimensions: Dict[str, Dict[str, Any]],
        verifications: List[ClaimVerificationResult],
    ) -> Dict[str, Any]:
        """
        Builds an immutable, auditable score provenance ledger.
        """
        verified_count = sum(1 for v in verifications if v.status == VerificationStatus.VERIFIED)
        contradicted_count = sum(1 for v in verifications if v.status == VerificationStatus.CONTRADICTED)
        unverified_count = sum(1 for v in verifications if v.status == VerificationStatus.UNVERIFIED)
        total = len(verifications) or 1

        coverage_ratio = round((verified_count / total) * 100, 1)

        ledger = {
            "evidence_coverage_percentage": coverage_ratio,
            "total_claims_audited": len(verifications),
            "verified_claims_count": verified_count,
            "contradicted_claims_count": contradicted_count,
            "unverified_claims_count": unverified_count,
            "dimensions_lineage": dimensions,
            "verification_details": [asdict(v) for v in verifications],
            "ledger_hash": cls.compute_payload_hash(dimensions),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        return ledger
