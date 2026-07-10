"""Shared 'ask the desk' brain — used by BOTH the /trading chat endpoint and the
Telegram bot, so a question gets the same 7-persona answer wherever it's asked.

Read-only: it reads the latest snapshot + live data and asks the LLM. It never
changes state (no trading, no tuning) — that stays behind the web login.
"""
from __future__ import annotations

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()

CHAT_SYSTEM = """คุณคือทีมวิเคราะห์การเทรดคริปโตที่มีสมาชิก 7 คน:
- 📊 Market Analyst: วิเคราะห์แนวโน้มตลาด แนวรับแนวต้าน
- 📰 News & Sentiment: วิเคราะห์ข่าวและ sentiment
- 🤖 Trader: วิเคราะห์จุดเข้าซื้อ/ขาย
- 🛡️ Risk Officer: ประเมินความเสี่ยง
- 🎯 Coach: ให้คำแนะนำเชิงกลยุทธ์
- 📉 Model Monitor: วิเคราะห์โอกาสเหรียญ
- 🔍 Execution Reviewer: ตรวจสอบประสิทธิภาพ

เมื่อมีคำถามจากผู้ใช้ ให้ทุกคนช่วยกันตอบโดยใช้ข้อมูลที่มี แต่ละคนแสดงความเห็นตามบทบาทของตน
ตอบสั้น กระชับ เป็นธรรมชาติ ภาษาไทย. นี่คือเกมจำลอง ไม่ใช่คำแนะนำการลงทุนจริง"""


def build_context(snap) -> str:
    """Plain-text context from a desk snapshot (prices, moves, opps, news, stats,
    the 7 members' current lines). Pure over the snapshot object."""
    meta = snap.meta or {}
    lines = ["ข้อมูลล่าสุดจาก Pipeline:"]
    prices = meta.get("prices", {})
    if prices:
        lines.append("ราคา:")
        for sym, p in sorted(prices.items()):
            lines.append(f"  {sym}: {p:,.2f}")
    ticker = meta.get("ticker", {})
    if ticker:
        lines.append("เปลี่ยนแปลง 24ชม:")
        for sym, t in sorted(ticker.items()):
            chg = t.get("c", 0)
            lines.append(f"  {sym}: {'+' if chg >= 0 else ''}{chg:.2f}%")
    opps = meta.get("opps", [])
    if opps:
        lines.append("โอกาสวันนี้ (บนสุด):")
        for o in opps[:6]:
            lines.append(f"  {o.get('symbol','?')}: {o.get('strategy','?')} "
                         f"win={o.get('win_chance_pct')}% ml={o.get('ml_prob')} "
                         f"sig={o.get('signal_today')}")
    if meta.get("breadth") is not None:
        lines.append(f"ตลาด: breadth {meta['breadth']*100:.0f}% เขียว, "
                     f"early_turn={meta.get('early_turn')}")
    news = meta.get("news_agg", {})
    for a in (news.get("assets") or [])[:3]:
        lines.append(f"ข่าว {a.get('asset','?')}: bullish={a.get('bullish',0)} "
                     f"bearish={a.get('bearish',0)}")
    stats = meta.get("stats", {})
    if stats:
        lines.append(f"สถิติ paper: win={stats.get('win_rate',0):.1f}% "
                     f"PnL={stats.get('total_pnl_thb',0):,.0f}฿ "
                     f"trades={stats.get('total_trades',0)}")
    lines.append("ข้อเท็จจริงของสมาชิก:")
    for c in (snap.characters or []):
        if c.get("message"):
            lines.append(f"  {c.get('name', c.get('key','?'))}: {c['message']}")
    return "\n".join(lines)


async def answer(db: AsyncSession, workspace_id, message: str) -> str:
    """Answer a free-text question about the desk. Read-only, best-effort."""
    from langchain_core.messages import SystemMessage, HumanMessage
    from app.agents.llm import get_llm
    from app.trading.desk_store import get_snapshot

    snap = await get_snapshot(db, workspace_id)
    if snap is None:
        return "ยังไม่มีข้อมูลโต๊ะเทรด (worker กำลังเริ่มประมวลผล) — ลองใหม่อีกสักครู่"
    context = build_context(snap)
    try:
        llm = get_llm()
        resp = await llm.ainvoke([
            SystemMessage(content=CHAT_SYSTEM),
            HumanMessage(content=f"ข้อมูล Pipeline:\n{context}\n\nคำถามผู้ใช้:\n{message}"),
        ])
        return resp.content if isinstance(resp.content, str) else str(resp.content)
    except Exception as e:
        return f"ขออภัย ตอบไม่ได้ตอนนี้: {e}"
