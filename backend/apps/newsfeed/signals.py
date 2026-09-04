"""
apps.newsfeed.signals
=====================
Django signal handlers that create Activity rows for the newsfeed.

All handlers are connected in NewsfeedConfig.ready() to avoid
import-time side effects and circular imports.

Events covered
--------------
  Pitch      post_save  → pitch_created / pitch_updated
  PitchLike  post_save  → pitch_liked
  Offer      post_save  → offer_made (status=sent) / offer_accepted /
                          offer_rejected / offer_negotiating
  StartupProfile  post_save (created=True) → startup_joined
  InvestorProfile post_save (created=True) → investor_joined
  TeamMember      post_save (created=True) → team_member_added
"""
from __future__ import annotations

import logging
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_save

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _create_activity(
    *,
    actor,
    verb: str,
    target=None,
    action_object=None,
    metadata: dict | None = None,
) -> None:
    """
    Safely create an Activity row.  Wrapped in try/except so a signal
    handler failure never bubbles up and breaks the originating transaction.
    """
    from apps.newsfeed.models import Activity

    try:
        kwargs: dict[str, Any] = {
            "actor": actor,
            "verb": verb,
            "metadata": metadata or {},
        }
        if target is not None:
            ct = ContentType.objects.get_for_model(target)
            kwargs["target_content_type"] = ct
            kwargs["target_object_id"] = target.pk

        if action_object is not None:
            ct = ContentType.objects.get_for_model(action_object)
            kwargs["action_object_content_type"] = ct
            kwargs["action_object_object_id"] = action_object.pk

        Activity.objects.create(**kwargs)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to create Activity(actor=%s, verb=%s)", getattr(actor, "pk", actor), verb
        )


# ---------------------------------------------------------------------------
# Pitch signals
# ---------------------------------------------------------------------------

def on_pitch_saved(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    """
    Fire pitch_created when a pitch is first published (is_draft goes False).
    Fire pitch_updated on subsequent saves of a published pitch.
    Draft saves are ignored entirely.
    """
    # Skip if still a draft
    if instance.is_draft:
        return

    actor = instance.startup.user
    metadata = {
        "pitch_title": instance.title,
        "startup_name": instance.startup.company_name,
    }

    was_draft = getattr(instance, "_loaded_is_draft", True)

    if created or was_draft:
        # First time published
        _create_activity(actor=actor, verb="pitch_created", target=instance, metadata=metadata)
    else:
        _create_activity(actor=actor, verb="pitch_updated", target=instance, metadata=metadata)


# ---------------------------------------------------------------------------
# PitchLike signals
# ---------------------------------------------------------------------------

def on_pitch_liked(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    if not created:
        return
    _create_activity(
        actor=instance.user,
        verb="pitch_liked",
        target=instance.pitch,
        action_object=instance,
        metadata={
            "pitch_title": instance.pitch.title,
        },
    )


# ---------------------------------------------------------------------------
# Offer signals
# ---------------------------------------------------------------------------

_OFFER_STATUS_VERB_MAP: dict[str, str] = {
    "sent": "offer_made",
    "accepted": "offer_accepted",
    "rejected": "offer_rejected",
    "negotiating": "offer_negotiating",
}


def on_offer_saved(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    """
    Record activity only when an offer transitions to a significant status.
    Uses instance._loaded_status (set in Offer.__init__ / Offer.save) to
    detect genuine status changes and avoid duplicate activity rows.
    """
    current_status = instance.status
    previous_status = getattr(instance, "_loaded_status", None)

    # Only fire when the status actually changed (or it's a brand-new offer)
    if not created and current_status == previous_status:
        return

    verb = _OFFER_STATUS_VERB_MAP.get(current_status)
    if not verb:
        return

    actor = instance.investor.user
    metadata = {
        "pitch_title": instance.pitch.title,
        "startup_name": instance.pitch.startup.company_name,
        "amount": str(instance.amount),
        "equity_pct": str(instance.equity_pct),
        "offer_status": current_status,
    }

    # For accepted/rejected/negotiating, actor is the startup user who responded
    if current_status in ("accepted", "rejected", "negotiating"):
        try:
            actor = instance.pitch.startup.user
        except Exception:  # noqa: BLE001
            pass

    _create_activity(
        actor=actor,
        verb=verb,
        target=instance.pitch,
        action_object=instance,
        metadata=metadata,
    )


# ---------------------------------------------------------------------------
# Profile join signals
# ---------------------------------------------------------------------------

def on_startup_profile_created(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    if not created:
        return
    _create_activity(
        actor=instance.user,
        verb="startup_joined",
        target=instance,
        metadata={"company_name": instance.company_name},
    )


def on_investor_profile_created(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    if not created:
        return
    _create_activity(
        actor=instance.user,
        verb="investor_joined",
        target=instance,
        metadata={"full_name": instance.full_name, "company_name": instance.company_name},
    )


def on_team_member_added(sender, instance, created: bool, **kwargs) -> None:  # noqa: ANN001
    if not created:
        return
    try:
        actor = instance.startup_profile.user
    except Exception:  # noqa: BLE001
        return
    _create_activity(
        actor=actor,
        verb="team_member_added",
        target=instance.startup_profile,
        action_object=instance,
        metadata={
            "member_name": instance.name,
            "member_role": instance.role,
        },
    )


# ---------------------------------------------------------------------------
# Registration - called from NewsfeedConfig.ready()
# ---------------------------------------------------------------------------

def connect() -> None:
    """
    Connect all newsfeed signal handlers.
    Called once from NewsfeedConfig.ready().
    """
    from apps.pitches.models import Pitch, PitchLike
    from apps.offers.models import Offer
    from apps.users.models import StartupProfile, InvestorProfile, TeamMember

    post_save.connect(on_pitch_saved, sender=Pitch, dispatch_uid="newsfeed.pitch_saved")
    post_save.connect(on_pitch_liked, sender=PitchLike, dispatch_uid="newsfeed.pitch_liked")
    post_save.connect(on_offer_saved, sender=Offer, dispatch_uid="newsfeed.offer_saved")
    post_save.connect(
        on_startup_profile_created,
        sender=StartupProfile,
        dispatch_uid="newsfeed.startup_joined",
    )
    post_save.connect(
        on_investor_profile_created,
        sender=InvestorProfile,
        dispatch_uid="newsfeed.investor_joined",
    )
    post_save.connect(
        on_team_member_added,
        sender=TeamMember,
        dispatch_uid="newsfeed.team_member_added",
    )

    logger.debug("Newsfeed signal handlers connected.")
