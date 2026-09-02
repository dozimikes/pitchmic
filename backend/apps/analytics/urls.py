from django.urls import path

from .views import (
    BehaviorEventCreateView,
    HeatmapView,
    InvestorBehaviorView,
    StartupPredictionView,
    StartupReadinessView,
)

app_name = "analytics"

urlpatterns = [
    path("predict/startup/<int:pk>/", StartupPredictionView.as_view(), name="startup-prediction"),
    path("insights/startup/<int:pk>/", StartupReadinessView.as_view(), name="startup-readiness"),
    path("investor-profile/<int:pk>/", InvestorBehaviorView.as_view(), name="investor-behavior"),
    path("heatmap/", HeatmapView.as_view(), name="heatmap"),
    path("events/", BehaviorEventCreateView.as_view(), name="behavior-events"),
]
