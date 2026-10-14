"""Rollback-only smoke: eligibility engine + report + director override.

Asserts the doctrine: eligibility is computed by ONE engine for both the
founder self-check and the dashboard, missing data degrades to uncertain
(never a fabricated failure), buckets are exclusive, and gate overrides are
Director-only, justification-required, and stamped in the audit ledger.
"""
import os, uuid, django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.test import APIRequestFactory
from rest_framework.request import Request
from rest_framework.parsers import JSONParser
from rest_framework.exceptions import PermissionDenied

from apps.accelerator.models import (
    AcceleratorProgram, AcceleratorApplication, StartupApplicationProfile,
    FounderApplicationProfile, ApplicationAuditEvent,
)
from apps.accelerator.models_os import ProgramStaffMembership
from apps.accelerator import eligibility as eng
from apps.accelerator import views as acc_views
from apps.accelerator.serializers import AcceleratorProgramDetailSerializer

User = get_user_model()
factory = APIRequestFactory()
checks = []


def call_view(view_cls, req, method, **kwargs):
    vs = view_cls()
    vs.request = req
    vs.kwargs = kwargs
    return getattr(vs, method)(req, **{k: v for k, v in kwargs.items() if k != "fmt"})


def get_req(path, params=None):
    req = Request(factory.get(path, params or {}), parsers=[JSONParser()])
    return req


def post_req(path, payload=None):
    return Request(factory.post(path, payload or {}, format="json"), parsers=[JSONParser()])


class Roll(Exception):
    pass


with transaction.atomic():
    tag = uuid.uuid4().hex[:6]
    owner = User.objects.create_user(email=f"el-owner-{tag}@x.io", password="x", role="accelerator")
    staffish = User.objects.create_user(email=f"el-staff-{tag}@x.io", password="x", role="accelerator")
    investor = User.objects.create_user(email=f"el-inv-{tag}@x.io", password="x", role="investor")
    founder = User.objects.create_user(email=f"el-f-{tag}@x.io", password="x", role="startup")

    prog = AcceleratorProgram.objects.create(
        name=f"Elig Program {tag}",
        slug=f"elig-program-{tag}",
        created_by=owner,
        sector_focus="fintech", stage_focus="seed",
        eligibility_rules={
            "geography_whitelist": ["NG"],
            "incorporated_required": True,
            "full_time_required": True,
            "previous_funding_max_usd": 500000,
            "min_team_size": 2,
        },
    )

    def make_app(name, *, country, full_time, incorporated=True, stage="seed",
                 sector="fintech", funding=0, employees=2, status="SUBMITTED"):
        person = User.objects.create_user(email=f"el-{name.lower()}-{tag}@x.io", password="x", role="startup")
        fp = FounderApplicationProfile.objects.create(
            user=person, full_name=f"{name} Founder", country=country,
            full_time_status=full_time,
        )
        sp = StartupApplicationProfile.objects.create(
            founder_profile=fp, company_name=name, declared_stage=stage,
            sector_tags=sector, industry=sector, incorporated=incorporated,
            incorporation_country=country, employee_count=employees,
            total_funding_raised_usd=funding,
        )
        return AcceleratorApplication.objects.create(
            program=prog, startup_profile=sp, submitted_by=founder, status=status,
        )

    a_ok = make_app("OkCo", country="NG", full_time=True)
    # Screened with full data: the ONLY route to "eligible" is passing rules
    # AND real completeness — an unscreened app (score 0) honestly lands in
    # needs_verification, never in the eligible lane.
    a_ok.application_completeness_score = 85
    a_ok.save(update_fields=["application_completeness_score", "updated_at"])
    a_bad = make_app("BadCo", country="DE", full_time=False)
    a_unknown = make_app("BlankCo", country="", full_time=True)
    a_rej = make_app("RejCo", country="NG", full_time=True, status="REJECTED")
    draft_person = User.objects.create_user(email=f"el-draft-{tag}@x.io", password="x", role="startup")
    AcceleratorApplication.objects.create(
        program=prog,
        startup_profile=StartupApplicationProfile.objects.create(
            founder_profile=FounderApplicationProfile.objects.create(user=draft_person, full_name="Draft"),
            company_name="DraftCo",
        ),
        submitted_by=founder, status="DRAFT",
    )

    # ── 1. Engine: pure rule evaluation ─────────────────────────────────────
    e_ok = eng.evaluate_program_eligibility(prog, eng.facts_from_application(a_ok))
    e_bad = eng.evaluate_program_eligibility(prog, eng.facts_from_application(a_bad))
    e_unk = eng.evaluate_program_eligibility(prog, eng.facts_from_application(a_unknown))

    checks.append(("clean app fails no rules", e_ok["requirements_failed"] == 0 and e_ok["eligibility_percentage"] == 100))
    failed_dims = {r["dimension"] for r in e_bad["breakdown"] if r["status"] == "failed"}
    checks.append(("geo + commitment fail", {"geography", "commitment"} <= failed_dims))
    checks.append(("hard failure => ineligible verdict", e_bad["verdict"] == "ineligible"))
    geo_unk = next(r for r in e_unk["breakdown"] if r["dimension"] == "geography")
    checks.append(("missing country is uncertain, NOT failed", geo_unk["status"] == "uncertain"))
    team = next(r for r in e_unk["breakdown"] if r["dimension"] == "team_size")
    checks.append(("min_team_size rule enforced", team["status"] == "satisfied"))

    # ── 1b. rule_defaults() is what the engine actually enforces ─────────────
    # The configuration screen renders these for any key a program never set, so
    # "nothing saved" can never be shown as "no gate" while code enforces one.
    bare = AcceleratorProgram.objects.create(
        name=f"Bare Program {tag}", slug=f"bare-program-{tag}", created_by=owner,
        sector_focus="fintech", stage_focus="seed", eligibility_rules={},
    )
    dflt = eng.rule_defaults()

    def dim_status(res, dim):
        return next(r for r in res["breakdown"] if r["dimension"] == dim)["status"]

    base_facts = {"country": "NG", "stage": "seed", "sector": "fintech", "full_time": True}

    checks.append(("unset geography whitelist still enforces the default list",
                   dim_status(eng.evaluate_program_eligibility(bare, {**base_facts, "country": "DE"}), "geography") == "failed"))
    checks.append(("declared default list is the one used", "DE" not in dflt["geography_whitelist"]))
    checks.append(("unset full_time_required is enforced, not off",
                   dim_status(eng.evaluate_program_eligibility(bare, {**base_facts, "full_time": False}), "commitment") == "failed"))
    checks.append(("declared full_time default agrees", dflt["full_time_required"] is True))
    cap = float(dflt["previous_funding_max_usd"])
    checks.append(("unset funding cap uses the declared number",
                   dim_status(eng.evaluate_program_eligibility(bare, {**base_facts, "total_funding_raised_usd": cap + 1}), "prior_funding") == "failed"))
    checks.append(("one dollar under the declared cap passes",
                   dim_status(eng.evaluate_program_eligibility(bare, {**base_facts, "total_funding_raised_usd": cap - 1}), "prior_funding") == "satisfied"))
    checks.append(("unset min team size skips the gate entirely",
                   "team_size" not in {r["dimension"] for r in eng.evaluate_program_eligibility(bare, base_facts)["breakdown"]}))
    checks.append(("defaults exposed on the program detail payload",
                   AcceleratorProgramDetailSerializer(bare).data["eligibility_defaults"] == dflt))

    # ── 2. Persistence lands on the row ─────────────────────────────────────
    eng.evaluate_application_eligibility(a_ok)
    a_ok.refresh_from_db()
    checks.append(("persisted score matches engine", a_ok.eligibility_score == e_ok["eligibility_percentage"]))
    checks.append(("persisted breakdown carries verdict", a_ok.eligibility_breakdown.get("verdict") == e_ok["verdict"]))
    checks.append(("checked_at stamped", a_ok.eligibility_checked_at is not None))

    # ── 3. Triage bucketing is exclusive + precedence ───────────────────────
    b_rej = eng.triage_bucket(eligibility_failed=1, eligibility_uncertain_or_evidence=0,
                              status="REJECTED", stage_conflict=False, unverified_claims=0, completeness=90)
    checks.append(("human rejection outranks machine failure", b_rej == "rejected"))
    b_dq = eng.triage_bucket(eligibility_failed=1, eligibility_uncertain_or_evidence=0,
                             status="SUBMITTED", stage_conflict=False, unverified_claims=0, completeness=90)
    checks.append(("failed rule -> disqualified", b_dq == "disqualified"))
    b_nv = eng.triage_bucket(eligibility_failed=0, eligibility_uncertain_or_evidence=1,
                             status="SCREENING", stage_conflict=False, unverified_claims=0, completeness=90)
    checks.append(("uncertainty -> verification", b_nv == "needs_verification"))
    b_ok = eng.triage_bucket(eligibility_failed=0, eligibility_uncertain_or_evidence=0,
                             status="SCREENING", stage_conflict=False, unverified_claims=0, completeness=90)
    checks.append(("clean screen -> eligible", b_ok == "eligible"))

    # ── 4. Founder self-check endpoint uses the same engine ─────────────────
    req = post_req("/p/check-eligibility/", {
        "country": "DE", "stage": "seed", "sector": "fintech",
        "incorporated": True, "full_time": False, "total_funding_raised_usd": 0, "team_size": 2,
    })
    req.user = founder
    prog_vs = acc_views.AcceleratorProgramViewSet()
    prog_vs.request = req
    prog_vs.action = "check_eligibility"
    prog_vs.kwargs = {"pk": prog.pk}
    res = prog_vs.check_eligibility(req, pk=prog.pk)
    dims_endpoint = [r["dimension"] for r in res.data["breakdown"]]
    dims_engine = [r["dimension"] for r in e_bad["breakdown"]]
    checks.append(("self-check mirrors engine dimensions", dims_endpoint == dims_engine))
    checks.append(("self-check mirrors verdict", res.data["verdict"] == "ineligible"))

    # ── 5. Report endpoint: exclusive buckets, excluded drafts, ranked gates ─
    rreq = get_req("/apps/eligibility-report/", {"program_id": prog.id})
    rreq.user = owner
    vs = acc_views.AcceleratorApplicationViewSet()
    vs.request = rreq
    vs.kwargs = {}
    rep = vs.eligibility_report(rreq)
    data = rep.data
    checks.append(("draft excluded from triage scope", data["scope"]["triage_scope"] == 4 and any(
        e["status"] == "DRAFT" for e in data["scope"]["excluded"])))
    checks.append(("buckets sum to evaluated", sum(data["buckets"].values()) == data["scope"]["evaluated"]))
    checks.append(("disqualified row present", data["buckets"]["disqualified"] == 1))
    checks.append(("verification row present", data["buckets"]["needs_verification"] == 1))
    checks.append(("eligible row present", data["buckets"]["eligible"] == 1))
    checks.append(("rejected row present", data["buckets"]["rejected"] == 1))
    checks.append(("gate failures ranked with titles", len(data["gate_failures"]) >= 1 and data["gate_failures"][0]["count"] == 1))
    row_bad = next(r for r in data["rows"] if r["company_name"] == "BadCo")
    checks.append(("row carries per-requirement breakdown", len(row_bad["requirements"]) == e_bad["total_requirements"]))
    checks.append(("row reports failed dimensions", set(row_bad["signals"]["failed_dimensions"]) == {
        r["title"] for r in e_bad["breakdown"] if r["status"] == "failed"}))

    # ── 6. Persist endpoint: team only ──────────────────────────────────────
    # `staffish` is put on this program's staff: that is what lets it run the
    # gate over the rows and read them, which is a different grant from owning
    # the program — asserted separately in the override flow below.
    ProgramStaffMembership.objects.create(user=staffish, program=prog,
                                          role="manager")
    ereq = post_req(f"/apps/evaluate-eligibility/?program_id={prog.id}", {})
    ereq.user = staffish
    vs2 = acc_views.AcceleratorApplicationViewSet()
    vs2.request = ereq
    vs2.kwargs = {}
    eres = vs2.evaluate_eligibility(ereq)
    checks.append(("persist endpoint evaluates team-scoped rows", eres.data["evaluated"] >= 3))
    fereq = post_req("/apps/evaluate-eligibility/", {})
    fereq.user = founder
    vs3 = acc_views.AcceleratorApplicationViewSet()
    vs3.request = fereq
    vs3.kwargs = {}
    try:
        vs3.evaluate_eligibility(fereq)
        checks.append(("non-team cannot persist eligibility", False))
    except PermissionDenied:
        checks.append(("non-team cannot persist eligibility", True))

    # ── 7. Override flow on transition-status ───────────────────────────────
    def transition(user, app_id, payload):
        req = post_req("/apps/transition-status/", payload)
        req.user = user
        vs = acc_views.AcceleratorApplicationViewSet()
        vs.request = req
        vs.kwargs = {"pk": app_id}
        try:
            return vs.transition_status(req, pk=app_id)
        except PermissionDenied as exc:
            return exc

    r_same = transition(owner, a_ok.id, {"status": "SUBMITTED"})
    checks.append(("same-stage transition refused", r_same.status_code == 400 and "already" in str(r_same.data).lower()))

    r_inv = transition(investor, a_rej.id, {"status": "SCREENING", "override": True, "reason": "x"})
    checks.append(("investor cannot transition at all", isinstance(r_inv, PermissionDenied)))

    r_noreason = transition(owner, a_rej.id, {"status": "SCREENING", "override": True, "reason": "   "})
    checks.append(("override without justification refused",
                   r_noreason.status_code == 400 and "justification" in str(r_noreason.data).lower()))

    r_nondirector = transition(staffish, a_rej.id, {"status": "SCREENING", "override": True, "reason": "trust me"})
    checks.append(("a staffed non-owner can read the row but not override a gate",
                   r_nondirector.status_code == 400))

    r_ok = transition(owner, a_rej.id, {"status": "SCREENING", "override": True, "reason": "Founder pedigree warrants review."})
    checks.append(("owner override returns 200", r_ok.status_code == 200))
    a_rej.refresh_from_db()
    checks.append(("override actually advanced", a_rej.status == "SCREENING"))
    audit = ApplicationAuditEvent.objects.filter(application=a_rej).order_by("-timestamp").first()
    checks.append(("override audit stamped with prefix",
                   audit is not None and audit.reason.startswith(acc_views.OVERRIDE_REASON_PREFIX)))
    checks.append(("override audit carries human reason", "Founder pedigree" in audit.reason))

    # A plain (non-override) legal transition must NOT carry the override prefix.
    r_plain = transition(owner, a_unknown.id, {"status": "SCREENING"})
    checks.append(("legal transition returns 200", r_plain.status_code == 200))
    a_unknown.refresh_from_db()
    checks.append(("legal transition advanced status", a_unknown.status == "SCREENING"))
    audit2 = ApplicationAuditEvent.objects.filter(application=a_unknown).order_by("-timestamp").first()
    checks.append(("legal transition not mislabeled override",
                   audit2.reason is None or not str(audit2.reason).startswith(acc_views.OVERRIDE_REASON_PREFIX)))

    try:
        raise Roll
    except Roll:
        pass
    transaction.set_rollback(True)

failed = [name for name, ok in checks if not ok]
for name, ok in checks:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{len(checks) - len(failed)}/{len(checks)} eligibility smoke checks passed")
raise SystemExit(1 if failed else 0)
