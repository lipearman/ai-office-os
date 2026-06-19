"""Tests for desk LLM commentary parsing + per-role grouping."""
import pytest

from app.trading import desk_llm
from app.core.config import settings


def test_parse_plain_json():
    d = desk_llm._parse_json_object('{"trader":"a","risk":"b"}')
    assert d == {"trader": "a", "risk": "b"}


def test_parse_fenced_json():
    d = desk_llm._parse_json_object('```json\n{"x":"y"}\n```')
    assert d == {"x": "y"}


def test_parse_json_with_prose_around():
    d = desk_llm._parse_json_object('sure! {"a":"1"} done')
    assert d == {"a": "1"}


def test_parse_garbage_returns_empty():
    assert desk_llm._parse_json_object("not json at all") == {}
    assert desk_llm._parse_json_object("") == {}


async def test_enrich_disabled_returns_empty(monkeypatch):
    monkeypatch.setattr(settings, "DESK_LLM_ENABLED", False)
    chars = [{"key": "trader", "name": "T", "role": "engine", "message": "x"}]
    assert await desk_llm.enrich_commentary(chars) == {}


async def test_enrich_groups_by_provider_model(monkeypatch):
    calls: list[tuple[str, str, list[str]]] = []

    async def fake_one_call(characters, provider, model):
        calls.append((provider, model, sorted(c["key"] for c in characters)))
        return {c["key"]: f"{provider}:{model}" for c in characters}

    monkeypatch.setattr(desk_llm, "_one_call", fake_one_call)

    chars = [
        {"key": "trader", "message": "a"},
        {"key": "analyst", "message": "b"},
        {"key": "news", "message": "c"},
    ]
    overrides = {"news": {"provider": "ollama", "model": "qwen2.5:14b-instruct"}}
    out = await desk_llm.enrich_commentary(chars, overrides)

    # two groups: default (auto/auto) for trader+analyst, custom for news
    assert len(calls) == 2
    assert out["news"] == "ollama:qwen2.5:14b-instruct"
    assert out["trader"] == "auto:auto"
    assert set(out) == {"trader", "analyst", "news"}


async def test_one_call_filters_to_requested_keys(monkeypatch):
    # model returns an extra role we didn't ask about → must be dropped
    class _Resp:
        content = '{"trader":"ok","ghost":"nope"}'

    class _LLM:
        async def ainvoke(self, _msgs):
            return _Resp()

    monkeypatch.setattr(desk_llm, "llm_available", lambda *a, **k: True)
    monkeypatch.setattr(desk_llm, "get_llm", lambda *a, **k: _LLM())

    out = await desk_llm._one_call([{"key": "trader", "message": "x"}], "auto", "auto")
    assert out == {"trader": "ok"}
