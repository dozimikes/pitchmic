"""
Seed realistic applications across various stages, tiers, and statuses.
"""
import os
import sys
import django
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.accelerator.models import (
    AcceleratorProgram,
    FounderApplicationProfile,
    StartupApplicationProfile,
    AcceleratorApplication,
    ApplicationClaim,
    ClaimEvidence,
    ApplicationAssessment,
    ProgramMembership,
    StartupMilestone,
    ContinuousAssessment,
)

User = get_user_model()
admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()
program = AcceleratorProgram.objects.filter(slug="pan-african-accelerator-2026").first()

if program and admin_user:
    # 1. Company A: KoraPay Logistics (Tier A, Shortlisted, Stage Conflict Detected)
    founder_a, _ = FounderApplicationProfile.objects.get_or_create(
        user=admin_user,
        defaults={
            "full_name": "Tariq Adeleke",
            "country": "Nigeria",
            "location": "Lagos, Nigeria",
            "linkedin": "https://linkedin.com/in/tariq-adeleke",
            "full_time_status": True,
            "technical_capability_score": 9.0,
            "business_capability_score": 8.5,
            "profile_completeness": 92.0,
            "previous_companies": [{"name": "QuickHaul Africa", "role": "CTO", "outcome": "Acquired 2023"}],
            "cofounders": [{"name": "Amina Bello", "role": "Chief Commercial Officer", "equity_pct": 40, "full_time": True}],
        }
    )

    startup_a, _ = StartupApplicationProfile.objects.get_or_create(
        founder_profile=founder_a,
        company_name="KoraPay Logistics",
        defaults={
            "website": "https://korapaylogistics.africa",
            "industry": "Logistics & Cross-Border Supply Chain",
            "sector_tags": "logistics, fintech, b2b_saas",
            "business_model": "b2b_saas",
            "geography": "Nigeria & Kenya",
            "incorporated": True,
            "incorporation_country": "Delaware / Nigeria",
            "employee_count": 8,
            "has_live_product": True,
            "product_stage": "pilot",
            "revenue_status": "pre_revenue",
            "declared_stage": "seed",
            "total_funding_raised_usd": Decimal("150000.00"),
            "customer_count": 0,
            "loi_count": 100,
            "pilot_count": 6,
        }
    )

    app_a, _ = AcceleratorApplication.objects.get_or_create(
        program=program,
        startup_profile=startup_a,
        defaults={
            "submitted_by": admin_user,
            "status": "SHORTLISTED",
            "automated_screening_tier": "A",
            "program_fit_score": 91.0,
            "startup_strength_score": 78.0,
            "evidence_confidence_score": 74.0,
            "application_completeness_score": 94.0,
            "founder_score": 88.0,
            "eligibility_score": 92.0,
            "inferred_stage": "pre_seed",
            "stage_conflict_detected": True,
            "submitted_at": timezone.now(),
            "shortlisted_at": timezone.now(),
            "risk_flags": [
                {
                    "risk": "Declared vs Inferred Stage Divergence",
                    "severity": "medium",
                    "confidence": 0.91,
                    "evidence": "Founder declared Seed stage ($1.5M target), but commercial metrics reflect pilot-stage Pre-Seed.",
                    "mitigation": "Align tranche valuation milestones during partner screening round.",
                },
                {
                    "risk": "Cross-Border Regulatory Friction",
                    "severity": "medium",
                    "confidence": 0.78,
                    "evidence": "Cross-border transit corridor between Lagos and Nairobi requires dual freight licensing.",
                    "mitigation": "Partner with established regional bonded carriers.",
                }
            ],
            "screening_summary": {
                "recommendation": "Advance to Screening Committee",
                "core_thesis": "Exceptional founding team with technical exit history solving mission-critical freight liquidity."
            }
        }
    )

    # Claim & Evidence for KoraPay
    claim_loi, _ = ApplicationClaim.objects.get_or_create(
        application=app_a,
        claim_id="C-00127",
        defaults={
            "claim_text": "100 signed Letters of Intent (LOIs) from regional freight forwarders",
            "category": "commercial_traction",
            "materiality": "critical",
            "source": "application_answer",
            "founder_asserted": True,
            "evidence_required": True,
            "evidence_status": "provided",
            "verification_status": "partially_verified",
            "discrepancy_notes": "Forensic check: 82 documents uploaded, 76 unique businesses, 69 signed, 48 show demonstrable pilot commitments.",
            "verified_value": {
                "claimed": 100,
                "identifiable_documents": 82,
                "unique_businesses": 76,
                "countersigned": 69,
                "active_pilot_commitment": 48
            }
        }
    )

    ClaimEvidence.objects.get_or_create(
        claim=claim_loi,
        defaults={
            "claimed_count": 100,
            "documents_found": 82,
            "documents_signed": 69,
            "unique_entities": 76,
            "current_documents": 61,
            "commercial_intent_count": 48,
            "confidence": 0.82,
            "verification_summary": {
                "status": "partially_verified",
                "audit": "100 claimed → 82 documents found → 76 unique entities → 69 signed → 48 indicate explicit pilot intent."
            }
        }
    )

    # Assessment for KoraPay
    ApplicationAssessment.objects.get_or_create(
        application=app_a,
        defaults={
            "founder_score": 88.0,
            "founder_confidence": 0.92,
            "problem_score": 84.0,
            "problem_confidence": 0.85,
            "product_score": 79.0,
            "product_confidence": 0.88,
            "market_score": 81.0,
            "market_confidence": 0.75,
            "traction_score": 73.0,
            "traction_confidence": 0.68,
            "revenue_score": 38.0,
            "revenue_confidence": 0.95,
            "team_score": 82.0,
            "team_confidence": 0.85,
            "declared_stage": "seed",
            "inferred_stage": "pre_seed",
            "stage_confidence": 0.91,
            "stage_conflict": True,
            "stage_conflict_explanation": "Founder declared Seed ($1.5M round), but operational traction indicates pilot-stage Pre-Seed validation.",
            "overall_program_fit": 91.0,
            "startup_strength": 78.0,
            "evidence_confidence": 74.0,
            "application_completeness": 94.0,
            "bull_case": [
                {"point": "Founder has previous exit as CTO of regional logistics leader.", "strength": "High"},
                {"point": "Deep market pull: 69 signed LOIs with 48 active pilot commitments.", "strength": "High"},
                {"point": "Proprietary dispatch algorithm reduces deadhead freight miles by 34%.", "strength": "Medium"},
            ],
            "bear_case": [
                {"point": "Pre-revenue state: monetization velocity of LOIs into annual billings is unproven.", "strength": "High"},
                {"point": "High working capital requirement for carrier factoring if extended too early.", "strength": "Medium"},
            ],
            "risk_flags": app_a.risk_flags,
            "overall_recommendation": "INTERVIEW",
            "recommendation_confidence": 0.86,
            "recommendation_reasoning": "Strong founder execution DNA + pilot-ready product with massive verified market pull. High conviction interview recommendation."
        }
    )

    # 2. Company B: BioMedica Africa (Tier A, Accepted / Cohort Member)
    startup_b, _ = StartupApplicationProfile.objects.get_or_create(
        founder_profile=founder_a,
        company_name="BioMedica Diagnostics",
        defaults={
            "website": "https://biomedica.africa",
            "industry": "Healthtech & Rapid Diagnostics",
            "sector_tags": "healthtech, ai, deeptech",
            "business_model": "b2b_saas",
            "geography": "Kenya & Rwanda",
            "incorporated": True,
            "incorporation_country": "Kenya",
            "employee_count": 6,
            "has_live_product": True,
            "product_stage": "live",
            "revenue_status": "early_revenue",
            "declared_stage": "pre_seed",
            "mrr_usd": Decimal("14500.00"),
            "customer_count": 28,
            "total_funding_raised_usd": Decimal("80000.00"),
        }
    )

    app_b, _ = AcceleratorApplication.objects.get_or_create(
        program=program,
        startup_profile=startup_b,
        defaults={
            "submitted_by": admin_user,
            "status": "ACCEPTED",
            "automated_screening_tier": "A",
            "program_fit_score": 94.0,
            "startup_strength_score": 86.0,
            "evidence_confidence_score": 89.0,
            "application_completeness_score": 96.0,
            "founder_score": 90.0,
            "eligibility_score": 96.0,
            "inferred_stage": "pre_seed",
            "stage_conflict_detected": False,
            "submitted_at": timezone.now(),
            "decision_at": timezone.now(),
        }
    )

    mem_b, _ = ProgramMembership.objects.get_or_create(
        application=app_b,
        program=program,
        defaults={"is_active": True, "demo_day_slot": 1}
    )

    # Milestones for BioMedica
    for t in program.milestone_templates.all():
        StartupMilestone.objects.get_or_create(
            membership=mem_b,
            template=t,
            defaults={
                "status": "complete" if t.week_number <= 4 else ("in_progress" if t.week_number == 6 else "not_started"),
                "notes": "Verified by lead program mentor."
            }
        )

    # Continuous Assessment for BioMedica
    ContinuousAssessment.objects.get_or_create(
        application=app_b,
        period_label="Application",
        defaults={"readiness_score": 72.0, "revenue_at_period": Decimal("8500.00"), "customers_at_period": 14}
    )
    ContinuousAssessment.objects.get_or_create(
        application=app_b,
        period_label="Week 4 Checkpoint",
        defaults={"readiness_score": 81.0, "revenue_at_period": Decimal("11200.00"), "customers_at_period": 21}
    )
    ContinuousAssessment.objects.get_or_create(
        application=app_b,
        period_label="Current (Week 6)",
        defaults={"readiness_score": 86.0, "revenue_at_period": Decimal("14500.00"), "customers_at_period": 28}
    )

    # 3. Company C: AgroPulse Sensors (Tier B, Screening)
    startup_c, _ = StartupApplicationProfile.objects.get_or_create(
        founder_profile=founder_a,
        company_name="AgroPulse Sensors",
        defaults={
            "website": "https://agropulse.io",
            "industry": "Agtech & Climate IoT",
            "sector_tags": "agtech, climate, iot",
            "business_model": "b2b_saas",
            "geography": "Ghana",
            "incorporated": False,
            "employee_count": 3,
            "has_live_product": True,
            "product_stage": "prototype",
            "revenue_status": "pre_revenue",
            "declared_stage": "pre_seed",
            "total_funding_raised_usd": Decimal("15000.00"),
        }
    )

    AcceleratorApplication.objects.get_or_create(
        program=program,
        startup_profile=startup_c,
        defaults={
            "submitted_by": admin_user,
            "status": "SCREENING",
            "automated_screening_tier": "B",
            "program_fit_score": 82.0,
            "startup_strength_score": 68.0,
            "evidence_confidence_score": 58.0,
            "application_completeness_score": 79.0,
            "founder_score": 74.0,
            "eligibility_score": 84.0,
            "inferred_stage": "pre_seed",
            "stage_conflict_detected": False,
            "submitted_at": timezone.now(),
        }
    )

print("Successfully seeded realistic applications across pipeline stages!")
