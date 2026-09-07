from __future__ import annotations

from unittest.mock import Mock, patch

import pytest
from django.urls import reverse
from rest_framework import status

from apps.billing.models import PaymentTransaction
from apps.users.models import User


@pytest.mark.django_db
class TestBillingSubscriptionFlow:
    def test_user_activate_subscription_updates_plan_state(self):
        user = User.objects.create_user(email="founder@example.com", password="secret")

        user.activate_subscription(
            User.SUBSCRIPTION_FOUNDER_PRO,
            billing_cycle="monthly",
            email="founder@example.com",
        )

        assert user.subscription_plan == User.SUBSCRIPTION_FOUNDER_PRO
        assert user.subscription_status == User.SUBSCRIPTION_STATUS_ACTIVE
        assert user.subscription_started_at is not None
        assert user.subscription_expires_at is not None
        assert user.paystack_email == "founder@example.com"

    @patch("apps.billing.services.requests.get")
    def test_verify_paystack_reference_updates_user_subscription(self, mock_get):
        user = User.objects.create_user(email="paystack@example.com", password="secret")
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "status": True,
            "message": "Verification successful",
            "data": {
                "status": "success",
                "reference": "ref_123",
                "customer": {"email": "paystack@example.com"},
                "amount": 90000,
                "currency": "NGN",
                "metadata": {
                    "plan_slug": "founder-pro",
                    "billing_cycle": "monthly",
                    "user_id": user.pk,
                },
            },
        }
        mock_get.return_value = mock_response

        from apps.billing.services import verify_paystack_reference

        result = verify_paystack_reference("ref_123")

        assert result["status"] is True
        user.refresh_from_db()
        assert user.subscription_plan == User.SUBSCRIPTION_FOUNDER_PRO
        assert user.subscription_status == User.SUBSCRIPTION_STATUS_ACTIVE

    @patch("apps.billing.services.requests.post")
    def test_initialize_paystack_transaction_creates_pending_record(self, mock_post):
        user = User.objects.create_user(email="checkout@example.com", password="secret")
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "status": True,
            "message": "Authorization URL generated",
            "data": {
                "authorization_url": "https://checkout.paystack.com/authorized",
                "access_code": "access_code_123",
                "reference": "ref_init_123",
            },
        }
        mock_post.return_value = mock_response

        from apps.billing.services import initialize_paystack_transaction

        result = initialize_paystack_transaction(
            user=user,
            email="checkout@example.com",
            amount=900,
            plan_slug=User.SUBSCRIPTION_FOUNDER_PRO,
            billing_cycle="monthly",
            metadata={"source": "upgrade_page", "plan_slug": "raise-pass", "user_id": 999},
        )

        assert result["status"] is True
        assert result["reference"] == "ref_init_123"
        transaction = PaymentTransaction.objects.get(reference="ref_init_123")
        assert transaction.user == user
        assert transaction.status == PaymentTransaction.STATUS_PENDING
        assert transaction.paystack_access_code == "access_code_123"
        assert transaction.amount == 900
        assert result["data"]["metadata"]["plan_slug"] == User.SUBSCRIPTION_FOUNDER_PRO
        assert result["data"]["metadata"]["user_id"] == user.pk

    def test_verify_endpoint_requires_reference(self, api_client):
        api_client.force_authenticate(user=User.objects.create_user(email="ok@example.com", password="secret"))

        response = api_client.post(reverse("billing-paystack-verify"), {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
