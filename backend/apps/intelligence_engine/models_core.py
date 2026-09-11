"""
apps.intelligence_engine.models_core
=====================================
Core provenance, evidence, and change-detection models.

Design principle: every fact stored in Pitchmic is traceable to a specific
URL, page snapshot, text snippet, extraction method, and timestamp.
Nothing is stored as a bare value - every value carries its evidence chain.

Model hierarchy:
  SourceRegistry          - What to watch and how (replaces hard-coded configs)
      └── SourceSnapshot  - Immutable HTTP response stored each crawl cycle
          └── SourceDocument - Parsed, cleaned document derived from a snapshot
              └── RawFact    - A single extracted claim with full provenance
                  └── FactEvidence  - The exact text / coordinates that produced it
                      └── FactVersion   - Temporal history when the fact changes
  ChangeEvent             - Diff log whenever any stored value changes
  ConflictRecord          - Multi-source disagreement requiring resolution
"""
from __future__ import annotations

import uuid
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


# ---------------------------------------------------------------------------
# SourceRegistry  (replaces _get_default_sources_config hard-coded list)
# ---------------------------------------------------------------------------

class SourceRegistry(models.Model):
    """
    Registry of every monitored source.  Configures WHERE to look and HOW -
    never WHAT the answer is.  The actual data comes from fetching.
    """

    class Tier(models.TextChoices):
        TIER_1_OFFICIAL    = "T1", _("Tier 1 - Official Source (0.95–0.99)")
        TIER_2_STRUCTURED  = "T2", _("Tier 2 - Structured API / Database (0.80–0.94)")
        TIER_3_SECONDARY   = "T3", _("Tier 3 - Secondary / News Source (0.55–0.79)")
        TIER_4_SOCIAL      = "T4", _("Tier 4 - Social Signal (0.20–0.54)")

    class FetchStrategy(models.TextChoices):
        API      = "api",      _("Direct API")
        RSS      = "rss",      _("RSS / Atom Feed")
        SITEMAP  = "sitemap",  _("Sitemap + Selective Crawl")
        STATIC   = "static",   _("Static HTML")
        BROWSER  = "browser",  _("Headless Browser (JS-heavy)")
        PDF      = "pdf",      _("PDF / Document")
        EMAIL    = "email",    _("Email Digest")
        MANUAL   = "manual",   _("User Submitted")

    class CrawlFrequency(models.TextChoices):
        REALTIME = "realtime", _("Real-time / Webhook")
        HOURLY   = "1h",       _("Every Hour")
        SIX_HOUR = "6h",       _("Every 6 Hours")
        DAILY    = "24h",      _("Daily")
        WEEKLY   = "7d",       _("Weekly")
        DORMANT  = "dormant",  _("Dormant - manual only")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name            = models.CharField(max_length=255)
    organization    = models.CharField(max_length=255, db_index=True)
    slug            = models.SlugField(max_length=255, unique=True)

    # Hierarchy / trust
    tier            = models.CharField(max_length=4,  choices=Tier.choices,          default=Tier.TIER_1_OFFICIAL)
    fetch_strategy  = models.CharField(max_length=16, choices=FetchStrategy.choices, default=FetchStrategy.STATIC)
    crawl_frequency = models.CharField(max_length=16, choices=CrawlFrequency.choices, default=CrawlFrequency.SIX_HOUR)
    base_trust_score = models.FloatField(default=0.95, help_text=_("0.0–1.0 baseline confidence for this source"))

    # URLs
    base_url        = models.URLField(max_length=512)
    application_url = models.URLField(max_length=512, blank=True)
    api_endpoint    = models.URLField(max_length=512, blank=True, help_text=_("For API strategy sources"))
    rss_url         = models.URLField(max_length=512, blank=True)
    sitemap_url     = models.URLField(max_length=512, blank=True)

    # API credentials (referenced by key name, never stored as plaintext)
    api_key_env_var = models.CharField(max_length=128, blank=True,
                                       help_text=_("Environment variable name holding the API key, e.g. CRUNCHBASE_API_KEY"))
    api_auth_header = models.CharField(max_length=64, blank=True, default="X-Api-Key")

    # Selector hints for HTML parsing (CSS or XPath)
    content_selector      = models.CharField(max_length=512, blank=True,
                                              help_text=_("CSS selector for main content area"))
    deadline_selector     = models.CharField(max_length=512, blank=True)
    status_selector       = models.CharField(max_length=512, blank=True)
    pagination_selector   = models.CharField(max_length=512, blank=True,
                                              help_text=_("CSS selector for next-page link"))

    # Operational state
    is_active           = models.BooleanField(default=True, db_index=True)
    last_crawled_at     = models.DateTimeField(null=True, blank=True)
    last_success_at     = models.DateTimeField(null=True, blank=True)
    last_error_at       = models.DateTimeField(null=True, blank=True)
    last_error_message  = models.TextField(blank=True)
    consecutive_errors  = models.PositiveIntegerField(default=0)
    last_page_hash      = models.CharField(max_length=64, blank=True)

    # Metadata
    notes       = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["tier", "name"]
        verbose_name = "Source Registry"
        verbose_name_plural = "Source Registry"
        indexes = [
            models.Index(fields=["organization"]),
            models.Index(fields=["tier", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"[{self.tier}] {self.name}"

    def record_success(self, page_hash: str = "") -> None:
        now = timezone.now()
        self.last_crawled_at = now
        self.last_success_at = now
        self.consecutive_errors = 0
        if page_hash:
            self.last_page_hash = page_hash
        self.save(update_fields=["last_crawled_at", "last_success_at", "consecutive_errors", "last_page_hash"])

    def record_error(self, error_message: str) -> None:
        now = timezone.now()
        self.last_crawled_at = now
        self.last_error_at = now
        self.last_error_message = error_message[:2000]
        self.consecutive_errors += 1
        # Auto-suspend after 10 consecutive failures
        if self.consecutive_errors >= 10:
            self.is_active = False
        self.save(update_fields=[
            "last_crawled_at", "last_error_at", "last_error_message",
            "consecutive_errors", "is_active",
        ])

    @property
    def is_overdue(self) -> bool:
        """Returns True when the source is past its scheduled crawl window."""
        if not self.last_crawled_at or self.crawl_frequency == self.CrawlFrequency.DORMANT:
            return True
        freq_hours = {
            "realtime": 0, "1h": 1, "6h": 6, "24h": 24, "7d": 168,
        }
        hours = freq_hours.get(self.crawl_frequency, 6)
        if hours == 0:
            return False
        from datetime import timedelta
        return timezone.now() > self.last_crawled_at + timedelta(hours=hours)


# ---------------------------------------------------------------------------
# SourceSnapshot - immutable HTTP response record
# ---------------------------------------------------------------------------

class SourceSnapshot(models.Model):
    """
    Immutable record of a single HTTP fetch.  Never modified after creation.
    Every subsequent crawl creates a new snapshot.
    This gives a complete temporal history of every source page.
    """

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source          = models.ForeignKey(SourceRegistry, on_delete=models.CASCADE,
                                        related_name="snapshots")
    url             = models.URLField(max_length=512)
    http_status     = models.PositiveSmallIntegerField(default=0)
    content_hash    = models.CharField(max_length=64, db_index=True)
    content_changed = models.BooleanField(default=True,
                                          help_text=_("True when hash differs from previous snapshot"))
    raw_html        = models.TextField(blank=True,
                                       help_text=_("Full page HTML at time of fetch"))
    text_content    = models.TextField(blank=True,
                                       help_text=_("Cleaned plain text extracted from HTML"))
    response_headers = models.JSONField(default=dict, blank=True)
    fetch_duration_ms = models.PositiveIntegerField(default=0)
    fetch_method    = models.CharField(max_length=32, default="requests",
                                       help_text=_("requests | httpx | urllib | rss | api | browser | failed"))
    fetch_error     = models.TextField(blank=True)
    snapshot_at     = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-snapshot_at"]
        indexes = [
            models.Index(fields=["source", "-snapshot_at"]),
            models.Index(fields=["content_hash"]),
        ]

    def __str__(self) -> str:
        return f"{self.source.name} @ {self.snapshot_at:%Y-%m-%d %H:%M} [{self.http_status}]"

    @property
    def ok(self) -> bool:
        return self.http_status == 200

    @property
    def previous_snapshot(self) -> "SourceSnapshot | None":
        return (
            SourceSnapshot.objects
            .filter(source=self.source, snapshot_at__lt=self.snapshot_at)
            .order_by("-snapshot_at")
            .first()
        )


# ---------------------------------------------------------------------------
# SourceDocument - parsed, normalized document derived from a snapshot
# ---------------------------------------------------------------------------

class SourceDocument(models.Model):
    """
    Parsed document derived from a SourceSnapshot.
    One snapshot may produce multiple documents (e.g. sitemap index → multiple pages).
    """

    class DocumentType(models.TextChoices):
        HTML_PAGE    = "html",    _("HTML Page")
        RSS_FEED     = "rss",     _("RSS / Atom Feed")
        JSON_API     = "json",    _("JSON API Response")
        PDF          = "pdf",     _("PDF Document")
        SITEMAP      = "sitemap", _("Sitemap XML")
        EMAIL        = "email",   _("Email")
        USER_UPLOAD  = "upload",  _("User Uploaded")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    snapshot        = models.ForeignKey(SourceSnapshot, on_delete=models.CASCADE,
                                        related_name="documents", null=True, blank=True)
    source          = models.ForeignKey(SourceRegistry, on_delete=models.CASCADE,
                                        related_name="documents")
    document_type   = models.CharField(max_length=16, choices=DocumentType.choices,
                                       default=DocumentType.HTML_PAGE)
    url             = models.URLField(max_length=512)
    title           = models.CharField(max_length=512, blank=True)
    clean_text      = models.TextField(blank=True, help_text=_("trafilatura / BS4 extracted text"))
    structured_data = models.JSONField(default=dict, blank=True,
                                       help_text=_("JSON-LD, OG tags, RSS items, API payload"))
    content_hash    = models.CharField(max_length=64, db_index=True)
    http_status     = models.PositiveSmallIntegerField(default=200)
    char_count      = models.PositiveIntegerField(default=0)
    language        = models.CharField(max_length=8, default="en")
    retrieved_at    = models.DateTimeField(default=timezone.now)
    parse_warnings  = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-retrieved_at"]
        indexes = [
            models.Index(fields=["source", "document_type"]),
            models.Index(fields=["content_hash"]),
        ]

    def __str__(self) -> str:
        return f"{self.document_type.upper()} | {self.source.name} | {self.retrieved_at:%Y-%m-%d}"


# ---------------------------------------------------------------------------
# RawFact - a single extracted claim with full provenance
# ---------------------------------------------------------------------------

class RawFact(models.Model):
    """
    A single atomic fact extracted from a SourceDocument.

    Represents things like:
      - "application_deadline = 2026-10-31"   for Antler Nigeria
      - "funding_amount_usd = 100000"          for Techstars
      - "status = OPEN"                        for YC W2026
      - "equity_percentage = 7%"               for YC W2026

    Every fact is independent.  Multiple facts can relate to the same
    opportunity/entity.  Conflicts between sources are captured in ConflictRecord.
    """

    class FactType(models.TextChoices):
        APPLICATION_STATUS   = "status",        _("Application Status")
        APPLICATION_DEADLINE = "deadline",      _("Application Deadline")
        COHORT_START_DATE    = "cohort_start",  _("Cohort / Program Start Date")
        FUNDING_AMOUNT_MIN   = "fund_min",      _("Funding Amount Minimum")
        FUNDING_AMOUNT_MAX   = "fund_max",      _("Funding Amount Maximum")
        EQUITY_TERMS         = "equity",        _("Equity / Dilution Terms")
        GEOGRAPHY            = "geography",     _("Target Geography")
        SECTOR               = "sector",        _("Target Sector")
        STAGE                = "stage",         _("Target Stage")
        DESCRIPTION          = "description",   _("Program Description")
        KEY_BENEFIT          = "benefit",       _("Key Benefit")
        ELIGIBILITY          = "eligibility",   _("Eligibility Criterion")
        EVIDENCE_REQUIREMENT = "evidence_req",  _("Evidence Requirement")
        COHORT_YEAR          = "cohort_year",   _("Cohort Year Reference")
        ORGANIZATION_NAME    = "org_name",      _("Organisation Name")
        FUNDING_ROUND        = "round",         _("Funding Round")
        INVESTMENT_AMOUNT    = "investment",    _("Investment Amount")
        INVESTOR_NAME        = "investor",      _("Investor Name")
        VALUATION            = "valuation",     _("Valuation")
        GENERAL              = "general",       _("General Fact")

    class VerificationStatus(models.TextChoices):
        EXTRACTED   = "extracted",   _("Extracted - not yet validated")
        VERIFIED    = "verified",    _("Verified - corroborated")
        CONTRADICTED = "contradicted", _("Contradicted - conflict detected")
        STALE       = "stale",       _("Stale - superseded by newer fact")
        REJECTED    = "rejected",    _("Rejected - failed validation")

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document            = models.ForeignKey(SourceDocument, on_delete=models.CASCADE,
                                            related_name="raw_facts")
    source              = models.ForeignKey(SourceRegistry, on_delete=models.CASCADE,
                                            related_name="raw_facts")

    # What the fact is about
    fact_type           = models.CharField(max_length=32, choices=FactType.choices, db_index=True)
    subject_entity      = models.CharField(max_length=255, db_index=True,
                                            help_text=_("e.g. 'antler-nigeria-cohort-2026'"))
    subject_entity_type = models.CharField(max_length=64, default="opportunity",
                                            help_text=_("opportunity | organization | investor | funding_round"))

    # The actual value
    raw_value           = models.TextField(help_text=_("Raw string as extracted"))
    normalized_value    = models.JSONField(null=True, blank=True,
                                           help_text=_("Typed, normalized Python value"))
    unit                = models.CharField(max_length=32, blank=True,
                                           help_text=_("USD, %, date, etc."))

    # Provenance
    source_tier         = models.CharField(max_length=4, default="T1")
    confidence          = models.FloatField(default=0.70, db_index=True)
    extraction_method   = models.CharField(max_length=64, default="regex_context",
                                            help_text=_("json_ld | og_meta | rss | regex_context | regex_plain | ai_llm | heuristic"))
    verification_status = models.CharField(max_length=16,
                                           choices=VerificationStatus.choices,
                                           default=VerificationStatus.EXTRACTED,
                                           db_index=True)

    extracted_at        = models.DateTimeField(default=timezone.now, db_index=True)
    verified_at         = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-extracted_at"]
        indexes = [
            models.Index(fields=["subject_entity", "fact_type"]),
            models.Index(fields=["fact_type", "verification_status"]),
            models.Index(fields=["source", "fact_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.fact_type}={self.raw_value[:60]} [{self.verification_status}] conf={self.confidence:.2f}"

    @property
    def value_display(self) -> str:
        return str(self.normalized_value or self.raw_value)[:80]


# ---------------------------------------------------------------------------
# FactEvidence - the exact text / coordinates that produced a RawFact
# ---------------------------------------------------------------------------

class FactEvidence(models.Model):
    """
    Immutable evidence record for a RawFact.
    Stores the exact page text that produced the fact, its location in the
    document, and what method extracted it.

    This is the "show your work" layer - every fact must be traceable to
    a specific passage in a specific document from a specific URL.
    """

    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fact              = models.ForeignKey(RawFact, on_delete=models.CASCADE,
                                          related_name="evidence_records")
    source_url        = models.URLField(max_length=512)
    evidence_snippet  = models.TextField(help_text=_("Exact text passage from source page"))
    context_window    = models.TextField(blank=True,
                                         help_text=_("Surrounding 200 chars before/after the snippet"))
    locator           = models.CharField(max_length=255, blank=True,
                                         help_text=_("CSS selector, slide #, XPath, JSON key path"))
    extraction_method = models.CharField(max_length=64)
    confidence        = models.FloatField()
    retrieved_at      = models.DateTimeField()
    content_hash      = models.CharField(max_length=64, blank=True,
                                         help_text=_("Hash of the page this evidence came from"))

    class Meta:
        ordering = ["-retrieved_at"]

    def __str__(self) -> str:
        return f"Evidence for {self.fact.fact_type} from {self.source_url[:60]}"


# ---------------------------------------------------------------------------
# FactVersion - temporal history of a fact as it changes over time
# ---------------------------------------------------------------------------

class FactVersion(models.Model):
    """
    Whenever a RawFact's value changes (e.g. deadline extended, funding
    increased), the previous value is archived here before the fact is updated.
    This gives a complete audit trail of every factual change.
    """

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fact            = models.ForeignKey(RawFact, on_delete=models.CASCADE,
                                        related_name="versions")
    version_number  = models.PositiveIntegerField(default=1)
    raw_value       = models.TextField()
    normalized_value = models.JSONField(null=True, blank=True)
    confidence      = models.FloatField()
    verification_status = models.CharField(max_length=16)
    evidence_snippet = models.TextField(blank=True)
    source_url      = models.URLField(max_length=512, blank=True)
    archived_at     = models.DateTimeField(default=timezone.now)
    reason          = models.CharField(max_length=255, blank=True,
                                       help_text=_("Why this version was archived, e.g. 'deadline_changed'"))

    class Meta:
        ordering = ["-version_number"]

    def __str__(self) -> str:
        return f"{self.fact.fact_type} v{self.version_number} = {self.raw_value[:60]}"


# ---------------------------------------------------------------------------
# ChangeEvent - diff log for any stored value change
# ---------------------------------------------------------------------------

class ChangeEvent(models.Model):
    """
    Immutable log entry whenever any monitored value changes.
    Entity-agnostic: covers opportunities, investors, organizations, etc.
    Feeds the alert/notification system.
    """

    class Severity(models.TextChoices):
        CRITICAL = "critical", _("Critical - deadline or status change")
        HIGH     = "high",     _("High - funding amount change")
        MEDIUM   = "medium",   _("Medium - description or criteria change")
        LOW      = "low",      _("Low - minor metadata change")

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity_type     = models.CharField(max_length=64, db_index=True,
                                       help_text=_("opportunity | organization | investor | funding_round"))
    entity_id       = models.CharField(max_length=64, db_index=True)
    entity_name     = models.CharField(max_length=255, blank=True)
    field_name      = models.CharField(max_length=128, db_index=True)
    old_value       = models.JSONField(null=True, blank=True)
    new_value       = models.JSONField(null=True, blank=True)
    old_source_url  = models.URLField(max_length=512, blank=True)
    new_source_url  = models.URLField(max_length=512, blank=True)
    severity        = models.CharField(max_length=16, choices=Severity.choices,
                                       default=Severity.MEDIUM)
    detected_at     = models.DateTimeField(default=timezone.now, db_index=True)
    snapshot        = models.ForeignKey(SourceSnapshot, on_delete=models.SET_NULL,
                                        null=True, blank=True, related_name="change_events")

    class Meta:
        ordering = ["-detected_at"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"]),
            models.Index(fields=["field_name", "-detected_at"]),
        ]

    def __str__(self) -> str:
        return f"CHANGE {self.entity_type}/{self.entity_id}.{self.field_name} @ {self.detected_at:%Y-%m-%d}"

    @property
    def old_value_display(self) -> str:
        return str(self.old_value)[:80] if self.old_value else "-"

    @property
    def new_value_display(self) -> str:
        return str(self.new_value)[:80] if self.new_value else "-"


# ---------------------------------------------------------------------------
# ConflictRecord - multi-source disagreement
# ---------------------------------------------------------------------------

class ConflictRecord(models.Model):
    """
    Raised whenever two or more sources disagree on a fact.

    Example:
      Official page:  deadline = 2026-10-30
      LinkedIn post:  deadline = 2026-10-15
      News article:   deadline = 2026-10-20

    Pitchmic records all three, flags the conflict, computes the recommended
    canonical value (highest-trust source wins by default), and exposes the
    conflict to the UI.
    """

    class ResolutionStatus(models.TextChoices):
        OPEN        = "open",        _("Open - unresolved")
        AUTO        = "auto",        _("Auto-resolved by trust hierarchy")
        MANUAL      = "manual",      _("Manually resolved")
        DISMISSED   = "dismissed",   _("Dismissed - conflict considered irrelevant")

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    field_name          = models.CharField(max_length=128, db_index=True)
    subject_entity      = models.CharField(max_length=255, db_index=True)
    subject_entity_type = models.CharField(max_length=64, default="opportunity")

    # All conflicting facts stored as a list of dicts:
    # [{source_url, source_tier, value, confidence, retrieved_at}, ...]
    conflicting_facts   = models.JSONField(default=list)

    recommended_value   = models.JSONField(null=True, blank=True)
    recommendation_reason = models.TextField(blank=True)
    resolution_status   = models.CharField(max_length=16,
                                           choices=ResolutionStatus.choices,
                                           default=ResolutionStatus.OPEN,
                                           db_index=True)
    resolved_value      = models.JSONField(null=True, blank=True)
    resolved_by         = models.CharField(max_length=64, blank=True,
                                           help_text=_("auto | username"))

    detected_at         = models.DateTimeField(default=timezone.now, db_index=True)
    resolved_at         = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-detected_at"]
        indexes = [
            models.Index(fields=["subject_entity", "field_name"]),
            models.Index(fields=["resolution_status"]),
        ]

    def __str__(self) -> str:
        return f"CONFLICT {self.field_name} for {self.subject_entity} [{self.resolution_status}]"

    def auto_resolve(self) -> None:
        """Resolve by picking the highest-tier (lowest tier number), highest-confidence fact."""
        if not self.conflicting_facts:
            return
        tier_order = {"T1": 0, "T2": 1, "T3": 2, "T4": 3}
        best = sorted(
            self.conflicting_facts,
            key=lambda f: (tier_order.get(f.get("source_tier", "T4"), 9), -f.get("confidence", 0)),
        )[0]
        self.recommended_value = best.get("value")
        self.recommendation_reason = (
            f"Highest-trust source: {best.get('source_url', 'unknown')} "
            f"(tier={best.get('source_tier')}, conf={best.get('confidence', 0):.2f})"
        )
        self.resolution_status = self.ResolutionStatus.AUTO
        self.resolved_value = self.recommended_value
        self.resolved_by = "auto"
        self.resolved_at = timezone.now()
        self.save(update_fields=[
            "recommended_value", "recommendation_reason", "resolution_status",
            "resolved_value", "resolved_by", "resolved_at",
        ])
