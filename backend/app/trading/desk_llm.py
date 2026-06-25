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

import asyncio
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
        resp = await asyncio.wait_for(
            llm.ainvoke([SystemMessage(content=_SYSTEM), HumanMessage(content=user)]),
            timeout=settings.LLM_TIMEOUT_SECONDS,
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


_MEETING_PROMPT = """คุณเป็นผู้กำกับบทของโต๊ะเทรดคริปโตที่กำลังจัด "ประชุมหลัง Pipeline" 

ตัวละคร: Trader, Market Analyst, News & Sentiment, Risk Officer, Coach, Model Monitor, Execution Reviewer

หน้าที่: ให้แต่ละบทบาทวิเคราะห์สถานการณ์ตลาดปัจจุบันโดยใช้ข้อมูลจริงที่ให้มา 
- Trader: วิเคราะห์จุดเข้า/ออกที่เป็นไปได้จากราคาล่าสุด
- Market Analyst: วิเคราะห์แนวโน้มตลาดและแนวรับแนวต้าน
- News & Sentiment: สรุปข่าวเด่นและ sentiment
- Risk Officer: ประเมินความเสี่ยงพอร์ต
- Coach: ให้คำแนะนำเชิงกลยุทธ์
- Model Monitor: สรุปเหรียญเด่นวันนี้
- Execution Reviewer: ตรวจสอบผลงานที่ผ่านมา

กฏ:
- ใช้เฉพาะข้อมูลที่มีให้เท่านั้น ห้ามแต่งตัวเลข
- ภาษาไทยเท่านั้น เป็นธรรมชาติ สั้น กระชับ
- ตอบเป็น JSON object: {{"role_key":"ข้อความ", ...}}
- ข้อความละ 2-3 ประโยค ไม่เกิน 300 ตัวอักษร
- role_key: trader, analyst, news, risk, coach, monitor, exec"""


async def meeting_commentary(
    characters: list[dict],
    meta: dict | None = None,
    role_overrides: dict | None = None,
) -> dict[str, str]:
    """Generate multi-sentence meeting commentary per agent using full market context.

    `meta` should contain: prices, ticker, news_agg, stats, opps, etc.
    """
    if not characters:
        return {}
    if not llm_available():
        return {}

    # build context from meta
    ctx_lines = []
    meta = meta or {}
    prices = meta.get("prices", {})
    if prices:
        ctx_lines.append("ราคาล่าสุด:")
        for sym, p in sorted(prices.items()):
            ctx_lines.append(f"  {sym}: {p:,.2f}")

    ticker = meta.get("ticker", {})
    if ticker:
        ctx_lines.append("การเปลี่ยนแปลง:")
        for sym, t in sorted(ticker.items()):
            chg = t.get("c", 0)
            ctx_lines.append(f"  {sym}: {'+' if chg >= 0 else ''}{chg:.2f}%")
            cls = t.get("closes")
            if cls:
                ctx_lines.append(f"    ช่วง: {min(cls):,.2f} - {max(cls):,.2f} ({len(cls)} periods)")

    opps = meta.get("opps", [])
    if opps:
        ctx_lines.append("\nโอกาสวันนี้:")
        for o in opps[:5]:
            ctx_lines.append(f"  {o.get('symbol', '?')}: {o.get('strategy', '?')} win={o.get('win_chance_pct', 0)}%")

    news = meta.get("news_agg", {})
    assets = news.get("assets", [])
    if assets:
        ctx_lines.append("\nSentiment ข่าว:")
        for a in assets[:3]:
            ctx_lines.append(f"  {a.get('asset', '?')}: bullish={a.get('bullish', 0)} bearish={a.get('bearish', 0)}")

    stats = meta.get("stats", {})
    if stats:
        ctx_lines.append(f"\nสถิติเทรด: win={stats.get('win_rate', 0):.1f}% | "
                         f"profit={stats.get('total_pnl_thb', 0):,.0f} THB | "
                         f"trades={stats.get('total_trades', 0)}")

    context_text = "\n".join(ctx_lines) if ctx_lines else "ไม่มีข้อมูลตลาดเพิ่มเติม"

    overrides = role_overrides or {}
    groups: dict[tuple[str, str], list[dict]] = {}
    for c in characters:
        ov = overrides.get(c["key"]) or {}
        key = (str(ov.get("provider") or "auto"), str(ov.get("model") or "auto"))
        groups.setdefault(key, []).append(c)

    facts = {
        c["key"]: {"name": c.get("name"), "role": c.get("role"), "fact": c.get("message")}
        for c in characters
    }

    user = (
        f"ข้อมูลตลาดปัจจุบัน:\n{context_text}\n\n"
        f"ข้อเท็จจริงของแต่ละบทบาท:\n{json.dumps(facts, ensure_ascii=False)}"
    )

    out: dict[str, str] = {}
    for (provider, model), group in groups.items():
        if not group:
            continue
        wanted = {c["key"] for c in group}
        try:
            llm = get_llm(provider, model)
            resp = await asyncio.wait_for(
                llm.ainvoke([SystemMessage(content=_MEETING_PROMPT), HumanMessage(content=user)]),
                timeout=settings.LLM_TIMEOUT_SECONDS,
            )
            content = resp.content if isinstance(resp.content, str) else str(resp.content)
            data = _parse_json_object(content)
            for k, v in data.items():
                if k in wanted and isinstance(v, str) and v.strip():
                    out[k] = str(v)[:320]
        except Exception as e:
            log.warning("meeting_llm_failed", provider=provider, model=model, error=str(e))
    return out
