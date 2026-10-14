"""Rollback-only smoke: ApplicationClaim materiality ordering.

Doctrine under test:
- "Most material first" is stated once, on the model, by the server. The
  materiality column holds text, so the default ORDER BY sorted it
  alphabetically and put "low" ahead of "medium" — which silently corrupted
  every cap that trusted it (evidence graph nodes, interview claim probes,
  decision dossier ledger).
- The rank is derived from the choices declaration, so adding or reordering a
  level cannot leave the ordering stale.
- An unlisted value is not "low": it sorts last instead of winning on alphabet.
- The order is total. Rows written in one clock tick share a created_at, and the
  caps that truncate on this sort must pick the same rows on the next read.
"""
import os
import uuid
from datetime import timedelta

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from apps.accelerator import interview_guide as ig
from apps.accelerator import views_intel as iv
from apps.accelerator.models import (
    CLAIM_MATERIALITY_CHOICES,
    CLAIM_MATERIALITY_RANK,
    AcceleratorApplication,
    AcceleratorProgram,
    ApplicationClaim,
    FounderApplicationProfile,
    StartupApplicationProfile,
    materiality_ordering,
)

User = get_user_model()
factory = APIRequestFactory()
checks = []


def ok(name, cond):
    checks.append((name, bool(cond)))


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    staff = User.objects.create_user(email=f"mo-staff-{tag}@x.io", password="x", role="accelerator")
    prog = AcceleratorProgram.objects.create(
        name=f"Ordering Program {tag}", slug=f"ordering-{tag}", created_by=staff,
        sector_focus="fintech", stage_focus="seed",
    )
    def make_app(company):
        """One founder user per startup profile — the profile is 1:1 with user."""
        owner = User.objects.create_user(email=f"mo-{uuid.uuid4().hex[:8]}@x.io", password="x", role="startup")
        sp = StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=owner, full_name=f"F {company}"),
            company_name=company, declared_stage="seed", product_stage="mvp",
            revenue_status="pre_revenue", sector_tags="fintech", industry="payments", geography="NG",
        )
        return AcceleratorApplication.objects.create(
            program=prog, startup_profile=sp, submitted_by=staff, status="SCREENING",
        )

    app = make_app(f"OrderCo {tag}")

    def claim(text, materiality, **kw):
        defaults = dict(
            application=app, claim_text=text, category="other",
            materiality=materiality, source="application_answer",
        )
        defaults.update(kw)
        return ApplicationClaim.objects.create(**defaults)

    # ── 1. The rank cannot drift from the declared choices ───────────────────
    ok("rank covers exactly the choices",
       list(CLAIM_MATERIALITY_RANK) == [v for v, _ in CLAIM_MATERIALITY_CHOICES])
    ok("rank covers the model field choices",
       set(CLAIM_MATERIALITY_RANK) == {v for v, _ in ApplicationClaim.MATERIALITY_CHOICES})
    ok("critical is the most material", CLAIM_MATERIALITY_RANK["critical"] == 0)
    ok("medium outranks low", CLAIM_MATERIALITY_RANK["medium"] < CLAIM_MATERIALITY_RANK["low"])
    ok("default ordering is an expression, not the text column",
       not any(isinstance(o, str) and o.lstrip("-") == "materiality"
               for o in ApplicationClaim._meta.ordering))

    # ── 2. Insertion order is deliberately worst-first ───────────────────────
    low = claim("Low: logo wall", "low")
    med = claim("Medium: pipeline value", "medium")
    high = claim("High: ARR", "high")
    crit = claim("Critical: signed contracts", "critical")
    weird = claim("Unlisted level", "blockchain")

    got = list(app.claims.values_list("pk", flat=True))
    ok("claims read most material first", got == [crit.pk, high.pk, med.pk, low.pk, weird.pk])
    ok("medium is never behind low", got.index(med.pk) < got.index(low.pk))
    ok("unlisted materiality sorts last", got[-1] == weird.pk)
    ok("explicit order_by matches the model default",
       list(app.claims.order_by(*materiality_ordering()).values_list("pk", flat=True)) == got)
    ok("the default ordering carries the pk tiebreak, not just rank and time",
       len(ApplicationClaim._meta.ordering) == 3
       and ApplicationClaim._meta.ordering[-1] == "-pk")

    # Newest first inside one materiality band.
    now = timezone.now()
    older_high = claim("High: older statement", "high")
    ApplicationClaim.objects.filter(pk=high.pk).update(created_at=now - timedelta(days=3))
    ApplicationClaim.objects.filter(pk=older_high.pk).update(created_at=now - timedelta(days=9))
    band = [c.pk for c in app.claims.all() if c.materiality == "high"]
    ok("ties break newest first", band == [high.pk, older_high.pk])

    # The case that actually bit: two rows written inside one clock tick carry an
    # identical created_at, so "newest first" names no winner. Every consumer
    # below truncates on this order — graph nodes, interview probes — so an
    # unresolved tie means the same application shows a different claim set on
    # the next read.
    ApplicationClaim.objects.filter(pk__in=[high.pk, older_high.pk]).update(created_at=now)
    tied = [c.pk for c in app.claims.all() if c.materiality == "high"]
    ok("an exact timestamp collision resolves to the later insert",
       tied == [older_high.pk, high.pk])
    ok("and reading it again gives the same answer",
       [c.pk for c in app.claims.all() if c.materiality == "high"] == tied)

    # ── 3. The evidence graph cap keeps the right rows ───────────────────────
    big = make_app(f"GraphCo {tag}")
    b_crit = [claim(f"Graph critical {i}", "critical", application=big) for i in range(3)]
    b_high = [claim(f"Graph high {i}", "high", application=big) for i in range(2)]
    b_med = claim("Graph medium that must survive the cap", "medium", application=big)
    for i in range(40):
        claim(f"Graph low {i}", "low", application=big)

    # Calling the view directly skips DRF's request wrapper, and the graph now
    # scopes through it: the caller has to be someone who works the program.
    graph_request = factory.get("/")
    graph_request.user = staff
    resp = iv.EvidenceGraphView().get(graph_request, application_id=big.pk)
    data = resp.data
    node_claim_ids = {int(n["id"].split(":")[1]) for n in data["graph"]["nodes"] if n["kind"] == "claim"}
    ok("graph carries every claim row", len(data["claims"]) == 46)
    ok("graph nodes respect the claim cap", len(node_claim_ids) == iv.GRAPH_NODE_LIMIT)
    ok("graph truncation is disclosed", data["graph"]["truncated"] is True)
    ok("cap keeps the critical claims", all(c.pk in node_claim_ids for c in b_crit))
    ok("cap keeps the high claims", all(c.pk in node_claim_ids for c in b_high))
    ok("cap no longer drops a medium claim behind the lows", b_med.pk in node_claim_ids)
    ok("claim payload is materiality-ranked",
       [c["materiality"] for c in data["claims"]] == ["critical"] * 3 + ["high"] * 2 + ["medium"] + ["low"] * 40)

    # ── 4. Interview probes ask the most material open claim first ───────────
    many = make_app(f"ProbeCo {tag}")
    p_crit = claim("Probe critical", "critical", application=many, verification_status="unverified")
    p_high = claim("Probe high", "high", application=many, verification_status="pending")
    p_med = claim("Probe medium", "medium", application=many, verification_status="unverified")
    p_low = [claim(f"Probe low {i}", "low", application=many, verification_status="unverified")
             for i in range(5)]
    guide = ig.build_interview_guide(many)
    probe_ids = [int(p["key"].split("-")[-1]) for p in guide["probes"] if p["key"].startswith("q-claim-")]
    ok("claim probes respect the probe cap", len(probe_ids) == ig._MAX_CLAIM_PROBES)
    ok("first probe is the critical claim", probe_ids[0] == p_crit.pk)
    # Within the low band the newest rows win the probe slots, as in test 2.
    newest_low_first = [c.pk for c in list(reversed(p_low))[:3]]
    ok("probes are asked in materiality order",
       probe_ids == [p_crit.pk, p_high.pk, p_med.pk] + newest_low_first)
    ok("probe ties break newest first", probe_ids[3:] == newest_low_first)
    ok("medium claim is not pushed out by the lows", p_med.pk in probe_ids)

    transaction.set_rollback(True)

failed = [n for n, c in checks if not c]
print(f"checks: {len(checks)}  passed: {len(checks) - len(failed)}")
for f in failed:
    print("FAILED:", f)
raise SystemExit(1 if failed else 0)
