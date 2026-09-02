"""
apps.marketing.tasks
=====================
Celery tasks for outreach campaign management.
"""
from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="marketing.generate_campaign_investor_list",
)
def generate_campaign_investor_list(self, campaign_id: int) -> dict:
    """
    AI-powered investor selection for a campaign.
    Filters investors by targeting criteria, then ranks by MatchScore.
    Creates OutreachMessage rows for each selected investor.
    """
    from apps.marketing.models import OutreachCampaign, OutreachMessage
    from apps.matching.models import MatchScore
    from apps.users.models import InvestorProfile

    try:
        campaign = OutreachCampaign.objects.select_related("startup").get(pk=campaign_id)
    except OutreachCampaign.DoesNotExist:
        return {"error": "campaign_not_found"}

    # Base investor queryset
    investors = InvestorProfile.objects.all()

    # Apply industry filter if configured
    if campaign.target_industries:
        # Build a Q filter for any matching preferred_industries
        from django.db.models import Q
        q = Q()
        for ind in campaign.target_industries:
            q |= Q(preferred_industries__icontains=ind) | Q(niche__icontains=ind)
        investors = investors.filter(q)

    # Apply geographic filter
    if campaign.target_locations:
        from django.db.models import Q
        q = Q()
        for loc in campaign.target_locations:
            q |= Q(location__icontains=loc)
        investors = investors.filter(q)

    # Apply ticket size filter
    if campaign.min_ticket_size:
        investors = investors.filter(
            investment_range_max__gte=campaign.min_ticket_size
        )
    if campaign.max_ticket_size:
        investors = investors.filter(
            investment_range_min__lte=campaign.max_ticket_size
        )

    # Rank by compatibility score
    match_scores = {
        ms.investor_id: ms.compatibility_score
        for ms in MatchScore.objects.filter(
            startup=campaign.startup,
            compatibility_score__gte=campaign.min_compatibility_score,
        )
    }

    selected_investors = [
        inv for inv in investors
        if match_scores.get(inv.pk, 0) >= campaign.min_compatibility_score
    ]
    # Sort by score descending
    selected_investors.sort(key=lambda inv: match_scores.get(inv.pk, 0), reverse=True)

    created = 0
    for investor in selected_investors:
        subject, body = _render_message(campaign, investor)
        _, is_new = OutreachMessage.objects.get_or_create(
            campaign=campaign,
            investor=investor,
            defaults={
                "subject": subject,
                "body": body,
                "personalization_data": {"compatibility_score": match_scores.get(investor.pk, 0)},
            },
        )
        if is_new:
            created += 1

    logger.info("Campaign %s: %d investor messages created", campaign_id, created)
    return {"campaign_id": campaign_id, "messages_created": created}


def _render_message(campaign, investor) -> tuple[str, str]:
    """Render personalised subject and body from campaign templates."""
    startup = campaign.startup

    # Gather pitch details for personalisation
    pitch = startup.pitches.filter(is_draft=False).order_by("-pitched_at").first()
    raise_amount = f"${pitch.asking_amount:,.0f}" if (pitch and pitch.asking_amount) else "undisclosed"
    pitch_summary = (pitch.description[:300] if pitch and pitch.description else "")

    # Founder name from first team member
    founder = startup.team_members.filter(order=0).first()
    founder_name = founder.name if founder else startup.company_name

    ctx = {
        "investor_name": investor.full_name or "there",
        "company_name": startup.company_name,
        "industry": startup.industry or startup.niche or "technology",
        "stage": startup.funding_stage or "seed",
        "raise_amount": raise_amount,
        "pitch_summary": pitch_summary,
        "founder_name": founder_name,
    }

    def render(template: str) -> str:
        for key, val in ctx.items():
            template = template.replace(f"{{{{{key}}}}}", str(val))
        return template

    return render(campaign.subject_template), render(campaign.body_template)


@shared_task(
    bind=True,
    name="marketing.send_campaign_batch",
)
def send_campaign_batch(self, campaign_id: int) -> dict:
    """
    Send the next batch of pending outreach messages for a campaign.
    Respects max_outreach_per_day limit.
    """
    from django.utils import timezone

    from apps.marketing.models import OutreachCampaign, OutreachMessage

    try:
        campaign = OutreachCampaign.objects.get(pk=campaign_id, status="active")
    except OutreachCampaign.DoesNotExist:
        return {"error": "campaign_not_active"}

    # Count today's sends
    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_sent = OutreachMessage.objects.filter(
        campaign=campaign,
        sent_at__gte=today_start,
    ).count()

    remaining = campaign.max_outreach_per_day - today_sent
    if remaining <= 0:
        return {"campaign_id": campaign_id, "sent": 0, "reason": "daily_limit_reached"}

    pending = OutreachMessage.objects.filter(
        campaign=campaign, status="pending"
    ).select_related("investor")[:remaining]

    sent = 0
    for message in pending:
        # In production: integrate with email provider (SendGrid, SES, etc.)
        # For now: mark as sent immediately
        message.status = "sent"
        message.sent_at = timezone.now()
        message.save(update_fields=["status", "sent_at", "updated_at"])
        sent += 1

    # Update campaign metrics
    OutreachCampaign.objects.filter(pk=campaign_id).update(
        total_reached=campaign.total_reached + sent
    )

    # Mark complete if no more pending messages
    if not OutreachMessage.objects.filter(campaign=campaign, status="pending").exists():
        OutreachCampaign.objects.filter(pk=campaign_id).update(status="completed")

    logger.info("Campaign %s: sent %d messages", campaign_id, sent)
    return {"campaign_id": campaign_id, "sent": sent}


@shared_task(
    bind=True,
    name="marketing.send_all_active_campaigns",
)
def send_all_active_campaigns(self) -> dict:
    """Daily beat task: trigger send batches for every active campaign."""
    from apps.marketing.models import OutreachCampaign

    ids = list(OutreachCampaign.objects.filter(status="active").values_list("pk", flat=True))
    for campaign_id in ids:
        send_campaign_batch.delay(campaign_id)
    logger.info("Queued send batches for %d active campaigns", len(ids))
    return {"queued": len(ids)}
