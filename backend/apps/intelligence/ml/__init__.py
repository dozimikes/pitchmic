"""
Pitchmic Machine Learning & Probabilistic Intelligence Stack.
Modules:
- bayesian: Conjugate prior-to-posterior update engine & credible intervals
- outcomes: Multi-task venture outcome & unicorn probability forecaster
- survival: Time-to-event milestone hazard models
- anomalies: Statistical metric anomaly detector
- sequences: Markov behavioral journey model for investor intent
- time_machine: Leakage-controlled historical time machine & backtest evaluator
"""

from .anomalies import AnomalyDetectionEngine, MetricAnomalyReport
from .bayesian import BayesianUpdateEngine, ProbabilisticBelief
from .outcomes import UnicornProbabilityProfile, VentureOutcomePredictor
from .sequences import BehavioralSequenceModel, InvestorJourneyEvaluation
from .survival import SurvivalAnalysisEngine, SurvivalCurvePoint
from .time_machine import HistoricalTimeMachine, TemporalEvaluationResult

__all__ = [
    "BayesianUpdateEngine",
    "ProbabilisticBelief",
    "VentureOutcomePredictor",
    "UnicornProbabilityProfile",
    "SurvivalAnalysisEngine",
    "SurvivalCurvePoint",
    "AnomalyDetectionEngine",
    "MetricAnomalyReport",
    "BehavioralSequenceModel",
    "InvestorJourneyEvaluation",
    "HistoricalTimeMachine",
    "TemporalEvaluationResult",
]
