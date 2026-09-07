"""
apps.application_intelligence.urls
====================================
URL routes for the Application Intelligence Engine.
All paths are mounted under /api/v1/application-intelligence/ in config/urls.py.
"""
from django.urls import path

from .views import (
    ApplicationStrategyView,
    CorrelationNoteListView,
    ProgramProfileDetailView,
    ProgramProfileListView,
    StageExpectationsView,
)

app_name = "application_intelligence"

urlpatterns = [
    path("programs/", ProgramProfileListView.as_view(), name="program-list"),
    path("programs/<int:pk>/", ProgramProfileDetailView.as_view(), name="program-detail"),
    path("correlations/", CorrelationNoteListView.as_view(), name="correlations"),
    path("stage-expectations/", StageExpectationsView.as_view(), name="stage-expectations"),
    path("strategy/<int:program_id>/", ApplicationStrategyView.as_view(), name="strategy"),
]
