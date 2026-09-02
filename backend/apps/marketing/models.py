"""
apps.marketing.models
======================
Automated Outreach & Campaign management.

OutreachCampaign  — startup-created campaign targeting a filtered set of investors
OutreachMessage   — individual personalised message instance per investor per campaign
"""
from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.users.models import InvestorProfile, StartupProfile


class OutreachCampaign(models.Model):
    """
    Automated investor outreach campaign created by a startup.
    The AI engine selects matching investors based on the targeting criteria
    and generates personalised messages for each.
    """

    STATUS_CHOICES = [
        ("draft", _("Draft")),
        ("active", _("Active")),
        ("paused", _("Paused")),
        ("completed", _("Completed")),
        ("archived", _("Archived")),
    ]

    startup: models.ForeignKey = models.ForeignKey(
        StartupProfile,
        on_delete=models.CASCADE,
        related_name="outreach_campaigns",
    )
    name: models.CharField = models.CharField(_("campaign name"), max_length=200)
    description: models.TextField = models.TextField(_("description"), blank=True)

    #  Targeting criteria 
    target_industries: models.JSONField = models.JSONField(
        default=list,
        help_text=_("List of target industry strings"),
    )
    target_investor_types: models.JSONField = models.JSONField(
        default=list,
        help_text=_("e.g. ['angel', 'vc', 'family_office']"),
    )
    target_stages: models.JSONField = models.JSONField(
        default=list,
        help_text=_("Preferred funding stages to target"),
    )
    target_locations: models.JSONField = models.JSONField(
        default=list,
        help_text=_("List of target geographic regions"),
    )
    min_ticket_size: models.DecimalField = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True
    )
    max_ticket_size: models.DecimalField = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True
    )
    min_compatibility_score: models.FloatField = models.FloatField(
        _("minimum compatibility score"),
        default=0.5,
        help_text=_("Only reach investors with match score above this threshold"),
    )

    #  Message template 
    subject_template: models.CharField = models.CharField(
        max_length=300,
        default="Investment opportunity: {{company_name}}",
        help_text=_("Use {{variable}} placeholders for personalisation"),
    )
    body_template: models.TextField = models.TextField(
        default=(
            "Hi {{investor_name}},\n\n"
            "I'm the founder of {{company_name}}, a {{industry}} startup "
            "raising {{raise_amount}} at the {{stage}} stage.\n\n"
            "{{pitch_summary}}\n\nWould you be open to a 20-minute call?\n\n"
            "Best,\n{{founder_name}}"
        ),
    )

    #  Schedule & limits 
    max_outreach_per_day: models.PositiveIntegerField = models.PositiveIntegerField(default=10)
    pause_on_interest: models.BooleanField = models.BooleanField(
        default=True,
        help_text=_("Pause campaign when investor shows interest (view / offer)"),
    )
    schedule: models.JSONField = models.JSONField(
        default=dict,
        help_text=_('{"days": ["Mon","Tue","Wed"], "time_utc": "09:00"}'),
    )

    #  Status & metrics 
    status: models.CharField = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="draft", db_index=True
    )
    total_reached: models.PositiveIntegerField = models.PositiveIntegerField(default=0)
    positive_responses: models.PositiveIntegerField = models.PositiveIntegerField(default=0)
    meetings_scheduled: models.PositiveIntegerField = models.PositiveIntegerField(default=0)

    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("outreach campaign")
        verbose_name_plural = _("outreach campaigns")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.startup.company_name} – {self.name} [{self.status}]"

    @property
    def response_rate(self) -> float:
        if not self.total_reached:
            return 0.0
        return round(self.positive_responses / self.total_reached, 4)


class OutreachMessage(models.Model):
    """
    Individual personalised outreach message sent to one investor within a campaign.
    """

    STATUS_CHOICES = [
        ("pending", _("Pending")),
        ("sent", _("Sent")),
        ("opened", _("Opened")),
        ("replied", _("Replied")),
        ("meeting_scheduled", _("Meeting Scheduled")),
        ("ignored", _("Ignored")),
        ("bounced", _("Bounced")),
        ("unsubscribed", _("Unsubscribed")),
    ]

    campaign: models.ForeignKey = models.ForeignKey(
        OutreachCampaign,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    investor: models.ForeignKey = models.ForeignKey(
        InvestorProfile,
        on_delete=models.CASCADE,
        related_name="outreach_messages",
    )

    subject: models.CharField = models.CharField(max_length=300)
    body: models.TextField = models.TextField()
    personalization_data: models.JSONField = models.JSONField(default=dict)

    status: models.CharField = models.CharField(
        max_length=25, choices=STATUS_CHOICES, default="pending", db_index=True
    )

    sent_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)
    opened_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)
    replied_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)

    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    updated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("outreach message")
        verbose_name_plural = _("outreach messages")
        unique_together = [["campaign", "investor"]]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Message to {self.investor} [{self.status}]"
