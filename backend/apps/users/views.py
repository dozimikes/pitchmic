from __future__ import annotations

import os
import uuid

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import InvestorProfile, StartupProfile, User
from .serializers import (
    FileUploadSerializer,
    InvestorProfileSerializer,
    LoginSerializer,
    ResendVerificationRequestSerializer,
    StartupProfileSerializer,
    UserRegistrationSerializer,
    UserSerializer,
    VerifyEmailRequestSerializer,
)
from .tasks import send_verification_email, verify_verification_token


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
    """Best-effort logout: attempt to blacklist the refresh token if the
    SimpleJWT token_blacklist app is installed, then return 200."""

    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs) -> Response:
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                from rest_framework_simplejwt.tokens import RefreshToken
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:  # noqa: BLE001
                pass  # blacklist app not installed or token already invalid
        return Response({"message": "Logged out successfully"}, status=status.HTTP_200_OK)


class StartupProfileViewSet(viewsets.ModelViewSet):
    queryset = StartupProfile.objects.all().select_related("user").prefetch_related("team_members")
    serializer_class = StartupProfileSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return StartupProfile.objects.none()
        queryset = super().get_queryset()
        user = self.request.user
        if user.role == User.ROLE_STARTUP:
            return queryset
        return queryset

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
