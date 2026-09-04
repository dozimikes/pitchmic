from django.contrib import admin

from apps.intelligence_engine.models_core import (
    SourceRegistry,
    SourceDocument,
    SourceSnapshot,
    RawFact,
    FactEvidence,
    FactVersion,
    ChangeEvent,
    ConflictRecord,
)
from apps.intelligence_engine.models_entities import (
    Organization,
    Person,
    FundingRound,
    Investment,
    InvestorThesis,
    ObservedInvestment,
)
from apps.intelligence_engine.models_opportunities import (
    OpportunityLifecycle,
    OpportunityRequirement,
    DeadlineEvidence,
    FundingPath,
    FundingPathStep,
    ReadinessBlocker,
)


@admin.register(SourceRegistry)
class SourceRegistryAdmin(admin.ModelAdmin):
    list_display = ["name", "organization", "tier", "fetch_strategy", "is_active", "last_crawled_at"]
    list_filter = ["tier", "fetch_strategy", "is_active"]
    search_fields = ["name", "organization", "base_url"]


@admin.register(SourceDocument)
class SourceDocumentAdmin(admin.ModelAdmin):
    list_display = ["source", "document_type", "content_hash", "retrieved_at", "http_status"]
    list_filter = ["document_type", "http_status"]
    search_fields = ["source__name", "url"]


@admin.register(SourceSnapshot)
class SourceSnapshotAdmin(admin.ModelAdmin):
    list_display = ["source", "snapshot_at", "content_hash", "content_changed", "http_status"]
    list_filter = ["content_changed", "http_status"]


@admin.register(RawFact)
class RawFactAdmin(admin.ModelAdmin):
    list_display = ["fact_type", "subject_entity", "value_display", "confidence", "verification_status", "extracted_at"]
    list_filter = ["fact_type", "verification_status", "source_tier"]
    search_fields = ["subject_entity", "raw_value"]


@admin.register(FactEvidence)
class FactEvidenceAdmin(admin.ModelAdmin):
    list_display = ["fact", "source_url", "extraction_method", "confidence", "retrieved_at"]


@admin.register(ChangeEvent)
class ChangeEventAdmin(admin.ModelAdmin):
    list_display = ["entity_type", "entity_id", "field_name", "old_value_display", "new_value_display", "detected_at"]
    list_filter = ["entity_type", "field_name"]


@admin.register(ConflictRecord)
class ConflictRecordAdmin(admin.ModelAdmin):
    list_display = ["field_name", "subject_entity", "resolution_status", "recommended_value", "detected_at"]
    list_filter = ["resolution_status", "field_name"]


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "org_type", "country", "founded_year", "verified"]
    list_filter = ["org_type", "verified", "country"]
    search_fields = ["name", "slug"]


@admin.register(FundingRound)
class FundingRoundAdmin(admin.ModelAdmin):
    list_display = ["startup", "round_type", "amount_usd", "announced_date", "lead_investor", "confidence"]
    list_filter = ["round_type", "confidence"]
    search_fields = ["startup__name"]


@admin.register(OpportunityLifecycle)
class OpportunityLifecycleAdmin(admin.ModelAdmin):
    list_display = ["title", "organization", "lifecycle_status", "freshness_score", "last_verified_at"]
    list_filter = ["lifecycle_status", "organization"]
    search_fields = ["title", "slug"]


@admin.register(ReadinessBlocker)
class ReadinessBlockerAdmin(admin.ModelAdmin):
    list_display = ["opportunity", "requirement_type", "is_blocking", "weight"]
    list_filter = ["requirement_type", "is_blocking"]
