"""
Tests/test_production_scale.py
==============================
Verification tests for the PitchMic Enterprise Production Scale Roadmap:
- Multi-Tenant Enterprise Licensing & Quota Metering
- Voice Interview Screener & Partner Debrief Synthesis
- Binary Pitch Deck PDF Parser & Upload Endpoint
- CRM Webhook Dispatcher Background Tasks
"""
from __future__ import annotations

import io
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.intelligence.forensics import PDFDeckParser
from apps.intelligence.licensing import EnterpriseLicensingService
from apps.intelligence.models import (
    EnterpriseTenant,
    TenantAPIKey,
    TenantUsageLog,
    VoiceInterviewSession,
)
from apps.intelligence.tasks import dispatch_crm_webhook_task
from apps.intelligence.voice_interviews import VoiceInterviewService
from apps.users.models import StartupProfile, User


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
def test_startup():
    founder = User.objects.create_user(
        email="ada@payrail.africa",
        password="ValidPassword123!",
        role="startup",
        is_verified=True,
    )
    return StartupProfile.objects.create(
        user=founder,
        company_name="PayRail Africa",
        industry="Fintech / Cross-border",
        location="Lagos, Nigeria",
        customer_acquisition_cost=40.0,
        customer_lifetime_value=500.0,
        gross_margin=80.0,
        burn_rate=12000.0,
        runway_months=20,
    )


@pytest.mark.django_db
class TestEnterpriseLicensing:
    """Test enterprise tenant lifecycle, API keys, and metering."""

    def test_tenant_creation_and_quota_rules(self):
        tenant = EnterpriseLicensingService.create_tenant(
            name="Antler Global",
            slug="antler-global",
            tier=EnterpriseTenant.TIER_PRO,
            webhook_url="https://hub.antler.co/webhooks/triage",
        )
        assert tenant.monthly_deal_quota == 200
        assert tenant.has_quota is True

        # Test usage recording and quota increment
        log = EnterpriseLicensingService.record_usage(
            tenant=tenant,
            endpoint="/api/v1/intelligence/external/triage/",
            action_type="triage",
            status_code=200,
        )
        tenant.refresh_from_db()
        assert tenant.current_month_usage == 1
        assert log.action_type == "triage"

    def test_api_key_generation_and_authentication(self):
        tenant = EnterpriseLicensingService.create_tenant(
            name="Y Combinator",
            slug="y-combinator",
            tier=EnterpriseTenant.TIER_ENTERPRISE,
        )
        api_key_obj, raw_key = EnterpriseLicensingService.generate_api_key(tenant, name="YC Demo Key")

        assert raw_key.startswith("pm_live_")
        assert api_key_obj.key_prefix == raw_key[:12]

        # Authenticate with valid key
        authenticated_tenant = EnterpriseLicensingService.authenticate_api_key(raw_key)
        assert authenticated_tenant is not None
        assert authenticated_tenant.id == tenant.id

        # Authenticate with invalid key
        assert EnterpriseLicensingService.authenticate_api_key("pm_live_invalid_12345") is None


@pytest.mark.django_db
class TestVoiceInterviewEngine:
    """Test autonomous conversational voice screening and partner debrief."""

    def test_voice_interview_lifecycle_and_debrief(self, test_startup):
        session = VoiceInterviewService.start_session(
            startup=test_startup,
            stage="pre_seed",
            interviewer_persona="Sam (Venture Partner AI)",
        )
        assert session.status == VoiceInterviewSession.STATUS_IN_PROGRESS

        # Add conversational turns
        VoiceInterviewService.add_transcript_turn(
            session=session,
            speaker="interviewer",
            text="Tell me about your background and the specific insight that led you to start PayRail.",
            timestamp_offset=0.0,
        )
        VoiceInterviewService.add_transcript_turn(
            session=session,
            speaker="founder",
            text="We spent 6 years running cross-border payments across Nigeria and Kenya. We solved FX settlement delays using a proprietary API architecture, achieving $50 CAC and 80% gross margin with 20-month runway.",
            timestamp_offset=15.0,
        )

        # Generate debrief scorecard
        debrief = VoiceInterviewService.generate_partner_debrief(session)

        assert debrief["overall_score"] >= 55
        assert "Standard" in debrief["recommendation"] or "Fast-Track" in debrief["recommendation"]
        assert len(debrief["green_flags"]) > 0
        assert session.status == VoiceInterviewSession.STATUS_COMPLETED


@pytest.mark.django_db
class TestDeckUploadAndParser:
    """Test PDF extraction and deck upload endpoint."""

    def test_pdf_deck_parser_text_extraction(self):
        sample_pdf_bytes = b"%PDF-1.4 Mock Pitch Deck Content. CAC is $45, LTV is $600, Gross Margin is 82%."
        extracted = PDFDeckParser.extract_text_from_file(sample_pdf_bytes)
        assert "Mock Pitch Deck Content" in extracted
        assert "CAC" in extracted

    def test_pitch_deck_upload_endpoint(self, auth_client, test_startup):
        file_content = b"%PDF-1.4 PayRail Africa Pitch Deck. Problem: High FX friction. Solution: Instant settlement API. CAC: $40, LTV: $500, Gross Margin: 80%."
        deck_file = SimpleUploadedFile("payrail_deck.pdf", file_content, content_type="application/pdf")

        response = auth_client.post(
            "/api/v1/intelligence/forensics/deck/upload/",
            {
                "file": deck_file,
                "startup_id": test_startup.id,
                "company_name": "PayRail Africa",
                "industry": "Fintech",
            },
            format="multipart",
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "success"
        assert "fundability_score" in data["audit"]
        assert data["audit"]["fundability_score"] >= 55


@pytest.mark.django_db
class TestCRMIntegrationTasks:
    """Test background task dispatching."""

    def test_dispatch_crm_webhook_task_execution(self):
        # Testing local task runner handling mock payload
        result = dispatch_crm_webhook_task.apply(
            args=["http://127.0.0.1:9999/mock-crm", "stealth_founder_detected", {"founder": "Ada Lovelace", "score": 92.5}]
        ).get()

        assert "status" in result
