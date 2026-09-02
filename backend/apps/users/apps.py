from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.users"
    verbose_name = "Users"

    def ready(self) -> None:
        from django.db.models.signals import post_save

        from apps.users.models import InvestorProfile, StartupProfile
        from apps.users.signals import (
            on_investor_profile_updated,
            on_startup_profile_updated,
        )

        post_save.connect(
            on_startup_profile_updated,
            sender=StartupProfile,
            dispatch_uid="users.on_startup_profile_updated",
        )
        post_save.connect(
            on_investor_profile_updated,
            sender=InvestorProfile,
            dispatch_uid="users.on_investor_profile_updated",
        )
