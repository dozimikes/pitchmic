from __future__ import annotations

import logging

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Count, Prefetch, QuerySet
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.models import StartupProfile, User

from .intelligence import PitchAnalyzer
from .models import Pitch, PitchLike
from .serializers import PitchListSerializer, PitchSerializer

logger = logging.getLogger(__name__)


class PitchViewSet(viewsets.ModelViewSet):
    queryset: QuerySet[Pitch] = Pitch.objects.all().select_related(
        "startup", "startup__user"
    ).prefetch_related("attachments")
    serializer_class = PitchSerializer
    permission_classes = (IsAuthenticated,)
    filterset_fields: tuple[str, ...] = ("startup", "is_draft")
    search_fields: tuple[str, ...] = ("title", "description")
    ordering_fields: tuple[str, ...] = ("created_at", "pitched_at", "like_count")

    def get_serializer_class(self) -> type:
        if self.action == "list":
            return PitchListSerializer
        return PitchSerializer

    def get_queryset(self) -> QuerySet[Pitch]:
        if getattr(self, "swagger_fake_view", False):
            return Pitch.objects.none()

        user: User = self.request.user  # type: ignore[assignment]

        # Build a filtered prefetch for the current user's likes so
        # get_is_liked_by_me can read from the prefetch cache (no extra queries).
        user_likes_prefetch = Prefetch(
            "likes",
            queryset=PitchLike.objects.filter(user=user),
            to_attr="user_likes",
        )

        queryset: QuerySet[Pitch] = super().get_queryset().annotate(
            like_count=Count("likes", distinct=True),
            offers_count=Count("offers", distinct=True),
        ).prefetch_related(user_likes_prefetch)

        # ?mine=true — scope to the current user's own startup pitches
        mine: str | None = self.request.query_params.get("mine")
        if mine and mine.lower() in ("1", "true", "yes"):
            try:
                profile: StartupProfile = user.startup_profile  # type: ignore[attr-defined]
                queryset = queryset.filter(startup=profile)
            except (StartupProfile.DoesNotExist, ObjectDoesNotExist):
                return queryset.none()
            # mine=true returns all (including drafts)
            return queryset.order_by("-created_at")

        # Default list view: only published (non-draft) pitches
        if self.action == "list":
            return queryset.filter(is_draft=False)
        return queryset

    def create(self, request, *args, **kwargs):
        """Override to log validation errors so we can diagnose 400s easily."""
        logger.debug("Pitch CREATE payload: %s", dict(request.data))
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            logger.error(
                "Pitch CREATE validation FAILED. "
                "Full payload=%s. Errors=%s",
                dict(request.data),
                serializer.errors,
            )
            from rest_framework import status as drf_status
            from rest_framework.response import Response as DRFResponse
            return DRFResponse(serializer.errors, status=drf_status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        from rest_framework import status as drf_status
        from rest_framework.response import Response as DRFResponse
        return DRFResponse(serializer.data, status=drf_status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer: PitchSerializer) -> None:
        try:
            startup_profile: StartupProfile = self.request.user.startup_profile  # type: ignore[attr-defined]
        except (StartupProfile.DoesNotExist, ObjectDoesNotExist) as e:
            raise PermissionDenied(
                "Only startup users can create pitches. "
                "Please complete your startup profile before creating a pitch."
            ) from e
        # Automatically record publication timestamp when pitch goes live
        extra: dict = {"startup": startup_profile}
        is_draft = serializer.validated_data.get("is_draft", True)
        if not is_draft and "pitched_at" not in serializer.validated_data:
            extra["pitched_at"] = timezone.now()
        serializer.save(**extra)

    def perform_update(self, serializer: PitchSerializer) -> None:
        pitch: Pitch = self.get_object()
        if pitch.startup.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only update your own pitches.")
        serializer.save()

    def perform_destroy(self, instance: Pitch) -> None:
        if instance.startup.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only delete your own pitches.")
        instance.delete()

    @action(detail=True, methods=["post", "delete"], url_path="like")
    def like(self, request, pk=None) -> Response:
        pitch: Pitch = self.get_object()
        user: User = request.user

        if request.method == "POST":
            with transaction.atomic():
                _, created = PitchLike.objects.get_or_create(
                    pitch=pitch,
                    user=user,
                )
                status_code: int = status.HTTP_201_CREATED if created else status.HTTP_200_OK
                message: str = "Pitch liked." if created else "Already liked."

            return Response(
                {
                    "message": message,
                    "like_count": pitch.likes.count(),
                },
                status=status_code,
            )

        if request.method == "DELETE":
            deleted_count, _ = PitchLike.objects.filter(pitch=pitch, user=user).delete()
            if deleted_count == 0:
                return Response(
                    {"message": "Like not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return Response(
                {
                    "message": "Pitch unliked.",
                    "like_count": pitch.likes.count(),
                },
                status=status.HTTP_200_OK,
            )

        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=True, methods=["post"], url_path="analyze")
    def analyze(self, request, pk=None) -> Response:
        """
        POST /api/v1/pitches/{id}/analyze/
        Comprehensive quality analysis using rule-based scoring.
        Accessible to the pitch owner or any authenticated investor.
        """
        pitch: Pitch = self.get_object()
        analyzer = PitchAnalyzer()
        report = analyzer.analyze(pitch)
        return Response(report, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="enhance")
    def enhance(self, request, pk=None) -> Response:
        """
        POST /api/v1/pitches/{id}/enhance/
        AI-generated improvement suggestions (LLM when configured, heuristic fallback).
        Only the startup that owns the pitch may call this.
        """
        pitch: Pitch = self.get_object()

        if request.user.role == User.ROLE_STARTUP:
            try:
                startup: StartupProfile = request.user.startup_profile  # type: ignore[attr-defined]
                if pitch.startup_id != startup.pk:
                    raise PermissionDenied("You can only enhance your own pitches.")
            except (StartupProfile.DoesNotExist, ObjectDoesNotExist) as exc:
                raise PermissionDenied("Complete your startup profile first.") from exc

        analyzer = PitchAnalyzer()
        result = analyzer.enhance(pitch)
        return Response(result, status=status.HTTP_200_OK)
