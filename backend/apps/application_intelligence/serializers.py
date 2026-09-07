"""
apps.application_intelligence.serializers
==========================================
Serializers for the Application Intelligence Engine.
"""
from rest_framework import serializers

from .models import (
    ApplicationStrategy,
    CorrelationNote,
    ExternalProgramProfile,
    ProgramApplicationQuestion,
    ProgramRequirement,
    ProgramSelectionSignal,
)


class ProgramSelectionSignalSerializer(serializers.ModelSerializer):
    program_id = serializers.CharField(source="program.id", read_only=True)

    class Meta:
        model = ProgramSelectionSignal
        fields = [
            "id",
            "program_id",
            "criterion",
            "source_type",
            "weight",
            "confidence",
            "evidence_text",
            "official_source_ref",
        ]


class ProgramRequirementSerializer(serializers.ModelSerializer):
    program_id = serializers.CharField(source="program.id", read_only=True)

    class Meta:
        model = ProgramRequirement
        fields = [
            "id",
            "program_id",
            "category",
            "description",
            "importance",
            "rationale",
        ]


class ProgramApplicationQuestionSerializer(serializers.ModelSerializer):
    program_id = serializers.CharField(source="program.id", read_only=True)

    class Meta:
        model = ProgramApplicationQuestion
        fields = [
            "id",
            "program_id",
            "question_number",
            "label",
            "rubric_dimension",
            "importance",
            "max_char_limit",
        ]


class ExternalProgramProfileSerializer(serializers.ModelSerializer):
    """Full profile including nested rubric data."""
    requirements = ProgramRequirementSerializer(many=True, read_only=True)
    questions = ProgramApplicationQuestionSerializer(many=True, read_only=True)
    signals = ProgramSelectionSignalSerializer(many=True, read_only=True)

    class Meta:
        model = ExternalProgramProfile
        fields = [
            "id",
            "name",
            "short_name",
            "program_type",
            "stage",
            "investment",
            "geography",
            "industry",
            "application_format",
            "website_url",
            "deadline_text",
            "founder_quality_bar",
            "evidence_expectations_bar",
            "interview_intensity",
            "requirements",
            "questions",
            "signals",
            "created_at",
        ]


class ExternalProgramProfileListSerializer(serializers.ModelSerializer):
    """Lightweight list serializer without nested data."""

    class Meta:
        model = ExternalProgramProfile
        fields = [
            "id",
            "name",
            "short_name",
            "program_type",
            "stage",
            "investment",
            "geography",
            "industry",
            "application_format",
            "website_url",
            "deadline_text",
            "founder_quality_bar",
            "evidence_expectations_bar",
            "interview_intensity",
            "created_at",
        ]


class ApplicationStrategySerializer(serializers.ModelSerializer):
    program_id = serializers.PrimaryKeyRelatedField(
        source="program",
        queryset=ExternalProgramProfile.objects.all(),
        write_only=True,
        required=False,
    )
    program_name = serializers.CharField(source="program.name", read_only=True)

    class Meta:
        model = ApplicationStrategy
        fields = [
            "id",
            "program_id",
            "program_name",
            "problem",
            "founder_advantage",
            "why_now",
            "proof",
            "program_fit",
            "primary_weakness",
            "mitigation",
            "updated_at",
        ]
        read_only_fields = ["id", "program_name", "updated_at"]


class CorrelationNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CorrelationNote
        fields = [
            "id",
            "text",
            "layer",
            "caveat",
            "sample_size_hint",
        ]
