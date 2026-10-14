"""
apps.accelerator.models
=======================
Venture Admissions & Investment Operating System - Application Orchestration Engine.

Models:
  AcceleratorProgram          - Configurable program with eligibility rules, workflow config
  FounderApplicationProfile   - Canonical "apply once, reuse everywhere" founder profile
  StartupApplicationProfile   - Company snapshot at time of application
  AcceleratorApplication      - Orchestration spine with full lifecycle (17 status stages)
  ApplicationQuestion         - Dynamic question engine with metadata
  QuestionResponse            - Structured responses (narrative / numeric / boolean)
  ApplicationDocument         - Uploaded documents with parsing state
  ApplicationClaim            - Structured claim objects extracted from app + docs
  ClaimEvidence               - Evidence linked to claims with verification detail
  ApplicationAssessment       - Multi-dimensional scored assessment (per-dimension confidence)
  ReviewerAssessment          - Per-reviewer scorecard
  ReviewerDisagreement        - Auto-detected cross-reviewer variance
  InterviewSession            - ML + human interview with transcript intelligence
  CommitteeDecision           - IC committee workspace + vote aggregation
  EvidenceRequest             - Evidence re-request loop with before/after score tracking
  ProgramMembership           - Post-acceptance cohort enrolment
  MilestoneTemplate           - Reusable milestone templates per program
  StartupMilestone            - Per-company milestone tracking
  ContinuousAssessment        - Readiness score evolution over time (Wk0 → Demo Day → Post-Raise)
  ApplicationAuditEvent       - Immutable audit log for every application stage transition
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.users.models import StartupProfile


def _person_label(user):
    """How a human appears inside a stored record, or None when nobody did it.

    Null here is honest — an older row written before the ledger kept names —
    and the UI renders that as "not recorded" rather than guessing.
    """
    if user is None:
        return None
    return getattr(user, "full_name", "") or getattr(user, "email", "") or None


# ──────────────────────────────────────────────────────────────────────────────
# 1. AcceleratorProgram
# ──────────────────────────────────────────────────────────────────────────────

class AcceleratorProgram(models.Model):
    """
    A configurable accelerator / VC program. Each program has its own eligibility
    rules, question set, scoring rubric, workflow stages, and committee structure.
    Replaces / extends the legacy `intelligence.Cohort` model for new applications.
    """

    WORKFLOW_CHOICES = [
        ("yc_style", _("YC-Style (Online → Interview → Same-Day Decision)")),
        ("techstars_style", _("Techstars-Style (Multi-Stage Committee)")),
        ("custom", _("Custom Workflow")),
    ]

    # Identity
    name = models.CharField(_("program name"), max_length=255)
    organization_name = models.CharField(_("organization"), max_length=255)
    slug = models.SlugField(unique=True, max_length=120)
    logo_url = models.URLField(_("logo URL"), blank=True)
    website = models.URLField(_("website"), blank=True)
    description = models.TextField(_("description"), blank=True)
    tagline = models.CharField(_("tagline"), max_length=255, blank=True)

    # Focus
    sector_focus = models.CharField(_("sector focus"), max_length=500, blank=True,
                                    help_text=_("Comma-separated sectors"))
    geography_focus = models.CharField(_("geography focus"), max_length=500, blank=True,
                                       help_text=_("Countries/regions targeted"))
    stage_focus = models.CharField(
        _("stage focus"), max_length=50, blank=True,
        choices=[
            ("idea", "Idea"),
            ("pre_seed", "Pre-Seed"),
            ("seed", "Seed"),
            ("series_a", "Series A"),
            ("any", "Any Stage"),
        ],
        default="pre_seed",
    )

    # Terms
    equity_offered_pct = models.FloatField(_("equity offered (%)"), default=0.0)
    funding_amount_usd = models.DecimalField(
        _("funding amount (USD)"), max_digits=15, decimal_places=2, null=True, blank=True
    )
    program_duration_weeks = models.PositiveIntegerField(_("duration (weeks)"), default=12)
    is_remote = models.BooleanField(_("remote-friendly"), default=True)
    location = models.CharField(_("location"), max_length=255, blank=True)

    # Dates
    application_deadline = models.DateTimeField(_("application deadline"), null=True, blank=True)
    cohort_start_date = models.DateField(_("cohort start date"), null=True, blank=True)
    cohort_end_date = models.DateField(_("cohort end date"), null=True, blank=True)
    program_cycle = models.CharField(_("program cycle"), max_length=100, default="2026-Q1")
    target_cohort_size = models.PositiveIntegerField(_("target cohort size"), default=20)

    # Eligibility rules (JSON schema validated by serializer)
    eligibility_rules = models.JSONField(
        _("eligibility rules"), default=dict, blank=True,
        help_text=_(
            "e.g. {incorporated_required: true, full_time_required: true, "
            "previous_funding_max_usd: 500000, geography_whitelist: ['NG','KE','ZA'], "
            "sector_whitelist: ['fintech','healthtech'], min_team_size: 2}"
        ),
    )

    # Question configuration
    question_config = models.JSONField(_("question config"), default=dict, blank=True)

    # Scoring rubric weights (JSON: {problem: 15, market: 15, founder: 20, ...})
    scoring_rubric_config = models.JSONField(_("scoring rubric"), default=dict, blank=True)

    # Workflow configuration
    workflow_style = models.CharField(
        _("workflow style"), max_length=30, choices=WORKFLOW_CHOICES, default="techstars_style"
    )
    workflow_config = models.JSONField(
        _("workflow config"), default=dict, blank=True,
        help_text=_(
            "e.g. {stages: [...], committee_size: 5, interview_rounds: 2, "
            "multi_reviewer: true, evidence_request_enabled: true}"
        ),
    )

    # Status
    is_active = models.BooleanField(_("active"), default=True)
    is_public = models.BooleanField(_("public"), default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="created_programs"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Program version string (bumped when evaluation policy changes)
    program_version = models.CharField(_("program version"), max_length=20, default="1.0")

    # ── Program OS configuration (migrations 0002 / 0004 / 0006) ──────────────
    capital_model = models.CharField(verbose_name='capital model', max_length=20, default='equity', choices=[('none', 'No Funding'), ('grant', 'Grant'), ('equity', 'Equity'), ('safe', 'SAFE'), ('debt', 'Debt'), ('mixed', 'Mixed')])
    delivery_mode = models.CharField(verbose_name='delivery mode', max_length=20, default='hybrid', choices=[('remote', 'Fully Remote'), ('hybrid', 'Hybrid'), ('physical', 'In-Person / Physical'), ('rolling', 'Rolling Admissions')])
    mandate = models.JSONField(verbose_name='mandate', blank=True, default=dict, help_text='Program mandate flags. e.g. {commercial: true, impact: false, government: false}')
    program_type = models.CharField(verbose_name='program type', max_length=30, default='vc_accelerator', choices=[('vc_accelerator', 'VC / Venture-backed Accelerator'), ('corporate', 'Corporate Accelerator'), ('government', 'Government / Public Accelerator'), ('university', 'University / Research Accelerator'), ('impact', 'Impact / Nonprofit Accelerator'), ('pre_accelerator', 'Pre-Accelerator / Founder Program'), ('incubator', 'Incubator'), ('venture_studio', 'Venture Studio'), ('grant_program', 'Grant Program'), ('other', 'Other')], help_text="The type of accelerator. Drives archetype defaults and the program runtime's behavioral config.")
    thesis = models.JSONField(verbose_name='selection framework', blank=True, default=dict, help_text="Program investment / selection framework. e.g. {sectors: ['fintech', 'healthtech'], technologies: ['AI'], markets: ['Africa'], problems: [], strategic_themes: []}")
    archetype = models.ForeignKey(blank=True, null=True, help_text='The archetype this program was initialised from. Changing the archetype does not retroactively alter policies.', related_name='programs', on_delete=models.SET_NULL, to='accelerator.programarchetype')
    organization = models.ForeignKey(blank=True, null=True, related_name='programs', on_delete=models.SET_NULL, to='accelerator.acceleratororganization')
    branding_config = models.JSONField(verbose_name='branding configuration', blank=True, default=dict, help_text='{primary_color, secondary_color, accent_color, font_family, logo_url, cover_image_url, favicon_url, custom_domain, powered_by_visible}')
    module_config = models.JSONField(verbose_name='module configuration', blank=True, default=dict, help_text='Controls which delivery modules are active. e.g. {mentorship: {enabled: true, config: {max_mentors_per_company: 2}}}')
    notification_config = models.JSONField(verbose_name='notification configuration', blank=True, default=dict, help_text='{confirmation_email, rejection_email, shortlist_email, interview_invite_email, acceptance_email, waitlist_email, custom_sender_name, custom_sender_email}')
    # No settings screen authors this — Program Studio is the only writer, snapshotting
    # it into a blueprint (views_intel.py) and restoring it onto cloned programs.
    portal_config = models.JSONField(verbose_name='portal configuration', blank=True, default=dict, help_text='{welcome_headline, welcome_body, about_html, eligibility_summary, benefits_list, timeline_items, faq_items, hero_image_url, video_url, partner_logos, social_links}')
    program_status = models.CharField(verbose_name='program status', max_length=20, default='draft', choices=[('draft', 'Draft — being configured'), ('setup', 'Setup — configuration in progress'), ('published', 'Published — visible but not yet accepting'), ('accepting', 'Accepting Applications'), ('reviewing', 'Under Review'), ('cohort_active', 'Cohort Active'), ('completed', 'Completed'), ('archived', 'Archived')])
    blueprint_source = models.ForeignKey(blank=True, null=True, help_text='The blueprint this program was created from, if any.', related_name='derived_programs', on_delete=models.SET_NULL, to='accelerator.programblueprint')

    class Meta:
        verbose_name = _("accelerator program")
        verbose_name_plural = _("accelerator programs")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.organization_name} - {self.name} ({self.program_cycle})"

    def get_runtime(self):
        """
        Returns a ProgramRuntime instance for this program.
        Lazily imported to avoid circular imports.
        """
        from apps.accelerator.program_runtime import ProgramRuntime
        return ProgramRuntime(self)


# ──────────────────────────────────────────────────────────────────────────────
# 2. FounderApplicationProfile
# ──────────────────────────────────────────────────────────────────────────────

class FounderApplicationProfile(models.Model):
    """
    Canonical founder profile - created once and reused across multiple applications.
    The "apply once, reuse everywhere" foundation.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="founder_application_profile",
    )

    # Identity
    full_name = models.CharField(_("full name"), max_length=255, blank=True)
    location = models.CharField(_("location"), max_length=255, blank=True)
    country = models.CharField(_("country"), max_length=100, blank=True)
    linkedin = models.URLField(_("LinkedIn"), blank=True)
    twitter = models.CharField(_("Twitter/X"), max_length=255, blank=True)

    # Background
    education = models.JSONField(
        _("education"), default=list, blank=True,
        help_text=_("[{institution, degree, field, year}]"),
    )
    employment = models.JSONField(
        _("employment history"), default=list, blank=True,
        help_text=_("[{company, role, start_year, end_year, current}]"),
    )
    previous_companies = models.JSONField(
        _("previous companies founded"), default=list, blank=True,
        help_text=_("[{name, role, outcome, year_founded, year_exited}]"),
    )

    # Team
    cofounders = models.JSONField(
        _("cofounders"), default=list, blank=True,
        help_text=_("[{name, email, role, equity_pct, full_time, linkedin}]"),
    )
    full_time_status = models.BooleanField(_("full-time on startup"), default=True)
    technical_capability_score = models.FloatField(
        _("technical capability (0-10)"), default=0.0,
        help_text=_("Self-assessed; validated during interview")
    )
    business_capability_score = models.FloatField(
        _("business capability (0-10)"), default=0.0
    )

    # Availability
    available_from = models.DateField(_("available from"), null=True, blank=True)

    # Profile completeness
    profile_completeness = models.FloatField(_("profile completeness (%)"), default=0.0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("founder application profile")
        verbose_name_plural = _("founder application profiles")

    def __str__(self) -> str:
        return f"{self.full_name or self.user.email} - Founder Profile"


# ──────────────────────────────────────────────────────────────────────────────
# 3. StartupApplicationProfile
# ──────────────────────────────────────────────────────────────────────────────

class StartupApplicationProfile(models.Model):
    """
    Canonical company snapshot - reused across applications to different programs.
    Links to the platform StartupProfile but captures a point-in-time snapshot.
    """

    REVENUE_STATUS_CHOICES = [
        ("pre_revenue", _("Pre-Revenue")),
        ("early_revenue", _("Early Revenue")),
        ("growing_revenue", _("Growing Revenue")),
        ("scaling_revenue", _("Scaling Revenue")),
    ]

    BUSINESS_MODEL_CHOICES = [
        ("b2b_saas", "B2B SaaS"),
        ("b2c", "B2C"),
        ("marketplace", "Marketplace"),
        ("fintech", "Fintech"),
        ("deeptech", "Deep Tech / Hardware"),
        ("d2c", "D2C"),
        ("other", "Other"),
    ]

    founder_profile = models.ForeignKey(
        FounderApplicationProfile,
        on_delete=models.CASCADE,
        related_name="startup_profiles",
    )
    linked_startup = models.ForeignKey(
        StartupProfile,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="application_profiles",
        help_text=_("Optional link to platform StartupProfile"),
    )

    # Company
    company_name = models.CharField(_("company name"), max_length=255)
    website = models.URLField(_("website"), blank=True)
    industry = models.CharField(_("industry"), max_length=255, blank=True)
    sector_tags = models.CharField(_("sector tags"), max_length=500, blank=True,
                                   help_text=_("Comma-separated"))
    business_model = models.CharField(
        _("business model"), max_length=50, choices=BUSINESS_MODEL_CHOICES, default="b2b_saas"
    )
    geography = models.CharField(_("primary geography"), max_length=255, blank=True)
    incorporated = models.BooleanField(_("incorporated"), default=False)
    incorporation_country = models.CharField(_("incorporation country"), max_length=100, blank=True)
    founded_date = models.DateField(_("founded date"), null=True, blank=True)
    employee_count = models.PositiveIntegerField(_("employee count"), default=1)

    # Product
    product_description = models.TextField(_("product description"), blank=True)
    product_stage = models.CharField(
        _("product stage"), max_length=50, blank=True,
        choices=[
            ("idea", "Idea"), ("prototype", "Prototype"), ("mvp", "MVP"),
            ("pilot", "Pilot"), ("live", "Live"), ("scaling", "Scaling"),
        ],
    )
    has_live_product = models.BooleanField(_("product is live"), default=False)

    # Customers / Traction
    customer_description = models.TextField(_("customer description"), blank=True)
    customer_count = models.PositiveIntegerField(_("paying customers"), default=0)
    monthly_active_users = models.PositiveIntegerField(_("monthly active users"), default=0)
    loi_count = models.PositiveIntegerField(_("LOI count"), default=0)
    pilot_count = models.PositiveIntegerField(_("pilot count"), default=0)

    # Revenue
    revenue_status = models.CharField(
        _("revenue status"), max_length=30,
        choices=REVENUE_STATUS_CHOICES, default="pre_revenue"
    )
    mrr_usd = models.DecimalField(_("MRR (USD)"), max_digits=15, decimal_places=2,
                                  null=True, blank=True)
    arr_usd = models.DecimalField(_("ARR (USD)"), max_digits=15, decimal_places=2,
                                  null=True, blank=True)
    gross_margin_pct = models.FloatField(_("gross margin (%)"), null=True, blank=True)

    # Funding history
    declared_stage = models.CharField(
        _("declared funding stage"), max_length=50, default="pre_seed",
        choices=[
            ("pre_idea", "Pre-Idea"), ("idea", "Idea"), ("pre_seed", "Pre-Seed"),
            ("seed", "Seed"), ("series_a", "Series A"),
        ],
    )
    total_funding_raised_usd = models.DecimalField(
        _("total funding raised (USD)"), max_digits=15, decimal_places=2, default=0
    )
    funding_sources = models.JSONField(_("funding sources"), default=list, blank=True)
    cap_table = models.JSONField(_("cap table"), default=list, blank=True)

    # Documents (URLs, may point to uploaded ApplicationDocument)
    pitch_deck_url = models.URLField(_("pitch deck URL"), blank=True)
    financial_model_url = models.URLField(_("financial model URL"), blank=True)

    # Profile completeness
    profile_completeness = models.FloatField(_("profile completeness (%)"), default=0.0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("startup application profile")
        verbose_name_plural = _("startup application profiles")

    def __str__(self) -> str:
        return f"{self.company_name} - Application Profile"

    @property
    def sector(self) -> str:
        """Sectors are captured as free comma-separated tags; the screening
        weighting engine keys its per-sector overrides off one primary sector,
        so every consumer derives it the same way here rather than re-splitting
        the tag string."""
        return (self.sector_tags or "").split(",")[0].strip() or (self.industry or "")

    @property
    def country(self) -> str:
        """Geography is free text on purpose (a founder may write 'Lagos,
        Nigeria'); incorporation country and the founder's own country are the
        structured fallbacks."""
        return self.geography or self.incorporation_country or (
            self.founder_profile.country if self.founder_profile_id else ""
        ) or ""


# ──────────────────────────────────────────────────────────────────────────────
# 4. AcceleratorApplication  (the orchestration spine)
# ──────────────────────────────────────────────────────────────────────────────

class AcceleratorApplication(models.Model):
    """
    The central object in the Venture Admissions OS.
    Tracks a startup through the complete admissions lifecycle.
    """

    STATUS_CHOICES = [
        ("DRAFT", _("Draft")),
        ("SUBMITTED", _("Submitted")),
        ("SCREENING", _("Screening")),
        ("SHORTLISTED", _("Shortlisted")),
        ("INTERVIEW_INVITED", _("Interview Invited")),
        ("INTERVIEW_COMPLETE", _("Interview Complete")),
        ("COMMITTEE_REVIEW", _("Committee Review")),
        ("EVIDENCE_REQUESTED", _("Evidence Requested")),
        ("WAITLISTED", _("Waitlisted")),
        ("ACCEPTED", _("Accepted")),
        ("REJECTED", _("Rejected")),
        ("WITHDRAWN", _("Withdrawn")),
        ("DEFERRED", _("Deferred")),
    ]

    TIER_CHOICES = [
        ("A", _("Tier A - Highly aligned + high evidence")),
        ("B", _("Tier B - Strong but needs review")),
        ("C", _("Tier C - Interesting but evidence gaps")),
        ("D", _("Tier D - Poor fit / eligibility issues")),
    ]

    program = models.ForeignKey(
        AcceleratorProgram, on_delete=models.CASCADE, related_name="applications"
    )
    startup_profile = models.ForeignKey(
        StartupApplicationProfile, on_delete=models.CASCADE, related_name="applications"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="submitted_applications"
    )

    status = models.CharField(
        _("status"), max_length=30, choices=STATUS_CHOICES, default="DRAFT"
    )

    # Eligibility
    eligibility_score = models.FloatField(_("eligibility score (%)"), default=0.0)
    eligibility_breakdown = models.JSONField(_("eligibility breakdown"), default=dict, blank=True)
    eligibility_checked_at = models.DateTimeField(null=True, blank=True)

    # Scores (set by automated assessment engine)
    application_completeness_score = models.FloatField(_("completeness (%)"), default=0.0)
    startup_strength_score = models.FloatField(_("startup strength (0-100)"), default=0.0)
    evidence_confidence_score = models.FloatField(_("evidence confidence (%)"), default=0.0)
    program_fit_score = models.FloatField(_("program fit (0-100)"), default=0.0)
    founder_score = models.FloatField(_("founder score (0-100)"), default=0.0)

    # Stage intelligence
    inferred_stage = models.CharField(_("inferred stage"), max_length=50, blank=True)
    stage_conflict_detected = models.BooleanField(_("stage conflict detected"), default=False)

    # Automated screening
    automated_screening_tier = models.CharField(
        _("screening tier"), max_length=1, choices=TIER_CHOICES, blank=True
    )
    screening_summary = models.JSONField(_("screening summary"), default=dict, blank=True)
    risk_flags = models.JSONField(_("risk flags"), default=list, blank=True)

    # Timestamps
    submitted_at = models.DateTimeField(null=True, blank=True)
    shortlisted_at = models.DateTimeField(null=True, blank=True)
    decision_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Notes
    internal_notes = models.TextField(_("internal notes"), blank=True)

    # ── Program OS lifecycle links (migrations 0004 / 0006) ───────────────────
    cycle = models.ForeignKey(blank=True, null=True, related_name='applications', on_delete=models.SET_NULL, to='accelerator.applicationcycle')
    track = models.ForeignKey(blank=True, null=True, related_name='applications', on_delete=models.SET_NULL, to='accelerator.programtrack')

    class Meta:
        verbose_name = _("accelerator application")
        verbose_name_plural = _("accelerator applications")
        ordering = ["-created_at"]
        unique_together = [["program", "startup_profile"]]

    def __str__(self) -> str:
        return (
            f"{self.startup_profile.company_name} → {self.program.name} [{self.status}]"
        )

    def aging_days(self, now=None) -> int | None:
        """Days this application has been waiting since it entered the funnel.

        The anchor is the submission when there is one, otherwise the row's
        creation. Returns None when neither timestamp exists: unknown is not
        zero, so a queue must render a dash rather than claim "0 days".
        """
        anchor = self.submitted_at or self.created_at
        if anchor is None:
            return None
        return max(0, ((now or timezone.now()) - anchor).days)


# ──────────────────────────────────────────────────────────────────────────────
# 5. ApplicationQuestion + QuestionResponse
# ──────────────────────────────────────────────────────────────────────────────

class ApplicationQuestion(models.Model):
    """
    Dynamic question engine. Each question has full metadata used for
    conditional branching, scoring, and ML extraction.
    """

    QUESTION_TYPE_CHOICES = [
        ("narrative", _("Narrative (long text)")),
        ("short_text", _("Short text")),
        ("numeric", _("Numeric")),
        ("boolean", _("Yes / No")),
        ("multi_choice", _("Multiple choice")),
        ("url", _("URL")),
        ("date", _("Date")),
    ]

    CATEGORY_CHOICES = [
        ("problem", _("Problem")),
        ("product", _("Product")),
        ("market", _("Market")),
        ("traction", _("Traction")),
        ("team", _("Team")),
        ("financials", _("Financials")),
        ("legal", _("Legal & Compliance")),
        ("other", _("Other")),
    ]

    MATERIALITY_CHOICES = [
        ("critical", _("Critical")),
        ("high", _("High")),
        ("medium", _("Medium")),
        ("low", _("Low")),
    ]

    program = models.ForeignKey(
        AcceleratorProgram, on_delete=models.CASCADE, related_name="questions"
    )
    text = models.TextField(_("question text"))
    help_text = models.TextField(_("help text"), blank=True)
    question_type = models.CharField(
        _("type"), max_length=20, choices=QUESTION_TYPE_CHOICES, default="narrative"
    )
    category = models.CharField(
        _("category"), max_length=30, choices=CATEGORY_CHOICES, default="problem"
    )
    materiality = models.CharField(
        _("materiality"), max_length=20, choices=MATERIALITY_CHOICES, default="high"
    )
    is_required = models.BooleanField(_("required"), default=True)
    evidence_required = models.BooleanField(_("evidence required"), default=False)
    expected_word_count_min = models.PositiveIntegerField(default=0)
    expected_word_count_max = models.PositiveIntegerField(default=500)

    # Scoring
    scoring_dimensions = models.JSONField(
        _("scoring dimensions"), default=list, blank=True,
        help_text=_("e.g. ['problem_severity', 'market_insight', 'founder_fit']")
    )

    # Conditional display
    conditional_on = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="dependent_questions",
        help_text=_("Show this question only if the referenced question has a certain value"),
    )
    conditional_value = models.CharField(_("conditional trigger value"), max_length=255, blank=True)

    # Stage relevance
    stage_relevance = models.JSONField(
        _("stage relevance"), default=list, blank=True,
        help_text=_("e.g. ['pre_seed', 'seed'] - empty means all stages")
    )

    # Revenue-based conditional
    show_if_revenue_status = models.CharField(
        _("show if revenue status"), max_length=50, blank=True,
        help_text=_("Leave blank to always show; set to revenue status value to gate")
    )

    # ML extraction
    ai_extraction_enabled = models.BooleanField(_("ML extraction enabled"), default=True)
    claim_categories = models.JSONField(
        _("claim categories"), default=list, blank=True,
        help_text=_("Which claim categories the ML pipeline should extract from this response")
    )

    # Choices (for multi_choice)
    choices = models.JSONField(_("choices"), default=list, blank=True)

    order = models.PositiveIntegerField(_("order"), default=0)
    is_active = models.BooleanField(_("active"), default=True)

    class Meta:
        verbose_name = _("application question")
        verbose_name_plural = _("application questions")
        ordering = ["order"]

    def __str__(self) -> str:
        return f"[{self.category}] {self.text[:80]}"


class QuestionResponse(models.Model):
    """
    A founder's response to a single application question.
    """

    EVIDENCE_STATUS_CHOICES = [
        ("none", _("No evidence provided")),
        ("pending", _("Evidence upload pending")),
        ("partial", _("Partially evidenced")),
        ("verified", _("Verified")),
        ("failed", _("Verification failed")),
    ]

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="responses"
    )
    question = models.ForeignKey(
        ApplicationQuestion, on_delete=models.CASCADE, related_name="responses"
    )

    # Response content (only one type will be populated)
    text_response = models.TextField(_("text response"), blank=True)
    numeric_response = models.FloatField(_("numeric response"), null=True, blank=True)
    boolean_response = models.BooleanField(_("boolean response"), null=True, blank=True)
    selected_choices = models.JSONField(_("selected choices"), default=list, blank=True)
    url_response = models.URLField(_("URL response"), blank=True)

    # Evidence
    evidence_status = models.CharField(
        _("evidence status"), max_length=20,
        choices=EVIDENCE_STATUS_CHOICES, default="none"
    )
    evidence_notes = models.TextField(_("evidence notes"), blank=True)

    # ML extraction output
    extracted_claims = models.JSONField(_("extracted claims"), default=list, blank=True)
    ai_score = models.FloatField(_("ML dimension score"), null=True, blank=True)
    ai_score_reasoning = models.TextField(_("ML scoring reasoning"), blank=True)

    word_count = models.PositiveIntegerField(_("word count"), default=0)
    last_saved_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("question response")
        verbose_name_plural = _("question responses")
        unique_together = [["application", "question"]]

    def __str__(self) -> str:
        return f"{self.application} - Q: {self.question_id}"


# ──────────────────────────────────────────────────────────────────────────────
# 6. ApplicationDocument
# ──────────────────────────────────────────────────────────────────────────────

class ApplicationDocument(models.Model):
    """
    Document uploaded as part of an application. Parsed automatically to extract claims.
    """

    DOCUMENT_TYPE_CHOICES = [
        ("pitch_deck", _("Pitch Deck")),
        ("financial_model", _("Financial Model")),
        ("cap_table", _("Cap Table")),
        ("incorporation", _("Incorporation Documents")),
        ("business_registration", _("Business Registration")),
        ("founder_cv", _("Founder CV")),
        ("product_demo", _("Product Demo")),
        ("customer_contracts", _("Customer Contracts")),
        ("lois", _("Letters of Intent (LOIs)")),
        ("invoices", _("Invoices")),
        ("bank_statements", _("Bank / Payment Evidence")),
        ("analytics", _("Analytics Screenshots")),
        ("patents", _("Patents / IP")),
        ("regulatory", _("Regulatory Documents")),
        ("previous_investment", _("Previous Investment Documents")),
        ("other", _("Other")),
    ]

    EXTRACTION_STATUS_CHOICES = [
        ("pending", _("Pending")),
        ("processing", _("Processing")),
        ("complete", _("Complete")),
        ("failed", _("Failed")),
    ]

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="documents"
    )
    document_type = models.CharField(
        _("document type"), max_length=40, choices=DOCUMENT_TYPE_CHOICES
    )
    file_url = models.URLField(_("file URL"), max_length=1000)
    file_name = models.CharField(_("file name"), max_length=500, blank=True)
    file_size_bytes = models.PositiveIntegerField(_("file size (bytes)"), default=0)
    mime_type = models.CharField(_("MIME type"), max_length=100, blank=True)

    # Parsing
    parsed_content = models.JSONField(_("parsed content"), default=dict, blank=True)
    extraction_status = models.CharField(
        _("extraction status"), max_length=20,
        choices=EXTRACTION_STATUS_CHOICES, default="pending"
    )
    extracted_claims_count = models.PositiveIntegerField(_("extracted claims count"), default=0)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    extracted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("application document")
        verbose_name_plural = _("application documents")
        ordering = ["document_type", "-uploaded_at"]

    def __str__(self) -> str:
        return f"{self.get_document_type_display()} - {self.file_name}"


# ──────────────────────────────────────────────────────────────────────────────
# 7. ApplicationClaim
# ──────────────────────────────────────────────────────────────────────────────

# Materiality labels are stored as text, so ordering by the column sorted them
# alphabetically — "low" ahead of "medium", and "critical" only accidentally
# first. Significance lives in this declaration order, which is what the rank
# expression below reads, so the two can never drift apart.
CLAIM_MATERIALITY_CHOICES = [
    ("critical", _("Critical")),
    ("high", _("High")),
    ("medium", _("Medium")),
    ("low", _("Low")),
]

CLAIM_MATERIALITY_RANK = {
    value: index for index, (value, _label) in enumerate(CLAIM_MATERIALITY_CHOICES)
}


def materiality_rank_expr(field: str = "materiality") -> models.Case:
    """ORDER BY term returning the most material rows first.

    Anything outside CLAIM_MATERIALITY_CHOICES ranks last rather than sneaking
    in on alphabetical luck. ApplicationClaim uses it as its default ordering so
    every consumer — evidence graph caps, interview probes, decision dossiers —
    truncates the same way.
    """
    return models.Case(
        *[
            models.When(**{field: value}, then=models.Value(rank))
            for value, rank in CLAIM_MATERIALITY_RANK.items()
        ],
        default=models.Value(len(CLAIM_MATERIALITY_RANK)),
        output_field=models.IntegerField(),
    )


def materiality_ordering(field: str = "materiality") -> list:
    """The whole ORDER BY the rank is meant to drive: most material first, then
    newest, then pk.

    The pk term is not decoration. Rows written inside one clock tick share a
    ``created_at``, and an unordered tie lets the truncating caps — graph nodes,
    interview probes — pick different rows on each read of the same application.
    Higher pk is the later insert, so it is the newest-first tiebreak, stated in
    exactly one place.
    """
    return [materiality_rank_expr(field), "-created_at", "-pk"]


class ApplicationClaim(models.Model):
    """
    Every material statement from the application/documents becomes a structured claim object.
    e.g. "We have 100 signed LOIs" → claim object with verification workflow.
    """

    CATEGORY_CHOICES = [
        ("commercial_traction", _("Commercial Traction")),
        ("revenue", _("Revenue")),
        ("team", _("Team")),
        ("market", _("Market")),
        ("product", _("Product")),
        ("funding", _("Funding History")),
        ("ip", _("IP / Patents")),
        ("regulatory", _("Regulatory")),
        ("other", _("Other")),
    ]

    MATERIALITY_CHOICES = CLAIM_MATERIALITY_CHOICES

    SOURCE_CHOICES = [
        ("application_answer", _("Application Answer")),
        ("document", _("Document")),
        ("interview", _("Interview")),
        ("pitch_deck", _("Pitch Deck")),
        ("financial_model", _("Financial Model")),
    ]

    VERIFICATION_STATUS_CHOICES = [
        ("pending", _("Pending")),
        ("verified", _("Verified")),
        ("partially_verified", _("Partially Verified")),
        ("unverified", _("Unverified")),
        ("contradicted", _("Contradicted")),
        ("flagged", _("Flagged")),
    ]

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="claims"
    )
    claim_id = models.CharField(_("claim ID"), max_length=20, blank=True)  # e.g. C-00127
    claim_text = models.TextField(_("claim text"))
    category = models.CharField(_("category"), max_length=30, choices=CATEGORY_CHOICES)
    materiality = models.CharField(_("materiality"), max_length=20, choices=MATERIALITY_CHOICES)
    source = models.CharField(_("source"), max_length=30, choices=SOURCE_CHOICES)
    source_document = models.ForeignKey(
        ApplicationDocument, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="extracted_claims"
    )
    source_question = models.ForeignKey(
        ApplicationQuestion, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="extracted_claims"
    )
    # An answer given in an interview is a claim like any other, and lands in
    # the same graph so the deck and the interview can be set against each
    # other. It needs the same provenance — which session, which turn — because
    # without the link an interview-sourced claim is unsourced prose that
    # cannot be re-read. Only a human pins a claim to a session.
    source_interview = models.ForeignKey(
        "InterviewSession", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="derived_claims",
        help_text=_("Set when this claim was heard in an interview."),
    )
    source_transcript_turn = models.PositiveIntegerField(
        _("transcript turn"), null=True, blank=True,
        help_text=_("Index into the session's append-only transcript. Appending "
                    "keeps an index stable; a deleted session leaves this null "
                    "rather than pointing at nothing."),
    )

    founder_asserted = models.BooleanField(_("founder asserted"), default=True)
    evidence_required = models.BooleanField(_("evidence required"), default=False)
    evidence_status = models.CharField(
        _("evidence status"), max_length=20,
        choices=[
            ("none", "None"), ("partial", "Partial"), ("provided", "Provided"),
        ],
        default="none"
    )
    verification_status = models.CharField(
        _("verification status"), max_length=30,
        choices=VERIFICATION_STATUS_CHOICES, default="pending"
    )
    verified_value = models.JSONField(_("verified value"), default=dict, blank=True)
    discrepancy_notes = models.TextField(_("discrepancy notes"), blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("application claim")
        verbose_name_plural = _("application claims")
        ordering = materiality_ordering()

    def __str__(self) -> str:
        return f"[{self.claim_id}] {self.claim_text[:80]} ({self.verification_status})"


# ──────────────────────────────────────────────────────────────────────────────
# 8. ClaimEvidence
# ──────────────────────────────────────────────────────────────────────────────

class ClaimEvidence(models.Model):
    """
    Detailed evidence verification result for a specific claim.
    e.g. "100 LOIs claimed → 82 found, 76 unique, 69 signed, 61 current, 48 commercial intent"
    """

    claim = models.OneToOneField(
        ApplicationClaim, on_delete=models.CASCADE, related_name="evidence_detail"
    )
    document = models.ForeignKey(
        ApplicationDocument, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="claim_evidences"
    )

    # Quantitative verification
    claimed_count = models.PositiveIntegerField(_("claimed count"), default=0)
    documents_found = models.PositiveIntegerField(_("documents found"), default=0)
    documents_signed = models.PositiveIntegerField(_("documents signed"), default=0)
    unique_entities = models.PositiveIntegerField(_("unique entities"), default=0)
    current_documents = models.PositiveIntegerField(_("current / unexpired"), default=0)
    commercial_intent_count = models.PositiveIntegerField(_("commercial intent"), default=0)

    # Qualitative
    verification_summary = models.JSONField(_("verification summary"), default=dict, blank=True)
    confidence = models.FloatField(_("confidence (0-1)"), default=0.0)
    flags = models.JSONField(_("verification flags"), default=list, blank=True)

    verified_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("claim evidence")
        verbose_name_plural = _("claim evidences")

    def __str__(self) -> str:
        return f"Evidence for {self.claim}"


# ──────────────────────────────────────────────────────────────────────────────
# 9. ApplicationAssessment
# ──────────────────────────────────────────────────────────────────────────────

class ApplicationAssessment(models.Model):
    """
    Multi-dimensional automated assessment. Each dimension has a score AND a confidence %.
    Separates startup strength from application completeness from evidence confidence.
    """

    RECOMMENDATION_CHOICES = [
        ("INTERVIEW", _("Recommend Interview")),
        ("REJECT", _("Recommend Rejection")),
        ("WAITLIST", _("Recommend Waitlist")),
        ("REQUEST_EVIDENCE", _("Request Additional Evidence")),
    ]

    application = models.OneToOneField(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="assessment"
    )

    # ── Dimension scores (0-100) + confidence (0-1) ──
    founder_score = models.FloatField(default=0.0)
    founder_confidence = models.FloatField(default=0.0)

    problem_score = models.FloatField(default=0.0)
    problem_confidence = models.FloatField(default=0.0)

    product_score = models.FloatField(default=0.0)
    product_confidence = models.FloatField(default=0.0)

    market_score = models.FloatField(default=0.0)
    market_confidence = models.FloatField(default=0.0)

    traction_score = models.FloatField(default=0.0)
    traction_confidence = models.FloatField(default=0.0)

    revenue_score = models.FloatField(default=0.0)
    revenue_confidence = models.FloatField(default=0.0)

    team_score = models.FloatField(default=0.0)
    team_confidence = models.FloatField(default=0.0)

    # ── Stage intelligence ──
    declared_stage = models.CharField(max_length=50, blank=True)
    inferred_stage = models.CharField(max_length=50, blank=True)
    stage_confidence = models.FloatField(default=0.0)
    stage_conflict = models.BooleanField(default=False)
    stage_conflict_explanation = models.TextField(blank=True)

    # ── Program fit breakdown (0-100 each) ──
    stage_fit = models.FloatField(default=0.0)
    geography_fit = models.FloatField(default=0.0)
    sector_fit = models.FloatField(default=0.0)
    founder_fit = models.FloatField(default=0.0)
    framework_fit = models.FloatField(default=0.0)
    timing_fit = models.FloatField(default=0.0)
    evidence_fit = models.FloatField(default=0.0)

    # ── Composite scores ──
    overall_program_fit = models.FloatField(default=0.0)
    startup_strength = models.FloatField(default=0.0)
    evidence_confidence = models.FloatField(default=0.0)
    application_completeness = models.FloatField(default=0.0)

    # ── Risk flags ──
    risk_flags = models.JSONField(
        default=list, blank=True,
        help_text=_("[{risk, severity, confidence, evidence, mitigation}]")
    )

    # ── IC Debate material ──
    bull_case = models.JSONField(
        default=list, blank=True,
        help_text=_("[{point, evidence, strength}]")
    )
    bear_case = models.JSONField(
        default=list, blank=True,
        help_text=_("[{point, evidence, strength}]")
    )
    key_unknowns = models.JSONField(default=list, blank=True)
    contradictions_detected = models.JSONField(default=list, blank=True)

    # ── Recommendation ──
    overall_recommendation = models.CharField(
        _("recommendation"), max_length=20,
        choices=RECOMMENDATION_CHOICES, default="REQUEST_EVIDENCE"
    )
    recommendation_confidence = models.FloatField(_("recommendation confidence"), default=0.0)
    recommendation_reasoning = models.TextField(blank=True)

    generated_at = models.DateTimeField(auto_now=True)
    engine_version = models.CharField(max_length=20, default="1.0")

    class Meta:
        verbose_name = _("application assessment")
        verbose_name_plural = _("application assessments")

    def __str__(self) -> str:
        return (
            f"Assessment: {self.application.startup_profile.company_name} "
            f"[Fit: {self.overall_program_fit:.0f} | Strength: {self.startup_strength:.0f}]"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 10. ReviewerAssessment
# ──────────────────────────────────────────────────────────────────────────────

class ReviewerAssessment(models.Model):
    """Per-reviewer scorecard. Multiple reviewers can score the same application."""

    RECOMMENDATION_CHOICES = [
        ("INTERVIEW", _("Interview")),
        ("REJECT", _("Reject")),
        ("WAITLIST", _("Waitlist")),
        ("NEEDS_MORE_INFO", _("Needs More Info")),
    ]

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="reviewer_assessments"
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviewed_applications"
    )

    founder_score = models.FloatField(_("founder (1-10)"), default=5.0)
    market_score = models.FloatField(_("market (1-10)"), default=5.0)
    product_score = models.FloatField(_("product (1-10)"), default=5.0)
    team_score = models.FloatField(_("team (1-10)"), default=5.0)
    traction_score = models.FloatField(_("traction (1-10)"), default=5.0)
    overall_conviction = models.FloatField(_("overall conviction (1-10)"), default=5.0)

    recommendation = models.CharField(
        _("recommendation"), max_length=20,
        choices=RECOMMENDATION_CHOICES, default="NEEDS_MORE_INFO"
    )
    notes = models.TextField(_("reviewer notes"), blank=True)
    strengths = models.JSONField(_("key strengths"), default=list, blank=True)
    concerns = models.JSONField(_("key concerns"), default=list, blank=True)

    # Flexible dimension scores for program-specific rubrics (e.g. {"innovation": 7.5})
    dimension_scores = models.JSONField(
        _("dimension scores"), default=dict, blank=True,
        help_text=_("{dimension_name: score_1_to_10}")
    )

    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── ML baseline / human-variance tracking (migration 0004) ────────────────
    ml_model_version = models.CharField(verbose_name='ML baseline model version', max_length=100, blank=True, default='')
    ml_variance_deltas = models.JSONField(verbose_name='ML variance deltas', blank=True, default=dict)
    variance_rationale = models.TextField(verbose_name='variance rationale / human override explanation', blank=True, default='', help_text='Human justification when reviewer score deviates from ML or peer consensus.')

    class Meta:
        verbose_name = _("reviewer assessment")
        verbose_name_plural = _("reviewer assessments")
        unique_together = [["application", "reviewer"]]

    def get_dimension_score(self, dimension_name: str) -> float:
        """
        Returns the score for the given dimension name.
        Falls back to standard fields (founder, market, product, team, traction)
        before returning 5.0 as a neutral default.
        """
        # 1. Check flexible dimension_scores dict first
        if self.dimension_scores and dimension_name in self.dimension_scores:
            return float(self.dimension_scores[dimension_name])

        # 2. Fall back to standard fields
        _mapping = {
            "founder": self.founder_score,
            "market": self.market_score,
            "product": self.product_score,
            "team": self.team_score,
            "traction": self.traction_score,
        }
        dname = dimension_name.lower()
        for key, val in _mapping.items():
            if key in dname:
                return float(val)

        # 3. Neutral fallback
        return 5.0

    def __str__(self) -> str:
        return f"{self.reviewer.email} → {self.application}"


# ──────────────────────────────────────────────────────────────────────────────
# 11. ReviewerDisagreement
# ──────────────────────────────────────────────────────────────────────────────

class ReviewerDisagreement(models.Model):
    """Auto-detected when reviewers diverge significantly on a dimension."""

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="reviewer_disagreements"
    )
    dimension = models.CharField(_("dimension"), max_length=50)
    variance_pct = models.FloatField(_("variance (%)"), default=0.0)
    reviewer_a = models.ForeignKey(
        ReviewerAssessment, on_delete=models.CASCADE, related_name="disagreements_as_a"
    )
    reviewer_b = models.ForeignKey(
        ReviewerAssessment, on_delete=models.CASCADE, related_name="disagreements_as_b"
    )
    resolution_notes = models.TextField(_("resolution notes"), blank=True)
    resolved = models.BooleanField(_("resolved"), default=False)
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("reviewer disagreement")
        verbose_name_plural = _("reviewer disagreements")

    def __str__(self) -> str:
        return f"Disagreement on {self.dimension} for {self.application} ({self.variance_pct:.0f}% variance)"


# ──────────────────────────────────────────────────────────────────────────────
# 12. InterviewSession
# ──────────────────────────────────────────────────────────────────────────────

class InterviewSession(models.Model):
    """ML-voice or human interview with full transcript and intelligence extraction."""

    INTERVIEW_TYPE_CHOICES = [
        ("ai_voice", _("ML Voice Screening")),
        ("human_video", _("Human Video Call")),
        ("human_in_person", _("Human In-Person")),
    ]

    STATUS_CHOICES = [
        ("scheduled", _("Scheduled")),
        ("in_progress", _("In Progress")),
        ("complete", _("Complete")),
        ("cancelled", _("Cancelled")),
        ("no_show", _("No Show")),
    ]

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="interviews"
    )
    interview_type = models.CharField(
        _("type"), max_length=20, choices=INTERVIEW_TYPE_CHOICES, default="ai_voice"
    )
    round_number = models.PositiveIntegerField(_("round"), default=1)
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="conducted_interviews",
        help_text=_("Null = ML-conducted interview"),
    )

    status = models.CharField(
        _("status"), max_length=20, choices=STATUS_CHOICES, default="scheduled"
    )
    scheduled_at = models.DateTimeField(_("scheduled at"), null=True, blank=True)
    completed_at = models.DateTimeField(_("completed at"), null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(_("duration (minutes)"), default=0)

    # Interview content
    questions_asked = models.JSONField(_("questions asked"), default=list, blank=True)
    transcript = models.JSONField(
        _("transcript"), default=list, blank=True,
        help_text=_("[{speaker, text, timestamp}]")
    )
    recording_url = models.URLField(_("recording URL"), blank=True)

    # Intelligence extraction
    extracted_claims = models.JSONField(_("extracted claims"), default=list, blank=True)
    contradictions = models.JSONField(
        _("contradictions"), default=list, blank=True,
        help_text=_("[{claim, application_value, interview_value, severity}]")
    )
    new_evidence = models.JSONField(_("new evidence"), default=list, blank=True)
    red_flags = models.JSONField(_("red flags"), default=list, blank=True)
    key_insights = models.JSONField(_("key insights"), default=list, blank=True)

    # Scores
    founder_confidence_score = models.FloatField(_("founder confidence score"), default=0.0)
    knowledge_depth_score = models.FloatField(_("knowledge depth score"), default=0.0)
    communication_score = models.FloatField(_("communication score"), default=0.0)
    overall_interview_score = models.FloatField(_("overall interview score"), default=0.0)

    # Cross-source comparison
    cross_source_summary = models.JSONField(
        _("cross-source comparison"), default=dict, blank=True,
        help_text=_("{application_vs_deck: ..., deck_vs_interview: ..., application_vs_interview: ...}")
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("interview session")
        verbose_name_plural = _("interview sessions")
        ordering = ["scheduled_at"]

    # Who a transcript line may be attributed to. Deliberately narrow: a
    # transcript is evidence about *who said what*, so the speaker is a chosen
    # field rather than free text a client can invent.
    TRANSCRIPT_SPEAKERS = ("founder", "interviewer", "team_member", "observer")

    def append_transcript_turns(self, turns, recorded_by=None):
        """Append what was said, and return the stored transcript.

        The clock is the server's, never the caller's: an ordering a reviewer
        could rewind is not evidence. Each turn keeps who typed it too, which is
        a different person from whoever spoke — a coordinator writing up a call
        is not the founder.

        Turns are append-only. That is what lets a claim cite a turn number and
        still mean the same sentence next month.
        """
        now = timezone.now().isoformat()
        stored = list(self.transcript or [])
        for turn in turns:
            stored.append({
                "turn": len(stored),
                "speaker": turn["speaker"],
                "text": turn["text"],
                "timestamp": now,
                "recorded_by": _person_label(recorded_by),
                "recorded_by_id": getattr(recorded_by, "pk", None),
            })
        self.transcript = stored
        fields = ["transcript"]
        if self.status in ("scheduled", "no_show"):
            # Something was written down, so the session is no longer merely
            # booked. Completing it stays a separate human act.
            self.status = "in_progress"
            fields.append("status")
        self.save(update_fields=fields)
        return stored

    def transcript_turn(self, index):
        """The stored turn at `index`, or None when nothing was ever logged at
        that position — a deleted or edited transcript never silently re-points
        a claim at somebody else's sentence."""
        if index is None:
            return None
        for turn in self.transcript or []:
            if isinstance(turn, dict) and turn.get("turn") == index:
                return turn
        return None

    def __str__(self) -> str:
        return (
            f"{self.get_interview_type_display()} - {self.application} "
            f"(Round {self.round_number}) [{self.status}]"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 13. CommitteeDecision
# ──────────────────────────────────────────────────────────────────────────────

class CommitteeDecision(models.Model):
    """IC committee workspace - aggregates votes, debate log, and final decision.
    Multiple decisions can be recorded per application (e.g. re-review after evidence)."""

    DECISION_CHOICES = [
        ("ACCEPTED", _("Accepted")),
        ("REJECTED", _("Rejected")),
        ("WAITLISTED", _("Waitlisted")),
        ("DEFERRED", _("Deferred to Next Cohort")),
        ("EVIDENCE_REQUESTED", _("Request Additional Evidence")),
    ]

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="committee_decisions"
    )

    decision = models.CharField(
        _("decision"), max_length=20, choices=DECISION_CHOICES, blank=True
    )

    # Structured vote aggregation
    vote_summary = models.JSONField(
        _("vote summary"), default=dict, blank=True,
        help_text=_("{yes: N, no: M, conditional: K, abstain: J, total_votes: N, quorum_met: bool}")
    )
    individual_votes = models.JSONField(
        _("individual votes"), default=list, blank=True,
        help_text=_("[{voter_id, voter_name, vote, conviction_score, notes}]")
    )
    debate_log = models.JSONField(
        _("debate log"), default=list, blank=True,
        help_text=_("[{participant, point, side (bull/bear), timestamp}]")
    )

    # Aliases used by DecisionRoom.record_decision()
    notes = models.TextField(_("decision notes / rationale"), blank=True)
    stipulations = models.JSONField(
        _("stipulations (conditional accept)"), default=list, blank=True
    )
    # Legacy alias kept for backward compatibility
    decision_rationale = models.TextField(_("decision rationale"), blank=True)
    conditions = models.TextField(_("conditions (if conditional accept)"), blank=True)

    # voting_summary alias used by decision_room.py
    @property
    def voting_summary(self) -> dict:
        return self.vote_summary

    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="ic_decisions"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("committee decision")
        verbose_name_plural = _("committee decisions")
        ordering = ["-decided_at"]

    def __str__(self) -> str:
        return f"IC Decision: {self.application} → {self.decision or 'Pending'}"


# ──────────────────────────────────────────────────────────────────────────────
# 14. EvidenceRequest
# ──────────────────────────────────────────────────────────────────────────────

class EvidenceRequest(models.Model):
    """
    Loop-back evidence collection. Committee/reviewer requests specific documents,
    founder uploads, Pitchmic re-runs assessment automatically.
    """

    STATUS_CHOICES = [
        ("PENDING", _("Pending Founder Response")),
        ("PARTIAL", _("Partially Responded")),
        ("COMPLETE", _("Complete")),
        ("EXPIRED", _("Expired")),
    ]

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="evidence_requests"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="evidence_requests_made"
    )
    requested_items = models.JSONField(
        _("requested items"), default=list,
        help_text=_("[{type, description, required}]")
    )
    message_to_founder = models.TextField(_("message to founder"), blank=True)
    response_deadline = models.DateTimeField(_("response deadline"), null=True, blank=True)
    status = models.CharField(_("status"), max_length=20, choices=STATUS_CHOICES, default="PENDING")

    # Before/after assessment delta
    pre_readiness_score = models.FloatField(_("readiness before"), default=0.0)
    post_readiness_score = models.FloatField(_("readiness after"), default=0.0)

    founder_response = models.TextField(_("founder response notes"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("evidence request")
        verbose_name_plural = _("evidence requests")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Evidence Request: {self.application} [{self.status}]"


# ──────────────────────────────────────────────────────────────────────────────
# 14b. DiligenceItem
# ──────────────────────────────────────────────────────────────────────────────

class DiligenceItem(models.Model):
    """One diligence question the program is chasing on an application.

    Ownership, not a verdict: this row says a named human is answerable for
    clearing a question by a date. It does not decide the application's
    outcome, and a resolved item is evidence the program recorded — the
    committee still reads it and decides for itself.

    Both `owner` and `due_at` are nullable on purpose. Missing is not zero and
    an unowned question is not nobody's problem: it is an unassigned one, and
    the board has to be able to say that out loud.
    """

    STATUS_CHOICES = [
        ("open", _("Open")),
        ("in_progress", _("Being Checked")),
        ("resolved", _("Resolved")),
        ("blocked", _("Blocked")),
    ]

    # Anything the program still has to chase. A blocked item is still owed —
    # waiting on someone is not the same as done.
    OPEN_STATUSES = ("open", "in_progress", "blocked")

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="diligence_items"
    )
    question = models.CharField(
        _("question to verify"), max_length=255,
        help_text=_("What must be proved or disproved, e.g. 'Churn figure in the deck covers "
                    "logins, not revenue — confirm against Stripe.'"),
    )
    area = models.CharField(
        _("diligence area"), max_length=40, blank=True,
        help_text=_("Free-text label (finance, legal, technical, references…). Not a scorecard "
                    "dimension, and deliberately not an enumerated taxonomy."),
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="owned_diligence_items", verbose_name=_("owner"),
        help_text=_("The person answerable for clearing this. None means unassigned, "
                    "not that nobody cares."),
    )
    due_at = models.DateTimeField(_("due at"), null=True, blank=True)
    status = models.CharField(
        _("status"), max_length=20, choices=STATUS_CHOICES, default="open"
    )
    resolution_note = models.TextField(
        _("what was found"), blank=True,
        help_text=_("Filled in when a human closes the question."),
    )
    resolved_at = models.DateTimeField(_("resolved at"), null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="diligence_items_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("diligence item")
        verbose_name_plural = _("diligence items")
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"DD: {self.question[:60]} [{self.status}]"

    def is_overdue(self, now=None) -> bool:
        """The one overdue rule. Nothing past a deadline is overdue until it
        has actually been overtaken by the clock; no due date is not overdue, it
        is undated, and a resolved item is finished whatever its date said."""
        if self.due_at is None or self.status not in self.OPEN_STATUSES:
            return False
        return self.due_at < (now or timezone.now())


# ──────────────────────────────────────────────────────────────────────────────
# 15. ProgramMembership
# ──────────────────────────────────────────────────────────────────────────────

class ProgramMembership(models.Model):
    """
    Created automatically on ACCEPTED decision.
    Tracks the startup's journey through the active program cohort.
    """

    application = models.OneToOneField(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="membership"
    )
    program = models.ForeignKey(
        AcceleratorProgram, on_delete=models.CASCADE, related_name="members"
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)

    # Assignments
    mentor_assignments = models.JSONField(
        _("mentor assignments"), default=list, blank=True,
        help_text=_("[{mentor_id, name, focus_area, sessions_completed}]")
    )
    investor_profile_url = models.URLField(_("investor-facing profile URL"), blank=True)
    data_room_url = models.URLField(_("data room URL"), blank=True)
    reporting_requirements = models.JSONField(
        _("reporting requirements"), default=dict, blank=True
    )

    # Post-program tracking
    is_active = models.BooleanField(_("active in program"), default=True)
    graduation_date = models.DateField(null=True, blank=True)
    demo_day_slot = models.PositiveIntegerField(_("Demo Day slot"), null=True, blank=True)

    # ── Onboarding / cohort tracking (migration 0006) ─────────────────────────
    agreement_signed = models.BooleanField(verbose_name='program agreement signed', default=False)
    baseline_completed = models.BooleanField(verbose_name='baseline metrics submitted', default=False)
    cohort_number = models.PositiveIntegerField(verbose_name='cohort number', blank=True, null=True)
    onboarding_status = models.CharField(verbose_name='onboarding status', max_length=20, default='pending', choices=[('pending', 'Pending'), ('in_progress', 'In Progress'), ('complete', 'Complete')])
    track = models.ForeignKey(blank=True, null=True, related_name='members', on_delete=models.SET_NULL, to='accelerator.programtrack')

    class Meta:
        verbose_name = _("program membership")
        verbose_name_plural = _("program memberships")

    def __str__(self) -> str:
        return f"{self.application.startup_profile.company_name} - {self.program.name}"


# ──────────────────────────────────────────────────────────────────────────────
# 16. MilestoneTemplate + StartupMilestone
# ──────────────────────────────────────────────────────────────────────────────

class MilestoneTemplate(models.Model):
    """Reusable milestone definitions for a program."""

    CATEGORY_CHOICES = [
        ("product", _("Product")),
        ("revenue", _("Revenue")),
        ("hiring", _("Hiring")),
        ("fundraising", _("Fundraising")),
        ("customer", _("Customer Development")),
        ("regulatory", _("Regulatory")),
        ("other", _("Other")),
    ]

    program = models.ForeignKey(
        AcceleratorProgram, on_delete=models.CASCADE, related_name="milestone_templates"
    )
    title = models.CharField(_("milestone title"), max_length=255)
    description = models.TextField(_("description"), blank=True)
    category = models.CharField(_("category"), max_length=30, choices=CATEGORY_CHOICES)
    week_number = models.PositiveIntegerField(_("target week number"), default=1)
    is_required = models.BooleanField(_("required"), default=True)
    order = models.PositiveIntegerField(_("order"), default=0)

    class Meta:
        verbose_name = _("milestone template")
        verbose_name_plural = _("milestone templates")
        ordering = ["week_number", "order"]

    def __str__(self) -> str:
        return f"[Wk{self.week_number}] {self.title}"


class StartupMilestone(models.Model):
    """Per-company milestone tracking within the active cohort."""

    STATUS_CHOICES = [
        ("not_started", _("Not Started")),
        ("in_progress", _("In Progress")),
        ("complete", _("Complete")),
        ("overdue", _("Overdue")),
        ("waived", _("Waived")),
    ]

    membership = models.ForeignKey(
        ProgramMembership, on_delete=models.CASCADE, related_name="milestones"
    )
    template = models.ForeignKey(
        MilestoneTemplate, on_delete=models.CASCADE, related_name="startup_milestones"
    )

    status = models.CharField(
        _("status"), max_length=20, choices=STATUS_CHOICES, default="not_started"
    )
    evidence_url = models.URLField(_("evidence URL"), blank=True)
    notes = models.TextField(_("notes"), blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── Milestone review (migration 0006) ─────────────────────────────────────
    due_date = models.DateTimeField(verbose_name='due date', blank=True, null=True)
    review_notes = models.TextField(verbose_name='review notes', blank=True)
    reviewer = models.ForeignKey(blank=True, null=True, related_name='reviewed_milestones', on_delete=models.SET_NULL, to=settings.AUTH_USER_MODEL)

    class Meta:
        verbose_name = _("startup milestone")
        verbose_name_plural = _("startup milestones")
        unique_together = [["membership", "template"]]

    def __str__(self) -> str:
        return f"{self.membership} - {self.template.title} [{self.status}]"


# ──────────────────────────────────────────────────────────────────────────────
# 17. ContinuousAssessment
# ──────────────────────────────────────────────────────────────────────────────

class ContinuousAssessment(models.Model):
    """
    Readiness score snapshots over time - from application through program to post-Demo Day.
    Enables the calibration flywheel: which signals predict long-term success?
    """

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="continuous_assessments"
    )
    period_label = models.CharField(
        _("period label"), max_length=100,
        help_text=_("e.g. 'Application', 'Week 4', 'Demo Day', 'Post-Raise'")
    )
    readiness_score = models.FloatField(_("readiness score (0-100)"), default=0.0)
    assessment_data = models.JSONField(
        _("assessment snapshot"), default=dict, blank=True,
        help_text=_("Full dimension breakdown at this point in time")
    )

    # Outcome anchors (for calibration)
    revenue_at_period = models.DecimalField(
        _("revenue at period (USD)"), max_digits=15, decimal_places=2, null=True, blank=True
    )
    customers_at_period = models.PositiveIntegerField(null=True, blank=True)
    funding_raised_at_period = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True
    )

    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("continuous assessment")
        verbose_name_plural = _("continuous assessments")
        ordering = ["recorded_at"]

    def __str__(self) -> str:
        return f"{self.application} - {self.period_label}: {self.readiness_score:.1f}"


# ──────────────────────────────────────────────────────────────────────────────
# 20. ApplicationAuditEvent
# ──────────────────────────────────────────────────────────────────────────────

class ApplicationAuditEvent(models.Model):
    """
    Immutable audit log for every application stage transition.
    Created by ApplicationPipeline.advance() — never edited, never deleted.
    Provides a tamper-evident SHA-256 snapshot hash of the application state
    at the time of each decision.
    """

    application = models.ForeignKey(
        AcceleratorApplication,
        on_delete=models.CASCADE,
        related_name="audit_events",
    )
    from_stage = models.CharField(_("from stage"), max_length=30, blank=True)
    to_stage = models.CharField(_("to stage"), max_length=30)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accelerator_audit_events",
    )
    reason = models.TextField(_("reason / note"), blank=True)
    policy_version = models.CharField(_("policy version"), max_length=20, blank=True)
    evidence_snapshot = models.JSONField(
        _("evidence snapshot"),
        default=dict,
        blank=True,
        help_text=_("Key scores and metadata captured at transition time."),
    )
    snapshot_hash = models.CharField(
        _("snapshot SHA-256 hash"),
        max_length=64,
        blank=True,
        help_text=_("SHA-256 of the sorted JSON evidence_snapshot payload."),
    )
    is_automated = models.BooleanField(
        _("automated transition"),
        default=False,
        help_text=_("True when the transition was triggered by the ML pipeline."),
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    action_type = models.CharField(verbose_name='action type', max_length=50, default='STAGE_TRANSITION')

    class Meta:
        verbose_name = _("application audit event")
        verbose_name_plural = _("application audit events")
        ordering = ["timestamp"]

    def __str__(self) -> str:
        actor_label = self.actor.email if self.actor else ("System / ML" if self.is_automated else "Unknown")
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {self.from_stage} → {self.to_stage} ({actor_label})"


# ──────────────────────────────────────────────────────────────────────────────
# 6. Review collaboration — notes & comments (append-only, concurrency-safe)
# ──────────────────────────────────────────────────────────────────────────────
# These are separate from ReviewerAssessment (which is unique per reviewer and
# feeds quorum / conviction / disagreement math). A note or a comment is prose,
# never a score, so it can never pollute the scoring aggregates.

class ApplicationNote(models.Model):
    """Timestamped internal reviewer/committee note on an application.

    Append-only rows (not a mutable text blob) so two reviewers writing at the
    same time can never overwrite each other.
    """

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="notes"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="application_notes"
    )
    body = models.TextField(_("note"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("application note")
        verbose_name_plural = _("application notes")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {self.author.email}: {self.body[:60]}"


class ReviewComment(models.Model):
    """A discussion comment in the Decision Room.

    Deliberately NOT a ReviewerAssessment: a comment carries no conviction score
    and is excluded from reviewer_count, committee-rating averages, quorum and
    disagreement detection.
    """

    application = models.ForeignKey(
        AcceleratorApplication, on_delete=models.CASCADE, related_name="review_comments"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="review_comments"
    )
    body = models.TextField(_("comment"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("review comment")
        verbose_name_plural = _("review comments")
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.author.email}: {self.body[:60]}"


# ──────────────────────────────────────────────────────────────────────────────
# Program OS model registration
# ──────────────────────────────────────────────────────────────────────────────
# The models below live in sibling modules but belong to the ``accelerator`` app.
# Importing them here (after every model above is defined) makes Django register
# them so the app state matches migrations 0002-0006. All of these modules use
# string FK references, so importing them at the bottom avoids circular imports.
from apps.accelerator.program_policy import (  # noqa: E402,F401
    ProgramArchetype,
    ProgramEvaluationPolicy,
)
from apps.accelerator.rules_engine import ProgramRule  # noqa: E402,F401
from apps.accelerator import models_os  # noqa: E402,F401
from apps.accelerator import models_config  # noqa: E402,F401
