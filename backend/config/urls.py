from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.generic import RedirectView
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import routers, serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.offers.views import OfferViewSet
from apps.pitches.views import PitchViewSet
from apps.users.views import (
    AdminSummaryView,
    AvatarUploadView,
    ForgotPasswordView,
    InvestorProfileViewSet,
    LogoUploadView,
    LoginView,
    LogoutView,
    MeView,
    MeStartupProfileView,
    MeInvestorProfileView,
    PitchCoverUploadView,
    RegisterView,
    ResendVerificationView,
    ResetPasswordView,
    StartupProfileViewSet,
    VerifyEmailView,
)
from apps.newsfeed.views import ActivityFeedView
from apps.notifications.views import NotificationViewSet
from apps.startups.api import router as startups_router
from apps.investors.api import router as investors_router
from apps.matching.urls import urlpatterns as matching_urls
from apps.analytics.urls import urlpatterns as analytics_urls
from apps.intelligence.urls import urlpatterns as intelligence_urls
from apps.dataroom.urls import urlpatterns as dataroom_urls
from apps.marketing.urls import urlpatterns as marketing_urls
from apps.predictive_intelligence.urls import urlpatterns as predictive_urls
from apps.accelerator.urls import urlpatterns as accelerator_urls
from apps.matching.opportunity_urls import urlpatterns as opportunity_urls
from apps.fundability.urls import urlpatterns as fundability_urls
from apps.application_intelligence.urls import urlpatterns as application_intelligence_urls

router = routers.DefaultRouter()
router.register(r"pitches", PitchViewSet, basename="pitch")
router.register(r"offers", OfferViewSet, basename="offer")
router.register(r"profiles/startup", StartupProfileViewSet, basename="startup-profile")
router.register(r"profiles/investor", InvestorProfileViewSet, basename="investor-profile")
router.register(r"notifications", NotificationViewSet, basename="notification")


class HealthCheckResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    service = serializers.CharField()
    version = serializers.CharField()


@extend_schema(
    responses=OpenApiResponse(
        response=HealthCheckResponseSerializer,
        description="Health check endpoint",
        examples=[
            OpenApiExample(
                "Successful response",
                value={"status": "healthy", "service": "PitchMic API", "version": "1.0.0"},
            ),
        ],
    ),
)
@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request) -> JsonResponse:
    return JsonResponse({
        "status": "healthy",
        "service": "PitchMic API",
        "version": "1.0.0",
    })


# SEC-019: Swagger UI and ReDoc are restricted to staff/admin users only.
# In production, API documentation must not be publicly accessible —
# it exposes every endpoint path, request schema, and authentication method.
_staff_swagger = SpectacularSwaggerView.as_view(
    url_name="schema", permission_classes=[IsAdminUser]
)
_staff_redoc = SpectacularRedocView.as_view(
    url_name="schema", permission_classes=[IsAdminUser]
)
_staff_schema = SpectacularAPIView.as_view(permission_classes=[IsAdminUser])


admin.site.site_header = "Pitchmic Admin"
admin.site.site_title = "Pitchmic Admin"
admin.site.index_title = "Pitchmic Admin"


def admin_decoy_view(request):
    """SEC-020: Conceal real admin URL; return 404 to deceive vulnerability scanners."""
    from django.http import Http404
    raise Http404("Page not found")


urlpatterns: list = [
    # SEC-019: redirect root to health check
    path("", RedirectView.as_view(url="/api/v1/health/", permanent=False)),
    # SEC-020: Standard /admin/ is a decoy returning 404 to protect against scanners
    path("admin/", admin_decoy_view, name="admin-decoy"),
    # SEC-020: Real admin portal is mounted at high-entropy secret URL
    path(settings.DJANGO_ADMIN_URL, admin.site.urls),
    path("api/v1/", include(router.urls)),
    path("api/v1/startups/", include(startups_router.urls)),
    path("api/v1/investors/", include(investors_router.urls)),
    path("api/v1/billing/", include("apps.billing.urls")),
    path("api/v1/health/", health_check, name="health-check"),
    path("api/v1/feed/", ActivityFeedView.as_view(), name="activity-feed"),
    path("api/auth/register/", RegisterView.as_view(), name="auth-register"),
    path("api/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("api/auth/token/verify/", TokenVerifyView.as_view(), name="token-verify"),
    path("api/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/v1/auth/logout/", LogoutView.as_view(), name="auth-logout-v1"),
    path("api/auth/verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path("api/v1/auth/verify-email/", VerifyEmailView.as_view(), name="verify-email-v1"),
    path("api/auth/resend-verification/", ResendVerificationView.as_view(), name="resend-verification"),
    path("api/auth/forgot-password/", ForgotPasswordView.as_view(), name="forgot-password"),
    path("api/auth/reset-password/", ResetPasswordView.as_view(), name="reset-password"),
    path("api/v1/upload/avatar/", AvatarUploadView.as_view(), name="upload-avatar"),
    path("api/v1/upload/logo/", LogoUploadView.as_view(), name="upload-logo"),
    path("api/v1/upload/pitch-cover/", PitchCoverUploadView.as_view(), name="upload-pitch-cover"),
    path("api/v1/me/", MeView.as_view(), name="me"),
    path("api/v1/me/startup-profile/", MeStartupProfileView.as_view(), name="me-startup-profile"),
    path("api/v1/me/investor-profile/", MeInvestorProfileView.as_view(), name="me-investor-profile"),
    path("api/v1/admin/summary/", AdminSummaryView.as_view(), name="admin-summary"),
    path("api/v1/matching/", include((matching_urls, "matching"))),
    path("api/v1/analytics/", include((analytics_urls, "analytics"))),
    path("api/v1/intelligence/", include((intelligence_urls, "intelligence"))),
    path("api/v1/predictive/", include((predictive_urls, "predictive_intelligence"))),
    path("api/v1/dataroom/", include((dataroom_urls, "dataroom"))),
    path("api/v1/marketing/", include((marketing_urls, "marketing"))),
    path("api/v1/accelerator/", include((accelerator_urls, "accelerator"))),
    path("api/v1/fundraising/opportunities/", include((opportunity_urls, "fundraising_opportunities"))),
    path("api/v1/fundability/", include((fundability_urls, "fundability"))),
    path("api/v1/application-intelligence/", include((application_intelligence_urls, "application_intelligence"))),
    path("api/v1/ie/", include("apps.intelligence_engine.urls", namespace="intelligence_engine")),
    # SEC-019: schema and docs restricted to staff only
    path("api/schema/", _staff_schema, name="schema"),
    path("api/docs/swagger/", _staff_swagger, name="swagger-ui"),
    path("api/docs/redoc/", _staff_redoc, name="redoc"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
