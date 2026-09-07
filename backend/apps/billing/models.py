from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class BillingPlan(models.TextChoices):
    FREE = "free", _("Free")
    FOUNDER_PRO = "founder-pro", _("Founder Pro")
    RAISE_PASS = "raise-pass", _("Raise Pass")


class PaymentTransaction(models.Model):
    STATUS_PENDING = "pending"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"
    STATUS_CHOICES: tuple[tuple[str, str], ...] = (
        (STATUS_PENDING, _("Pending")),
        (STATUS_SUCCESS, _("Success")),
        (STATUS_FAILED, _("Failed")),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="billing_transactions",
    )
    reference = models.CharField(max_length=255, unique=True, db_index=True)
    paystack_access_code = models.CharField(max_length=255, blank=True, default="")
    paystack_customer_code = models.CharField(max_length=255, blank=True, default="")
    plan_slug = models.CharField(max_length=32, choices=BillingPlan.choices, default=BillingPlan.FREE)
    billing_cycle = models.CharField(max_length=20, default="monthly")
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="NGN")
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default=STATUS_PENDING)
    raw_response = models.JSONField(default=dict, blank=True)
    paid_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.user.email}::{self.reference}::{self.status}"

    def mark_success(self, *, response: dict | None = None, paid_at: timezone.datetime | None = None) -> None:
        self.status = self.STATUS_SUCCESS
        self.paid_at = paid_at or timezone.now()
        if response:
            self.raw_response = response
        self.save(update_fields=["status", "paid_at", "raw_response", "updated_at"])
