"""
apps.investors.serializers
==========================
DRF serializers for the Institutional Investment Operating System.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import (
    DealClaim,
    DealEvidence,
    DealFinancialModel,
    FirmMember,
    ICDebateSession,
    ICPartnerVote,
    InvestmentCase,
    InvestmentFirm,
    InvestmentFund,
    InvestmentMandate,
    InvestmentMemo,
    OutcomeCalibrationRecord,
    PortfolioAlert,
    PortfolioCompany,
    RelationshipEdge,
    TermSheetRevision,
)


class FirmMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = FirmMember
        fields = "__all__"


class InvestmentFundSerializer(serializers.ModelSerializer):
    firm_name = serializers.CharField(source="firm.name", read_only=True)
    active_cases_count = serializers.SerializerMethodField()

    class Meta:
        model = InvestmentFund
        fields = "__all__"

    def get_active_cases_count(self, obj):
        return obj.investment_cases.exclude(status__in=["PASSED"]).count()


class InvestmentFirmSerializer(serializers.ModelSerializer):
    funds = InvestmentFundSerializer(many=True, read_only=True)
    members = FirmMemberSerializer(many=True, read_only=True)

    class Meta:
        model = InvestmentFirm
        fields = "__all__"


class InvestmentMandateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvestmentMandate
        fields = "__all__"


class DealEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DealEvidence
        fields = "__all__"


class DealClaimSerializer(serializers.ModelSerializer):
    evidence_audit = DealEvidenceSerializer(read_only=True)

    class Meta:
        model = DealClaim
        fields = "__all__"


class DealFinancialModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = DealFinancialModel
        fields = "__all__"


class InvestmentMemoSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvestmentMemo
        fields = "__all__"


class ICPartnerVoteSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.full_name", read_only=True)
    partner_email = serializers.CharField(source="partner.email", read_only=True)

    class Meta:
        model = ICPartnerVote
        fields = "__all__"


class ICDebateSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ICDebateSession
        fields = "__all__"


class TermSheetRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TermSheetRevision
        fields = "__all__"


class PortfolioAlertSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="portfolio_company.company_name", read_only=True)

    class Meta:
        model = PortfolioAlert
        fields = "__all__"


class PortfolioCompanySerializer(serializers.ModelSerializer):
    alerts = PortfolioAlertSerializer(many=True, read_only=True)
    active_alerts_count = serializers.SerializerMethodField()

    class Meta:
        model = PortfolioCompany
        fields = "__all__"

    def get_active_alerts_count(self, obj):
        return obj.alerts.filter(is_resolved=False).count()


class InvestmentCaseListSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="startup.company_name", read_only=True)
    industry = serializers.CharField(source="startup.industry", read_only=True)
    geography = serializers.CharField(source="startup.location", read_only=True)
    fund_name = serializers.CharField(source="fund.name", read_only=True)
    lead_partner_name = serializers.CharField(source="lead_partner.full_name", read_only=True)
    claims_count = serializers.SerializerMethodField()

    class Meta:
        model = InvestmentCase
        fields = [
            "id", "company_name", "industry", "geography", "fund_name",
            "lead_partner_name", "status", "priority_tier", "sourcing_channel",
            "thesis_fit_score", "underwriting_score", "evidence_confidence_score",
            "overall_readiness_score", "declared_stage", "inferred_stage",
            "stage_conflict_detected", "portfolio_conflict_detected",
            "target_ask_usd", "proposed_check_usd", "claims_count",
            "created_at", "updated_at",
        ]

    def get_claims_count(self, obj):
        return obj.claims.count()


class InvestmentCaseDetailSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="startup.company_name", read_only=True)
    startup_details = serializers.SerializerMethodField()
    claims = DealClaimSerializer(many=True, read_only=True)
    financial_model = DealFinancialModelSerializer(read_only=True)
    memo = InvestmentMemoSerializer(read_only=True)
    partner_votes = ICPartnerVoteSerializer(many=True, read_only=True)
    term_sheets = TermSheetRevisionSerializer(many=True, read_only=True)
    ic_debates = ICDebateSessionSerializer(many=True, read_only=True)

    class Meta:
        model = InvestmentCase
        fields = "__all__"

    def get_startup_details(self, obj):
        st = obj.startup
        return {
            "id": st.id,
            "company_name": st.company_name,
            "industry": st.industry,
            "location": st.location,
            "website": st.website,
            "funding_stage": st.funding_stage,
            "total_funding_raised": float(st.total_funding_raised or 0),
            "current_revenue": float(st.current_revenue or 0),
            "customer_count": st.customer_count or 0,
            "employee_count": st.employee_count or "1-10",
            "tam": float(st.tam or 0),
        }


class ChallengeModeInputSerializer(serializers.Serializer):
    """Input when an investor challenges an AI assessment with new evidence."""
    dimension = serializers.CharField(help_text="e.g. Commercial Traction, Market Timing, Technical Moat")
    new_score = serializers.FloatField(min_value=0, max_value=100)
    evidence_justification = serializers.CharField()


class RelationshipEdgeSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.user.full_name", read_only=True)
    connection_type_display = serializers.CharField(source="get_connection_type_display", read_only=True)

    class Meta:
        model = RelationshipEdge
        fields = "__all__"


class IngestDealInputSerializer(serializers.Serializer):
    """Payload for inbound sourcing / deal ingestion."""
    startup_id = serializers.IntegerField()
    fund_id = serializers.IntegerField()
    target_ask_usd = serializers.DecimalField(max_digits=15, decimal_places=2, default=500000)
    sourcing_channel = serializers.CharField(default="marketplace")
    notes = serializers.CharField(required=False, allow_blank=True)


class CounterOfferInputSerializer(serializers.Serializer):
    """Payload for drafting a new counter-offer revision."""
    investment_amount_usd = serializers.DecimalField(max_digits=15, decimal_places=2)
    valuation_cap_usd = serializers.DecimalField(max_digits=15, decimal_places=2)
    discount_pct = serializers.FloatField(default=20.0)
    target_ownership_pct = serializers.FloatField(default=5.0)
    instrument = serializers.CharField(default="SAFE")
    board_rights = serializers.CharField(default="Observer Seat")
    pro_rata_rights = serializers.BooleanField(default=True)
    information_rights = serializers.BooleanField(default=True)

