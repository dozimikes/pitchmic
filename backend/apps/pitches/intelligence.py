"""
apps.pitches.intelligence
=========================
PitchAnalyzer - rule-based + LLM pitch quality scoring.

Implements:
  POST /api/v1/pitches/{id}/analyze/   - completeness, readability, quality score
  POST /api/v1/pitches/{id}/enhance/   - AI-generated improvement suggestions
"""
from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _word_count(text: str) -> int:
    return len(text.split()) if text else 0


def _flesch_reading_ease(text: str) -> float:
    """Approximate Flesch reading ease (0–100, higher = easier)."""
    if not text:
        return 0.0
    words = text.split()
    sentences = max(1, len(re.split(r"[.!?]+", text)))
    syllables = sum(max(1, len(re.findall(r"[aeiouAEIOU]", w))) for w in words)
    if not words:
        return 0.0
    asl = len(words) / sentences
    asw = syllables / len(words)
    return max(0.0, min(100.0, round(206.835 - 1.015 * asl - 84.6 * asw, 1)))


def _call_llm_for_suggestions(pitch_data: dict[str, str]) -> list[str]:
    """Call LLM for improvement suggestions. Returns empty list if unavailable."""
    from apps.predictive_intelligence.ai_gateway import ai_complete, is_feature_enabled

    if not is_feature_enabled("pitch.ai_enhance_suggestions"):
        return []

    prompt = f"""
You are an expert venture capital pitch coach.
Analyze this startup pitch and return EXACTLY 5 specific, actionable improvement suggestions as a JSON array of strings.
Be concrete, not generic.

Company: {pitch_data.get('title', 'Unknown')}
Problem: {pitch_data.get('problem', '')[:400]}
Solution: {pitch_data.get('solution', '')[:400]}
Market Size: {pitch_data.get('market_size', '')[:300]}
Business Model: {pitch_data.get('business_model', '')[:300]}
Traction: {pitch_data.get('traction', '')[:300]}

Return only: ["suggestion 1", "suggestion 2", "suggestion 3", "suggestion 4", "suggestion 5"]
"""

    response = ai_complete(
        prompt,
        system_instruction="You are a direct, precise pitch coach. Output valid JSON only.",
        max_tokens=500,
        temperature=0.4,
        json_mode=True,
    )

    if response.fallback or not response.structured:
        if response.error:
            logger.warning("Pitch enhance AI call failed: %s", response.error)
        return []

    try:
        suggestions = list(response.structured) if isinstance(response.structured, list) else []
        if isinstance(response.structured, dict):
            for key in ("suggestions", "improvements", "items"):
                if key in response.structured and isinstance(response.structured[key], list):
                    suggestions = response.structured[key]
                    break
        return [str(s).strip() for s in suggestions[:5] if str(s).strip()]
    except Exception as exc:
        logger.warning("Pitch enhance AI response parse failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Core analyzer
# ---------------------------------------------------------------------------

class PitchAnalyzer:
    """
    Analyse a Pitch instance and return a structured quality report.
    """

    REQUIRED_FIELDS = ["problem", "solution", "market_size", "business_model", "traction"]
    ADEQUATE_WORD_COUNT = 50

    def analyze(self, pitch) -> dict[str, Any]:
        sections = self._check_sections(pitch)
        completeness_pct = self._completeness_pct(sections)
        quality = self._quality_score(sections, pitch)
        readability = _flesch_reading_ease(
            f"{pitch.problem} {pitch.solution} {pitch.traction}"
        )
        pitch_data_completeness = self._pitch_data_score(pitch)

        return {
            "pitch_id": pitch.pk,
            "title": pitch.title,
            "quality_score": round(quality, 1),
            "completeness_pct": round(completeness_pct, 1),
            "readability_score": round(readability, 1),
            "section_completeness": sections,
            "pitch_data_completeness": pitch_data_completeness,
            "key_metrics": self._extract_key_metrics(pitch),
            "strengths": self._identify_strengths(sections, pitch),
            "weaknesses": self._identify_weaknesses(sections, pitch),
            "suggested_improvements": self._quick_suggestions(sections, pitch),
        }

    def enhance(self, pitch) -> dict[str, Any]:
        """Return LLM-generated pitch improvement suggestions."""
        from apps.predictive_intelligence.ai_gateway import is_ai_enabled

        pitch_data = {
            "title": pitch.title,
            "problem": pitch.problem or "",
            "solution": pitch.solution or "",
            "market_size": pitch.market_size or "",
            "business_model": pitch.business_model or "",
            "traction": pitch.traction or "",
        }
        ai_suggestions = _call_llm_for_suggestions(pitch_data)

        ai_was_used = bool(ai_suggestions) and is_ai_enabled()

        if not ai_suggestions:
            analysis = self.analyze(pitch)
            ai_suggestions = analysis["suggested_improvements"]

        return {
            "pitch_id": pitch.pk,
            "title": pitch.title,
            "ai_suggestions": ai_suggestions,
            "source": "llm" if ai_was_used else "heuristic",
            "ai_enabled": is_ai_enabled(),
        }

    #  Private helpers 

    def _check_sections(self, pitch) -> dict[str, dict]:
        completeness = {}
        for field in self.REQUIRED_FIELDS:
            text = getattr(pitch, field, "") or ""
            wc = _word_count(text)
            completeness[field] = {
                "present": bool(text),
                "word_count": wc,
                "adequate": wc >= self.ADEQUATE_WORD_COUNT,
                "score": round(min(1.0, wc / 100), 3),
            }
        return completeness

    def _completeness_pct(self, sections: dict) -> float:
        present = sum(1 for s in sections.values() if s["present"])
        return present / len(sections) * 100

    def _quality_score(self, sections: dict, pitch) -> float:
        """Weighted quality score 0–100."""
        base = sum(s["score"] for s in sections.values()) / len(sections)
        bonuses = 0.0
        if pitch.asking_amount:
            bonuses += 0.05
        if pitch.equity_offered:
            bonuses += 0.05
        if pitch.deck_url:
            bonuses += 0.05
        if pitch.video_url:
            bonuses += 0.05
        if pitch.tags:
            bonuses += 0.02
        return round(min(100.0, (base + bonuses) * 100), 1)

    def _pitch_data_score(self, pitch) -> dict[str, bool]:
        return {
            "has_asking_amount": bool(pitch.asking_amount),
            "has_equity_offered": bool(pitch.equity_offered),
            "has_deck_url": bool(pitch.deck_url),
            "has_video_url": bool(pitch.video_url),
            "has_cover_image": bool(pitch.cover_image_url),
            "has_tags": bool(pitch.tags),
        }

    def _extract_key_metrics(self, pitch) -> dict[str, str | None]:
        return {
            "asking_amount": str(pitch.asking_amount) if pitch.asking_amount else None,
            "equity_offered": str(pitch.equity_offered) if pitch.equity_offered else None,
            "industry": pitch.startup.industry or pitch.startup.niche or None,
            "stage": getattr(pitch.startup, "funding_stage", None) or None,
        }

    def _identify_strengths(self, sections: dict, pitch) -> list[str]:
        strengths = []
        for field, data in sections.items():
            if data["adequate"]:
                strengths.append(f"Strong {field.replace('_', ' ')} section ({data['word_count']} words)")
        if pitch.deck_url:
            strengths.append("Pitch deck attached")
        if pitch.video_url:
            strengths.append("Video pitch included")
        return strengths[:5]

    def _identify_weaknesses(self, sections: dict, pitch) -> list[str]:
        weaknesses = []
        for field, data in sections.items():
            if not data["present"]:
                weaknesses.append(f"Missing {field.replace('_', ' ')} section")
            elif not data["adequate"]:
                weaknesses.append(
                    f"{field.replace('_', ' ').title()} section too brief ({data['word_count']} words, need 50+)"
                )
        if not pitch.asking_amount:
            weaknesses.append("No funding amount specified")
        return weaknesses[:5]

    def _quick_suggestions(self, sections: dict, pitch) -> list[str]:
        suggestions = []
        missing = [f for f, d in sections.items() if not d["present"]]
        weak = [f for f, d in sections.items() if d["present"] and not d["adequate"]]

        for f in missing[:2]:
            suggestions.append(f"Add a {f.replace('_', ' ')} section - investors need this to evaluate your pitch.")
        for f in weak[:2]:
            suggestions.append(
                f"Expand your {f.replace('_', ' ')} section to at least 50 words with specific evidence."
            )
        if not pitch.asking_amount:
            suggestions.append("State your funding ask clearly with a target amount and use-of-funds breakdown.")
        if not pitch.deck_url:
            suggestions.append("Upload a pitch deck - decks receive 3x more investor engagement.")

        return suggestions[:5]
