"""
apps.users.tasks
================
Celery tasks for the users app.

Tasks
-----
  send_verification_email(user_id)
    Generates a time-limited signed token via Django's TimestampSigner,
    then sends a verification email to the user.

    Token format:  base64url(user_pk) + ":" + timestamp + ":" + hmac_signature
    Max age:       24 hours (86400 seconds)
    Signing key:   settings.SECRET_KEY  (via TimestampSigner default)

  The token is stateless - no DB row is created.  Validation is done in
  VerifyEmailView by calling TimestampSigner.unsign(token, max_age=86400).
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

# Maximum token lifetime: 24 hours
VERIFICATION_TOKEN_MAX_AGE: int = 60 * 60 * 24

_SIGNER_SALT = "pitchmic.email_verification"


def make_verification_token(user_pk: int) -> str:
    """
    Return a time-stamped signed token encoding *user_pk*.
    Safe to pass in a URL query parameter (uses URL-safe base64).
    """
    signer = signing.TimestampSigner(salt=_SIGNER_SALT)
    return signer.sign(str(user_pk))


def verify_verification_token(token: str) -> int | None:
    """
    Validate *token* and return the user PK it encodes, or None if invalid/expired.
    """
    signer = signing.TimestampSigner(salt=_SIGNER_SALT)
    try:
        user_pk_str = signer.unsign(token, max_age=VERIFICATION_TOKEN_MAX_AGE)
        return int(user_pk_str)
    except (signing.SignatureExpired, signing.BadSignature, ValueError):
        return None


# ---------------------------------------------------------------------------
# Password reset tokens - separate salt to prevent token reuse across flows
# ---------------------------------------------------------------------------

# Maximum lifetime: 1 hour (tighter than email verification - password reset
# is a higher-security operation).
PASSWORD_RESET_TOKEN_MAX_AGE: int = 60 * 60  # 1 hour

_PASSWORD_RESET_SALT = "pitchmic.password_reset"


def make_password_reset_token(user_pk: int) -> str:
    """
    Return a time-stamped signed token encoding *user_pk* for use in a
    password reset URL.  Uses a distinct salt from the email verification
    token so the two token types cannot be used interchangeably.
    """
    signer = signing.TimestampSigner(salt=_PASSWORD_RESET_SALT)
    return signer.sign(str(user_pk))


def verify_password_reset_token(token: str) -> int | None:
    """
    Validate a password reset *token* and return the user PK it encodes,
    or None if invalid or expired (> 1 hour old).
    """
    signer = signing.TimestampSigner(salt=_PASSWORD_RESET_SALT)
    try:
        user_pk_str = signer.unsign(token, max_age=PASSWORD_RESET_TOKEN_MAX_AGE)
        return int(user_pk_str)
    except (signing.SignatureExpired, signing.BadSignature, ValueError):
        return None


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    ignore_result=True,
    name="users.send_verification_email",
)
def send_verification_email(self, user_id: int) -> None:  # noqa: ANN001
    """
    Build a verification token for *user_id* and send the verification email.
    Retries up to 3 times with exponential backoff on any exception.
    """
    from apps.users.models import User  # local import avoids circular deps at module load

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning("send_verification_email: user pk=%s not found, skipping", user_id)
        return

    if user.is_verified:
        logger.info("send_verification_email: user pk=%s already verified, skipping", user_id)
        return

    token = make_verification_token(user.pk)

    # Build the frontend verification URL.  Falls back to localhost for local dev.
    frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000")
    verify_url = f"{frontend_base}/verify?token={token}"

    subject = "Verify your PitchMic email address"
    plain_body = (
        f"Hi {user.first_name or user.email},\n\n"
        f"Please verify your email address by clicking the link below:\n\n"
        f"{verify_url}\n\n"
        f"This link expires in 24 hours.\n\n"
        f"If you did not create a PitchMic account, you can safely ignore this email.\n\n"
        f"- The PitchMic Team"
    )
    html_body = (
        f"<p>Hi {user.first_name or user.email},</p>"
        f"<p>Please verify your email address by clicking the link below:</p>"
        f'<p><a href="{verify_url}" style="color:#f97316;font-weight:bold;">Verify email address</a></p>'
        f"<p>This link expires in <strong>24 hours</strong>.</p>"
        f"<p>If you did not create a PitchMic account, you can safely ignore this email.</p>"
        f"<p>- The PitchMic Team</p>"
    )

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@pitchmic.local")

    send_mail(
        subject=subject,
        message=plain_body,
        html_message=html_body,
        from_email=from_email,
        recipient_list=[user.email],
        fail_silently=False,
    )

    logger.info("Verification email sent to user pk=%s (%s)", user.pk, user.email)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    ignore_result=True,
    name="users.send_password_reset_email",
)
def send_password_reset_email(self, user_id: int) -> None:  # noqa: ANN001
    """
    Generate a password reset token for *user_id* and send an email with
    a link to the frontend reset-password page.  The link expires in 1 hour.

    Retries up to 3 times with exponential backoff on any exception.
    """
    from apps.users.models import User  # local import avoids circular deps

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning("send_password_reset_email: user pk=%s not found, skipping", user_id)
        return

    token = make_password_reset_token(user.pk)

    frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000")
    reset_url = f"{frontend_base}/reset-password?token={token}"

    subject = "Reset your PitchMic password"
    plain_body = (
        f"Hi {user.first_name or user.email},\n\n"
        f"We received a request to reset the password for your PitchMic account.\n\n"
        f"Click the link below to choose a new password:\n\n"
        f"{reset_url}\n\n"
        f"This link expires in 1 hour.\n\n"
        f"If you did not request a password reset you can safely ignore this email - "
        f"your password has not been changed.\n\n"
        f"- The PitchMic Team"
    )
    html_body = (
        f"<p>Hi {user.first_name or user.email},</p>"
        f"<p>We received a request to reset the password for your PitchMic account.</p>"
        f'<p><a href="{reset_url}" style="color:#f97316;font-weight:bold;">Reset your password</a></p>'
        f"<p>This link expires in <strong>1 hour</strong>.</p>"
        f"<p>If you did not request a password reset you can safely ignore this email - "
        f"your password has not been changed.</p>"
        f"<p>- The PitchMic Team</p>"
    )

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@pitchmic.local")

    send_mail(
        subject=subject,
        message=plain_body,
        html_message=html_body,
        from_email=from_email,
        recipient_list=[user.email],
        fail_silently=False,
    )

    logger.info("Password reset email sent to user pk=%s (%s)", user.pk, user.email)
