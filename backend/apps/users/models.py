from __future__ import annotations

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_STARTUP: str = "startup"
    ROLE_INVESTOR: str = "investor"
    ROLE_ACCELERATOR: str = "accelerator"
    ROLE_CHOICES: tuple[tuple[str, str], ...] = (
        (ROLE_STARTUP, _("Startup")),
        (ROLE_INVESTOR, _("Investor")),
        (ROLE_ACCELERATOR, _("Accelerator")),
    )

    email: models.EmailField = models.EmailField(
        _("email address"),
        unique=True,
        max_length=255,
    )
    first_name: models.CharField = models.CharField(_("first name"), max_length=150, blank=True)
    last_name: models.CharField = models.CharField(_("last name"), max_length=150, blank=True)
    role: models.CharField = models.CharField(
        _("role"),
        max_length=20,
        choices=ROLE_CHOICES,
        default=ROLE_STARTUP,
    )
    is_verified: models.BooleanField = models.BooleanField(
        _("verified"),
        default=False,
        help_text=_("Designates whether the user has verified their email."),
    )
    is_staff: models.BooleanField = models.BooleanField(
        _("staff status"),
        default=False,
        help_text=_("Designates whether the user can log into this admin site."),
    )
    is_active: models.BooleanField = models.BooleanField(
        _("active"),
        default=True,
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    objects: UserManager = UserManager()

    USERNAME_FIELD: str = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        verbose_name: str = _("user")
        verbose_name_plural: str = _("users")
        ordering: tuple[str, ...] = ("-created_at",)

    def __str__(self) -> str:
        return self.email

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.email


class StartupProfile(models.Model):
    """
    Replaces the legacy `startups` MySQL table.

    Legacy columns mapped here:
      startup_name       → company_name
      founder_name       → stored as first TeamMember with order=0
      co_foundername_1-4 → TeamMember rows with order=1-4
      niche              → niche (kept as plain text; also mirrored in industry)
      contact_address    → address
      phone_no           → phone
    """

    user: models.OneToOneField = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="startup_profile",
    )
    company_name: models.CharField = models.CharField(_("company name"), max_length=255)
    tagline: models.CharField = models.CharField(_("tagline"), max_length=255, blank=True)
    description: models.TextField = models.TextField(_("description"), blank=True)
    # Contact fields (from legacy startups table)
    address: models.CharField = models.CharField(_("contact address"), max_length=512, blank=True)
    phone: models.CharField = models.CharField(_("phone number"), max_length=50, blank=True)
    # Industry / niche (from legacy "niche" column — stored comma-separated)
    niche: models.CharField = models.CharField(
        _("niche"),
        max_length=500,
        blank=True,
        help_text=_("Comma-separated investment niches / industries"),
    )
    # Extended profile fields
    website: models.URLField = models.URLField(_("website"), blank=True)
    linkedin: models.URLField = models.URLField(_("LinkedIn"), blank=True)
    twitter: models.CharField = models.CharField(_("Twitter/X handle"), max_length=255, blank=True)
    facebook: models.CharField = models.CharField(_("Facebook URL"), max_length=500, blank=True)
    logo_url: models.URLField = models.URLField(_("logo URL"), blank=True)
    industry: models.CharField = models.CharField(_("industry"), max_length=255, blank=True)
    founded_year: models.PositiveIntegerField = models.PositiveIntegerField(
        _("founded year"),
        null=True,
        blank=True,
        validators=[MinValueValidator(1900), MaxValueValidator(2100)],
    )
    location: models.CharField = models.CharField(_("location"), max_length=255, blank=True)
    employee_count: models.CharField = models.CharField(_("employee count"), max_length=50, blank=True)
    # Pitch video URL (from add-startup.html "Input video url for your company pitch")
    pitch_video_url: models.URLField = models.URLField(_("pitch video URL"), blank=True)
    # Target market (from add-startup.html "Target countries")
    target_market: models.CharField = models.CharField(_("target market / countries"), max_length=500, blank=True)
    # ------------------------------------------------------------------
    # ML-ready financial & market fields (used by matching/analytics/intelligence)
    # ------------------------------------------------------------------
    # Funding / financials
    funding_stage: models.CharField = models.CharField(
        _("funding stage"),
        max_length=50,
        blank=True,
        choices=[
            ("pre_seed", "Pre-Seed"),
            ("seed", "Seed"),
            ("series_a", "Series A"),
            ("series_b", "Series B"),
            ("series_c", "Series C"),
            ("growth", "Growth"),
        ],
    )
    total_funding_raised: models.DecimalField = models.DecimalField(
        _("total funding raised (USD)"),
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
    )
    current_revenue: models.DecimalField = models.DecimalField(
        _("current annual revenue (USD)"),
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
    )
    revenue_growth_rate: models.FloatField = models.FloatField(
        _("revenue growth rate (%)"),
        null=True,
        blank=True,
        help_text=_("Year-over-year revenue growth percentage"),
    )
    gross_margin: models.FloatField = models.FloatField(
        _("gross margin (%)"),
        null=True,
        blank=True,
    )
    burn_rate: models.DecimalField = models.DecimalField(
        _("monthly burn rate (USD)"),
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
    )
    runway_months: models.PositiveIntegerField = models.PositiveIntegerField(
        _("runway (months)"),
        null=True,
        blank=True,
    )
    customer_acquisition_cost: models.DecimalField = models.DecimalField(
        _("customer acquisition cost (USD)"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    customer_lifetime_value: models.DecimalField = models.DecimalField(
        _("customer lifetime value (USD)"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    # Market sizing
    tam: models.DecimalField = models.DecimalField(
        _("total addressable market (USD)"),
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
    )
    sam: models.DecimalField = models.DecimalField(
        _("serviceable addressable market (USD)"),
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
    )
    som: models.DecimalField = models.DecimalField(
        _("serviceable obtainable market (USD)"),
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
    )
    market_growth_rate: models.FloatField = models.FloatField(
        _("market annual growth rate (%)"),
        null=True,
        blank=True,
    )
    # Traction
    customer_count: models.PositiveIntegerField = models.PositiveIntegerField(
        _("number of customers"),
        null=True,
        blank=True,
    )
    monthly_active_users: models.PositiveIntegerField = models.PositiveIntegerField(
        _("monthly active users"),
        null=True,
        blank=True,
    )
    # External signals
    github_url: models.URLField = models.URLField(_("GitHub URL"), blank=True)
    patent_count: models.PositiveIntegerField = models.PositiveIntegerField(
        _("number of patents"),
        default=0,
    )
    press_coverage_count: models.PositiveIntegerField = models.PositiveIntegerField(
        _("press coverage articles"),
        default=0,
    )
    awards_count: models.PositiveIntegerField = models.PositiveIntegerField(
        _("awards won"),
        default=0,
    )
    # ML embedding (cached cosine-similarity vector, stored as JSON list)
    embedding_vector: models.JSONField = models.JSONField(
        _("embedding vector"),
        null=True,
        blank=True,
        help_text=_("Cached sentence-transformer embedding for matching"),
    )
    embedding_updated_at: models.DateTimeField = models.DateTimeField(
        _("embedding updated at"),
        null=True,
        blank=True,
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("startup profile")
        verbose_name_plural: str = _("startup profiles")
        ordering: tuple[str, ...] = ("company_name",)

    def __str__(self) -> str:
        return self.company_name


class InvestorProfile(models.Model):
    """
    Replaces the legacy `investors` MySQL table.

    Legacy columns mapped here:
      name          → full_name
      niche         → niche (also mirrored in preferred_industries)
      (new fields added for a complete modern investor profile)
    """

    user: models.OneToOneField = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="investor_profile",
    )
    full_name: models.CharField = models.CharField(_("full name"), max_length=255)
    company_name: models.CharField = models.CharField(_("firm / company name"), max_length=255, blank=True)
    title: models.CharField = models.CharField(_("title / position"), max_length=255, blank=True)
    bio: models.TextField = models.TextField(_("bio"), blank=True)
    # Contact fields (legacy had address + phone)
    address: models.CharField = models.CharField(_("contact address"), max_length=512, blank=True)
    phone: models.CharField = models.CharField(_("phone number"), max_length=50, blank=True)
    # Niche / investment focus (from legacy "niche" column)
    niche: models.CharField = models.CharField(
        _("investment niche"),
        max_length=500,
        blank=True,
        help_text=_("Comma-separated investment niches"),
    )
    # Extended profile fields
    website: models.URLField = models.URLField(_("website"), blank=True)
    linkedin: models.URLField = models.URLField(_("LinkedIn"), blank=True)
    twitter: models.CharField = models.CharField(_("Twitter/X handle"), max_length=255, blank=True)
    avatar_url: models.URLField = models.URLField(_("avatar URL"), blank=True)
    location: models.CharField = models.CharField(_("location"), max_length=255, blank=True)
    investment_range_min: models.DecimalField = models.DecimalField(
        _("min investment"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    investment_range_max: models.DecimalField = models.DecimalField(
        _("max investment"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    preferred_industries: models.CharField = models.CharField(
        _("preferred industries"),
        max_length=500,
        blank=True,
        help_text=_("Comma-separated list of preferred industries"),
    )
    # ------------------------------------------------------------------
    # ML-ready investor preference & behavior fields
    # ------------------------------------------------------------------
    preferred_stages: models.JSONField = models.JSONField(
        _("preferred funding stages"),
        default=list,
        blank=True,
        help_text=_("List of funding stages the investor focuses on"),
    )
    check_size_min: models.DecimalField = models.DecimalField(
        _("minimum check size (USD)"),
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
    )
    check_size_max: models.DecimalField = models.DecimalField(
        _("maximum check size (USD)"),
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
    )
    portfolio_companies: models.PositiveIntegerField = models.PositiveIntegerField(
        _("number of portfolio companies"),
        default=0,
    )
    total_invested: models.DecimalField = models.DecimalField(
        _("total amount invested (USD)"),
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
    )
    successful_exits: models.PositiveIntegerField = models.PositiveIntegerField(
        _("number of successful exits"),
        default=0,
    )
    risk_tolerance: models.CharField = models.CharField(
        _("risk tolerance"),
        max_length=20,
        blank=True,
        choices=[
            ("conservative", "Conservative"),
            ("moderate", "Moderate"),
            ("aggressive", "Aggressive"),
        ],
    )
    geographic_focus: models.JSONField = models.JSONField(
        _("geographic focus"),
        default=list,
        blank=True,
        help_text=_("List of countries / regions the investor focuses on"),
    )
    # ML embedding (cached cosine-similarity vector, stored as JSON list)
    embedding_vector: models.JSONField = models.JSONField(
        _("embedding vector"),
        null=True,
        blank=True,
    )
    embedding_updated_at: models.DateTimeField = models.DateTimeField(
        _("embedding updated at"),
        null=True,
        blank=True,
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("investor profile")
        verbose_name_plural: str = _("investor profiles")
        ordering: tuple[str, ...] = ("full_name",)

    def __str__(self) -> str:
        return self.full_name or self.user.email


class TeamMember(models.Model):
    """
    Replaces the legacy co-founder columns (co_foundername_one…four) with a
    proper relation.  order=0 is the founder, order≥1 are co-founders.
    """

    startup_profile: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="team_members",
    )
    name: models.CharField = models.CharField(_("name"), max_length=255)
    role: models.CharField = models.CharField(
        _("role / title"),
        max_length=255,
        blank=True,
        help_text=_("e.g. Founder, Co-Founder, CTO"),
    )
    bio: models.TextField = models.TextField(_("bio"), blank=True)
    linkedin: models.URLField = models.URLField(_("LinkedIn"), blank=True)
    avatar_url: models.URLField = models.URLField(_("avatar URL"), blank=True)
    order: models.PositiveIntegerField = models.PositiveIntegerField(
        _("display order"),
        default=0,
        help_text=_("0 = founder, higher numbers = co-founders / team"),
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name: str = _("team member")
        verbose_name_plural: str = _("team members")
        ordering: tuple[str, ...] = ("startup_profile", "order")

    def __str__(self) -> str:
        return f"{self.name} ({self.startup_profile.company_name})"
