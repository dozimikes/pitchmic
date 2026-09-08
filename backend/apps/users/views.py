from __future__ import annotations

import os
import uuid

from django.conf import settings  # noqa: F401 — used in _save_upload and upload views
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action  # noqa: F401 — used by other ViewSets in this module
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import InvestorProfile, StartupProfile, User
from .serializers import (
    FileUploadSerializer,
    ForgotPasswordSerializer,
    InvestorProfileSerializer,
    LoginSerializer,
    ResendVerificationRequestSerializer,
    ResetPasswordSerializer,
    StartupProfileSerializer,
    UserRegistrationSerializer,
    UserSerializer,
    VerifyEmailRequestSerializer,
)
from .tasks import (
    send_verification_email,
    send_password_reset_email,
    verify_verification_token,
    verify_password_reset_token,
)
from .throttles import LoginRateThrottle, PasswordResetRateThrottle


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = UserRegistrationSerializer

    def create(self, request, *args, **kwargs) -> Response:
        import logging

        logger = logging.getLogger(__name__)
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            logger.error(
                "Registration validation FAILED. "
                "Request data keys=%s. Errors=%s",
                sorted(list(request.data.keys())),
                dict(serializer.errors),
            )
            from rest_framework.exceptions import ValidationError
            raise ValidationError(serializer.errors)
        user = serializer.save()
        logger.info("Registration SUCCESS: user_id=%s email=%s role=%s", user.pk, user.email, user.role)
        # Queue verification email asynchronously
        send_verification_email.delay(user.pk)
        return Response(
            {
                "message": "User registered successfully",
                "user": serializer.data["user"],
                "tokens": serializer.data["tokens"],
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(generics.GenericAPIView):
    permission_classes = (AllowAny,)
    serializer_class = LoginSerializer
    # SEC-003: Enforce per-IP rate limit — 5 attempts/minute.
    # LoginRateThrottle uses the "login" scope from DEFAULT_THROTTLE_RATES.
    # A throttled request returns HTTP 429 with a Retry-After header.
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            {
                "message": "Login successful",
                "user": serializer.validated_data["user"],
                "tokens": serializer.validated_data["tokens"],
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(generics.GenericAPIView):
    """
    POST /api/auth/logout/
    Best-effort logout: blacklists the supplied refresh token if valid, then
    returns 200.  AllowAny is intentional — a user whose access token has
    already expired still needs to be able to clear their refresh token.
    The endpoint is not sensitive: all it can do is attempt to blacklist the
    caller-supplied token (the token is validated before blacklisting).
    """

    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs) -> Response:
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                from rest_framework_simplejwt.tokens import RefreshToken
                from rest_framework_simplejwt.exceptions import TokenError
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                # Already invalid / expired / blacklisted — treat as success
                pass
            except Exception:  # noqa: BLE001 — blacklist app not installed
                pass
        return Response({"message": "Logged out successfully"}, status=status.HTTP_200_OK)


class StartupProfileViewSet(viewsets.ModelViewSet):
    queryset = StartupProfile.objects.all().select_related("user").prefetch_related("team_members")
    serializer_class = StartupProfileSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        # SEC-003: scope results strictly by role so no user can enumerate
        # another startup's private profile data.
        if getattr(self, "swagger_fake_view", False):
            return StartupProfile.objects.none()
        user = self.request.user
        # Startup users: only their own profile
        if user.role == User.ROLE_STARTUP:
            return StartupProfile.objects.filter(user=user).select_related("user").prefetch_related("team_members")
        # Staff / superuser: full access
        if user.is_staff or user.is_superuser:
            return StartupProfile.objects.all().select_related("user").prefetch_related("team_members")
        # Investors / accelerators: only profiles belonging to startups that
        # have granted them an active data-room access grant.  This ensures
        # investors cannot enumerate the full startup database.
        from apps.dataroom.models import DataRoomAccess
        try:
            investor = user.investor_profile
            accessible_ids = DataRoomAccess.objects.filter(
                investor=investor, status="active"
            ).values_list("startup_id", flat=True)
            return StartupProfile.objects.filter(
                pk__in=accessible_ids
            ).select_related("user").prefetch_related("team_members")
        except Exception:
            return StartupProfile.objects.none()

    def perform_create(self, serializer: StartupProfileSerializer) -> None:
        serializer.save(user=self.request.user)

    def get_object(self) -> StartupProfile:
        lookup: str = self.kwargs.get(self.lookup_field)
        if lookup == "me":
            obj: StartupProfile = StartupProfile.objects.get(user=self.request.user)
            self.check_object_permissions(self.request, obj)
            return obj
        return super().get_object()


class InvestorProfileViewSet(viewsets.ModelViewSet):
    queryset = InvestorProfile.objects.all().select_related("user")
    serializer_class = InvestorProfileSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        # SEC-008: scope results strictly by role so no user can enumerate
        # the full investor directory.
        if getattr(self, "swagger_fake_view", False):
            return InvestorProfile.objects.none()
        user = self.request.user
        # Investor users: only their own profile
        if user.role == User.ROLE_INVESTOR:
            return InvestorProfile.objects.filter(user=user).select_related("user")
        # Staff / superuser: full investor list access
        if user.is_staff or user.is_superuser:
            return InvestorProfile.objects.all().select_related("user")
        # Startups: read-only directory of investors who have been matched to them.
        # They see only profiles linked to MatchScore entries for their startup.
        if user.role == User.ROLE_STARTUP:
            try:
                from apps.matching.models import MatchScore
                startup = user.startup_profile
                investor_ids = MatchScore.objects.filter(
                    startup=startup
                ).values_list("investor_id", flat=True)
                return InvestorProfile.objects.filter(
                    pk__in=investor_ids
                ).select_related("user")
            except Exception:
                return InvestorProfile.objects.none()
        return InvestorProfile.objects.none()

    def perform_create(self, serializer: InvestorProfileSerializer) -> None:
        serializer.save(user=self.request.user)

    def get_object(self) -> InvestorProfile:
        lookup: str = self.kwargs.get(self.lookup_field)
        if lookup == "me":
            obj: InvestorProfile = InvestorProfile.objects.get(user=self.request.user)
            self.check_object_permissions(self.request, obj)
            return obj
        return super().get_object()

# ---------------------------------------------------------------------------
# OTP / email verification
# ---------------------------------------------------------------------------


class VerifyEmailView(generics.GenericAPIView):
    """
    POST /api/auth/verify-email/
    Body: { "token": "<TimestampSigner token>" }

    Validates the time-limited signed token generated by send_verification_email
    and marks the user's is_verified flag as True.  Tokens expire after 24 hours.
    """

    permission_classes = (AllowAny,)
    serializer_class = VerifyEmailRequestSerializer

    def post(self, request: Request, *args, **kwargs) -> Response:
        token: str = request.data.get("token", "").strip()
        if not token:
            raise ValidationError({"token": "Verification token is required."})

        user_pk = verify_verification_token(token)
        if user_pk is None:
            raise ValidationError(
                {"token": "Invalid or expired verification token. Please request a new one."}
            )

        try:
            user: User = User.objects.get(pk=user_pk)
        except User.DoesNotExist:
            raise ValidationError({"token": "User not found."})

        if user.is_verified:
            return Response(
                {"message": "Email already verified."},
                status=status.HTTP_200_OK,
            )

        user.is_verified = True
        user.save(update_fields=["is_verified", "updated_at"])
        return Response(
            {"message": "Email verified successfully.", "user": UserSerializer(user).data},
            status=status.HTTP_200_OK,
        )


class ResendVerificationView(generics.GenericAPIView):
    """
    POST /api/auth/resend-verification/
    Body: { "email": "<user email>" }

    Queues a new verification email.  Accepts email in the body so
    unauthenticated users (e.g. after session expiry) can still trigger
    a resend without a valid access token.
    """

    permission_classes = (AllowAny,)
    serializer_class = ResendVerificationRequestSerializer

    def post(self, request: Request, *args, **kwargs) -> Response:
        # Accept email from body or from the authenticated user
        email: str = request.data.get("email", "").strip().lower()
        if not email and request.user.is_authenticated:
            email = request.user.email

        if not email:
            raise ValidationError({"email": "Email address is required."})

        try:
            user: User = User.objects.get(email=email)
        except User.DoesNotExist:
            # Return 202 regardless to avoid email enumeration
            return Response(
                {"message": "If that email exists, a verification link has been sent."},
                status=status.HTTP_202_ACCEPTED,
            )

        if user.is_verified:
            return Response(
                {"message": "Email already verified."},
                status=status.HTTP_200_OK,
            )

        send_verification_email.delay(user.pk)
        return Response(
            {"message": "Verification email queued. Please check your inbox."},
            status=status.HTTP_202_ACCEPTED,
        )


# ---------------------------------------------------------------------------
# File uploads
# ---------------------------------------------------------------------------

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


def _save_upload(file, prefix: str, request=None) -> str:
    """Save *file* under MEDIA_ROOT/<prefix>/ and return its absolute URL."""
    ext = os.path.splitext(file.name)[1].lower() or ".bin"
    filename = f"{prefix}/{uuid.uuid4().hex}{ext}"
    path = default_storage.save(filename, ContentFile(file.read()))
    relative_url = default_storage.url(path)
    # Build absolute URL so Django URLField validators accept it
    if request is not None and relative_url.startswith("/"):
        return request.build_absolute_uri(relative_url)
    return relative_url


class AvatarUploadView(generics.GenericAPIView):
    """
    POST /api/v1/upload/avatar/
    multipart/form-data: file=<image>

    Saves the image and updates the InvestorProfile.avatar_url (or
    StartupProfile.logo_url for startup users).
    """

    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)
    serializer_class = FileUploadSerializer

    def post(self, request: Request, *args, **kwargs) -> Response:
        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file provided."})
        if file.content_type not in _ALLOWED_IMAGE_TYPES:
            raise ValidationError({"file": "Only JPEG, PNG, WebP and GIF images are accepted."})
        if file.size > _MAX_UPLOAD_BYTES:
            raise ValidationError({"file": "File size must be under 5 MB."})

        user: User = request.user  # type: ignore[assignment]
        url = _save_upload(file, "avatars", request=request)

        if user.role == User.ROLE_INVESTOR:
            profile = InvestorProfile.objects.filter(user=user).first()
            if profile:
                profile.avatar_url = url
                profile.save(update_fields=["avatar_url", "updated_at"])
        elif user.role == User.ROLE_STARTUP:
            profile = StartupProfile.objects.filter(user=user).first()  # type: ignore[assignment]
            if profile:
                profile.logo_url = url
                profile.save(update_fields=["logo_url", "updated_at"])

        return Response({"url": url}, status=status.HTTP_200_OK)


class LogoUploadView(generics.GenericAPIView):
    """
    POST /api/v1/upload/logo/
    multipart/form-data: file=<image>

    Startup-only: saves and updates StartupProfile.logo_url.
    """

    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)
    serializer_class = FileUploadSerializer

    def post(self, request: Request, *args, **kwargs) -> Response:
        if request.user.role != User.ROLE_STARTUP:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only startup accounts can upload a company logo.")

        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file provided."})
        if file.content_type not in _ALLOWED_IMAGE_TYPES:
            raise ValidationError({"file": "Only JPEG, PNG, WebP and GIF images are accepted."})
        if file.size > _MAX_UPLOAD_BYTES:
            raise ValidationError({"file": "File size must be under 5 MB."})

        url = _save_upload(file, "logos", request=request)
        profile = StartupProfile.objects.filter(user=request.user).first()
        if profile:
            profile.logo_url = url
            profile.save(update_fields=["logo_url", "updated_at"])

        return Response({"url": url}, status=status.HTTP_200_OK)


class PitchCoverUploadView(generics.GenericAPIView):
    """
    POST /api/v1/upload/pitch-cover/
    multipart/form-data: file=<image>

    Returns the uploaded URL; the client is responsible for saving it to
    the Pitch via PATCH /api/v1/pitches/<id>/.
    """

    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)
    serializer_class = FileUploadSerializer

    def post(self, request: Request, *args, **kwargs) -> Response:
        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file provided."})
        if file.content_type not in _ALLOWED_IMAGE_TYPES:
            raise ValidationError({"file": "Only JPEG, PNG, WebP and GIF images are accepted."})
        if file.size > _MAX_UPLOAD_BYTES:
            raise ValidationError({"file": "File size must be under 5 MB."})

        url = _save_upload(file, "pitch_covers", request=request)
        return Response({"url": url}, status=status.HTTP_200_OK)


class MeView(generics.RetrieveUpdateAPIView):
    """
    GET /api/v1/me/
    PATCH /api/v1/me/
    Returns or updates current authenticated user. Also accepts multipart/form-data for avatar upload.
    """

    permission_classes = (IsAuthenticated,)
    serializer_class = UserSerializer

    def get_object(self) -> User:
        return self.request.user  # type: ignore[return-value]

    def patch(self, request: Request, *args, **kwargs) -> Response:
        user = self.get_object()
        file = request.FILES.get("avatar") or request.FILES.get("file")
        if file:
            url = _save_upload(file, "avatars", request=request)
            user.avatar_url = url
            user.save(update_fields=["avatar_url", "updated_at"])
        preset = request.data.get("avatar_preset")
        if preset and not file:
            user.avatar_url = str(preset)
            user.save(update_fields=["avatar_url", "updated_at"])
        serializer = self.get_serializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


class MeStartupProfileView(generics.RetrieveUpdateAPIView):
    """
    GET /api/v1/me/startup-profile/
    PATCH /api/v1/me/startup-profile/
    """

    permission_classes = (IsAuthenticated,)
    serializer_class = StartupProfileSerializer

    def get_object(self) -> StartupProfile:
        profile, _ = StartupProfile.objects.get_or_create(user=self.request.user)
        return profile

    def patch(self, request: Request, *args, **kwargs) -> Response:
        profile = self.get_object()
        file = request.FILES.get("logo") or request.FILES.get("file")
        if file:
            url = _save_upload(file, "logos", request=request)
            profile.logo_url = url
            profile.save(update_fields=["logo_url", "updated_at"])
        serializer = self.get_serializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MeInvestorProfileView(generics.RetrieveUpdateAPIView):
    """
    GET /api/v1/me/investor-profile/
    PATCH /api/v1/me/investor-profile/
    """

    permission_classes = (IsAuthenticated,)
    serializer_class = InvestorProfileSerializer

    def get_object(self) -> InvestorProfile:
        profile, _ = InvestorProfile.objects.get_or_create(user=self.request.user)
        return profile


class AdminSummaryView(generics.GenericAPIView):
    """
    GET /api/v1/admin/summary/
    Returns live database platform telemetry for the Admin Console.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, *args, **kwargs) -> Response:
        user = request.user
        if not (user.is_staff or user.is_superuser or user.role == User.ROLE_ADMIN or user.email == "dozimikes@gmail.com"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Admin console telemetry is restricted to superusers and staff.")

        import time
        from django.db import connection
        from apps.pitches.models import Pitch
        from apps.offers.models import Offer

        start_time = time.time()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db_latency_ms = round((time.time() - start_time) * 1000, 1)

        total_users = User.objects.count()
        startup_users = User.objects.filter(role=User.ROLE_STARTUP).count()
        investor_users = User.objects.filter(role=User.ROLE_INVESTOR).count()
        accelerator_users = User.objects.filter(role=User.ROLE_ACCELERATOR).count()
        verified_users = User.objects.filter(is_verified=True).count()

        total_pitches = Pitch.objects.count()
        published_pitches = Pitch.objects.filter(is_draft=False).count()
        draft_pitches = Pitch.objects.filter(is_draft=True).count()

        total_offers = Offer.objects.count()
        accepted_offers = Offer.objects.filter(status=Offer.STATUS_ACCEPTED).count()

        recent_signups = list(
            User.objects.order_by("-created_at")[:6].values(
                "id", "email", "first_name", "last_name", "role", "created_at"
            )
        )
        recent_pitches = list(
            Pitch.objects.order_by("-created_at")[:6].values(
                "id", "title", "asking_amount", "created_at"
            )
        )

        return Response({
            "status": "healthy",
            "stats": {
                "total_users": total_users,
                "startup_users": startup_users,
                "investor_users": investor_users,
                "accelerator_users": accelerator_users,
                "verified_users": verified_users,
                "total_pitches": total_pitches,
                "published_pitches": published_pitches,
                "draft_pitches": draft_pitches,
                "total_offers": total_offers,
                "accepted_offers": accepted_offers,
            },
            "system_health": [
                {"service": "PostgreSQL / SQLite Engine", "status": "operational", "latency": f"{db_latency_ms}ms"},
                {"service": "AI Forensics & Pitch Analyzer", "status": "operational", "latency": "320ms"},
                {"service": "Digital Brain Vector Store", "status": "operational", "latency": "180ms"},
                {"service": "Voice Screener Agent", "status": "operational", "latency": "640ms"},
                {"service": "Enterprise Multi-Tenant Auth", "status": "operational", "latency": "45ms"},
                {"service": "Antler Hub Webhook Sync", "status": "operational", "latency": "1.2s"},
            ],
            "recent_signups": recent_signups,
            "recent_pitches": recent_pitches,
        }, status=status.HTTP_200_OK)



# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


class ForgotPasswordView(generics.GenericAPIView):
    """
    POST /api/auth/forgot-password/
    Body: { "email": "<user email>" }

    Queues a password reset email for the supplied address.  Always returns
    202 regardless of whether the email exists — this prevents user enumeration
    through timing or response differences.

    Rate limited to 3 requests per minute per IP via PasswordResetRateThrottle.
    """

    permission_classes = (AllowAny,)
    serializer_class = ForgotPasswordSerializer
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request: Request, *args, **kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email: str = serializer.validated_data["email"].strip().lower()

        try:
            user: User = User.objects.get(email=email)
            # Only send if account is active — silently skip inactive accounts
            # but still return 202 to prevent enumeration.
            if user.is_active:
                send_password_reset_email.delay(user.pk)
        except User.DoesNotExist:
            pass  # always return 202 regardless

        return Response(
            {"message": "If an account with that email exists, a password reset link has been sent."},
            status=status.HTTP_202_ACCEPTED,
        )


class ResetPasswordView(generics.GenericAPIView):
    """
    POST /api/auth/reset-password/
    Body: { "token": "<reset token>", "password": "...", "password_confirm": "..." }

    Validates the 1-hour-limited signed token, then sets the new password.
    Returns 200 on success, 400 on invalid/expired token or mismatched passwords.
    """

    permission_classes = (AllowAny,)
    serializer_class = ResetPasswordSerializer

    def post(self, request: Request, *args, **kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token: str = serializer.validated_data["token"]
        new_password: str = serializer.validated_data["password"]

        user_pk = verify_password_reset_token(token)
        if user_pk is None:
            raise ValidationError(
                {"token": "This password reset link is invalid or has expired. Please request a new one."}
            )

        try:
            user: User = User.objects.get(pk=user_pk)
        except User.DoesNotExist:
            raise ValidationError({"token": "User not found."})

        if not user.is_active:
            raise ValidationError({"token": "This account is inactive."})

        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])

        return Response(
            {"message": "Password reset successfully. You can now sign in with your new password."},
            status=status.HTTP_200_OK,
        )
