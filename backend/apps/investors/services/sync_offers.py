"""
apps.investors.services.sync_offers
===================================
Bidirectional synchronization between institutional TermSheetRevision
and the founder-facing Offer system (apps.offers.models.Offer).
"""
from __future__ import annotations

import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from apps.investors.models import InvestmentCase, TermSheetRevision
from apps.offers.models import Offer
from apps.pitches.models import Pitch
from apps.users.models import InvestorProfile

logger = logging.getLogger(__name__)


STATUS_MAP_TO_OFFER = {
    "draft": Offer.STATUS_DRAFT,
    "proposed": Offer.STATUS_SENT,
    "negotiating": Offer.STATUS_NEGOTIATING,
    "accepted": Offer.STATUS_ACCEPTED,
    "rejected": Offer.STATUS_REJECTED,
    "superseded": Offer.STATUS_NEGOTIATING,
}


@transaction.atomic
def sync_term_sheet_to_offer(term_sheet: TermSheetRevision) -> Offer | None:
    """
    Ensures an institutional TermSheetRevision has a matching Offer instance
    in apps.offers, bridging the fund's internal negotiations to the founder portal.
    """
    ic_case: InvestmentCase = term_sheet.investment_case
    startup = ic_case.startup

    # Find the startup's active pitch
    pitch = Pitch.objects.filter(startup=startup).order_by("-created_at").first()
    if not pitch:
        logger.warning("No pitch found for startup %s; skipping Offer creation.", startup)
        return None

    # Find or create InvestorProfile for the lead partner / firm
    lead_user = ic_case.lead_partner or (ic_case.firm.members.first().user if ic_case.firm.members.exists() else None)
    if not lead_user:
        return None

    investor_profile, _ = InvestorProfile.objects.get_or_create(
        user=lead_user,
        defaults={
            "firm_name": ic_case.firm.name,
            "investment_thesis": ic_case.fund.mandate.thesis_summary if hasattr(ic_case.fund, "mandate") else "",
            "ticket_size_min": ic_case.fund.min_check_size_usd,
            "ticket_size_max": ic_case.fund.max_check_size_usd,
        }
    )

    offer_status = STATUS_MAP_TO_OFFER.get(term_sheet.status, Offer.STATUS_SENT)

    offer, created = Offer.objects.update_or_create(
        investor=investor_profile,
        pitch=pitch,
        defaults={
            "status": offer_status,
            "amount": term_sheet.investment_amount_usd,
            "valuation": term_sheet.valuation_cap_usd,
            "equity_percentage": term_sheet.target_ownership_pct,
            "terms": (
                f"Instrument: {term_sheet.get_instrument_display()}\n"
                f"Valuation Cap: ${term_sheet.valuation_cap_usd:,.0f} USD\n"
                f"Discount: {term_sheet.discount_pct}%\n"
                f"Board Rights: {term_sheet.board_rights}\n"
                f"Pro-Rata Rights: {'Yes' if term_sheet.pro_rata_rights else 'No'}\n"
                f"Version: v{term_sheet.version_number}"
            ),
        }
    )

    if ic_case.offer != offer:
        ic_case.offer = offer
        ic_case.save(update_fields=["offer"])

    return offer
