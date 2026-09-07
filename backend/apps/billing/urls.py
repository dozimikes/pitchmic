from __future__ import annotations

from django.urls import path

from .views import PaystackInitializeView, PaystackWebhookView, PaystackVerifyView

urlpatterns = [
    path("paystack/initialize/", PaystackInitializeView.as_view(), name="billing-paystack-initialize"),
    path("paystack/webhook/", PaystackWebhookView.as_view(), name="billing-paystack-webhook"),
    path("paystack/verify/", PaystackVerifyView.as_view(), name="billing-paystack-verify"),
]
