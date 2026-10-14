"""
management.commands.seed_archetypes
=====================================
Seeds the six built-in ProgramArchetype records that ship with Pitchmic.

These are starting-point configurations — programs pick one during setup
and can customise every dimension, weight, and policy field afterwards.

Run:
    python manage.py seed_archetypes
    python manage.py seed_archetypes --force   # overwrite existing archetypes
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.accelerator.program_policy import ProgramArchetype

# ─────────────────────────────────────────────────────────────────────────────
# Archetype seed data
# ─────────────────────────────────────────────────────────────────────────────

ARCHETYPES: list[dict] = [
    # 1. VC / Venture-backed Accelerator
    {
        "slug": "vc_accelerator",
        "name": "VC / Venture-backed Accelerator",
        "description": (
            "A commercially-oriented accelerator focused on producing investable, "
            "high-growth companies. Optimises for fundraising readiness, market size, "
            "and founder quality."
        ),
        "default_scoring_dimensions": [
            {
                "name": "founder_quality",
                "label": "Founder Quality",
                "weight": 0.25,
                "description": "Founder background, domain expertise, and execution history.",
                "evidence_requirement": "required",
            },
            {
                "name": "market",
                "label": "Market",
                "weight": 0.20,
                "description": "Market size, growth rate, and competitive dynamics.",
                "evidence_requirement": "required",
            },
            {
                "name": "traction",
                "label": "Traction",
                "weight": 0.20,
                "description": "Revenue, customers, growth rate, and product validation.",
                "evidence_requirement": "required",
            },
            {
                "name": "growth",
                "label": "Growth",
                "weight": 0.15,
                "description": "MoM/QoQ growth trajectory and scalability evidence.",
                "evidence_requirement": "optional",
            },
            {
                "name": "fundraising_potential",
                "label": "Fundraising Potential",
                "weight": 0.10,
                "description": "Likelihood of successful institutional fundraise within 18 months.",
                "evidence_requirement": "optional",
            },
            {
                "name": "product",
                "label": "Product",
                "weight": 0.10,
                "description": "Product differentiation, technical moat, and IP.",
                "evidence_requirement": "optional",
            },
        ],
        "default_outcome_weights": {
            "funding": 0.40,
            "commercial": 0.30,
            "survival": 0.20,
            "employment": 0.10,
        },
        "default_workflow_stages": [
            "DRAFT", "SUBMITTED", "SCREENING", "SHORTLISTED",
            "INTERVIEW_INVITED", "INTERVIEW_COMPLETE",
            "COMMITTEE_REVIEW", "ACCEPTED", "REJECTED",
        ],
        "default_hard_gates": [
            {
                "gate": "incorporated",
                "description": "Company must be legally incorporated.",
                "is_disqualifying": True,
                "value": True,
                "failure_message": "Company is not incorporated.",
            },
        ],
        "default_milestone_policy": {
            "overdue_warn_days": 7,
            "overdue_critical_days": 14,
            "evidence_required": True,
            "adaptive_milestones": True,
        },
        "default_risk_thresholds": {
            "founder_engagement_min": 0.5,
            "milestone_completion_min_pct": 0.7,
            "revenue_decline_warn_pct": -0.15,
            "checkin_gap_warn_days": 10,
        },
    },

    # 2. Corporate Accelerator
    {
        "slug": "corporate",
        "name": "Corporate Accelerator",
        "description": (
            "Finds startups that create strategic value for the sponsoring corporation. "
            "Prioritises strategic alignment, enterprise adoption readiness, and pilot potential "
            "over pure commercial metrics."
        ),
        "default_scoring_dimensions": [
            {
                "name": "strategic_alignment",
                "label": "Strategic Alignment",
                "weight": 0.25,
                "description": "Degree to which the startup aligns with the corporation's strategic priorities.",
                "evidence_requirement": "required",
            },
            {
                "name": "enterprise_adoption",
                "label": "Enterprise Adoption Readiness",
                "weight": 0.20,
                "description": "Readiness for enterprise procurement, security, and compliance.",
                "evidence_requirement": "required",
            },
            {
                "name": "pilot_potential",
                "label": "Pilot Potential",
                "weight": 0.20,
                "description": "Likelihood of a successful internal pilot within the program.",
                "evidence_requirement": "optional",
            },
            {
                "name": "procurement_readiness",
                "label": "Procurement Readiness",
                "weight": 0.15,
                "description": "Business unit sponsorship, contract readiness, and legal compatibility.",
                "evidence_requirement": "optional",
            },
            {
                "name": "technology_compatibility",
                "label": "Technology Compatibility",
                "weight": 0.10,
                "description": "Technical compatibility with existing corporate infrastructure.",
                "evidence_requirement": "optional",
            },
            {
                "name": "innovation_relevance",
                "label": "Innovation Relevance",
                "weight": 0.10,
                "description": "Novelty and relevance of the startup's innovation to the sponsor's domain.",
                "evidence_requirement": "optional",
            },
        ],
        "default_outcome_weights": {
            "strategic": 0.40,
            "commercial": 0.30,
            "innovation": 0.20,
            "survival": 0.10,
        },
        "default_workflow_stages": [
            "DRAFT", "SUBMITTED", "SCREENING", "SHORTLISTED",
            "INTERVIEW_INVITED", "INTERVIEW_COMPLETE",
            "COMMITTEE_REVIEW", "ACCEPTED", "REJECTED",
        ],
        "default_hard_gates": [
            {
                "gate": "incorporated",
                "description": "Company must be legally incorporated.",
                "is_disqualifying": True,
                "value": True,
                "failure_message": "Company is not incorporated.",
            },
        ],
        "default_milestone_policy": {
            "overdue_warn_days": 14,
            "overdue_critical_days": 30,
            "evidence_required": True,
            "adaptive_milestones": True,
        },
        "default_risk_thresholds": {
            "founder_engagement_min": 0.5,
            "milestone_completion_min_pct": 0.65,
            "revenue_decline_warn_pct": -0.20,
            "checkin_gap_warn_days": 14,
        },
    },

    # 3. Government / Public Accelerator
    {
        "slug": "government",
        "name": "Government / Public Accelerator",
        "description": (
            "A publicly-funded program prioritising economic development outcomes: job creation, "
            "regional inclusion, business survival, and local economic impact. "
            "A company can be an excellent government-program candidate while being a poor VC candidate."
        ),
        "default_scoring_dimensions": [
            {
                "name": "job_creation",
                "label": "Job Creation Potential",
                "weight": 0.25,
                "description": "Projected direct and indirect employment creation.",
                "evidence_requirement": "optional",
            },
            {
                "name": "local_economic_impact",
                "label": "Local Economic Impact",
                "weight": 0.20,
                "description": "Contribution to local revenue, supply chains, and ecosystem.",
                "evidence_requirement": "optional",
            },
            {
                "name": "business_viability",
                "label": "Business Viability",
                "weight": 0.20,
                "description": "Long-term commercial sustainability of the business model.",
                "evidence_requirement": "required",
            },
            {
                "name": "founder_team",
                "label": "Founder / Team",
                "weight": 0.15,
                "description": "Founder commitment, capacity, and relevant background.",
                "evidence_requirement": "required",
            },
            {
                "name": "regional_inclusion",
                "label": "Regional Inclusion",
                "weight": 0.10,
                "description": "Extent to which the startup serves underrepresented regions or populations.",
                "evidence_requirement": "optional",
            },
            {
                "name": "growth_potential",
                "label": "Growth Potential",
                "weight": 0.10,
                "description": "Potential for the business to scale beyond initial stage.",
                "evidence_requirement": "optional",
            },
        ],
        "default_outcome_weights": {
            "employment": 0.30,
            "commercial": 0.25,
            "survival": 0.25,
            "community": 0.20,
        },
        "default_workflow_stages": [
            "DRAFT", "SUBMITTED", "SCREENING", "SHORTLISTED",
            "INTERVIEW_INVITED", "INTERVIEW_COMPLETE",
            "COMMITTEE_REVIEW", "ACCEPTED", "REJECTED",
        ],
        "default_hard_gates": [],
        "default_milestone_policy": {
            "overdue_warn_days": 21,
            "overdue_critical_days": 45,
            "evidence_required": False,
            "adaptive_milestones": True,
        },
        "default_risk_thresholds": {
            "founder_engagement_min": 0.35,
            "milestone_completion_min_pct": 0.5,
            "revenue_decline_warn_pct": -0.30,
            "checkin_gap_warn_days": 21,
        },
    },

    # 4. University / Research Accelerator
    {
        "slug": "university",
        "name": "University / Research Accelerator",
        "description": (
            "A commercialisation-focused program for student founders, researchers, and spinouts. "
            "Evaluates technical novelty, research translation, IP defensibility, and "
            "commercialisation readiness rather than ARR or growth metrics."
        ),
        "default_scoring_dimensions": [
            {
                "name": "technical_novelty",
                "label": "Technical Novelty",
                "weight": 0.25,
                "description": "Originality and technical depth of the innovation.",
                "evidence_requirement": "required",
            },
            {
                "name": "research_translation",
                "label": "Research Translation",
                "weight": 0.20,
                "description": "Extent to which research has been translated into a viable product or service.",
                "evidence_requirement": "optional",
            },
            {
                "name": "founder_team",
                "label": "Founder / Team",
                "weight": 0.20,
                "description": "Founder technical depth, domain expertise, and commercialisation capability.",
                "evidence_requirement": "required",
            },
            {
                "name": "commercial_potential",
                "label": "Commercial Potential",
                "weight": 0.15,
                "description": "Addressable market and commercial viability of the technology.",
                "evidence_requirement": "optional",
            },
            {
                "name": "ip_defensibility",
                "label": "IP Defensibility",
                "weight": 0.10,
                "description": "Patent status, trade secrets, and technical moat.",
                "evidence_requirement": "optional",
            },
            {
                "name": "market",
                "label": "Market",
                "weight": 0.10,
                "description": "Market size and demand validation.",
                "evidence_requirement": "optional",
            },
        ],
        "default_outcome_weights": {
            "innovation": 0.35,
            "commercial": 0.30,
            "funding": 0.25,
            "survival": 0.10,
        },
        "default_workflow_stages": [
            "DRAFT", "SUBMITTED", "SCREENING", "SHORTLISTED",
            "INTERVIEW_INVITED", "INTERVIEW_COMPLETE",
            "COMMITTEE_REVIEW", "ACCEPTED", "REJECTED",
        ],
        "default_hard_gates": [],
        "default_milestone_policy": {
            "overdue_warn_days": 14,
            "overdue_critical_days": 30,
            "evidence_required": False,
            "adaptive_milestones": True,
        },
        "default_risk_thresholds": {
            "founder_engagement_min": 0.4,
            "milestone_completion_min_pct": 0.55,
            "revenue_decline_warn_pct": -0.30,
            "checkin_gap_warn_days": 21,
        },
    },

    # 5. Impact / Nonprofit Accelerator
    {
        "slug": "impact",
        "name": "Impact / Nonprofit Accelerator",
        "description": (
            "A mission-driven program where financial return is not the primary outcome. "
            "Evaluates beneficiary reach, depth of impact, SDG alignment, sustainability, "
            "and inclusion. Outcome models are pluggable and program-specific."
        ),
        "default_scoring_dimensions": [
            {
                "name": "beneficiary_reach",
                "label": "Beneficiary Reach",
                "weight": 0.25,
                "description": "Number and diversity of people or communities benefiting.",
                "evidence_requirement": "optional",
            },
            {
                "name": "depth_of_impact",
                "label": "Depth of Impact",
                "weight": 0.20,
                "description": "Significance and durability of the change created for each beneficiary.",
                "evidence_requirement": "optional",
            },
            {
                "name": "sdg_alignment",
                "label": "SDG Alignment",
                "weight": 0.20,
                "description": "Alignment with relevant UN Sustainable Development Goals.",
                "evidence_requirement": "optional",
            },
            {
                "name": "evidence_of_impact",
                "label": "Evidence of Impact",
                "weight": 0.15,
                "description": "Quality of impact measurement methodology and reported results.",
                "evidence_requirement": "required",
            },
            {
                "name": "sustainability",
                "label": "Sustainability",
                "weight": 0.10,
                "description": "Financial and operational sustainability of the programme's impact.",
                "evidence_requirement": "optional",
            },
            {
                "name": "scalability",
                "label": "Scalability",
                "weight": 0.10,
                "description": "Potential to scale impact without proportional resource increase.",
                "evidence_requirement": "optional",
            },
        ],
        "default_outcome_weights": {
            "impact": 0.50,
            "community": 0.25,
            "survival": 0.15,
            "commercial": 0.10,
        },
        "default_workflow_stages": [
            "DRAFT", "SUBMITTED", "SCREENING", "SHORTLISTED",
            "INTERVIEW_INVITED", "INTERVIEW_COMPLETE",
            "COMMITTEE_REVIEW", "ACCEPTED", "REJECTED",
        ],
        "default_hard_gates": [],
        "default_milestone_policy": {
            "overdue_warn_days": 21,
            "overdue_critical_days": 45,
            "evidence_required": False,
            "adaptive_milestones": True,
        },
        "default_risk_thresholds": {
            "founder_engagement_min": 0.35,
            "milestone_completion_min_pct": 0.5,
            "revenue_decline_warn_pct": -0.40,
            "checkin_gap_warn_days": 21,
        },
    },

    # 6. Pre-Accelerator / Founder Program
    {
        "slug": "pre_accelerator",
        "name": "Pre-Accelerator / Founder Program",
        "description": (
            "A part-time program aimed at earlier-stage founders preparing for funding or "
            "accelerator applications. Focuses on founder potential, learning velocity, "
            "and idea validation rather than traction or financial metrics."
        ),
        "default_scoring_dimensions": [
            {
                "name": "founder_potential",
                "label": "Founder Potential",
                "weight": 0.30,
                "description": "Founder coachability, drive, and learning orientation.",
                "evidence_requirement": "required",
            },
            {
                "name": "problem_clarity",
                "label": "Problem Clarity",
                "weight": 0.25,
                "description": "Depth of understanding of the problem being solved.",
                "evidence_requirement": "required",
            },
            {
                "name": "learning_velocity",
                "label": "Learning Velocity",
                "weight": 0.20,
                "description": "Demonstrated ability to learn rapidly and iterate.",
                "evidence_requirement": "optional",
            },
            {
                "name": "team_completeness",
                "label": "Team Completeness",
                "weight": 0.15,
                "description": "Completeness of core founding team relative to the problem.",
                "evidence_requirement": "optional",
            },
            {
                "name": "idea_validation",
                "label": "Idea Validation",
                "weight": 0.10,
                "description": "Early evidence of customer/market interest.",
                "evidence_requirement": "optional",
            },
        ],
        "default_outcome_weights": {
            "commercial": 0.30,
            "funding": 0.30,
            "survival": 0.25,
            "employment": 0.15,
        },
        "default_workflow_stages": [
            "DRAFT", "SUBMITTED", "SCREENING", "SHORTLISTED",
            "INTERVIEW_INVITED", "INTERVIEW_COMPLETE",
            "ACCEPTED", "REJECTED",
        ],
        "default_hard_gates": [],
        "default_milestone_policy": {
            "overdue_warn_days": 14,
            "overdue_critical_days": 30,
            "evidence_required": False,
            "adaptive_milestones": False,
        },
        "default_risk_thresholds": {
            "founder_engagement_min": 0.40,
            "milestone_completion_min_pct": 0.50,
            "revenue_decline_warn_pct": -0.50,
            "checkin_gap_warn_days": 14,
        },
    },
]


class Command(BaseCommand):
    help = "Seed the six built-in ProgramArchetype records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing archetypes.",
        )

    def handle(self, *args, **options):
        force = options["force"]
        created_count = 0
        updated_count = 0

        for data in ARCHETYPES:
            slug = data["slug"]
            existing = ProgramArchetype.objects.filter(slug=slug).first()

            if existing and not force:
                self.stdout.write(f"  [SKIP]    {slug} — already exists (use --force to overwrite)")
                continue

            fields = {k: v for k, v in data.items() if k != "slug"}
            if existing and force:
                for k, v in fields.items():
                    setattr(existing, k, v)
                existing.save()
                updated_count += 1
                self.stdout.write(self.style.WARNING(f"  [UPDATED] {slug}"))
            else:
                ProgramArchetype.objects.create(slug=slug, **fields)
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"  [CREATED] {slug}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Created: {created_count} | Updated: {updated_count} | "
                f"Total archetypes: {ProgramArchetype.objects.count()}"
            )
        )
