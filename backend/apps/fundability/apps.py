from __future__ import annotations

from django.apps import AppConfig


class FundabilityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.fundability"
    verbose_name = "Fundability Engine"
