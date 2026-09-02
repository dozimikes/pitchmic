from django.urls import path

from .views import (
    AntlerHubWebhookView,
    CohortBatchUploadView,
    CohortLeaderboardView,
    DigitalBrainIngestView,
    DigitalBrainQueryView,
    DueDiligenceCreateView,
    DueDiligenceDebateView,
    DueDiligenceDetailView,
    DueDiligenceExportView,
    DueDiligenceVoteView,
    EnterpriseTenantListView,
    EnterpriseTriageWebhookView,
    EvidenceLedgerView,
    KnowledgeGraphQueryView,
    ModelPerformanceListView,
    PitchDeckForensicsView,
    PitchDeckUploadView,
    PredictionFeedbackCreateView,
    StartupIntelligenceView,
    StealthSignalDiscoveryTriggerView,
    StealthSignalsListView,
    TenantAPIKeyProvisionView,
    VentureOutcomePredictView,
    VoiceInterviewDebriefView,
    VoiceInterviewStartView,
    VoiceInterviewTurnView,
)

app_name = "intelligence"

urlpatterns = [
    path("startup/<int:pk>/", StartupIntelligenceView.as_view(), name="startup-intelligence"),
    path("due-diligence/", DueDiligenceCreateView.as_view(), name="dd-create"),
    path("due-diligence/<int:pk>/", DueDiligenceDetailView.as_view(), name="dd-detail"),
    path("due-diligence/<int:pk>/debate/", DueDiligenceDebateView.as_view(), name="dd-debate"),
    path("due-diligence/<int:pk>/export/", DueDiligenceExportView.as_view(), name="dd-export"),
    path("due-diligence/<int:pk>/vote/", DueDiligenceVoteView.as_view(), name="dd-vote"),
    path("feedback/", PredictionFeedbackCreateView.as_view(), name="feedback"),
    path("models/", ModelPerformanceListView.as_view(), name="model-performance"),
    # Enterprise Forensics & Provenance Endpoints
    path("forensics/deck/", PitchDeckForensicsView.as_view(), name="forensics-deck"),
    path("forensics/deck/upload/", PitchDeckUploadView.as_view(), name="forensics-deck-upload"),
    path("external/triage/", EnterpriseTriageWebhookView.as_view(), name="external-triage"),
    path("brain/query/", DigitalBrainQueryView.as_view(), name="brain-query"),
    path("brain/ingest/", DigitalBrainIngestView.as_view(), name="brain-ingest"),
    path("stealth/signals/", StealthSignalsListView.as_view(), name="stealth-signals"),
    path("stealth/discover/", StealthSignalDiscoveryTriggerView.as_view(), name="stealth-discover"),
    # Probabilistic ML & Venture Outcome Endpoints
    path("predict/outcomes/", VentureOutcomePredictView.as_view(), name="predict-outcomes"),
    path("evidence/audit/", EvidenceLedgerView.as_view(), name="evidence-audit"),
    path("graph/query/", KnowledgeGraphQueryView.as_view(), name="graph-query"),
    # Enterprise Tenants & Licensing
    path("tenants/", EnterpriseTenantListView.as_view(), name="enterprise-tenants"),
    path("tenants/<int:tenant_id>/keys/", TenantAPIKeyProvisionView.as_view(), name="tenant-keys-provision"),
    # Voice Screening Interviews
    path("voice/start/", VoiceInterviewStartView.as_view(), name="voice-start"),
    path("voice/<int:session_id>/turn/", VoiceInterviewTurnView.as_view(), name="voice-turn"),
    path("voice/<int:session_id>/debrief/", VoiceInterviewDebriefView.as_view(), name="voice-debrief"),
    # Accelerator & Cohort Batch Pipeline
    path("cohorts/", CohortBatchUploadView.as_view(), name="cohorts-list"),
    path("cohorts/batch-upload/", CohortBatchUploadView.as_view(), name="cohorts-batch-upload"),
    path("cohorts/<int:cohort_id>/leaderboard/", CohortLeaderboardView.as_view(), name="cohorts-leaderboard"),
    path("antler/webhook/", AntlerHubWebhookView.as_view(), name="antler-webhook"),
]

