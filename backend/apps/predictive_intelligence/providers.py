"""
apps.predictive_intelligence.providers
========================================

AI Provider abstraction - ML-core, AI-optional.

Philosophy
----------
Pitchmic is a machine-learning venture intelligence platform.  All probabilities,
rankings, and forecasts come from ML models (XGBoost, Bayesian networks, CoxPH,
GraphSAGE, LambdaRank, etc.).  AI/LLMs are an AUXILIARY layer used ONLY for:

  * Unstructured-data ingestion (extracting claims from pitch decks)
  * Natural-language explanation of ML outputs

They NEVER own a number that is surfaced as a prediction.

This module defines the :class:`AIProvider` protocol plus concrete backends.
The :class:`NoOpAIProvider` is the **default** backend.  It returns deterministic
empty/dummy results so the rest of Pitchmic never fails when AI is disabled.

End-users are expected to call ``apps.predictive_intelligence.ai_gateway``
instead of importing classes from here directly.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class AIResponse:
    """Structured return value for every AI provider call.

    ``text`` holds the raw string body.  ``structured`` is populated when the
    provider successfully JSON-parsed the response.  ``provider`` and ``model``
    are auditable breadcrumbs; ``latency_ms`` and ``tokens`` support cost/budget
    tracking.  ``fallback`` is ``True`` when the provider returned without
    contacting a live model (i.e. AI was disabled or the key was missing).
    """

    text: str = ""
    structured: Optional[Any] = None
    provider: str = "noop"
    model: str = "deterministic-fallback"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: float = 0.0
    fallback: bool = True
    error: Optional[str] = None
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class AIProvider(Protocol):
    """Every AI backend must satisfy this protocol.

    Two methods are mandatory.  ``is_available`` MUST be cheap (no network).
    ``complete`` MUST never raise - on any failure it should return an
    ``AIResponse`` with ``fallback=True`` and ``error`` populated.
    """

    name: str

    def is_available(self) -> bool: ...  # pragma: no cover - protocol

    def complete(
        self,
        prompt: str,
        *,
        system_instruction: str = "",
        max_tokens: int = 1200,
        temperature: float = 0.2,
        json_mode: bool = False,
        model: Optional[str] = None,
    ) -> AIResponse: ...  # pragma: no cover - protocol


# ---------------------------------------------------------------------------
# NoOp (default / pure-ML mode)
# ---------------------------------------------------------------------------


class NoOpAIProvider:
    """Default backend.  Returns deterministic empty responses.

    When Pitchmic runs in pure-ML mode (``ENABLE_AI_FEATURES=False``) this is
    the only provider used.  Nothing in the ML pipeline should break.
    """

    name: str = "noop"

    def __init__(self, config: Optional[dict[str, str]] = None) -> None:
        self.config = config or {}

    def is_available(self) -> bool:
        return False

    def complete(
        self,
        prompt: str,
        *,
        system_instruction: str = "",
        max_tokens: int = 1200,
        temperature: float = 0.2,
        json_mode: bool = False,
        model: Optional[str] = None,
    ) -> AIResponse:
        _ = (prompt, system_instruction, max_tokens, temperature, model)
        return AIResponse(
            text="",
            structured={} if json_mode else None,
            provider=self.name,
            model=self.config.get("default_model", "deterministic-fallback"),
            fallback=True,
            error=None,
        )


# ---------------------------------------------------------------------------
# OpenAI compatible (OpenAI proper, OpenRouter, Azure, local llama.cpp server)
# ---------------------------------------------------------------------------


class OpenAICompatibleProvider:
    """Backend for any OpenAI-compatible HTTP API.

    Supports the canonical SDK (``openai`` package) with an overrideable
    ``base_url`` so it works for OpenRouter and local proxies as well.
    """

    def __init__(self, config: dict[str, str]) -> None:
        self.config = config
        self.api_key: str = (config.get("api_key") or "").strip()
        self.base_url: str = (config.get("base_url") or "").strip() or None
        self.default_model: str = (
            config.get("default_model") or "gpt-4o-mini"
        )

    def is_available(self) -> bool:
        if not self.api_key:
            return False
        try:
            import openai  # noqa: F401

            return True
        except Exception:  # pragma: no cover - dep may not be installed
            logger.warning(
                "openai package not installed; OpenAI-compatible provider disabled"
            )
            return False

    def complete(
        self,
        prompt: str,
        *,
        system_instruction: str = "",
        max_tokens: int = 1200,
        temperature: float = 0.2,
        json_mode: bool = False,
        model: Optional[str] = None,
    ) -> AIResponse:
        from time import perf_counter

        started = perf_counter()
        chosen_model = model or self.default_model
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        try:
            import openai
        except Exception as exc:  # pragma: no cover
            return AIResponse(
                fallback=True,
                error=f"openai package unavailable: {exc}",
                model=chosen_model,
                provider=self.name,
            )

        kwargs: dict[str, Any] = dict(
            model=chosen_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            client_kwargs: dict[str, Any] = {"api_key": self.api_key}
            if self.base_url:
                client_kwargs["base_url"] = self.base_url
            client = openai.OpenAI(**client_kwargs)
            resp = client.chat.completions.create(**kwargs)
            text = getattr(resp.choices[0].message, "content", "") or ""
            usage = getattr(resp, "usage", None)
            prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
            completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
            structured: Optional[Any] = None
            if json_mode and text:
                try:
                    structured = json.loads(text)
                except Exception as exc:
                    logger.warning("JSON parse failed: %s", exc)
            return AIResponse(
                text=text,
                structured=structured,
                provider=self.name,
                model=chosen_model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                latency_ms=round((perf_counter() - started) * 1000.0, 2),
                fallback=False,
            )
        except Exception as exc:
            logger.warning("[%s] completion failed: %s", self.name, exc)
            return AIResponse(
                provider=self.name,
                model=chosen_model,
                latency_ms=round((perf_counter() - started) * 1000.0, 2),
                fallback=True,
                error=str(exc),
            )

    @property
    def name(self) -> str:
        # OpenRouter is an OpenAI-compatible proxy but we want distinct audit logs
        if "openrouter" in (self.base_url or "").lower():
            return "openrouter"
        return "openai"


# ---------------------------------------------------------------------------
# Google Gemini
# ---------------------------------------------------------------------------


class GeminiAIProvider:
    """Backend for the official ``google-generativeai`` SDK."""

    name: str = "gemini"

    def __init__(self, config: dict[str, str]) -> None:
        self.config = config
        self.api_key: str = (config.get("api_key") or "").strip()
        self.default_model: str = (
            config.get("default_model") or "gemini-1.5-flash"
        )

    def is_available(self) -> bool:
        if not self.api_key:
            return False
        try:
            import google.generativeai  # noqa: F401

            return True
        except Exception:  # pragma: no cover
            logger.warning(
                "google-generativeai package unavailable; Gemini provider disabled"
            )
            return False

    def complete(
        self,
        prompt: str,
        *,
        system_instruction: str = "",
        max_tokens: int = 1200,
        temperature: float = 0.2,
        json_mode: bool = False,
        model: Optional[str] = None,
    ) -> AIResponse:
        from time import perf_counter

        started = perf_counter()
        chosen_model = model or self.default_model
        try:
            import google.generativeai as genai
        except Exception as exc:  # pragma: no cover
            return AIResponse(
                fallback=True,
                error=f"google-generativeai package unavailable: {exc}",
                provider=self.name,
                model=chosen_model,
            )
        try:
            genai.configure(api_key=self.api_key)
            gen_config: dict[str, Any] = dict(
                temperature=temperature,
                max_output_tokens=max_tokens,
            )
            if json_mode:
                gen_config["response_mime_type"] = "application/json"
            model_kwargs: dict[str, Any] = dict(
                model_name=chosen_model, generation_config=gen_config
            )
            if system_instruction:
                model_kwargs["system_instruction"] = system_instruction
            gem_model = genai.GenerativeModel(**model_kwargs)
            full_prompt = (
                f"{system_instruction}\n\n{prompt}"
                if system_instruction and not model_kwargs.get("system_instruction")
                else prompt
            )
            resp = gem_model.generate_content(full_prompt)
            text = getattr(resp, "text", "") or ""
            structured: Optional[Any] = None
            if json_mode and text:
                try:
                    structured = json.loads(text)
                except Exception as exc:
                    logger.warning("Gemini JSON parse failed: %s", exc)
            usage = getattr(resp, "usage_metadata", None)
            pt = int(getattr(usage, "prompt_token_count", 0) or 0)
            ct = int(getattr(usage, "candidates_token_count", 0) or 0)
            return AIResponse(
                text=text,
                structured=structured,
                provider=self.name,
                model=chosen_model,
                prompt_tokens=pt,
                completion_tokens=ct,
                latency_ms=round((perf_counter() - started) * 1000.0, 2),
                fallback=False,
            )
        except Exception as exc:
            logger.warning("[gemini] completion failed: %s", exc)
            return AIResponse(
                provider=self.name,
                model=chosen_model,
                latency_ms=round((perf_counter() - started) * 1000.0, 2),
                fallback=True,
                error=str(exc),
            )


# ---------------------------------------------------------------------------
# Registry: string → provider instance
# ---------------------------------------------------------------------------


PROVIDER_REGISTRY: dict[str, type] = {
    "noop": NoOpAIProvider,
    "openai": OpenAICompatibleProvider,
    "openrouter": OpenAICompatibleProvider,
    "gemini": GeminiAIProvider,
}
