"""Two-way Telegram: long-poll incoming messages and reply. READ-ONLY.

The bot answers questions (via the shared desk_chat brain) and a few fast
slash-commands built straight from the snapshot/DB. It can NEVER change state —
pausing trading or tuning stays behind the web login, because a chat message is
weaker auth than a session. Runs only while TELEGRAM_BOT_TOKEN is set.
"""
from __future__ import annotations

import asyncio

import httpx
import structlog
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.trading_state import DeskSnapshot
from app.models.paper import PaperTrade
from app.trading import notify

log = structlog.get_logger()

API = "https://api.telegram.org/bot{token}/{method}"
_task: asyncio.Task | None = None

HELP = ("🤖 ถามอะไรก็ได้เกี่ยวกับตลาด/เกม แล้วทีมวิเคราะห์จะตอบ\n"
        "หรือใช้คำสั่งลัด:\n"
        "/status — ไม้ที่เปิดอยู่ + PnL\n"
        "/watch — เหรียญบนเรดาร์ (ML ชอบ)\n"
        "/tunings — เกณฑ์ที่ใช้อยู่ตอนนี้\n"
        "/help — เมนูนี้\n\n"
        "ℹ️ อ่านอย่างเดียว — สั่งเทรด/ปรับค่าต้องทำผ่านหน้าเว็บ")


async def _latest_workspace(db) -> object | None:
    res = await db.execute(
        select(DeskSnapshot.workspace_id).order_by(DeskSnapshot.computed_at.desc()).limit(1)
    )
    row = res.first()
    return row[0] if row else None


async def _cmd_status(db, ws) -> str:
    res = await db.execute(select(PaperTrade).where(
        PaperTrade.workspace_id == ws, PaperTrade.status == "OPEN"))
    opens = list(res.scalars().all())
    cres = await db.execute(select(PaperTrade).where(
        PaperTrade.workspace_id == ws, PaperTrade.status == "CLOSED"))
    closed = list(cres.scalars().all())
    pnl = sum(t.pnl_thb or 0 for t in closed)
    wins = sum(1 for t in closed if (t.pnl_thb or 0) > 0)
    lines = [f"💼 ไม้เปิดอยู่: {len(opens)}"]
    for t in opens:
        lines.append(f"  {t.symbol} @ {t.entry_price} (stop {t.stop} / target {t.target})")
    lines.append(f"📊 ปิดแล้ว {len(closed)} ไม้ · ชนะ "
                 f"{round(wins/len(closed)*100) if closed else 0}% · PnL รวม {pnl:+.2f}฿")
    return "\n".join(lines)


async def _cmd_watch(db, ws) -> str:
    from app.trading.desk_store import get_snapshot
    from app.trading import tuning
    snap = await get_snapshot(db, ws)
    if not snap or not snap.meta:
        return "ยังไม่มีข้อมูล"
    floor = (await tuning.get_params(db))["ML_VOTE_MIN_PROB"]
    opps = snap.meta.get("opps") or []
    watch = sorted(((o.get("symbol"), o.get("ml_prob")) for o in opps
                    if not o.get("signal_today") and (o.get("ml_prob") or 0) >= floor),
                   key=lambda x: -(x[1] or 0))[:6]
    if not watch:
        return f"🟡 ยังไม่มีเหรียญเหนือเกณฑ์ ML ({floor:.0%}) — ตลาดยังไม่ให้จังหวะ"
    return "🟡 บนเรดาร์ (ML ชอบ ยังไม่มีสัญญาณเข้า):\n" + "\n".join(
        f"  {s}: {p:.0%}" for s, p in watch)


async def _cmd_tunings(db) -> str:
    from app.trading import tuning
    p = await tuning.get_params(db)
    keys = ["AUTO_PAPER_ENABLED", "AUTO_PAPER_MIN_WIN_PCT", "ML_VOTE_MIN_PROB",
            "AUTO_PAPER_BEARISH_WIN_EXTRA", "DESK_SCAN_TIMEFRAME"]
    lines = ["⚙️ เกณฑ์ที่ใช้อยู่:"]
    for k in keys:
        lines.append(f"  {k.replace('AUTO_PAPER_','').replace('ML_VOTE_','ML_')}: {p.get(k)}")
    return "\n".join(lines)


async def _handle(text: str) -> str:
    cmd = text.strip().lower()
    async with AsyncSessionLocal() as db:
        ws = await _latest_workspace(db)
        if ws is None:
            return "ยังไม่มี workspace ที่มีข้อมูล"
        if cmd in ("/help", "/start"):
            return HELP
        if cmd.startswith("/status"):
            return await _cmd_status(db, ws)
        if cmd.startswith("/watch"):
            return await _cmd_watch(db, ws)
        if cmd.startswith("/tunings") or cmd.startswith("/tuning"):
            return await _cmd_tunings(db)
        if cmd.startswith("/"):
            return "ไม่รู้จักคำสั่งนี้\n\n" + HELP
        from app.trading import desk_chat
        return await desk_chat.answer(db, ws, text)


async def _reply(chat_id: str, text: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(API.format(token=settings.TELEGRAM_BOT_TOKEN, method="sendMessage"),
                         json={"chat_id": chat_id, "text": text[:4000],
                               "disable_web_page_preview": True})
    except Exception as e:
        log.warning("tg_bot.reply_failed", error=str(e))


async def _poll() -> None:
    offset = None
    # only serve the owner's chat (the id notify already discovered/cached)
    allowed = None
    try:
        allowed = await notify._chat_id()
    except Exception:
        pass
    log.info("tg_bot.started", allowed_chat=allowed)
    while True:
        try:
            async with httpx.AsyncClient(timeout=40) as c:
                r = await c.get(
                    API.format(token=settings.TELEGRAM_BOT_TOKEN, method="getUpdates"),
                    params={"timeout": 30, **({"offset": offset} if offset else {})},
                )
                for u in r.json().get("result", []):
                    offset = u["update_id"] + 1
                    msg = u.get("message") or {}
                    chat_id = str((msg.get("chat") or {}).get("id") or "")
                    text = (msg.get("text") or "").strip()
                    if not text or not chat_id:
                        continue
                    if allowed and chat_id != str(allowed):
                        continue                      # ignore strangers
                    log.info("tg_bot.msg", text=text[:60])
                    await _reply(chat_id, await _handle(text))
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("tg_bot.poll_error", error=str(e))
            await asyncio.sleep(5)


def start_bot() -> None:
    global _task
    if _task is None and settings.TELEGRAM_BOT_TOKEN:
        _task = asyncio.create_task(_poll())


async def stop_bot() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        try:
            await _task
        except Exception:
            pass
        _task = None
