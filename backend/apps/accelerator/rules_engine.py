"""
apps.accelerator.rules_engine
==============================
Program-specific Rules Engine (Phase 1)

Evaluates structured rules against program-contextual data.
Rules are stored per-program in ProgramRule and evaluated at runtime
by the RulesEngine service.

Rules are intentionally program-specific: a 3-month VC accelerator may
flag a 7-day overdue milestone as critical, while a 12-month government
program may only warn after 30 days. The engine reads thresholds from
ProgramRuntime rather than hardcoding them.

Rule types:
    eligibility    — applied during application intake
    risk           — applied against cohort member data
    intervention   — triggers intervention recommendations
    milestone      — milestone overdue / evidence checks
    reporting      — triggers automated report generation

Condition schema (JSONField):
    {
      "when": {
        "milestone_overdue_days": {"gt": 7},
        "founder_engagement_score": {"lt": 0.4}
      },
      "operator": "AND"  # or "OR"
    }

Action schema (JSONField):
    {
      "create_risk_signal": {"type": "execution", "severity": "high"},
      "notify": {"role": "program_director", "message": "..."}
    }
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# 1. ProgramRule model
# ─────────────────────────────────────────────────────────────────────────────

class ProgramRule(models.Model):
    """
    A program-specific behavioral rule evaluated by the RulesEngine.

    Rules declaratively express policy decisions — what should happen when
    a specific combination of signals occurs in the program context.
    They are intentionally transparent: readable by program directors,
    auditable, and adjustable without code changes.
    """

    RULE_TYPE_CHOICES = [
        ("eligibility",   _("Eligibility")),
        ("risk",          _("Risk Detection")),
        ("intervention",  _("Intervention")),
        ("milestone",     _("Milestone")),
        ("reporting",     _("Reporting")),
    ]

    SEVERITY_CHOICES = [
        ("info",     _("Info")),
        ("warning",  _("Warning")),
        ("critical", _("Critical")),
    ]

    program = models.ForeignKey(
        "accelerator.AcceleratorProgram",
        on_delete=models.CASCADE,
        related_name="rules",
    )
    name = models.CharField(_("rule name"), max_length=200)
    description = models.TextField(_("description"), blank=True)
    rule_type = models.CharField(
        _("rule type"), max_length=20, choices=RULE_TYPE_CHOICES
    )
    severity = models.CharField(
        _("severity"), max_length=20, choices=SEVERITY_CHOICES, default="warning"
    )

    # ── Logic ────────────────────────────────────────────────────────────────
    # Structured condition expression evaluated against context data
    conditions = models.JSONField(
        _("conditions"),
        default=dict,
        help_text=_(
            '{"when": {"milestone_overdue_days": {"gt": 7}, '
            '"founder_engagement_score": {"lt": 0.4}}, "operator": "AND"}'
        ),
    )
    # Actions triggered when conditions evaluate to True
    actions = models.JSONField(
        _("actions"),
        default=dict,
        help_text=_(
            '{"create_risk_signal": {"type": "execution", "severity": "high"}, '
            '"notify": {"role": "program_director"}}'
        ),
    )

    is_active = models.BooleanField(_("active"), default=True)
    order = models.PositiveIntegerField(_("evaluation order"), default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_rules",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("program rule")
        verbose_name_plural = _("program rules")
        ordering = ["program", "rule_type", "order"]

    def __str__(self) -> str:
        return f"[{self.rule_type.upper()}] {self.name}"


# ─────────────────────────────────────────────────────────────────────────────
# 2. RulesEngine service
# ─────────────────────────────────────────────────────────────────────────────

class RulesEngine:
    """
    Evaluates program rules against a context dictionary.

    Design principles:
    - Rules are transparent and auditable — every evaluation records what
      matched, what didn't, and why.
    - The engine does NOT take automated action. It returns a list of matched
      rules + recommended actions for human approval (via Intervention Engine).
    - Conditions use a simple declarative schema — no code execution.

    Usage:
        engine = RulesEngine(program)
        results = engine.evaluate("risk", context={
            "milestone_overdue_days": 10,
            "founder_engagement_score": 0.35,
        })
        # results = [{"rule": ProgramRule, "matched": True, "actions": {...}}]
    """

    # Supported comparison operators for condition values
    _OPERATORS = {
        "eq":  lambda actual, val: actual == val,
        "ne":  lambda actual, val: actual != val,
        "gt":  lambda actual, val: actual is not None and actual > val,
        "gte": lambda actual, val: actual is not None and actual >= val,
        "lt":  lambda actual, val: actual is not None and actual < val,
        "lte": lambda actual, val: actual is not None and actual <= val,
        "in":  lambda actual, val: actual in val,
        "not_in": lambda actual, val: actual not in val,
        "contains": lambda actual, val: val in str(actual),
        "is_true":  lambda actual, val: bool(actual) is True,
        "is_false": lambda actual, val: bool(actual) is False,
    }

    def __init__(self, program: Any) -> None:
        self.program = program

    def evaluate(
        self,
        rule_type: str,
        context: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """
        Evaluate all active rules of the given type against the context.

        Returns a list of evaluation results:
        [
          {
            rule:    ProgramRule,
            matched: bool,
            actions: dict,
            evidence: [str],   # human-readable explanation of what matched
          }
        ]
        """
        rules = ProgramRule.objects.filter(
            program=self.program,
            rule_type=rule_type,
            is_active=True,
        ).order_by("order")

        results = []
        for rule in rules:
            matched, evidence = self._evaluate_conditions(rule.conditions, context)
            results.append({
                "rule": rule,
                "matched": matched,
                "actions": rule.actions if matched else {},
                "evidence": evidence,
                "severity": rule.severity,
            })

        return results

    def get_matched_actions(
        self,
        rule_type: str,
        context: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Convenience: return only matched rules with their actions."""
        return [r for r in self.evaluate(rule_type, context) if r["matched"]]

    def _evaluate_conditions(
        self,
        conditions: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[bool, list[str]]:
        """
        Evaluate a conditions dict against context.
        Returns (matched: bool, evidence: [str]).
        """
        when = conditions.get("when", {})
        operator = conditions.get("operator", "AND").upper()

        if not when:
            return False, []

        clause_results = []
        evidence = []

        for field, constraint in when.items():
            actual = context.get(field)
            clause_matched, clause_evidence = self._evaluate_constraint(
                field, actual, constraint
            )
            clause_results.append(clause_matched)
            if clause_evidence:
                evidence.append(clause_evidence)

        if operator == "AND":
            matched = all(clause_results)
        elif operator == "OR":
            matched = any(clause_results)
        else:
            matched = all(clause_results)

        return matched, evidence

    def _evaluate_constraint(
        self,
        field: str,
        actual: Any,
        constraint: Any,
    ) -> tuple[bool, str]:
        """
        Evaluate a single field constraint.

        Constraint can be:
          - A plain value:     {"field": "value"}
          - An operator dict:  {"field": {"gt": 7}}
        """
        if isinstance(constraint, dict):
            # Operator-based constraint — try each key as an operator
            for op, val in constraint.items():
                op_fn = self._OPERATORS.get(op)
                if op_fn is None:
                    logger.warning("rules_engine.unknown_operator op=%s", op)
                    return False, ""
                try:
                    matched = op_fn(actual, val)
                    if matched:
                        evidence = (
                            f"{field} {op} {val} "
                            f"(actual: {actual})"
                        )
                    else:
                        evidence = ""
                    return matched, evidence
                except TypeError:
                    return False, ""
            return False, ""
        else:
            # Direct equality check
            matched = actual == constraint
            return matched, (
                f"{field} == {constraint} (actual: {actual})" if matched else ""
            )


# ─────────────────────────────────────────────────────────────────────────────
# 3. Default rule templates (used by seed management command)
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_RISK_RULES: list[dict[str, Any]] = [
    {
        "name": "Milestone overdue — execution risk",
        "description": "Flag execution risk when a milestone is overdue beyond warn threshold.",
        "rule_type": "risk",
        "severity": "warning",
        "conditions": {
            "when": {"milestone_overdue_days": {"gt": 7}},
            "operator": "AND",
        },
        "actions": {
            "create_risk_signal": {"type": "execution", "severity": "warning"},
        },
    },
    {
        "name": "Milestone critical overdue + low engagement",
        "description": (
            "Critical execution risk when milestone is severely overdue "
            "AND founder engagement is low."
        ),
        "rule_type": "risk",
        "severity": "critical",
        "conditions": {
            "when": {
                "milestone_overdue_days": {"gt": 14},
                "founder_engagement_score": {"lt": 0.4},
            },
            "operator": "AND",
        },
        "actions": {
            "create_risk_signal": {"type": "execution", "severity": "critical"},
            "notify": {"role": "program_director", "urgency": "high"},
        },
    },
    {
        "name": "Revenue decline — financial risk",
        "description": "Warn when reported revenue declined materially period-over-period.",
        "rule_type": "risk",
        "severity": "warning",
        "conditions": {
            "when": {"revenue_growth_pct": {"lt": -0.20}},
            "operator": "AND",
        },
        "actions": {
            "create_risk_signal": {"type": "financial", "severity": "warning"},
        },
    },
    {
        "name": "Mentor engagement gap",
        "description": "Flag when a cohort member has had no mentor session in over 3 weeks.",
        "rule_type": "risk",
        "severity": "info",
        "conditions": {
            "when": {"days_since_last_mentor_session": {"gt": 21}},
            "operator": "AND",
        },
        "actions": {
            "create_risk_signal": {"type": "mentor", "severity": "info"},
            "notify": {"role": "program_manager", "urgency": "low"},
        },
    },
    {
        "name": "Check-in gap — engagement risk",
        "description": "Warn when no founder check-in has been received in over 2 weeks.",
        "rule_type": "risk",
        "severity": "warning",
        "conditions": {
            "when": {"days_since_last_checkin": {"gt": 14}},
            "operator": "AND",
        },
        "actions": {
            "create_risk_signal": {"type": "engagement", "severity": "warning"},
        },
    },
]
