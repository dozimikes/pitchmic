"""
apps.dataroom.views
===================
REST endpoints for the Smart Data Room.

Startup-side
  POST /api/v1/dataroom/documents/           - add a document
  PATCH/DELETE /api/v1/dataroom/documents/{pk}/ - manage documents
  POST /api/v1/dataroom/access/grant/        - grant investor access
  GET  /api/v1/dataroom/access/              - list all grants for my startup
  PATCH /api/v1/dataroom/access/{pk}/        - update permissions
  POST /api/v1/dataroom/access/{pk}/revoke/  - revoke access

Investor-side
  GET  /api/v1/dataroom/my-access/           - my active access grants
  GET  /api/v1/dataroom/documents/view/{pk}/ - view a document (records analytics)
  POST /api/v1/dataroom/access/{pk}/sign-nda/ - sign NDA to unlock financials/legal
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import InvestorProfile, StartupProfile, User

from .models import DataRoomAccess, DataRoomDocument
from .serializers import (
    DataRoomAccessGrantSerializer,
    DataRoomAccessSerializer,
    DataRoomDocumentSerializer,
    NDAsignSerializer,
)


#  Document CRUD 

class DataRoomDocumentListCreateView(generics.ListCreateAPIView):
    serializer_class = DataRoomDocumentSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        user: User = self.request.user
        if user.role == User.ROLE_STARTUP:
            return DataRoomDocument.objects.filter(startup__user=user)
        # Investors: only see docs for startups they have active access to
        try:
            investor = user.investor_profile
        except InvestorProfile.DoesNotExist:
            return DataRoomDocument.objects.none()
        active_startups = DataRoomAccess.objects.filter(
            investor=investor, status="active"
        ).values_list("startup_id", flat=True)
        return DataRoomDocument.objects.filter(
            startup_id__in=active_startups, is_active=True
        )

    def perform_create(self, serializer):
        if self.request.user.role != User.ROLE_STARTUP:
            raise PermissionDenied("Only startup accounts can add data room documents.")
        try:
            startup = self.request.user.startup_profile
        except StartupProfile.DoesNotExist:
            raise PermissionDenied("Complete your startup profile first.")
        serializer.save(startup=startup)


class DataRoomDocumentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DataRoomDocumentSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return DataRoomDocument.objects.filter(startup__user=self.request.user)


class DataRoomDocumentViewView(APIView):
    """Investor views a specific document - checks permissions and logs the event."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, pk: int) -> Response:
        try:
            doc = DataRoomDocument.objects.select_related("startup").get(pk=pk, is_active=True)
        except DataRoomDocument.DoesNotExist:
            raise NotFound("Document not found.")

        if request.user.role != User.ROLE_INVESTOR:
            raise PermissionDenied("Only investors can view data room documents.")

        try:
            investor = request.user.investor_profile
        except InvestorProfile.DoesNotExist:
            raise PermissionDenied("Complete your investor profile first.")

        try:
            access = DataRoomAccess.objects.get(startup=doc.startup, investor=investor)
        except DataRoomAccess.DoesNotExist:
            raise PermissionDenied("You do not have access to this data room.")

        if not access.can_view_category(doc.category):
            raise PermissionDenied("Access to this document category is restricted.")

        # Record analytics
        duration = request.data.get("duration_seconds") if request.method == "POST" else None
        access.log_view(doc.category, duration)

        return Response(DataRoomDocumentSerializer(doc).data)


#  Access management 

class GrantAccessView(APIView):
    """Startup grants an investor access to their data room."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        if request.user.role != User.ROLE_STARTUP:
            raise PermissionDenied("Only startup accounts can grant data room access.")

        serializer = DataRoomAccessGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            startup = request.user.startup_profile
        except StartupProfile.DoesNotExist:
            raise PermissionDenied("Complete your startup profile first.")

        try:
            investor = InvestorProfile.objects.get(pk=data["investor_id"])
        except InvestorProfile.DoesNotExist:
            return Response({"detail": "Investor not found."}, status=status.HTTP_404_NOT_FOUND)

        expires = timezone.now() + timezone.timedelta(hours=data["access_hours"])
        watermark = f"{investor.full_name} – CONFIDENTIAL – {timezone.now():%Y-%m-%d}"

        access, _ = DataRoomAccess.objects.update_or_create(
            startup=startup,
            investor=investor,
            defaults={
                "status": "pending_nda" if data["nda_required"] else "active",
                "access_expires_at": expires,
                "nda_required": data["nda_required"],
                "can_view_financials": data["can_view_financials"],
                "can_view_legal": data["can_view_legal"],
                "can_view_technical": data["can_view_technical"],
                "watermark_text": watermark,
                "ip_address": request.META.get("REMOTE_ADDR"),
            },
        )
        return Response(DataRoomAccessSerializer(access).data, status=status.HTTP_201_CREATED)


class DataRoomAccessListView(generics.ListAPIView):
    """Startup: list all access grants for my data room."""

    serializer_class = DataRoomAccessSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        if self.request.user.role != User.ROLE_STARTUP:
            raise PermissionDenied("Only startup accounts can view their access grants.")
        return DataRoomAccess.objects.filter(startup__user=self.request.user).select_related("investor", "startup")


class MyDataRoomAccessView(generics.ListAPIView):
    """Investor: list all my active data room accesses."""

    serializer_class = DataRoomAccessSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        if self.request.user.role != User.ROLE_INVESTOR:
            raise PermissionDenied("Only investors can view their data room access list.")
        try:
            investor = self.request.user.investor_profile
        except InvestorProfile.DoesNotExist:
            return DataRoomAccess.objects.none()
        return DataRoomAccess.objects.filter(investor=investor).select_related("startup", "investor")


class RevokeAccessView(APIView):
    """Startup revokes an investor's data room access."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, pk: int) -> Response:
        try:
            access = DataRoomAccess.objects.select_related("startup").get(pk=pk)
        except DataRoomAccess.DoesNotExist:
            raise NotFound("Access grant not found.")

        if access.startup.user != request.user:
            raise PermissionDenied("You can only revoke access for your own data room.")

        access.status = "revoked"
        access.save(update_fields=["status", "updated_at"])
        return Response({"message": "Access revoked.", "id": pk})


class SignNDAView(APIView):
    """Investor signs the NDA to unlock financials/legal documents."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, pk: int) -> Response:
        try:
            access = DataRoomAccess.objects.get(pk=pk)
        except DataRoomAccess.DoesNotExist:
            raise NotFound("Access grant not found.")

        if access.investor.user != request.user:
            raise PermissionDenied("You can only sign NDAs for your own access grants.")

        serializer = NDAsignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        access.nda_signed_at = timezone.now()
        access.nda_version = serializer.validated_data["nda_version"]
        if access.status == "pending_nda":
            access.status = "active"
        access.save(update_fields=["nda_signed_at", "nda_version", "status", "updated_at"])

        return Response({
            "message": "NDA signed. Expanded access is now active.",
            "access": DataRoomAccessSerializer(access).data,
        })


class SlideTelemetryView(APIView):
    """
    POST /api/v1/dataroom/telemetry/
    Records per-slide viewing telemetry.
    GET /api/v1/dataroom/telemetry/<document_id>/
    Retrieves slide engagement heatmap & drop-off analytics for a pitch deck.

    SEC-004: Requires authentication. Startup owners see their own doc analytics;
    investors see analytics for docs they have active access to.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        from apps.dataroom.models import DataRoomDocument, SlideEngagementLog

        doc_id = request.data.get("document_id")
        # SEC-004 / SEC-012: reject requests with no document_id; never fall
        # back to .objects.first() which would corrupt a random document's stats.
        if not doc_id:
            return Response(
                {"detail": "document_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            doc = DataRoomDocument.objects.get(pk=doc_id, is_active=True)
        except DataRoomDocument.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        # Verify the requesting user has access to this document
        user: User = request.user
        if user.role == User.ROLE_STARTUP:
            if doc.startup.user != user:
                raise PermissionDenied("You can only record telemetry for your own documents.")
        elif user.role == User.ROLE_INVESTOR:
            try:
                investor = user.investor_profile
                DataRoomAccess.objects.get(startup=doc.startup, investor=investor, status="active")
            except (InvestorProfile.DoesNotExist, DataRoomAccess.DoesNotExist):
                raise PermissionDenied("You do not have active access to this document.")
        elif not (user.is_staff or user.is_superuser):
            raise PermissionDenied("Access denied.")

        email = request.data.get("viewer_email") or user.email
        slide_num = int(request.data.get("slide_number", 1))
        duration = float(request.data.get("duration_seconds", 5.0))
        completed = bool(request.data.get("completed_deck", False))

        SlideEngagementLog.objects.create(
            document=doc,
            viewer_email=email,
            slide_number=slide_num,
            duration_seconds=duration,
            completed_deck=completed,
        )

        return Response({
            "status": "telemetry_recorded",
            "slide_number": slide_num,
            "duration_seconds": duration,
        }, status=status.HTTP_201_CREATED)

    def get(self, request: Request, pk: int) -> Response:
        from apps.dataroom.models import DataRoomDocument, SlideEngagementLog
        from django.db.models import Avg, Count

        try:
            doc = DataRoomDocument.objects.select_related("startup").get(pk=pk, is_active=True)
        except DataRoomDocument.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        # Only the startup owner or staff may see the full heatmap analytics
        user: User = request.user
        if user.role == User.ROLE_STARTUP:
            if doc.startup.user != user:
                raise PermissionDenied("You can only view analytics for your own documents.")
        elif not (user.is_staff or user.is_superuser):
            raise PermissionDenied("Only the document owner or staff may view telemetry analytics.")

        logs = SlideEngagementLog.objects.filter(document_id=pk)
        if not logs.exists():
            return Response({
                "document_id": pk,
                "total_viewers": 0,
                "completion_rate": "0%",
                "slide_heatmap": [],
            })

        summary = (
            logs.values("slide_number", "slide_title")
            .annotate(avg_seconds=Avg("duration_seconds"), views=Count("id"))
            .order_by("slide_number")
        )
        return Response({
            "document_id": pk,
            "total_logs": logs.count(),
            "slide_heatmap": list(summary),
        })

