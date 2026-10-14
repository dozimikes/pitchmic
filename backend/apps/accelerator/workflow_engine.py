"""
apps.accelerator.workflow_engine
================================
The runtime state machine for the Workflow OS.

The visual builder (``/programs/{id}/workflow``) persists its definition into
``ProgramStage`` + ``StageTransition`` rows via :func:`sync_graph_from_config`.
Every status change an application makes is validated against those rows by
:func:`validate_transition` before it is allowed. When a program has not been
customised yet, a deterministic default admissions spine is seeded so gating
behaves sanely out of the box.

Design guarantees carried from the spec:
  * The workflow definition lives in the database (not hard-coded ``if status``
    branches) so each accelerator owns its process.
  * Validation is deterministic. No AI decides whether a transition is legal.
  * A terminal stage (a decision state) has no outgoing edges by default.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# A conservative default admissions spine, expressed with the same slugs as
# AcceleratorApplication.STATUS_CHOICES so the builder, runtime and Kanban align.
DEFAULT_STAGES: list[dict[str, Any]] = [
    {"slug": "DRAFT", "label": "Draft", "type": "form", "terminal": False, "entry": True},
    {"slug": "SUBMITTED", "label": "Submitted", "type": "form", "terminal": False},
    {"slug": "SCREENING", "label": "Screening", "type": "screening", "terminal": False},
    {"slug": "SHORTLISTED", "label": "Shortlisted", "type": "review", "terminal": False},
    {"slug": "INTERVIEW_INVITED", "label": "Interview", "type": "interview", "terminal": False},
    {"slug": "INTERVIEW_COMPLETE", "label": "Interview Complete", "type": "interview", "terminal": False},
    {"slug": "COMMITTEE_REVIEW", "label": "Committee", "type": "committee", "terminal": False},
    {"slug": "ACCEPTED", "label": "Selected", "type": "approval", "terminal": True},
    {"slug": "REJECTED", "label": "Rejected", "type": "approval", "terminal": True},
    {"slug": "WAITLISTED", "label": "Waitlisted", "type": "approval", "terminal": False},
    {"slug": "EVIDENCE_REQUESTED", "label": "Due Diligence", "type": "due_diligence", "terminal": False},
]

DEFAULT_TRANSITIONS: list[dict[str, str]] = [
    {"from_stage": "DRAFT", "to_stage": "SUBMITTED", "label": "Submit"},
    {"from_stage": "SUBMITTED", "to_stage": "SCREENING", "label": "Begin screening"},
    {"from_stage": "SUBMITTED", "to_stage": "REJECTED", "label": "Reject"},
    {"from_stage": "SCREENING", "to_stage": "SHORTLISTED", "label": "Shortlist"},
    {"from_stage": "SCREENING", "to_stage": "REJECTED", "label": "Reject"},
    {"from_stage": "SHORTLISTED", "to_stage": "INTERVIEW_INVITED", "label": "Invite to interview"},
    {"from_stage": "SHORTLISTED", "to_stage": "EVIDENCE_REQUESTED", "label": "Request DD"},
    {"from_stage": "INTERVIEW_INVITED", "to_stage": "INTERVIEW_COMPLETE", "label": "Complete interview"},
    {"from_stage": "INTERVIEW_COMPLETE", "to_stage": "COMMITTEE_REVIEW", "label": "Send to committee"},
    {"from_stage": "COMMITTEE_REVIEW", "to_stage": "ACCEPTED", "label": "Select"},
    {"from_stage": "COMMITTEE_REVIEW", "to_stage": "REJECTED", "label": "Reject"},
    {"from_stage": "COMMITTEE_REVIEW", "to_stage": "WAITLISTED", "label": "Waitlist"},
    {"from_stage": "EVIDENCE_REQUESTED", "to_stage": "COMMITTEE_REVIEW", "label": "DD done -> committee"},
    {"from_stage": "WAITLISTED", "to_stage": "ACCEPTED", "label": "Promote"},
    {"from_stage": "WAITLISTED", "to_stage": "REJECTED", "label": "Reject"},
    # Reviewer-action edges: Hold (defer) and Reject must be legal from every
    # active (non-terminal) stage — a reviewer can stop or decline an
    # application at any point before a decision is made.
    {"from_stage": "SUBMITTED", "to_stage": "DEFERRED", "label": "Hold"},
    {"from_stage": "SCREENING", "to_stage": "DEFERRED", "label": "Hold"},
    {"from_stage": "SHORTLISTED", "to_stage": "DEFERRED", "label": "Hold"},
    {"from_stage": "SHORTLISTED", "to_stage": "REJECTED", "label": "Reject"},
    {"from_stage": "INTERVIEW_INVITED", "to_stage": "DEFERRED", "label": "Hold"},
    {"from_stage": "INTERVIEW_INVITED", "to_stage": "REJECTED", "label": "Reject"},
    {"from_stage": "INTERVIEW_COMPLETE", "to_stage": "DEFERRED", "label": "Hold"},
    {"from_stage": "INTERVIEW_COMPLETE", "to_stage": "REJECTED", "label": "Reject"},
    {"from_stage": "INTERVIEW_COMPLETE", "to_stage": "WAITLISTED", "label": "Waitlist"},
    {"from_stage": "EVIDENCE_REQUESTED", "to_stage": "DEFERRED", "label": "Hold"},
    {"from_stage": "EVIDENCE_REQUESTED", "to_stage": "REJECTED", "label": "Reject"},
    {"from_stage": "WAITLISTED", "to_stage": "DEFERRED", "label": "Hold"},
    {"from_stage": "DEFERRED", "to_stage": "SCREENING", "label": "Resume review"},
    {"from_stage": "DEFERRED", "to_stage": "SHORTLISTED", "label": "Shortlist"},
    {"from_stage": "DEFERRED", "to_stage": "REJECTED", "label": "Reject"},
]


def _graph_is_empty(program) -> bool:
    return not program.stages.exists()


def _backfill_default_edges(program) -> None:
    """Surface newly added spine edges (Hold/Reject reviewer actions) for
    programs still running an unmodified default graph.

    Only missing edges whose both endpoints already exist as stages are added,
    and only when the stored transition set is a subset of DEFAULT_TRANSITIONS
    (i.e. the graph was never customised via the builder).
    """
    stored = (program.workflow_config or {}).get("transitions")
    if not isinstance(stored, list) or not stored:
        return
    stored_set = {(t.get("from_stage"), t.get("to_stage")) for t in stored}
    default_set = {(t["from_stage"], t["to_stage"]) for t in DEFAULT_TRANSITIONS}
    if stored_set >= default_set or not stored_set <= default_set:
        return  # customised graph, or already current
    by_slug = {s.slug: s for s in program.stages.all()}
    added = False
    for t in DEFAULT_TRANSITIONS:
        key = (t["from_stage"], t["to_stage"])
        if key in stored_set or key[0] not in by_slug or key[1] not in by_slug:
            continue
        program.transitions.create(
            from_stage=by_slug[key[0]], to_stage=by_slug[key[1]],
            label=t.get("label", ""), order=len(stored_set) + 1,
        )
        stored.append({"from_stage": key[0], "to_stage": key[1], "label": t.get("label", "")})
        added = True
    if added:
        program.workflow_config = {**(program.workflow_config or {}), "transitions": stored}
        program.save(update_fields=["workflow_config", "updated_at"])
        logger.info("workflow_engine.backfilled_edges program_id=%s", program.pk)


def ensure_default_graph(program) -> None:
    """Materialise the default spine into ProgramStage/StageTransition rows and
    mirror it into ``workflow_config`` (kept as the builder's wire format)."""
    if not _graph_is_empty(program):
        _backfill_default_edges(program)
        return
    slug_to_stage = {}
    for idx, s in enumerate(DEFAULT_STAGES):
        stage = program.stages.create(
            slug=s["slug"], name=s["label"], type=s["type"], order=idx,
            is_entry=s.get("entry", False), is_terminal=s.get("terminal", False),
        )
        slug_to_stage[s["slug"]] = stage
    for idx, t in enumerate(DEFAULT_TRANSITIONS):
        frm, to = slug_to_stage.get(t["from_stage"]), slug_to_stage.get(t["to_stage"])
        if frm and to:
            program.transitions.create(
                from_stage=frm, to_stage=to, label=t.get("label", ""), order=idx
            )
    program.workflow_config = {
        "stages": [{"slug": s["slug"], "label": s["label"],
                    "terminal": s.get("terminal", False)} for s in DEFAULT_STAGES],
        "transitions": DEFAULT_TRANSITIONS,
    }
    program.save(update_fields=["workflow_config", "updated_at"])
    logger.info("workflow_engine.seeded_default program_id=%s", program.pk)


def sync_graph_from_config(program, style: str, stages: list[dict], transitions: list[dict]) -> dict:
    """Replace the program's stage/transition rows to match the builder payload.

    ``stages`` is a list of {slug, label, description?, terminal?}; ``transitions``
    a list of {from_stage, to_stage, label?}. Returns the normalised config.
    """
    from .models_config import ProgramStage, StageTransition

    if style:
        program.workflow_style = style

    program.stages.all().delete()  # cascades to transitions
    slug_to_stage: dict[str, ProgramStage] = {}
    for idx, s in enumerate(stages):
        stage = ProgramStage.objects.create(
            program=program, slug=s["slug"], name=s.get("label") or s["slug"],
            type=s.get("type", "custom"), description=s.get("description", ""),
            order=idx, is_terminal=bool(s.get("terminal", False)),
            is_entry=bool(s.get("entry", False)) or (idx == 0 and not any(x.get("entry") for x in stages)),
            config=s.get("config", {}),
        )
        slug_to_stage[s["slug"]] = stage

    norm_transitions = []
    for idx, t in enumerate(transitions):
        frm, to = slug_to_stage.get(t["from_stage"]), slug_to_stage.get(t["to_stage"])
        if not (frm and to):
            continue
        StageTransition.objects.create(
            program=program, from_stage=frm, to_stage=to,
            label=t.get("label", ""), order=idx, condition=t.get("condition", {}),
        )
        norm_transitions.append({
            "from_stage": t["from_stage"], "to_stage": t["to_stage"], "label": t.get("label", ""),
        })

    program.workflow_config = {
        "stages": [{"slug": s["slug"], "label": s.get("label", s["slug"]),
                    "terminal": bool(s.get("terminal", False))} for s in stages],
        "transitions": norm_transitions,
    }
    program.save(update_fields=["workflow_style", "workflow_config", "updated_at"])
    return program.workflow_config


def load_graph(program) -> tuple[list[str], set[tuple[str, str]], set[str]]:
    """Return (ordered_stage_slugs, edge_set, terminal_slugs)."""
    ensure_default_graph(program)
    stages = list(program.stages.order_by("order", "id").values_list("slug", flat=True))
    edges = {
        (t.from_stage.slug, t.to_stage.slug)
        for t in program.transitions.select_related("from_stage", "to_stage").all()
    }
    terminals = set(program.stages.filter(is_terminal=True).values_list("slug", flat=True))
    return stages, edges, terminals


def validate_transition(program, from_slug: str, to_slug: str) -> tuple[bool, str]:
    """Deterministically decide whether ``from_slug -> to_slug`` is a legal move.

    Rules:
      * Same state -> no-op, allowed.
      * Unknown destination slug -> rejected (caller validated against STATUS_CHOICES).
      * Terminal source -> rejected unless it is a defined edge (e.g. waitlist promote).
      * If the program has an explicit transition for that edge -> allowed.
      * Legacy DRAFT moves are always permitted so onboarding is not blocked before a
        graph exists (ensure_default_graph seeds one, but be permissive for DRAFT).
    """
    _, edges, terminals = load_graph(program)
    if from_slug == to_slug:
        return True, ""
    if (from_slug, to_slug) in edges:
        return True, ""
    if from_slug in terminals:
        return False, f"'{from_slug}' is a terminal stage and cannot move to '{to_slug}'."
    if from_slug == "DRAFT":
        return True, ""
    return False, f"Transition '{from_slug} → {to_slug}' is not allowed by this program's workflow."


def allowed_next(program, from_slug: str) -> list[str]:
    _, edges, _ = load_graph(program)
    return sorted({to for (frm, to) in edges if frm == from_slug})
