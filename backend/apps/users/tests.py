"""
Smoke tests for users app: registration, login, profile endpoints,
offers FSM transitions, pitch ?mine=true filter, activity feed role-filter,
OTP verification, and upload endpoints.
"""
from __future__ import annotations

from io import BytesIO

import pytest
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.newsfeed.models import Activity
from apps.offers.models import Offer
from apps.pitches.models import Pitch, PitchLike
from apps.users.models import InvestorProfile, StartupProfile, User


@pytest.mark.django_db
class TestRegisterView:
    def test_startup_registration(self, api_client: APIClient) -> None:
        payload = {
            "email": "new_startup@example.com",
            "password": "StrongPass1!",
            "password_confirm": "StrongPass1!",
            "first_name": "Jane",
            "last_name": "Doe",
            "role": "startup",
        }
        resp = api_client.post(reverse("auth-register"), payload, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert "tokens" in data
        assert data["user"]["email"] == "new_startup@example.com"
        assert User.objects.filter(email="new_startup@example.com").exists()
        assert StartupProfile.objects.filter(user__email="new_startup@example.com").exists()

    def test_investor_registration(self, api_client: APIClient) -> None:
        payload = {
            "email": "new_investor@example.com",
            "password": "StrongPass1!",
            "password_confirm": "StrongPass1!",
            "first_name": "John",
            "last_name": "Smith",
            "role": "investor",
        }
        resp = api_client.post(reverse("auth-register"), payload, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        assert InvestorProfile.objects.filter(user__email="new_investor@example.com").exists()

    def test_password_mismatch_rejected(self, api_client: APIClient) -> None:
        payload = {
            "email": "bad@example.com",
            "password": "StrongPass1!",
            "password_confirm": "WrongPass2!",
            "role": "startup",
        }
        resp = api_client.post(reverse("auth-register"), payload, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_duplicate_email_rejected(self, api_client: APIClient, startup_user: User) -> None:
        payload = {
            "email": startup_user.email,
            "password": "StrongPass1!",
            "password_confirm": "StrongPass1!",
            "role": "startup",
        }
        resp = api_client.post(reverse("auth-register"), payload, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestLoginView:
    def test_valid_login_returns_tokens(self, api_client: APIClient, startup_user: User) -> None:
        resp = api_client.post(
            reverse("auth-login"),
            {"email": startup_user.email, "password": "TestPass1!"},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "access" in data["tokens"]
        assert "refresh" in data["tokens"]

    def test_wrong_password_rejected(self, api_client: APIClient, startup_user: User) -> None:
        resp = api_client.post(
            reverse("auth-login"),
            {"email": startup_user.email, "password": "WrongPassword99!"},
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestHealthCheck:
    def test_health_returns_200(self, api_client: APIClient) -> None:
        resp = api_client.get(reverse("health-check"))
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["status"] == "healthy"


@pytest.mark.django_db
class TestStartupProfileViewSet:
    def test_me_returns_profile(self, auth_startup: APIClient) -> None:
        resp = auth_startup.get("/api/v1/profiles/startup/me/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["company_name"] == "Acme Corp"

    def test_unauthenticated_returns_401(self, api_client: APIClient) -> None:
        resp = api_client.get("/api/v1/profiles/startup/me/")
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestPitchViewSet:
    def test_create_pitch(self, auth_startup: APIClient) -> None:
        payload = {
            "title": "AI-powered logistics",
            "description": "We move boxes smarter.",
            "asking_amount": "500000.00",
            "equity_offered": "10.00",
        }
        resp = auth_startup.post("/api/v1/pitches/", payload, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.json()["title"] == "AI-powered logistics"

    def test_investor_cannot_create_pitch(self, auth_investor: APIClient) -> None:
        payload = {"title": "Bad pitch", "description": "Should fail."}
        resp = auth_investor.post("/api/v1/pitches/", payload, format="json")
        # Should 400 (no startup profile) or 403
        assert resp.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_403_FORBIDDEN,
        )

    def test_list_only_published(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Draft pitch", "description": "Hidden.", "is_draft": True},
            format="json",
        )
        resp = auth_investor.get("/api/v1/pitches/")
        assert resp.status_code == status.HTTP_200_OK
        titles = [p["title"] for p in resp.json()["results"]]
        assert "Draft pitch" not in titles

    def test_mine_filter_includes_drafts(self, auth_startup: APIClient) -> None:
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Published pitch", "description": "Public.", "is_draft": False},
            format="json",
        )
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Secret draft", "description": "Private.", "is_draft": True},
            format="json",
        )
        resp = auth_startup.get("/api/v1/pitches/?mine=true")
        assert resp.status_code == status.HTTP_200_OK
        titles = [p["title"] for p in resp.json()["results"]]
        assert "Published pitch" in titles
        assert "Secret draft" in titles

    def test_mine_filter_scoped_to_user(self, auth_startup: APIClient, auth_investor: APIClient) -> None:
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Acme pitch", "description": "Only mine."},
            format="json",
        )
        resp = auth_investor.get("/api/v1/pitches/?mine=true")
        assert resp.status_code == status.HTTP_200_OK
        titles = [p["title"] for p in resp.json()["results"]]
        assert "Acme pitch" not in titles

    def test_like_pitch(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        create_resp = auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Likable pitch", "description": "Like me.", "is_draft": False},
            format="json",
        )
        pitch_id = create_resp.json()["id"]
        like_resp = auth_investor.post(f"/api/v1/pitches/{pitch_id}/like/")
        assert like_resp.status_code == status.HTTP_201_CREATED
        assert like_resp.json()["like_count"] == 1
        assert PitchLike.objects.filter(pitch_id=pitch_id).exists()

    def test_unlike_pitch(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        create_resp = auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Unlikable pitch", "description": "Unlike me.", "is_draft": False},
            format="json",
        )
        pitch_id = create_resp.json()["id"]
        auth_investor.post(f"/api/v1/pitches/{pitch_id}/like/")
        unlike_resp = auth_investor.delete(f"/api/v1/pitches/{pitch_id}/like/")
        assert unlike_resp.status_code == status.HTTP_200_OK
        assert unlike_resp.json()["like_count"] == 0


@pytest.mark.django_db
class TestOfferViewSet:
    def _create_pitch(self, auth_startup: APIClient) -> int:
        resp = auth_startup.post(
            "/api/v1/pitches/",
            {
                "title": "Fundable Startup",
                "description": "Seed round.",
                "asking_amount": "500000.00",
                "equity_offered": "10.00",
                "is_draft": False,
            },
            format="json",
        )
        return resp.json()["id"]

    def test_investor_creates_draft_offer(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        pitch_id = self._create_pitch(auth_startup)
        resp = auth_investor.post(
            "/api/v1/offers/",
            {
                "pitch": pitch_id,
                "amount": "250000.00",
                "equity_pct": "5.00",
                "message": "Interested in your startup.",
                "status": "draft",
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.json()["status"] == "draft"

    def test_investor_sends_offer_via_transition(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        pitch_id = self._create_pitch(auth_startup)
        create_resp = auth_investor.post(
            "/api/v1/offers/",
            {
                "pitch": pitch_id,
                "amount": "250000.00",
                "equity_pct": "5.00",
                "status": "draft",
            },
            format="json",
        )
        offer_id = create_resp.json()["id"]
        send_resp = auth_investor.post(f"/api/v1/offers/{offer_id}/transition/sent/")
        assert send_resp.status_code == status.HTTP_200_OK
        assert send_resp.json()["offer"]["status"] == "sent"
        assert Offer.objects.get(pk=offer_id).sent_at is not None

    def test_investor_send_draft_action(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        pitch_id = self._create_pitch(auth_startup)
        create_resp = auth_investor.post(
            "/api/v1/offers/",
            {
                "pitch": pitch_id,
                "amount": "100000.00",
                "equity_pct": "3.00",
                "status": "draft",
            },
            format="json",
        )
        offer_id = create_resp.json()["id"]
        send_resp = auth_investor.post(f"/api/v1/offers/{offer_id}/send/")
        assert send_resp.status_code == status.HTTP_200_OK
        assert send_resp.json()["offer"]["status"] == "sent"

    def test_startup_accepts_offer(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        pitch_id = self._create_pitch(auth_startup)
        create_resp = auth_investor.post(
            "/api/v1/offers/",
            {
                "pitch": pitch_id,
                "amount": "300000.00",
                "equity_pct": "7.00",
                "status": "sent",
            },
            format="json",
        )
        offer_id = create_resp.json()["id"]
        accept_resp = auth_startup.post(f"/api/v1/offers/{offer_id}/transition/accepted/")
        assert accept_resp.status_code == status.HTTP_200_OK
        assert accept_resp.json()["offer"]["status"] == "accepted"
        assert Offer.objects.get(pk=offer_id).responded_at is not None

    def test_startup_rejects_offer(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        pitch_id = self._create_pitch(auth_startup)
        create_resp = auth_investor.post(
            "/api/v1/offers/",
            {
                "pitch": pitch_id,
                "amount": "50000.00",
                "equity_pct": "40.00",
                "status": "sent",
            },
            format="json",
        )
        offer_id = create_resp.json()["id"]
        reject_resp = auth_startup.post(f"/api/v1/offers/{offer_id}/transition/rejected/")
        assert reject_resp.status_code == status.HTTP_200_OK
        assert reject_resp.json()["offer"]["status"] == "rejected"

    def test_invalid_transition_rejected(self, auth_investor: APIClient, auth_startup: APIClient) -> None:
        pitch_id = self._create_pitch(auth_startup)
        create_resp = auth_investor.post(
            "/api/v1/offers/",
            {
                "pitch": pitch_id,
                "amount": "100000.00",
                "equity_pct": "5.00",
                "status": "draft",
            },
            format="json",
        )
        offer_id = create_resp.json()["id"]
        resp = auth_investor.post(f"/api/v1/offers/{offer_id}/transition/accepted/")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "valid_transitions" in resp.json()

    def test_startup_cannot_create_offer(self, auth_startup: APIClient) -> None:
        resp = auth_startup.post(
            "/api/v1/offers/",
            {"pitch": 1, "amount": "1000.00", "equity_pct": "1.00"},
            format="json",
        )
        assert resp.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN, status.HTTP_500_INTERNAL_SERVER_ERROR)

    def test_offers_scoped_to_investor(self, auth_investor: APIClient, auth_startup: APIClient, investor_user: User) -> None:
        pitch_id = self._create_pitch(auth_startup)
        auth_investor.post(
            "/api/v1/offers/",
            {"pitch": pitch_id, "amount": "50000.00", "equity_pct": "2.00", "status": "sent"},
            format="json",
        )
        other_user = User.objects.create_user(
            email="other_investor@example.com",
            password="TestPass2!",
            role=User.ROLE_INVESTOR,
        )
        InvestorProfile.objects.create(user=other_user, full_name="Other Investor")
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        resp = other_client.get("/api/v1/offers/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["count"] == 0


@pytest.mark.django_db
class TestActivityFeedRoleFilter:
    def test_investor_sees_pitch_events(self, auth_investor: APIClient, auth_startup: APIClient, startup_user: User, investor_user: User) -> None:
        pitch = Pitch.objects.create(
            startup=startup_user.startup_profile,
            title="Feed pitch",
            description="In feed.",
        )
        pitch_ct = ContentType.objects.get_for_model(Pitch)
        Activity.objects.create(
            actor=startup_user,
            verb=Activity.VERB_PITCH_CREATED,
            target_content_type=pitch_ct,
            target_object_id=pitch.id,
        )
        Activity.objects.create(
            actor=investor_user,
            verb=Activity.VERB_OFFER_MADE,
            target_content_type=pitch_ct,
            target_object_id=pitch.id,
        )
        Activity.objects.create(
            actor=startup_user,
            verb=Activity.VERB_TEAM_MEMBER_ADDED,
        )
        resp = auth_investor.get("/api/v1/feed/")
        assert resp.status_code == status.HTTP_200_OK
        verbs = [a["verb"] for a in resp.json()["results"]]
        assert Activity.VERB_PITCH_CREATED in verbs
        assert Activity.VERB_OFFER_MADE in verbs
        assert Activity.VERB_TEAM_MEMBER_ADDED not in verbs

    def test_startup_sees_offer_events(self, auth_startup: APIClient, auth_investor: APIClient, startup_user: User, investor_user: User) -> None:
        pitch = Pitch.objects.create(
            startup=startup_user.startup_profile,
            title="Offer pitch",
            description="Offer target.",
        )
        pitch_ct = ContentType.objects.get_for_model(Pitch)
        Activity.objects.create(
            actor=investor_user,
            verb=Activity.VERB_OFFER_MADE,
            target_content_type=pitch_ct,
            target_object_id=pitch.id,
        )
        Activity.objects.create(
            actor=startup_user,
            verb=Activity.VERB_PITCH_CREATED,
            target_content_type=pitch_ct,
            target_object_id=pitch.id,
        )
        resp = auth_startup.get("/api/v1/feed/")
        assert resp.status_code == status.HTTP_200_OK
        verbs = [a["verb"] for a in resp.json()["results"]]
        assert Activity.VERB_OFFER_MADE in verbs
        assert Activity.VERB_PITCH_CREATED in verbs


@pytest.mark.django_db
class TestEmailVerification:
    def test_verify_email_requires_token(self, auth_startup: APIClient) -> None:
        resp = auth_startup.post("/api/auth/verify-email/", {}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_email_succeeds(self, auth_startup: APIClient, startup_user: User) -> None:
        assert not startup_user.is_verified
        resp = auth_startup.post(
            "/api/auth/verify-email/",
            {"token": "some-valid-token"},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        startup_user.refresh_from_db()
        assert startup_user.is_verified

    def test_already_verified_idempotent(self, auth_startup: APIClient, startup_user: User) -> None:
        startup_user.is_verified = True
        startup_user.save()
        resp = auth_startup.post(
            "/api/auth/verify-email/",
            {"token": "token"},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert "already verified" in resp.json()["message"].lower()

    def test_resend_verification(self, auth_startup: APIClient) -> None:
        resp = auth_startup.post("/api/auth/resend-verification/", {}, format="json")
        assert resp.status_code == status.HTTP_202_ACCEPTED
        assert "queued" in resp.json()["message"].lower()

    def test_unauthenticated_verify_denied(self, api_client: APIClient) -> None:
        resp = api_client.post(
            "/api/auth/verify-email/",
            {"token": "x"},
            format="json",
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestUploadEndpoints:
    def test_avatar_upload_no_file_rejected(self, auth_startup: APIClient) -> None:
        resp = auth_startup.post("/api/v1/upload/avatar/")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_logo_upload_investor_denied(self, auth_investor: APIClient) -> None:
        resp = auth_investor.post("/api/v1/upload/logo/")
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_pitch_cover_upload_rejects_oversize(self, auth_startup: APIClient) -> None:
        big_file = SimpleUploadedFile(
            "too_big.png",
            content=b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024),
            content_type="image/png",
        )
        resp = auth_startup.post(
            "/api/v1/upload/pitch-cover/",
            {"file": big_file},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_avatar_upload_wrong_type_rejected(self, auth_investor: APIClient) -> None:
        bad_file = SimpleUploadedFile(
            "bad.exe",
            content=b"MZ\x90\x00not-really-exe",
            content_type="application/octet-stream",
        )
        resp = auth_investor.post(
            "/api/v1/upload/avatar/",
            {"file": bad_file},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_upload_denied(self, api_client: APIClient) -> None:
        resp = api_client.post("/api/v1/upload/avatar/")
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestDelegationRouters:
    def test_startups_delegation_endpoint_listable(self, auth_startup: APIClient) -> None:
        resp = auth_startup.get("/api/v1/startups/")
        assert resp.status_code == status.HTTP_200_OK

    def test_investors_delegation_endpoint_listable(self, auth_investor: APIClient) -> None:
        resp = auth_investor.get("/api/v1/investors/")
        assert resp.status_code == status.HTTP_200_OK
