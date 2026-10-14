"""
apps.accelerator.workflows
==========================
Workflow OS event dispatcher.

Given a program and a lifecycle event (e.g. ``application.accepted``), finds the
active ``WorkflowAutomation`` records whose ``trigger_event`` matches, evaluates
their (deterministic) ``conditions`` against the supplied context, and records a
``WorkflowAutomationLog`` for each one fired.

IMPORTANT — this deliberately does NOT perform side effects (sending email, etc.).
It evaluates rules and records what SHOULD happen, leaving the actions queued for
the Communications OS to execute. The workflow engine never becomes the source of
truth or the actor; it produces intent that is logged and auditable.

Condition evaluation is intentionally simple and deterministic: ``conditions`` is
a flat mapping of ``{context_key: expected_value}`` and an automation fires only
when every key is present in the context and equal (loose string comparison for
booleans/numbers). No AI is involved — this is a rule engine, per the product
principle that admission-impacting logic must be deterministic.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Maps an AcceleratorApplication.status value to the trigger_event slug that
# automations subscribe to. Statuses not listed here emit no workflow event.
STATUS_TO_TRIGGER = {
    "SUBMITTED": "application.submitted",
    "SHORTLISTED": "application.shortlisted",
    "INTERVIEW_INVITED": "application.interview_invited",
    "INTERVIEW_COMPLETE": "application.interview_complete",
    "COMMITTEE_REVIEW": "application.committee_ready",
    "ACCEPTED": "application.accepted",
    "REJECTED": "application.rejected",
    "WAITLISTED": "application.waitlisted",
    "EVIDENCE_REQUESTED": "application.evidence_requested",
}


def _conditions_match(conditions: dict[str, Any], context: dict[str, Any]) -> bool:
    if not conditions:
        return True
    if not isinstance(conditions, dict):
        return False
    for key, expected in conditions.items():
        if key not in context:
            return False
        actual = context[key]
        if isinstance(expected, bool) or isinstance(actual, bool):
            if bool(actual) is not bool(expected):
                return False
        elif str(actual) != str(expected):
            return False
    return True


def publish_event(program, event_type: str, *, application=None, actor=None,
                  payload: dict[str, Any] | None = None):
    """Write a durable domain event to the outbox. The event bus is the seam the
    workflow, communications, analytics and audit layers react to — publishers
    never perform side effects inline."""
    from .models_config import EventOutbox
    try:
        return EventOutbox.objects.create(
            program=program, application=application, event_type=event_type,
            actor=actor, payload=payload or {},
        )
    except Exception:  # noqa: BLE001 - never let eventing break the calling write
        logger.exception("workflows.publish_event_failed event=%s", event_type)
        return None


def dispatch_event(program, trigger_event: str, *, context: dict[str, Any] | None = None,
                   application=None, actor=None):
    """
    Evaluate + log all active automations for ``trigger_event`` on ``program``.
    Returns a list of created ``WorkflowAutomationLog`` instances.
    """
    from .models_os import WorkflowAutomation, WorkflowAutomationLog

    context = context or {}
    logs = []
    automations = WorkflowAutomation.objects.filter(
        program=program, is_active=True, trigger_event=trigger_event
    ).order_by("order", "id")

    for auto in automations:
        matched = _conditions_match(auto.conditions or {}, context)
        executed, skipped = [], []
        if matched:
            for action in (auto.actions or []):
                executed.append({**action, "status": "queued"})
                _materialise_action(program, action, application=application, context=context)
        else:
            for action in (auto.actions or []):
                skipped.append({**action, "reason": "conditions_not_met"})

        log = WorkflowAutomationLog.objects.create(
            automation=auto,
            trigger_event=trigger_event,
            context_snapshot={k: _safe(v) for k, v in context.items()},
            actions_executed=executed,
            actions_skipped=skipped,
            success=True,
        )
        logs.append(log)

    # Always record the lifecycle event on the bus, whether or not an automation fired.
    publish_event(
        program, trigger_event, application=application, actor=actor,
        payload={"context": {k: _safe(v) for k, v in context.items()}},
    )

    if logs:
        logger.info(
            "workflows.dispatched program_id=%s event=%s fired=%s",
            getattr(program, "pk", None), trigger_event, len(logs),
        )
    return logs


def _materialise_action(program, action: dict[str, Any], *, application=None,
                        context: dict[str, Any] | None = None):
    """Turn a matched automation action into a concrete, auditable record.

    Only ``notify`` actions produce a deliverable (a queued program Notification);
    other action types (create_task, assign_reviewer, …) are recorded as intent in
    the automation log and left for their owning subsystem to consume. This keeps
    the engine from silently mutating state it does not own.
    """
    if not isinstance(action, dict):
        return
    if str(action.get("type", "")).lower() not in ("notify", "notification", "email"):
        return
    from .models_config import Notification, NotificationTemplate

    key = action.get("template") or action.get("key") or ""
    template = NotificationTemplate.objects.filter(
        program=program, key=key, is_active=True
    ).first() if key else None

    ctx = context or {}
    company = ""
    founder = ""
    if application is not None:
        try:
            company = application.startup_profile.company_name
        except Exception:  # noqa: BLE001
            company = ""
        founder = getattr(getattr(application, "startup_profile", None), "founder_name", "") or ""

    body = _render(template.body if template else (action.get("body", "") or ""),
                   program, company, founder, ctx)
    subject = _render(template.subject if template else (action.get("subject", "") or ""),
                      program, company, founder, ctx)

    Notification.objects.create(
        program=program,
        application=application,
        template_key=key,
        channel=template.channel if template else (action.get("channel", "in_app")),
        subject=subject[:300],
        body=body,
        status="queued",
        context={"company": company, "action": action},
    )


def _render(text: str, program, company: str, founder: str, ctx: dict[str, Any]) -> str:
    if not text:
        return ""
    first_name = (founder or "").split(" ")[0]
    replacements = {
        "{{program.name}}": getattr(program, "name", ""),
        "{{company.name}}": company,
        "{{founder.first_name}}": first_name,
        "{{deadline}}": str(ctx.get("deadline", "")),
    }
    out = text
    for token, value in replacements.items():
        out = out.replace(token, value or "")
    return out



def dispatch_status_change(program, new_status: str, *, application=None, actor=None):
    """Convenience wrapper used by the application pipeline / status transitions."""
    trigger = STATUS_TO_TRIGGER.get(new_status)
    if not trigger:
        return []
    context: dict[str, Any] = {}
    if application is not None:
        context = {
            "status": application.status,
            "tier": application.automated_screening_tier,
            "eligibility_passed": bool(application.eligibility_score and application.eligibility_score >= 50),
        }
    return dispatch_event(program, trigger, context=context, application=application, actor=actor)


def _safe(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)
