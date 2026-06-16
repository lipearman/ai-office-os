"""Build + persist trading-desk state.

The worker computes desk state on a schedule and writes it here; the API only
reads it. Two granularities:

- `compute_full`  — heavy: full opportunity scan + news + stats → build_desk,
  upsert the snapshot, and detect "new setup" alerts. Run every few minutes.
- `refresh_prices` — cheap: re-fetch live prices only and rebuild the
  price-sensitive lines from the *stored* analysis. Run every ~20s so numbers
  keep moving without re-running backtests.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis

# Redis channel the worker publishes desk updates on; the API process bridges
# these to connected WebSocket clients (works across separate processes).
DESK_CHANNEL = "desk-updates"


async def _publish(workspace_id, characters) -> None:
    """Best-effort realtime push of the latest desk state via Redis."""
    try:
        r = await get_redis()
        await r.publish(
            DESK_CHANNEL,
            json.dumps({"workspace_id": str(workspace_id), "characters": characters}, default=str),
        )
    except Exception:
        pass

from app.models.watchlist import WatchlistItem
from app.models.paper import PaperTrade
from app.models.trading_state import DeskSnapshot, TradingAlert, DeskLLMConfig, AlertWebhook
from app.trading import alert_webhook
from app.trading.service import daily_opportunities, build_desk
from app.trading.paper import unrealized, paper_stats
from app.trading.news import fetch_news, aggregate_sentiment
from app.trading.bitkub import BitkubClient, to_market_symbol
from app.trading import desk_llm


def _seed() -> int:
    """Minute-rotation seed so advisory lines vary over time."""
    return int(datetime.now(timezone.utc).timestamp() // 60)


async def _watchlist_items(db: AsyncSession, workspace_id) -> list[dict]:
    res = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.workspace_id == workspace_id,
            WatchlistItem.enabled == True,  # noqa: E712
        )
    )
    return [
        {"symbol": w.symbol, "cfg": (w.strategies[0] if w.strategies else None)}
        for w in res.scalars().all()
    ]


async def _live_prices(items: list[dict]) -> dict[str, float]:
    prices: dict[str, float] = {}
    try:
        ticker = await BitkubClient().ticker()
        for w in items:
            mk = to_market_symbol(w["symbol"])
            rec = ticker.get(mk) if isinstance(ticker, dict) else None
            if isinstance(rec, dict) and rec.get("last") is not None:
                prices[w["symbol"]] = float(rec["last"])
    except Exception:
        pass
    return prices


async def _positions(db: AsyncSession, workspace_id, prices: dict) -> list[dict]:
    pres = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "OPEN"
        )
    )
    positions = []
    for t in pres.scalars().all():
        cur = prices.get(t.symbol)
        u = unrealized(t.entry_price, cur, t.size_thb, t.qty) if cur else None
        positions.append({"symbol": t.symbol, "unrealized_thb": u["pnl_thb"] if u else None})
    return positions


async def _stats(db: AsyncSession, workspace_id) -> dict:
    cres = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "CLOSED"
        )
    )
    closed = [{"pnl_pct": t.pnl_pct or 0.0, "pnl_thb": t.pnl_thb or 0.0}
              for t in cres.scalars().all()]
    return paper_stats(closed)


async def get_snapshot(db: AsyncSession, workspace_id) -> DeskSnapshot | None:
    res = await db.execute(
        select(DeskSnapshot).where(DeskSnapshot.workspace_id == workspace_id)
    )
    return res.scalar_one_or_none()


async def compute_full(db: AsyncSession, workspace_id) -> DeskSnapshot:
    """Heavy tick: full analysis → build_desk → upsert snapshot + detect alerts."""
    items = await _watchlist_items(db, workspace_id)
    opps = await daily_opportunities(items) if items else []
    prices = await _live_prices(items)
    positions = await _positions(db, workspace_id, prices)
    stats = await _stats(db, workspace_id)

    assets = sorted({w["symbol"].split("_")[0] for w in items})
    news_items = await fetch_news()
    news_agg = aggregate_sentiment(news_items, assets or None)

    characters = build_desk(opps, positions, stats, news_agg, prices, _seed())

    snap = await get_snapshot(db, workspace_id)

    # per-role LLM provider/model overrides (if configured)
    cfg_res = await db.execute(
        select(DeskLLMConfig).where(DeskLLMConfig.workspace_id == workspace_id)
    )
    cfg = cfg_res.scalar_one_or_none()
    role_overrides = (cfg.roles if cfg else None) or {}

    # LLM 'color commentary' — only re-generate when the factual lines OR the
    # per-role provider config changed (saves tokens; heavy tick runs anyway).
    fact_lines = {c["key"]: c["message"] for c in characters}
    prev_meta = snap.meta or {} if snap else {}
    unchanged = (
        snap is not None
        and fact_lines == prev_meta.get("fact_lines")
        and role_overrides == prev_meta.get("role_overrides")
    )
    if unchanged:
        commentary = {c.get("key"): c.get("commentary") for c in (snap.characters or [])}
    else:
        commentary = await desk_llm.enrich_commentary(characters, role_overrides)
    for c in characters:
        cm = commentary.get(c["key"])
        if cm:
            c["commentary"] = cm

    prev_signals = set(snap.prev_signals or []) if snap else set()
    now_sig = {o["symbol"] for o in opps if o.get("signal_today")}

    # record alerts for symbols that NEWLY entered a setup
    new_alerts: list[dict] = []
    for sym in (now_sig - prev_signals):
        o = next((x for x in opps if x["symbol"] == sym), None)
        if not o:
            continue
        text = f"{sym} เข้า setup ({o.get('strategy')}) — win ~{o.get('win_chance_pct')}%"
        db.add(TradingAlert(
            workspace_id=workspace_id, symbol=sym, strategy=o.get("strategy"),
            timeframe=o.get("timeframe"), win_chance_pct=o.get("win_chance_pct"),
            label=o.get("label"), text=text,
        ))
        new_alerts.append({
            "symbol": sym, "strategy": o.get("strategy"), "timeframe": o.get("timeframe"),
            "win_chance_pct": o.get("win_chance_pct"), "label": o.get("label"), "text": text,
        })

    # stash analysis so the cheap price-only tick can rebuild without re-scanning
    meta = {"opps": opps, "stats": stats, "news_agg": news_agg, "prices": prices,
            "fact_lines": fact_lines, "role_overrides": role_overrides}
    now = datetime.now(timezone.utc)
    if snap is None:
        snap = DeskSnapshot(workspace_id=workspace_id)
        db.add(snap)
    snap.characters = characters
    snap.prev_signals = sorted(now_sig)
    snap.meta = meta
    snap.computed_at = now
    snap.priced_at = now
    await db.commit()
    await _publish(workspace_id, snap.characters)

    # opt-in outbound webhook for newly-detected setups (best-effort)
    if new_alerts:
        wh = (await db.execute(
            select(AlertWebhook).where(AlertWebhook.workspace_id == workspace_id)
        )).scalar_one_or_none()
        if wh and wh.enabled and wh.url:
            await alert_webhook.post_alerts(wh.url, workspace_id, new_alerts)
    return snap


async def refresh_prices(db: AsyncSession, workspace_id) -> DeskSnapshot | None:
    """Cheap tick: refresh prices + unrealized PnL only, reusing stored analysis."""
    snap = await get_snapshot(db, workspace_id)
    if snap is None or not snap.meta:
        return None  # nothing computed yet — wait for the heavy tick
    items = await _watchlist_items(db, workspace_id)
    prices = await _live_prices(items)
    if not prices:
        return snap  # no fresh prices — leave the snapshot as-is
    positions = await _positions(db, workspace_id, prices)
    meta = snap.meta
    # keep the LLM commentary from the last heavy tick (don't re-call the LLM here)
    prev_commentary = {c.get("key"): c.get("commentary") for c in (snap.characters or [])}
    characters = build_desk(
        meta.get("opps", []), positions, meta.get("stats", {}),
        meta.get("news_agg", {}), prices, _seed(),
    )
    for c in characters:
        cm = prev_commentary.get(c["key"])
        if cm:
            c["commentary"] = cm
    meta["prices"] = prices
    snap.characters = characters
    snap.meta = meta
    snap.priced_at = datetime.now(timezone.utc)
    await db.commit()
    await _publish(workspace_id, snap.characters)
    return snap
