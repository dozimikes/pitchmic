from __future__ import annotations

from django.apps import AppConfig


class StartupsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.startups"
    verbose_name = "Startups"
