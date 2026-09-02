from __future__ import annotations

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("users", "0001_initial"),
        ("pitches", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Offer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(
                    choices=[
                        ("draft", "Draft"),
                        ("sent", "Sent"),
                        ("accepted", "Accepted"),
                        ("rejected", "Rejected"),
                        ("negotiating", "Negotiating"),
                        ("withdrawn", "Withdrawn"),
                        ("expired", "Expired"),
                    ],
                    db_index=True,
                    default="draft",
                    max_length=20,
                    verbose_name="status",
                )),
                ("amount", models.DecimalField(
                    decimal_places=2,
                    max_digits=12,
                    validators=[django.core.validators.MinValueValidator(0)],
                    verbose_name="investment amount",
                )),
                ("equity_pct", models.DecimalField(
                    decimal_places=2,
                    max_digits=5,
                    validators=[
                        django.core.validators.MinValueValidator(0),
                        django.core.validators.MaxValueValidator(100),
                    ],
                    verbose_name="equity percentage",
                )),
                ("message", models.TextField(blank=True, verbose_name="message")),
                ("valuation", models.DecimalField(
                    blank=True, decimal_places=2, max_digits=12, null=True, verbose_name="pre-money valuation",
                )),
                ("terms", models.TextField(blank=True, verbose_name="terms and conditions")),
                ("sent_at", models.DateTimeField(blank=True, null=True, verbose_name="sent at")),
                ("responded_at", models.DateTimeField(blank=True, null=True, verbose_name="responded at")),
                ("expires_at", models.DateTimeField(blank=True, null=True, verbose_name="expires at")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("investor", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="offers_made",
                    to="users.investorprofile",
                )),
                ("pitch", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="offers",
                    to="pitches.pitch",
                )),
            ],
            options={
                "verbose_name": "offer",
                "verbose_name_plural": "offers",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="offer",
            constraint=models.UniqueConstraint(
                condition=models.Q(status="draft") | models.Q(status="sent") | models.Q(status="negotiating"),
                fields=["investor", "pitch", "status"],
                name="unique_active_offer_per_investor_pitch",
                violation_error_message="An active offer already exists for this pitch.",
            ),
        ),
        migrations.AddIndex(
            model_name="offer",
            index=models.Index(fields=["investor", "status", "-created_at"], name="offers_offer_investor_idx"),
        ),
        migrations.AddIndex(
            model_name="offer",
            index=models.Index(fields=["pitch", "status", "-created_at"], name="offers_offer_pitch_idx"),
        ),
    ]
