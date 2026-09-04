"""
apps.investors.admin
====================
Django admin registration for the Institutional Investment Operating System.
"""
from django.contrib import admin
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
    TermSheetRevision,
)


@admin.register(InvestmentFirm)
class InvestmentFirmAdmin(admin.ModelAdmin):
    list_display = ["name", "fund_type", "aum_usd", "headquarters", "created_at"]
    search_fields = ["name", "slug"]


@admin.register(FirmMember)
class FirmMemberAdmin(admin.ModelAdmin):
    list_display = ["user", "firm", "institutional_role", "can_vote_ic", "can_issue_term_sheet"]
    list_filter = ["institutional_role", "can_vote_ic"]


@admin.register(InvestmentFund)
class InvestmentFundAdmin(admin.ModelAdmin):
    list_display = ["name", "firm", "vintage_year", "fund_size_usd", "deployed_capital_usd", "is_active"]
    list_filter = ["is_active", "stage_focus"]


@admin.register(InvestmentMandate)
class InvestmentMandateAdmin(admin.ModelAdmin):
    list_display = ["fund", "pre_revenue_allowed", "min_revenue_usd", "updated_at"]


@admin.register(InvestmentCase)
class InvestmentCaseAdmin(admin.ModelAdmin):
    list_display = [
        "startup", "fund", "status", "priority_tier", "thesis_fit_score",
        "underwriting_score", "evidence_confidence_score", "stage_conflict_detected"
    ]
    list_filter = ["status", "priority_tier", "stage_conflict_detected"]
    search_fields = ["startup__company_name", "fund__name"]


@admin.register(DealClaim)
class DealClaimAdmin(admin.ModelAdmin):
    list_display = ["claim_id", "investment_case", "category", "materiality", "verification_status"]
    list_filter = ["category", "verification_status", "materiality"]


@admin.register(DealEvidence)
class DealEvidenceAdmin(admin.ModelAdmin):
    list_display = ["claim", "claimed_value", "audited_value", "confidence", "audited_at"]


@admin.register(DealFinancialModel)
class DealFinancialModelAdmin(admin.ModelAdmin):
    list_display = ["investment_case", "declared_mrr_usd", "audited_mrr_usd", "runway_months", "discrepancy_detected"]


@admin.register(InvestmentMemo)
class InvestmentMemoAdmin(admin.ModelAdmin):
    list_display = ["investment_case", "generated_at"]


@admin.register(ICDebateSession)
class ICDebateSessionAdmin(admin.ModelAdmin):
    list_display = ["investment_case", "status", "created_at"]


@admin.register(ICPartnerVote)
class ICPartnerVoteAdmin(admin.ModelAdmin):
    list_display = ["investment_case", "partner", "vote", "conviction_score", "recommended_check_usd"]
    list_filter = ["vote"]


@admin.register(TermSheetRevision)
class TermSheetRevisionAdmin(admin.ModelAdmin):
    list_display = ["investment_case", "version_number", "instrument", "investment_amount_usd", "status"]
    list_filter = ["status", "instrument"]


@admin.register(PortfolioCompany)
class PortfolioCompanyAdmin(admin.ModelAdmin):
    list_display = ["company_name", "fund", "invested_capital_usd", "current_fair_value_usd", "holding_multiple", "follow_on_status"]
    list_filter = ["follow_on_status", "is_active"]


@admin.register(PortfolioAlert)
class PortfolioAlertAdmin(admin.ModelAdmin):
    list_display = ["title", "portfolio_company", "alert_type", "severity", "is_resolved", "created_at"]
    list_filter = ["alert_type", "severity", "is_resolved"]


@admin.register(OutcomeCalibrationRecord)
class OutcomeCalibrationRecordAdmin(admin.ModelAdmin):
    list_display = ["investment_case", "actual_outcome", "realized_multiple", "recorded_at"]
