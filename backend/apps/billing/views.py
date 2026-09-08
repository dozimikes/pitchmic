from __future__ import annotations

import json
from typing import Any

from django.http import HttpRequest, JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .services import (
    initialize_paystack_transaction,
    verify_paystack_reference,
    verify_paystack_signature,
)


class PaystackInitializeView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: HttpRequest, *args: Any, **kwargs) -> Response:
        plan_slug = (request.data.get("plan_slug") or request.data.get("planSlug") or "").strip()
        email = (request.data.get("email") or request.user.email or "").strip()
        billing_cycle = (request.data.get("billing_cycle") or request.data.get("billingCycle") or "monthly").strip()
        metadata = request.data.get("metadata") or {}

        if not plan_slug:
            return Response({"status": False, "message": "Plan is required."}, status=status.HTTP_400_BAD_REQUEST)

        # SEC-009: Derive the authoritative amount entirely server-side.
        # Never accept amount from the client — a client could send $0.01 for a
        # $25 plan and we would initialize a Paystack transaction for that amount.
        from .services import get_authoritative_plan_amount
        try:
            authoritative_amount = get_authoritative_plan_amount(plan_slug, billing_cycle)
        except ValueError as exc:
            return Response({"status": False, "message": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Free plan — no payment required
        if authoritative_amount == 0:
            return Response(
                {"status": True, "message": "Free plan — no payment required.", "reference": None},
                status=status.HTTP_200_OK,
            )

        try:
            result = initialize_paystack_transaction(
                user=request.user,
                email=email,
                amount=authoritative_amount,
                plan_slug=plan_slug,
                billing_cycle=billing_cycle,
                metadata=metadata if isinstance(metadata, dict) else {},
            )
        except Exception as exc:  # pragma: no cover - defensive runtime path
            return Response({"status": False, "message": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if not result.get("status"):
            return Response({"status": False, "message": result.get("message", "Payment initialization failed.")}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "status": True,
            "message": result.get("message"),
            "authorization_url": result.get("authorization_url"),
            "access_code": result.get("access_code"),
            "reference": result.get("reference"),
        }, status=status.HTTP_200_OK)


class PaystackVerifyView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: HttpRequest, *args: Any, **kwargs) -> Response:
        reference = (request.data.get("reference") or request.data.get("reference_code") or "").strip()
        if not reference:
            return Response({"status": False, "message": "Payment reference is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = verify_paystack_reference(reference)
        except Exception as exc:  # pragma: no cover - defensive runtime path
            return Response({"status": False, "message": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if not result.get("status"):
            return Response({"status": False, "message": result.get("message", "Payment verification failed.")}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(pk=request.user.pk).first()
        return Response({
            "status": True,
            "message": result.get("message"),
            "plan": user.subscription_plan if user else None,
            "subscription_status": user.subscription_status if user else None,
        }, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class PaystackWebhookView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request: HttpRequest, *args: Any, **kwargs) -> JsonResponse:
        payload = request.body.decode("utf-8")
        signature = request.headers.get("x-paystack-signature", "")

        if not signature:
            return JsonResponse({"status": False, "message": "Missing Paystack signature."}, status=400)

        if not verify_paystack_signature(payload, signature):
            return JsonResponse({"status": False, "message": "Invalid Paystack signature."}, status=401)

        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            return JsonResponse({"status": False, "message": "Invalid JSON payload."}, status=400)

        event_type = event.get("event")
        data = event.get("data") or {}
        reference = data.get("reference")
        if event_type == "charge.success" and reference:
            verify_paystack_reference(reference)
            return JsonResponse({"status": True, "message": "Webhook processed successfully."}, status=200)

        return JsonResponse({"status": True, "message": "Ignored event."}, status=200)
