from __future__ import annotations

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.models import User

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset: QuerySet[Notification] = Notification.objects.select_related(
        "in_app", "email"
    ).all()
    serializer_class = NotificationSerializer
    permission_classes = (IsAuthenticated,)
    filterset_fields: tuple[str, ...] = ("notification_type", "category", "read_at")
    ordering_fields: tuple[str, ...] = ("created_at", "read_at")

    def get_queryset(self) -> QuerySet[Notification]:
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()

        queryset: QuerySet[Notification] = super().get_queryset()
        user: User = self.request.user
        queryset = queryset.filter(user=user)

        unread_only: str | None = self.request.query_params.get("unread_only")
        if unread_only and unread_only.lower() in ("true", "1", "yes"):
            queryset = queryset.filter(read_at__isnull=True)

        return queryset

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request) -> Response:
        user: User = request.user
        with transaction.atomic():
            updated_count: int = Notification.objects.filter(
                user=user,
                read_at__isnull=True,
            ).update(
                read_at=timezone.now(),
                updated_at=timezone.now(),
            )
        return Response(
            {
                "message": "All notifications marked as read.",
                "updated_count": updated_count,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None) -> Response:
        notification: Notification = self.get_object()
        if notification.user != request.user:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only mark your own notifications as read.")

        notification.mark_as_read()
        serializer = self.get_serializer(notification)
        return Response(
            {
                "message": "Notification marked as read.",
                "notification": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="mark-unread")
    def mark_unread(self, request, pk=None) -> Response:
        notification: Notification = self.get_object()
        if notification.user != request.user:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only mark your own notifications as unread.")

        notification.mark_as_unread()
        serializer = self.get_serializer(notification)
        return Response(
            {
                "message": "Notification marked as unread.",
                "notification": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request) -> Response:
        user: User = request.user
        count: int = Notification.objects.filter(
            user=user,
            read_at__isnull=True,
        ).count()
        return Response(
            {
                "unread_count": count,
            },
            status=status.HTTP_200_OK,
        )
