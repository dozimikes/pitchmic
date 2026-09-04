"""
apps.accelerator.urls
=====================
URL routes for the Venture Admissions & Investment Operating System.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcceleratorApplicationViewSet,
    AcceleratorProgramViewSet,
    ApplicationQuestionViewSet,
    CommitteeDecisionViewSet,
    EvidenceRequestViewSet,
    FounderProfileView,
    InterviewSessionViewSet,
    QuestionResponseViewSet,
    ReviewerAssessmentViewSet,
    ReviewerDisagreementViewSet,
    SeedAcceleratorDefaultsView,
    StartupProfileViewSet,
)

router = DefaultRouter()
router.register(r"programs", AcceleratorProgramViewSet, basename="accelerator-program")
router.register(r"applications", AcceleratorApplicationViewSet, basename="accelerator-application")
router.register(r"questions", ApplicationQuestionViewSet, basename="accelerator-question")
router.register(r"responses", QuestionResponseViewSet, basename="accelerator-response")
router.register(r"startup-profiles", StartupProfileViewSet, basename="accelerator-startup-profile")
router.register(r"reviews", ReviewerAssessmentViewSet, basename="accelerator-review")
router.register(r"disagreements", ReviewerDisagreementViewSet, basename="accelerator-disagreement")
router.register(r"interviews", InterviewSessionViewSet, basename="accelerator-interview")
router.register(r"committee", CommitteeDecisionViewSet, basename="accelerator-committee")
router.register(r"evidence-requests", EvidenceRequestViewSet, basename="accelerator-evidence-request")

urlpatterns = [
    path("founder-profile/", FounderProfileView.as_view(), name="accelerator-founder-profile"),
    path("seed-defaults/", SeedAcceleratorDefaultsView.as_view(), name="accelerator-seed-defaults"),
    path("", include(router.urls)),
]
