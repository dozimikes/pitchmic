from django.urls import path

from .views import (
    IntentSignalCreateView,
    InvestorRecommendationsView,
    RefreshMatchScoresView,
    StartupRecommendationsView,
    TopMatchesView,
)

app_name = "matching"

urlpatterns = [
    path("top-matches/", TopMatchesView.as_view(), name="top-matches"),
    path("signals/", IntentSignalCreateView.as_view(), name="intent-signals"),
    path("recommendations/startup/<int:pk>/", StartupRecommendationsView.as_view(), name="startup-recommendations"),
    path("recommendations/investor/<int:pk>/", InvestorRecommendationsView.as_view(), name="investor-recommendations"),
    path("refresh/<int:pk>/", RefreshMatchScoresView.as_view(), name="refresh-startup"),
]
