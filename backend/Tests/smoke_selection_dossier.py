"""Rollback-only smoke: Selection Framework rows + Founder Evidence Graph.

Doctrine under test:
- A candidate dossier shows the program's OWN Selection Framework dimensions
  (names, labels, weights from the active policy) — never a fixed list that
  would show a dimension the program dropped, or hide one it added.
- ML confidence is only reported for a dimension the assessment actually
  scored; a custom dimension shows nothing rather than a borrowed number.
- The evidence graph's nodes and links are the stored claim→evidence
  relations, so an unverified claim draws with no outgoing edge, and a
  contradicted claim draws a contradicts edge. The claims ledger stays
  complete even when the drawing is capped.
- A candidate with no recorded committee decision reports final_decision
  None, not a placeholder.
"""
import os, django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accelerator import views_intel
from apps.accelerator.decision_room import DecisionRoom
from apps.accelerator.views_intel import GRAPH_NODE_LIMIT
from apps.accelerator.models import (
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationAssessment,
    ApplicationClaim,
    ClaimEvidence,
    CommitteeDecision,
    FounderApplicationProfile,
    StartupApplicationProfile,
)
from apps.accelerator.program_policy import ProgramEvaluationPolicy

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


with transaction.atomic():
    staff = User.objects.create_user(
        email="dossier-staff@x.io", password="x", role="accelerator",
        first_name="Dana", last_name="Staff",
    )
    founder_user = User.objects.create_user(email="dossier-founder@x.io", password="x", role="startup")

    prog = AcceleratorProgram.objects.create(
        name="Dossier Program", slug="dossier-prog", created_by=staff,
        sector_focus="fintech", stage_focus="seed",
    )
    # A framework the dashboard has never heard of: `moat` is new, `traction`
    # is gone. Only this list may appear in the dossier.
    ProgramEvaluationPolicy.objects.create(
        program=prog, version="v-dossier", is_active=True, created_by=staff,
        scoring_dimensions=[
            {"name": "moat", "label": "Technical Moat", "weight": 0.4, "description": "Defensibility."},
            {"name": "market", "label": "Market", "weight": 0.35, "description": "Market size."},
            {"name": "founder_quality", "label": "Founder Quality", "weight": 0.25, "description": "Team."},
        ],
    )

    sp = StartupApplicationProfile.objects.create(
        founder_profile=FounderApplicationProfile.objects.create(user=founder_user, full_name="F One"),
        company_name="DossierCo", declared_stage="seed", product_stage="mvp",
        revenue_status="pre_revenue", sector_tags="fintech", industry="payments", geography="NG",
    )
    app = AcceleratorApplication.objects.create(
        program=prog, startup_profile=sp, submitted_by=staff,
        status="COMMITTEE_REVIEW", submitted_at=timezone.now(),
        program_fit_score=61.0, startup_strength_score=55.0,
        evidence_confidence_score=48.0, founder_score=70.0,
        automated_screening_tier="B",
    )
    ApplicationAssessment.objects.create(
        application=app, market_score=60.0, market_confidence=0.4,
        founder_score=70.0, founder_confidence=0.72,
    )

    # ── 1. Selection Framework rows ─────────────────────────────────────────
    card = DecisionRoom(prog).get_candidate_card(app)
    names = [d["name"] for d in card["dimension_scores"]]
    labels = [d["label"] for d in card["dimension_scores"]]
    ok("rows are the program's own dimensions, in policy order", names == ["moat", "market", "founder_quality"])
    ok("labels come from the policy", labels == ["Technical Moat", "Market", "Founder Quality"])
    ok("dropped dimension is not shown", "traction" not in names)
    by_name = {d["name"]: d for d in card["dimension_scores"]}
    ok("weights carried per row", abs(sum(d["weight"] for d in card["dimension_scores"]) - 1.0) < 1e-6)
    ok("confidence matched by name token", by_name["founder_quality"]["confidence"] == 72.0)
    ok("market confidence scaled", by_name["market"]["confidence"] == 40.0)
    ok("unscored custom dimension reports None", by_name["moat"]["confidence"] is None)
    ok("score is a number per row", all(isinstance(d["score"], float) for d in card["dimension_scores"]))

    # ── 2. Dossier honesty: submission, reviews, decision ────────────────────
    ok("submitted_at exposed", bool(card["submitted_at"]))
    ok("no scorecard yet → mean conviction None", card["mean_human_conviction"] is None)
    ok("no reviewers yet → empty list", card["reviewers"] == [])
    ok("open candidate has no recorded decision rows", card["committee_decisions"] == [])
    summary = DecisionRoom(prog).get_selection_summary()
    row = [c for c in summary["candidates"] if c["application_id"] == app.id][0]
    ok("summary: undecided candidate has null final_decision", row["final_decision"] is None)
    ok("summary: vote tally is the server structure", set(["yes", "total_votes", "quorum_met"]) <= set(row["votes"].keys()))

    CommitteeDecision.objects.create(
        application=app, decision="ACCEPTED", decided_by=staff,
        notes="Unanimous after diligence.", decided_at=timezone.now(),
    )
    summary2 = DecisionRoom(prog).get_selection_summary()
    row2 = [c for c in summary2["candidates"] if c["application_id"] == app.id][0]
    fd = row2["final_decision"]
    ok("decided candidate reports the decision", fd and fd["decision"] == "ACCEPTED")
    ok("decider name is real", bool(fd and fd["decided_by"]))
    ok("decision date is real", bool(fd and fd["decided_at"]))
    ok("rationale carried", fd and fd["rationale"] == "Unanimous after diligence.")

    # ── 3. Evidence graph nodes and links ────────────────────────────────────
    def claim(text, status_v, materiality="high", with_evidence=False):
        c = ApplicationClaim.objects.create(
            application=app, claim_text=text, category="commercial_traction",
            materiality=materiality, source="application_answer", verification_status=status_v,
        )
        if with_evidence:
            ClaimEvidence.objects.create(claim=c, claimed_count=100, documents_found=82, confidence=0.8)
        return c

    claim("100 signed LOIs", "verified", "critical", with_evidence=True)
    claim("NGN 40m MRR", "contradicted", "critical", with_evidence=True)
    claim("Enterprise pilot in flight", "pending", "high")

    req = factory.get("/api/v1/accelerator/evidence-graph/")
    force_authenticate(req, user=staff)
    graph = views_intel.EvidenceGraphView.as_view()(req, application_id=app.pk).data

    nodes = {n["id"]: n for n in graph["graph"]["nodes"]}
    links = graph["graph"]["links"]
    claim_nodes = [n for n in graph["graph"]["nodes"] if n["kind"] == "claim"]
    ev_nodes = [n for n in graph["graph"]["nodes"] if n["kind"] == "evidence"]
    ok("one application node", sum(1 for n in graph["graph"]["nodes"] if n["kind"] == "application") == 1)
    ok("claim nodes match claim rows", len(claim_nodes) == 3)
    ok("evidence nodes only where ClaimEvidence exists", len(ev_nodes) == 2)
    ok("every claim is asserted by the application", sum(1 for l in links if l["kind"] == "asserted") == 3)
    kinds = {
        next(n["label"] for n in claim_nodes if n["id"] == l["source"]): l["kind"]
        for l in links if l["kind"] != "asserted"
    }
    ok("contradicted claim links as contradicts", kinds["NGN 40m MRR"] == "contradicts")
    ok("verified claim links as supports", kinds["100 signed LOIs"] == "supports")
    ok("pending claim draws no evidence edge", "Enterprise pilot in flight" not in kinds)
    ok("link endpoints all resolve to nodes", all(l["source"] in nodes and l["target"] in nodes for l in links))
    ok("summary counts unchanged by the graph", graph["summary"]["total"] == 3 and graph["summary"]["contradicted"] == 1)
    ok("graph not truncated below the cap", graph["graph"]["truncated"] is False)

    # ── 4. Truncation says so instead of silently shrinking ──────────────────
    for i in range(GRAPH_NODE_LIMIT + 5):
        claim(f"Filler claim {i}", "unverified", "low")
    req2 = factory.get("/api/v1/accelerator/evidence-graph/")
    force_authenticate(req2, user=staff)
    big = views_intel.EvidenceGraphView.as_view()(req2, application_id=app.pk).data
    ok("drawing caps claim nodes", sum(1 for n in big["graph"]["nodes"] if n["kind"] == "claim") == GRAPH_NODE_LIMIT)
    ok("cap is flagged", big["graph"]["truncated"] is True)
    ok("claims ledger stays complete", len(big["claims"]) == GRAPH_NODE_LIMIT + 8)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
