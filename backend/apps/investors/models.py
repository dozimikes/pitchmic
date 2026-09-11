"""
apps.investors.models
=====================
Institutional Venture Capital Investment Operating System.

Models:
  InvestmentFirm            - VC firm institutional structure
  FirmMember                - Firm team member with granular institutional role & permissions
  InvestmentFund            - Fund lifecycle (e.g. Fund III $75M) with deployment targets
  InvestmentMandate         - Machine-readable thesis & investment policy
  InvestmentCase            - Central orchestration spine connecting sourcing to exit
  DealClaim                 - Granular assertion extracted from company decks and data rooms
  DealEvidence              - Quantitative & qualitative verification detail for claims
  DealFinancialModel        - Financial forensics, MRR verification, and stress-test scenarios
  InvestmentMemo            - Evidence-linked IC memo (bull/bear, kill conditions, diligence)
  ICDebateSession           - IC deliberation room with Investor Challenge Mode
  ICPartnerVote             - Partner conviction voting & allocation recommendations
  TermSheetRevision         - Versioned term sheet negotiation ledger & closing checklist
  PortfolioCompany          - Active portfolio company performance tracking
  PortfolioAlert            - Real-time automated operational alerts (runway, growth, follow-on)
  OutcomeCalibrationRecord  - Longitudinal outcome learning & investor-specific calibration
"""
from __future__ import annotations

from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.users.models import StartupProfile


# ──────────────────────────────────────────────────────────────────────────────
# 1. Institutional Firm & Fund Hierarchy
# ──────────────────────────────────────────────────────────────────────────────

class InvestmentFirm(models.Model):
    """VC / Institutional Venture Firm entity."""
    name = models.CharField(_("firm name"), max_length=255)
    slug = models.SlugField(unique=True, max_length=120)
    website = models.URLField(_("website"), blank=True)
    headquarters = models.CharField(_("headquarters"), max_length=255, default="Lagos, Nigeria")
    investment_regions = models.CharField(_("investment regions"), max_length=500, blank=True,
                                          help_text=_("e.g. West Africa, East Africa, Pan-African, Global"))
    fund_type = models.CharField(
        _("fund type"), max_length=50,
        choices=[
            ("venture_capital", _("Venture Capital")),
            ("accelerator_fund", _("Accelerator Fund")),
            ("angel_syndicate", _("Angel Syndicate")),
            ("corporate_vc", _("Corporate VC")),
            ("growth_equity", _("Growth Equity")),
        ],
        default="venture_capital",
    )
    founded_year = models.PositiveIntegerField(null=True, blank=True)
    aum_usd = models.DecimalField(_("AUM (USD)"), max_digits=18, decimal_places=2, default=0)
    logo_url = models.URLField(_("logo URL"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("investment firm")
        verbose_name_plural = _("investment firms")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} (${self.aum_usd / Decimal(1_000_000):.1f}M AUM)"


class FirmMember(models.Model):
    """Institutional team member with granular permissions and voting rights."""
    ROLE_CHOICES = [
        ("GP", _("General Partner")),
        ("MANAGING_PARTNER", _("Managing Partner")),
        ("PARTNER", _("Partner")),
        ("PRINCIPAL", _("Principal")),
        ("INVESTMENT_DIRECTOR", _("Investment Director")),
        ("INVESTMENT_MANAGER", _("Investment Manager")),
        ("ASSOCIATE", _("Associate")),
        ("ANALYST", _("Analyst")),
        ("SCOUT", _("Scout")),
        ("OPERATING_PARTNER", _("Operating Partner")),
        ("IC_MEMBER", _("Investment Committee Member")),
        ("ADMIN", _("Firm Admin")),
    ]

    firm = models.ForeignKey(InvestmentFirm, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="firm_memberships")
    title = models.CharField(_("title"), max_length=150, default="Partner")
    institutional_role = models.CharField(_("role"), max_length=30, choices=ROLE_CHOICES, default="PARTNER")
    
    # Permission switches
    can_vote_ic = models.BooleanField(_("can vote on IC"), default=True)
    can_issue_term_sheet = models.BooleanField(_("can issue term sheet"), default=False)
    can_underwrite = models.BooleanField(_("can underwrite deals"), default=True)
    is_lead_partner = models.BooleanField(_("is lead partner"), default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("firm member")
        verbose_name_plural = _("firm members")
        unique_together = [["firm", "user"]]

    def __str__(self) -> str:
        return f"{self.user.email} - {self.get_institutional_role_display()} at {self.firm.name}"


class InvestmentFund(models.Model):
    """A specific fund vehicle under the firm (e.g. Savannah Alpha Fund II - $50M)."""
    firm = models.ForeignKey(InvestmentFirm, on_delete=models.CASCADE, related_name="funds")
    name = models.CharField(_("fund name"), max_length=255)
    vintage_year = models.PositiveIntegerField(default=2026)
    fund_size_usd = models.DecimalField(_("fund size (USD)"), max_digits=18, decimal_places=2, default=50_000_000)
    deployed_capital_usd = models.DecimalField(_("deployed capital (USD)"), max_digits=18, decimal_places=2, default=0)
    
    stage_focus = models.CharField(
        _("stage focus"), max_length=50,
        choices=[
            ("pre_seed", _("Pre-Seed")),
            ("seed", _("Seed")),
            ("series_a", _("Series A")),
            ("multi_stage", _("Pre-Seed to Series A")),
        ],
        default="multi_stage",
    )
    geography_focus = models.CharField(_("geography focus"), max_length=500, default="Nigeria, Kenya, South Africa, Egypt, Ghana")
    sector_focus = models.CharField(_("sector focus"), max_length=500, default="Fintech, Logistics, B2B SaaS, Healthtech, Climate")
    
    min_check_size_usd = models.DecimalField(_("min check size (USD)"), max_digits=15, decimal_places=2, default=150_000)
    max_check_size_usd = models.DecimalField(_("max check size (USD)"), max_digits=15, decimal_places=2, default=1_500_000)
    target_ownership_pct_min = models.FloatField(_("target ownership min (%)"), default=7.0)
    target_ownership_pct_max = models.FloatField(_("target ownership max (%)"), default=15.0)
    
    has_reserves = models.BooleanField(_("reserves for follow-on"), default=True)
    reserves_ratio = models.FloatField(_("reserves ratio"), default=0.50, help_text=_("50% of fund held for follow-ons"))
    is_active = models.BooleanField(_("active fund"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("investment fund")
        verbose_name_plural = _("investment funds")
        ordering = ["-vintage_year", "name"]

    def __str__(self) -> str:
        return f"{self.firm.name} - {self.name} (${self.fund_size_usd / Decimal(1_000_000):.0f}M)"


class InvestmentMandate(models.Model):
    """Machine-readable investment mandate derived from the firm's structured thesis."""
    fund = models.OneToOneField(InvestmentFund, on_delete=models.CASCADE, related_name="mandate")
    thesis_summary = models.TextField(_("thesis summary"), blank=True)
    
    # Machine-readable mandate rules
    stage_rules = models.JSONField(
        default=list, blank=True,
        help_text=_("['pre_seed', 'seed']")
    )
    geography_whitelist = models.JSONField(
        default=list, blank=True,
        help_text=_("['NG', 'KE', 'ZA', 'EG', 'GH', 'RW']")
    )
    sector_whitelist = models.JSONField(
        default=list, blank=True,
        help_text=_("['fintech', 'logistics', 'b2b_saas', 'healthtech', 'climate']")
    )
    min_revenue_usd = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    pre_revenue_allowed = models.BooleanField(default=True)
    founder_preferences = models.JSONField(
        default=dict, blank=True,
        help_text=_("{'technical_founder_required': true, 'full_time_required': true, 'repeat_founder_bonus': true}")
    )
    exclusion_list = models.JSONField(
        default=list, blank=True,
        help_text=_("['crypto_speculative', 'gambling', 'tobacco', 'weapons']")
    )
    target_moat_signals = models.JSONField(
        default=list, blank=True,
        help_text=_("['data_network_effects', 'regulatory_licensing', 'infrastructure_lock_in']")
    )
    
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("investment mandate")
        verbose_name_plural = _("investment mandates")

    def __str__(self) -> str:
        return f"Mandate for {self.fund}"


# ──────────────────────────────────────────────────────────────────────────────
# 2. The Core Spine: Investment Case
# ──────────────────────────────────────────────────────────────────────────────

class InvestmentCase(models.Model):
    """
    The central object in Pitchmic's Institutional Investment Operating System.
    Connects Sourcing, Thesis Fit, Forensics, Claims, Financial Scenarios,
    IC Deliberation, Term Sheets, and Portfolio Performance.
    """
    STATUS_CHOICES = [
        ("SOURCED", _("Sourced")),
        ("INBOX", _("Inbound Inbox")),
        ("SCREENING", _("Screening")),
        ("UNDERWRITING", _("Deep Underwriting")),
        ("IC_REVIEW", _("Investment Committee Review")),
        ("TERM_SHEET", _("Term Sheet Issued")),
        ("NEGOTIATION", _("In Negotiation")),
        ("CLOSING", _("Closing Checklist")),
        ("PORTFOLIO", _("Active Portfolio")),
        ("WATCHLIST", _("Watchlist / Milestone Monitor")),
        ("PASSED", _("Passed / Rejected")),
    ]

    PRIORITY_CHOICES = [
        ("HIGH", _("High Priority")),
        ("MEDIUM", _("Medium Review")),
        ("AUTO_PASS", _("Auto-Pass (Thesis Mismatch)")),
    ]

    CHANNEL_CHOICES = [
        ("marketplace", _("Pitchmic Marketplace")),
        ("direct_application", _("Direct Founder Application")),
        ("accelerator", _("Accelerator Batch Syndicate")),
        ("founder_referral", _("Portfolio Founder Referral")),
        ("scout", _("Venture Scout")),
        ("co_investor", _("Co-Investor Syndication")),
        ("warm_intro", _("Warm Relationship Path")),
    ]

    firm = models.ForeignKey(InvestmentFirm, on_delete=models.CASCADE, related_name="investment_cases")
    fund = models.ForeignKey(InvestmentFund, on_delete=models.CASCADE, related_name="investment_cases")
    startup = models.ForeignKey(StartupProfile, on_delete=models.CASCADE, related_name="investment_cases")
    lead_partner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="led_investment_cases"
    )

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="INBOX")
    priority_tier = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default="HIGH")
    sourcing_channel = models.CharField(max_length=30, choices=CHANNEL_CHOICES, default="marketplace")
    
    # Core Scored Indices
    thesis_fit_score = models.FloatField(_("thesis fit score (%)"), default=0.0)
    underwriting_score = models.FloatField(_("underwriting quality (0-100)"), default=0.0)
    evidence_confidence_score = models.FloatField(_("evidence confidence (%)"), default=0.0)
    overall_readiness_score = models.FloatField(_("overall readiness (0-100)"), default=0.0)

    # Granular Thesis Breakdown (Stage, Geo, Sector, Check, Model, Founder)
    thesis_fit_breakdown = models.JSONField(default=dict, blank=True)

    # Stage Forensic Intelligence
    declared_stage = models.CharField(max_length=50, default="pre_seed")
    inferred_stage = models.CharField(max_length=50, default="pre_seed")
    stage_conflict_detected = models.BooleanField(default=False)
    stage_conflict_notes = models.TextField(blank=True)

    # Deal Economics
    target_ask_usd = models.DecimalField(max_digits=15, decimal_places=2, default=500_000)
    proposed_check_usd = models.DecimalField(max_digits=15, decimal_places=2, default=250_000)
    proposed_valuation_cap_usd = models.DecimalField(max_digits=15, decimal_places=2, default=5_000_000)

    # Conflict & Red Flags
    portfolio_conflict_detected = models.BooleanField(default=False)
    conflict_explanation = models.TextField(blank=True)
    critical_risks = models.JSONField(default=list, blank=True)

    # Structured Rejection Intelligence
    rejection_reasons = models.JSONField(
        default=list, blank=True,
        help_text=_("['too_early', 'valuation', 'regulatory', 'founder_concern', 'thesis_mismatch']")
    )
    rejection_notes = models.TextField(blank=True)

    # Watchlist Intelligence
    watchlist_reassess_date = models.DateField(null=True, blank=True)
    watchlist_milestone_trigger = models.CharField(max_length=255, blank=True,
                                                   help_text=_("e.g. Reassess once $30k MRR or 5 corporate pilots live"))

    # Cross-Module Synchronization with Founder Portal (apps.offers)
    offer = models.ForeignKey(
        "offers.Offer", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="investment_cases"
    )

    # Relationship Intelligence & Affinity Warm Paths
    warm_paths = models.JSONField(
        default=list, blank=True,
        help_text=_("[{'member_name': '...', 'connection_type': '...', 'strength': 0.85, 'notes': '...'}]")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("investment case")
        verbose_name_plural = _("investment cases")
        ordering = ["-thesis_fit_score", "-created_at"]
        unique_together = [["fund", "startup"]]

    def __str__(self) -> str:
        return f"{self.startup.company_name} - {self.fund.name} [{self.status}] (Fit: {self.thesis_fit_score:.0f}%)"


# ──────────────────────────────────────────────────────────────────────────────
# 3. Claims & Evidence Verification Engine
# ──────────────────────────────────────────────────────────────────────────────

class DealClaim(models.Model):
    """Granular assertion extracted from the startup's pitch deck, financial model, or founder interviews."""
    CATEGORY_CHOICES = [
        ("commercial_traction", _("Commercial Traction & LOIs")),
        ("revenue", _("Revenue & Run-Rate")),
        ("team", _("Team & Technical Capability")),
        ("market", _("Market Size & TAM")),
        ("product", _("Product Defensibility & IP")),
        ("legal", _("Legal & Regulatory Licensing")),
    ]

    investment_case = models.ForeignKey(InvestmentCase, on_delete=models.CASCADE, related_name="claims")
    claim_id = models.CharField(max_length=20)  # e.g. CL-0042
    claim_text = models.TextField(_("claim text"))
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="commercial_traction")
    materiality = models.CharField(
        max_length=20,
        choices=[("critical", "Critical"), ("high", "High"), ("medium", "Medium")],
        default="critical"
    )
    source = models.CharField(max_length=100, default="Pitch Deck")
    founder_asserted = models.BooleanField(default=True)
    verification_status = models.CharField(
        max_length=30,
        choices=[
            ("verified", _("Verified")),
            ("partially_verified", _("Partially Verified")),
            ("unverified", _("Unverified")),
            ("contradicted", _("Contradicted by Audit")),
        ],
        default="unverified"
    )
    discrepancy_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("deal claim")
        verbose_name_plural = _("deal claims")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.claim_id}] {self.claim_text[:60]} ({self.verification_status})"


class DealEvidence(models.Model):
    """Quantitative & qualitative audit breakdown for a specific claim."""
    claim = models.OneToOneField(DealClaim, on_delete=models.CASCADE, related_name="evidence_audit")
    claimed_value = models.CharField(max_length=255)
    audited_value = models.CharField(max_length=255)
    counterparties_found = models.PositiveIntegerField(default=0)
    counterparties_signed = models.PositiveIntegerField(default=0)
    active_commitments = models.PositiveIntegerField(default=0)
    confidence = models.FloatField(default=0.0)
    audit_summary = models.JSONField(default=dict, blank=True)
    audited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("deal evidence")
        verbose_name_plural = _("deal evidences")

    def __str__(self) -> str:
        return f"Audit for {self.claim.claim_id}: {self.audited_value}"


# ──────────────────────────────────────────────────────────────────────────────
# 4. Financial Forensics & Scenario Simulator
# ──────────────────────────────────────────────────────────────────────────────

class DealFinancialModel(models.Model):
    """Underwriting model testing mathematical consistency, burn, runway, and stress scenarios."""
    investment_case = models.OneToOneField(InvestmentCase, on_delete=models.CASCADE, related_name="financial_model")
    declared_mrr_usd = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    audited_mrr_usd = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discrepancy_detected = models.BooleanField(default=False)
    discrepancy_explanation = models.TextField(blank=True)
    
    monthly_burn_usd = models.DecimalField(max_digits=12, decimal_places=2, default=15_000)
    runway_months = models.PositiveIntegerField(default=9)
    gross_margin_pct = models.FloatField(default=75.0)
    cac_usd = models.DecimalField(max_digits=10, decimal_places=2, default=250)
    ltv_usd = models.DecimalField(max_digits=10, decimal_places=2, default=3200)

    # Stress-Test Scenarios (e.g. -50% growth, +$500k check)
    scenario_models = models.JSONField(
        default=dict, blank=True,
        help_text=_("Calculations for: growth_slowdown, round_delay, larger_check_dilution")
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("deal financial model")
        verbose_name_plural = _("deal financial models")

    def __str__(self) -> str:
        return f"Financial Model: {self.investment_case.startup.company_name}"


# ──────────────────────────────────────────────────────────────────────────────
# 5. Evidence-Linked IC Memo & Deliberation Room
# ──────────────────────────────────────────────────────────────────────────────

class InvestmentMemo(models.Model):
    """Institutional Investment Committee memo with evidence citations."""
    investment_case = models.OneToOneField(InvestmentCase, on_delete=models.CASCADE, related_name="memo")
    executive_summary = models.TextField(blank=True)
    thesis_alignment_rationale = models.TextField(blank=True)
    bull_case = models.JSONField(default=list, blank=True)
    bear_case = models.JSONField(default=list, blank=True)
    kill_conditions = models.JSONField(default=list, blank=True)
    recommended_terms = models.JSONField(default=dict, blank=True)
    generated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("investment memo")
        verbose_name_plural = _("investment memos")

    def __str__(self) -> str:
        return f"IC Memo: {self.investment_case.startup.company_name}"


class ICDebateSession(models.Model):
    """Interactive IC Deliberation workspace with Investor Challenge Mode."""
    investment_case = models.ForeignKey(InvestmentCase, on_delete=models.CASCADE, related_name="ic_debates")
    status = models.CharField(
        max_length=20,
        choices=[("scheduled", "Scheduled"), ("active", "Active Deliberation"), ("closed", "Closed")],
        default="active"
    )
    debate_log = models.JSONField(default=list, blank=True, help_text=_("[{partner, comment, side (bull/bear)}]"))
    
    # Investor Challenge Mode Log:
    # When a partner challenges an AI assessment score by supplying new verified diligence facts
    challenge_mode_log = models.JSONField(
        default=list, blank=True,
        help_text=_("[{partner, dimension, old_score, new_score, evidence_justification, timestamp}]")
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("IC debate session")
        verbose_name_plural = _("IC debate sessions")

    def __str__(self) -> str:
        return f"IC Session: {self.investment_case.startup.company_name}"


class ICPartnerVote(models.Model):
    """Binding partner consensus vote in the IC room."""
    VOTE_CHOICES = [
        ("INVEST", _("Invest (High Conviction)")),
        ("PASS", _("Pass")),
        ("DEFER", _("Defer / Watchlist")),
        ("REQUEST_DILIGENCE", _("Request Additional Diligence")),
    ]

    investment_case = models.ForeignKey(InvestmentCase, on_delete=models.CASCADE, related_name="partner_votes")
    partner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ic_partner_votes")
    vote = models.CharField(max_length=30, choices=VOTE_CHOICES, default="INVEST")
    conviction_score = models.PositiveIntegerField(default=8, help_text=_("Scale 1-10"))
    recommended_check_usd = models.DecimalField(max_digits=12, decimal_places=2, default=250_000)
    conditions = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("IC partner vote")
        verbose_name_plural = _("IC partner votes")
        unique_together = [["investment_case", "partner"]]

    def __str__(self) -> str:
        return f"{self.partner.email} → {self.vote} ({self.conviction_score}/10) on {self.investment_case}"


# ──────────────────────────────────────────────────────────────────────────────
# 6. Versioned Term Sheet & Closing
# ──────────────────────────────────────────────────────────────────────────────

class TermSheetRevision(models.Model):
    """Versioned negotiation ledger preserving every counter-offer and closing checklist."""
    INSTRUMENT_CHOICES = [
        ("SAFE", _("SAFE (Post-Money)")),
        ("CONVERTIBLE_NOTE", _("Convertible Promissory Note")),
        ("PRICED_EQUITY", _("Series Seed Preferred Equity")),
    ]

    STATUS_CHOICES = [
        ("draft", _("Draft")),
        ("proposed", _("Proposed to Founder")),
        ("negotiating", _("In Negotiation")),
        ("accepted", _("Accepted by Founder")),
        ("superseded", _("Superseded by New Version")),
        ("rejected", _("Rejected")),
    ]

    investment_case = models.ForeignKey(InvestmentCase, on_delete=models.CASCADE, related_name="term_sheets")
    version_number = models.PositiveIntegerField(default=1)
    instrument = models.CharField(max_length=30, choices=INSTRUMENT_CHOICES, default="SAFE")
    
    investment_amount_usd = models.DecimalField(max_digits=15, decimal_places=2, default=250_000)
    pre_money_valuation_usd = models.DecimalField(max_digits=15, decimal_places=2, default=5_000_000)
    valuation_cap_usd = models.DecimalField(max_digits=15, decimal_places=2, default=5_000_000)
    discount_pct = models.FloatField(default=20.0)
    target_ownership_pct = models.FloatField(default=5.0)

    board_rights = models.CharField(max_length=100, default="Observer Seat")
    pro_rata_rights = models.BooleanField(default=True)
    information_rights = models.BooleanField(default=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="proposed")

    closing_checklist = models.JSONField(
        default=list, blank=True,
        help_text=_("[{item: 'KYC/AML', status: 'verified'}, {item: 'Bank Wire', status: 'pending'}]")
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("term sheet revision")
        verbose_name_plural = _("term sheet revisions")
        ordering = ["-version_number"]

    def __str__(self) -> str:
        return f"Term Sheet v{self.version_number} [{self.status}] - {self.investment_case.startup.company_name}"


# ──────────────────────────────────────────────────────────────────────────────
# 7. Portfolio Intelligence & Automated Alerts
# ──────────────────────────────────────────────────────────────────────────────

class PortfolioCompany(models.Model):
    """Active portfolio company investment performance record."""
    investment_case = models.OneToOneField(InvestmentCase, on_delete=models.CASCADE, related_name="portfolio_record")
    firm = models.ForeignKey(InvestmentFirm, on_delete=models.CASCADE, related_name="portfolio_companies")
    fund = models.ForeignKey(InvestmentFund, on_delete=models.CASCADE, related_name="portfolio_companies")
    
    company_name = models.CharField(max_length=255)
    entry_valuation_usd = models.DecimalField(max_digits=15, decimal_places=2, default=5_000_000)
    invested_capital_usd = models.DecimalField(max_digits=15, decimal_places=2, default=250_000)
    current_fair_value_usd = models.DecimalField(max_digits=15, decimal_places=2, default=750_000)
    ownership_pct = models.FloatField(default=5.0)
    holding_multiple = models.FloatField(default=3.0, help_text=_("MOIC (Multiple on Invested Capital)"))
    
    follow_on_status = models.CharField(
        max_length=30,
        choices=[
            ("INVEST_MORE", _("High Priority Follow-On")),
            ("MAINTAIN", _("Maintain Pro-Rata")),
            ("DO_NOT_FOLLOW", _("Do Not Follow")),
            ("MONITOR", _("Monitoring")),
        ],
        default="MAINTAIN",
    )
    is_active = models.BooleanField(default=True)
    onboarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("portfolio company")
        verbose_name_plural = _("portfolio companies")
        ordering = ["-holding_multiple"]

    def __str__(self) -> str:
        return f"{self.company_name} - {self.holding_multiple:.1f}x MOIC (${self.current_fair_value_usd / Decimal(1_000_000):.1f}M)"


class PortfolioAlert(models.Model):
    """Automated operational triggers across runway, growth, and follow-on thresholds."""
    ALERT_TYPE_CHOICES = [
        ("RUNWAY_RISK", _("Runway Risk Alert")),
        ("GROWTH_SLOWDOWN", _("Growth Deceleration")),
        ("FOLLOW_ON_TRIGGER", _("Follow-On Threshold Met")),
        ("SERIES_A_READY", _("Series A Readiness")),
        ("KEY_HIRE", _("Leadership Expansion")),
    ]

    SEVERITY_CHOICES = [
        ("CRITICAL", _("Critical")),
        ("WARNING", _("Warning")),
        ("OPPORTUNITY", _("Opportunity")),
        ("INFO", _("Info")),
    ]

    portfolio_company = models.ForeignKey(PortfolioCompany, on_delete=models.CASCADE, related_name="alerts")
    alert_type = models.CharField(max_length=30, choices=ALERT_TYPE_CHOICES, default="RUNWAY_RISK")
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="WARNING")
    title = models.CharField(max_length=255)
    description = models.TextField()
    metric_delta = models.CharField(max_length=100, blank=True, help_text=_("e.g. 11 mos → 6 mos runway"))
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("portfolio alert")
        verbose_name_plural = _("portfolio alerts")
        ordering = ["is_resolved", "-created_at"]

    def __str__(self) -> str:
        return f"[{self.severity}] {self.title} ({self.portfolio_company.company_name})"


# ──────────────────────────────────────────────────────────────────────────────
# 8. Longitudinal Outcome Learning & Calibration
# ──────────────────────────────────────────────────────────────────────────────

class OutcomeCalibrationRecord(models.Model):
    """Compares initial Pitchmic predictions against realized exits to calibrate investor bias."""
    OUTCOME_CHOICES = [
        ("UNICORN_EXIT", _("Unicorn ($1B+) Exit")),
        ("PROFITABLE_M_A", _("Profitable M&A ($50M-$500M)")),
        ("AQUIHIRE", _("Acqui-hire / Soft Landing")),
        ("STAGNANT", _("Zombie / Stagnant Capital")),
        ("SHUTDOWN", _("Shutdown / Write-Off")),
    ]

    investment_case = models.OneToOneField(InvestmentCase, on_delete=models.CASCADE, related_name="outcome_record")
    predicted_quality_score = models.FloatField(default=0.0)
    predicted_unicorn_prob = models.FloatField(default=0.0)
    actual_outcome = models.CharField(max_length=30, choices=OUTCOME_CHOICES, default="PROFITABLE_M_A")
    realized_multiple = models.FloatField(default=0.0)
    failure_root_cause = models.CharField(max_length=255, blank=True)
    investor_bias_notes = models.TextField(blank=True, help_text=_("e.g. Overweighted founder pedigree; underestimated market timing"))
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("outcome calibration record")
        verbose_name_plural = _("outcome calibration records")

    def __str__(self) -> str:
        return f"Outcome: {self.investment_case.startup.company_name} → {self.actual_outcome} ({self.realized_multiple:.1f}x)"


# ──────────────────────────────────────────────────────────────────────────────
# 9. Relationship Graph & Affinity Warm Paths
# ──────────────────────────────────────────────────────────────────────────────

class RelationshipEdge(models.Model):
    """
    Affinity-style relationship network edge connecting firm members to external founders,
    executives, co-investors, and scouts.
    """
    CONNECTION_CHOICES = [
        ("former_colleague", _("Former Colleague")),
        ("portfolio_founder", _("Portfolio Company Founder")),
        ("co_investor", _("Syndicate / Co-Investor")),
        ("scout_network", _("Venture Scout")),
        ("alumni_network", _("University / Accelerator Alumni")),
        ("lp_relationship", _("Limited Partner (LP)")),
    ]

    firm = models.ForeignKey(InvestmentFirm, on_delete=models.CASCADE, related_name="relationship_edges")
    member = models.ForeignKey(FirmMember, on_delete=models.CASCADE, related_name="relationships")
    target_person_name = models.CharField(_("target person name"), max_length=255)
    target_organization = models.CharField(_("target organization"), max_length=255, blank=True)
    target_email = models.EmailField(_("target email"), blank=True)
    connection_type = models.CharField(
        _("connection type"), max_length=50, choices=CONNECTION_CHOICES, default="former_colleague"
    )
    strength_score = models.FloatField(_("warmth score"), default=0.85, help_text=_("0.0 to 1.0 warmth index"))
    notes = models.TextField(_("relationship context notes"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("relationship edge")
        verbose_name_plural = _("relationship edges")
        ordering = ["-strength_score", "target_person_name"]

    def __str__(self) -> str:
        return f"{self.member.user.email} → {self.target_person_name} ({self.get_connection_type_display()})"

