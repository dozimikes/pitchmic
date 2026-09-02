"""
apps.intelligence.voice_interviews
==================================
Voice-first conversational AI interview service and debrief synthesizer for early-stage screening.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from django.utils import timezone

from .models import StartupProfile, VoiceInterviewSession

logger = logging.getLogger(__name__)


STAGE_QUESTIONS: Dict[str, List[Dict[str, str]]] = {
    "pre_seed": [
        {
            "id": "q1",
            "topic": "Founder Spike & Origin",
            "question": "Tell me about your background and the specific insight or personal experience that led you to start this company.",
        },
        {
            "id": "q2",
            "topic": "Customer Discovery & Problem Conviction",
            "question": "How many prospective customers have you spoken to, and what was the most surprising thing they told you that challenged your initial assumptions?",
        },
        {
            "id": "q3",
            "topic": "Unfair Advantage & Moat",
            "question": "If an incumbent or well-funded competitor copied your product next month, what is your unfair advantage or defense?",
        },
        {
            "id": "q4",
            "topic": "Velocity & Focus",
            "question": "What is the single most important milestone you need to hit in the next 90 days, and what is the biggest execution risk in hitting it?",
        },
    ],
    "seed": [
        {
            "id": "q1",
            "topic": "Unit Economics & Payback",
            "question": "Walk me through your customer acquisition cost (CAC), gross margins, and how many months it takes for a customer to pay back their acquisition cost.",
        },
        {
            "id": "q2",
            "topic": "Retention & Churn Dynamics",
            "question": "What does your cohort retention curve look like, and why do customers churn when they leave?",
        },
        {
            "id": "q3",
            "topic": "Sales Velocity & Go-To-Market",
            "question": "Which customer acquisition channel is working best today, and how scalable is it over the next 12 months?",
        },
    ],
    "series_a": [
        {
            "id": "q1",
            "topic": "Net Revenue Retention & Expansion",
            "question": "What is your Net Revenue Retention (NRR) rate, and what percentage of your revenue growth comes from expanding existing accounts vs new logos?",
        },
        {
            "id": "q2",
            "topic": "Scale Economics & Org Architecture",
            "question": "How does your unit margin improve as you scale from $1M to $10M ARR, and what key executive hires are needed to get there?",
        },
    ],
}


class VoiceInterviewService:
    """
    Manages conversational voice interviews and generates partner debriefs.
    """

    @classmethod
    def get_stage_questions(cls, stage: str = "pre_seed") -> List[Dict[str, str]]:
        return STAGE_QUESTIONS.get(stage, STAGE_QUESTIONS["pre_seed"])

    @classmethod
    def start_session(
        cls,
        startup: StartupProfile,
        stage: str = "pre_seed",
        interviewer_persona: str = "Sam (Venture Partner AI)",
    ) -> VoiceInterviewSession:
        """
        Initializes a voice screening interview session.
        """
        session = VoiceInterviewSession.objects.create(
            startup=startup,
            stage=stage,
            interviewer_persona=interviewer_persona,
            status=VoiceInterviewSession.STATUS_IN_PROGRESS,
            started_at=timezone.now(),
            transcript=[],
            debrief_scorecard={},
        )
        return session

    @classmethod
    def add_transcript_turn(
        cls,
        session: VoiceInterviewSession,
        speaker: str,
        text: str,
        timestamp_offset: float = 0.0,
    ) -> VoiceInterviewSession:
        """
        Appends an audio turn (from AI interviewer or founder) to the session transcript.
        """
        turn = {
            "speaker": speaker,
            "text": text,
            "timestamp": timestamp_offset,
            "recorded_at": timezone.now().isoformat(),
        }
        session.transcript.append(turn)
        session.save(update_fields=["transcript"])
        return session

    @classmethod
    def generate_partner_debrief(
        cls,
        session: VoiceInterviewSession,
    ) -> Dict[str, Any]:
        """
        Synthesizes the complete interview transcript into an IC Partner Debrief Scorecard.
        """
        transcript = session.transcript
        founder_turns = [t["text"] for t in transcript if t.get("speaker") in ("founder", "candidate")]
        all_text = " ".join(founder_turns).lower()

        # Quantitative heuristic scoring based on answer depth, clarity, and keyword indicators
        word_count = len(all_text.split())
        clarity_score = min(95, max(45, int(word_count * 0.8) + 40))

        # Domain depth detection
        tech_indicators = ["api", "architecture", "algorithm", "retention", "cac", "ltv", "margin", "moat", "pipeline", "compliance", "cross-border", "settlement"]
        matched_indicators = [kw for kw in tech_indicators if kw in all_text]
        domain_depth_score = min(98, 50 + (len(matched_indicators) * 6))

        # Conviction & grit scoring
        conviction_indicators = ["mission", "customer", "solved", "iterate", "unlocked", "validated", "user", "years", "spent"]
        matched_conviction = [kw for kw in conviction_indicators if kw in all_text]
        conviction_score = min(95, 55 + (len(matched_conviction) * 6))

        # Risk flag analysis
        red_flags: List[str] = []
        green_flags: List[str] = []

        if "no competitors" in all_text or "nobody else does this" in all_text:
            red_flags.append("Unrealistic competitor awareness ('no competitors' claim).")
        if "guaranteed" in all_text or "100% margin" in all_text:
            red_flags.append("Over-optimistic or ungrounded financial claims.")
        if len(founder_turns) < 1:
            red_flags.append("Incomplete interview (no founder responses recorded).")

        if len(matched_indicators) >= 3:
            green_flags.append("High technical and operational domain fluency.")
        if "customer" in all_text or "user" in all_text or "spoke" in all_text or "solved" in all_text:
            green_flags.append("Strong customer-discovery orientation.")

        composite_score = round((clarity_score * 0.3) + (domain_depth_score * 0.4) + (conviction_score * 0.3), 1)

        if composite_score >= 75 and len(red_flags) == 0:
            recommendation = "Fast-Track Partner Interview"
        elif composite_score >= 55:
            recommendation = "Standard Diligence Review"
        else:
            recommendation = "Pass / Keep on Radar"

        debrief = {
            "session_id": session.id,
            "company_name": session.startup.company_name,
            "stage": session.stage,
            "overall_score": composite_score,
            "evaluation_metrics": {
                "communication_clarity": clarity_score,
                "domain_depth": domain_depth_score,
                "founder_conviction": conviction_score,
            },
            "recommendation": recommendation,
            "green_flags": green_flags,
            "red_flags": red_flags,
            "turn_count": len(transcript),
            "generated_at": timezone.now().isoformat(),
        }

        session.debrief_scorecard = debrief
        session.status = VoiceInterviewSession.STATUS_COMPLETED
        session.completed_at = timezone.now()
        session.save(update_fields=["debrief_scorecard", "status", "completed_at"])

        return debrief
