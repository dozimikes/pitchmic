"""
backend.apps.startups.services.snapshot_service
===============================================
Derives machine-generated intelligence snapshots for startups based on
claims, verified evidence, financial snapshots, and maturity assessments.

All values are sourced from real startup data. No demo data is seeded.
An incomplete profile returns honest zeroes and nulls - the frontend is
responsible for rendering empty states.
"""
from __future__ import annotations

from typing import Any, Dict, List

from apps.users.models import StartupProfile
from apps.startups.models import (
    StartupClaim,
    StartupEvidence,
    StartupMaturityAssessment,
    FundraisingCampaign,
    StartupContextualAssessment,
)


class VentureIntelligenceSnapshotService:
    """
    Computes a canonical Intelligence Snapshot from real startup data.
    """

    @classmethod
    def get_or_create_snapshot(cls, startup: StartupProfile) -> Dict[str, Any]:
        # Most recent maturity assessment - may be None for new startups
        maturity = (
            StartupMaturityAssessment.objects.filter(startup=startup)
            .order_by("-assessed_at")
            .first()
        )

        # Real claim and evidence counts - no manual overrides
        total_claims = StartupClaim.objects.filter(startup=startup).count()
        verified_claims = StartupClaim.objects.filter(
            startup=startup,
            status=StartupClaim.Status.VERIFIED,
        ).count()
        total_evidence = StartupEvidence.objects.filter(startup=startup).count()

        # Only real contextual assessments added by the platform or team
        contextual = list(
            StartupContextualAssessment.objects.filter(startup=startup).values(
                "evaluator_type",
                "evaluator_name",
                "fit_score",
                "primary_conviction",
                "primary_concern",
            )
        )

        # Fundraising campaign - may be None for startups that haven't set one up
        campaign = FundraisingCampaign.objects.filter(startup=startup).first()
        campaign_data = None
        if campaign:
            campaign_data = {
                "round_name": campaign.round_name,
                "target_amount_usd": str(campaign.target_amount_usd),
                "amount_committed_usd": str(campaign.amount_committed_usd),
                "valuation_cap_usd": str(campaign.valuation_cap_usd),
                "instrument": campaign.instrument,
                "status": campaign.status,
            }

        # Historical trajectory - built from real maturity assessments only
        trajectory: List[Dict[str, Any]] = []
        if maturity:
            all_assessments = (
                StartupMaturityAssessment.objects.filter(startup=startup)
                .order_by("assessed_at")
                .values("overall_score", "assessed_at")
            )
            for i, a in enumerate(all_assessments, start=1):
                trajectory.append({
                    "assessment_number": i,
                    "score": a["overall_score"],
                    "date": a["assessed_at"].date().isoformat(),
                })

        # Derive primary strength and risk from the highest and lowest real
        # dimension scores rather than using a hardcoded string for every startup
        primary_strength = None
        primary_risk = None
        if maturity:
            dimensions = {
                "product": maturity.product_score,
                "commercial": maturity.commercial_score,
                "revenue": maturity.revenue_score,
                "operational": maturity.operational_score,
                "market": maturity.market_score,
                "regulatory": maturity.regulatory_score,
                "execution": maturity.execution_score,
                "evidence": maturity.evidence_score,
            }
            sorted_dims = sorted(dimensions.items(), key=lambda x: x[1], reverse=True)
            best = sorted_dims[0]
            worst = sorted_dims[-1]
            primary_strength = f"Strongest dimension: {best[0].title()} ({best[1]}/100)"
            primary_risk = f"Weakest dimension: {worst[0].title()} ({worst[1]}/100) - needs improvement"

        return {
            "startup_id": str(startup.id),
            "company_name": startup.company_name,
            "financing_stage": (
                maturity.inferred_financing_stage.replace("_", " ").title()
                if maturity else None
            ),
            "stage_confidence": maturity.stage_confidence if maturity else None,
            "product_maturity": (
                maturity.product_maturity.replace("_", " ").title()
                if maturity else None
            ),
            "commercial_maturity": (
                maturity.commercial_maturity.replace("_", " ").title()
                if maturity else None
            ),
            "revenue_maturity": (
                maturity.revenue_maturity.replace("_", " ").title()
                if maturity else None
            ),
            "operational_maturity": (
                maturity.operational_maturity.replace("_", " ").title()
                if maturity else None
            ),
            "evidence_maturity": (
                maturity.evidence_maturity.replace("_", " ").title()
                if maturity else None
            ),
            "fundamental_strength_score": maturity.overall_score if maturity else None,
            "funding_readiness_score": (
                min(100, int(maturity.overall_score * 0.92)) if maturity else None
            ),
            "evidence_confidence": maturity.confidence if maturity else None,
            "primary_strength": primary_strength,
            "primary_risk": primary_risk,
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
            } if maturity else {},
            "contextual_assessments": contextual,
            "fundraising_campaign": campaign_data,
            "historical_trajectory": trajectory,
            "last_assessed_at": maturity.assessed_at.isoformat() if maturity else None,
        }
