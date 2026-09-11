from __future__ import annotations

import csv
from datetime import timedelta

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group, Permission
from django.db.models import Count, Q
from django.http import HttpResponse, HttpRequest
from django.utils import timezone
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from .models import InvestorProfile, StartupProfile, TeamMember, User


# ---------------------------------------------------------------------------
# Inline: Team Members inside Startup Profile
# ---------------------------------------------------------------------------
class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 0
    fields: tuple[str, ...] = ("name", "role", "bio", "linkedin", "avatar_url", "order")
    verbose_name = "Team Member"
    verbose_name_plural = "Team Members"
    show_change_link = True


# ---------------------------------------------------------------------------
# Custom admin filter: Last Login / Dormancy buckets
# ---------------------------------------------------------------------------
class LastLoginDormancyFilter(admin.SimpleListFilter):
    """Segment users by recency of last_login. Guards against the
    most-common triage ask: 'who has never logged in? / who is dormant?'."""

    title = _("Last activity (login)")
    parameter_name = "last_login"

    def lookups(self, request: HttpRequest, model_admin: admin.ModelAdmin) -> list[tuple[str, str]]:
        return [
            ("never", _("Never signed in")),
            ("30d", _("Active in last 30 days")),
            ("30-90d", _("Active 30-90 days ago")),
            ("90dplus", _("Dormant (> 90 days)")),
        ]

    def queryset(self, request: HttpRequest, queryset):
        now = timezone.now()
        val = self.value()
        if val == "never":
            return queryset.filter(last_login__isnull=True)
        if val == "30d":
            return queryset.filter(last_login__gte=now - timedelta(days=30))
        if val == "30-90d":
            return queryset.filter(
                last_login__gte=now - timedelta(days=90),
                last_login__lt=now - timedelta(days=30),
            )
        if val == "90dplus":
            return queryset.filter(
                Q(last_login__isnull=True) | Q(last_login__lt=now - timedelta(days=90))
            )
        return queryset


# ---------------------------------------------------------------------------
# User Admin
# ---------------------------------------------------------------------------
@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # ----- List view -----
    list_display: tuple[str, ...] = (
        "user_identity",
        "plan_status_badge",
        "verification_status",
        "account_status",
        "staff_status",
        "last_login_display",
        "created_at_display",
    )
    list_filter: tuple[str, ...] = (
        "role",
        "is_verified",
        "is_staff",
        "is_active",
        "subscription_plan",
        "subscription_status",
        LastLoginDormancyFilter,
    )
    search_fields: tuple[str, ...] = ("email", "first_name", "last_name")
    ordering: tuple[str, ...] = ("-created_at",)
    date_hierarchy = "created_at"
    list_per_page = 15
    list_select_related = True
    actions: tuple[str, ...] = (
        "bulk_mark_verified",
        "bulk_unverify",
        "bulk_activate",
        "bulk_deactivate",
        "bulk_toggle_staff",
        "export_users_csv",
    )
    actions_on_top = True
    actions_on_bottom = True
    filter_horizontal: tuple[str, ...] = ("groups", "user_permissions")

    # ----- Detail / Add forms -----
    fieldsets: tuple = (
        (None, {"fields": ("email", "password")}),
        (
            "Personal info",
            {
                "fields": (
                    "first_name",
                    "last_name",
                    "role",
                    "avatar_url",
                )
            },
        ),
        (
            "Subscription",
            {
                "fields": (
                    "subscription_plan",
                    "subscription_status",
                    "subscription_started_at",
                    "subscription_expires_at",
                    "paystack_customer_code",
                    "paystack_email",
                ),
                "classes": ("collapse",),
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
                ),
                "classes": ("collapse",),
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

    # ── List column: consolidated identity (avatar + name + email + role) ──
    @admin.display(description=_("User"), ordering="email")
    def user_identity(self, obj: User) -> str:
        initial = "U"
        if obj.first_name:
            initial = obj.first_name[:1].upper()
        elif obj.email:
            initial = obj.email[:1].upper()

        role_class, role_label = {
            "startup": ("pm-badge pm-badge--role-startup", _("Founder")),
            "investor": ("pm-badge pm-badge--role-investor", _("Investor")),
            "accelerator": ("pm-badge pm-badge--role-accelerator", _("Accelerator")),
        }.get(
            obj.role or "",
            ("pm-badge pm-badge--muted", obj.role or _("Unassigned")),
        )

        name = f"{obj.first_name} {obj.last_name}".strip()
        display_name = format_html(
            '<span class="pm-identity-name">{}</span>',
            name if name else _("(No name set)"),
        )
        display_email = format_html(
            '<span class="pm-identity-email" aria-label="{}">{}</span>',
            _("Email: {email}").format(email=obj.email),
            obj.email,
        )
        return format_html(
            (
                '<div class="pm-identity-cell">'
                '<div class="pm-avatar" aria-hidden="true" title="{}">{}</div>'
                '<div class="pm-identity-body">'
                '<div class="pm-identity-row">{}{}</div>'
                '{}</div></div>'
            ),
            _("User avatar"),
            initial,
            display_name,
            format_html(
                '<span class="{}" role="status" aria-label="{}">{}</span>',
                role_class,
                _("Role: {role}").format(role=role_label),
                role_label,
            ),
            display_email,
        )

    # ── List column: subscription plan + status ───────────────────────
    @admin.display(description=_("Plan"), ordering="subscription_plan")
    def plan_status_badge(self, obj: User) -> str:
        plan = obj.subscription_plan
        status = obj.subscription_status

        if plan:
            plan_class, plan_label = {
                "free": ("pm-badge pm-badge--plan-free", _("Free")),
                "founder-pro": ("pm-badge pm-badge--plan-pro", _("Pro")),
                "raise-pass": ("pm-badge pm-badge--plan-raise", _("Raise Pass")),
            }.get(
                plan,
                ("pm-badge pm-badge--muted", plan),
            )
            plan_html = format_html(
                '<span class="{}" aria-label="{}">{}</span>',
                plan_class,
                _("Plan: {plan}").format(plan=plan_label),
                plan_label,
            )
        else:
            plan_html = format_html(
                '<span class="pm-badge pm-badge--empty" aria-label="{}">{}</span>',
                _("No plan assigned"),
                _("No plan"),
            )

        # Status pill (slim) if not healthy/active
        if status and status not in ("active", "none", ""):
            status_class = {
                "canceled": "pm-sublabel pm-sublabel--warn",
                "past_due": "pm-sublabel pm-sublabel--danger",
                "incomplete": "pm-sublabel pm-sublabel--muted",
                "trialing": "pm-sublabel pm-sublabel--info",
            }.get(status, "pm-sublabel pm-sublabel--muted")
            status_label = status.replace("_", " ").title()
            status_html = format_html(
                '<span class="{}" aria-label="{}">· {}</span>',
                status_class,
                _("Subscription status: {status}").format(status=status_label),
                status_label,
            )
        else:
            status_html = ""

        return format_html(
            '<div class="pm-stack">{}{}</div>', plan_html, status_html
        )

    # ── List column: email verification (text + icon, no glyph only) ──
    @admin.display(description=_("Verified"), ordering="is_verified")
    def verification_status(self, obj: User) -> str:
        if obj.is_verified:
            return format_html(
                (
                    '<span class="pm-status pm-status--ok" role="status" '
                    'aria-label="{}" title="Email has been verified">'
                    '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" '
                    'stroke="currentColor" stroke-width="3" stroke-linecap="round" '
                    'stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
                    '<span>{}</span></span>'
                ),
                _("Verified: yes"),
                _("Verified"),
            )
        return format_html(
            (
                '<span class="pm-status pm-status--warn" role="status" '
                'aria-label="{}" title="Email not yet verified">'
                '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" '
                'stroke="currentColor" stroke-width="3" stroke-linecap="round" '
                'stroke-linejoin="round"><circle cx="12" cy="12" r="10"/>'
                '<line x1="12" y1="8" x2="12" y2="12"/>'
                '<line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
                '<span>{}</span></span>'
            ),
            _("Verified: no"),
            _("Unverified"),
        )

    # ── List column: account active / disabled ────────────────────────
    @admin.display(description=_("Account"), ordering="is_active")
    def account_status(self, obj: User) -> str:
        if obj.is_active:
            return format_html(
                (
                    '<span class="pm-status pm-status--ok" role="status" '
                    'aria-label="{}" title="Account is enabled">'
                    '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">'
                    '<circle cx="12" cy="12" r="8"/></svg>'
                    '<span>{}</span></span>'
                ),
                _("Account: active"),
                _("Active"),
            )
        return format_html(
            (
                '<span class="pm-status pm-status--muted" role="status" '
                'aria-label="{}" title="Account has been disabled">'
                '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" '
                'stroke="currentColor" stroke-width="3" stroke-linecap="round" '
                'stroke-linejoin="round"><circle cx="12" cy="12" r="8"/></svg>'
                '<span>{}</span></span>'
            ),
            _("Account: disabled"),
            _("Disabled"),
        )

    # ── List column: staff / superuser ────────────────────────────────
    @admin.display(description=_("Access"), ordering="is_staff")
    def staff_status(self, obj: User) -> str:
        if obj.is_superuser:
            return format_html(
                (
                    '<span class="pm-badge pm-badge--staff-super" role="status" '
                    'aria-label="{}">{}</span>'
                ),
                _("Access: Superuser (all permissions)"),
                _("Super Admin"),
            )
        if obj.is_staff:
            return format_html(
                (
                    '<span class="pm-badge pm-badge--staff" role="status" '
                    'aria-label="{}">{}</span>'
                ),
                _("Access: Staff (admin login)"),
                _("Staff"),
            )
        return format_html(
            '<span class="pm-badge pm-badge--empty" aria-label="{}">{}</span>',
            _("Access: Platform user only"),
            _("User"),
        )

    # ── List column: last login (relative + absolute) ────────────────
    @admin.display(description=_("Last active"), ordering="last_login")
    def last_login_display(self, obj: User) -> str:
        if not obj.last_login:
            return format_html(
                '<span class="pm-sublabel pm-sublabel--muted" aria-label="{}" title="{}">{}</span>',
                _("Never signed in"),
                _("User has never completed a login"),
                _("Never signed in"),
            )
        delta = timezone.now() - obj.last_login
        days = delta.days
        if days == 0:
            if delta.seconds < 3600:
                rel = _("{m} min ago").format(m=max(1, delta.seconds // 60))
            else:
                rel = _("{h} h ago").format(h=delta.seconds // 3600)
        elif days == 1:
            rel = _("Yesterday")
        elif days < 7:
            rel = _("{d} days ago").format(d=days)
        elif days < 30:
            rel = _("{w}w ago").format(w=max(1, days // 7))
        else:
            rel = _("{mo}mo ago").format(mo=max(1, days // 30))
        abs_ts = timezone.localtime(obj.last_login).strftime("%Y-%m-%d %H:%M")
        tone = "pm-sublabel"
        if days >= 90:
            tone = "pm-sublabel pm-sublabel--danger"
        elif days >= 30:
            tone = "pm-sublabel pm-sublabel--warn"
        elif days <= 7:
            tone = "pm-sublabel pm-sublabel--ok"
        return format_html(
            (
                '<div class="pm-stack"><span class="{}" '
                'aria-label="{}" title="{}">{}</span>'
                '<span class="pm-sublabel pm-sublabel--muted" aria-hidden="true">{}</span></div>'
            ),
            tone,
            _("Last signed in: {rel} ({abs_ts})").format(rel=rel, abs_ts=abs_ts),
            abs_ts,
            rel,
            abs_ts,
        )

    # ── List column: created at (relative) ───────────────────────────
    @admin.display(description=_("Joined"), ordering="created_at")
    def created_at_display(self, obj: User) -> str:
        if not obj.created_at:
            return _("—")
        abs_ts = timezone.localtime(obj.created_at).strftime("%Y-%m-%d")
        delta = timezone.now() - obj.created_at
        days = delta.days
        if days == 0:
            rel = _("Today")
        elif days == 1:
            rel = _("Yesterday")
        elif days < 30:
            rel = _("{d}d ago").format(d=days)
        elif days < 365:
            rel = _("{mo}mo ago").format(mo=max(1, days // 30))
        else:
            rel = _("{y}y ago").format(y=max(1, days // 365))
        return format_html(
            (
                '<div class="pm-stack"><span class="pm-sublabel" title="{}" aria-label="{}">{}</span>'
                '<span class="pm-sublabel pm-sublabel--muted" aria-hidden="true">{}</span></div>'
            ),
            abs_ts,
            _("Joined {rel} on {abs}").format(rel=rel, abs=abs_ts),
            rel,
            abs_ts,
        )

    # ─────────────────────── Bulk actions ────────────────────────────
    def _bulk_update(self, request, queryset, *, field: str, value: bool, msg_true: str, msg_false: str):
        """Small helper: apply a boolean field update and emit a count message."""
        updated = queryset.update(**{field: value})
        msg = msg_true if value else msg_false
        self.message_user(request, _("{count} {msg}.").format(count=updated, msg=msg))

    @admin.action(description=_("Mark selected as verified"))
    def bulk_mark_verified(self, request: HttpRequest, queryset):
        total = queryset.count()
        if total and not request.user.is_superuser:
            qs = queryset.exclude(is_superuser=True)
            if qs.count() != total:
                self.message_user(
                    request,
                    _("Superuser accounts require superuser to verify."),
                    level="WARNING",
                )
        else:
            qs = queryset
        self._bulk_update(
            request, qs,
            field="is_verified", value=True,
            msg_true=_("users marked as verified"),
            msg_false="",
        )

    @admin.action(description=_("Unverify selected"))
    def bulk_unverify(self, request: HttpRequest, queryset):
        if not request.user.is_superuser:
            self.message_user(
                request,
                _("Only superusers can unverify accounts."),
                level="ERROR",
            )
            return
        self._bulk_update(
            request, queryset,
            field="is_verified", value=False,
            msg_true="",
            msg_false=_("users unverified"),
        )

    @admin.action(description=_("Enable selected accounts"))
    def bulk_activate(self, request: HttpRequest, queryset):
        self._bulk_update(
            request, queryset.exclude(pk=request.user.pk),
            field="is_active", value=True,
            msg_true=_("accounts enabled"),
            msg_false="",
        )

    @admin.action(description=_("Disable selected accounts"))
    def bulk_deactivate(self, request: HttpRequest, queryset):
        target = queryset.exclude(pk=request.user.pk)
        if request.user.is_superuser:
            qs = target
        else:
            qs = target.exclude(is_superuser=True)
            if qs.count() != target.count():
                self.message_user(
                    request,
                    _("Cannot disable superuser accounts (staff only for your role)."),
                    level="WARNING",
                )
        self._bulk_update(
            request, qs,
            field="is_active", value=False,
            msg_true="",
            msg_false=_("accounts disabled"),
        )

    @admin.action(description=_("Toggle staff access"))
    def bulk_toggle_staff(self, request: HttpRequest, queryset):
        if not request.user.is_superuser:
            self.message_user(
                request,
                _("Only superusers can modify staff access."),
                level="ERROR",
            )
            return
        never_self = queryset.exclude(pk=request.user.pk)
        enabled_count = 0
        disabled_count = 0
        for user in never_self:
            user.is_staff = not user.is_staff
            if user.is_staff:
                enabled_count += 1
            else:
                disabled_count += 1
            user.save(update_fields=["is_staff"])
        self.message_user(
            request,
            _("Staff: {on} granted · {off} revoked.").format(on=enabled_count, off=disabled_count),
            level="SUCCESS",
        )

    @admin.action(description=_("Export selected as CSV"))
    def export_users_csv(self, request: HttpRequest, queryset):
        """Security: the caller's scope determines rows; only export PII when
        the caller is staff. Superusers additionally see paystack codes."""
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="pitchmic_users.csv"'
        writer = csv.writer(response)
        headers = [
            "id", "email", "first_name", "last_name", "role",
            "is_verified", "is_active", "is_staff", "is_superuser",
            "subscription_plan", "subscription_status",
            "last_login", "created_at",
        ]
        if request.user.is_superuser:
            headers.extend(["paystack_customer_code", "paystack_email"])
        writer.writerow(headers)
        for u in queryset.order_by("pk").only(*[h for h in headers if h not in ("paystack_customer_code", "paystack_email")]):
            row = [
                u.pk,
                u.email,
                u.first_name or "",
                u.last_name or "",
                u.role or "",
                "true" if u.is_verified else "false",
                "true" if u.is_active else "false",
                "true" if u.is_staff else "false",
                "true" if u.is_superuser else "false",
                u.subscription_plan or "",
                u.subscription_status or "",
                u.last_login.isoformat() if u.last_login else "",
                u.created_at.isoformat() if u.created_at else "",
            ]
            if request.user.is_superuser:
                row.append(u.paystack_customer_code or "")
                row.append(u.paystack_email or "")
            writer.writerow(row)
        return response


# ---------------------------------------------------------------------------
# Startup Profile Admin
# ---------------------------------------------------------------------------
@admin.register(StartupProfile)
class StartupProfileAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "company_name",
        "user",
        "industry",
        "funding_stage_badge",
        "location",
        "founded_year",
        "pitch_count",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("industry", "funding_stage", "created_at")
    search_fields: tuple[str, ...] = ("company_name", "user__email", "tagline", "description", "location")
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
    inlines: tuple = (TeamMemberInline,)
    list_per_page = 25
    list_select_related = ("user",)
    date_hierarchy = "created_at"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(_pitch_count=Count("pitches", distinct=True))

    @admin.display(description="Pitches", ordering="_pitch_count")
    def pitch_count(self, obj: StartupProfile) -> str:
        count = getattr(obj, "_pitch_count", 0)
        if count:
            return format_html(
                '<span style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;'
                'padding:1px 7px;border-radius:9999px;font-size:11px;font-weight:700">{}</span>',
                count,
            )
        return format_html('<span style="color:#94a3b8;font-size:12px">0</span>')

    @admin.display(description="Stage")
    def funding_stage_badge(self, obj: StartupProfile) -> str:
        _STAGE_STYLES = {
            "pre_seed": ("background:#f0fdf4;color:#166534;border:1px solid #bbf7d0", "Pre-Seed"),
            "seed": ("background:#ecfdf5;color:#047857;border:1px solid #a7f3d0", "Seed"),
            "series_a": ("background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe", "Series A"),
            "series_b": ("background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe", "Series B"),
            "series_c": ("background:#faf5ff;color:#7c3aed;border:1px solid #ddd6fe", "Series C"),
            "growth": ("background:#fff7ed;color:#c2410c;border:1px solid #fed7aa", "Growth"),
        }
        if not obj.funding_stage:
            return format_html('<span style="color:#94a3b8;font-size:12px">—</span>')
        style, label = _STAGE_STYLES.get(
            obj.funding_stage,
            ("background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0", obj.funding_stage),
        )
        return format_html(
            '<span style="{}; padding:2px 8px; border-radius:9999px; '
            'font-size:11px; font-weight:700">{}</span>',
            style,
            label,
        )


# ---------------------------------------------------------------------------
# Investor Profile Admin
# ---------------------------------------------------------------------------
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
    list_filter: tuple[str, ...] = (
        "created_at",
        ("location", admin.AllValuesFieldListFilter),
    )
    search_fields: tuple[str, ...] = (
        "full_name",
        "user__email",
        "company_name",
        "title",
        "bio",
        "location",
    )
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
    list_per_page = 25
    list_select_related = ("user",)
    date_hierarchy = "created_at"


# ---------------------------------------------------------------------------
# Team Member Admin
# ---------------------------------------------------------------------------
@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "name",
        "startup_link",
        "role",
        "order",
        "created_at",
    )
    list_filter: tuple[str, ...] = ("created_at",)
    search_fields: tuple[str, ...] = ("name", "role", "bio", "startup_profile__company_name")
    readonly_fields: tuple[str, ...] = ("created_at", "updated_at")
    list_per_page = 25
    list_select_related = ("startup_profile", "startup_profile__user")

    @admin.display(description="Startup", ordering="startup_profile__company_name")
    def startup_link(self, obj: TeamMember) -> str:
        if obj.startup_profile_id:
            return format_html(
                '<a href="/pitchmic-control-portal-hq-8492/users/startupprofile/{}/change/" '
                'style="color:#c2410c;font-weight:600;text-decoration:none">{}</a>',
                obj.startup_profile_id,
                obj.startup_profile.company_name,
            )
        return "—"


# ---------------------------------------------------------------------------
# Group Admin — extended with member count
# ---------------------------------------------------------------------------
admin.site.unregister(Group)


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = ("name", "member_count", "permission_count")
    search_fields: tuple[str, ...] = ("name",)
    filter_horizontal = ("permissions",)
    list_per_page = 25

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(
            _member_count=Count("user", distinct=True),
            _perm_count=Count("permissions", distinct=True),
        )

    @admin.display(description="Members", ordering="_member_count")
    def member_count(self, obj) -> str:
        count = getattr(obj, "_member_count", 0)
        if count:
            return format_html(
                '<span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;'
                'padding:1px 7px;border-radius:9999px;font-size:11px;font-weight:700">{} users</span>',
                count,
            )
        return format_html('<span style="color:#94a3b8;font-size:12px">Empty</span>')

    @admin.display(description="Permissions", ordering="_perm_count")
    def permission_count(self, obj) -> str:
        count = getattr(obj, "_perm_count", 0)
        return format_html(
            '<span style="color:#64748b;font-size:12px">{} perms</span>',
            count,
        )


# ---------------------------------------------------------------------------
# Token Blacklist — read-only security audit view
# ---------------------------------------------------------------------------
admin.site.unregister(BlacklistedToken)


@admin.register(BlacklistedToken)
class BlacklistedTokenAdmin(admin.ModelAdmin):
    """Blacklisted tokens are created by the system; admins should only view them."""

    list_display = ("token_jti", "blacklisted_at_display")
    search_fields = ("token__jti",)
    list_filter = ("blacklisted_at",)
    list_per_page = 50
    date_hierarchy = "blacklisted_at"

    def has_add_permission(self, request) -> bool:  # type: ignore[override]
        return False

    def has_change_permission(self, request, obj=None) -> bool:  # type: ignore[override]
        return False

    @admin.display(description="Token JTI")
    def token_jti(self, obj) -> str:
        jti = obj.token.jti if obj.token_id else "—"
        return format_html(
            '<code style="font-size:11px;color:#475569">{}</code>',
            jti[:24] + "…" if len(str(jti)) > 24 else jti,
        )

    @admin.display(description="Blacklisted At")
    def blacklisted_at_display(self, obj) -> str:
        return format_html(
            '<span style="color:#64748b;font-size:12px">{}</span>',
            obj.blacklisted_at.strftime("%Y-%m-%d %H:%M UTC") if obj.blacklisted_at else "—",
        )


# ---------------------------------------------------------------------------
# Outstanding Tokens — enhanced security audit view with expiry info
# ---------------------------------------------------------------------------
admin.site.unregister(OutstandingToken)


@admin.register(OutstandingToken)
class OutstandingTokenAdmin(admin.ModelAdmin):
    """Outstanding JWT tokens — read-only audit log with bulk blacklist action."""

    list_display = ("jti_short", "user_link", "created_at_display", "expires_at_display", "blacklist_status")
    search_fields = ("user__email", "jti")
    list_filter = ("expires_at", "created_at")
    list_per_page = 50
    date_hierarchy = "created_at"
    list_select_related = ("user",)
    actions = ("blacklist_selected_tokens",)

    def has_add_permission(self, request) -> bool:  # type: ignore[override]
        return False

    def has_change_permission(self, request, obj=None) -> bool:  # type: ignore[override]
        return False

    @admin.display(description="JTI")
    def jti_short(self, obj) -> str:
        jti = str(obj.jti or "")
        return format_html(
            '<code style="font-size:11px;color:#475569">{}</code>',
            jti[:16] + "…" if len(jti) > 16 else jti,
        )

    @admin.display(description="User", ordering="user__email")
    def user_link(self, obj) -> str:
        if obj.user_id:
            return format_html(
                '<a href="/pitchmic-control-portal-hq-8492/users/user/{}/change/" '
                'style="color:#c2410c;font-weight:500;text-decoration:none">{}</a>',
                obj.user_id,
                obj.user.email if obj.user else "—",
            )
        return format_html('<span style="color:#94a3b8">Anonymous</span>')

    @admin.display(description="Issued At")
    def created_at_display(self, obj) -> str:
        return format_html(
            '<span style="color:#64748b;font-size:12px">{}</span>',
            obj.created_at.strftime("%Y-%m-%d %H:%M") if obj.created_at else "—",
        )

    @admin.display(description="Expires At")
    def expires_at_display(self, obj) -> str:
        from django.utils import timezone
        if not obj.expires_at:
            return "—"
        now = timezone.now()
        is_expired = obj.expires_at < now
        style = "color:#dc2626;font-weight:600" if is_expired else "color:#047857"
        label = "EXPIRED" if is_expired else obj.expires_at.strftime("%Y-%m-%d %H:%M")
        return format_html(
            '<span style="font-size:12px;{}">{}</span>',
            style,
            label,
        )

    @admin.display(description="Status")
    def blacklist_status(self, obj) -> str:
        try:
            obj.blacklistedtoken  # noqa: B018
            return format_html(
                '<span style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;'
                'padding:1px 7px;border-radius:4px;font-size:11px;font-weight:700">Blacklisted</span>'
            )
        except Exception:
            return format_html(
                '<span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;'
                'padding:1px 7px;border-radius:4px;font-size:11px;font-weight:700">Active</span>'
            )

    @admin.action(description="Blacklist selected tokens")
    def blacklist_selected_tokens(self, request, queryset):
        created = 0
        for token in queryset:
            _, was_created = BlacklistedToken.objects.get_or_create(token=token)
            if was_created:
                created += 1
        self.message_user(
            request,
            f"{created} token(s) blacklisted successfully. {queryset.count() - created} were already blacklisted.",
            level="success",
        )


# ---------------------------------------------------------------------------
# Auth Permissions Admin
# ---------------------------------------------------------------------------
@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "name",
        "codename",
        "app_label_display",
        "model_display",
    )
    list_filter: tuple = (
        "content_type__app_label",
    )
    search_fields: tuple[str, ...] = (
        "name",
        "codename",
        "content_type__app_label",
        "content_type__model",
    )
    ordering: tuple[str, ...] = ("content_type__app_label", "content_type__model", "codename")
    list_select_related: tuple[str, ...] = ("content_type",)
    list_per_page = 25

    @admin.display(description=_("App"), ordering="content_type__app_label")
    def app_label_display(self, obj: Permission) -> str:
        return obj.content_type.app_label.title()

    @admin.display(description=_("Model"), ordering="content_type__model")
    def model_display(self, obj: Permission) -> str:
        return obj.content_type.model.title()
