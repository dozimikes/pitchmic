from __future__ import annotations

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Max, Q, QuerySet, Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.intelligence.ml.sequences import BehavioralSequenceModel
from apps.matching.models import InvestorIntentSignal, MatchScore
from apps.users.models import InvestorProfile, StartupProfile, User

from .models import Offer
from .push import push_offer_created, push_offer_update
from .serializers import (
    SIGNAL_TO_BEHAVIORAL_EVENT,
    OfferSerializer,
    _match_score_for,
    _intent_and_engagement,
)


ACTIVE_OFFER_STATUSES = (Offer.STATUS_DRAFT, Offer.STATUS_SENT, Offer.STATUS_NEGOTIATING)
CLOSED_OFFER_STATUSES = (
    Offer.STATUS_ACCEPTED,
    Offer.STATUS_REJECTED,
    Offer.STATUS_WITHDRAWN,
    Offer.STATUS_EXPIRED,
)


def _fetch_all_signals(investors, startups):
    if not investors or not startups:
        return []
    return list(
        InvestorIntentSignal.objects.filter(
            investor_id__in=investors, startup_id__in=startups
        )
        .order_by("-created_at")
        .values(
            "investor_id",
            "startup_id",
            "signal_type",
            "created_at",
        )
    )


def _intent_for_pair(investor_id, startup_id, all_signals):
    pair_signals = [
        s for s in all_signals
        if s["investor_id"] == investor_id and s["startup_id"] == startup_id
    ]
    events: list[str] = []
    for s in pair_signals:
        mapped = SIGNAL_TO_BEHAVIORAL_EVENT.get(s["signal_type"])
        if mapped and mapped not in events:
            events.append(mapped)
    now = timezone.now()
    last_created = pair_signals[0]["created_at"] if pair_signals else None
    days_span = 7.0
    if last_created:
        delta = (now - last_created).total_seconds() / 86400.0
        days_span = max(1.0, delta)
    journey = BehavioralSequenceModel.evaluate_sequence(events, times_span_days=days_span)
    signal_count = len(pair_signals)
    fallback = min(95.0, max(5.0, 30.0 + signal_count * 5.0))
    intent = max(journey.conversion_intent_score, fallback if signal_count else 0)
    return intent, events


def _deal_health(offers, total_offers, perspective) -> dict:
    if total_offers == 0:
        return {
            "score": 0,
            "tier": "Weak",
            "factors": {
                "investor_demand": "flat",
                "offer_velocity": "flat",
                "negotiation_activity": "flat",
                "conversion_rate": "flat",
                "capital_concentration": "flat",
            },
        }

    volume_score = min(25, total_offers * 6)

    now = timezone.now()
    recent = [o for o in offers if (now - o.created_at).total_seconds() < 86400 * 14]
    velocity = len(recent)
    velocity_score = min(20, velocity * 5)

    negotiating = sum(1 for o in offers if o.status == Offer.STATUS_NEGOTIATING)
    negotiation_score = min(20, negotiating * 8)

    accepted = sum(1 for o in offers if o.status == Offer.STATUS_ACCEPTED)
    conversion = (accepted / total_offers) * 100 if total_offers > 0 else 0
    conversion_score = min(20, conversion * 0.5)

    total_capital = sum(float(o.amount or 0) for o in offers)
    concentration_penalty = 0
    if total_capital > 0:
        per_investor: dict[int, float] = {}
        for o in offers:
            inv_id = int(o.investor_id) if o.investor_id else 0
            per_investor[inv_id] = per_investor.get(inv_id, 0) + float(o.amount or 0)
        max_share = max(per_investor.values()) / total_capital if per_investor else 0
        if max_share > 0.4:
            concentration_penalty = min(10, int((max_share - 0.4) * 25))

    score = max(0, min(100, int(
        volume_score + velocity_score + negotiation_score + conversion_score - concentration_penalty + 15
    )))

    if score >= 85:
        tier = "Exceptional"
    elif score >= 65:
        tier = "Strong"
    elif score >= 40:
        tier = "Moderate"
    else:
        tier = "Weak"

    factors = {
        "investor_demand": "up" if total_offers >= 3 else ("flat" if total_offers >= 1 else "down"),
        "offer_velocity": "up" if velocity >= 2 else ("flat" if velocity >= 1 else "down"),
        "negotiation_activity": "up" if negotiating >= 2 else ("flat" if negotiating >= 1 else "down"),
        "conversion_rate": "up" if conversion >= 30 else ("flat" if conversion >= 10 else "down"),
        "capital_concentration": "down" if concentration_penalty > 0 else "flat",
    }

    return {"score": score, "tier": tier, "factors": factors}


def _build_likely_offers(offers_qs: QuerySet, perspective: str, user: User, all_signals) -> list[dict]:
    """Identify up to 3 investors with high offer probability that don't yet have an offer."""
    if perspective == "investor":
        return []
    try:
        startup_profile: StartupProfile = user.startup_profile
    except (StartupProfile.DoesNotExist, ObjectDoesNotExist):
        return []

    existing_investors = set(offers_qs.values_list("investor_id", flat=True))
    # Candidates: investors who have signals for this startup but no existing offer
    candidate_investor_ids = set(
        s["investor_id"] for s in all_signals
        if s["startup_id"] == startup_profile.pk and s["investor_id"] not in existing_investors
    )
    candidates = []
    for inv_id in candidate_investor_ids:
        try:
            inv = InvestorProfile.objects.get(pk=inv_id)
        except InvestorProfile.DoesNotExist:
            continue
        intent, events = _intent_for_pair(inv_id, startup_profile.pk, all_signals)
        if intent >= 55:
            match = _match_score_for(inv, startup_profile)
            candidates.append({
                "investor_name": inv.full_name,
                "investor_company": inv.company_name or "",
                "offer_probability_pct": round(min(95, intent), 1),
                "match_score": match["match_score"],
                "rationale_signals": events,
            })
    candidates.sort(key=lambda c: c["offer_probability_pct"], reverse=True)
    return candidates[:3]


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

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        offers = list(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            results = serializer.data
        else:
            serializer = self.get_serializer(offers, many=True)
            results = serializer.data

        user: User = request.user
        perspective: str = "investor" if user.role == User.ROLE_INVESTOR else "startup"

        total_count = len(offers)
        capital_sum = sum(float(o.amount or 0) for o in offers)
        active_count = sum(1 for o in offers if o.status in ACTIVE_OFFER_STATUSES)
        accepted_count = sum(1 for o in offers if o.status == Offer.STATUS_ACCEPTED)

        non_closed = [o for o in offers if o.status not in CLOSED_OFFER_STATUSES]
        best_offer = max((float(o.amount or 0) for o in non_closed), default=None)

        # Intent annotations for summary
        investor_ids = [int(o.investor_id) for o in offers if o.investor_id]
        startup_ids = list({int(o.pitch.startup_id) for o in offers if o.pitch and o.pitch.startup_id})
        all_signals = _fetch_all_signals(investor_ids, startup_ids)

        per_offer_intent = []
        for o in offers:
            inv_id = int(o.investor_id) if o.investor_id else None
            st_id = int(o.pitch.startup_id) if o.pitch and o.pitch.startup_id else None
            if inv_id and st_id:
                intent, _ = _intent_for_pair(inv_id, st_id, all_signals)
                per_offer_intent.append(intent)
        high_conviction_count = sum(1 for i in per_offer_intent if i >= 70)
        highest_intent_pct = round(max(per_offer_intent), 1) if per_offer_intent else None

        likely_offers = _build_likely_offers(queryset, perspective, user, all_signals)

        deal_health = _deal_health(offers, total_count, perspective)

        neg_count = sum(1 for o in offers if o.status == Offer.STATUS_NEGOTIATING)
        if neg_count >= 2:
            negotiation_tier = "High"
        elif neg_count == 1 or active_count >= 2:
            negotiation_tier = "Medium"
        else:
            negotiation_tier = "Low"

        milestone_prob = 0.0
        if highest_intent_pct is not None:
            milestone_prob = round(min(95, highest_intent_pct * 0.85 + 8), 1)
        elif accepted_count > 0:
            milestone_prob = 90.0
        elif active_count > 0:
            milestone_prob = 55.0

        summary_key = "offers_sent_count" if perspective == "investor" else "offers_received_count"
        summary = {
            summary_key: total_count,
            "capital_offered_sum": round(capital_sum, 2),
            "active_negotiation_count": active_count,
            "accepted_count": accepted_count,
            "best_offer_amount": round(best_offer, 2) if best_offer is not None else None,
            "high_conviction_count": high_conviction_count,
            "likely_offer_count": len(likely_offers),
            "likely_offers": likely_offers,
            "highest_intent_pct": highest_intent_pct,
            "negotiation_opportunity_tier": negotiation_tier,
            "next_milestone_term_sheet_probability_pct": milestone_prob,
            "deal_health_score": deal_health["score"],
            "deal_health_tier": deal_health["tier"],
            "deal_health_factors": deal_health["factors"],
        }

        if page is not None:
            paginated = self.get_paginated_response(results)
            paginated.data["count"] = total_count
            paginated.data["summary"] = summary
            return paginated
        return Response({
            "count": total_count,
            "summary": summary,
            "results": results,
        })

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
