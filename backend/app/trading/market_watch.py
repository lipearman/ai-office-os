"""Market watcher — the maintenance jobs a human (or Claude) used to do by hand.

Two responsibilities, both alert-driven so the user SEES what changed:

1. symbols diff (daily): Bitkub's /api/market/symbols is the authoritative list
   of tradeable markets. A market that vanishes from it = delisted (that is how
   SYND_THB actually left — no announcement API exists, the support site is a
   JS-only Salesforce app). Vanished symbols are auto-added to the DB-backed
   scan_exclusions denylist and alerted; brand-new markets are alerted as info.

2. health check (frequent): desk snapshot stale / ML vote cache empty while the
   feature is on — the silent failure modes that previously froze the desk for
   days before anyone noticed. Deduped so an unresolved problem alerts once a
   day, not every tick.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis
from app.models.trading_state import DeskSnapshot, ScanExclusion, TradingAlert
from app.trading.bitkub import BitkubClient, to_tradingview_symbol

log = structlog.get_logger()

SYMBOLS_PREV_KEY = "market:symbols:known"     # Redis set of known tradingview symbols
HEALTH_KIND = "_HEALTH"                       # TradingAlert.symbol marker for health alerts
VOL7D_KEY = "desk:vol7d"                      # Redis hash: symbol -> median 7d baht volume


def median(vals: list[float]) -> float | None:
    """Plain median (pure). None on empty input."""
    if not vals:
        return None
    s = sorted(vals)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def is_pump(chg24: float | None, vol_ratio: float | None,
            min_chg: float, min_ratio: float) -> bool:
    """Pump heuristic (pure): price already ran hard AND volume is a multiple of
    the coin's own 7-day median — the classic ignition signature. Both parts
    required: a rally on normal volume is just a rally, and a volume spike
    without price movement is accumulation/news, not a chase trap."""
    if chg24 is None or vol_ratio is None:
        return False
    return chg24 >= min_chg and vol_ratio >= min_ratio


def diff_symbols(known: set[str], current: set[str]) -> tuple[set[str], set[str]]:
    """(vanished, appeared) between the last known and current market lists.

    Pure so it's unit-testable. An empty `known` set means first run — nothing
    vanished, nothing appeared (we just baseline).
    """
    if not known:
        return set(), set()
    return known - current, current - known


async def _current_market_symbols() -> set[str]:
    """Official Bitkub market list as tradingview symbols (BASE_THB)."""
    res = await BitkubClient().list_symbols()
    out: set[str] = set()
    for rec in res or []:
        sym = rec.get("symbol") if isinstance(rec, dict) else None
        if not sym:
            continue
        try:
            tv = to_tradingview_symbol(sym)
        except Exception:
            continue
        if tv.endswith("_THB"):
            out.add(tv.upper())
    return out


async def db_exclusions(db: AsyncSession) -> set[str]:
    """All DB-backed exclusions (uppercased). Cheap: tiny table, indexed."""
    res = await db.execute(select(ScanExclusion.symbol))
    return {row[0].upper() for row in res.all()}


async def _alert_all_workspaces(db: AsyncSession, symbol: str, text: str) -> None:
    res = await db.execute(select(DeskSnapshot.workspace_id))
    for (ws,) in res.all():
        db.add(TradingAlert(workspace_id=ws, symbol=symbol[:30], text=text[:300]))


async def _recent_alert_exists(db: AsyncSession, symbol: str, within_hours: int = 24) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=within_hours)
    res = await db.execute(
        select(TradingAlert.id).where(
            TradingAlert.symbol == symbol[:30],
            TradingAlert.created_at >= cutoff,
        ).limit(1)
    )
    return res.first() is not None


async def sync_market_symbols(db: AsyncSession) -> dict:
    """Daily: diff Bitkub's official market list against the last known one.

    Vanished market → add to scan_exclusions (source=symbols_diff) + alert.
    New market → info alert (a fresh coin the scan may start surfacing).
    First run just baselines. Returns a small report dict (also used by tests
    of the calling path and the manual trigger endpoint).
    """
    current = await _current_market_symbols()
    if not current:            # API hiccup — never treat as "everything vanished"
        return {"status": "skipped", "reason": "empty symbols response"}
    r = await get_redis()
    known = {s.decode() if isinstance(s, bytes) else s
             for s in await r.smembers(SYMBOLS_PREV_KEY)}
    vanished, appeared = diff_symbols(known, current)

    from app.trading import notify
    excluded_now = await db_exclusions(db)
    for sym in sorted(vanished):
        if sym not in excluded_now:
            db.add(ScanExclusion(
                symbol=sym, source="symbols_diff",
                reason="หายจากรายชื่อตลาด Bitkub (คาดว่าถูก delist)",
            ))
        if not await _recent_alert_exists(db, sym):
            text = (f"⚠️ {sym} หายจากรายชื่อตลาด Bitkub — คาดว่าถูก delist "
                    f"(ตัดออกจากการสแกนให้แล้ว ถ้าถือจริงต้องรีบจัดการ)")
            await _alert_all_workspaces(db, sym, text)
            await notify.send(text, tier=3, dedupe_key=f"delist:{sym}")
    for sym in sorted(appeared):
        if not await _recent_alert_exists(db, sym):
            text = f"🆕 {sym} เป็นตลาดใหม่บน Bitkub — เริ่มเข้ารอบสแกนได้"
            await _alert_all_workspaces(db, sym, text)
            await notify.send(text, tier=3, dedupe_key=f"newmarket:{sym}")

    await r.delete(SYMBOLS_PREV_KEY)
    await r.sadd(SYMBOLS_PREV_KEY, *current)
    await db.commit()
    report = {"status": "ok", "markets": len(current),
              "vanished": sorted(vanished), "appeared": sorted(appeared),
              "baselined": not known}
    log.info("market_watch.symbols_synced", **report)
    return report


async def refresh_volume_baseline() -> int:
    """Daily: median 7-day baht volume per THB market → Redis (TTL 3 days).

    This is the anti-manipulation baseline: discovery ranks by SUSTAINED volume
    (a one-day pump can't fake 7 days of median), and the pump detector compares
    today's volume against each coin's own normal. A coin with no baseline yet
    (new/unranked) simply waits a day — the new-market alert covers the gap."""
    client = BitkubClient()
    try:
        ticker = await client.ticker()
        if not isinstance(ticker, dict):
            return 0
        # candidate pool: top ~50 THB pairs by 24h quote volume
        pool: list[tuple[str, float]] = []
        for mk, rec in ticker.items():
            if not (isinstance(mk, str) and mk.startswith("THB_") and isinstance(rec, dict)):
                continue
            try:
                tv = to_tradingview_symbol(mk)
                vol = float(rec.get("quoteVolume") or 0)
            except Exception:
                continue
            pool.append((tv, vol))
        pool.sort(key=lambda x: -x[1])
        pool = pool[:50]
    except Exception as e:
        log.warning("vol_baseline.pool_failed", error=str(e))
        return 0

    out: dict[str, str] = {}
    for tv, _ in pool:
        try:
            candles = await client.fetch_ohlcv(tv, "1D", limit=9)
            days = candles[:-1][-7:] if len(candles) > 1 else []   # closed days only
            m = median([float(c.volume or 0) * float(c.close or 0) for c in days])
            if m:
                out[tv] = str(round(m, 2))
        except Exception:
            continue
    if out:
        try:
            r = await get_redis()
            await r.delete(VOL7D_KEY)
            await r.hset(VOL7D_KEY, mapping=out)
            await r.expire(VOL7D_KEY, 3 * 86400)
        except Exception as e:
            log.warning("vol_baseline.store_failed", error=str(e))
    log.info("vol_baseline.refreshed", coins=len(out))
    return len(out)


async def get_volume_baseline() -> dict[str, float]:
    """{symbol: median 7d baht volume} — empty when unset/expired (fail-open)."""
    try:
        r = await get_redis()
        raw = await r.hgetall(VOL7D_KEY)
        return {(k.decode() if isinstance(k, bytes) else k):
                float(v.decode() if isinstance(v, bytes) else v)
                for k, v in (raw or {}).items()}
    except Exception:
        return {}


async def health_check(db: AsyncSession) -> list[str]:
    """Detect the silent failure modes and surface them as alerts (deduped 24h)."""
    problems: list[str] = []
    now = datetime.now(timezone.utc)

    # 1) desk snapshot stale (worker frozen / heavy tick dying)
    res = await db.execute(select(DeskSnapshot.computed_at))
    ages = [(now - (t if t.tzinfo else t.replace(tzinfo=timezone.utc))).total_seconds()
            for (t,) in res.all() if t]
    stale_after = settings.HEALTH_SNAPSHOT_STALE_SECONDS
    if ages and min(ages) > stale_after:
        problems.append(
            f"🩺 desk snapshot ไม่อัปเดตมา {int(min(ages) / 60)} นาที "
            f"(ปกติทุก ~3 นาที) — worker อาจค้าง ลอง restart backend")

    # 2) ML on but the vote cache is empty (expired + refresh job not running) —
    #    the desk silently loses its ML column and the auto-trader loses its gate
    if settings.DESK_ML_VOTE_ENABLED:
        try:
            r = await get_redis()
            n = 0
            async for _ in r.scan_iter(match="desk:mlvote:*", count=100):
                n += 1
                break
            if n == 0:
                problems.append(
                    "🩺 ML vote cache ว่าง ทั้งที่ DESK_ML_VOTE_ENABLED เปิดอยู่ — "
                    "รอ ml_vote_tick รอบถัดไป หรือ trigger refresh เอง")
        except Exception:
            pass

    for text in problems:
        if not await _recent_alert_exists(db, HEALTH_KIND):
            await _alert_all_workspaces(db, HEALTH_KIND, text)
            try:
                from app.trading import notify
                await notify.send(text, tier=4, dedupe_key=f"health:{text[:40]}")
            except Exception:
                pass
    if problems:
        await db.commit()
        log.warning("market_watch.health_problems", problems=problems)
    return problems
