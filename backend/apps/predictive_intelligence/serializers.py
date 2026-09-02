from __future__ import annotations

from rest_framework import serializers

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


class _StartupNameMixin:
    startup_name = serializers.CharField(source="startup.company_name", read_only=True)


class StartupFeatureSnapshotSerializer(_StartupNameMixin, serializers.ModelSerializer):
    class Meta:
        model = StartupFeatureSnapshot
        fields = "__all__"
        read_only_fields = ("id", "created_at", "snapshot_hash")


class StartupHistoricalSnapshotSerializer(_StartupNameMixin, serializers.ModelSerializer):
    class Meta:
        model = StartupHistoricalSnapshot
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class VentureSurvivalForecastSerializer(serializers.ModelSerializer):
    class Meta:
        model = VentureSurvivalForecast
        fields = "__all__"
        read_only_fields = ("id", "generated_at")


class BayesianUpdateLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = BayesianUpdateLog
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class UncertaintyDecompositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UncertaintyDecomposition
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class VentureOutcomePredictionSerializer(_StartupNameMixin, serializers.ModelSerializer):
    survival_forecasts = VentureSurvivalForecastSerializer(many=True, read_only=True)
    bayesian_updates = BayesianUpdateLogSerializer(many=True, read_only=True)
    uncertainty_decomposition = UncertaintyDecompositionSerializer(read_only=True)

    class Meta:
        model = VentureOutcomePrediction
        fields = "__all__"
        read_only_fields = ("id", "generated_at")


class GraphEntitySerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphEntity
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class GraphRelationSerializer(serializers.ModelSerializer):
    source_label = serializers.CharField(source="source.label", read_only=True)
    target_label = serializers.CharField(source="target.label", read_only=True)
    source_type = serializers.CharField(source="source.entity_type", read_only=True)
    target_type = serializers.CharField(source="target.entity_type", read_only=True)

    class Meta:
        model = GraphRelation
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class InvestorBehavioralSequenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvestorBehavioralSequence
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class InvestorIntentPredictionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvestorIntentPrediction
        fields = "__all__"
        read_only_fields = ("id", "generated_at")


class AnomalyDetectionRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnomalyDetectionRecord
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class CalibrationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalibrationRecord
        fields = "__all__"
        read_only_fields = ("id", "calibrated_at")


class ModelRegistrySerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelRegistry
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class ModelVersionSerializer(serializers.ModelSerializer):
    registry_name = serializers.CharField(source="registry.name", read_only=True)

    class Meta:
        model = ModelVersion
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class TrainingRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingRun
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class EvaluationRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvaluationRun
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class PredictionRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = PredictionRun
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class ExperimentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Experiment
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class PredictionFeedbackV2Serializer(serializers.ModelSerializer):
    startup_name = serializers.CharField(
        source="prediction.startup.company_name", read_only=True
    )

    class Meta:
        model = PredictionFeedbackV2
        fields = "__all__"
        read_only_fields = ("id", "created_at")
        extra_kwargs = {
            "prediction": {"required": False},
            "submitted_by": {"required": False},
            "analyst_probability_override": {"required": False},
        }

    def validate_accuracy_rating(self, v: int) -> int:
        if not 1 <= v <= 5:
            raise serializers.ValidationError("Must be between 1 and 5.")
        return v

    def validate_calibration_rating(self, v):
        if v is not None and not 1 <= v <= 5:
            raise serializers.ValidationError("Must be between 1 and 5 or null.")
        return v

    def create(self, validated_data):
        validated_data["submitted_by"] = self.context["request"].user
        return super().create(validated_data)
