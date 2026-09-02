from __future__ import annotations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("notification_type", models.CharField(
                    choices=[("info", "Info"), ("success", "Success"), ("warning", "Warning"), ("error", "Error")],
                    default="info",
                    max_length=20,
                    verbose_name="notification type",
                )),
                ("category", models.CharField(
                    choices=[
                        ("new_offer", "New Offer"),
                        ("offer_updated", "Offer Updated"),
                        ("new_pitch", "New Pitch"),
                        ("new_like", "New Like"),
                        ("system", "System"),
                    ],
                    default="system",
                    max_length=50,
                    verbose_name="category",
                )),
                ("title", models.CharField(max_length=255, verbose_name="title")),
                ("body", models.TextField(blank=True, verbose_name="body")),
                ("data", models.JSONField(blank=True, default=dict, verbose_name="data")),
                ("read_at", models.DateTimeField(blank=True, db_index=True, null=True, verbose_name="read at")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="notifications",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="user",
                )),
            ],
            options={
                "verbose_name": "notification",
                "verbose_name_plural": "notifications",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["user", "-created_at"], name="notif_user_created_idx"),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["user", "read_at", "-created_at"], name="notif_user_read_idx"),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["category", "-created_at"], name="notif_category_idx"),
        ),
        # ---- InAppNotification ----
        migrations.CreateModel(
            name="InAppNotification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("dismissed_at", models.DateTimeField(blank=True, null=True, verbose_name="dismissed at")),
                ("pinned", models.BooleanField(default=False, verbose_name="pinned")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("notification", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="in_app",
                    to="notifications.notification",
                    verbose_name="notification",
                )),
            ],
            options={
                "verbose_name": "in-app notification",
                "verbose_name_plural": "in-app notifications",
                "ordering": ("-pinned", "-created_at"),
            },
        ),
        # ---- EmailNotification ----
        migrations.CreateModel(
            name="EmailNotification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(
                    choices=[("pending", "Pending"), ("sent", "Sent"), ("failed", "Failed")],
                    db_index=True,
                    default="pending",
                    max_length=20,
                    verbose_name="status",
                )),
                ("subject", models.CharField(blank=True, max_length=255, verbose_name="subject")),
                ("html_body", models.TextField(blank=True, verbose_name="HTML body")),
                ("plain_body", models.TextField(blank=True, verbose_name="plain text body")),
                ("sent_at", models.DateTimeField(blank=True, null=True, verbose_name="sent at")),
                ("failed_at", models.DateTimeField(blank=True, null=True, verbose_name="failed at")),
                ("error_message", models.TextField(blank=True, verbose_name="error message")),
                ("retry_count", models.PositiveIntegerField(default=0, verbose_name="retry count")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("notification", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="email",
                    to="notifications.notification",
                    verbose_name="notification",
                )),
            ],
            options={
                "verbose_name": "email notification",
                "verbose_name_plural": "email notifications",
                "ordering": ("-created_at",),
            },
        ),
    ]
