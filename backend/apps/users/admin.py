from __future__ import annotations

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import InvestorProfile, StartupProfile, TeamMember, User


class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 0
    fields: tuple[str, ...] = ("name", "role", "bio", "linkedin", "avatar_url", "order")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display: tuple[str, ...] = (
        "email",
        "first_name",
        "last_name",
        "role",
        "is_verified",
        "is_staff",
        "is_active",
        "created_at",
    )
    list_filter: tuple[str, ...] = (
        "role",
        "is_verified",
        "is_staff",
        "is_active",
        "created_at",
    )
    search_fields: tuple[str, ...] = ("email", "first_name", "last_name")
    ordering: tuple[str, ...] = ("-created_at",)
    fieldsets: tuple = (
        (None, {"fields": ("email", "password")}),
        (
            "Personal info",
            {
                "fields": (
                    "first_name",
                    "last_name",
                    "role",
                )
            },
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_verified",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        (
            "Important dates",
            {
                "fields": (
                    "last_login",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )
    add_fieldsets: tuple = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "password1",
                    "password2",
                    "first_name",
                    "last_name",
                    "role",
                    "is_staff",
                    "is_active",
                ),
            },
        ),
    )
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at", "last_login")


@admin.register(StartupProfile)
class StartupProfileAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "company_name",
        "user",
        "industry",
        "location",
        "founded_year",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("industry", "created_at")
    search_fields: tuple[str, ...] = ("company_name", "user__email", "tagline", "description")
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
    inlines: tuple = (TeamMemberInline,)


@admin.register(InvestorProfile)
class InvestorProfileAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "full_name",
        "user",
        "company_name",
        "title",
        "location",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("created_at",)
    search_fields: tuple[str, ...] = (
        "full_name",
        "user__email",
        "company_name",
        "title",
        "bio",
    )
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "name",
        "startup_profile",
        "role",
        "order",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("created_at",)
    search_fields: tuple[str, ...] = ("name", "role", "bio")
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
