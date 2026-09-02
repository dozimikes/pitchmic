"""
apps.intelligence.gateway
==========================

Thin wrapper over apps.predictive_intelligence.ai_gateway.

Preserves the legacy AIGateway class + ModelUsageLog for code that imports
from here (e.g. old collector/RAG code), but delegates *all* actual LLM
routing, provider selection, and failover to the centralized registry in
predictive_intelligence.ai_gateway.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


@dataclass
class ModelUsageLog:
    provider: str
    model_name: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    latency_ms: float
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class AIGateway:
    """
    Compatibility shim → predictive_intelligence.ai_gateway.

    New code should import directly from:
        apps.predictive_intelligence.ai_gateway.{ai_complete,is_ai_enabled,get_ai_provider}
    """

    PRICING_PER_1K_TOKENS = {
        "gpt-4o": {"prompt": 0.005, "completion": 0.015},
        "gpt-4o-mini": {"prompt": 0.00015, "completion": 0.0006},
        "gemini-2.5-pro": {"prompt": 0.00125, "completion": 0.005},
        "gemini-2.5-flash": {"prompt": 0.000075, "completion": 0.0003},
        "deterministic-fallback": {"prompt": 0.0, "completion": 0.0},
    }

    # ------------------------------------------------------------------
    # Public (backwards-compatible) API
    # ------------------------------------------------------------------

    @classmethod
    def resolve_provider(cls) -> str:
        """Return the name of the active provider (noop if AI disabled)."""
        from apps.predictive_intelligence.ai_gateway import get_ai_provider, is_ai_enabled
        if not is_ai_enabled():
            return "noop"
        return get_ai_provider().name

    @classmethod
    def calculate_cost(
        cls, model_name: str, prompt_tokens: int, completion_tokens: int
    ) -> float:
        pricing = cls.PRICING_PER_1K_TOKENS.get(
            model_name, cls.PRICING_PER_1K_TOKENS["deterministic-fallback"]
        )
        cost = (prompt_tokens / 1000.0) * pricing["prompt"] + (
            completion_tokens / 1000.0
        ) * pricing["completion"]
        return round(cost, 6)

    @classmethod
    def execute_prompt(
        cls,
        prompt: str,
        system_instruction: str = "",
        expected_schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 2000,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        """
        Execute a prompt via the centralized AI gateway provider.

        Returns a dict with `status`, `provider_used`, `usage`, `raw_output`,
        `structured_output`, and `fallback_engaged`.
        """
        from apps.predictive_intelligence.ai_gateway import ai_complete, is_ai_enabled

        json_mode = expected_schema is not None
        ai_resp = ai_complete(
            prompt,
            system_instruction=system_instruction,
            max_tokens=max_tokens,
            temperature=temperature,
            json_mode=json_mode,
        )

        cost = cls.calculate_cost(
            ai_resp.model, ai_resp.prompt_tokens, ai_resp.completion_tokens
        )
        usage = ModelUsageLog(
            provider=ai_resp.provider,
            model_name=ai_resp.model,
            prompt_tokens=ai_resp.prompt_tokens,
            completion_tokens=ai_resp.completion_tokens,
            total_tokens=ai_resp.prompt_tokens + ai_resp.completion_tokens,
            cost_usd=cost,
            latency_ms=ai_resp.latency_ms,
            timestamp=ai_resp.timestamp,
        )

        structured: Optional[Dict[str, Any]] = None
        if isinstance(ai_resp.structured, dict):
            structured = ai_resp.structured
        elif isinstance(ai_resp.structured, list):
            structured = {"items": ai_resp.structured}

        return {
            "status": "success" if not ai_resp.error else "provider_error",
            "provider_used": ai_resp.provider,
            "model_used": ai_resp.model,
            "usage": usage.__dict__,
            "raw_output": ai_resp.text,
            "structured_output": structured,
            "fallback_engaged": ai_resp.fallback,
            "ai_enabled": is_ai_enabled(),
            "error": ai_resp.error,
        }
