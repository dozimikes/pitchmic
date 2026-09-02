from __future__ import annotations

from django.contrib import admin

from .models import Activity


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "id",
        "actor",
        "verb",
        "target",
        "action_object",
        "created_at",
    )
    list_filter: tuple[str, ...] = (
        "verb",
        "created_at",
        "target_content_type",
        "action_object_content_type",
    )
    search_fields: tuple[str, ...] = (
        "actor__email",
        "actor__first_name",
        "actor__last_name",
        "verb",
        "metadata",
    )
    readonly_fields: tuple[str, ...] = ("created_at",)
    raw_id_fields: tuple[str, ...] = ("actor",)
    date_hierarchy: str = "created_at"
    list_select_related: tuple[str, ...] = (
        "actor",
        "target_content_type",
        "action_object_content_type",
    )
