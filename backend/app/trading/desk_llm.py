"""LLM 'color commentary' for the trading desk.

The deterministic build_desk() owns the FACTS (prices, PnL, stats). This layer
optionally asks an LLM to give each character a short in-character remark on top
of those facts — personality, not new numbers. It is best-effort: if no LLM is
configured (get_llm falls back to the stub) or anything fails, it returns {} and
the desk simply shows the deterministic lines.

Runs on the worker's heavy tick only (never the 20s price tick) to keep token
use low.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.messages import SystemMessage, HumanMessage

from app.core.config import settings
from app.agents.llm import get_llm, _FallbackLLM

log = structlog.get_logger()

_SYSTEM = """คุณเป็นผู้กำกับบทของ "โต๊ะเทรดคริปโต" ที่มีตัวละคร 7 บทบาท
(Trader, Market Analyst, News & Sentiment, Risk Officer, Coach, Model Monitor,
Execution Reviewer).

ภารกิจ: เปลี่ยน "ข้อเท็จจริง" ของแต่ละบทบาทให้เป็นประโยคพูดสั้นๆ ที่มีบุคลิกเฉพาะตัว
เป็นธรรมชาติ ภาษาไทย ไม่เกิน 90 ตัวอักษรต่อบทบาท.

กฎเด็ดขาด:
- ห้ามแต่งตัวเลข/ราคา/สถิติใหม่ ใช้ได้เฉพาะข้อเท็จจริงที่ให้มาเท่านั้น
- ห้ามให้คำแนะนำการลงทุนเฉพาะเจาะจง (เช่น "ซื้อเลย")
- ตอบเป็น JSON object เท่านั้น key = รหัสบทบาท, value = ประโยคพูด
  เช่น {"trader":"...","analyst":"...","news":"...","risk":"...","coach":"...","monitor":"...","exec":"..."}
- ไม่ต้องมีคำอธิบายอื่นนอก JSON"""


def llm_available(provider: str = "auto", model: str = "auto") -> bool:
    """True only when a real LLM provider is configured (not the fallback stub)."""
    if not settings.DESK_LLM_ENABLED:
        return False
    try:
        return not isinstance(get_llm(provider, model), _FallbackLLM)
    except Exception:
        return False


def _parse_json_object(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        # strip ```json ... ``` fences
        inner = text[3:]
        if "```" in inner:
            inner = inner[: inner.index("```")]
        text = inner.lstrip("json").strip()
    i, j = text.find("{"), text.rfind("}")
    if i < 0 or j <= i:
        return {}
    try:
        data = json.loads(text[i : j + 1])
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


async def _one_call(characters: list[dict], provider: str, model: str) -> dict[str, str]:
    """One batched LLM call for a set of characters sharing a provider/model."""
    if not characters or not llm_available(provider, model):
        return {}
    facts = {
        c["key"]: {"name": c.get("name"), "role": c.get("role"), "fact": c.get("message")}
        for c in characters
    }
    user = "ข้อเท็จจริงปัจจุบันของแต่ละบทบาท (รหัส → ข้อมูล):\n" + json.dumps(
        facts, ensure_ascii=False
    )
    try:
        llm = get_llm(provider, model)
        resp = await llm.ainvoke(
            [SystemMessage(content=_SYSTEM), HumanMessage(content=user)]
        )
        content = resp.content if isinstance(resp.content, str) else str(resp.content)
        data = _parse_json_object(content)
        # keep only the roles we asked about (the model sometimes adds others)
        wanted = {c["key"] for c in characters}
        return {
            k: str(v)[:120]
            for k, v in data.items()
            if k in wanted and isinstance(v, str) and v.strip()
        }
    except Exception as e:
        log.warning("desk_llm_failed", provider=provider, model=model, error=str(e))
        return {}


async def enrich_commentary(
    characters: list[dict], role_overrides: dict | None = None
) -> dict[str, str]:
    """Return {role_key: in-character remark}. Best-effort; {} on any problem.

    `role_overrides` = {role_key: {"provider": ..., "model": ...}}. Roles sharing
    the same (provider, model) are batched into one LLM call; roles without an
    override use the default provider/model.
    """
    if not characters:
        return {}
    overrides = role_overrides or {}

    # group characters by their resolved (provider, model)
    groups: dict[tuple[str, str], list[dict]] = {}
    for c in characters:
        ov = overrides.get(c["key"]) or {}
        key = (str(ov.get("provider") or "auto"), str(ov.get("model") or "auto"))
        groups.setdefault(key, []).append(c)

    out: dict[str, str] = {}
    for (provider, model), group in groups.items():
        out.update(await _one_call(group, provider, model))
    return out
