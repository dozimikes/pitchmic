from __future__ import annotations

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import InvestorProfile, StartupProfile, TeamMember, User


class TeamMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model: type[TeamMember] = TeamMember
        fields: tuple[str, ...] = (
            "id",
            "name",
            "role",
            "bio",
            "linkedin",
            "avatar_url",
            "order",
        )
        read_only_fields: tuple[str, ...] = ("id",)


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model: type[User] = User
        fields: tuple[str, ...] = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "avatar_url",
            "subscription_plan",
            "subscription_status",
            "subscription_started_at",
            "subscription_expires_at",
            "paystack_customer_code",
            "paystack_email",
            "is_verified",
            "is_active",
            "is_staff",
            "is_superuser",
            "created_at",
            "updated_at",
        )
        read_only_fields: tuple[str, ...] = (
            "id",
            "subscription_plan",
            "subscription_status",
            "subscription_started_at",
            "subscription_expires_at",
            "paystack_customer_code",
            "paystack_email",
            "is_verified",
            "is_active",
            "is_staff",
            "is_superuser",
            "created_at",
            "updated_at",
        )


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    Handles both startup and investor registration.

    Accepts BOTH snake_case and camelCase field names to eliminate
    Next.js/TypeScript (camelCase) ↔ DRF (snake_case) boundary bugs.
    Normalized internally to snake_case before validation.

    Startup extra fields (all optional at the API level - profile update
    can fill them in later):
      startup_name/startupName, founder_name/founderName,
      co_founders/coFounders (list of names),
      address, phone, niche, pitch_video_url/pitchVideoUrl, target_market/targetMarket

    Investor extra fields:
      investor_name/investorName, address, phone, company, niche
    """

    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
    )
    password_confirm = serializers.CharField(write_only=True, required=False)

    # Startup-specific (optional)
    startup_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    founder_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    # co_founders: list of name strings from the sign-up form
    co_founders = serializers.ListField(
        child=serializers.CharField(max_length=255, allow_blank=True),
        required=False,
        write_only=True,
        default=list,
    )
    niche = serializers.CharField(required=False, allow_blank=True, write_only=True)
    address = serializers.CharField(required=False, allow_blank=True, write_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, write_only=True)
    pitch_video_url = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        validators=[],
    )
    target_market = serializers.CharField(required=False, allow_blank=True, write_only=True)

    # Investor-specific (optional)
    investor_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    company = serializers.CharField(required=False, allow_blank=True, write_only=True)

    # Accelerator-specific (optional)
    organization_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    program_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    cohort_size = serializers.CharField(required=False, allow_blank=True, write_only=True)

    tokens = serializers.SerializerMethodField()
    user = serializers.SerializerMethodField()

    class Meta:
        model: type[User] = User
        fields: tuple[str, ...] = (
            "email",
            "password",
            "password_confirm",
            "first_name",
            "last_name",
            "role",
            # startup extras
            "startup_name",
            "founder_name",
            "co_founders",
            "niche",
            "address",
            "phone",
            "pitch_video_url",
            "target_market",
            # investor extras
            "investor_name",
            "company",
            # accelerator extras
            "organization_name",
            "program_name",
            "cohort_size",
            # read-only response
            "tokens",
            "user",
        )
        extra_kwargs: dict = {
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
            "role": {"required": False},
        }

    # camelCase → snake_case aliases. Any key present here in the incoming
    # data dict is copied into its snake_case equivalent BEFORE DRF validation
    # runs, so both conventions work transparently.
    _CAMEL_TO_SNAKE: dict[str, str] = {
        "passwordConfirm": "password_confirm",
        "firstName": "first_name",
        "lastName": "last_name",
        "startupName": "startup_name",
        "founderName": "founder_name",
        "coFounders": "co_founders",
        "pitchVideoUrl": "pitch_video_url",
        "targetMarket": "target_market",
        "investorName": "investor_name",
        "organizationName": "organization_name",
        "programName": "program_name",
        "cohortSize": "cohort_size",
        "programFocus": "niche",
    }

    def to_internal_value(self, data):
        """Normalize camelCase → snake_case before DRF's standard validation."""
        if isinstance(data, dict):
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in data and snake not in data:
                    data = {**data, snake: data[camel]}
        return super().to_internal_value(data)

    def validate_pitch_video_url(self, value: str) -> str:
        """Skip URL validation for empty strings; otherwise enforce URL format."""
        from django.core.validators import URLValidator
        from django.core.exceptions import ValidationError as DjangoValidationError

        if not value:
            return ""
        validator = URLValidator()
        try:
            validator(value)
        except DjangoValidationError:
            raise serializers.ValidationError("Enter a valid URL.")
        return value

    def get_tokens(self, obj: User) -> dict:
        refresh: RefreshToken = RefreshToken.for_user(obj)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

    def get_user(self, obj: User) -> dict:
        return UserSerializer(obj).data

    def validate(self, attrs: dict) -> dict:
        password_confirm: str | None = attrs.pop("password_confirm", None)
        # Password confirmation is OPTIONAL at the API level - the frontend
        # may omit it entirely (modern single-field UX + password managers).
        # Only enforce the match when the client explicitly sends it.
        if password_confirm and attrs.get("password") != password_confirm:
            raise serializers.ValidationError(
                {"password_confirm": "Password fields don't match."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict) -> User:
        # Pop all extra write-only fields before User.create
        startup_name: str = validated_data.pop("startup_name", "") or ""
        founder_name: str = validated_data.pop("founder_name", "") or ""
        co_founders: list[str] = validated_data.pop("co_founders", []) or []
        niche: str = validated_data.pop("niche", "") or ""
        address: str = validated_data.pop("address", "") or ""
        phone: str = validated_data.pop("phone", "") or ""
        pitch_video_url: str = validated_data.pop("pitch_video_url", "") or ""
        target_market: str = validated_data.pop("target_market", "") or ""
        investor_name: str = validated_data.pop("investor_name", "") or ""
        company: str = validated_data.pop("company", "") or ""
        organization_name: str = validated_data.pop("organization_name", "") or ""
        program_name: str = validated_data.pop("program_name", "") or ""
        cohort_size: str = validated_data.pop("cohort_size", "") or ""

        password: str = validated_data.pop("password")
        user: User = User(**validated_data)
        user.set_password(password)
        user.save()

        if user.role == User.ROLE_STARTUP:
            company_name: str = startup_name or validated_data.get("first_name") or user.email.split("@")[0]
            profile = StartupProfile.objects.create(
                user=user,
                company_name=company_name,
                niche=niche,
                address=address,
                phone=phone,
                pitch_video_url=pitch_video_url,
                target_market=target_market,
            )
            # Create founder as TeamMember order=0
            if founder_name:
                TeamMember.objects.create(
                    startup_profile=profile,
                    name=founder_name,
                    role="Founder",
                    order=0,
                )
            # Create co-founders as TeamMember order=1,2,3,4
            for i, name in enumerate(co_founders, start=1):
                if isinstance(name, str) and name.strip():
                    TeamMember.objects.create(
                        startup_profile=profile,
                        name=name.strip(),
                        role="Co-Founder",
                        order=i,
                    )

        elif user.role == User.ROLE_INVESTOR:
            full_name: str = (
                investor_name
                or f"{validated_data.get('first_name', '')} {validated_data.get('last_name', '')}".strip()
                or user.email.split("@")[0]
            )
            InvestorProfile.objects.create(
                user=user,
                full_name=full_name,
                company_name=company,
                niche=niche,
                address=address,
                phone=phone,
            )

        elif user.role == User.ROLE_ACCELERATOR:
            org = organization_name or f"{user.first_name} {user.last_name}".strip() or "Accelerator Hub"
            prog = program_name or f"{org} Cohort"
            import re
            slug_base = re.sub(r"[^a-zA-Z0-9]+", "-", f"{org}-{prog}").strip("-").lower()[:90] or "accelerator-cohort"
            from apps.accelerator.models import AcceleratorProgram
            if not AcceleratorProgram.objects.filter(slug=slug_base).exists():
                try:
                    c_size = int(cohort_size) if cohort_size.isdigit() else 20
                except (ValueError, TypeError):
                    c_size = 20
                AcceleratorProgram.objects.create(
                    name=prog,
                    organization_name=org,
                    slug=slug_base,
                    sector_focus=niche or "Multi-sector & Tech",
                    target_cohort_size=c_size,
                )

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        # Mirror the frontend SignInSchema floor so short passwords are
        # rejected at the serializer layer before hitting authenticate().
        min_length=8,
        max_length=128,
        error_messages={
            'min_length': 'Password must be at least 8 characters.',
            'max_length': 'Password must be at most 128 characters.',
        },
    )
    remember_me = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs: dict) -> dict:
        email: str = attrs.get("email", "")
        password: str = attrs.get("password", "")

        user: User | None = authenticate(
            request=self.context.get("request"),
            email=email,
            password=password,
        )
        if not user:
            raise serializers.ValidationError(
                {"non_field_errors": ["Invalid email or password."]}
            )
        if not user.is_active:
            raise serializers.ValidationError(
                {"non_field_errors": ["User account is disabled."]}
            )

        refresh: RefreshToken = RefreshToken.for_user(user)
        attrs["user"] = UserSerializer(user).data
        attrs["tokens"] = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }
        return attrs


class StartupProfileSerializer(serializers.ModelSerializer):
    team_members = TeamMemberSerializer(many=True, required=False)

    class Meta:
        model: type[StartupProfile] = StartupProfile
        fields: tuple[str, ...] = (
            "id",
            "user",
            "company_name",
            "tagline",
            "description",
            "address",
            "phone",
            "niche",
            "website",
            "linkedin",
            "twitter",
            "facebook",
            "logo_url",
            "industry",
            "founded_year",
            "location",
            "employee_count",
            "pitch_video_url",
            "target_market",
            "team_members",
            "created_at",
            "updated_at",
        )
        read_only_fields: tuple[str, ...] = ("id", "user", "created_at", "updated_at")

    @transaction.atomic
    def update(self, instance: StartupProfile, validated_data: dict) -> StartupProfile:
        team_members_data = validated_data.pop("team_members", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if team_members_data is not None:
            instance.team_members.all().delete()
            for i, member_data in enumerate(team_members_data):
                TeamMember.objects.create(
                    startup_profile=instance,
                    order=member_data.get("order", i),
                    **{k: v for k, v in member_data.items() if k != "order"},
                )
        return instance


class InvestorProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model: type[InvestorProfile] = InvestorProfile
        fields: tuple[str, ...] = (
            "id",
            "user",
            "full_name",
            "company_name",
            "title",
            "bio",
            "address",
            "phone",
            "niche",
            "website",
            "linkedin",
            "twitter",
            "avatar_url",
            "location",
            "investment_range_min",
            "investment_range_max",
            "preferred_industries",
            "created_at",
            "updated_at",
        )
        read_only_fields: tuple[str, ...] = ("id", "user", "created_at", "updated_at")


class VerifyEmailRequestSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)


class ResendVerificationRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)


class FileUploadSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        min_length=8,
        max_length=128,
        validators=[validate_password],
    )
    password_confirm = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs: dict) -> dict:
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        return attrs
