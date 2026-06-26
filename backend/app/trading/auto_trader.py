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
        # No cached vote yet → don't block (degrade gracefully).
        if settings.DESK_ML_VOTE_ENABLED:
            mp = o.get("ml_prob")
            if mp is not None and mp < settings.ML_VOTE_MIN_PROB:
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
        reason = None
        if t.stop and cur <= t.stop:
            reason = "stop"
        elif t.target and cur >= t.target:
            reason = "target"
        # catastrophe stop — closes a position bleeding past the max loss even if
        # it has no stop/target (no orphan can fall forever).
        elif t.entry_price and (cur / t.entry_price - 1.0) * 100 <= -settings.AUTO_PAPER_MAX_LOSS_PCT:
            reason = "max_loss"
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
