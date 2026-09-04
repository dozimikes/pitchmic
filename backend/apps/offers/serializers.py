from __future__ import annotations

import statistics
from dataclasses import asdict
from typing import Any

from django.db.models import Max, Q, Sum
from django.utils import timezone
from rest_framework import serializers

from apps.intelligence.ml.sequences import BehavioralSequenceModel
from apps.matching.models import InvestorIntentSignal, MatchScore
from apps.users.models import InvestorProfile, StartupProfile

from .models import Offer


SIGNAL_TO_BEHAVIORAL_EVENT = {
    "profile_view": "VIEW_PROFILE",
    "view": "VIEW_PITCH",
    "like": "VIEW_PITCH",
    "save": "DOWNLOAD_DECK",
    "offer_draft": "REQUEST_INTRO",
    "offer_sent": "SUBMIT_OFFER",
    "offer_accepted": "SUBMIT_OFFER",
    "offer_rejected": "SUBMIT_OFFER",
    "dataroom_access": "VIEW_DATAROOM",
}


STATUS_CLOSE_MULTIPLIERS = {
    Offer.STATUS_DRAFT: 0.55,
    Offer.STATUS_SENT: 0.78,
    Offer.STATUS_NEGOTIATING: 0.88,
    Offer.STATUS_ACCEPTED: 1.0,
    Offer.STATUS_REJECTED: 0.0,
    Offer.STATUS_WITHDRAWN: 0.0,
    Offer.STATUS_EXPIRED: 0.0,
}


def _match_score_for(investor: InvestorProfile, startup: StartupProfile):
    ms = (
        MatchScore.objects.filter(investor=investor, startup=startup)
        .values(
            "compatibility_score",
            "industry_score",
            "stage_score",
            "ticket_size_score",
            "location_score",
            "semantic_score",
        )
        .first()
    )
    if ms:
        return {
            "match_score": round(float(ms["compatibility_score"]) * 100, 1),
            "match_dimensions": {
                "industry": round(float(ms["industry_score"]) * 100, 1),
                "stage": round(float(ms["stage_score"]) * 100, 1),
                "ticket_size": round(float(ms["ticket_size_score"]) * 100, 1),
                "location": round(float(ms["location_score"]) * 100, 1),
                "semantic": round(float(ms["semantic_score"]) * 100, 1),
            },
        }
    # Deterministic heuristic fallback
    niche_match = 0.0
    investor_niche = (investor.niche or "").lower()
    startup_niche = (startup.niche or "").lower()
    if investor_niche and startup_niche:
        overlap = len(set(investor_niche.split(",")) & set(startup_niche.split(",")))
        niche_match = min(10.0, overlap * 3.0)
    inv_min = float(investor.investment_range_min or 0)
    inv_max = float(investor.investment_range_max or 10_000_000)
    asking = float(startup.asking_amount or 500_000)
    ticket_match = 0.0
    if inv_min <= asking <= inv_max:
        ticket_match = 8.0
    elif asking > 0:
        closeness = 1.0 - min(1.0, abs(asking - (inv_min + inv_max) / 2) / max(inv_max, 1))
        ticket_match = round(closeness * 5.0, 1)
    score = round(min(97.0, max(50.0, 72.0 + niche_match + ticket_match)), 1)
    return {
        "match_score": score,
        "match_dimensions": {
            "industry": round(min(95.0, 65.0 + niche_match), 1),
            "stage": 70.0,
            "ticket_size": round(min(95.0, 62.0 + ticket_match), 1),
            "location": 68.0,
            "semantic": 71.0,
        },
    }


def _behavioral_signals_for(investor: InvestorProfile, startup: StartupProfile):
    signals = list(
        InvestorIntentSignal.objects.filter(investor=investor, startup=startup)
        .order_by("-created_at")
        .values_list("signal_type", flat=True)
        .distinct()
    )
    events: list[str] = []
    for s in signals:
        mapped = SIGNAL_TO_BEHAVIORAL_EVENT.get(s)
        if mapped and mapped not in events:
            events.append(mapped)
    return signals, events


def _intent_and_engagement(
    investor: InvestorProfile,
    startup: StartupProfile,
    behavioral_events: list[str],
    signals_raw: list[str],
):
    now = timezone.now()
    last_signal = (
        InvestorIntentSignal.objects.filter(investor=investor, startup=startup)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )
    days_span = 7.0
    if last_signal:
        delta = (now - last_signal).total_seconds() / 86400.0
        days_span = max(1.0, delta)
    journey = BehavioralSequenceModel.evaluate_sequence(
        behavioral_events, times_span_days=days_span
    )
    intent_pct = round(journey.conversion_intent_score, 1)
    intent_tier = journey.intent_tier

    signal_count = len(signals_raw)
    recency_penalty = 0.0
    if last_signal:
        days_since = (now - last_signal).total_seconds() / 86400.0
        if days_since > 7:
            recency_penalty = min(30.0, (days_since - 7) * 2.0)
    fallback_intent = round(
        min(95.0, max(5.0, 30.0 + signal_count * 5.0 - recency_penalty)), 1
    )
    if intent_pct < 15 and signal_count > 0:
        intent_pct = max(fallback_intent, intent_pct)

    # Engagement score 0-100
    depth_score = min(100, len(behavioral_events) * 20)
    has_dataroom = "VIEW_DATAROOM" in behavioral_events
    has_deck = "DOWNLOAD_DECK" in behavioral_events
    has_return = signal_count >= 3
    engagement = depth_score
    if has_dataroom:
        engagement += 15
    if has_deck:
        engagement += 10
    if has_return:
        engagement += 10
    engagement = min(99, engagement)
    return (
        intent_pct,
        intent_tier or ("WARM" if intent_pct >= 30 else "COLD"),
        engagement,
    )


def _compute_economics(offer: Offer, all_same_pitch_offers: list[Offer]):
    amount = float(offer.amount or 0)
    equity = float(offer.equity_pct or 0)
    if offer.valuation:
        implied_val = float(offer.valuation)
    elif equity > 0 and amount > 0:
        implied_val = round(amount / (equity / 100.0))
    else:
        implied_val = None

    same_pitch_equities = [
        float(o.equity_pct)
        for o in all_same_pitch_offers
        if o.equity_pct is not None and float(o.equity_pct) > 0
    ]
    median_dilution = statistics.median(same_pitch_equities) if same_pitch_equities else None

    weighted_num = 0.0
    weighted_den = 0.0
    for o in all_same_pitch_offers:
        amt = float(o.amount or 0)
        eq = float(o.equity_pct or 0)
        if amt > 0 and eq > 0:
            weighted_num += amt * eq
            weighted_den += amt
    capital_weighted = (
        round(weighted_num / weighted_den, 2) if weighted_den > 0 else None
    )

    return {
        "implied_valuation": implied_val,
        "median_dilution_pct": round(median_dilution, 2) if median_dilution is not None else None,
        "capital_weighted_dilution_pct": capital_weighted,
    }


def _compute_close_probability(intent_pct: float | None, status: str) -> float | None:
    if intent_pct is None:
        return None
    mult = STATUS_CLOSE_MULTIPLIERS.get(status, 0.5)
    if status == Offer.STATUS_ACCEPTED:
        return 99.0
    if status in (Offer.STATUS_REJECTED, Offer.STATUS_WITHDRAWN, Offer.STATUS_EXPIRED):
        return 0.0
    return round(min(99.0, intent_pct * mult), 1)


class OfferSerializer(serializers.ModelSerializer):
    investor_name = serializers.CharField(source="investor.full_name", read_only=True)
    investor_company = serializers.CharField(source="investor.company_name", read_only=True)
    pitch_title = serializers.CharField(source="pitch.title", read_only=True)
    startup_name = serializers.CharField(source="pitch.startup.company_name", read_only=True)
    valid_transitions = serializers.SerializerMethodField()

    match_score = serializers.SerializerMethodField()
    match_dimensions = serializers.SerializerMethodField()
    investor_intent_pct = serializers.SerializerMethodField()
    intent_tier = serializers.SerializerMethodField()
    close_probability_pct = serializers.SerializerMethodField()
    behavioral_signals = serializers.SerializerMethodField()
    engagement_score = serializers.SerializerMethodField()
    offer_economics = serializers.SerializerMethodField()

    class Meta:
        model: type[Offer] = Offer
        fields: tuple[str, ...] = (
            "id",
            "investor",
            "investor_name",
            "investor_company",
            "pitch",
            "pitch_title",
            "startup_name",
            "status",
            "amount",
            "equity_pct",
            "message",
            "valuation",
            "terms",
            "sent_at",
            "responded_at",
            "expires_at",
            "valid_transitions",
            "created_at",
            "updated_at",
            # Intelligence annotations
            "match_score",
            "match_dimensions",
            "investor_intent_pct",
            "intent_tier",
            "close_probability_pct",
            "behavioral_signals",
            "engagement_score",
            "offer_economics",
        )
        read_only_fields: tuple[str, ...] = (
            "id",
            "investor",
            "sent_at",
            "responded_at",
            "created_at",
            "updated_at",
        )

    def _startup_from_offer(self, obj: Offer) -> StartupProfile:
        return obj.pitch.startup

    def _investor_from_offer(self, obj: Offer) -> InvestorProfile:
        return obj.investor

    def get_valid_transitions(self, obj: Offer) -> list[str]:
        return list(Offer.VALID_TRANSITIONS.get(obj.status, ()))

    # ---- Caching helpers per-serializer instance -----------------------

    def _cache(self) -> dict[str, Any]:
        if not hasattr(self, "_offer_intel_cache"):
            self._offer_intel_cache: dict[str, Any] = {}  # type: ignore[attr-defined]
        return self._offer_intel_cache  # type: ignore[attr-defined]

    def _pitch_offers_cache(self, pitch_id: int) -> list[Offer]:
        key = f"pitch_offers_{pitch_id}"
        cache = self._cache()
        if key not in cache:
            cache[key] = list(Offer.objects.filter(pitch_id=pitch_id))
        return cache[key]

    def _intel(self, obj: Offer) -> dict[str, Any]:
        cache = self._cache()
        key = f"intel_{obj.pk}"
        if key in cache:
            return cache[key]
        investor = self._investor_from_offer(obj)
        startup = self._startup_from_offer(obj)

        match_data = _match_score_for(investor, startup)
        signals_raw, events = _behavioral_signals_for(investor, startup)
        intent_pct, intent_tier, engagement = _intent_and_engagement(
            investor, startup, events, signals_raw
        )
        close_pct = _compute_close_probability(intent_pct, obj.status)
        economics = _compute_economics(obj, self._pitch_offers_cache(obj.pitch_id))

        result = {
            **match_data,
            "investor_intent_pct": intent_pct,
            "intent_tier": intent_tier,
            "close_probability_pct": close_pct,
            "behavioral_signals": events,
            "engagement_score": engagement,
            "offer_economics": economics,
        }
        cache[key] = result
        return result

    # ---- Serializer method fields --------------------------------------

    def get_match_score(self, obj: Offer) -> float | None:
        return self._intel(obj).get("match_score")

    def get_match_dimensions(self, obj: Offer) -> dict[str, float] | None:
        return self._intel(obj).get("match_dimensions")

    def get_investor_intent_pct(self, obj: Offer) -> float | None:
        return self._intel(obj).get("investor_intent_pct")

    def get_intent_tier(self, obj: Offer) -> str | None:
        return self._intel(obj).get("intent_tier")

    def get_close_probability_pct(self, obj: Offer) -> float | None:
        return self._intel(obj).get("close_probability_pct")

    def get_behavioral_signals(self, obj: Offer) -> list[str]:
        return self._intel(obj).get("behavioral_signals") or []

    def get_engagement_score(self, obj: Offer) -> float | None:
        return self._intel(obj).get("engagement_score")

    def get_offer_economics(self, obj: Offer) -> dict[str, Any] | None:
        return self._intel(obj).get("offer_economics")

    # ---- Validation -----------------------------------------------------

    def validate_status(self, value: str) -> str:
        if self.instance and value != self.instance.status:
            if not self.instance.can_transition(value):
                raise serializers.ValidationError(
                    f"Cannot transition from {self.instance.status} to {value}. "
                    f"Valid transitions: {list(Offer.VALID_TRANSITIONS.get(self.instance.status, ()))}"
                )
        return value

    def validate(self, attrs: dict) -> dict:
        if not self.instance:
            user = self.context.get("request").user
            pitch = attrs.get("pitch")
            if pitch and pitch.startup.user_id == user.id:
                raise serializers.ValidationError(
                    "You cannot make an offer on your own pitch."
                )
        return attrs
