"""Auto paper-trading (opt-in).

When AUTO_PAPER_ENABLED, the worker opens paper trades on fresh setups the
pipeline surfaces and closes them when price hits the stop/target. Pure
simulation (Bitkub prices, no real orders). Guards: max open positions, fixed
size per deal, a minimum win-chance bar, one position per symbol.

Disabled by default — turning it on means the worker trades on its own.
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.paper import PaperTrade
from app.trading.paper import fill_open, close_pnl
from app.trading.bitkub import BitkubClient

log = structlog.get_logger()


async def _open_positions(db: AsyncSession, workspace_id) -> list[PaperTrade]:
    res = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "OPEN"
        )
    )
    return list(res.scalars().all())


async def auto_open(db: AsyncSession, workspace_id, opps: list[dict], prices: dict) -> list[str]:
    """Open paper trades on fresh, high-quality setups (within the guards)."""
    if not settings.AUTO_PAPER_ENABLED:
        return []
    open_trades = await _open_positions(db, workspace_id)
    open_syms = {t.symbol for t in open_trades}
    slots = settings.AUTO_PAPER_MAX_POSITIONS - len(open_trades)
    if slots <= 0:
        return []

    opened: list[str] = []
    for o in opps:
        if slots <= 0:
            break
        if settings.AUTO_PAPER_REQUIRE_SIGNAL and not o.get("signal_today"):
            continue
        # against a bearish BTC trend, demand a stronger edge to open a long
        min_win = settings.AUTO_PAPER_MIN_WIN_PCT
        if o.get("market_bias") == "bearish":
            min_win += 15
        if (o.get("win_chance_pct") or 0) < min_win:
            continue
        # ML ensemble gate: when ML is on, only open if the model confirms (P_up
        # >= threshold). The walk-forward test showed the rule+ML ensemble flips a
        # losing rule into positive OOS expectancy by skipping low-conviction trades.
        # FAIL-CLOSED: a missing vote (expired cache, refresh not run yet) must not
        # silently drop the gate — that once let in a trade the model scored 36%.
        # Missing a setup is cheaper than trading against our own model.
        if settings.DESK_ML_VOTE_ENABLED:
            mp = o.get("ml_prob")
            if mp is None or mp < settings.ML_VOTE_MIN_PROB:
                if mp is None:
                    log.info("auto_paper.skip_no_ml_vote", symbol=o.get("symbol"))
                continue
        sym = o["symbol"]
        if sym in open_syms:
            continue
        plan = o.get("plan") or {}
        entry = prices.get(sym) or o.get("price")
        if not entry:
            continue
        size = settings.AUTO_PAPER_SIZE_THB
        fill = fill_open(entry, size)
        db.add(PaperTrade(
            workspace_id=workspace_id, symbol=sym,
            strategy=f"auto:{o.get('strategy', '')}", timeframe=o.get("timeframe", "4H"),
            side="BUY", entry_price=entry, size_thb=size, qty=fill["qty"],
            stop=plan.get("stop"), target=plan.get("target"), fee_pct=fill["fee_pct"],
            status="OPEN",
            rationale=f"auto-paper: win~{o.get('win_chance_pct')}% · {o.get('label', '')}",
            indicators={},
        ))
        opened.append(sym)
        open_syms.add(sym)
        slots -= 1
    if opened:
        log.info("auto_paper.opened", workspace=str(workspace_id), symbols=opened)
    return opened


async def auto_close(db: AsyncSession, workspace_id, prices: dict | None = None) -> list[str]:
    """Close open paper trades whose price hit stop or target."""
    if not settings.AUTO_PAPER_ENABLED:
        return []
    open_trades = await _open_positions(db, workspace_id)
    if not open_trades:
        return []
    prices = dict(prices or {})
    client = BitkubClient()
    now = datetime.now(timezone.utc)
    closed: list[str] = []
    for t in open_trades:
        cur = prices.get(t.symbol)
        if cur is None:
            try:
                cur = await client.last_price(t.symbol)
            except Exception:
                cur = None
        if not cur:
            continue
        # move-to-breakeven: once price has run AUTO_PAPER_BREAKEVEN_AT_R times the
        # initial risk (entry→stop) in our favor, raise the stop to entry plus the
        # round-trip fee so this trade can no longer close as a full loser.
        if (settings.AUTO_PAPER_BREAKEVEN_AT_R and t.stop and t.entry_price
                and t.stop < t.entry_price):
            r_dist = t.entry_price - t.stop
            if cur >= t.entry_price + settings.AUTO_PAPER_BREAKEVEN_AT_R * r_dist:
                be = t.entry_price * (1 + 2 * (t.fee_pct or 0) / 100)
                new_stop = min(be, cur)
                if new_stop > t.stop:
                    t.stop = new_stop
                    log.info("auto_paper.breakeven", symbol=t.symbol, stop=round(new_stop, 4))
        reason = None
        if t.stop and cur <= t.stop:
            # a stop raised to/above entry is a protected winner, not a loss
            reason = "breakeven" if t.entry_price and t.stop >= t.entry_price else "stop"
        elif t.target and cur >= t.target:
            reason = "target"
        # catastrophe stop — closes a position bleeding past the max loss even if
        # it has no stop/target (no orphan can fall forever).
        elif t.entry_price and (cur / t.entry_price - 1.0) * 100 <= -settings.AUTO_PAPER_MAX_LOSS_PCT:
            reason = "max_loss"
        # time stop — a setup that has resolved to neither stop nor target within
        # the hold budget is stale; close it and free the slot for a fresh one.
        elif settings.AUTO_PAPER_MAX_HOLD_HOURS and t.entry_at:
            entered = t.entry_at if t.entry_at.tzinfo else t.entry_at.replace(tzinfo=timezone.utc)
            if (now - entered).total_seconds() >= settings.AUTO_PAPER_MAX_HOLD_HOURS * 3600:
                reason = "time"
        if not reason:
            continue
        pnl = close_pnl(t.entry_price, cur, t.size_thb, t.qty)
        t.status = "CLOSED"
        t.exit_at = now
        t.exit_price = cur
        t.exit_reason = reason
        t.pnl_thb = pnl["pnl_thb"]
        t.pnl_pct = pnl["pnl_pct"]
        t.result = pnl["result"]
        closed.append(t.symbol)
    if closed:
        log.info("auto_paper.closed", workspace=str(workspace_id), symbols=closed)
    return closed
