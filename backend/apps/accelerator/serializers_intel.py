"""
apps.accelerator.serializers_intel
==================================
Serializers for the Program OS intelligence layer: Program Memory & Analytics
(memory entries, dashboard widget configs), the Program Blueprint system, and
the Evidence Graph payload shape.

Mirrors the conventions established in ``serializers_config``:
  * program FK exposed as a write-only ``program_id`` primary key field;
  * JSON payload fields passed through as-is (validated by the models);
  * deterministic — no AI in the (de)serialisation path.
"""
from __future__ import annotations

from rest_framework import serializers

from . import evidence_state
from .models import AcceleratorProgram
from .models_os import DashboardWidgetConfig, ProgramBlueprint, ProgramMemoryEntry


def _program_id_field(queryset=None, **kwargs):
    kwargs.setdefault("write_only", True)
    return serializers.PrimaryKeyRelatedField(
        queryset=queryset or AcceleratorProgram.objects.all(),
        source="program",
        **kwargs,
    )


# ─── Program Memory & Analytics OS ───────────────────────────────────────────

class ProgramMemoryEntrySerializer(serializers.ModelSerializer):
    program_id = _program_id_field()
    program_name = serializers.CharField(source="program.name", read_only=True)
    memory_type_display = serializers.CharField(
        source="get_memory_type_display", read_only=True
    )

    class Meta:
        model = ProgramMemoryEntry
        fields = [
            "id", "program_id", "program_name", "cycle", "memory_type",
            "memory_type_display", "title", "description", "evidence",
            "confidence", "is_actionable", "suggested_change", "created_by",
            "created_at",
        ]
        read_only_fields = ["created_at", "created_by"]

    def validate(self, attrs):
        """A memory entry filed under one program cannot cite another program's
        cycle: the cycle is where the memory happened, and a mismatched pair
        would let a write scoped to program A record a fact about program B.
        """
        attrs = super().validate(attrs)
        cycle = attrs.get("cycle", getattr(self.instance, "cycle", None))
        program = attrs.get("program") or getattr(self.instance, "program", None)
        if cycle is not None and program is not None and cycle.program_id != program.pk:
            raise serializers.ValidationError({
                "cycle": "That cycle belongs to a different program, so nothing "
                         "it contains can be remembered under this one."
            })
        return attrs


class DashboardWidgetConfigSerializer(serializers.ModelSerializer):
    program_id = _program_id_field()
    program_name = serializers.CharField(source="program.name", read_only=True)

    class Meta:
        model = DashboardWidgetConfig
        fields = [
            "id", "program_id", "program_name", "role", "user",
            "widgets", "nav_items", "quick_actions", "metric_cards",
            "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


# ─── Program Blueprint system ────────────────────────────────────────────────

class ProgramBlueprintSerializer(serializers.ModelSerializer):
    """Blueprints are org-scoped templates that snapshot a program's runtime
    configuration. ``source_program`` links the program the blueprint was
    saved from; ``is_published`` gates availability to the clone wizard."""

    organization_name = serializers.CharField(
        source="organization.name", read_only=True
    )
    source_program_name = serializers.CharField(
        source="source_program.name", read_only=True
    )

    class Meta:
        model = ProgramBlueprint
        fields = [
            "id", "name", "blueprint_version", "description", "program_type",
            "workflow_snapshot", "form_snapshot", "policy_snapshot",
            "module_config_snapshot", "branding_snapshot", "portal_snapshot",
            "curriculum_snapshot", "milestone_snapshot", "automation_snapshot",
            "notification_snapshot", "is_published", "organization",
            "organization_name", "source_program", "source_program_name",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]


# ─── Evidence Graph (documented response shape; the endpoint builds it by
#     hand in views_intel so the traversal stays deterministic) ───────────────

class EvidenceGraphSerializer(serializers.Serializer):
    """Documents the Founder Evidence Graph response shape (read-only)."""

    application_id = serializers.IntegerField(read_only=True)
    company_name = serializers.CharField(read_only=True)
    claims = serializers.ListField(child=serializers.DictField(), read_only=True)
    summary = serializers.DictField(read_only=True)


# ─── Claim verification (the only write body a claim accepts) ────────────────

class ClaimVerificationSerializer(serializers.Serializer):
    """A human's decision about what the evidence attached to a claim shows.

    Two fields, and neither of them is the outcome-by-inference the rest of the
    system is careful not to produce: `state` names what the reviewer concluded
    and `note` says why. When it happened, who did it and what the claim was
    before are all derived by the view — a client that could send `verified_at`
    would be reporting a fact the server knows better, and a client that could
    send the previous state would be writing the audit trail by hand.
    """

    state = serializers.CharField()
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_state(self, value):
        code = str(value or "").strip()
        if not evidence_state.is_state(code):
            raise serializers.ValidationError(
                f"'{code}' is not a state a claim can hold. The model carries: "
                f"{', '.join(sorted(evidence_state.LABELS))}."
            )
        return code

    def validate(self, attrs):
        claim = self.context["claim"]
        state = attrs["state"]
        note = (attrs.get("note") or "").strip()

        if state == evidence_state.PENDING and claim.verification_status == evidence_state.PENDING:
            raise serializers.ValidationError({
                "state": "This claim has not been decided yet, so there is nothing "
                         "to send back to pending. Record what the evidence shows."
            })
        if state in evidence_state.EVIDENCE_REQUIRED_STATES and not (
            evidence_state.corroborating_evidence(claim)
        ):
            # `verified` is the one state whose note stays optional: a document in
            # hand is the reason. Everything else has to be said in words.
            raise serializers.ValidationError({
                "state": "Nothing is attached to this claim to check it against, so "
                         "'verified' would record only that a button was pressed. "
                         "Attach the document or record the verification result "
                         "first; a claim an interview alone supports stays for a "
                         "human to decide on the evidence."
            })
        if state in evidence_state.NOTE_REQUIRED_STATES and not note:
            raise serializers.ValidationError({
                "note": "Say what the evidence showed. A decision without its "
                        "reason is a mood, and the next reader cannot disagree "
                        "with something specific."
            })
        attrs["note"] = note
        return attrs
