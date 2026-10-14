"""
apps.accelerator.pipeline
=========================
Audited Application Pipeline & Stage Progression Service (Phase 2).

Every application transition is:
1. Validated against allowed stage paths and ProgramEvaluationPolicy hard gates.
2. Audited with an immutable ApplicationAuditEvent record (actor, reason, policy_version snapshot).
3. Broadcast to the DomainEventBus for downstream intelligence consumption.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from django.db import transaction
from django.utils import timezone

from apps.accelerator.models import (
    AcceleratorApplication,
    ApplicationAuditEvent,
)
from apps.intelligence.events import DomainEventBus

logger = logging.getLogger(__name__)


class ApplicationPipeline:
    """
    Manages stage lifecycle, automated triage, and audit integrity for AcceleratorApplications.
    """

    # Defined transitions allowed in the state machine
    ALLOWED_TRANSITIONS: dict[str, list[str]] = {
        "DRAFT": ["SUBMITTED", "WITHDRAWN"],
        "SUBMITTED": ["SCREENING", "REJECTED", "WITHDRAWN"],
        "SCREENING": ["SHORTLISTED", "EVIDENCE_REQUESTED", "WAITLISTED", "REJECTED", "WITHDRAWN"],
        "SHORTLISTED": ["INTERVIEW_INVITED", "COMMITTEE_REVIEW", "ACCEPTED", "EVIDENCE_REQUESTED", "WAITLISTED", "REJECTED", "DEFERRED", "WITHDRAWN"],
        "INTERVIEW_INVITED": ["INTERVIEW_COMPLETE", "WITHDRAWN", "DEFERRED"],
        "INTERVIEW_COMPLETE": ["COMMITTEE_REVIEW", "ACCEPTED", "SHORTLISTED", "EVIDENCE_REQUESTED", "WAITLISTED", "REJECTED", "DEFERRED"],
        "COMMITTEE_REVIEW": ["ACCEPTED", "WAITLISTED", "REJECTED", "EVIDENCE_REQUESTED", "DEFERRED"],
        "EVIDENCE_REQUESTED": ["SCREENING", "SHORTLISTED", "COMMITTEE_REVIEW", "REJECTED", "WITHDRAWN"],
        "WAITLISTED": ["ACCEPTED", "REJECTED", "DEFERRED", "WITHDRAWN"],
        "ACCEPTED": ["DEFERRED", "WITHDRAWN"],
        "REJECTED": ["DEFERRED"],
        "DEFERRED": ["SUBMITTED", "SCREENING", "SHORTLISTED"],
        "WITHDRAWN": ["DRAFT", "SUBMITTED"],
    }

    def __init__(self, application: AcceleratorApplication):
        self.application = application
        self.program = application.program

    def can_advance(self, to_stage: str) -> tuple[bool, str]:
        """
        Check whether the application can legally transition to the target stage.
        Returns (is_allowed, failure_reason).
        """
        current_stage = self.application.status
        if current_stage == to_stage:
            return False, f"Application is already in stage {to_stage}."

        # Configurable Workflow OS graph (ProgramStage/StageTransition) is the
        # authority; the hard-coded ALLOWED_TRANSITIONS map remains only as the
        # seeded default the engine falls back to before a program is customised.
        from apps.accelerator import workflow_engine
        allowed, reason = workflow_engine.validate_transition(self.program, current_stage, to_stage)
        if not allowed:
            return False, reason or f"Transition from {current_stage} to {to_stage} is not permitted."

        # Hard Gate Validation for advancing past SCREENING
        if to_stage in ["SHORTLISTED", "INTERVIEW_INVITED", "ACCEPTED"]:
            runtime = self.program.get_runtime()
            hard_gates = runtime.get_hard_gates()
            if hard_gates:
                # Validate application profile against hard gates
                startup = self.application.startup_profile
                founder = startup.founder_profile if hasattr(startup, "founder_profile") else None

                for gate in hard_gates:
                    field = gate.get("gate")
                    disqualifying = gate.get("is_disqualifying", True)

                    # Full-time check gate
                    if field == "full_time_founder" and founder and not founder.full_time_status:
                        if disqualifying:
                            return False, "Disqualified by hard gate: Full-time founder commitment required."

                    # Incorporation gate
                    if field == "incorporated" and not startup.incorporated:
                        if disqualifying:
                            return False, "Disqualified by hard gate: Incorporation required."

        return True, ""

    @transaction.atomic
    def advance(
        self,
        to_stage: str,
        actor=None,
        reason: str = "",
        evidence_snapshot: Optional[dict[str, Any]] = None,
        is_automated: bool = False,
        snapshot_hash: str = "",
    ) -> ApplicationAuditEvent:
        """
        Executes a validated stage transition, records audit trail, and emits domain event.
        Guarded by select_for_update() row lock to prevent race conditions.
        """
        # Lock application record inside transaction
        self.application = AcceleratorApplication.objects.select_for_update().get(pk=self.application.pk)

        can_move, err = self.can_advance(to_stage)
        if not can_move:
            raise ValueError(f"Cannot advance application: {err}")

        from_stage = self.application.status
        policy_version = self.program.get_runtime().get_policy_version()

        # Snapshot key evidence scores if not provided
        if evidence_snapshot is None:
            evidence_snapshot = {
                "eligibility_score": self.application.eligibility_score,
                "startup_strength_score": self.application.startup_strength_score,
                "program_fit_score": self.application.program_fit_score,
                "evidence_confidence_score": self.application.evidence_confidence_score,
                "automated_tier": self.application.automated_screening_tier,
            }

        # Update application status
        self.application.status = to_stage
        if to_stage == "SUBMITTED" and not self.application.submitted_at:
            self.application.submitted_at = timezone.now()
        self.application.save(update_fields=["status", "submitted_at", "updated_at"])

        # Create immutable audit record
        audit_event = ApplicationAuditEvent.objects.create(
            application=self.application,
            from_stage=from_stage,
            to_stage=to_stage,
            actor=actor,
            reason=reason,
            policy_version=policy_version,
            evidence_snapshot=evidence_snapshot,
            snapshot_hash=snapshot_hash,
            is_automated=is_automated,
        )

        # Publish Domain Event
        event_name = f"Application_{to_stage.lower()}"
        if to_stage == "ACCEPTED":
            event_name = "ApplicationAccepted"
        elif to_stage == "REJECTED":
            event_name = "ApplicationRejected"
        elif to_stage == "SUBMITTED":
            event_name = "ApplicationSubmitted"
        else:
            event_name = "ApplicationStageAdvanced"

        try:
            DomainEventBus.create_and_publish(
                event_type=event_name,
                aggregate_type="AcceleratorApplication",
                aggregate_id=str(self.application.id),
                payload={
                    "application_id": self.application.id,
                    "company_name": self.application.startup_profile.company_name,
                    "program_id": self.program.id,
                    "program_name": self.program.name,
                    "from_stage": from_stage,
                    "to_stage": to_stage,
                    "actor_id": actor.id if actor else None,
                    "policy_version": policy_version,
                    "is_automated": is_automated,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to publish {event_name} event: {e}")

        # Workflow OS: automations bound to this status must fire on every
        # audited transition, not only the ones made through the manual
        # status endpoint. Best-effort — never block the transition itself.
        try:
            from apps.accelerator import workflows
            workflows.dispatch_status_change(
                self.program, to_stage, application=self.application, actor=actor
            )
        except Exception:  # noqa: BLE001
            logger.exception("workflow dispatch failed on advance app_id=%s", self.application.pk)

        return audit_event

    def run_automated_triage(self) -> str:
        """
        Evaluates program fit, startup strength, and evidence confidence to assign
        automated screening tier (A, B, C, D) and advance from SUBMITTED to SCREENING.
        """
        # Persist eligibility first: the tier, the funnel's "Eligibility Check"
        # step, and workflow `eligibility_passed` automations all read it, and
        # the same engine backs the founder self-check (one source of truth).
        from apps.accelerator.eligibility import evaluate_application_eligibility
        evaluate_application_eligibility(self.application)

        fit = self.application.program_fit_score
        evidence = self.application.evidence_confidence_score
        strength = self.application.startup_strength_score

        # Composite triage score (weighted)
        triage_score = (fit * 0.4) + (strength * 0.35) + (evidence * 0.25)

        if triage_score >= 80 and evidence >= 70:
            tier = "A"
        elif triage_score >= 65:
            tier = "B"
        elif triage_score >= 45:
            tier = "C"
        else:
            tier = "D"

        self.application.automated_screening_tier = tier
        self.application.save(update_fields=["automated_screening_tier"])

        if self.application.status == "SUBMITTED":
            self.advance(
                to_stage="SCREENING",
                reason=f"Automated triage complete. Assigned Tier {tier} (Composite: {triage_score:.1f}).",
                is_automated=True,
            )

        return tier

    def get_audit_trail(self) -> list[dict[str, Any]]:
        """Returns the chronological audit trail for this application."""
        events = self.application.audit_events.select_related("actor").order_by("timestamp")
        return [
            {
                "id": evt.id,
                "action_type": evt.action_type,
                "from_stage": evt.from_stage,
                "to_stage": evt.to_stage,
                "actor": evt.actor.email if evt.actor else ("System / ML" if evt.is_automated else None),
                "reason": evt.reason,
                "policy_version": evt.policy_version,
                "evidence_snapshot": evt.evidence_snapshot,
                "is_automated": evt.is_automated,
                "timestamp": evt.timestamp.isoformat(),
            }
            for evt in events
        ]
