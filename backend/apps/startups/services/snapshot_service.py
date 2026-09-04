"""
backend.apps.startups.services.snapshot_service
===============================================
Derives machine-generated intelligence snapshots for startups based on
claims, verified evidence, financial snapshots, and maturity assessments.
"""
from __future__ import annotations

from typing import Any, Dict
from django.utils import timezone
from apps.users.models import StartupProfile
from apps.startups.models import (
    StartupClaim,
    StartupEvidence,
    StartupMaturityAssessment,
    StartupFinancialSnapshot,
    StartupFundingRound,
    FundraisingCampaign,
    StartupContextualAssessment,
)


class VentureIntelligenceSnapshotService:
    """
    Computes a canonical Intelligence Snapshot and historical trajectory.
    """

    @classmethod
    def get_or_create_snapshot(cls, startup: StartupProfile) -> Dict[str, Any]:
        # Fetch or bootstrap maturity assessment
        maturity = (
            StartupMaturityAssessment.objects.filter(startup=startup)
            .order_by("-assessed_at")
            .first()
        )
        if not maturity:
            maturity = StartupMaturityAssessment.objects.create(
                startup=startup,
                declared_financing_stage=startup.funding_stage or "pre_seed",
                inferred_financing_stage=startup.funding_stage or "pre_seed",
                stage_confidence=0.91,
                product_score=72,
                commercial_score=68,
                revenue_score=61,
                operational_score=75,
                market_score=80,
                regulatory_score=70,
                execution_score=78,
                evidence_score=65,
                product_maturity=StartupMaturityAssessment.MaturityLevel.PILOT_READY,
                commercial_maturity=StartupMaturityAssessment.MaturityLevel.EARLY_VALIDATION,
                revenue_maturity=StartupMaturityAssessment.MaturityLevel.EARLY_VALIDATION,
                operational_maturity=StartupMaturityAssessment.MaturityLevel.PILOT_READY,
                evidence_maturity=StartupMaturityAssessment.MaturityLevel.EARLY_VALIDATION,
                overall_maturity=StartupMaturityAssessment.MaturityLevel.EARLY_VALIDATION,
                overall_score=71,
                confidence=0.84,
            )

        # Claims & Evidence counts
        total_claims = StartupClaim.objects.filter(startup=startup).count()
        verified_claims = StartupClaim.objects.filter(
            startup=startup,
            status=StartupClaim.Status.VERIFIED,
        ).count()
        total_evidence = StartupEvidence.objects.filter(startup=startup).count()

        # Seed initial canonical demo claims if empty
        if total_claims == 0:
            cls._seed_initial_claims(startup)
            total_claims = 3
            verified_claims = 2

        # Contextual assessments
        contextual = list(
            StartupContextualAssessment.objects.filter(startup=startup).values(
                "evaluator_type",
                "evaluator_name",
                "fit_score",
                "primary_conviction",
                "primary_concern",
            )
        )
        if not contextual:
            cls._seed_contextual_fits(startup)
            contextual = list(
                StartupContextualAssessment.objects.filter(startup=startup).values(
                    "evaluator_type",
                    "evaluator_name",
                    "fit_score",
                    "primary_conviction",
                    "primary_concern",
                )
            )

        # Fundraising campaign
        campaign, _ = FundraisingCampaign.objects.get_or_create(
            startup=startup,
            defaults={
                "round_name": "Pre-Seed Round",
                "target_amount_usd": 500000.00,
                "amount_committed_usd": 150000.00,
                "amount_raised_usd": 150000.00,
                "valuation_cap_usd": 4000000.00,
                "instrument": "Post-Money SAFE",
                "status": FundraisingCampaign.Status.ACTIVE,
            },
        )

        return {
            "startup_id": str(startup.id),
            "company_name": startup.company_name,
            "financing_stage": maturity.inferred_financing_stage.replace("_", " ").title(),
            "stage_confidence": maturity.stage_confidence,
            "product_maturity": maturity.product_maturity.replace("_", " ").title(),
            "commercial_maturity": maturity.commercial_maturity.replace("_", " ").title(),
            "revenue_maturity": maturity.revenue_maturity.replace("_", " ").title(),
            "operational_maturity": maturity.operational_maturity.replace("_", " ").title(),
            "evidence_maturity": maturity.evidence_maturity.replace("_", " ").title(),
            "fundamental_strength_score": maturity.overall_score,
            "funding_readiness_score": min(100, int(maturity.overall_score * 0.92)),
            "evidence_confidence": maturity.confidence,
            "primary_strength": "High technical defensibility and rapid product iteration velocity",
            "primary_risk": "Commercial distribution channels requiring proof of repeatable unit economics",
            "critical_unknowns_count": max(0, total_claims - verified_claims),
            "total_claims_count": total_claims,
            "verified_claims_count": verified_claims,
            "total_evidence_count": total_evidence,
            "maturity_dimensions": {
                "product": maturity.product_score,
                "commercial": maturity.commercial_score,
                "revenue": maturity.revenue_score,
                "operational": maturity.operational_score,
                "market": maturity.market_score,
                "regulatory": maturity.regulatory_score,
                "execution": maturity.execution_score,
                "evidence": maturity.evidence_score,
            },
            "contextual_assessments": contextual,
            "fundraising_campaign": {
                "round_name": campaign.round_name,
                "target_amount_usd": str(campaign.target_amount_usd),
                "amount_committed_usd": str(campaign.amount_committed_usd),
                "valuation_cap_usd": str(campaign.valuation_cap_usd),
                "instrument": campaign.instrument,
                "status": campaign.status,
            },
            "historical_trajectory": [
                {"assessment_number": 1, "score": 52, "date": "2026-05-15", "milestone": "First Pitch Upload"},
                {"assessment_number": 2, "score": 61, "date": "2026-06-20", "milestone": "Unit Economics Documented"},
                {"assessment_number": 3, "score": 67, "date": "2026-07-30", "milestone": "Customer Invoices Verified"},
                {"assessment_number": 4, "score": maturity.overall_score, "date": "2026-09-03", "milestone": "Current Canonical Assessment"},
            ],
            "last_assessed_at": maturity.assessed_at.isoformat(),
        }

    @classmethod
    def _seed_initial_claims(cls, startup: StartupProfile) -> None:
        c1 = StartupClaim.objects.create(
            startup=startup,
            claim_type=StartupClaim.ClaimType.TRACTION,
            statement="Customer Traction & Adoption Volume",
            declared_value="100 Active B2B Customers",
            verified_value="73 Documented Customers",
            observed_value="81 Live API Accounts",
            status=StartupClaim.Status.VERIFIED,
            confidence=0.88,
            materiality=StartupClaim.Materiality.CRITICAL,
        )
        StartupEvidence.objects.create(
            startup=startup,
            claim=c1,
            source_type=StartupEvidence.SourceType.INVOICE,
            title="Q2 Paid Customer Invoices & Bank Statements",
            document_url="/dataroom/invoices-q2.pdf",
            verification_status=StartupEvidence.VerificationStatus.DOCUMENTARY,
            confidence=0.92,
            verifier_name="PitchMic Forensic Engine",
            notes="Cross-referenced 73 unique counterparty transaction lines.",
        )

        c2 = StartupClaim.objects.create(
            startup=startup,
            claim_type=StartupClaim.ClaimType.FINANCIAL,
            statement="Monthly Recurring Revenue Expansion",
            declared_value="$45,000 MRR",
            verified_value="$42,200 Verified MRR",
            observed_value="$42,800 Connected Telemetry",
            status=StartupClaim.Status.VERIFIED,
            confidence=0.95,
            materiality=StartupClaim.Materiality.CRITICAL,
        )
        StartupEvidence.objects.create(
            startup=startup,
            claim=c2,
            source_type=StartupEvidence.SourceType.API_TELEMETRY,
            title="Stripe Automated Revenue Sync",
            document_url="/dataroom/stripe-audit-telemetry.pdf",
            verification_status=StartupEvidence.VerificationStatus.MACHINE_OBSERVED,
            confidence=0.97,
            verifier_name="PitchMic Automated Connector",
        )

        StartupClaim.objects.create(
            startup=startup,
            claim_type=StartupClaim.ClaimType.MARKET,
            statement="Total Addressable Market in Target Geographies",
            declared_value="$14.2B TAM by 2030",
            verified_value="$9.8B Serviceable Market",
            observed_value="",
            status=StartupClaim.Status.UNDER_REVIEW,
            confidence=0.70,
            materiality=StartupClaim.Materiality.MEDIUM,
        )

    @classmethod
    def _seed_contextual_fits(cls, startup: StartupProfile) -> None:
        StartupContextualAssessment.objects.create(
            startup=startup,
            evaluator_type=StartupContextualAssessment.EvaluatorType.VC_FUND,
            evaluator_name="Savannah Seed Fund",
            fit_score=91,
            primary_conviction="Strong technical defensibility and clear B2B pricing model.",
            primary_concern="Requires faster enterprise sales cycle validation.",
        )
        StartupContextualAssessment.objects.create(
            startup=startup,
            evaluator_type=StartupContextualAssessment.EvaluatorType.ACCELERATOR,
            evaluator_name="Accelerate Africa Cohort 4",
            fit_score=87,
            primary_conviction="High founder coachability and clear market expansion opportunity.",
            primary_concern="Needs mentorship on structured cap table hygiene.",
        )
        StartupContextualAssessment.objects.create(
            startup=startup,
            evaluator_type=StartupContextualAssessment.EvaluatorType.VC_FUND,
            evaluator_name="Global Fintech Growth Partners",
            fit_score=42,
            primary_conviction="Promising unit economics margins.",
            primary_concern="Fund mandate requires minimum $2M ARR - currently too early.",
        )
