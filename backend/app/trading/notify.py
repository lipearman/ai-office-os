"""Telegram notifications — tiered, deduped, best-effort.

Design rule: notify by "does the user need to act?", not by data volume.
- tier 1  trades: entry timing, opens/closes, breakeven locks   (always sends)
- tier 2  watch: radar adds, near-miss signals, regime flips    (quiet-hours muted)
- tier 3  intel: strong news, delistings, new markets           (quiet-hours muted)
- tier 4  system: coach tuning, health, night digest            (quiet-hours muted)

Every send is best-effort: Telegram being down must never break a worker tick.
Dedupe lives in Redis so repeated ticks can call notify freely — the same event
key sends at most once per TTL. CHAT_ID is auto-discovered from getUpdates
(after the user presses Start) and cached, so the only required config is the
bot token.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import structlog

from app.core.config import settings
from app.core.redis import get_redis

log = structlog.get_logger()

API = "https://api.telegram.org/bot{token}/{method}"
CHAT_KEY = "notify:chat_id"
DEDUPE_KEY = "notify:dedupe:{key}"
BKK = timezone(timedelta(hours=7))          # Asia/Bangkok — the user's clock


def _enabled_tiers() -> set[int]:
    try:
        return {int(x) for x in settings.NOTIFY_TIERS.split(",") if x.strip()}
    except Exception:
        return {1, 2, 3, 4}


def in_quiet_hours(now_hour_bkk: int, start: int, end: int) -> bool:
    """Pure so it's testable. Window may wrap midnight (e.g. 22 -> 8)."""
    if start == end:
        return False
    if start < end:
        return start <= now_hour_bkk < end
    return now_hour_bkk >= start or now_hour_bkk < end


def should_send(tier: int, now_hour_bkk: int | None = None) -> bool:
    """Tier gating + quiet hours (tier 1 always passes the quiet window)."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return False
    if tier not in _enabled_tiers():
        return False
    if tier == 1:
        return True
    h = datetime.now(BKK).hour if now_hour_bkk is None else now_hour_bkk
    return not in_quiet_hours(h, settings.NOTIFY_QUIET_START_HOUR,
                              settings.NOTIFY_QUIET_END_HOUR)


async def _chat_id() -> str | None:
    """Configured chat id, else auto-discover from getUpdates and cache it."""
    if settings.TELEGRAM_CHAT_ID:
        return settings.TELEGRAM_CHAT_ID
    r = None
    try:
        r = await get_redis()
        cached = await r.get(CHAT_KEY)
        if cached:
            return cached.decode() if isinstance(cached, bytes) else str(cached)
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            resp = await c.get(API.format(token=settings.TELEGRAM_BOT_TOKEN,
                                          method="getUpdates"))
            for u in resp.json().get("result", []):
                chat = (u.get("message") or {}).get("chat") or {}
                if chat.get("type") == "private" and chat.get("id"):
                    cid = str(chat["id"])
                    if r is not None:
                        try:
                            await r.set(CHAT_KEY, cid)
                        except Exception:
                            pass
                    return cid
    except Exception as e:
        log.warning("notify.chat_discovery_failed", error=str(e))
    return None


async def send(text: str, tier: int = 1, dedupe_key: str | None = None,
               dedupe_ttl: int = 86400) -> bool:
    """Push one message. Returns True only when actually delivered."""
    try:
        if not should_send(tier):
            return False
        if dedupe_key:
            try:
                r = await get_redis()
                if not await r.set(DEDUPE_KEY.format(key=dedupe_key), "1",
                                   nx=True, ex=dedupe_ttl):
                    return False
            except Exception:
                pass                        # no Redis -> send anyway (better twice than never)
        cid = await _chat_id()
        if not cid:
            log.warning("notify.no_chat_id")
            return False
        async with httpx.AsyncClient(timeout=8) as c:
            resp = await c.post(
                API.format(token=settings.TELEGRAM_BOT_TOKEN, method="sendMessage"),
                json={"chat_id": cid, "text": text[:4000],
                      "disable_web_page_preview": True},
            )
            ok = bool(resp.json().get("ok"))
            if not ok:
                log.warning("notify.send_rejected", body=resp.text[:200])
            return ok
    except Exception as e:                  # never let Telegram break a tick
        log.warning("notify.send_failed", error=str(e))
        return False


# ── message builders (pure — unit-testable) ─────────────────────

def fmt_entry(o: dict, opened_thb: float | None = None) -> str:
    plan = o.get("plan") or {}
    px = o.get("price")
    stop, target = plan.get("stop"), plan.get("target")
    rr = None
    if px and stop and target and px > stop:
        rr = round((target - px) / (px - stop), 1)
    lines = [f"🟢 จังหวะเข้า — {o.get('symbol')}",
             f"ราคา {px} | ทำนายชนะ {o.get('win_chance_pct')}% | "
             f"ML {o.get('ml_prob')} | ตลาด {o.get('market_bias') or '-'}"]
    if stop and target:
        lines.append(f"แผน: stop {stop} → เป้า {target}" + (f" | RR {rr}" if rr else ""))
    if opened_thb:
        lines.append(f"🤖 ระบบเปิด paper ให้แล้ว {opened_thb:,.0f}฿")
    return "\n".join(lines)


def fmt_close(symbol: str, reason: str, pnl_thb: float, pnl_pct: float,
              exit_price: float) -> str:
    why = {"target": "ถึงเป้า 🎯", "stop": "โดน stop", "breakeven": "ปิดที่ทุน (ล็อกไว้แล้ว)",
           "max_loss": "หลุด catastrophe stop", "time": "หมดเวลา (time stop)"}.get(reason, reason)
    head = "🟢 ปิดไม้ กำไร" if pnl_thb > 0 else ("⚪ ปิดไม้ เท่าทุน" if pnl_thb == 0 else "🔴 ปิดไม้ ขาดทุน")
    return (f"{head} — {symbol}\n{why} @ {exit_price}\n"
            f"PnL {pnl_thb:+,.2f}฿ ({pnl_pct:+.2f}%)")


def fmt_breakeven(symbol: str, new_stop: float) -> str:
    return (f"🛡️ ล็อกทุน — {symbol}\n"
            f"ราคาวิ่ง +1R แล้ว เลื่อน stop มาที่ {new_stop} — ไม้นี้แพ้ไม่ได้อีกแล้ว")


def fmt_radar(symbol: str, ml_prob: float, chg24: float | None = None) -> str:
    lines = [f"🟡 เข้าเรดาร์ — {symbol}",
             f"ML เห็นโอกาสขึ้น {ml_prob:.0%} (ยังไม่มีสัญญาณเข้า — จับตา)"]
    if chg24 is not None:
        warn = " ⚠️ วิ่งมาแล้ว — อย่าไล่ราคา" if chg24 >= settings.RADAR_WARN_24H_CHG else ""
        lines.append(f"ราคา 24 ชม.: {chg24:+.1f}%{warn}")
    return "\n".join(lines)


def fmt_regime(old: str, new: str) -> str:
    arrow = {"bearish": "🐻", "bullish": "🐂", "neutral": "😐"}
    return (f"{arrow.get(new, '❓')} ตลาดเปลี่ยนทิศ: {old} → {new}\n"
            + ("เกมเปิดฝั่ง long ได้แล้ว — จับตาสัญญาณเข้า" if new == "bullish"
               else "ระวังตัว — เกณฑ์เข้าจะเข้มขึ้นอัตโนมัติ" if new == "bearish"
               else "รอความชัดเจน"))


def fmt_news(asset: str, sentiment: float, label: str, count: int, headline: str) -> str:
    ico = "🟢" if sentiment > 0 else "🔴"
    return (f"📰 ข่าวแรง {ico} {asset} ({label}, {count} ชิ้น)\n{headline}")


def fmt_early_turn(breadth_pct: int, news_sent: float) -> str:
    return (f"🌅 สัญญาณกลับตัวระยะแรก\n"
            f"ตลาดเขียวต่อเนื่อง ~{breadth_pct}% ของกระดาน + ข่าวโทนบวก ({news_sent:+.2f}) "
            f"ทั้งที่โครงสร้างยังหมี\n"
            f"ระบบผ่อนเกณฑ์พิเศษหมีลงครึ่งหนึ่ง (เกณฑ์หลักคงเดิม) — จับตาสัญญาณเข้า")
