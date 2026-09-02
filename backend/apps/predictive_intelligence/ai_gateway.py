"""
apps.predictive_intelligence.ai_gateway
========================================

Centralized facade — the ONE place callers should import AI helpers from.

Philosophy (ML-core, AI-optional):
  - ML models ALWAYS run and own every probability / score / rank.
  - AI/LLMs are an AUXILIARY layer used ONLY for:
      1. Unstructured-data ingestion (pitch-deck claim extraction)
      2. Natural-language explanation of ML outputs
  - When AI is disabled (ENABLE_AI_FEATURES=False or no provider available)
    every function here returns deterministic "empty" results so callers
    never crash.

Public API (import these, never import from providers.py directly):
    is_ai_enabled()            → bool
    get_ai_provider(name=None) → AIProvider (Protocol)
    ai_complete(prompt, ...)   → AIResponse (never raises)
    is_feature_enabled(key)    → bool   (fine-grained feature gate)
    list_available_features()  → list[dict]  (for the /features/capabilities endpoint)
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from django.conf import settings

from .providers import (
    AIProvider,
    AIResponse,
    NoOpAIProvider,
    PROVIDER_REGISTRY,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Feature capability registry
# ---------------------------------------------------------------------------
#
# Every AI-augmented feature in PitchMic is registered here so the admin UI
# and the /features/capabilities endpoint can tell callers which features
# are "ML-only" (always active) vs "AI-augmented" (active only when an LLM
# provider is configured).
#
# capability tiers:
#   "ml_only"   — no LLM required; pure statistical / rule-based ML.
#   "ai_opt"    — uses LLM when available; falls back to heuristic.
#   "ai_req"    — requires a live LLM; without it this feature is disabled.
#
# Categories match the top-level domain areas:
#   "pitch_enrichment", "due_diligence", "explanations",
#   "deck_parsing", "voice_interview", "rag"

FEATURE_CAPABILITIES: list[dict[str, Any]] = [
    # -------- Pitch enrichment (pitches.intelligence) ---------------------
    {
        "key": "pitch.quality_analysis",
        "name": "Pitch Quality Scoring",
        "category": "pitch_enrichment",
        "tier": "ml_only",
        "description": (
            "Rule-based + ML scoring of pitch completeness, readability, "
            "section depth, and key-metric extraction. Always active."
        ),
        "ml_components": ["flesch_reading_ease", "section_completeness", "key_metric_extractor"],
        "ai_components": [],
    },
    {
        "key": "pitch.ai_enhance_suggestions",
        "name": "AI Pitch Enhancement Suggestions",
        "category": "pitch_enrichment",
        "tier": "ai_opt",
        "description": (
            "LLM-generated, actionable improvement suggestions for each pitch "
            "section. Falls back to rule-based heuristics when AI is disabled."
        ),
        "ml_components": ["weakness_identifier", "section_gap_detector"],
        "ai_components": ["llm_pitch_coach"],
    },
    # -------- Due-diligence pipeline (intelligence.pipeline) --------------
    {
        "key": "dd.forensic_audit",
        "name": "Forensic Auditor (Stage 1)",
        "category": "due_diligence",
        "tier": "ai_opt",
        "description": (
            "Extract unit economics, red flags, and founder signals. "
            "Heuristic fallback uses PitchDeckForensicsService."
        ),
        "ml_components": ["unit_economics_coherence", "anomaly_detection"],
        "ai_components": ["llm_forensic_auditor"],
    },
    {
        "key": "dd.market_strategist",
        "name": "Market Strategist (Stage 2)",
        "category": "due_diligence",
        "tier": "ai_opt",
        "description": (
            "Competitive landscape, TAM validation, and market-timing score. "
            "Heuristic fallback uses stored TAM + patent-count signals."
        ),
        "ml_components": ["tam_normalizer", "moat_classifier"],
        "ai_components": ["llm_market_strategist"],
    },
    {
        "key": "dd.managing_partner",
        "name": "Managing Partner Synthesis (Stage 3)",
        "category": "due_diligence",
        "tier": "ai_opt",
        "description": (
            "Bull/bear debate synthesis and invest/pass verdict. "
            "Heuristic fallback uses weighted red-flag + market scoring."
        ),
        "ml_components": ["verdict_scorer", "scorecard_aggregator"],
        "ai_components": ["llm_managing_partner"],
    },
    {
        "key": "dd.ic_memo",
        "name": "IC Memo Generator (Stage 4)",
        "category": "due_diligence",
        "tier": "ml_only",
        "description": (
            "Templated Investment-Committee memo produced from structured "
            "stage outputs. No LLM required."
        ),
        "ml_components": ["memo_template_engine"],
        "ai_components": [],
    },
    # -------- Explanations (predictive_intelligence) ----------------------
    {
        "key": "explain.venture_outcome_narrative",
        "name": "Venture Outcome Narrative Explanation",
        "category": "explanations",
        "tier": "ai_opt",
        "description": (
            "Plain-English explanation of why a startup received its "
            "unicorn / fundraising / failure probabilities.  Falls back to "
            "a driver-based template narrative when AI is off."
        ),
        "ml_components": ["shap_attribution", "driver_ranking"],
        "ai_components": ["llm_outcome_explainer"],
    },
    {
        "key": "explain.anomaly_summary",
        "name": "Anomaly Detection Human Summary",
        "category": "explanations",
        "tier": "ai_opt",
        "description": (
            "Natural-language summary of statistical anomalies found in "
            "claimed metrics. Template fallback when AI is off."
        ),
        "ml_components": ["percentile_benchmark", "isolation_forest"],
        "ai_components": ["llm_anomaly_summarizer"],
    },
    # -------- Deck parsing / voice ----------------------------------------
    {
        "key": "deck.claim_extraction",
        "name": "Pitch-Deck Claim Extraction",
        "category": "deck_parsing",
        "tier": "ai_req",
        "description": (
            "Extract structured diligence claims from unstructured pitch-deck "
            "PDFs / slide images.  *Requires a live LLM provider; disabled "
            "in pure-ML mode.*"
        ),
        "ml_components": ["claim_schema_validator"],
        "ai_components": ["llm_deck_extractor", "vision_deck_analyzer"],
    },
    {
        "key": "voice.interview_transcript_analysis",
        "name": "Voice Interview Transcript Analysis",
        "category": "voice_interview",
        "tier": "ai_req",
        "description": (
            "Sentiment, honesty-signal, and topic extraction from founder "
            "voice-interview transcripts.  *Requires a live LLM provider.*"
        ),
        "ml_components": ["signal_normalizer"],
        "ai_components": ["llm_voice_analyst"],
    },
    # -------- RAG / institutional memory ----------------------------------
    {
        "key": "rag.cited_memos",
        "name": "Cited Prior IC Memo Retrieval",
        "category": "rag",
        "tier": "ai_req",
        "description": (
            "Semantic retrieval of analogous prior investments to cite in "
            "new IC memos.  *Requires a live LLM embedding provider.*"
        ),
        "ml_components": ["vector_index_search"],
        "ai_components": ["llm_embedder", "llm_hyde_rewriter"],
    },
]


# ---------------------------------------------------------------------------
# Caching — avoid re-instantiating providers on every call
# ---------------------------------------------------------------------------

_provider_cache: dict[str, AIProvider] = {}


def _build_provider(name: str) -> AIProvider:
    """Instantiate a single provider by name, reading its config from settings."""
    providers_settings: dict[str, dict[str, str]] = getattr(
        settings, "AI_PROVIDERS", {}
    )
    registry_cls = PROVIDER_REGISTRY.get(name, NoOpAIProvider)
    config = providers_settings.get(name, {})
    try:
        return registry_cls(config)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Failed to instantiate AI provider '%s': %s; falling back to NoOp",
            name,
            exc,
        )
        return NoOpAIProvider(config)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def is_ai_enabled() -> bool:
    """
    Master switch: True iff ENABLE_AI_FEATURES is True AND at least one
    configured provider reports itself available.
    """
    if not getattr(settings, "ENABLE_AI_FEATURES", False):
        return False
    default_name = getattr(settings, "AI_DEFAULT_PROVIDER", "noop")
    provider = get_ai_provider(default_name)
    return provider.is_available()


def get_ai_provider(name: Optional[str] = None) -> AIProvider:
    """
    Return a concrete AIProvider instance (cached).

    If *name* is omitted the settings.AI_DEFAULT_PROVIDER is used.  When the
    requested provider is unavailable (no API key, SDK missing) the
    NoOpAIProvider is transparently substituted so callers never crash.
    """
    default_name = getattr(settings, "AI_DEFAULT_PROVIDER", "noop")
    chosen = name or default_name
    if chosen not in PROVIDER_REGISTRY:
        logger.warning(
            "Unknown AI provider '%s'; falling back to default '%s'",
            chosen,
            default_name,
        )
        chosen = default_name
    if chosen not in _provider_cache:
        provider = _build_provider(chosen)
        if not provider.is_available() and chosen != "noop":
            logger.info(
                "AI provider '%s' not available; substituting NoOp provider.",
                chosen,
            )
            _provider_cache[chosen] = NoOpAIProvider({})
        else:
            _provider_cache[chosen] = provider
    return _provider_cache[chosen]


def ai_complete(
    prompt: str,
    *,
    system_instruction: str = "",
    max_tokens: int = 1200,
    temperature: float = 0.2,
    json_mode: bool = False,
    model: Optional[str] = None,
    provider: Optional[str] = None,
) -> AIResponse:
    """
    Convenience one-liner: resolve provider + call complete().

    Never raises — on any failure returns an AIResponse with fallback=True.
    """
    prov = get_ai_provider(provider)
    try:
        return prov.complete(
            prompt,
            system_instruction=system_instruction,
            max_tokens=max_tokens,
            temperature=temperature,
            json_mode=json_mode,
            model=model,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("ai_complete() unexpected exception: %s", exc)
        return AIResponse(fallback=True, error=str(exc))


def is_feature_enabled(feature_key: str) -> bool:
    """
    Fine-grained feature gate.

    Resolution order (first False wins):
      1. settings.AI_CAPABILITY_OVERRIDES[feature_key] — per-install kill switch
      2. AICapability.admin_enabled (ORM) — admin runtime toggle
      3. tier check:
           - "ml_only"  → always True
           - "ai_opt"   → True (heuristic path always exists)
           - "ai_req"   → True only when is_ai_enabled() is also True
    """
    from django.core.exceptions import AppRegistryNotReady

    # 1) Per-install Django-setting override (explicit False kills it)
    overrides: dict[str, bool] = getattr(settings, "AI_CAPABILITY_OVERRIDES", {})
    if feature_key in overrides and not overrides[feature_key]:
        return False

    # 2) ORM admin_enabled toggle (ignore if apps aren't ready yet, e.g. during import-time)
    try:
        from .models import AICapability
        cap = AICapability.objects.filter(key=feature_key).values("admin_enabled").first()
        if cap is not None and not cap["admin_enabled"]:
            return False
    except AppRegistryNotReady:
        pass
    except Exception:  # noqa: BLE001 — defensive: ORM access can fail during migrations
        logger.debug(
            "is_feature_enabled: ORM lookup skipped for '%s' (apps not ready?)",
            feature_key,
        )

    # 3) Tier + AI availability
    for feat in FEATURE_CAPABILITIES:
        if feat["key"] == feature_key:
            tier = feat["tier"]
            if tier == "ai_req":
                return is_ai_enabled()
            return True
    logger.debug("is_feature_enabled: unknown key '%s'", feature_key)
    return False


def list_available_features() -> list[dict[str, Any]]:
    """
    Build the response payload for the /features/capabilities endpoint.

    Each entry includes the feature metadata plus a runtime `enabled` flag
    that reflects the current AI-provider availability as well as any
    per-install Django-setting overrides or ORM admin toggles.
    """
    from django.core.exceptions import AppRegistryNotReady

    ai_on = is_ai_enabled()
    active_provider = get_ai_provider()
    overrides: dict[str, bool] = getattr(settings, "AI_CAPABILITY_OVERRIDES", {})

    # Pre-load ORM admin_enabled state in one query (ignore if registry not ready)
    admin_state: dict[str, bool] = {}
    try:
        from .models import AICapability
        for row in AICapability.objects.all().values("key", "admin_enabled"):
            admin_state[row["key"]] = bool(row["admin_enabled"])
    except AppRegistryNotReady:
        pass
    except Exception:  # noqa: BLE001
        logger.debug("list_available_features: ORM preload skipped")

    payload: list[dict[str, Any]] = []
    for feat in FEATURE_CAPABILITIES:
        key = feat["key"]
        tier = feat["tier"]

        # Override cascade (explicit False at any layer disables it)
        setting_override = overrides.get(key, None)
        if setting_override is False:
            enabled = False
        elif key in admin_state and not admin_state[key]:
            enabled = False
        elif tier == "ml_only":
            enabled = True
        elif tier == "ai_opt":
            enabled = True  # heuristic path always present
        else:  # ai_req
            enabled = ai_on

        payload.append(
            {
                **feat,
                "enabled": enabled,
                "ai_available": ai_on,
                "active_provider": active_provider.name if ai_on else "noop",
                "provider_available": active_provider.is_available(),
                "admin_enabled": admin_state.get(key, True),
                "setting_override": setting_override,
            }
        )
    return payload
