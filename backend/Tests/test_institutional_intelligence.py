import pytest
from datetime import datetime, timezone

from apps.intelligence.core_evidence import (
    DataClassification,
    EvidenceClaim,
    EvidenceObservation,
    EvidenceProvenanceEngine,
    EvidenceSourceType,
    VerificationStatus,
)
from apps.intelligence.events import DomainEventBus
from apps.intelligence.gateway import AIGateway
from apps.intelligence.graph import InvestmentKnowledgeGraph
from apps.intelligence.ml.anomalies import AnomalyDetectionEngine
from apps.intelligence.ml.bayesian import BayesianUpdateEngine
from apps.intelligence.ml.outcomes import VentureOutcomePredictor
from apps.intelligence.ml.sequences import BehavioralSequenceModel
from apps.intelligence.ml.survival import SurvivalAnalysisEngine
from apps.intelligence.ml.time_machine import HistoricalTimeMachine
from apps.intelligence.rbac import ResourceAction, Role, SecurityPolicyEngine


def test_evidence_provenance_verification():
    claim = EvidenceClaim(
        subject="Revenue",
        metric_key="mom_growth_pct",
        claimed_value=25.0,
        source_type=EvidenceSourceType.PITCH_DECK,
        locator="slide_4",
    )
    obs = [
        EvidenceObservation(
            metric_key="mom_growth_pct",
            extracted_value=25.0,
            locator="slide_4_table",
            confidence=0.98,
        )
    ]
    res = EvidenceProvenanceEngine.verify_claim(claim, obs)
    assert res.status == VerificationStatus.VERIFIED
    assert res.confidence_score == 0.98

    # Test contradiction
    contra_obs = [
        EvidenceObservation(
            metric_key="mom_growth_pct",
            extracted_value=12.0,
            locator="audited_financials_p2",
        )
    ]
    contra_res = EvidenceProvenanceEngine.verify_claim(claim, obs, contradicting_observations=contra_obs)
    assert contra_res.status == VerificationStatus.CONTRADICTED
    assert contra_res.delta_percentage == -52.0


def test_bayesian_update_and_credible_intervals():
    belief = BayesianUpdateEngine.initialize_belief(stage="seed", sector="enterprise_saas")
    assert 0.0 < belief.prior_probability < 1.0
    assert belief.credible_interval_5 <= belief.credible_interval_50 <= belief.credible_interval_95

    # Update with strong positive evidence
    updated = BayesianUpdateEngine.update_belief(belief, positive_evidence_weight=5.0, negative_evidence_weight=0.5)
    assert updated.posterior_probability > belief.prior_probability
    assert len(updated.update_history) == 2


def test_venture_outcome_prediction_multi_task():
    profile = VentureOutcomePredictor.predict_venture_outcomes(
        company_name="Helios AI",
        stage="seed",
        sector="enterprise_saas",
        base_fundability_score=82.0,
        verified_evidence_ratio=0.88,
        team_founder_spike=85.0,
        moat_score=78.0,
    )
    assert profile.company_name == "Helios AI"
    assert profile.series_a_18m_probability > 50.0
    assert profile.unicorn_one_b_valuation_probability > 0.0
    assert len(profile.survival_curve) == 7
    assert profile.confidence_tier in ("VERY_HIGH", "HIGH")
    assert len(profile.primary_positive_drivers) > 0


def test_anomaly_detection_engine():
    normal_rep = AnomalyDetectionEngine.audit_metric("mom_growth_pct", 18.0, "enterprise_saas")
    assert normal_rep.is_anomaly is False

    extreme_rep = AnomalyDetectionEngine.audit_metric("mom_growth_pct", 140.0, "enterprise_saas")
    assert extreme_rep.is_anomaly is True
    assert extreme_rep.severity == "HIGH"


def test_historical_time_machine_leakage_filter():
    t_cutoff = datetime(2023, 1, 1, tzinfo=timezone.utc)
    events = [
        {"timestamp": "2022-06-01T10:00:00Z", "metric": "arr", "value": 100000},
        {"timestamp": "2022-12-15T10:00:00Z", "metric": "arr", "value": 300000},
        {"timestamp": "2023-06-01T10:00:00Z", "metric": "arr", "value": 800000},  # Future event
    ]
    filtered = HistoricalTimeMachine.filter_features_as_of(events, t_cutoff)
    assert len(filtered) == 2
    assert all(datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")) <= t_cutoff for e in filtered)

    # Calibration calculation: top 2 are 1s
    preds = [0.9, 0.8, 0.3, 0.2]
    actuals = [1, 1, 0, 0]
    metrics = HistoricalTimeMachine.compute_calibration_metrics(preds, actuals)
    assert metrics.precision_at_top_half == 100.0
    assert metrics.brier_score_calibration < 0.1


def test_behavioral_sequence_model():
    events = ["VIEW_PROFILE", "VIEW_PITCH", "DOWNLOAD_DECK", "VIEW_DATAROOM", "REQUEST_INTRO"]
    journey = BehavioralSequenceModel.evaluate_sequence(events, times_span_days=3.0)
    assert journey.intent_tier in ("HIGH_CONVICTION", "IMMINENT_TERM_SHEET")
    assert journey.conversion_intent_score > 60.0


def test_knowledge_graph_traversal():
    kg = InvestmentKnowledgeGraph()
    kg.add_node("s1", "STARTUP", "Paystack", market="fintech")
    kg.add_node("s2", "STARTUP", "Flutterwave", market="fintech")
    kg.add_node("inv1", "INVESTOR", "Y Combinator")
    kg.add_node("inv2", "INVESTOR", "Tencent")

    kg.add_edge("s1", "fintech", "OPERATES_IN")
    kg.add_edge("s2", "fintech", "OPERATES_IN")
    kg.add_edge("inv1", "s1", "INVESTED_IN")
    kg.add_edge("inv1", "s2", "INVESTED_IN")
    kg.add_edge("inv2", "s2", "INVESTED_IN")

    co_invs = kg.find_co_investors("inv1")
    assert len(co_invs) == 1
    assert co_invs[0]["investor_id"] == "inv2"


def test_rbac_security_policy():
    assert SecurityPolicyEngine.is_authorized(
        Role.FOUNDER, DataClassification.CONFIDENTIAL, ResourceAction.VIEW
    )
    assert not SecurityPolicyEngine.is_authorized(
        Role.INVESTOR, DataClassification.RESTRICTED, ResourceAction.VIEW
    )
    assert SecurityPolicyEngine.is_authorized(
        Role.VENTURE_PARTNER, DataClassification.HIGHLY_RESTRICTED, ResourceAction.VIEW
    )
