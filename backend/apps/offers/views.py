from __future__ import annotations

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.models import InvestorProfile, StartupProfile, User

from .models import Offer
from .push import push_offer_created, push_offer_update
from .serializers import OfferSerializer


class OfferViewSet(viewsets.ModelViewSet):
    queryset: QuerySet[Offer] = Offer.objects.all().select_related(
        "investor", "investor__user", "pitch", "pitch__startup", "pitch__startup__user"
    )
    serializer_class = OfferSerializer
    permission_classes = (IsAuthenticated,)
    filterset_fields: tuple[str, ...] = ("status", "investor", "pitch")
    ordering_fields: tuple[str, ...] = ("created_at", "amount", "equity_pct", "expires_at")

    def get_queryset(self) -> QuerySet[Offer]:
        if getattr(self, "swagger_fake_view", False):
            return Offer.objects.none()

        queryset: QuerySet[Offer] = super().get_queryset()
        user: User = self.request.user

        if user.role == User.ROLE_INVESTOR:
            try:
                investor_profile: InvestorProfile = user.investor_profile  # type: ignore[attr-defined]
                return queryset.filter(investor=investor_profile)
            except (InvestorProfile.DoesNotExist, ObjectDoesNotExist):
                return queryset.none()
        elif user.role == User.ROLE_STARTUP:
            try:
                startup_profile: StartupProfile = user.startup_profile  # type: ignore[attr-defined]
                return queryset.filter(pitch__startup=startup_profile)
            except (StartupProfile.DoesNotExist, ObjectDoesNotExist):
                return queryset.none()

        if user.is_staff:
            return queryset

        return queryset.none()

    def perform_create(self, serializer: OfferSerializer) -> None:
        try:
            investor_profile: InvestorProfile = self.request.user.investor_profile  # type: ignore[attr-defined]
        except (InvestorProfile.DoesNotExist, ObjectDoesNotExist) as e:
            raise PermissionDenied(
                "Only investor users can submit offers. "
                "Please complete your investor profile first."
            ) from e
        initial_status = serializer.validated_data.get("status", Offer.STATUS_DRAFT)

        # Create in draft first so FSM transitions set sent_at/responded_at invariants.
        if initial_status and initial_status != Offer.STATUS_DRAFT:
            offer = serializer.save(investor=investor_profile, status=Offer.STATUS_DRAFT)
            if offer.can_transition(initial_status):
                with transaction.atomic():
                    offer.transition_to(initial_status)
                    offer.save()
        else:
            offer = serializer.save(investor=investor_profile)

        if offer.status == Offer.STATUS_SENT:
            push_offer_created(offer)

    def perform_update(self, serializer: OfferSerializer) -> None:
        offer: Offer = self.get_object()
        user: User = self.request.user

        if user.role == User.ROLE_INVESTOR:
            if offer.investor.user != user:
                raise PermissionDenied("You can only update your own offers.")
        elif user.role == User.ROLE_STARTUP:
            if offer.pitch.startup.user != user:
                raise PermissionDenied("You can only respond to offers on your pitches.")
            new_status = serializer.validated_data.get("status", offer.status)
            if new_status not in (
                Offer.STATUS_ACCEPTED,
                Offer.STATUS_REJECTED,
                Offer.STATUS_NEGOTIATING,
            ):
                raise PermissionDenied(
                    "As a startup, you can only accept, reject, or start negotiating."
                )
        elif not user.is_staff:
            raise PermissionDenied("You don't have permission to update this offer.")

        new_status = serializer.validated_data.get("status")
        if new_status and new_status != offer.status:
            with transaction.atomic():
                offer.transition_to(new_status)
                serializer.save()
            push_offer_update(offer)
        else:
            serializer.save()

    def perform_destroy(self, instance: Offer) -> None:
        user: User = self.request.user
        if instance.investor.user != user and not user.is_staff:
            raise PermissionDenied("You can only delete your own offers.")
        if instance.status not in (Offer.STATUS_DRAFT, Offer.STATUS_REJECTED):
            raise ValidationError(
                "Only draft or rejected offers can be deleted."
            )
        instance.delete()

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="new_status",
                type=str,
                location=OpenApiParameter.PATH,
                description="The target offer status to transition to.",
                required=True,
            ),
        ],
    )
    @action(detail=True, methods=["post"], url_path="transition/(?P<new_status>[^/.]+)")
    def transition(self, request, pk=None, new_status=None) -> Response:
        offer: Offer = self.get_object()
        user: User = request.user

        if not offer.can_transition(new_status):
            return Response(
                {
                    "detail": f"Cannot transition from {offer.status} to {new_status}.",
                    "valid_transitions": list(Offer.VALID_TRANSITIONS.get(offer.status, ())),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.role == User.ROLE_INVESTOR:
            if offer.investor.user != user:
                raise PermissionDenied("You can only transition your own offers.")
        elif user.role == User.ROLE_STARTUP:
            if offer.pitch.startup.user != user:
                raise PermissionDenied("You can only transition offers on your pitches.")
            if new_status not in (
                Offer.STATUS_ACCEPTED,
                Offer.STATUS_REJECTED,
                Offer.STATUS_NEGOTIATING,
            ):
                raise PermissionDenied(
                    "As a startup, you can only transition to accepted, rejected, or negotiating."
                )
        elif not user.is_staff:
            raise PermissionDenied("You don't have permission to transition this offer.")

        with transaction.atomic():
            offer.transition_to(new_status)
            offer.save()

        push_offer_update(offer)

        serializer = self.get_serializer(offer)
        return Response(
            {
                "message": f"Offer status changed to {new_status}.",
                "offer": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="send")
    def send_offer(self, request, pk=None) -> Response:
        offer: Offer = self.get_object()
        if offer.investor.user != request.user and not request.user.is_staff:
            raise PermissionDenied("You can only send your own offers.")

        if offer.status != Offer.STATUS_DRAFT:
            return Response(
                {"detail": "Only draft offers can be sent."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            offer.transition_to(Offer.STATUS_SENT)
            offer.save()

        push_offer_created(offer)

        serializer = self.get_serializer(offer)
        return Response(
            {
                "message": "Offer sent successfully.",
                "offer": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
