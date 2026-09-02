from django.urls import path

from . import views

app_name = "predictive_intelligence"

urlpatterns = [
    # ---- Feature Store
    path(
        "features/capabilities/",
        views.FeatureCapabilitiesView.as_view(),
        name="feature-capabilities",
    ),
    path(
        "features/<int:startup_id>/list/",
        views.FeatureSnapshotListView.as_view(),
        name="feature-snapshot-list",
    ),
    path(
        "features/<int:startup_id>/capture/",
        views.FeatureSnapshotCaptureView.as_view(),
        name="feature-snapshot-capture",
    ),
    path(
        "features/snapshot/<int:pk>/",
        views.FeatureSnapshotDetailView.as_view(),
        name="feature-snapshot-detail",
    ),
    # ---- Venture Outcome Prediction
    path(
        "outcomes/startup/<int:pk>/latest/",
        views.LatestVentureOutcomeView.as_view(),
        name="venture-outcome-latest",
    ),
    path(
        "outcomes/startup/<int:pk>/generate/",
        views.VentureOutcomeGenerateView.as_view(),
        name="venture-outcome-generate",
    ),
    path(
        "outcomes/<int:pk>/",
        views.VentureOutcomeDetailView.as_view(),
        name="venture-outcome-detail",
    ),
    path(
        "outcomes/<int:pk>/feedback/",
        views.PredictionFeedbackV2CreateView.as_view(),
        name="venture-outcome-feedback",
    ),
    # ---- Historical Time Machine / Backtesting
    path(
        "time-machine/<int:startup_id>/list/",
        views.HistoricalSnapshotListView.as_view(),
        name="historical-snapshot-list",
    ),
    path(
        "time-machine/<int:startup_id>/build/",
        views.HistoricalSnapshotBuildView.as_view(),
        name="historical-snapshot-build",
    ),
    path(
        "time-machine/evaluate/",
        views.HistoricalEvaluateView.as_view(),
        name="historical-evaluate",
    ),
    # ---- Investor Intent Prediction
    path(
        "intent/startup/<int:startup_id>/",
        views.StartupTopInvestorIntentsView.as_view(),
        name="startup-top-investor-intents",
    ),
    path(
        "intent/investor/<int:investor_id>/score/",
        views.ScoreInvestorIntentView.as_view(),
        name="score-investor-intent",
    ),
    # ---- Knowledge Graph
    path(
        "graph/entities/",
        views.GraphEntityListView.as_view(),
        name="graph-entity-list",
    ),
    path(
        "graph/entity/",
        views.GraphEntityCreateView.as_view(),
        name="graph-entity-create",
    ),
    path(
        "graph/relation/",
        views.GraphRelationCreateView.as_view(),
        name="graph-relation-create",
    ),
    path(
        "graph/traverse/",
        views.GraphTraverseView.as_view(),
        name="graph-traverse",
    ),
    # ---- Anomaly Detection
    path(
        "anomalies/",
        views.AnomalyListView.as_view(),
        name="anomaly-list",
    ),
    path(
        "anomalies/audit/",
        views.AnomalyAuditView.as_view(),
        name="anomaly-audit",
    ),
    path(
        "anomalies/<int:pk>/resolve/",
        views.AnomalyResolveView.as_view(),
        name="anomaly-resolve",
    ),
    # ---- Model Registry / Experiments (staff)
    path(
        "registry/",
        views.ModelRegistryListView.as_view(),
        name="model-registry-list",
    ),
    path(
        "registry/<int:pk>/versions/",
        views.ModelVersionListView.as_view(),
        name="model-version-list",
    ),
    path(
        "evaluations/",
        views.EvaluationRunListView.as_view(),
        name="evaluation-run-list",
    ),
    path(
        "experiments/",
        views.ExperimentListView.as_view(),
        name="experiment-list",
    ),
    path(
        "calibration/<int:model_version_id>/",
        views.CalibrationListView.as_view(),
        name="calibration-list",
    ),
]
