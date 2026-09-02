from __future__ import annotations

from django.contrib import admin

from .models import Offer


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display: tuple[str, ...] = (
        "id",
        "investor",
        "pitch",
        "amount",
        "equity_pct",
        "status",
        "sent_at",
        "responded_at",
        "created_at",
    )
    list_filter: tuple[str, ...] = (
        "status",
        "sent_at",
        "responded_at",
        "created_at",
        "expires_at",
    )
    search_fields: tuple[str, ...] = (
        "investor__full_name",
        "investor__company_name",
        "investor__user__email",
        "pitch__title",
        "pitch__startup__company_name",
        "message",
        "terms",
    )
    readonly_fields: tuple[str, ...] = ("sent_at", "responded_at", "created_at", "updated_at")
    autocomplete_fields: tuple[str, ...] = ("investor", "pitch")
    date_hierarchy: str = "created_at"
    actions: tuple[str, ...] = ("mark_as_sent", "mark_as_accepted", "mark_as_rejected")

    @admin.action(description="Mark selected offers as sent")
    def mark_as_sent(self, request, queryset) -> None:
        for offer in queryset.filter(status=Offer.STATUS_DRAFT):
            try:
                offer.transition_to(Offer.STATUS_SENT)
                offer.save()
            except ValueError:
                pass
        self.message_user(request, "Selected draft offers have been marked as sent.")

    @admin.action(description="Mark selected offers as accepted")
    def mark_as_accepted(self, request, queryset) -> None:
        for offer in queryset.filter(status__in=[Offer.STATUS_SENT, Offer.STATUS_NEGOTIATING]):
            try:
                offer.transition_to(Offer.STATUS_ACCEPTED)
                offer.save()
            except ValueError:
                pass
        self.message_user(request, "Selected offers have been marked as accepted.")

    @admin.action(description="Mark selected offers as rejected")
    def mark_as_rejected(self, request, queryset) -> None:
        for offer in queryset.filter(status__in=[Offer.STATUS_DRAFT, Offer.STATUS_SENT, Offer.STATUS_NEGOTIATING]):
            try:
                offer.transition_to(Offer.STATUS_REJECTED)
                offer.save()
            except ValueError:
                pass
        self.message_user(request, "Selected offers have been marked as rejected.")
