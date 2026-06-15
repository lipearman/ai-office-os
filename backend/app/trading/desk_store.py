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

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.watchlist import WatchlistItem
from app.models.paper import PaperTrade
from app.models.trading_state import DeskSnapshot, TradingAlert
from app.trading.service import daily_opportunities, build_desk
from app.trading.paper import unrealized, paper_stats
from app.trading.news import fetch_news, aggregate_sentiment
from app.trading.bitkub import BitkubClient, to_market_symbol


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
    prev_signals = set(snap.prev_signals or []) if snap else set()
    now_sig = {o["symbol"] for o in opps if o.get("signal_today")}

    # record alerts for symbols that NEWLY entered a setup
    for sym in (now_sig - prev_signals):
        o = next((x for x in opps if x["symbol"] == sym), None)
        if not o:
            continue
        db.add(TradingAlert(
            workspace_id=workspace_id, symbol=sym, strategy=o.get("strategy"),
            timeframe=o.get("timeframe"), win_chance_pct=o.get("win_chance_pct"),
            label=o.get("label"),
            text=f"{sym} เข้า setup ({o.get('strategy')}) — win ~{o.get('win_chance_pct')}%",
        ))

    # stash analysis so the cheap price-only tick can rebuild without re-scanning
    meta = {"opps": opps, "stats": stats, "news_agg": news_agg, "prices": prices}
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
    characters = build_desk(
        meta.get("opps", []), positions, meta.get("stats", {}),
        meta.get("news_agg", {}), prices, _seed(),
    )
    meta["prices"] = prices
    snap.characters = characters
    snap.meta = meta
    snap.priced_at = datetime.now(timezone.utc)
    await db.commit()
    return snap
