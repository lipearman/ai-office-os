"""Tests for the LLM provider registry / resolver."""
from app.agents import llm as L
from app.core.config import settings


def test_available_providers_includes_registry():
    provs = L.available_providers()
    assert provs[0] == "auto"
    for p in ("ollama", "openai", "anthropic", "gemini", "openrouter"):
        assert p in provs


def test_resolve_model_explicit_wins():
    assert L._resolve_model("openai", "gpt-4o") == "gpt-4o"
    assert L._resolve_model("anthropic", "claude-x") == "claude-x"


def test_resolve_model_auto_uses_provider_default():
    assert L._resolve_model("ollama", "auto") == settings.DEFAULT_LLM_MODEL
    assert L._resolve_model("openai", "auto") == L._DEFAULT_MODEL["openai"]


def test_build_cloud_returns_none_without_key(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    assert L._build_openai("gpt-4o-mini") is None
    assert L._build_anthropic("claude-sonnet-4-6") is None


def test_build_ollama_constructs_chatollama():
    m = L._build_ollama("qwen2.5:7b-instruct")
    assert m is not None
    assert m.model == "qwen2.5:7b-instruct"


def test_get_llm_auto_resolves_to_default_provider():
    L.get_llm.cache_clear()
    llm = L.get_llm("auto", "auto")
    assert type(llm).__name__ == "ChatOllama"  # DEFAULT_LLM_PROVIDER=ollama
    assert not isinstance(llm, L._FallbackLLM)


def test_get_llm_unknown_provider_falls_back(monkeypatch):
    L.get_llm.cache_clear()
    llm = L.get_llm("does-not-exist", "auto")
    # falls back to the default provider rather than crashing
    assert type(llm).__name__ == "ChatOllama"


def test_get_llm_cloud_without_key_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    L.get_llm.cache_clear()
    llm = L.get_llm("openai", "auto")
    assert not isinstance(llm, L._FallbackLLM)
