from dataclasses import dataclass
from typing import Dict, List


@dataclass
class InvestorJourneyEvaluation:
    observed_sequence: List[str]
    conversion_intent_score: float  # 0 to 100
    intent_tier: str  # "COLD", "WARM", "HIGH_CONVICTION", "IMMINENT_TERM_SHEET"
    progression_velocity: float
    recommended_next_action: str


class BehavioralSequenceModel:
    """
    Markov Transition & Journey Sequence Model for Investor Intent.
    Evaluates progression across:
    [VIEW_PROFILE -> VIEW_PITCH -> DOWNLOAD_DECK -> VIEW_DATAROOM -> RETURN_VISIT -> REQUEST_INTRO -> SUBMIT_OFFER]
    """

    # Transition probability multipliers reflecting conviction strength
    STAGE_WEIGHTS: Dict[str, float] = {
        "VIEW_PROFILE": 5.0,
        "VIEW_PITCH": 10.0,
        "DOWNLOAD_DECK": 25.0,
        "VIEW_DATAROOM": 45.0,
        "RETURN_VISIT": 60.0,
        "REQUEST_INTRO": 80.0,
        "SUBMIT_OFFER": 100.0,
    }

    @classmethod
    def evaluate_sequence(
        cls, events: List[str], times_span_days: float = 7.0
    ) -> InvestorJourneyEvaluation:
        if not events:
            return InvestorJourneyEvaluation(
                observed_sequence=[],
                conversion_intent_score=0.0,
                intent_tier="COLD",
                progression_velocity=0.0,
                recommended_next_action="Initiate outbound teaser campaign.",
            )

        # Base score from highest milestone reached + depth of sequence
        highest_weight = max(cls.STAGE_WEIGHTS.get(e, 0.0) for e in events)
        breadth_bonus = min(20.0, len(events) * 3.0)

        # Velocity factor: events compressed in short time span indicates high conviction
        velocity_factor = min(1.3, max(0.8, 7.0 / max(1.0, times_span_days)))

        raw_score = (highest_weight * 0.8 + breadth_bonus) * velocity_factor
        score = round(min(99.0, max(5.0, raw_score)), 1)

        if score >= 80.0:
            tier = "IMMINENT_TERM_SHEET"
            action = "Prepare partner IC memo and cap table valuation model."
        elif score >= 55.0:
            tier = "HIGH_CONVICTION"
            action = "Schedule partner deep-dive diligence call."
        elif score >= 30.0:
            tier = "WARM"
            action = "Send updated traction snapshot and customer references."
        else:
            tier = "COLD"
            action = "Monitor engagement signals and automated newsletter updates."

        return InvestorJourneyEvaluation(
            observed_sequence=events,
            conversion_intent_score=score,
            intent_tier=tier,
            progression_velocity=round(velocity_factor, 2),
            recommended_next_action=action,
        )
