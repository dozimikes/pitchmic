from django.urls import path

from .views import (
    ActivateCampaignView,
    CampaignAnalyticsView,
    CampaignDetailView,
    CampaignListCreateView,
    CampaignMessagesView,
    GenerateInvestorListView,
    PauseCampaignView,
)

app_name = "marketing"

urlpatterns = [
    path("campaigns/", CampaignListCreateView.as_view(), name="campaign-list"),
    path("campaigns/<int:pk>/", CampaignDetailView.as_view(), name="campaign-detail"),
    path("campaigns/<int:pk>/activate/", ActivateCampaignView.as_view(), name="campaign-activate"),
    path("campaigns/<int:pk>/pause/", PauseCampaignView.as_view(), name="campaign-pause"),
    path("campaigns/<int:pk>/analytics/", CampaignAnalyticsView.as_view(), name="campaign-analytics"),
    path("campaigns/<int:pk>/messages/", CampaignMessagesView.as_view(), name="campaign-messages"),
    path("generate-list/", GenerateInvestorListView.as_view(), name="generate-investor-list"),
]
