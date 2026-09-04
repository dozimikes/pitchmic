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
from rest_framework.permissions import AllowAny
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
    StartupProfileViewSet,
    VerifyEmailView,
)
from apps.newsfeed.views import ActivityFeedView
from apps.notifications.views import NotificationViewSet
from apps.startups.api import router as startups_router
from apps.investors.api import router as investors_router
#  New ML/AI app routers 
from apps.matching.urls import urlpatterns as matching_urls
from apps.analytics.urls import urlpatterns as analytics_urls
from apps.intelligence.urls import urlpatterns as intelligence_urls
from apps.dataroom.urls import urlpatterns as dataroom_urls
from apps.marketing.urls import urlpatterns as marketing_urls
from apps.predictive_intelligence.urls import urlpatterns as predictive_urls
from apps.accelerator.urls import urlpatterns as accelerator_urls
from apps.investors.urls import urlpatterns as investors_urls
from apps.matching.opportunity_urls import urlpatterns as opportunity_urls

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


urlpatterns: list = [
    path("", RedirectView.as_view(url="/api/docs/swagger/", permanent=False)),
    path("admin/", admin.site.urls),
    path("api/v1/", include(router.urls)),
    # Dedicated delegation prefixes - thin delegation layer (see apps.startups.api / apps.investors.api)
    path("api/v1/startups/", include(startups_router.urls)),
    path("api/v1/investors/", include(investors_router.urls)),
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
    path("api/v1/upload/avatar/", AvatarUploadView.as_view(), name="upload-avatar"),
    path("api/v1/upload/logo/", LogoUploadView.as_view(), name="upload-logo"),
    path("api/v1/upload/pitch-cover/", PitchCoverUploadView.as_view(), name="upload-pitch-cover"),
    path("api/v1/me/", MeView.as_view(), name="me"),
    path("api/v1/me/startup-profile/", MeStartupProfileView.as_view(), name="me-startup-profile"),
    path("api/v1/me/investor-profile/", MeInvestorProfileView.as_view(), name="me-investor-profile"),
    path("api/v1/admin/summary/", AdminSummaryView.as_view(), name="admin-summary"),
    #  ML / AI intelligence endpoints 
    path("api/v1/matching/", include((matching_urls, "matching"))),
    path("api/v1/analytics/", include((analytics_urls, "analytics"))),
    path("api/v1/intelligence/", include((intelligence_urls, "intelligence"))),
    path("api/v1/predictive/", include((predictive_urls, "predictive_intelligence"))),
    path("api/v1/dataroom/", include((dataroom_urls, "dataroom"))),
    path("api/v1/marketing/", include((marketing_urls, "marketing"))),
    path("api/v1/accelerator/", include((accelerator_urls, "accelerator"))),
    path("api/v1/fundraising/opportunities/", include((opportunity_urls, "fundraising_opportunities"))),
    path("api/v1/ie/", include("apps.intelligence_engine.urls", namespace="intelligence_engine")),
    #  API docs 
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/docs/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
