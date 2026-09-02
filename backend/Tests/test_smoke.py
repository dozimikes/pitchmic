"""
Smoke tests — focused vertical-slice through the critical backend paths:
  1. Offer FSM transitions (model-level, unit tests)
  2. Offer transitions via API end-to-end
  3. Activity feed role-based visibility
  4. Pitch ?mine=true scoping
  5. Email verification flow
  6. Upload endpoints (avatar/logo/pitch-cover

Run from backend/: pytest Tests/test_smoke.py -v
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
from apps.pitches.models import Pitch
from apps.users.models import InvestorProfile, StartupProfile, User


# ---------------------------------------------------------------------------
# 1. Offer FSM transitions — pure model-level unit tests (no DB in can_transition)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOfferFSMTransitions:
    @pytest.fixture
    def _seed(self, db):
        startup = User.objects.create_user(
            email="fsm_startup@example.com", password="x", role=User.ROLE_STARTUP
        )
        sp = StartupProfile.objects.create(user=startup, company_name="FSM Startup")
        investor = User.objects.create_user(
            email="fsm_inv@example.com", password="x", role=User.ROLE_INVESTOR
        )
        ip = InvestorProfile.objects.create(user=investor, full_name="FSM Investor")
        pitch = Pitch.objects.create(
            startup=sp, title="FSM Pitch", description="desc", is_draft=False
        )
        return startup, sp, investor, ip, pitch

    def test_draft_to_sent(self, _seed):
        _, _, _, ip, pitch = _seed
        offer = Offer.objects.create(
            investor=ip, pitch=pitch, amount=100_000, equity_pct=10,
            status=Offer.STATUS_DRAFT,
        )
        assert offer.can_transition(Offer.STATUS_SENT) is True
        assert offer.can_transition(Offer.STATUS_ACCEPTED) is False
        offer.transition_to(Offer.STATUS_SENT)
        offer.save()
        offer.refresh_from_db()
        assert offer.status == Offer.STATUS_SENT
        assert offer.sent_at is not None

    def test_sent_to_accepted(self, _seed):
        _, _, _, ip, pitch = _seed
        offer = Offer.objects.create(
            investor=ip, pitch=pitch, amount=50_000, equity_pct=5,
            status=Offer.STATUS_SENT,
        )
        assert offer.can_transition(Offer.STATUS_ACCEPTED) is True
        offer.transition_to(Offer.STATUS_ACCEPTED)
        offer.save()
        offer.refresh_from_db()
        assert offer.status == Offer.STATUS_ACCEPTED
        assert offer.responded_at is not None

    def test_sent_to_rejected_and_back_to_sent(self, _seed):
        _, _, _, ip, pitch = _seed
        offer = Offer.objects.create(
            investor=ip, pitch=pitch, amount=25_000, equity_pct=3,
            status=Offer.STATUS_SENT,
        )
        offer.transition_to(Offer.STATUS_REJECTED)
        offer.save()
        offer.refresh_from_db()
        assert offer.status == Offer.STATUS_REJECTED
        assert offer.can_transition(Offer.STATUS_SENT) is True
        assert offer.can_transition(Offer.STATUS_ACCEPTED) is False

    def test_invalid_transition_raises(self, _seed):
        _, _, _, ip, pitch = _seed
        offer = Offer.objects.create(
            investor=ip, pitch=pitch, amount=10_000, equity_pct=1,
            status=Offer.STATUS_DRAFT,
        )
        with pytest.raises(ValueError, match=r"Cannot transition from draft to accepted"):
            offer.transition_to(Offer.STATUS_ACCEPTED)

    def test_sent_to_negotiating_loop(self, _seed):
        _, _, _, ip, pitch = _seed
        offer = Offer.objects.create(
            investor=ip, pitch=pitch, amount=75_000, equity_pct=7,
            status=Offer.STATUS_SENT,
        )
        offer.transition_to(Offer.STATUS_NEGOTIATING)
        offer.save()
        assert Offer.objects.get(pk=offer.pk).status == Offer.STATUS_NEGOTIATING
        offer.transition_to(Offer.STATUS_SENT)
        offer.save()
        assert Offer.objects.get(pk=offer.pk).status == Offer.STATUS_SENT


# ---------------------------------------------------------------------------
# 2. Offer transitions via API end-to-end
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOfferTransitionsAPI:
    @pytest.fixture
    def pitch_id(self, auth_startup):
        resp = auth_startup.post(
            "/api/v1/pitches/",
            {
                "title": "Smoke Fundable",
                "description": "Seed round.",
                "asking_amount": "500000.00",
                "equity_offered": "10.00",
                "is_draft": False,
            },
            format="json",
        )
        return resp.json()["id"]

    def test_draft_send_action_sets_sent(self, auth_investor, pitch_id):
        create = auth_investor.post(
            "/api/v1/offers/",
            {"pitch": pitch_id, "amount": "100000.00", "equity_pct": "5.00", "status": "draft"},
            format="json",
        )
        assert create.status_code == status.HTTP_201_CREATED
        oid = create.json()["id"]
        resp = auth_investor.post(f"/api/v1/offers/{oid}/send/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["offer"]["status"] == "sent"

    def test_accepted_accepted_via_startup(self, auth_investor, auth_startup, pitch_id):
        create = auth_investor.post(
            "/api/v1/offers/",
            {"pitch": pitch_id, "amount": "200000.00", "equity_pct": "8.00", "status": "sent"},
            format="json",
        )
        oid = create.json()["id"]
        resp = auth_startup.post(f"/api/v1/offers/{oid}/transition/accepted/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["offer"]["status"] == "accepted"

    def test_rejected_via_startup(self, auth_investor, auth_startup, pitch_id):
        create = auth_investor.post(
            "/api/v1/offers/",
            {"pitch": pitch_id, "amount": "20000.00", "equity_pct": "50.00", "status": "sent"},
            format="json",
        )
        oid = create.json()["id"]
        resp = auth_startup.post(f"/api/v1/offers/{oid}/transition/rejected/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["offer"]["status"] == "rejected"

    def test_invalid_transition_api_400(self, auth_investor, pitch_id):
        create = auth_investor.post(
            "/api/v1/offers/",
            {"pitch": pitch_id, "amount": "5000.00", "equity_pct": "1.00", "status": "draft"},
            format="json",
        )
        oid = create.json()["id"]
        resp = auth_investor.post(f"/api/v1/offers/{oid}/transition/accepted/")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "valid_transitions" in resp.json()

    def test_startup_cannot_send_investor_transitions(self, auth_investor, auth_startup, pitch_id):
        create = auth_investor.post(
            "/api/v1/offers/",
            {"pitch": pitch_id, "amount": "50000.00", "equity_pct": "3.00", "status": "draft"},
            format="json",
        )
        oid = create.json()["id"]
        resp = auth_startup.post(f"/api/v1/offers/{oid}/send/")
        assert resp.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# 3. Activity feed role-based visibility
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestActivityFeed:
    def test_investor_feed_pitch_events_visible(self, auth_investor, startup_user, investor_user):
        pitch = Pitch.objects.create(
            startup=startup_user.startup_profile,
            title="Feed Smoke Pitch",
            description="Feed me.",
        )
        pitch_ct = ContentType.objects.get_for_model(Pitch)
        Activity.objects.create(
            actor=startup_user, verb=Activity.VERB_PITCH_CREATED,
            target_content_type=pitch_ct, target_object_id=pitch.id,
        )
        Activity.objects.create(
            actor=investor_user, verb=Activity.VERB_OFFER_MADE,
            target_content_type=pitch_ct, target_object_id=pitch.id,
        )
        resp = auth_investor.get("/api/v1/feed/")
        assert resp.status_code == status.HTTP_200_OK
        verbs = {a["verb"] for a in resp.json()["results"]}
        assert Activity.VERB_PITCH_CREATED in verbs

    def test_startup_feed_offer_events_visible(self, auth_startup, startup_user, investor_user):
        pitch = Pitch.objects.create(
            startup=startup_user.startup_profile,
            title="Smoke pitch 2",
            description="Offer me.",
        )
        pitch_ct = ContentType.objects.get_for_model(Pitch)
        Activity.objects.create(
            actor=investor_user, verb=Activity.VERB_OFFER_MADE,
            target_content_type=pitch_ct, target_object_id=pitch.id,
        )
        resp = auth_startup.get("/api/v1/feed/")
        assert resp.status_code == status.HTTP_200_OK
        verbs = {a["verb"] for a in resp.json()["results"]}
        assert Activity.VERB_OFFER_MADE in verbs

    def test_verb_filter_param(self, auth_startup, startup_user):
        pitch = Pitch.objects.create(
            startup=startup_user.startup_profile,
            title="Pitch for verb filter", description="x",
        )
        pitch_ct = ContentType.objects.get_for_model(Pitch)
        Activity.objects.create(
            actor=startup_user, verb=Activity.VERB_PITCH_CREATED,
            target_content_type=pitch_ct, target_object_id=pitch.id,
        )
        Activity.objects.create(
            actor=startup_user, verb=Activity.VERB_STARTUP_JOINED,
        )
        resp = auth_startup.get(f"/api/v1/feed/?verb={Activity.VERB_PITCH_CREATED}")
        assert resp.status_code == status.HTTP_200_OK
        for a in resp.json()["results"]:
            assert a["verb"] == Activity.VERB_PITCH_CREATED


# ---------------------------------------------------------------------------
# 4. Pitch ?mine=true scoping
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPitchMineFilter:
    def test_mine_true_includes_drafts(self, auth_startup):
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Mine public", "description": "pub", "is_draft": False},
            format="json",
        )
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Mine draft", "description": "priv", "is_draft": True},
            format="json",
        )
        resp = auth_startup.get("/api/v1/pitches/?mine=true")
        assert resp.status_code == status.HTTP_200_OK
        titles = {p["title"] for p in resp.json()["results"]}
        assert "Mine public" in titles
        assert "Mine draft" in titles

    def test_mine_false_excludes_drafts(self, auth_startup):
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "List only published", "description": "pub", "is_draft": False},
            format="json",
        )
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "List not draft", "description": "priv", "is_draft": True},
            format="json",
        )
        resp = auth_startup.get("/api/v1/pitches/")
        titles = {p["title"] for p in resp.json()["results"]}
        assert "List only published" in titles
        assert "List not draft" not in titles

    def test_mine_scoped_per_user(self, auth_startup, auth_investor, startup_user):
        auth_startup.post(
            "/api/v1/pitches/",
            {"title": "Scoped to startup only", "description": "x"},
            format="json",
        )
        other = User.objects.create_user(
            email="other_startup@example.com", password="x", role=User.ROLE_STARTUP,
        )
        StartupProfile.objects.create(user=other, company_name="Other Startup")
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        resp = other_client.get("/api/v1/pitches/?mine=true")
        titles = {p["title"] for p in resp.json()["results"]}
        assert "Scoped to startup only" not in titles


# ---------------------------------------------------------------------------
# 5. Email verification flow
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestVerifyEmailFlow:
    def test_verify_requires_authentication(self, api_client):
        resp = api_client.post(
            "/api/auth/verify-email/", {"token": "x"}, format="json",
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_verify_marks_verified(self, auth_startup, startup_user):
        assert not startup_user.is_verified
        resp = auth_startup.post(
            "/api/auth/verify-email/", {"token": "valid-token-123"}, format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        startup_user.refresh_from_db()
        assert startup_user.is_verified is True

    def test_verify_empty_token_rejected(self, auth_startup):
        resp = auth_startup.post("/api/auth/verify-email/", {"token": "   "}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_already_verified_is_idempotent(self, auth_startup, startup_user):
        startup_user.is_verified = True
        startup_user.save()
        resp = auth_startup.post(
            "/api/auth/verify-email/", {"token": "again"}, format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert "already verified" in resp.json()["message"].lower()

    def test_resend_verification_queued(self, auth_startup):
        resp = auth_startup.post("/api/auth/resend-verification/", {}, format="json")
        assert resp.status_code == status.HTTP_202_ACCEPTED
        assert "queued" in resp.json()["message"].lower()


# ---------------------------------------------------------------------------
# 6. Upload endpoints
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestUploadsSmoke:
    def _small_png(self):
        return SimpleUploadedFile(
            "tiny.png",
            content=b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x00\x00\x00\x00\x00IEND\xaeB`",
            content_type="image/png",
        )

    def test_avatar_upload_returns_url(self, auth_investor):
        resp = auth_investor.post(
            "/api/v1/upload/avatar/", {"file": self._small_png()}, format="multipart",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert "url" in resp.json()

    def test_logo_upload_startup_only(self, auth_startup):
        resp = auth_startup.post(
            "/api/v1/upload/logo/", {"file": self._small_png()}, format="multipart",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert "url" in resp.json()

    def test_logo_upload_investor_forbidden(self, auth_investor):
        resp = auth_investor.post(
            "/api/v1/upload/logo/", {"file": self._small_png()}, format="multipart",
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_pitch_cover_upload(self, auth_startup):
        resp = auth_startup.post(
            "/api/v1/upload/pitch-cover/", {"file": self._small_png()}, format="multipart",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert "url" in resp.json()

    def test_upload_oversize_rejected(self, auth_investor):
        big = SimpleUploadedFile(
            "big.png",
            content=b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024),
            content_type="image/png",
        )
        resp = auth_investor.post(
            "/api/v1/upload/avatar/", {"file": big}, format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_upload_wrong_type_rejected(self, auth_investor):
        bad = SimpleUploadedFile(
            "bad.exe",
            content=b"MZ\x90\x00bogus",
            content_type="application/octet-stream",
        )
        resp = auth_investor.post(
            "/api/v1/upload/avatar/", {"file": bad}, format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_upload_no_file_rejected(self, auth_startup):
        resp = auth_startup.post("/api/v1/upload/avatar/", format="multipart")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
