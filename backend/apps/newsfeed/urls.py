from __future__ import annotations

from django.urls import path

from .views import ActivityFeedView

app_name: str = "newsfeed"

urlpatterns: list = [
    path("", ActivityFeedView.as_view(), name="activity-feed"),
]
