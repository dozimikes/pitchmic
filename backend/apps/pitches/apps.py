from django.apps import AppConfig


class PitchesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.pitches"
    verbose_name = "Pitches"

    def ready(self) -> None:
        from django.db.models.signals import post_save

        from apps.pitches.models import Pitch
        from apps.pitches.signals import on_pitch_saved

        post_save.connect(on_pitch_saved, sender=Pitch, dispatch_uid="pitches.on_pitch_saved")
