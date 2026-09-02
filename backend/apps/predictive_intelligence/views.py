"""
apps.predictive_intelligence.views
===================================

REST endpoints for the Predictive Venture Intelligence Engine.

  Feature Store:
    GET  /api/v1/predictive/features/{startup_id}/list/       — List feature snapshots
    POST /api/v1/predictive/features/{startup_id}/capture/    — Capture a feature snapshot
    GET  /api/v1/predictive/features/snapshot/{pk}/           — Single snapshot detail
    GET  /api/v1/predictive/features/capabilities/            — Feature capability matrix (ML vs AI-augmented)

  Venture Outcome Prediction (multi-task multi-horizon):
    GET  /api/v1/predictive/outcomes/startup/{pk}/latest/     — Latest VentureOutcomePrediction
    POST /api/v1/predictive/outcomes/startup/{pk}/generate/   — Run predictor and persist
    GET  /api/v1/predictive/outcomes/{pk}/                    — Prediction detail (incl. survival & Bayesian)
    POST /api/v1/predictive/outcomes/{pk}/feedback/           — Submit V2 feedback

  Historical Time Machine / Backtesting:
    GET  /api/v1/predictive/time-machine/{startup_id}/list/   — Historical snapshots
    POST /api/v1/predictive/time-machine/{startup_id}/build/  — Build historical snapshot
    POST /api/v1/predictive/time-machine/evaluate/            — Backtest evaluation endpoint

  Investor Intent:
    GET  /api/v1/predictive/intent/startup/{startup_id}/      — Top investors by P(invest)
    POST /api/v1/predictive/intent/investor/{investor_id}/score/ — Sequence scoring

  Knowledge Graph:
    GET  /api/v1/predictive/graph/entities/                   — Graph entities list
    POST /api/v1/predictive/graph/entity/                     — Create entity
    POST /api/v1/predictive/graph/relation/                   — Create relation
    POST /api/v1/predictive/graph/traverse/                   — Graph traversal queries

  Anomaly Detection:
    GET  /api/v1/predictive/anomalies/                        — List unresolved anomalies
    POST /api/v1/predictive/anomalies/audit/                  — Audit metrics list → anomaly records
    POST /api/v1/predictive/anomalies/{pk}/resolve/           — Analyst resolution

  Model Registry & Calibration:
    GET  /api/v1/predictive/registry/                         — List model families
    POST /api/v1/predictive/registry/                         — Create registry entry
    GET  /api/v1/predictive/registry/{pk}/versions/           — Model versions
    GET  /api/v1/predictive/evaluations/                      — Backtest evaluation runs
    GET  /api/v1/predictive/experiments/                      — A-B experiments
    GET  /api/v1/predictive/calibration/{model_version_id}/   — Calibration records
"""
from __future__ import annotations

from datetime import datetime, timezone

from apps.users.models import InvestorProfile, StartupProfile, User
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class IsStaff(BasePermission):
    """Allows access only to staff users."""

    def has_permission(self, request, view):
        if getattr(view, "swagger_fake_view", False):
            return True
        return bool(request.user and getattr(request.user, "is_staff", False))


class IsStaffOrVisibleStartup(BasePermission):
    """
    Allows staff always.
    For non-staff, the calling view must call ``ensure_visible(request, startup)``
    on the specific StartupProfile to verify founder-ownership or investor-match.
    """

    def has_permission(self, request, view):
        if getattr(view, "swagger_fake_view", False):
            return True
        return bool(request.user and request.user.is_authenticated)

    @staticmethod
    def ensure_visible(request, startup):
        """Raise PermissionDenied unless user is staff or associated with the startup."""
        if getattr(request.user, "is_staff", False):
            return
        user = request.user
        if getattr(user, "role", None) == User.ROLE_STARTUP:
            profile = getattr(user, "startup_profile", None)
            if profile is not None and profile.pk == startup.pk:
                return
        if getattr(user, "role", None) == User.ROLE_INVESTOR:
            profile = getattr(user, "investor_profile", None)
            if profile is not None:
                if (
                    InvestorProfile.objects.filter(
                        pk=profile.pk,
                        matched_startups=startup,
                    ).exists()
                ):
                    return
        raise PermissionDenied(
            "You do not have permission to operate on this startup's data."
        )


from .models import (
    AnomalyDetectionRecord,
    BayesianUpdateLog,
    CalibrationRecord,
    EvaluationRun,
    Experiment,
    GraphEntity,
    GraphRelation,
    InvestorBehavioralSequence,
    InvestorIntentPrediction,
    ModelRegistry,
    ModelVersion,
    PredictionFeedbackV2,
    PredictionRun,
    StartupFeatureSnapshot,
    StartupHistoricalSnapshot,
    TrainingRun,
    UncertaintyDecomposition,
    VentureOutcomePrediction,
    VentureSurvivalForecast,
)
from .serializers import (
    AnomalyDetectionRecordSerializer,
    BayesianUpdateLogSerializer,
    CalibrationRecordSerializer,
    EvaluationRunSerializer,
    ExperimentSerializer,
    GraphEntitySerializer,
    GraphRelationSerializer,
    InvestorBehavioralSequenceSerializer,
    InvestorIntentPredictionSerializer,
    ModelRegistrySerializer,
    ModelVersionSerializer,
    PredictionFeedbackV2Serializer,
    PredictionRunSerializer,
    StartupFeatureSnapshotSerializer,
    StartupHistoricalSnapshotSerializer,
    TrainingRunSerializer,
    UncertaintyDecompositionSerializer,
    VentureOutcomePredictionSerializer,
    VentureSurvivalForecastSerializer,
)


# =========================================================================
# Utility mixins
# =========================================================================


class _StaffGuardMixin:
    def get_queryset(self):
        qs = super().get_queryset()
        if not getattr(self, "swagger_fake_view", False) and not self.request.user.is_staff:
            raise PermissionDenied("Staff access required.")
        return qs


# =========================================================================
# Feature Store
# =========================================================================


class FeatureSnapshotListView(generics.ListAPIView):
    """GET historical feature snapshots for a startup."""

    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)
    serializer_class = StartupFeatureSnapshotSerializer

    def get_queryset(self):
        startup_id = self.kwargs["startup_id"]
        if getattr(self, "swagger_fake_view", False):
            return StartupFeatureSnapshot.objects.none()
        startup = StartupProfile.objects.filter(pk=startup_id).first()
        if startup is None:
            return StartupFeatureSnapshot.objects.none()
        IsStaffOrVisibleStartup.ensure_visible(self.request, startup)
        return StartupFeatureSnapshot.objects.filter(startup_id=startup_id).order_by("-observed_at")


class FeatureSnapshotCaptureView(APIView):
    """POST — capture a feature snapshot from a request payload or from current state."""

    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)

    def post(self, request: Request, startup_id: int) -> Response:
        try:
            startup = StartupProfile.objects.get(pk=startup_id)
        except StartupProfile.DoesNotExist:
            return Response({"detail": "Startup not found."}, status=status.HTTP_404_NOT_FOUND)
        IsStaffOrVisibleStartup.ensure_visible(request, startup)

        serializer = StartupFeatureSnapshotSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        snapshot = serializer.save(startup=startup)
        return Response(
            StartupFeatureSnapshotSerializer(snapshot).data,
            status=status.HTTP_201_CREATED,
        )


class FeatureSnapshotDetailView(generics.RetrieveAPIView):
    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)
    serializer_class = StartupFeatureSnapshotSerializer
    queryset = StartupFeatureSnapshot.objects.all()

    def get_object(self):
        obj = super().get_object()
        IsStaffOrVisibleStartup.ensure_visible(self.request, obj.startup)
        return obj


# =========================================================================
# Venture Outcome Prediction
# =========================================================================


class LatestVentureOutcomeView(APIView):
    """GET — retrieve the most recent VentureOutcomePrediction for a startup."""

    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)

    def get(self, request: Request, pk: int) -> Response:
        try:
            startup = StartupProfile.objects.get(pk=pk)
        except StartupProfile.DoesNotExist:
            return Response({"detail": "Startup not found."}, status=status.HTTP_404_NOT_FOUND)
        IsStaffOrVisibleStartup.ensure_visible(request, startup)

        pred = (
            VentureOutcomePrediction.objects.filter(startup=startup)
            .select_related("model_version", "feature_snapshot")
            .prefetch_related("survival_forecasts", "bayesian_updates")
            .order_by("-generated_at")
            .first()
        )
        if not pred:
            return Response(
                {
                    "message": "No prediction available yet. Trigger generation.",
                    "startup_id": pk,
                },
                status=status.HTTP_202_ACCEPTED,
            )
        return Response(VentureOutcomePredictionSerializer(pred).data)


def _safe_float(request_data, key, default):
    """Parse a float from request.data; raise structured ValidationError on bad input."""
    raw = request_data.get(key, default)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        raise ValidationError(
            {key: f"Expected a valid number; received {raw!r}."},
            code="invalid",
        )


def _safe_int(request_data, key, default):
    """Parse an int from request.data; raise structured ValidationError on bad input."""
    raw = request_data.get(key, default)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError(
            {key: f"Expected a valid integer; received {raw!r}."},
            code="invalid",
        )


def _safe_datetime(request_data, key, default):
    """Parse an ISO8601 datetime from request.data; raise structured ValidationError on bad input."""
    raw = request_data.get(key)
    if raw is None:
        return default
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            {key: f"Expected a valid ISO8601 datetime; received {raw!r} ({exc})."},
            code="invalid",
        )


class VentureOutcomeGenerateView(APIView):
    """
    POST — generate or refresh a VentureOutcomePrediction.

    Accepts optional feature overrides; otherwise uses the latest
    StartupFeatureSnapshot for the startup.  Delegates to the existing
    VentureOutcomePredictor from apps.intelligence.ml.outcomes for the
    baseline computation, then persists the structured ORM entities
    (survival curves, Bayesian update log, uncertainty decomposition).
    """

    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)

    def post(self, request: Request, pk: int) -> Response:
        try:
            startup = StartupProfile.objects.get(pk=pk)
        except StartupProfile.DoesNotExist:
            return Response({"detail": "Startup not found."}, status=status.HTTP_404_NOT_FOUND)
        IsStaffOrVisibleStartup.ensure_visible(request, startup)

        company_name = request.data.get("company_name", startup.company_name)
        stage = request.data.get("stage", "seed")
        sector = request.data.get("sector", "enterprise_saas")
        base_score = _safe_float(request.data, "base_fundability_score", 75.0)
        metrics = request.data.get("claimed_metrics", {})
        evidence_ratio = _safe_float(request.data, "verified_evidence_ratio", 0.8)
        founder_spike = _safe_float(request.data, "team_founder_spike", 80.0)
        moat_score = _safe_float(request.data, "moat_score", 70.0)

        from apps.intelligence.ml.outcomes import VentureOutcomePredictor

        profile = VentureOutcomePredictor.predict_venture_outcomes(
            company_name=company_name,
            stage=stage,
            sector=sector,
            base_fundability_score=base_score,
            claimed_metrics=metrics or None,
            verified_evidence_ratio=evidence_ratio,
            team_founder_spike=founder_spike,
            moat_score=moat_score,
        )

        latest_feature = (
            StartupFeatureSnapshot.objects.filter(startup=startup).order_by("-observed_at").first()
        )
        active_model = ModelVersion.objects.filter(
            registry__name="venture-outcome-multitask", is_active=True
        ).first()

        # --- Normalize 0-100 percentage dataclass outputs → 0-1 fractions ----
        def _pct_to_frac(pct):
            if pct is None:
                return None
            clamped = max(0.0, min(100.0, float(pct)))
            return clamped / 100.0

        pred = VentureOutcomePrediction.objects.create(
            startup=startup,
            feature_snapshot=latest_feature,
            model_version=active_model,
            fundraising_prob_12m=_pct_to_frac(min(95.0, profile.series_a_18m_probability * 0.9)),
            fundraising_prob_24m=_pct_to_frac(profile.series_a_18m_probability),
            fundraising_prob_36m=_pct_to_frac(min(95.0, profile.series_b_36m_probability * 1.05)),
            series_a_prob_12m=_pct_to_frac(profile.series_a_18m_probability * 0.65),
            series_a_prob_24m=_pct_to_frac(profile.series_a_18m_probability),
            series_a_prob_36m=_pct_to_frac(min(95.0, profile.series_a_18m_probability * 1.1)),
            series_b_prob_36m=_pct_to_frac(profile.series_b_36m_probability),
            series_b_prob_60m=_pct_to_frac(min(95.0, profile.series_b_36m_probability * 1.2)),
            high_growth_prob_24m=_pct_to_frac(profile.ten_m_arr_5y_probability * 0.4),
            high_growth_prob_60m=_pct_to_frac(profile.ten_m_arr_5y_probability),
            unicorn_prob_36m=_pct_to_frac(profile.unicorn_one_b_valuation_probability * 0.3),
            unicorn_prob_60m=_pct_to_frac(profile.unicorn_one_b_valuation_probability),
            unicorn_prob_84m=_pct_to_frac(min(25.0, profile.unicorn_one_b_valuation_probability * 1.5)),
            exit_prob_60m=_pct_to_frac(profile.hundred_m_valuation_5y_probability * 0.4),
            exit_prob_84m=_pct_to_frac(profile.hundred_m_valuation_5y_probability * 0.7),
            failure_prob_24m=_pct_to_frac(max(1.0, (100.0 - profile.overall_fundability_score) * 0.3)),
            failure_prob_60m=_pct_to_frac(max(5.0, (100.0 - profile.overall_fundability_score) * 0.7)),
            confidence_tier=profile.confidence_tier,
            overall_uncertainty_score=profile.prediction_uncertainty_score,
            evidence_coverage_pct=profile.evidence_coverage_percentage,
            top_positive_drivers=[
                {"driver": d, "contribution_pct": round(100.0 / max(1, len(profile.primary_positive_drivers)), 1)}
                for d in profile.primary_positive_drivers
            ],
            top_negative_drivers=[
                {"driver": d, "contribution_pct": round(100.0 / max(1, len(profile.primary_uncertainty_drivers)), 1)}
                for d in profile.primary_uncertainty_drivers
            ],
            explanation_narrative=(
                f"{profile.confidence_tier.title()} confidence fundability of {profile.overall_fundability_score:.1f}/100."
                f" Top positive driver: {profile.primary_positive_drivers[0]}."
                f" Top uncertainty: {profile.primary_uncertainty_drivers[0]}."
            ),
            is_calibrated=False,
        )

        for milestone_key, _prob_ref in [
            ("fundraising", pred.series_a_prob_24m),
            ("series_a", pred.series_a_prob_24m),
            ("series_b", pred.series_b_prob_60m),
            ("unicorn", pred.unicorn_prob_60m),
            ("ten_m_arr", pred.high_growth_prob_60m),
        ]:
            VentureSurvivalForecast.objects.create(
                prediction=pred,
                milestone=milestone_key,
                model_type="weibull",
                weibull_lambda_months=18.0 if milestone_key in ("fundraising", "series_a") else 42.0,
                weibull_k_shape=1.25,
                cdf_curve_json=[
                    {
                        "horizon_months": sp.horizon_months,
                        "probability": _pct_to_frac(sp.probability_milestone_achieved),
                        "hazard_rate": sp.hazard_rate,
                        "ci_lower": max(0.0, _pct_to_frac(max(0.0, sp.probability_milestone_achieved - 8.0))),
                        "ci_upper": min(0.99, _pct_to_frac(min(99.0, sp.probability_milestone_achieved + 8.0))),
                    }
                    for sp in profile.survival_curve
                ],
                median_time_months=next(
                    (sp.horizon_months for sp in profile.survival_curve if sp.probability_milestone_achieved >= 50.0),
                    None,
                ),
                expected_time_months=profile.survival_curve[-1].horizon_months if profile.survival_curve else None,
            )

        # --- Build a compact Bayesian update log from the dataclass history
        for idx, step in enumerate(profile.bayesian_belief.update_history or []):
            BayesianUpdateLog.objects.create(
                prediction=pred,
                outcome_head="unicorn",
                step_order=idx,
                prior_alpha=profile.bayesian_belief.prior_alpha if idx == 0 else 0,
                prior_beta=profile.bayesian_belief.prior_beta if idx == 0 else 0,
                prior_probability=_pct_to_frac(step.get("probability", profile.bayesian_belief.prior_probability)),
                evidence_type="computed",
                evidence_ref=f"step_{idx}",
                positive_weight_applied=step.get("added_positive_weight", 0.0),
                negative_weight_applied=step.get("added_negative_weight", 0.0),
                evidence_confidence=evidence_ratio,
                posterior_alpha=profile.bayesian_belief.posterior_alpha,
                posterior_beta=profile.bayesian_belief.posterior_beta,
                posterior_probability=_pct_to_frac(step.get("probability", profile.bayesian_belief.posterior_probability)),
                ci_5_pct=profile.bayesian_belief.credible_interval_5,  # 0-1 fraction already
                ci_50_pct=profile.bayesian_belief.credible_interval_50,
                ci_95_pct=profile.bayesian_belief.credible_interval_95,
                uncertainty_score=step.get("uncertainty", profile.bayesian_belief.uncertainty_score),
            )

        # --- Uncertainty decomposition (simple rule-based for v1)
        data_unc = max(0.0, 100.0 - profile.evidence_coverage_percentage) * 0.4
        conflict_unc = 2.0 * len(profile.anomaly_audit_reports)
        epistemic = max(0.0, profile.prediction_uncertainty_score - data_unc - conflict_unc) * 0.6
        aleatoric = 30.0
        total = max(0.1, data_unc + conflict_unc + epistemic + aleatoric)
        UncertaintyDecomposition.objects.create(
            prediction=pred,
            data_sparsity_contribution=round(data_unc / total * 100, 1),
            evidence_conflict_contribution=round(conflict_unc / total * 100, 1),
            model_epistemic_contribution=round(epistemic / total * 100, 1),
            inherent_aleatoric_contribution=round(aleatoric / total * 100, 1),
            calibration_correction_contribution=0.0,
            recommended_minimum_evidence_items=32,
            current_evidence_items=max(1, int(profile.evidence_coverage_percentage * 0.4)),
            biggest_uncertainty_driver=profile.primary_uncertainty_drivers[0] if profile.primary_uncertainty_drivers else "",
        )

        return Response(
            VentureOutcomePredictionSerializer(pred).data,
            status=status.HTTP_201_CREATED,
        )


class VentureOutcomeDetailView(generics.RetrieveAPIView):
    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)
    serializer_class = VentureOutcomePredictionSerializer
    queryset = VentureOutcomePrediction.objects.prefetch_related(
        "survival_forecasts", "bayesian_updates"
    ).all()

    def get_object(self):
        obj = super().get_object()
        IsStaffOrVisibleStartup.ensure_visible(self.request, obj.startup)
        return obj


class PredictionFeedbackV2CreateView(generics.CreateAPIView):
    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)
    serializer_class = PredictionFeedbackV2Serializer

    def perform_create(self, serializer):
        prediction_pk = self.kwargs.get("pk")
        if prediction_pk:
            try:
                prediction = VentureOutcomePrediction.objects.select_related("startup").get(pk=prediction_pk)
            except VentureOutcomePrediction.DoesNotExist:
                raise ValidationError({"prediction": "Prediction not found."})
            IsStaffOrVisibleStartup.ensure_visible(self.request, prediction.startup)
            serializer.save(prediction=prediction)
        else:
            raise ValidationError({"prediction": "Prediction id is required."})


# =========================================================================
# Historical Time Machine
# =========================================================================


class HistoricalSnapshotListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)
    serializer_class = StartupHistoricalSnapshotSerializer

    def get_queryset(self):
        startup_id = self.kwargs["startup_id"]
        if getattr(self, "swagger_fake_view", False):
            return StartupHistoricalSnapshot.objects.none()
        startup = StartupProfile.objects.filter(pk=startup_id).first()
        if startup is None:
            return StartupHistoricalSnapshot.objects.none()
        IsStaffOrVisibleStartup.ensure_visible(self.request, startup)
        return StartupHistoricalSnapshot.objects.filter(startup_id=startup_id).order_by("-as_of")


class HistoricalSnapshotBuildView(APIView):
    """POST — trigger construction of a historical time-machine snapshot."""

    permission_classes = (IsAuthenticated & IsStaffOrVisibleStartup,)

    def post(self, request: Request, startup_id: int) -> Response:
        try:
            startup = StartupProfile.objects.get(pk=startup_id)
        except StartupProfile.DoesNotExist:
            return Response({"detail": "Startup not found."}, status=status.HTTP_404_NOT_FOUND)
        IsStaffOrVisibleStartup.ensure_visible(request, startup)

        as_of_str = request.data.get("as_of")
        if not as_of_str:
            raise ValidationError({"as_of": "ISO8601 datetime required."})
        try:
            as_of = datetime.fromisoformat(as_of_str.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValidationError({"as_of": f"Invalid ISO8601 datetime: {exc}"})

        snap, _created = StartupHistoricalSnapshot.objects.get_or_create(
            startup=startup,
            as_of=as_of,
            defaults={
                "cohort_tag": request.data.get("cohort_tag", ""),
                "state_json": {
                    "company_name": startup.company_name,
                    "as_of": as_of.isoformat(),
                    "reconstruction_note": "Built via API endpoint. For full time-travel accuracy, wire to event log replay.",
                },
            },
        )
        return Response(
            StartupHistoricalSnapshotSerializer(snap).data,
            status=status.HTTP_201_CREATED if _created else status.HTTP_200_OK,
        )


class HistoricalEvaluateView(APIView):
    """
    POST — run the time-machine evaluator over a cohort.
    Uses apps.intelligence.ml.time_machine.HistoricalTimeMachine.
    """

    permission_classes = (IsAuthenticated & IsStaff,)

    def post(self, request: Request) -> Response:
        predictions_raw = request.data.get("predictions", [])
        ground_truth = request.data.get("ground_truth", [])
        errors = {}
        if not predictions_raw:
            errors["predictions"] = "predictions array is required."
        if not ground_truth:
            errors["ground_truth"] = "ground_truth array is required."
        if errors:
            raise ValidationError(errors)
        if len(predictions_raw) != len(ground_truth):
            raise ValidationError({
                "predictions": "predictions and ground_truth must have equal length.",
                "ground_truth": "predictions and ground_truth must have equal length.",
            })

        from apps.intelligence.ml.time_machine import HistoricalTimeMachine

        try:
            predictions = [float(p) for p in predictions_raw]
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                {"predictions": f"All entries must be numeric. Parse error: {exc}"}
            )
        try:
            ground_truth_int = [int(y) for y in ground_truth]
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                {"ground_truth": f"All entries must be integer (0/1). Parse error: {exc}"}
            )

        result = HistoricalTimeMachine.compute_calibration_metrics(
            predictions=predictions,
            ground_truth=ground_truth_int,
        )
        return Response({
            "sample_size": result.sample_size,
            "precision_at_top_quartile_pct": result.precision_at_top_quartile,
            "precision_at_top_half_pct": result.precision_at_top_half,
            "brier_score": result.brier_score_calibration,
            "pr_auc": result.pr_auc,
            "leakage_check_passed": result.leakage_check_passed,
            "notes": result.evaluation_notes,
        })


# =========================================================================
# Investor Intent Prediction
# =========================================================================


class StartupTopInvestorIntentsView(generics.ListAPIView):
    """GET — investors ranked by P(invest) for a startup."""

    permission_classes = (IsAuthenticated,)
    serializer_class = InvestorIntentPredictionSerializer

    def get_queryset(self):
        startup_id = self.kwargs["startup_id"]
        if getattr(self, "swagger_fake_view", False):
            return InvestorIntentPrediction.objects.none()
        return (
            InvestorIntentPrediction.objects.filter(startup_id=startup_id)
            .select_related("investor")
            .order_by("-p_investment")[:50]
        )


class ScoreInvestorIntentView(APIView):
    """
    POST — score a behavioural event sequence for an investor.
    Uses apps.intelligence.ml.sequences.BehavioralSequenceModel.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, investor_id: int) -> Response:
        try:
            investor = InvestorProfile.objects.get(pk=investor_id)
        except InvestorProfile.DoesNotExist:
            return Response({"detail": "Investor not found."}, status=status.HTTP_404_NOT_FOUND)

        startup_id = request.data.get("startup_id")
        events = request.data.get("events", [])
        horizon_days = _safe_int(request.data, "horizon_days", 30)
        times_span_days = _safe_float(request.data, "times_span_days", 7.0)
        now_utc = datetime.now(timezone.utc)
        window_start = _safe_datetime(request.data, "window_start", now_utc)
        window_end = _safe_datetime(request.data, "window_end", now_utc)

        if not startup_id:
            raise ValidationError({"startup_id": "required"})
        try:
            startup = StartupProfile.objects.get(pk=startup_id)
        except StartupProfile.DoesNotExist:
            return Response({"detail": "Startup not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.intelligence.ml.sequences import BehavioralSequenceModel

        eval_result = BehavioralSequenceModel.evaluate_sequence(events, times_span_days)
        intent_score = eval_result.conversion_intent_score / 100.0

        seq, _ = InvestorBehavioralSequence.objects.update_or_create(
            investor=investor,
            startup=startup,
            defaults={
                "events_json": events,
                "window_start": window_start,
                "window_end": window_end,
                "total_events": len(events),
            },
        )

        active_model = ModelVersion.objects.filter(
            registry__name="investor-intent-markov", is_active=True
        ).first()

        pred = InvestorIntentPrediction.objects.create(
            investor=investor,
            startup=startup,
            sequence=seq,
            horizon_days=horizon_days,
            model_version=active_model,
            p_interest=round(min(0.99, max(0.01, intent_score * 1.0)), 4),
            p_introduction=round(min(0.95, max(0.01, intent_score * 0.7)), 4),
            p_due_diligence=round(min(0.85, max(0.01, intent_score * 0.5)), 4),
            p_offer=round(min(0.70, max(0.01, intent_score * 0.35)), 4),
            p_investment=round(min(0.50, max(0.01, intent_score * 0.25)), 4),
            intent_tier=eval_result.intent_tier,
            progression_velocity=eval_result.progression_velocity,
            recommended_next_action=eval_result.recommended_next_action,
            top_sequence_drivers=eval_result.observed_sequence,
        )
        return Response(
            InvestorIntentPredictionSerializer(pred).data,
            status=status.HTTP_201_CREATED,
        )


# =========================================================================
# Knowledge Graph
# =========================================================================


class GraphEntityListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated & IsStaff,)
    serializer_class = GraphEntitySerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return GraphEntity.objects.none()
        qs = GraphEntity.objects.all()
        entity_type = self.request.query_params.get("entity_type")
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        return qs[:200]


class GraphEntityCreateView(generics.CreateAPIView):
    permission_classes = (IsAuthenticated & IsStaff,)
    serializer_class = GraphEntitySerializer


class GraphRelationCreateView(generics.CreateAPIView):
    permission_classes = (IsAuthenticated & IsStaff,)
    serializer_class = GraphRelationSerializer


class GraphTraverseView(APIView):
    """POST — graph traversal queries (co-investors, competitor cluster, nearest neighbours)."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        query_type = request.data.get("query_type", "co_investors")
        entity_id = request.data.get("entity_id")
        if not entity_id:
            raise ValidationError({"entity_id": "required"})
        try:
            origin = GraphEntity.objects.get(entity_id=entity_id)
        except GraphEntity.DoesNotExist:
            return Response({"detail": "Entity not found."}, status=status.HTTP_404_NOT_FOUND)

        if query_type == "co_investors":
            investments = set(
                e.target_id
                for e in origin.outgoing_edges.filter(relation_type="INVESTED_IN")
            )
            co_map = {}
            for edge in GraphRelation.objects.filter(
                relation_type="INVESTED_IN", target__in=investments
            ).exclude(source=origin):
                if edge.source.entity_type not in ("INVESTOR", "FUND"):
                    continue
                co_map[edge.source] = co_map.get(edge.source, 0) + 1
            results = [
                {
                    "entity_id": src.entity_id,
                    "label": src.label,
                    "shared_deals": cnt,
                    "entity_type": src.entity_type,
                }
                for src, cnt in sorted(co_map.items(), key=lambda x: x[1], reverse=True)
            ]
        elif query_type == "competitor_cluster":
            markets = set(
                e.target_id
                for e in origin.outgoing_edges.filter(relation_type="OPERATES_IN")
            )
            peers = GraphRelation.objects.filter(
                relation_type="OPERATES_IN", target__in=markets
            ).exclude(source=origin).select_related("source")
            results = [
                {
                    "entity_id": p.source.entity_id,
                    "label": p.source.label,
                    "market": p.target.label,
                    "entity_type": p.source.entity_type,
                }
                for p in peers
                if p.source.entity_type == "STARTUP"
            ]
        elif query_type == "investor_network_neighbours":
            depth = int(request.data.get("depth", 2))
            results = [{
                "entity_id": origin.entity_id,
                "label": origin.label,
                "depth": 0,
            }]
            frontier = {origin.entity_id}
            seen = set(frontier)
            for d in range(1, depth + 1):
                next_frontier = set()
                edges = GraphRelation.objects.filter(
                    source__entity_id__in=frontier
                ).select_related("target")
                for edge in edges:
                    if edge.target.entity_id in seen:
                        continue
                    seen.add(edge.target.entity_id)
                    next_frontier.add(edge.target.entity_id)
                    results.append({
                        "entity_id": edge.target.entity_id,
                        "label": edge.target.label,
                        "depth": d,
                        "edge_type": edge.relation_type,
                        "entity_type": edge.target.entity_type,
                    })
                frontier = next_frontier
                if not frontier:
                    break
        else:
            raise ValidationError({"query_type": f"Unknown query_type '{query_type}'."})

        return Response({"query_type": query_type, "origin": origin.label, "results": results})


# =========================================================================
# Anomaly Detection
# =========================================================================


class AnomalyListView(generics.ListAPIView):
    """GET — unresolved anomaly records (default) or filter by status/startup."""

    permission_classes = (IsAuthenticated & IsStaff,)
    serializer_class = AnomalyDetectionRecordSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AnomalyDetectionRecord.objects.none()
        qs = AnomalyDetectionRecord.objects.select_related("startup").all()
        status_filter = self.request.query_params.get("resolution_status", "UNRESOLVED")
        if status_filter:
            qs = qs.filter(resolution_status=status_filter)
        startup_id = self.request.query_params.get("startup_id")
        if startup_id:
            qs = qs.filter(startup_id=startup_id)
        return qs.order_by("-anomaly_score")[:200]


class AnomalyAuditView(APIView):
    """
    POST — run the statistical anomaly auditor over a list of
    claimed metrics and persist the results.

    Payload shape:
      {
        "startup_id": 123,
        "company_name": "Acme",
        "sector": "enterprise_saas",
        "metrics": [{"metric_key": "mom_growth_pct", "claimed_value": 180.0}, ...]
      }
    """

    permission_classes = (IsAuthenticated & IsStaff,)

    def post(self, request: Request) -> Response:
        sector = request.data.get("sector", "enterprise_saas")
        company_name = request.data.get("company_name", "")
        startup_id = request.data.get("startup_id")
        startup = None
        if startup_id:
            try:
                startup = StartupProfile.objects.get(pk=startup_id)
                company_name = company_name or startup.company_name
            except StartupProfile.DoesNotExist:
                pass

        metrics = request.data.get("metrics", [])
        if not isinstance(metrics, list):
            raise ValidationError({"metrics": "Must be a list of {metric_key, claimed_value}."})

        from apps.intelligence.ml.anomalies import AnomalyDetectionEngine

        created = []
        for m in metrics:
            key = m.get("metric_key")
            value = m.get("claimed_value")
            if key is None or value is None:
                continue
            try:
                value_f = float(value)
            except (TypeError, ValueError):
                continue
            report = AnomalyDetectionEngine.audit_metric(key, value_f, sector)
            severity = "HIGH" if report.severity == "HIGH" else (
                "MEDIUM" if report.severity == "MEDIUM" else "LOW"
            )
            if report.is_anomaly and severity == "HIGH":
                severity = "CRITICAL"
            score = min(
                1.0,
                max(0.0, ((value_f - report.sector_p95) / max(1e-6, report.sector_p95)) / 2.0)
                if report.sector_p95 else 0.0,
            )
            rec = AnomalyDetectionRecord.objects.create(
                startup=startup,
                company_name=company_name,
                metric_key=key,
                claimed_value=value_f,
                sector_label=sector,
                peer_median=report.sector_median,
                peer_p95=report.sector_p95,
                anomaly_score=score,
                anomaly_severity=severity,
                detection_method="percentile_benchmark",
                is_anomaly=report.is_anomaly,
                explanation=report.explanation,
            )
            created.append(rec)

        return Response(
            AnomalyDetectionRecordSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class AnomalyResolveView(APIView):
    """POST — analyst resolution of a specific anomaly record."""

    permission_classes = (IsAuthenticated & IsStaff,)

    def post(self, request: Request, pk: int) -> Response:
        try:
            rec = AnomalyDetectionRecord.objects.get(pk=pk)
        except AnomalyDetectionRecord.DoesNotExist:
            return Response({"detail": "Anomaly not found."}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("resolution_status")
        if new_status not in dict(AnomalyDetectionRecord._meta.get_field("resolution_status").choices):
            raise ValidationError({"resolution_status": "Invalid status."})
        notes = request.data.get("resolution_notes", "")

        rec.resolution_status = new_status
        rec.resolution_notes = notes
        rec.resolved_by = request.user
        rec.resolved_at = datetime.now(timezone.utc)
        rec.save(update_fields=[
            "resolution_status", "resolution_notes",
            "resolved_by", "resolved_at",
        ])
        return Response(AnomalyDetectionRecordSerializer(rec).data)


# =========================================================================
# Model Registry / Calibration / Experiments (staff-only)
# =========================================================================


class ModelRegistryListView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated & IsStaff,)
    serializer_class = ModelRegistrySerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ModelRegistry.objects.none()
        return ModelRegistry.objects.all()

    def perform_create(self, serializer):
        serializer.save()


class ModelVersionListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated & IsStaff,)
    serializer_class = ModelVersionSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ModelVersion.objects.none()
        pk = self.kwargs["pk"]
        return ModelVersion.objects.filter(registry_id=pk).order_by("-created_at")


class EvaluationRunListView(_StaffGuardMixin, generics.ListAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = EvaluationRunSerializer
    queryset = EvaluationRun.objects.select_related("model_version").all()


class ExperimentListView(_StaffGuardMixin, generics.ListAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ExperimentSerializer
    queryset = Experiment.objects.select_related(
        "champion_model", "challenger_model", "winner_model"
    ).all()


class CalibrationListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated & IsStaff,)
    serializer_class = CalibrationRecordSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return CalibrationRecord.objects.none()
        mv_id = self.kwargs["model_version_id"]
        return CalibrationRecord.objects.filter(model_version_id=mv_id)


# =========================================================================
# Feature Capability Registry (ML-only vs AI-augmented)
# =========================================================================


class FeatureCapabilitiesView(APIView):
    """
    GET — expose which predictive-intelligence features are ML-only
    (always on) vs AI-augmented (require a live LLM provider).

    Payload shape:
      {
        "ai_enabled": bool,
        "active_provider": "openai"|"gemini"|"openrouter"|"noop",
        "provider_available": bool,
        "default_provider_configured": str,
        "tiers": {
          "ml_only":   count of features always active,
          "ai_opt":    count with heuristic fallback,
          "ai_req":    count requiring live LLM
        },
        "features": [
          {
            "key": "pitch.quality_analysis",
            "name": "...",
            "category": "pitch_enrichment",
            "tier": "ml_only"|"ai_opt"|"ai_req",
            "enabled": bool,  # runtime flag given current AI state
            "description": "...",
            "ml_components": [...],
            "ai_components": [...],
            "ai_available": bool,
            "active_provider": str,
            "provider_available": bool,
          }, ...
        ],
        "categories": {
          "pitch_enrichment": {"total": N, "enabled": M, "ai_req": K},
          ...
        }
      }
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        from apps.predictive_intelligence.ai_gateway import (
            FEATURE_CAPABILITIES,
            get_ai_provider,
            is_ai_enabled,
            list_available_features,
        )
        from django.conf import settings

        ai_on = is_ai_enabled()
        provider = get_ai_provider()
        features = list_available_features()

        # Tiers summary
        tiers: dict[str, int] = {
            "ml_only": 0,
            "ai_opt": 0,
            "ai_req": 0,
        }
        for feat in FEATURE_CAPABILITIES:
            tiers[feat["tier"]] = tiers.get(feat["tier"], 0) + 1

        # Categories summary
        categories: dict[str, dict[str, int]] = {}
        for feat in features:
            cat = feat["category"]
            slot = categories.setdefault(cat, {"total": 0, "enabled": 0, "ai_req": 0})
            slot["total"] += 1
            if feat["enabled"]:
                slot["enabled"] += 1
            if feat["tier"] == "ai_req":
                slot["ai_req"] += 1

        return Response({
            "ai_enabled": ai_on,
            "active_provider": provider.name,
            "provider_available": provider.is_available(),
            "default_provider_configured": getattr(
                settings, "AI_DEFAULT_PROVIDER", "noop"
            ),
            "tiers": tiers,
            "features": features,
            "categories": categories,
        })
