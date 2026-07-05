"""Per-coin timeframe tuner — each coin gets the heartbeat it actually wins on.

The 8x3 backtest matrix showed coins genuinely prefer different timeframes
(ADA wins on 15M, SOL on 4H, NEAR/XRP on 1H) — but picking the prettiest of
three columns is also how you overfit. So assignment is guarded:

- a coin only gets a non-default TF when that TF shows PF >= TF_TUNER_MIN_PF,
  trades >= TF_TUNER_MIN_TRADES AND positive return on the validated backtest;
- anything less falls back to the tunable default (DESK_SCAN_TIMEFRAME);
- the map is recomputed weekly from fresh data and stored in Redis with a TTL,
  so a stale conclusion dies on its own instead of steering the desk forever.

The scan AND the ML votes both read the same map (via watchlist_plus_discovered),
so a coin is always signalled and confirmed on the same clock.
"""
from __future__ import annotations

import time

import structlog

from app.core.config import settings
from app.core.redis import get_redis
from app.trading.bitkub import BitkubClient

log = structlog.get_logger()

TF_MAP_KEY = "desk:tf_map"
LAST_RUN_KEY = "desk:tf_tuner:last_run"
LOCK_KEY = "desk:tf_tuner:lock"
CANDIDATE_TFS = ("15M", "1H", "4H")


def pick_timeframe(results: dict[str, dict], default: str,
                   min_trades: int, min_pf: float) -> str:
    """Choose a coin's TF from {tf: stats}. Pure — unit-tested.

    Only a TF with enough trades, PF over the bar AND positive return may win;
    among qualifiers the highest PF takes it (PF None with wins = no losing
    trade yet = treat as infinite). Otherwise: the default TF.
    """
    best_tf, best_pf = default, None
    for tf, st in (results or {}).items():
        t = st.get("total_trades") or 0
        ret = st.get("total_return_pct")
        if t < min_trades or ret is None or ret <= 0:
            continue
        pf = st.get("profit_factor")
        if pf is None:
            if (st.get("win_rate") or 0) <= 0:
                continue
            pf = float("inf")               # wins, zero losses so far
        if pf < min_pf:
            continue
        if best_pf is None or pf > best_pf:
            best_tf, best_pf = tf, pf
    return best_tf


async def get_tf_map() -> dict[str, str]:
    """Current per-coin TF assignments (empty when unset/expired)."""
    try:
        r = await get_redis()
        raw = await r.hgetall(TF_MAP_KEY)
        return {(k.decode() if isinstance(k, bytes) else k):
                (v.decode() if isinstance(v, bytes) else v)
                for k, v in (raw or {}).items()}
    except Exception:
        return {}


async def run_tf_scan(db, workspace_id, force: bool = False) -> dict:
    """Weekly: backtest every scanned coin across CANDIDATE_TFS and rebuild the
    per-coin TF map. Heavy (~3 backtests per coin) — single-flight + stamped."""
    from app.trading import notify, tuning
    from app.trading.desk_store import watchlist_plus_discovered
    from app.trading.service import backtest_symbol

    r = None
    try:
        r = await get_redis()
        if not await r.set(LOCK_KEY, "1", nx=True, ex=settings.TF_TUNER_TIMEOUT_SECONDS):
            return {"status": "skipped", "reason": "already running"}
        if not force:
            last = await r.get(LAST_RUN_KEY)
            if last and time.time() - float(last) < settings.TF_TUNER_INTERVAL_SECONDS:
                return {"status": "skipped", "reason": "ran recently"}
    except Exception:
        r = None

    try:
        default_tf = str((await tuning.get_params(db))["DESK_SCAN_TIMEFRAME"])
        items = await watchlist_plus_discovered(db, workspace_id)
        client = BitkubClient()
        prev = await get_tf_map()
        new_map: dict[str, str] = {}
        for it in items:
            sym = it["symbol"]
            results: dict[str, dict] = {}
            for tf in CANDIDATE_TFS:
                try:
                    bt = await backtest_symbol(client, sym, timeframe=tf)
                    results[tf] = ((bt.get("validated") or bt.get("baseline") or {})
                                   .get("stats") or {})
                except Exception:
                    continue
            chosen = pick_timeframe(results, default_tf,
                                    settings.TF_TUNER_MIN_TRADES,
                                    settings.TF_TUNER_MIN_PF)
            if chosen != default_tf:
                new_map[sym] = chosen

        if r is not None:
            try:
                await r.delete(TF_MAP_KEY)
                if new_map:
                    await r.hset(TF_MAP_KEY, mapping=new_map)
                await r.expire(TF_MAP_KEY, settings.TF_TUNER_INTERVAL_SECONDS + 86400)
                await r.set(LAST_RUN_KEY, str(time.time()))
            except Exception:
                pass

        changes = {s: tf for s, tf in new_map.items() if prev.get(s) != tf}
        changes.update({s: f"→{default_tf}" for s in prev if s not in new_map})
        log.info("tf_tuner.ran", assigned=new_map, changes=changes)
        if changes:
            summary = ", ".join(f"{s.replace('_THB', '')}→{tf}"
                                for s, tf in sorted(new_map.items())) or f"ทั้งหมด {default_tf}"
            await notify.send(
                f"🧭 จัดจังหวะรายเหรียญ (จาก backtest ประจำสัปดาห์)\n"
                f"{summary} · ที่เหลือใช้ {default_tf}",
                tier=4, dedupe_key=f"tfmap:{int(time.time() // 86400)}")
        return {"status": "ok", "assigned": new_map, "default": default_tf}
    finally:
        if r is not None:
            try:
                await r.delete(LOCK_KEY)
            except Exception:
                pass
