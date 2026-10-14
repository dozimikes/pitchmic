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
    DiligenceItemViewSet,
    EvidenceRequestViewSet,
    FounderProfileView,
    InterviewSessionViewSet,
    QuestionResponseViewSet,
    ReviewAssignmentViewSet,
    ReviewerAssessmentViewSet,
    ReviewerDisagreementViewSet,
    SeedAcceleratorDefaultsView,
    StartupProfileViewSet,
    SwitchContextView,
    UserContextView,
    WorkInboxView,
    WorkflowAutomationViewSet,
)
from .views_config import (
    ApplicationCycleViewSet,
    CustomObjectViewSet,
    CustomRecordViewSet,
    DashboardReportViewSet,
    EventOutboxViewSet,
    FormDefinitionViewSet,
    FormResponseViewSet,
    NotificationTemplateViewSet,
    NotificationViewSet,
    ProgramEvaluationPolicyViewSet,
    ProgramRoleViewSet,
    ProgramStageViewSet,
    ProgramStaffMembershipViewSet,
    StageTransitionViewSet,
)
from .views_cohort import (
    AlumniProfileViewSet,
    BaselineMetricsViewSet,
    CohortEventViewSet,
    CohortWorkspaceViewSet,
    CurriculumWeekViewSet,
    DemoDaySlotViewSet,
    EventAttendanceViewSet,
    FounderTaskViewSet,
    InvestorIntroductionViewSet,
    InvestorReadinessReportViewSet,
    InterventionLogViewSet,
    MemberAssessmentResultViewSet,
    MentorAssignmentViewSet,
    MentorMatchRequestViewSet,
    MentorProfileViewSet,
    MentorSessionViewSet,
    MetricSnapshotViewSet,
    OnboardingChecklistViewSet,
    OfferLetterViewSet,
    OutcomeRecordViewSet,
    OutcomeSurveyViewSet,
    ProgramAssessmentViewSet,
    ProgramGraduationViewSet,
    ProgramMembershipViewSet,
    ProgramTrackViewSet,
    RiskSignalViewSet,
)
from .views_intake import (
    CycleIntakeKeyView,
    ExternalIntakeSubmissionViewSet,
    IngestSubmissionView,
    IntakeImportView,
)
from .views_intel import (
    ApplicationClaimViewSet,
    DashboardWidgetConfigViewSet,
    EvidenceGraphView,
    ProgramBlueprintViewSet,
    ProgramMemoryEntryViewSet,
    ProgramStudioSeedView,
)

router = DefaultRouter()
router.register(r"programs", AcceleratorProgramViewSet, basename="accelerator-program")
# Intake cycles inside a program. "application-cycles" rather than "cycles":
# /cohorts/ is the cohort workspace, a different object with a similar name.
router.register(r"application-cycles", ApplicationCycleViewSet, basename="accelerator-application-cycle")
# Submissions received from outside the dashboard, held until a person decides.
router.register(r"intake-submissions", ExternalIntakeSubmissionViewSet, basename="accelerator-intake-submission")
router.register(r"applications", AcceleratorApplicationViewSet, basename="accelerator-application")
router.register(r"questions", ApplicationQuestionViewSet, basename="accelerator-question")
router.register(r"responses", QuestionResponseViewSet, basename="accelerator-response")
router.register(r"startup-profiles", StartupProfileViewSet, basename="accelerator-startup-profile")
router.register(r"reviews", ReviewerAssessmentViewSet, basename="accelerator-review")
router.register(r"review-assignments", ReviewAssignmentViewSet, basename="accelerator-review-assignment")
router.register(r"disagreements", ReviewerDisagreementViewSet, basename="accelerator-disagreement")
router.register(r"diligence-items", DiligenceItemViewSet, basename="accelerator-diligence-item")
router.register(r"interviews", InterviewSessionViewSet, basename="accelerator-interview")
router.register(r"committee", CommitteeDecisionViewSet, basename="accelerator-committee")
router.register(r"evidence-requests", EvidenceRequestViewSet, basename="accelerator-evidence-request")

# A founder claim, read through the program it belongs to, and writable only by
# the verification action below. There is no PATCH here on purpose: the state a
# claim holds is a human's recorded decision, not a field to set.
router.register(r"claims", ApplicationClaimViewSet, basename="accelerator-claim")
router.register(r"automations", WorkflowAutomationViewSet, basename="accelerator-automation")
# Program OS configuration layer
router.register(r"stages", ProgramStageViewSet, basename="accelerator-stage")
router.register(r"transitions", StageTransitionViewSet, basename="accelerator-transition")
router.register(r"forms", FormDefinitionViewSet, basename="accelerator-form")
router.register(r"form-responses", FormResponseViewSet, basename="accelerator-form-response")
router.register(r"notification-templates", NotificationTemplateViewSet, basename="accelerator-notification-template")
router.register(r"program-notifications", NotificationViewSet, basename="accelerator-program-notification")
router.register(r"custom-objects", CustomObjectViewSet, basename="accelerator-custom-object")
router.register(r"custom-records", CustomRecordViewSet, basename="accelerator-custom-record")
router.register(r"program-roles", ProgramRoleViewSet, basename="accelerator-program-role")
# Who the program has seated on its own team. The reach rule reads this table,
# so it is the only honest way to give a second person access to a pipeline.
router.register(r"program-staff", ProgramStaffMembershipViewSet,
                basename="accelerator-program-staff")
# The versioned evaluation policy behind a program's scores. Read-only, and the
# only way a screen can say which weights a program actually decided by.
router.register(r"policies", ProgramEvaluationPolicyViewSet, basename="accelerator-policy")
router.register(r"reports", DashboardReportViewSet, basename="accelerator-report")
router.register(r"events", EventOutboxViewSet, basename="accelerator-event")
# Cohort / People / Delivery / Outcome operating systems
router.register(r"memberships", ProgramMembershipViewSet, basename="accelerator-membership")
router.register(r"tracks", ProgramTrackViewSet, basename="accelerator-track")
router.register(r"cohorts", CohortWorkspaceViewSet, basename="accelerator-cohort")
router.register(r"curriculum-weeks", CurriculumWeekViewSet, basename="accelerator-curriculum-week")
router.register(r"cohort-events", CohortEventViewSet, basename="accelerator-cohort-event")
router.register(r"event-attendance", EventAttendanceViewSet, basename="accelerator-event-attendance")
router.register(r"mentors", MentorProfileViewSet, basename="accelerator-mentor")
router.register(r"mentor-sessions", MentorSessionViewSet, basename="accelerator-mentor-session")
router.register(r"mentor-assignments", MentorAssignmentViewSet, basename="accelerator-mentor-assignment")
router.register(r"mentor-requests", MentorMatchRequestViewSet, basename="accelerator-mentor-request")
router.register(r"founder-tasks", FounderTaskViewSet, basename="accelerator-founder-task")
router.register(r"onboarding-checklists", OnboardingChecklistViewSet, basename="accelerator-onboarding")
router.register(r"baseline-metrics", BaselineMetricsViewSet, basename="accelerator-baseline")
router.register(r"metric-snapshots", MetricSnapshotViewSet, basename="accelerator-metric-snapshot")
router.register(r"assessments", ProgramAssessmentViewSet, basename="accelerator-assessment")
router.register(r"assessment-results", MemberAssessmentResultViewSet, basename="accelerator-assessment-result")
router.register(r"readiness-reports", InvestorReadinessReportViewSet, basename="accelerator-readiness-report")
router.register(r"demo-day-slots", DemoDaySlotViewSet, basename="accelerator-demo-day-slot")
router.register(r"investor-intros", InvestorIntroductionViewSet, basename="accelerator-investor-intro")
router.register(r"offer-letters", OfferLetterViewSet, basename="accelerator-offer-letter")
router.register(r"graduations", ProgramGraduationViewSet, basename="accelerator-graduation")
router.register(r"outcomes", OutcomeRecordViewSet, basename="accelerator-outcome")
router.register(r"outcome-surveys", OutcomeSurveyViewSet, basename="accelerator-outcome-survey")
router.register(r"alumni", AlumniProfileViewSet, basename="accelerator-alumni")
router.register(r"risk-signals", RiskSignalViewSet, basename="accelerator-risk-signal")
router.register(r"interventions", InterventionLogViewSet, basename="accelerator-intervention")
# Intelligence / Memory / Analytics / Program Studio operating systems
router.register(r"program-memory", ProgramMemoryEntryViewSet, basename="accelerator-program-memory")
router.register(r"dashboard-widgets", DashboardWidgetConfigViewSet, basename="accelerator-dashboard-widget")
router.register(r"blueprints", ProgramBlueprintViewSet, basename="accelerator-blueprint")

urlpatterns = [
    path("founder-profile/", FounderProfileView.as_view(), name="accelerator-founder-profile"),
    path("seed-defaults/", SeedAcceleratorDefaultsView.as_view(), name="accelerator-seed-defaults"),
    path("evidence-graph/", EvidenceGraphView.as_view(), name="accelerator-evidence-graph"),
    path("program-studio/seed/", ProgramStudioSeedView.as_view(), name="accelerator-program-studio-seed"),
    # User / organization context + the signed-in user's own work inbox
    path("context/", UserContextView.as_view(), name="accelerator-user-context"),
    path("context/switch/", SwitchContextView.as_view(), name="accelerator-switch-context"),
    path("work-inbox/", WorkInboxView.as_view(), name="accelerator-work-inbox"),
    # External intake. The import and key endpoints are staff-only; ingest is the
    # one route authenticated by a cycle's intake key instead of a session.
    path("intake/import/", IntakeImportView.as_view(), name="accelerator-intake-import"),
    path("intake/ingest/", IngestSubmissionView.as_view(), name="accelerator-intake-ingest"),
    path(
        "application-cycles/<int:pk>/intake-key/",
        CycleIntakeKeyView.as_view(),
        name="accelerator-cycle-intake-key",
    ),
    path("", include(router.urls)),
]
