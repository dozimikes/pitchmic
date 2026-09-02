from __future__ import annotations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Activity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("verb", models.CharField(
                    choices=[
                        ("pitch_created", "Created a pitch"),
                        ("pitch_updated", "Updated a pitch"),
                        ("pitch_liked", "Liked a pitch"),
                        ("offer_made", "Made an offer"),
                        ("offer_accepted", "Accepted an offer"),
                        ("offer_rejected", "Rejected an offer"),
                        ("offer_negotiating", "Started negotiating"),
                        ("startup_joined", "Startup joined"),
                        ("investor_joined", "Investor joined"),
                        ("team_member_added", "Added team member"),
                    ],
                    db_index=True,
                    max_length=50,
                    verbose_name="verb",
                )),
                ("target_object_id", models.PositiveIntegerField(blank=True, null=True, verbose_name="target object id")),
                ("action_object_object_id", models.PositiveIntegerField(blank=True, null=True, verbose_name="action object id")),
                ("metadata", models.JSONField(blank=True, default=dict, verbose_name="metadata")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="activities",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="actor",
                )),
                ("action_object_content_type", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="action_objects",
                    to="contenttypes.contenttype",
                    verbose_name="action object content type",
                )),
                ("target_content_type", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="activity_targets",
                    to="contenttypes.contenttype",
                    verbose_name="target content type",
                )),
            ],
            options={
                "verbose_name": "activity",
                "verbose_name_plural": "activities",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="activity",
            index=models.Index(fields=["actor", "-created_at"], name="newsfeed_act_actor_idx"),
        ),
        migrations.AddIndex(
            model_name="activity",
            index=models.Index(fields=["verb", "-created_at"], name="newsfeed_act_verb_idx"),
        ),
        migrations.AddIndex(
            model_name="activity",
            index=models.Index(fields=["target_content_type", "target_object_id"], name="newsfeed_act_target_idx"),
        ),
    ]
