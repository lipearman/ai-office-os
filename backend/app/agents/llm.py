"""LLM provider resolution.

Each agent can pick its own provider + model (Agent.model_provider /
model_name). When an agent leaves it as "auto" (or empty), we fall back to the
configured default provider — self-hosted Ollama by default, so the app runs
with no cloud API key.

Adding a new provider = write a `_build_<name>(model)` that returns a
BaseChatModel (or None if it can't be configured), then register it in
`_BUILDERS` with a sensible default model in `_DEFAULT_MODEL`.
"""
from functools import lru_cache
from typing import Callable

from langchain_core.language_models import BaseChatModel
from app.core.config import settings


# ── provider builders ───────────────────────────────────────────
def _build_openai(model: str) -> BaseChatModel | None:
    if not settings.OPENAI_API_KEY:
        return None
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(model=model, api_key=settings.OPENAI_API_KEY, temperature=0.3, streaming=True)


def _build_anthropic(model: str) -> BaseChatModel | None:
    if not settings.ANTHROPIC_API_KEY:
        return None
    from langchain_anthropic import ChatAnthropic
    return ChatAnthropic(model=model, api_key=settings.ANTHROPIC_API_KEY, temperature=0.3)


def _build_gemini(model: str) -> BaseChatModel | None:
    if not settings.GEMINI_API_KEY:
        return None
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(model=model, google_api_key=settings.GEMINI_API_KEY, temperature=0.3)


def _build_openrouter(model: str) -> BaseChatModel | None:
    if not settings.OPENROUTER_API_KEY:
        return None
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=model, api_key=settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1", temperature=0.3, streaming=True,
    )


def _build_ollama(model: str) -> BaseChatModel | None:
    from langchain_ollama import ChatOllama
    return ChatOllama(model=model, base_url=settings.OLLAMA_BASE_URL, temperature=0.3)


_BUILDERS: dict[str, Callable[[str], BaseChatModel | None]] = {
    "openai": _build_openai,
    "anthropic": _build_anthropic,
    "gemini": _build_gemini,
    "openrouter": _build_openrouter,
    "ollama": _build_ollama,
}

# default model per provider when the agent says "auto"
_DEFAULT_MODEL: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-6",
    "gemini": "gemini-1.5-flash",
    "openrouter": settings.OPENROUTER_MODEL or "meta-llama/llama-3.1-8b-instruct:free",
    "ollama": settings.DEFAULT_LLM_MODEL or "qwen2.5:7b-instruct",
}


def _resolve_model(provider: str, model: str) -> str:
    if model and model.lower() != "auto":
        return model
    return _DEFAULT_MODEL.get(provider, settings.DEFAULT_LLM_MODEL)


@lru_cache(maxsize=16)
def get_llm(provider: str = "auto", model: str = "auto") -> BaseChatModel:
    """Resolve an LLM for the given provider/model.

    - provider "auto"/empty → settings.DEFAULT_LLM_PROVIDER (Ollama by default)
    - if the requested provider can't be built (e.g. missing API key), fall back
      to the default provider, then to a stub that explains what to configure.
    """
    prov = (provider or "auto").strip().lower()
    if prov in ("auto", ""):
        prov = settings.DEFAULT_LLM_PROVIDER

    builder = _BUILDERS.get(prov)
    if builder is not None:
        try:
            llm = builder(_resolve_model(prov, model))
            if llm is not None:
                return llm
        except Exception:
            pass

    # requested provider unavailable → try the configured default provider
    default_prov = settings.DEFAULT_LLM_PROVIDER
    if prov != default_prov:
        default_builder = _BUILDERS.get(default_prov)
        if default_builder is not None:
            try:
                llm = default_builder(_resolve_model(default_prov, "auto"))
                if llm is not None:
                    return llm
            except Exception:
                pass

    return _FallbackLLM()


class _FallbackLLM(BaseChatModel):
    """Stub LLM when no provider is configured."""

    @property
    def _llm_type(self) -> str:
        return "fallback"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        from langchain_core.outputs import ChatGeneration, ChatResult
        from langchain_core.messages import AIMessage
        reply = "No LLM provider configured. Please add OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, or start Ollama in your .env file."
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=reply))])

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        return self._generate(messages, stop, run_manager, **kwargs)
