from __future__ import annotations

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q, QuerySet
from rest_framework import generics, pagination
from rest_framework.permissions import IsAuthenticated

from apps.users.models import User

from .models import Activity
from .serializers import ActivitySerializer


class FeedPagination(pagination.PageNumberPagination):
    page_size: int = 30
    page_size_query_param: str = "page_size"
    max_page_size: int = 100


class ActivityFeedView(generics.ListAPIView):
    serializer_class = ActivitySerializer
    permission_classes = (IsAuthenticated,)
    pagination_class = FeedPagination

    def get_queryset(self) -> QuerySet[Activity]:
        if getattr(self, "swagger_fake_view", False):
            return Activity.objects.none()

        user: User = self.request.user  # type: ignore[assignment]
        verb: str | None = self.request.query_params.get("verb")

        queryset: QuerySet[Activity] = Activity.objects.select_related(
            "actor",
            "target_content_type",
            "action_object_content_type",
        )

        # Role-specific filtering:
        # - Investors see pitch-related events (new pitches, likes) and their own offer events
        # - Startups see offer events on their pitches and team/company events for their own startup
        # - Admins see everything
        if not user.is_staff:
            if user.role == User.ROLE_INVESTOR:
                queryset = queryset.filter(
                    Q(verb__in=(
                        Activity.VERB_PITCH_CREATED,
                        Activity.VERB_PITCH_UPDATED,
                        Activity.VERB_PITCH_LIKED,
                        Activity.VERB_STARTUP_JOINED,
                        Activity.VERB_INVESTOR_JOINED,
                    ))
                    | Q(verb__in=(
                        Activity.VERB_OFFER_MADE,
                        Activity.VERB_OFFER_ACCEPTED,
                        Activity.VERB_OFFER_REJECTED,
                        Activity.VERB_OFFER_NEGOTIATING,
                    ), actor=user)
                )
            elif user.role == User.ROLE_STARTUP:
                queryset = queryset.filter(
                    Q(verb__in=(
                        Activity.VERB_STARTUP_JOINED,
                        Activity.VERB_INVESTOR_JOINED,
                        Activity.VERB_TEAM_MEMBER_ADDED,
                    ), actor=user)
                    | Q(verb__in=(
                        Activity.VERB_OFFER_MADE,
                        Activity.VERB_OFFER_ACCEPTED,
                        Activity.VERB_OFFER_REJECTED,
                        Activity.VERB_OFFER_NEGOTIATING,
                    ))
                    | Q(verb__in=(
                        Activity.VERB_PITCH_CREATED,
                        Activity.VERB_PITCH_UPDATED,
                        Activity.VERB_PITCH_LIKED,
                    ), actor=user)
                )

        if verb:
            queryset = queryset.filter(verb=verb)

        return queryset.order_by("-created_at")
