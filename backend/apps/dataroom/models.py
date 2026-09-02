"""
apps.dataroom.models
=====================
Smart Data Room - granular access control, 5-tier data classification,
folder hierarchies, SHA-256 document versioning, NDA signatures,
and granular audit telemetry.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.pitches.models import Pitch
from apps.users.models import InvestorProfile, StartupProfile


class DataClassificationTier(models.TextChoices):
    PUBLIC = "PUBLIC", _("Public")
    INTERNAL = "INTERNAL", _("Internal")
    CONFIDENTIAL = "CONFIDENTIAL", _("Confidential")
    RESTRICTED = "RESTRICTED", _("Restricted")
    HIGHLY_RESTRICTED = "HIGHLY_RESTRICTED", _("Highly Restricted")


class DataRoomFolder(models.Model):
    """Hierarchical folder organization inside a startup's data room."""

    startup: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="dataroom_folders",
    )
    parent: models.ForeignKey = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="subfolders",
    )
    name: models.CharField = models.CharField(_("folder name"), max_length=255)
    default_classification: models.CharField = models.CharField(
        max_length=30,
        choices=DataClassificationTier.choices,
        default=DataClassificationTier.CONFIDENTIAL,
    )
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("data room folder")
        verbose_name_plural = _("data room folders")
        unique_together = [["startup", "parent", "name"]]
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.startup.company_name} / {self.name}"


class DataRoomDocument(models.Model):
    """A document that a startup adds to their data room."""

    CATEGORY_CHOICES = [
        ("pitch_deck", _("Pitch Deck")),
        ("financials", _("Financials")),
        ("legal", _("Legal / Cap Table")),
        ("technical", _("Technical Architecture")),
        ("market_research", _("Market Research")),
        ("team", _("Team / CVs")),
        ("product", _("Product Demo / Roadmap")),
        ("other", _("Other")),
    ]

    startup: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="dataroom_documents",
    )
    folder: models.ForeignKey = models.ForeignKey(
        DataRoomFolder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )
    pitch: models.ForeignKey = models.ForeignKey(
        Pitch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dataroom_documents",
        help_text=_("Optional: scope this document to a specific pitch"),
    )
    name: models.CharField = models.CharField(_("document name"), max_length=255)
    description: models.TextField = models.TextField(_("description"), blank=True)
    file_url: models.URLField = models.URLField(_("file URL"))
    file_type: models.CharField = models.CharField(_("MIME type"), max_length=100, blank=True)
    file_size_bytes: models.PositiveIntegerField = models.PositiveIntegerField(null=True, blank=True)
    category: models.CharField = models.CharField(
        max_length=30, choices=CATEGORY_CHOICES, default="other", db_index=True
    )
    classification: models.CharField = models.CharField(
        max_length=30,
        choices=DataClassificationTier.choices,
        default=DataClassificationTier.CONFIDENTIAL,
        db_index=True,
    )
    sha256_hash: models.CharField = models.CharField(max_length=64, blank=True)
    is_active: models.BooleanField = models.BooleanField(default=True)
    version: models.CharField = models.CharField(max_length=20, default="1.0")
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("data room document")
        verbose_name_plural = _("data room documents")
        ordering = ["category", "name"]

    def __str__(self) -> str:
        return f"{self.startup.company_name} / {self.name} [{self.classification}]"


class DocumentVersion(models.Model):
    """Immutable version history for a data room document."""

    document: models.ForeignKey = models.ForeignKey(
        DataRoomDocument,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number: models.PositiveIntegerField = models.PositiveIntegerField(default=1)
    file_url: models.URLField = models.URLField(_("version file URL"))
    sha256_hash: models.CharField = models.CharField(max_length=64)
    file_size_bytes: models.PositiveIntegerField = models.PositiveIntegerField(null=True, blank=True)
    change_summary: models.TextField = models.TextField(blank=True)
    virus_scan_passed: models.BooleanField = models.BooleanField(default=True)
    uploaded_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["document", "version_number"]]
        ordering = ["-version_number"]


class DataRoomAccess(models.Model):
    """
    Per-investor access grant for a startup's data room.
    Controls which document categories and classification tiers are visible.
    """

    STATUS_CHOICES = [
        ("pending_nda", _("Pending NDA")),
        ("active", _("Active")),
        ("expired", _("Expired")),
        ("revoked", _("Revoked")),
    ]

    startup: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="dataroom_accesses",
    )
    pitch: models.ForeignKey = models.ForeignKey(
        Pitch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dataroom_accesses",
        help_text=_("Optional: restrict this access grant to a specific pitch"),
    )
    investor: models.ForeignKey = models.ForeignKey(
        InvestorProfile,
        on_delete=models.CASCADE,
        related_name="dataroom_accesses",
    )

    status: models.CharField = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending_nda", db_index=True
    )
    max_classification_tier: models.CharField = models.CharField(
        max_length=30,
        choices=DataClassificationTier.choices,
        default=DataClassificationTier.CONFIDENTIAL,
    )
    access_expires_at: models.DateTimeField = models.DateTimeField(
        _("access expires at"),
        null=True,
        blank=True,
    )

    can_view_pitch_deck: models.BooleanField = models.BooleanField(default=True)
    can_view_financials: models.BooleanField = models.BooleanField(default=False)
    can_view_legal: models.BooleanField = models.BooleanField(default=False)
    can_view_technical: models.BooleanField = models.BooleanField(default=False)
    can_view_market_research: models.BooleanField = models.BooleanField(default=True)
    can_view_team: models.BooleanField = models.BooleanField(default=True)
    can_view_product: models.BooleanField = models.BooleanField(default=True)

    nda_required: models.BooleanField = models.BooleanField(default=True)
    nda_signed_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)
    nda_signature_hash: models.CharField = models.CharField(max_length=64, blank=True)
    nda_version: models.CharField = models.CharField(max_length=20, blank=True)

    view_log: models.JSONField = models.JSONField(
        default=list,
        help_text=_('[{"category": "financials", "viewed_at": "...", "duration_seconds": 45}]'),
    )

    watermark_text: models.CharField = models.CharField(max_length=200, blank=True)
    ip_address: models.GenericIPAddressField = models.GenericIPAddressField(null=True, blank=True)
    user_agent: models.TextField = models.TextField(blank=True)

    granted_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("data room access")
        verbose_name_plural = _("data room accesses")
        unique_together = [["startup", "investor", "pitch"]]
        ordering = ["-granted_at"]

    def __str__(self) -> str:
        return f"Access: {self.investor} -> {self.startup} [{self.status}]"

    @property
    def is_active(self) -> bool:
        if self.status != "active":
            return False
        if self.access_expires_at and timezone.now() > self.access_expires_at:
            return False
        return True


class DataRoomAuditLog(models.Model):
    """Detailed access, view, and download audit telemetry."""

    ACTION_CHOICES = [
        ("VIEW", _("View")),
        ("DOWNLOAD", _("Download")),
        ("PRINT", _("Print")),
        ("EXPORT", _("Export")),
    ]

    document: models.ForeignKey = models.ForeignKey(
        DataRoomDocument, on_delete=models.CASCADE, related_name="audit_logs"
    )
    user: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    action: models.CharField = models.CharField(max_length=20, choices=ACTION_CHOICES, default="VIEW")
    ip_address: models.GenericIPAddressField = models.GenericIPAddressField(null=True, blank=True)
    user_agent: models.TextField = models.TextField(blank=True)
    timestamp: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]


class SlideEngagementLog(models.Model):
    """Per-slide engagement telemetry tracking viewer time and drop-off."""

    document = models.ForeignKey(DataRoomDocument, on_delete=models.CASCADE, related_name="slide_telemetry")
    viewer_email = models.CharField(max_length=255, default="anonymous@investor.com")
    slide_number = models.IntegerField(default=1)
    slide_title = models.CharField(max_length=150, blank=True, default="Slide")
    duration_seconds = models.FloatField(default=0.0)
    completed_deck = models.BooleanField(default=False)
    session_id = models.CharField(max_length=64, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("slide engagement log")
        verbose_name_plural = _("slide engagement logs")
        ordering = ["-timestamp"]

    def __str__(self) -> str:
        return f"{self.viewer_email} - Slide {self.slide_number} ({self.duration_seconds}s)"

