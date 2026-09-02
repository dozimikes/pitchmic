from __future__ import annotations

from django.contrib import admin

from .models import Pitch, PitchAttachment, PitchLike


class PitchAttachmentInline(admin.TabularInline):
    model = PitchAttachment
    extra = 0
    fields: tuple[str, ...] = ("file_name", "file_url", "file_type", "file_size")


@admin.register(Pitch)
class PitchAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "title",
        "startup",
        "asking_amount",
        "equity_offered",
        "is_draft",
        "pitched_at",
        "like_count_display",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("is_draft", "pitched_at", "created_at")
    search_fields: tuple[str, ...] = (
        "title",
        "description",
        "startup__company_name",
        "startup__user__email",
    )
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
    autocomplete_fields: tuple[str, ...] = ("startup",)
    inlines: tuple = (PitchAttachmentInline,)
    date_hierarchy: str = "created_at"

    @admin.display(description="Likes")
    def like_count_display(self, obj: Pitch) -> int:
        return obj.like_count


@admin.register(PitchAttachment)
class PitchAttachmentAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "file_name",
        "pitch",
        "file_type",
        "file_size",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("file_type", "created_at")
    search_fields: tuple[str, ...] = ("file_name", "pitch__title")
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
    autocomplete_fields: tuple[str, ...] = ("pitch",)


@admin.register(PitchLike)
class PitchLikeAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "pitch",
        "user",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("created_at",)
    search_fields: tuple[str, ...] = (
        "pitch__title",
        "user__email",
        "user__first_name",
        "user__last_name",
    )
    readonly_fields: tuple[str, ...] = ("created_at",)
    autocomplete_fields: tuple[str, ...] = ("pitch", "user")
    date_hierarchy: str = "created_at"
