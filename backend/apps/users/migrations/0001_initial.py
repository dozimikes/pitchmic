from __future__ import annotations

import django.contrib.auth.models
import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models

import apps.users.managers


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        # ------------------------------------------------------------------ #
        # User
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name="User",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("password", models.CharField(max_length=128, verbose_name="password")),
                ("last_login", models.DateTimeField(blank=True, null=True, verbose_name="last login")),
                ("is_superuser", models.BooleanField(
                    default=False,
                    help_text="Designates that this user has all permissions without explicitly assigning them.",
                    verbose_name="superuser status",
                )),
                ("email", models.EmailField(max_length=255, unique=True, verbose_name="email address")),
                ("first_name", models.CharField(blank=True, max_length=150, verbose_name="first name")),
                ("last_name", models.CharField(blank=True, max_length=150, verbose_name="last name")),
                ("role", models.CharField(
                    choices=[("startup", "Startup"), ("investor", "Investor")],
                    default="startup",
                    max_length=20,
                    verbose_name="role",
                )),
                ("is_verified", models.BooleanField(default=False, verbose_name="verified")),
                ("is_staff", models.BooleanField(default=False, verbose_name="staff status")),
                ("is_active", models.BooleanField(default=True, verbose_name="active")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("groups", models.ManyToManyField(
                    blank=True,
                    help_text="The groups this user belongs to.",
                    related_name="user_set",
                    related_query_name="user",
                    to="auth.group",
                    verbose_name="groups",
                )),
                ("user_permissions", models.ManyToManyField(
                    blank=True,
                    help_text="Specific permissions for this user.",
                    related_name="user_set",
                    related_query_name="user",
                    to="auth.permission",
                    verbose_name="user permissions",
                )),
            ],
            options={
                "verbose_name": "user",
                "verbose_name_plural": "users",
                "ordering": ("-created_at",),
            },
            managers=[
                ("objects", apps.users.managers.UserManager()),
            ],
        ),
        # ------------------------------------------------------------------ #
        # StartupProfile
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name="StartupProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("company_name", models.CharField(max_length=255, verbose_name="company name")),
                ("tagline", models.CharField(blank=True, max_length=255, verbose_name="tagline")),
                ("description", models.TextField(blank=True, verbose_name="description")),
                ("address", models.CharField(blank=True, max_length=512, verbose_name="contact address")),
                ("phone", models.CharField(blank=True, max_length=50, verbose_name="phone number")),
                ("niche", models.CharField(
                    blank=True,
                    help_text="Comma-separated investment niches / industries",
                    max_length=500,
                    verbose_name="niche",
                )),
                ("website", models.URLField(blank=True, verbose_name="website")),
                ("linkedin", models.URLField(blank=True, verbose_name="LinkedIn")),
                ("twitter", models.CharField(blank=True, max_length=255, verbose_name="Twitter/X handle")),
                ("facebook", models.CharField(blank=True, max_length=500, verbose_name="Facebook URL")),
                ("logo_url", models.URLField(blank=True, verbose_name="logo URL")),
                ("industry", models.CharField(blank=True, max_length=255, verbose_name="industry")),
                ("founded_year", models.PositiveIntegerField(
                    blank=True,
                    null=True,
                    validators=[
                        django.core.validators.MinValueValidator(1900),
                        django.core.validators.MaxValueValidator(2100),
                    ],
                    verbose_name="founded year",
                )),
                ("location", models.CharField(blank=True, max_length=255, verbose_name="location")),
                ("employee_count", models.CharField(blank=True, max_length=50, verbose_name="employee count")),
                ("pitch_video_url", models.URLField(blank=True, verbose_name="pitch video URL")),
                ("target_market", models.CharField(blank=True, max_length=500, verbose_name="target market / countries")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="startup_profile",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "verbose_name": "startup profile",
                "verbose_name_plural": "startup profiles",
                "ordering": ("company_name",),
            },
        ),
        # ------------------------------------------------------------------ #
        # InvestorProfile
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name="InvestorProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("full_name", models.CharField(max_length=255, verbose_name="full name")),
                ("company_name", models.CharField(blank=True, max_length=255, verbose_name="firm / company name")),
                ("title", models.CharField(blank=True, max_length=255, verbose_name="title / position")),
                ("bio", models.TextField(blank=True, verbose_name="bio")),
                ("address", models.CharField(blank=True, max_length=512, verbose_name="contact address")),
                ("phone", models.CharField(blank=True, max_length=50, verbose_name="phone number")),
                ("niche", models.CharField(
                    blank=True,
                    help_text="Comma-separated investment niches",
                    max_length=500,
                    verbose_name="investment niche",
                )),
                ("website", models.URLField(blank=True, verbose_name="website")),
                ("linkedin", models.URLField(blank=True, verbose_name="LinkedIn")),
                ("twitter", models.CharField(blank=True, max_length=255, verbose_name="Twitter/X handle")),
                ("avatar_url", models.URLField(blank=True, verbose_name="avatar URL")),
                ("location", models.CharField(blank=True, max_length=255, verbose_name="location")),
                ("investment_range_min", models.DecimalField(
                    blank=True, decimal_places=2, max_digits=12, null=True, verbose_name="min investment",
                )),
                ("investment_range_max", models.DecimalField(
                    blank=True, decimal_places=2, max_digits=12, null=True, verbose_name="max investment",
                )),
                ("preferred_industries", models.CharField(
                    blank=True,
                    help_text="Comma-separated list of preferred industries",
                    max_length=500,
                    verbose_name="preferred industries",
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="investor_profile",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "verbose_name": "investor profile",
                "verbose_name_plural": "investor profiles",
                "ordering": ("full_name",),
            },
        ),
        # ------------------------------------------------------------------ #
        # TeamMember
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name="TeamMember",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255, verbose_name="name")),
                ("role", models.CharField(blank=True, help_text="e.g. Founder, Co-Founder, CTO", max_length=255, verbose_name="role / title")),
                ("bio", models.TextField(blank=True, verbose_name="bio")),
                ("linkedin", models.URLField(blank=True, verbose_name="LinkedIn")),
                ("avatar_url", models.URLField(blank=True, verbose_name="avatar URL")),
                ("order", models.PositiveIntegerField(
                    default=0,
                    help_text="0 = founder, higher numbers = co-founders / team",
                    verbose_name="display order",
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("startup_profile", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="team_members",
                    to="users.startupprofile",
                )),
            ],
            options={
                "verbose_name": "team member",
                "verbose_name_plural": "team members",
                "ordering": ("startup_profile", "order"),
            },
        ),
    ]
