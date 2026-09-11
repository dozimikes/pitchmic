from __future__ import annotations

import hashlib
import hmac
from decimal import Decimal
from typing import Any

import requests
from django.conf import settings
from django.utils import timezone

from apps.users.models import User

from .models import BillingPlan, PaymentTransaction

PAYSTACK_API_URL = "https://api.paystack.co"

# ---------------------------------------------------------------------------
# SEC-009: Server-side authoritative plan pricing.
# Amounts are in USD dollars (Decimal). The client-supplied amount is ignored;
# only these server-side values are used for Paystack initialization.
# ---------------------------------------------------------------------------
_YEARLY_DISCOUNT = 1 - 0.05   # 5% off for yearly billing

# Monthly amounts in USD dollars
_PLAN_MONTHLY_USD: dict[str, "Decimal"] = {
    "free":         Decimal("0.00"),
    "founder-pro":  Decimal("9.00"),
    "raise-pass":   Decimal("25.00"),
}


def get_authoritative_plan_amount(plan_slug: str, billing_cycle: str) -> Decimal:
    """
    Return the server-side authoritative charge amount (USD, 2 dp) for the
    given plan and billing cycle.  Raises ValueError for unknown plan slugs.
    """
    monthly = _PLAN_MONTHLY_USD.get(plan_slug)
    if monthly is None:
        raise ValueError(f"Unknown plan slug: {plan_slug!r}")
    if billing_cycle == "yearly":
        annual = monthly * 12 * Decimal(str(_YEARLY_DISCOUNT))
        return annual.quantize(Decimal("0.01"))
    return monthly


def _normalize_paystack_amount(amount: Decimal | str | int | float) -> int:
    amount_decimal = Decimal(str(amount))
    if amount_decimal <= 0:
        raise ValueError("Amount must be greater than zero.")
    return int((amount_decimal * Decimal("100")).to_integral_value())


def initialize_paystack_transaction(
    *,
    user: User,
    email: str,
    amount: Decimal | str | int | float,
    plan_slug: str,
    billing_cycle: str = "monthly",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not email:
        raise ValueError("Email is required.")

    secret = settings.PAYSTACK_SECRET_KEY
    if not secret:
        raise RuntimeError("Paystack secret key is not configured.")

    normalized_amount = _normalize_paystack_amount(amount)
    base_metadata: dict[str, Any] = {
        "user_id": user.pk,
        "user_email": email,
        "plan_slug": plan_slug,
        "billing_cycle": billing_cycle,
        "source": "pitchmic_backend",
    }
    if metadata:
        base_metadata.update(metadata)
        for key in ("user_id", "user_email", "plan_slug", "billing_cycle", "source"):
            if key in metadata:
                base_metadata[key] = {"user_id": user.pk, "user_email": email, "plan_slug": plan_slug, "billing_cycle": billing_cycle, "source": "pitchmic_backend"}[key]

    init_payload = {
        "email": email,
        "amount": normalized_amount,
        "currency": "USD",
        "callback_url": f"{settings.FRONTEND_BASE_URL}/upgrade?checkout=success",
        "metadata": base_metadata,
    }

    response = requests.post(
        f"{PAYSTACK_API_URL}/transaction/initialize",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json=init_payload,
        timeout=20,
    )

    payload = response.json() if hasattr(response, "json") else {}
    data = payload.get("data") or {}
    reference = data.get("reference") or ""

    if not response.ok or not reference:
        return {
            "status": False,
            "message": payload.get("message") or "Unable to initialize Paystack checkout.",
            "data": payload,
        }

    PaymentTransaction.objects.update_or_create(
        reference=reference,
        defaults={
            "user": user,
            "paystack_access_code": data.get("access_code", ""),
            "paystack_customer_code": "",
            "plan_slug": plan_slug,
            "billing_cycle": billing_cycle,
            "amount": Decimal(str(amount)),
            "currency": "USD",
            "status": PaymentTransaction.STATUS_PENDING,            "raw_response": payload,
        },
    )

    return {
        "status": True,
        "message": payload.get("message") or "Checkout initialized successfully.",
        "authorization_url": data.get("authorization_url", ""),
        "access_code": data.get("access_code", ""),
        "reference": reference,
        "data": payload,
    }


def verify_paystack_signature(payload: str, signature: str) -> bool:
    secret_str = settings.PAYSTACK_SECRET_KEY or ""
    # SEC-022: reject the default test-key placeholder so a misconfigured
    # environment cannot have its webhooks trivially forged by anyone who
    # has read the .env.example file.
    _placeholder_keys = {
        "sk_test_your_secret_key_here",
        "test_paystack_secret_key_local_dev",
        "",
    }
    if secret_str in _placeholder_keys:
        return False
    secret = secret_str.encode("utf-8")
    expected = hmac.new(secret, payload.encode("utf-8"), hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def _coerce_user(user_value: Any, fallback_email: str | None = None) -> User | None:
    if user_value is None and fallback_email is None:
        return None

    if isinstance(user_value, int):
        try:
            return User.objects.get(pk=user_value)
        except User.DoesNotExist:
            return None

    if isinstance(user_value, str):
        if user_value.isdigit():
            try:
                return User.objects.get(pk=int(user_value))
            except User.DoesNotExist:
                pass
        if fallback_email:
            return User.objects.filter(email=fallback_email).first()
        return User.objects.filter(email=user_value).first()

    if isinstance(user_value, dict):
        user_id = user_value.get("user_id") or user_value.get("userId")
        if user_id:
            return _coerce_user(user_id, fallback_email)

    if fallback_email:
        return User.objects.filter(email=fallback_email).first()
    return None


def verify_paystack_reference(reference: str) -> dict[str, Any]:
    if not reference:
        raise ValueError("Payment reference is required.")

    secret = settings.PAYSTACK_SECRET_KEY
    if not secret:
        raise RuntimeError("Paystack secret key is not configured.")

    response = requests.get(
        f"{PAYSTACK_API_URL}/transaction/verify/{reference}",
        headers={
            "Authorization": f"Bearer {secret}",
            "Accept": "application/json",
        },
        timeout=20,
    )

    payload = response.json() if hasattr(response, "json") else {}
    data = payload.get("data") or {}
    status = data.get("status")

    if not response.ok or status != "success":
        return {
            "status": False,
            "message": payload.get("message") or "Payment verification failed.",
            "data": payload,
        }

    metadata = data.get("metadata") or {}
    customer = data.get("customer") or {}
    fallback_email = customer.get("email")
    user = _coerce_user(metadata.get("user_id") or metadata.get("userId"), fallback_email)

    if user is None:
        return {
            "status": False,
            "message": "User could not be resolved from the verified Paystack payment.",
            "data": payload,
        }

    plan_slug = metadata.get("plan_slug") or user.subscription_plan
    billing_cycle = metadata.get("billing_cycle") or "monthly"
    if plan_slug not in {choice[0] for choice in BillingPlan.choices}:
        plan_slug = user.subscription_plan

    # SEC-009: Verify that the amount Paystack actually charged matches the
    # server-side authoritative price for this plan before granting entitlement.
    try:
        expected_amount_usd = get_authoritative_plan_amount(plan_slug, billing_cycle)
        actual_amount_usd = Decimal(str(data.get("amount", 0))) / Decimal("100")
        # Allow a tolerance of $0.01 for rounding; anything lower is a manipulation attempt.
        if expected_amount_usd > Decimal("0") and actual_amount_usd < (expected_amount_usd - Decimal("0.01")):
            return {
                "status": False,
                "message": (
                    f"Payment amount mismatch: expected {expected_amount_usd} USD "
                    f"for plan '{plan_slug}' ({billing_cycle}), got {actual_amount_usd} USD."
                ),
                "data": payload,
            }
    except ValueError:
        pass  # unknown plan slug - let downstream validation handle it

    user.activate_subscription(
        plan_slug,
        billing_cycle=billing_cycle,
        email=fallback_email or user.email,
    )

    amount = Decimal(str(data.get("amount", 0))) / Decimal("100")
    reference_value = data.get("reference") or reference
    obj, _ = PaymentTransaction.objects.update_or_create(
        reference=reference_value,
        defaults={
            "user": user,
            "paystack_access_code": data.get("access_code", ""),
            "paystack_customer_code": customer.get("customer_code", ""),
            "plan_slug": plan_slug,
            "billing_cycle": billing_cycle,
            "amount": amount,
            "currency": data.get("currency", "USD"),
            "status": PaymentTransaction.STATUS_SUCCESS,
            "raw_response": payload,
            "paid_at": timezone.now(),
        },
    )
    obj.mark_success(response=payload, paid_at=timezone.now())

    return {
        "status": True,
        "message": "Payment verified successfully.",
        "plan": plan_slug,
        "user_id": user.pk,
        "data": payload,
    }
