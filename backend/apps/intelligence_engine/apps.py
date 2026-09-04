from django.apps import AppConfig


class IntelligenceEngineConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.intelligence_engine"
    verbose_name = "Pitchmic Intelligence Engine"

    def ready(self) -> None:
        # Import signal handlers when app is ready
        try:
            import apps.intelligence_engine.signals  # noqa: F401
        except ImportError:
            pass
