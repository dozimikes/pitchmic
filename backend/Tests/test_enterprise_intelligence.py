"""
Tests/test_enterprise_intelligence.py
======================================
Comprehensive test suite for PitchMic Enterprise VC Intelligence features:
- PitchDeckForensicsService & Unit Economics stress testing
- Stealth Signal Collectors & Entity Resolution
- Digital Brain & Institutional Memory
- Enterprise Partner Triaging API endpoints
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.intelligence.collectors import (
    DomainRegistrationCollector,
    EmergingMarketsCollector,
    EntityResolutionEngine,
    GitHubActivityCollector,
    PatentCollector,
)
from apps.intelligence.digital_brain import DigitalBrainService
from apps.intelligence.forensics import PitchDeckForensicsService
from apps.intelligence.models import (
    DueDiligenceReport,
    InstitutionalMemoryEntry,
    PitchDeckForensicAnalysis,
    StealthFounderSignal,
)
from apps.intelligence.pipeline import run_due_diligence
from apps.users.models import StartupProfile

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(
        email="partner@antler.co",
        password="ValidPassword123!",
        role="investor",
        is_verified=True,
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def startup_profile():
    founder = User.objects.create_user(
        email="founder@payflow.ai",
        password="ValidPassword123!",
        role="startup",
        is_verified=True,
    )
    return StartupProfile.objects.create(
        user=founder,
        company_name="PayFlow AI",
        industry="Fintech",
        location="Lagos, Nigeria",
        customer_acquisition_cost=50.0,
        customer_lifetime_value=600.0,
        gross_margin=82.0,
        burn_rate=15000.0,
        runway_months=18,
        current_revenue=45000.0,
        tam=10000000000.0,
    )


#  1. Forensics & Unit Economics Tests 

class TestPitchDeckForensics:
    def test_forensics_healthy_unit_economics(self):
        service = PitchDeckForensicsService()
        deck_text = """
        Problem: Cross-border payments in Africa are fragmented and costly.
        Solution: PayFlow AI provides unified API settlement across 15 African currencies.
        Business Model: 1.2% transaction take rate.
        CAC: $50, LTV: $600, Gross Margin: 82%.
        Competition: Differentiated from Paystack via instant FX clearing.
        Team: 2 ex-Stripe and ex-Flutterwave engineers.
        Traction: $45k MRR growing 20% MoM.
        TAM: $50B total addressable market.
        Asking: $1.5M seed round.
        """
        report = service.analyze_deck_content(
            company_name="PayFlow AI",
            deck_text=deck_text,
            structured_metrics={"gross_margin": 82.0, "cac": 50.0, "ltv": 600.0},
        )
        assert report.fundability_score >= 70.0
        assert report.unit_economics.is_mathematically_coherent is True
        assert report.unit_economics.cac_ltv_ratio == 12.0
        assert report.unit_economics.risk_level == "low"
        assert len(report.competitor_benchmarks) > 0
        assert len(report.verified_claims) > 0

    def test_forensics_detects_inverted_cac_ltv_math(self):
        service = PitchDeckForensicsService()
        report = service.analyze_deck_content(
            company_name="BrokenEcon Ltd",
            deck_text="Problem and Solution text with CAC $500 and LTV $100.",
            structured_metrics={"cac": 500.0, "ltv": 100.0, "gross_margin": 40.0},
        )
        assert report.unit_economics.is_mathematically_coherent is False
        assert report.unit_economics.cac_ltv_ratio == 0.2
        assert report.unit_economics.risk_level == "critical"
        assert report.fundability_score < 60.0


#  2. Signal Collectors & Entity Resolution Tests 

class TestStealthCollectors:
    def test_collectors_generate_signals(self):
        gh = GitHubActivityCollector().collect("octo-founder")
        dom = DomainRegistrationCollector().collect("stealthfin")
        pat = PatentCollector().collect("NeuralMesh")
        reg = EmergingMarketsCollector().collect("CAC", "PayFlow Technologies Ltd")

        assert len(gh) >= 2
        assert len(dom) >= 1
        assert len(pat) >= 1
        assert len(reg) >= 1
        assert reg[0].metadata["country_code"] == "NG"

    def test_entity_resolution_clusters_signals(self):
        gh = GitHubActivityCollector().collect("solofounder")
        reg = EmergingMarketsCollector().collect("ADGM", "solofounder-labs")
        resolver = EntityResolutionEngine()
        profiles = resolver.resolve_signals(gh + reg)

        assert len(profiles) >= 1
        assert profiles[0].composite_velocity_score > 50.0
        assert profiles[0].inferred_company is not None


#  3. Digital Brain & Institutional Memory Tests 

@pytest.mark.django_db
class TestDigitalBrain:
    def test_ingest_query_lint_cycle(self):
        brain = DigitalBrainService(tenant_id="antler_nigeria")
        entry = brain.ingest_source(
            company_name="KudaBank",
            source_type="ic_memo",
            content_text="Digital retail bank focused on zero-fee banking in West Africa. High CAC during early scale.",
            summary="Neo-bank with zero-fee customer acquisition.",
            tags=["fintech", "neobank", "nigeria"],
            verdict="invest",
        )
        assert entry.entry_id is not None
        assert InstitutionalMemoryEntry.objects.filter(company_name="KudaBank").exists()

        # Query
        query_res = brain.query_memory("neobank zero-fee fintech")
        assert len(query_res.matched_entries) >= 1
        assert "KudaBank" in query_res.institutional_context

        # Lint
        lint_res = brain.lint_memory()
        assert lint_res["total_entries"] >= 1
        assert lint_res["status"] == "healthy"


#  4. Enterprise REST API Endpoints 

@pytest.mark.django_db
class TestEnterpriseEndpoints:
    def test_pitch_deck_forensics_endpoint(self, auth_client, startup_profile):
        payload = {
            "company_name": "PayFlow AI",
            "deck_text": "Problem and Solution. CAC: $40, LTV: $480. TAM: $20B. Asking $1M.",
            "metrics": {"cac": 40.0, "ltv": 480.0, "gross_margin": 80.0},
            "startup_id": startup_profile.id,
        }
        res = auth_client.post("/api/v1/intelligence/forensics/deck/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["fundability_score"] > 0
        assert PitchDeckForensicAnalysis.objects.filter(company_name="PayFlow AI").exists()

    def test_enterprise_triage_webhook_endpoint(self, auth_client):
        payload = {
            "company_name": "Apex AI",
            "industry": "Enterprise SaaS",
            "pitch_text": "Autonomous compliance for financial institutions across UAE and KSA.",
            "financials": {"gross_margin": 85.0, "cac": 100.0, "ltv": 1500.0},
            "tenant_id": "antler_mena",
        }
        res = auth_client.post("/api/v1/intelligence/external/triage/", payload, format="json")
        assert res.status_code == status.HTTP_200_OK
        assert "triaged_verdict" in res.data
        assert res.data["fundability_score"] > 0
        assert "competitor_benchmarks" in res.data

    def test_digital_brain_query_and_ingest_endpoints(self, auth_client):
        # Ingest
        ingest_payload = {
            "company_name": "Moniepoint",
            "source_type": "post_mortem",
            "content_text": "Merchant acquiring at scale via offline agency network.",
            "summary": "Agency banking distribution power.",
            "tags": ["agency_banking", "pos", "fintech"],
            "verdict": "invest",
            "tenant_id": "test_fund",
        }
        res_ingest = auth_client.post("/api/v1/intelligence/brain/ingest/", ingest_payload, format="json")
        assert res_ingest.status_code == status.HTTP_201_CREATED

        # Query
        query_payload = {"query": "agency banking POS network", "tenant_id": "test_fund"}
        res_query = auth_client.post("/api/v1/intelligence/brain/query/", query_payload, format="json")
        assert res_query.status_code == status.HTTP_200_OK
        assert len(res_query.data["matched_entries"]) >= 1

    def test_stealth_discover_and_list_endpoints(self, auth_client):
        discover_res = auth_client.post("/api/v1/intelligence/stealth/discover/", {"keyword": "fintech", "registry": "CAC"}, format="json")
        assert discover_res.status_code == status.HTTP_200_OK
        assert discover_res.data["discovered_signals_count"] > 0
        assert len(discover_res.data["profiles"]) > 0

        list_res = auth_client.get("/api/v1/intelligence/stealth/signals/")
        assert list_res.status_code == status.HTTP_200_OK
        assert len(list_res.data["results"]) > 0


#  5. Multi-Agent Pipeline Integration Test 

@pytest.mark.django_db
class TestPipelineForensicsIntegration:
    def test_run_due_diligence_with_forensic_signals(self, startup_profile):
        result = run_due_diligence(startup_profile)
        assert result["status"] == "complete"
        assert result["verdict"] in ("invest", "pass", "monitor", "needs_info")
        assert "unit_economics" in result["forensic_analysis"]
        assert "cac_ltv_ratio" in result["forensic_analysis"]["unit_economics"]
        assert result["overall_score"] is not None
