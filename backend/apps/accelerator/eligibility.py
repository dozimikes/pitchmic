"""
apps.accelerator.eligibility
============================
The eligibility rules engine — the ONE place program eligibility is computed.

Two consumers, one implementation (so the pre-application self-check can never
drift from what the dashboard scores a submitted application against):

  * ``check-eligibility`` (founder self-check)  -> facts from request payload
  * ``eligibility-report``  (dashboard triage)  -> facts from the stored startup
                                                    profile

Rules live in ``program.eligibility_rules`` (DB), not in code: code supplies
only the defaults used when a key is absent. Missing data is scored
``uncertain`` / ``requires_evidence`` — never a fabricated ``failed`` — because
"we don't know the country" is a statement about our data, not a disqualifier.
"""
from __future__ import annotations

from typing import Any

from django.utils import timezone

# Default geography whitelist when a program doesn't override it — mirrors the
# historical check_eligibility default so behaviour is unchanged for callers.
DEFAULT_GEOGRAPHY_WHITELIST = ["NG", "KE", "ZA", "EG", "GH", "RW", "UG"]
DEFAULT_PREVIOUS_FUNDING_MAX_USD = 1_000_000
DEFAULT_INCORPORATED_REQUIRED = False
DEFAULT_FULL_TIME_REQUIRED = True
DEFAULT_SECTOR_WHITELIST: list[str] = []

# Verdict thresholds (satisfied share of weighted requirements).
VERDICT_INELIGIBLE_FLOOR = 50
VERDICT_HIGHLY_ELIGIBLE_FLOOR = 80


def rule_defaults() -> dict[str, Any]:
    """What the engine assumes for a rule key a program never set.

    These are the same objects ``evaluate_program_eligibility`` reads, so the
    configuration screen can state the effective gate instead of rendering an
    unset key as "no gate" when the engine actually enforces a default.
    """
    return {
        "geography_whitelist": list(DEFAULT_GEOGRAPHY_WHITELIST),
        "sector_whitelist": list(DEFAULT_SECTOR_WHITELIST),
        "incorporated_required": DEFAULT_INCORPORATED_REQUIRED,
        "full_time_required": DEFAULT_FULL_TIME_REQUIRED,
        "previous_funding_max_usd": DEFAULT_PREVIOUS_FUNDING_MAX_USD,
        "min_team_size": None,
    }


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def evaluate_program_eligibility(program, facts: dict[str, Any]) -> dict[str, Any]:
    """Evaluate a program's rules against a ``facts`` mapping.

    Recognised fact keys (all optional; blanks degrade to uncertain):
      country, stage, sector, incorporated, full_time,
      total_funding_raised_usd, team_size.

    Returns the same granular shape as the founder self-check endpoint:
    ``{eligibility_percentage, requirements_*, verdict, breakdown, ...}``.
    """
    rules = program.eligibility_rules or {}
    requirements: list[dict[str, Any]] = []

    def add(dimension, title, status, rule, user_value, requires_evidence=False):
        requirements.append({
            "dimension": dimension,
            "title": title,
            "status": status,  # satisfied | uncertain | failed | requires_evidence
            "rule": rule,
            "user_value": user_value,
            "requires_evidence": requires_evidence,
        })

    # 1. Geography
    geo_whitelist = [str(c).upper() for c in rules.get("geography_whitelist", DEFAULT_GEOGRAPHY_WHITELIST)]
    country = str(facts.get("country") or "").upper().strip()
    if not country:
        geo_status = "uncertain"
    elif "ALL" in geo_whitelist or not geo_whitelist or country in geo_whitelist:
        geo_status = "satisfied"
    else:
        geo_status = "failed"
    add(
        "geography", "Operating Geography", geo_status,
        f"Must operate in {', '.join(geo_whitelist[:4])}{'…' if len(geo_whitelist) > 4 else ''}",
        country or "Unspecified",
    )

    # 2. Stage
    expected_stage = program.stage_focus
    user_stage = str(facts.get("stage") or "").strip() or "pre_seed"
    if expected_stage in ("any", "", None):
        stage_status = "satisfied"
    elif user_stage == expected_stage:
        stage_status = "satisfied"
    else:
        stage_status = "uncertain" if user_stage in ("idea", "pre_seed") else "failed"
    add(
        "stage", "Target Stage Match", stage_status,
        f"Targeting {program.get_stage_focus_display()} companies", user_stage,
    )

    # 3. Sector
    sector_whitelist = [str(s).lower() for s in rules.get("sector_whitelist", DEFAULT_SECTOR_WHITELIST)]
    user_sector = str(facts.get("sector") or "").lower().strip()
    if not sector_whitelist or "all" in sector_whitelist:
        sector_status = "satisfied"
    elif any(s in user_sector for s in sector_whitelist):
        sector_status = "satisfied"
    else:
        sector_status = "uncertain"
    add(
        "sector", "Sector Alignment", sector_status,
        f"Focused on {program.sector_focus or 'broad tech'}", user_sector or "Tech / General",
    )

    # 4. Incorporation
    inc_req = rules.get("incorporated_required", DEFAULT_INCORPORATED_REQUIRED)
    is_inc = bool(facts.get("incorporated", False))
    inc_status = "satisfied" if (not inc_req or is_inc) else "requires_evidence"
    add(
        "incorporation", "Legal Incorporation", inc_status,
        "Incorporated entity required prior to batch kickoff" if inc_req else "Incorporation optional at intake",
        "Incorporated" if is_inc else "Unincorporated",
        requires_evidence=bool(inc_req and not is_inc),
    )

    # 5. Full-time founder commitment
    ft_req = rules.get("full_time_required", DEFAULT_FULL_TIME_REQUIRED)
    is_ft = bool(facts.get("full_time", False))
    ft_status = "satisfied" if (not ft_req or is_ft) else "failed"
    add(
        "commitment", "Full-Time Founder Commitment", ft_status,
        "At least one co-founder 100% full-time" if ft_req else "Part-time eligible",
        "Full-Time" if is_ft else "Part-Time",
    )

    # 6. Prior funding ceiling
    max_funding = float(rules.get("previous_funding_max_usd", DEFAULT_PREVIOUS_FUNDING_MAX_USD))
    raised_raw = facts.get("total_funding_raised_usd")
    raised = 0.0 if raised_raw is None else float(raised_raw)
    funding_status = "satisfied" if raised <= max_funding else "failed"
    add(
        "prior_funding", "Funding Ceiling", funding_status,
        f"Under ${max_funding:,.0f} in prior institutional capital",
        f"${raised:,.0f}", requires_evidence=raised > 0,
    )

    # 7. Minimum team size (only enforced when the program declares it)
    min_team = rules.get("min_team_size")
    if min_team:
        team_size = facts.get("team_size")
        if team_size is None:
            team_status = "uncertain"
        else:
            team_status = "satisfied" if int(team_size) >= int(min_team) else "failed"
        add(
            "team_size", "Minimum Team Size", team_status,
            f"At least {min_team} founders",
            str(team_size) if team_size is not None else "Unspecified",
        )

    # ── Scoring (identical ladder for both callers) ───────────────────────────
    satisfied_count = sum(1 for r in requirements if r["status"] == "satisfied")
    uncertain_count = sum(1 for r in requirements if r["status"] == "uncertain")
    failed_count = sum(1 for r in requirements if r["status"] == "failed")
    evidence_needed_count = sum(
        1 for r in requirements if r["status"] == "requires_evidence" or r["requires_evidence"]
    )
    total = len(requirements)

    score_numerator = satisfied_count + (0.5 * uncertain_count) + (0.5 * evidence_needed_count)
    percentage = round(score_numerator / total * 100) if total > 0 else 0

    if failed_count > 0:
        verdict = "ineligible"
    elif percentage >= VERDICT_HIGHLY_ELIGIBLE_FLOOR:
        verdict = "highly_eligible"
    elif percentage >= VERDICT_INELIGIBLE_FLOOR:
        verdict = "review_needed"
    else:
        verdict = "ineligible"

    return {
        "program_id": program.id,
        "program_name": program.name,
        "eligibility_percentage": percentage,
        "requirements_satisfied": satisfied_count,
        "requirements_uncertain": uncertain_count,
        "requirements_failed": failed_count,
        "requirements_evidence_needed": evidence_needed_count,
        "total_requirements": total,
        "verdict": verdict,
        "breakdown": requirements,
    }


def facts_from_application(application) -> dict[str, Any]:
    """Project a stored application's startup + founder profile into the fact
    keys the engine reads. Missing profile pieces degrade to blanks (uncertain),
    never to a hard failure."""
    startup = getattr(application, "startup_profile", None)
    founder = getattr(startup, "founder_profile", None) if startup else None

    # Prefer a 2-letter code so geography whitelists match; fall back to whatever
    # free-text geography the founder supplied.
    incorporation = str(getattr(startup, "incorporation_country", "") or "").strip() if startup else ""
    founder_country = str(getattr(founder, "country", "") or "").strip() if founder else ""
    geography = str(getattr(startup, "geography", "") or "").strip() if startup else ""
    country = incorporation or founder_country or geography

    funding = getattr(startup, "total_funding_raised_usd", None) if startup else None
    return {
        "country": country,
        "stage": (getattr(startup, "declared_stage", "") or "") if startup else "",
        "sector": (getattr(startup, "sector", "") or "") if startup else "",
        "incorporated": bool(getattr(startup, "incorporated", False)) if startup else False,
        "full_time": bool(getattr(founder, "full_time_status", False)) if founder else False,
        "total_funding_raised_usd": float(funding) if funding is not None else 0.0,
        "team_size": int(getattr(startup, "employee_count", 0) or 0) if startup else None,
    }


def evaluate_application_eligibility(application) -> dict[str, Any]:
    """Evaluate + persist the eligibility result onto the application row so
    downstream consumers (workflows' eligibility_passed, decision-room display)
    read a stored truth rather than re-deriving. Returns the fresh result."""
    result = evaluate_program_eligibility(application.program, facts_from_application(application))
    application.eligibility_score = result["eligibility_percentage"]
    application.eligibility_breakdown = result
    application.eligibility_checked_at = timezone.now()
    application.save(update_fields=["eligibility_score", "eligibility_breakdown", "eligibility_checked_at", "updated_at"])
    return result


# ── Triage bucketing (single server-side implementation) ─────────────────────
# Mutually exclusive lanes derived with fixed precedence so the eligibility tab
# never double-counts an application across "disqualified" and "needs review".

def triage_bucket(
    *,
    eligibility_failed: int,
    eligibility_uncertain_or_evidence: int,
    status: str,
    stage_conflict: bool,
    unverified_claims: int,
    completeness: float,
) -> str:
    """Return one of: 'disqualified' | 'needs_verification' | 'eligible' | 'rejected'.

    Precedence: an explicit human REJECT outranks the machine view; a hard rule
    failure disqualifies; otherwise evidence/uncertainty routes to verification;
    everything else is eligible to advance."""
    if status == "REJECTED":
        return "rejected"
    if eligibility_failed > 0:
        return "disqualified"
    if stage_conflict or unverified_claims > 0 or eligibility_uncertain_or_evidence > 0 or completeness < 40:
        return "needs_verification"
    return "eligible"
