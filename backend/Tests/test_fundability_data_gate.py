from __future__ import annotations

import pytest

from apps.fundability.engine import run_fundability_assessment
from apps.fundability.models import EvidenceVaultItem
from apps.startups.sub_models import ProductProfile
from apps.users.models import StartupProfile, User


@pytest.mark.django_db
class TestFundabilityDataGate:
    def test_run_fundability_assessment_requires_founder_provided_project_data(self):
        user = User.objects.create_user(
            email="empty-founder@example.com",
            password="secret",
            first_name="Empty",
            last_name="Founder",
            role=User.ROLE_STARTUP,
        )
        startup = StartupProfile.objects.create(
            user=user,
            company_name="Ghost Startup",
        )

        with pytest.raises(ValueError, match="founder-provided"):
            run_fundability_assessment(startup)

    def test_run_fundability_assessment_accepts_only_real_founder_data(self):
        user = User.objects.create_user(
            email="real-founder@example.com",
            password="secret",
            first_name="Real",
            last_name="Founder",
            role=User.ROLE_STARTUP,
        )
        startup = StartupProfile.objects.create(
            user=user,
            company_name="RealCo",
            description="We help small businesses automate accounts receivable and cash collection with AI-powered reminders and collections workflows.",
            industry="Fintech",
            target_market="SMB finance teams in Nigeria and Kenya",
        )
        ProductProfile.objects.create(
            startup=startup,
            problem_statement="SMB finance teams lose cash due to slow collections and poor follow-ups.",
            target_customer_description="Operations managers at 10-200 employee service businesses",
            solution_description="A workflow platform that automates payment reminders and cash recovery for invoices.",
            product_status=ProductProfile.ProductStatus.MVP,
        )
        EvidenceVaultItem.objects.create(
            startup=startup,
            title="Pilot customer contract",
            description="Signed pilot agreement with a logistics SMB.",
            claim_description="We have a live pilot and recurring customer demand.",
            status=EvidenceVaultItem.EvidenceStatus.VERIFIED,
            dimension_tag=EvidenceVaultItem.DimensionTag.TRACTION,
        )

        assessment = run_fundability_assessment(startup)

        assert assessment.startup == startup
        assert assessment.overall_score >= 0
