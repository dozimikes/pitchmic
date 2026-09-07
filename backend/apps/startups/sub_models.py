"""
apps.startups.sub_models
=========================
Structured evidence sub-profiles for the Fundability Engine.
Each model captures one dimension of startup evidence with enough
detail to drive the stage assessment and fundability scoring.

Models:
  FounderProfile       — per-founder background, experience, founder-market fit
  ProductProfile       — product maturity, technology, differentiation
  MarketProfile        — TAM/SAM/SOM, evidence, competitive landscape
  BusinessModelProfile — revenue model, pricing, unit economics
  TractionMetric       — time-series traction data with evidence provenance

These are satellite models to StartupProfile (apps.users.models).
They do NOT replace existing StartupProfile fields — they extend them
with structured, evidence-bearing detail.
"""
from __future__ import annotations

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.users.models import StartupProfile


# ---------------------------------------------------------------------------
# FounderProfile
# ---------------------------------------------------------------------------

class FounderProfile(models.Model):
    """
    Captures the investable signals investors actually evaluate when
    assessing a founding team. One record per founder.
    """

    class Role(models.TextChoices):
        CEO = "ceo", _("CEO / Co-Founder")
        CTO = "cto", _("CTO / Technical Co-Founder")
        COO = "coo", _("COO / Operations")
        CPO = "cpo", _("CPO / Product")
        CFO = "cfo", _("CFO / Finance")
        CMO = "cmo", _("CMO / Marketing")
        OTHER = "other", _("Other")

    class Commitment(models.TextChoices):
        FULL_TIME = "full_time", _("Full-Time")
        PART_TIME = "part_time", _("Part-Time")
        ADVISORY = "advisory", _("Advisory / Fractional")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="founder_profiles",
    )

    # Identity
    full_name = models.CharField(_("full name"), max_length=255)
    role = models.CharField(_("role"), max_length=20, choices=Role.choices, default=Role.CEO)
    commitment = models.CharField(
        _("commitment"), max_length=16, choices=Commitment.choices, default=Commitment.FULL_TIME
    )
    linkedin_url = models.URLField(_("LinkedIn"), blank=True)
    is_primary = models.BooleanField(
        _("primary / lead founder"), default=False,
        help_text=_("Mark the lead founder who is the primary point of contact")
    )

    # Background
    education_summary = models.TextField(
        _("education"), blank=True,
        help_text=_("Degrees, institutions, relevant academic background")
    )
    previous_companies = models.TextField(
        _("previous companies / roles"), blank=True,
        help_text=_("Previous startups or companies. Include exits if any.")
    )
    previous_exits = models.PositiveIntegerField(_("number of exits"), default=0)
    years_industry_experience = models.PositiveIntegerField(
        _("years of industry experience"), default=0
    )

    # Capabilities (1–10 self-assessed, reviewed by engine)
    technical_capability = models.IntegerField(
        _("technical capability (1–10)"), default=5,
        help_text=_("Ability to build or deeply understand the product technology")
    )
    commercial_capability = models.IntegerField(
        _("commercial capability (1–10)"), default=5,
        help_text=_("Sales, GTM, and revenue generation capability")
    )
    domain_expertise = models.IntegerField(
        _("domain expertise (1–10)"), default=5,
        help_text=_("Depth of knowledge in the specific problem domain")
    )

    # Founder-market fit evidence
    founder_market_fit_description = models.TextField(
        _("founder-market fit"), blank=True,
        help_text=_(
            "Why is this founder uniquely positioned to solve this problem? "
            "Personal experience, industry relationships, proprietary insight."
        )
    )

    # Key responsibilities on this startup
    responsibilities = models.TextField(
        _("responsibilities"), blank=True,
        help_text=_("What this founder owns in the company right now")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("founder profile")
        verbose_name_plural = _("founder profiles")
        ordering = ["-is_primary", "full_name"]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.role}) — {self.startup.company_name}"


# ---------------------------------------------------------------------------
# ProductProfile
# ---------------------------------------------------------------------------

class ProductProfile(models.Model):
    """
    Captures product maturity, technology stack, differentiation, and
    the evidence that supports product claims.
    OneToOne with StartupProfile — a startup has one canonical product profile.
    """

    class ProductStatus(models.TextChoices):
        IDEA = "idea", _("Idea / Concept Only")
        PROTOTYPE = "prototype", _("Prototype / Early Build")
        MVP = "mvp", _("MVP — Internal / Limited Testing")
        BETA = "beta", _("Beta — External Users")
        LIVE = "live", _("Live / Production")
        SCALING = "scaling", _("Scaling — Post-PMF")

    class TechDifferentiator(models.TextChoices):
        NONE = "none", _("No Significant Technical Differentiation")
        WORKFLOW = "workflow", _("Workflow / UX Differentiation")
        DATA = "data", _("Proprietary Data or Network Effects")
        ALGORITHM = "algorithm", _("Proprietary Algorithm or Model")
        PLATFORM = "platform", _("Platform / API Integration Layer")
        HARDWARE = "hardware", _("Hardware / Physical Component")
        IP = "ip", _("Filed or Granted IP / Patents")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.OneToOneField(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="product_profile",
    )

    # Problem and solution
    problem_statement = models.TextField(
        _("problem statement"), blank=True,
        help_text=_("Who experiences this problem, how often, and what it costs them")
    )
    target_customer_description = models.TextField(
        _("target customer"), blank=True,
        help_text=_("Specific description of the primary customer — not 'SMEs' but 'logistics managers at 10–50 person companies'")
    )
    customer_pain_frequency = models.CharField(
        _("pain frequency"), max_length=50, blank=True,
        choices=[
            ("daily", "Daily"),
            ("weekly", "Weekly"),
            ("monthly", "Monthly"),
            ("occasional", "Occasional"),
            ("one_time", "One-Time Event"),
        ]
    )
    current_alternatives = models.TextField(
        _("current alternatives"), blank=True,
        help_text=_("What customers currently use to solve this problem (including 'nothing')")
    )

    # Solution
    solution_description = models.TextField(
        _("solution description"), blank=True,
        help_text=_("What the product actually does — specifically and concretely")
    )
    product_status = models.CharField(
        _("product status"), max_length=16,
        choices=ProductStatus.choices,
        default=ProductStatus.IDEA,
        db_index=True,
    )
    demo_url = models.URLField(_("demo / product URL"), blank=True)
    tech_differentiator = models.CharField(
        _("technical differentiator"), max_length=20,
        choices=TechDifferentiator.choices,
        default=TechDifferentiator.NONE,
    )
    differentiator_description = models.TextField(
        _("differentiation detail"), blank=True,
        help_text=_("Specific explanation of what prevents competitors from copying this")
    )

    # Moat
    moat_description = models.TextField(
        _("moat / defensibility"), blank=True,
        help_text=_("Network effects, switching costs, data moat, regulatory barriers, etc.")
    )

    # IP
    has_filed_ip = models.BooleanField(_("IP filed or granted"), default=False)
    ip_description = models.CharField(_("IP description"), max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("product profile")
        verbose_name_plural = _("product profiles")

    def __str__(self) -> str:
        return f"{self.startup.company_name} Product: {self.product_status}"


# ---------------------------------------------------------------------------
# MarketProfile
# ---------------------------------------------------------------------------

class MarketProfile(models.Model):
    """
    Captures market sizing, evidence sources, and competitive landscape.
    OneToOne with StartupProfile.
    """

    class MarketEvidenceSource(models.TextChoices):
        FOUNDER_ESTIMATE = "founder_estimate", _("Founder Estimate (Bottom-Up)")
        THIRD_PARTY_REPORT = "third_party_report", _("Third-Party Industry Report")
        GOVERNMENT_DATA = "government_data", _("Government / Official Statistics")
        COMPARABLE_COMPANY = "comparable_company", _("Comparable Company Revenue")
        CUSTOMER_RESEARCH = "customer_research", _("Primary Customer Research")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.OneToOneField(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="market_profile",
    )

    # Market sizing
    tam_usd = models.DecimalField(
        _("TAM (USD)"), max_digits=18, decimal_places=2, null=True, blank=True,
        help_text=_("Total Addressable Market in USD")
    )
    sam_usd = models.DecimalField(
        _("SAM (USD)"), max_digits=18, decimal_places=2, null=True, blank=True,
        help_text=_("Serviceable Addressable Market in USD")
    )
    som_usd = models.DecimalField(
        _("SOM (USD)"), max_digits=18, decimal_places=2, null=True, blank=True,
        help_text=_("Serviceable Obtainable Market (5-year realistic target)")
    )
    market_growth_rate_pct = models.FloatField(
        _("market CAGR (%)"), null=True, blank=True,
        help_text=_("Annual market growth rate percentage")
    )

    # Evidence
    tam_evidence_source = models.CharField(
        _("TAM evidence source"), max_length=30,
        choices=MarketEvidenceSource.choices,
        default=MarketEvidenceSource.FOUNDER_ESTIMATE,
    )
    tam_source_citation = models.CharField(
        _("source citation"), max_length=500, blank=True,
        help_text=_("Report name, URL, or description of the source")
    )
    market_sizing_methodology = models.TextField(
        _("sizing methodology"), blank=True,
        help_text=_("How did you calculate TAM/SAM? Top-down or bottom-up?")
    )

    # Geography
    primary_geography = models.CharField(_("primary geography"), max_length=255, blank=True)
    expansion_geography = models.CharField(
        _("expansion geography"), max_length=500, blank=True,
        help_text=_("Where do you plan to expand within 24 months?")
    )

    # Competitive landscape
    direct_competitors = models.TextField(
        _("direct competitors"), blank=True,
        help_text=_("Companies solving the same problem for the same customer")
    )
    indirect_competitors = models.TextField(
        _("indirect competitors / substitutes"), blank=True,
    )
    competitive_advantage = models.TextField(
        _("competitive advantage"), blank=True,
        help_text=_("Why will your company win against these competitors?")
    )

    # Regulatory
    regulatory_notes = models.TextField(
        _("regulatory considerations"), blank=True,
        help_text=_("Licenses required, regulatory barriers, compliance obligations")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("market profile")
        verbose_name_plural = _("market profiles")

    def __str__(self) -> str:
        tam = f"${float(self.tam_usd):,.0f}" if self.tam_usd else "TAM unknown"
        return f"{self.startup.company_name} Market: {tam}"


# ---------------------------------------------------------------------------
# BusinessModelProfile
# ---------------------------------------------------------------------------

class BusinessModelProfile(models.Model):
    """
    Captures revenue model, pricing, unit economics, and monetization
    status to enable business model dimension scoring.
    OneToOne with StartupProfile.
    """

    class RevenueModel(models.TextChoices):
        SAAS = "saas", _("SaaS / Subscription")
        TRANSACTION = "transaction", _("Transaction / Usage Fee")
        MARKETPLACE = "marketplace", _("Marketplace / Platform")
        LICENSING = "licensing", _("Licensing / Royalty")
        SERVICES = "services", _("Professional Services")
        ADVERTISING = "advertising", _("Advertising / Sponsorship")
        HYBRID = "hybrid", _("Hybrid / Multiple Streams")
        NOT_YET = "not_yet", _("Not Yet Monetizing")

    class CustomerType(models.TextChoices):
        B2B = "b2b", _("B2B — Businesses")
        B2C = "b2c", _("B2C — Consumers")
        B2B2C = "b2b2c", _("B2B2C")
        B2G = "b2g", _("B2G — Government")
        MARKETPLACE = "marketplace", _("Marketplace — Both Sides")

    class SalesModel(models.TextChoices):
        PRODUCT_LED = "product_led", _("Product-Led Growth")
        SALES_LED = "sales_led", _("Sales-Led / Direct Sales")
        CHANNEL = "channel", _("Channel / Partner Sales")
        INBOUND = "inbound", _("Inbound Marketing")
        HYBRID = "hybrid", _("Hybrid")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.OneToOneField(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="business_model_profile",
    )

    # Revenue model
    revenue_model = models.CharField(
        _("revenue model"), max_length=20,
        choices=RevenueModel.choices,
        default=RevenueModel.NOT_YET,
    )
    revenue_model_description = models.TextField(
        _("revenue model description"), blank=True,
        help_text=_("Explain specifically how you make money")
    )
    customer_type = models.CharField(
        _("customer type"), max_length=20,
        choices=CustomerType.choices,
        default=CustomerType.B2B,
    )
    sales_model = models.CharField(
        _("sales model"), max_length=20,
        choices=SalesModel.choices,
        default=SalesModel.PRODUCT_LED,
    )

    # Pricing
    pricing_model = models.CharField(
        _("pricing model"), max_length=255, blank=True,
        help_text=_("e.g. '$49/mo per seat', '2% transaction fee', '$500 setup + $200/mo'")
    )
    average_contract_value_usd = models.DecimalField(
        _("average contract value (USD)"), max_digits=12, decimal_places=2,
        null=True, blank=True,
    )

    # Unit economics (modelled or observed)
    cac_usd = models.DecimalField(
        _("CAC (USD)"), max_digits=10, decimal_places=2, null=True, blank=True,
        help_text=_("Customer Acquisition Cost")
    )
    ltv_usd = models.DecimalField(
        _("LTV (USD)"), max_digits=10, decimal_places=2, null=True, blank=True,
        help_text=_("Customer Lifetime Value")
    )
    gross_margin_pct = models.FloatField(
        _("gross margin (%)"), null=True, blank=True
    )
    payback_months = models.FloatField(
        _("payback period (months)"), null=True, blank=True
    )

    # Unit economics source
    unit_economics_are_modelled = models.BooleanField(
        _("unit economics are modelled estimates"), default=True,
        help_text=_("If false, these are based on actual observed data")
    )

    # Path to profitability
    path_to_profitability = models.TextField(
        _("path to profitability"), blank=True,
        help_text=_("At what revenue/scale does the business become profitable?")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("business model profile")
        verbose_name_plural = _("business model profiles")

    def __str__(self) -> str:
        return f"{self.startup.company_name} BizModel: {self.revenue_model}"


# ---------------------------------------------------------------------------
# TractionMetric
# ---------------------------------------------------------------------------

class TractionMetric(models.Model):
    """
    A single traction data point with a value, period, and evidence source.

    Every metric has provenance:
        value + period + evidence source + verification status

    This prevents Pitchmic from treating unsupported claims as facts.
    """

    class MetricType(models.TextChoices):
        MRR = "mrr", _("MRR — Monthly Recurring Revenue")
        ARR = "arr", _("ARR — Annual Recurring Revenue")
        REVENUE = "revenue", _("Revenue (Non-Recurring)")
        GMV = "gmv", _("GMV / TPV")
        USERS = "users", _("Registered Users")
        MAU = "mau", _("Monthly Active Users")
        DAU = "dau", _("Daily Active Users")
        CUSTOMERS = "customers", _("Paying Customers")
        GROWTH_RATE = "growth_rate", _("Growth Rate (MoM %)")
        RETENTION = "retention", _("Retention Rate (%)")
        CHURN = "churn", _("Churn Rate (%)")
        NRR = "nrr", _("Net Revenue Retention (%)")
        PILOTS = "pilots", _("Active Pilots")
        LOI = "loi", _("Letters of Intent")
        PARTNERSHIPS = "partnerships", _("Signed Partnerships")
        WAITLIST = "waitlist", _("Waitlist Signups")
        DOWNLOADS = "downloads", _("App Downloads")
        TRANSACTIONS = "transactions", _("Transactions Processed")
        OTHER = "other", _("Other Metric")

    class EvidenceStatus(models.TextChoices):
        FOUNDER_REPORTED = "founder_reported", _("Founder-Reported (Unverified)")
        SCREENSHOT = "screenshot", _("Screenshot / Dashboard Export")
        ANALYTICS_EXPORT = "analytics_export", _("Analytics Export (Mixpanel / Amplitude)")
        FINANCIAL_STATEMENT = "financial_statement", _("Financial Statement")
        PAYMENT_PROCESSOR = "payment_processor", _("Payment Processor Export (Stripe / Paystack)")
        THIRD_PARTY_VERIFIED = "third_party_verified", _("Third-Party Verified")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="traction_metrics",
    )

    metric_type = models.CharField(
        _("metric type"), max_length=20,
        choices=MetricType.choices,
        db_index=True,
    )

    # Value and unit
    value = models.FloatField(_("value"))
    unit = models.CharField(
        _("unit"), max_length=50, blank=True,
        help_text=_("e.g. 'USD', '%', 'users', 'transactions'")
    )

    # Period
    period_label = models.CharField(
        _("period"), max_length=64,
        help_text=_("e.g. 'August 2026', 'Q2 2026', 'Jan–Aug 2026'")
    )
    period_start = models.DateField(_("period start"), null=True, blank=True)
    period_end = models.DateField(_("period end"), null=True, blank=True)

    # Evidence
    evidence_status = models.CharField(
        _("evidence status"), max_length=30,
        choices=EvidenceStatus.choices,
        default=EvidenceStatus.FOUNDER_REPORTED,
    )
    evidence_source_description = models.CharField(
        _("evidence source"), max_length=255, blank=True,
        help_text=_("e.g. 'Stripe dashboard', 'Mixpanel export', 'Bank statement June 2026'")
    )
    evidence_file_url = models.URLField(_("evidence file URL"), blank=True)

    notes = models.TextField(_("notes"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("traction metric")
        verbose_name_plural = _("traction metrics")
        ordering = ["-period_end", "-created_at"]
        indexes = [
            models.Index(fields=["startup", "metric_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.startup.company_name} — {self.metric_type}: {self.value} ({self.period_label})"
