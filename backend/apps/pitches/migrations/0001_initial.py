from __future__ import annotations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("users", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Pitch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255, verbose_name="title")),
                ("description", models.TextField(blank=True, verbose_name="description")),
                ("problem", models.TextField(blank=True, verbose_name="problem")),
                ("solution", models.TextField(blank=True, verbose_name="solution")),
                ("market_size", models.TextField(blank=True, verbose_name="market size")),
                ("business_model", models.TextField(blank=True, verbose_name="business model")),
                ("traction", models.TextField(blank=True, verbose_name="traction")),
                ("use_of_funds", models.TextField(blank=True, verbose_name="use of funds")),
                ("tags", models.JSONField(blank=True, default=list, help_text="List of tag strings, e.g. ['saas', 'b2b']", verbose_name="tags")),
                ("cover_image_url", models.URLField(blank=True, verbose_name="cover image URL")),
                ("is_featured", models.BooleanField(db_index=True, default=False, verbose_name="is featured")),
                ("image_url", models.URLField(blank=True, verbose_name="image URL")),
                ("video_url", models.URLField(blank=True, verbose_name="video URL")),
                ("deck_url", models.URLField(blank=True, verbose_name="pitch deck URL")),
                ("asking_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True, verbose_name="asking amount")),
                ("equity_offered", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, verbose_name="equity offered %")),
                ("pitched_at", models.DateTimeField(blank=True, db_index=True, null=True, verbose_name="pitched at")),
                ("is_draft", models.BooleanField(default=True, help_text="Whether this pitch is still a draft", verbose_name="is draft")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "startup",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pitches",
                        to="users.startupprofile",
                    ),
                ),
            ],
            options={
                "verbose_name": "pitch",
                "verbose_name_plural": "pitches",
                "ordering": ("-pitched_at", "-created_at"),
                "indexes": [models.Index(fields=["startup", "-created_at"], name="pitches_pit_startup_idx")],
            },
        ),
        migrations.CreateModel(
            name="PitchAttachment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file_name", models.CharField(max_length=255, verbose_name="file name")),
                ("file_url", models.URLField(verbose_name="file URL")),
                ("file_type", models.CharField(blank=True, help_text="MIME type of the attachment", max_length=100, verbose_name="file type")),
                ("file_size", models.PositiveIntegerField(blank=True, null=True, verbose_name="file size (bytes)")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "pitch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attachments",
                        to="pitches.pitch",
                    ),
                ),
            ],
            options={
                "verbose_name": "pitch attachment",
                "verbose_name_plural": "pitch attachments",
                "ordering": ("-created_at",),
            },
        ),
        migrations.CreateModel(
            name="PitchLike",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "pitch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="likes",
                        to="pitches.pitch",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pitch_likes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "pitch like",
                "verbose_name_plural": "pitch likes",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="pitchlike",
            constraint=models.UniqueConstraint(
                fields=["pitch", "user"],
                name="unique_pitch_like",
                violation_error_message="You have already liked this pitch.",
            ),
        ),
    ]
