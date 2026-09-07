from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ExternalProgramProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200, verbose_name="name")),
                ("short_name", models.CharField(blank=True, max_length=60, verbose_name="short name")),
                ("program_type", models.CharField(
                    choices=[
                        ("Accelerator", "Accelerator"),
                        ("Grant", "Grant"),
                        ("VC Fund", "VC Fund"),
                        ("Competition", "Competition"),
                        ("Angel Syndicate", "Angel Syndicate"),
                    ],
                    default="Accelerator",
                    max_length=30,
                    verbose_name="program type",
                )),
                ("stage", models.CharField(blank=True, max_length=120, verbose_name="stage focus")),
                ("investment", models.CharField(blank=True, max_length=120, verbose_name="investment terms")),
                ("geography", models.CharField(blank=True, max_length=120, verbose_name="geography")),
                ("industry", models.CharField(blank=True, max_length=200, verbose_name="industry focus")),
                ("application_format", models.CharField(blank=True, max_length=200, verbose_name="application format")),
                ("website_url", models.URLField(blank=True, verbose_name="website URL")),
                ("deadline_text", models.CharField(blank=True, max_length=200, verbose_name="deadline description")),
                ("founder_quality_bar", models.CharField(blank=True, max_length=30, verbose_name="founder quality bar")),
                ("evidence_expectations_bar", models.CharField(blank=True, max_length=30, verbose_name="evidence expectations bar")),
                ("interview_intensity", models.CharField(blank=True, max_length=30, verbose_name="interview intensity")),
                ("is_active", models.BooleanField(default=True, verbose_name="active")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "external program profile",
                "verbose_name_plural": "external program profiles",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="ProgramRequirement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category", models.CharField(
                    choices=[
                        ("traction", "Traction"),
                        ("team", "Team"),
                        ("market", "Market"),
                        ("product", "Product"),
                        ("customers", "Customers"),
                        ("financials", "Financials"),
                        ("defensibility", "Defensibility"),
                        ("narrative", "Narrative"),
                    ],
                    max_length=30,
                    verbose_name="category",
                )),
                ("description", models.TextField(verbose_name="description")),
                ("importance", models.CharField(
                    choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High"), ("VERY_HIGH", "Very High")],
                    default="MEDIUM",
                    max_length=10,
                    verbose_name="importance",
                )),
                ("rationale", models.TextField(blank=True, verbose_name="rationale")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("program", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="requirements",
                    to="application_intelligence.externalprogramprofile",
                )),
            ],
            options={
                "verbose_name": "program requirement",
                "verbose_name_plural": "program requirements",
                "ordering": ["program", "importance", "category"],
            },
        ),
        migrations.CreateModel(
            name="ProgramApplicationQuestion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("question_number", models.PositiveSmallIntegerField(verbose_name="question number")),
                ("label", models.TextField(verbose_name="question text")),
                ("rubric_dimension", models.CharField(blank=True, max_length=100, verbose_name="rubric dimension")),
                ("importance", models.CharField(
                    choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High"), ("VERY_HIGH", "Very High")],
                    default="MEDIUM",
                    max_length=10,
                    verbose_name="importance",
                )),
                ("max_char_limit", models.PositiveIntegerField(blank=True, null=True, verbose_name="max character limit")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("program", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="questions",
                    to="application_intelligence.externalprogramprofile",
                )),
            ],
            options={
                "verbose_name": "program application question",
                "verbose_name_plural": "program application questions",
                "ordering": ["program", "question_number"],
                "unique_together": {("program", "question_number")},
            },
        ),
        migrations.CreateModel(
            name="ProgramSelectionSignal",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("criterion", models.CharField(max_length=100, verbose_name="criterion")),
                ("source_type", models.CharField(
                    choices=[("OFFICIAL", "Official"), ("INFERRED", "Inferred"), ("OBSERVED", "Observed")],
                    default="OBSERVED",
                    max_length=20,
                    verbose_name="source type",
                )),
                ("weight", models.PositiveSmallIntegerField(default=5, verbose_name="weight")),
                ("confidence", models.CharField(
                    choices=[("HIGH", "High"), ("MEDIUM", "Medium"), ("LOW", "Low")],
                    default="MEDIUM",
                    max_length=10,
                    verbose_name="confidence",
                )),
                ("evidence_text", models.TextField(verbose_name="evidence text")),
                ("official_source_ref", models.CharField(blank=True, max_length=300, verbose_name="official source reference")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("program", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="signals",
                    to="application_intelligence.externalprogramprofile",
                )),
            ],
            options={
                "verbose_name": "program selection signal",
                "verbose_name_plural": "program selection signals",
                "ordering": ["program", "-weight"],
            },
        ),
        migrations.CreateModel(
            name="ApplicationStrategy",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("problem", models.TextField(blank=True, verbose_name="problem statement")),
                ("founder_advantage", models.TextField(blank=True, verbose_name="founder advantage")),
                ("why_now", models.TextField(blank=True, verbose_name="why now")),
                ("proof", models.TextField(blank=True, verbose_name="proof points")),
                ("program_fit", models.TextField(blank=True, verbose_name="program fit")),
                ("primary_weakness", models.TextField(blank=True, verbose_name="primary weakness")),
                ("mitigation", models.TextField(blank=True, verbose_name="mitigation")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("program", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="startup_strategies",
                    to="application_intelligence.externalprogramprofile",
                )),
                ("startup", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="application_strategies",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "verbose_name": "application strategy",
                "verbose_name_plural": "application strategies",
                "ordering": ["-updated_at"],
                "unique_together": {("startup", "program")},
            },
        ),
        migrations.CreateModel(
            name="CorrelationNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.TextField(verbose_name="correlation text")),
                ("layer", models.CharField(
                    choices=[("FACTS", "Facts"), ("SIGNALS", "Signals"), ("OUTCOMES", "Outcomes")],
                    max_length=10,
                    verbose_name="information layer",
                )),
                ("caveat", models.TextField(blank=True, verbose_name="caveat")),
                ("sample_size_hint", models.CharField(blank=True, max_length=200, verbose_name="sample size hint")),
                ("is_active", models.BooleanField(default=True, verbose_name="active")),
                ("sort_order", models.PositiveSmallIntegerField(default=0, verbose_name="sort order")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "correlation note",
                "verbose_name_plural": "correlation notes",
                "ordering": ["sort_order", "id"],
            },
        ),
    ]
