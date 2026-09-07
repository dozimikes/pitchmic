"""
apps.application_intelligence.models
=====================================
Persistent models for the Application Intelligence Engine.

Models:
  ExternalProgramProfile     – Intelligence profile for an external program (YC, Techstars, …)
  ProgramRequirement         – What a program looks for (per category)
  ProgramApplicationQuestion – Published application questions + rubric metadata
  ProgramSelectionSignal     – Observed/official selection signals per program
  ApplicationStrategy        – Founder-authored strategy scratchpad per startup × program
  CorrelationNote            – Dataset-derived outcome correlations shown in the UI
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


IMPORTANCE_CHOICES = [
    ("LOW", _("Low")),
    ("MEDIUM", _("Medium")),
    ("HIGH", _("High")),
    ("VERY_HIGH", _("Very High")),
]

SOURCE_TYPE_CHOICES = [
    ("OFFICIAL", _("Official")),
    ("INFERRED", _("Inferred")),
    ("OBSERVED", _("Observed")),
]

CONFIDENCE_CHOICES = [
    ("HIGH", _("High")),
    ("MEDIUM", _("Medium")),
    ("LOW", _("Low")),
]

PROGRAM_TYPE_CHOICES = [
    ("Accelerator", _("Accelerator")),
    ("Grant", _("Grant")),
    ("VC Fund", _("VC Fund")),
    ("Competition", _("Competition")),
    ("Angel Syndicate", _("Angel Syndicate")),
]

INFORMATION_LAYER_CHOICES = [
    ("FACTS", _("Facts")),
    ("SIGNALS", _("Signals")),
    ("OUTCOMES", _("Outcomes")),
]

CATEGORY_CHOICES = [
    ("traction", _("Traction")),
    ("team", _("Team")),
    ("market", _("Market")),
    ("product", _("Product")),
    ("customers", _("Customers")),
    ("financials", _("Financials")),
    ("defensibility", _("Defensibility")),
    ("narrative", _("Narrative")),
]


class ExternalProgramProfile(models.Model):
    """
    Intelligence profile for an external accelerator / VC program.
    Captures publicly-available selection criteria, interview intensity,
    and evidence expectations so founders can calibrate their applications.
    """
    name = models.CharField(_("name"), max_length=200)
    short_name = models.CharField(_("short name"), max_length=60, blank=True)
    program_type = models.CharField(
        _("program type"), max_length=30, choices=PROGRAM_TYPE_CHOICES, default="Accelerator"
    )
    stage = models.CharField(_("stage focus"), max_length=120, blank=True)
    investment = models.CharField(_("investment terms"), max_length=120, blank=True)
    geography = models.CharField(_("geography"), max_length=120, blank=True)
    industry = models.CharField(_("industry focus"), max_length=200, blank=True)
    application_format = models.CharField(_("application format"), max_length=200, blank=True)
    website_url = models.URLField(_("website URL"), blank=True)
    deadline_text = models.CharField(_("deadline description"), max_length=200, blank=True)
    founder_quality_bar = models.CharField(_("founder quality bar"), max_length=30, blank=True)
    evidence_expectations_bar = models.CharField(_("evidence expectations bar"), max_length=30, blank=True)
    interview_intensity = models.CharField(_("interview intensity"), max_length=30, blank=True)
    is_active = models.BooleanField(_("active"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = _("external program profile")
        verbose_name_plural = _("external program profiles")

    def __str__(self) -> str:
        return self.name


class ProgramRequirement(models.Model):
    """What a program looks for, broken down by evaluation category."""
    program = models.ForeignKey(
        ExternalProgramProfile,
        on_delete=models.CASCADE,
        related_name="requirements",
    )
    category = models.CharField(_("category"), max_length=30, choices=CATEGORY_CHOICES)
    description = models.TextField(_("description"))
    importance = models.CharField(_("importance"), max_length=10, choices=IMPORTANCE_CHOICES, default="MEDIUM")
    rationale = models.TextField(_("rationale"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["program", "importance", "category"]
        verbose_name = _("program requirement")
        verbose_name_plural = _("program requirements")

    def __str__(self) -> str:
        return f"{self.program.name} / {self.category}"


class ProgramApplicationQuestion(models.Model):
    """Published application questions with rubric metadata."""
    program = models.ForeignKey(
        ExternalProgramProfile,
        on_delete=models.CASCADE,
        related_name="questions",
    )
    question_number = models.PositiveSmallIntegerField(_("question number"))
    label = models.TextField(_("question text"))
    rubric_dimension = models.CharField(_("rubric dimension"), max_length=100, blank=True)
    importance = models.CharField(_("importance"), max_length=10, choices=IMPORTANCE_CHOICES, default="MEDIUM")
    max_char_limit = models.PositiveIntegerField(_("max character limit"), null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["program", "question_number"]
        unique_together = [("program", "question_number")]
        verbose_name = _("program application question")
        verbose_name_plural = _("program application questions")

    def __str__(self) -> str:
        return f"{self.program.short_name or self.program.name} Q{self.question_number}"


class ProgramSelectionSignal(models.Model):
    """Observed or official selection signals for a program."""
    program = models.ForeignKey(
        ExternalProgramProfile,
        on_delete=models.CASCADE,
        related_name="signals",
    )
    criterion = models.CharField(_("criterion"), max_length=100)
    source_type = models.CharField(_("source type"), max_length=20, choices=SOURCE_TYPE_CHOICES, default="OBSERVED")
    weight = models.PositiveSmallIntegerField(_("weight"), default=5, help_text="1–10 relative importance")
    confidence = models.CharField(_("confidence"), max_length=10, choices=CONFIDENCE_CHOICES, default="MEDIUM")
    evidence_text = models.TextField(_("evidence text"))
    official_source_ref = models.CharField(_("official source reference"), max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["program", "-weight"]
        verbose_name = _("program selection signal")
        verbose_name_plural = _("program selection signals")

    def __str__(self) -> str:
        return f"{self.program.name} / {self.criterion}"


class ApplicationStrategy(models.Model):
    """
    Founder-authored application strategy scratchpad.
    One record per startup × external program combination.
    """
    startup = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="application_strategies",
    )
    program = models.ForeignKey(
        ExternalProgramProfile,
        on_delete=models.CASCADE,
        related_name="startup_strategies",
    )
    problem = models.TextField(_("problem statement"), blank=True)
    founder_advantage = models.TextField(_("founder advantage"), blank=True)
    why_now = models.TextField(_("why now"), blank=True)
    proof = models.TextField(_("proof points"), blank=True)
    program_fit = models.TextField(_("program fit"), blank=True)
    primary_weakness = models.TextField(_("primary weakness"), blank=True)
    mitigation = models.TextField(_("mitigation"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("startup", "program")]
        ordering = ["-updated_at"]
        verbose_name = _("application strategy")
        verbose_name_plural = _("application strategies")

    def __str__(self) -> str:
        return f"{self.startup} × {self.program.name}"


class CorrelationNote(models.Model):
    """Dataset-derived outcome correlations surfaced in the Application Intelligence UI."""
    text = models.TextField(_("correlation text"))
    layer = models.CharField(_("information layer"), max_length=10, choices=INFORMATION_LAYER_CHOICES)
    caveat = models.TextField(_("caveat"), blank=True)
    sample_size_hint = models.CharField(_("sample size hint"), max_length=200, blank=True)
    is_active = models.BooleanField(_("active"), default=True)
    sort_order = models.PositiveSmallIntegerField(_("sort order"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name = _("correlation note")
        verbose_name_plural = _("correlation notes")

    def __str__(self) -> str:
        return self.text[:80]
