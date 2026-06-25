"""Background worker: keep every workspace's trading desk computed 24/7.

Two jobs run server-side (even with no browser open):

- heavy (every HEAVY_MINUTES): full analysis + news + stats → desk snapshot,
  and detect "new setup" alerts.
- fast (every FAST_SECONDS): refresh live prices / unrealized PnL only, so the
  desk numbers keep moving without re-running backtests.

The API only reads the snapshots these jobs write.
"""
from __future__ import annotations

import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
import structlog

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.watchlist import WatchlistItem
from app.models.trading_state import DeskSnapshot
from app.trading import desk_store

log = structlog.get_logger()
_scheduler: AsyncIOScheduler | None = None

HEAVY_SECONDS = 180
FAST_SECONDS = 20


async def _workspaces_with_watchlist() -> list:
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(WatchlistItem.workspace_id)
            .where(WatchlistItem.enabled == True)  # noqa: E712
            .distinct()
        )
        return [row[0] for row in res.all()]


async def _workspaces_with_snapshot() -> list:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(DeskSnapshot.workspace_id))
        return [row[0] for row in res.all()]


async def heavy_tick() -> None:
    """Full recompute of every workspace's desk + alert detection."""
    try:
        ws_ids = await _workspaces_with_watchlist()
    except Exception as e:
        log.warning("desk_heavy_list_failed", error=str(e))
        return
    for ws in ws_ids:
        try:
            async with AsyncSessionLocal() as db:
                # watchdog: cancel a stuck compute so the next tick can run
                # (otherwise a hung LLM/HTTP call blocks the job forever and
                # APScheduler skips every later run — "ran once then stopped")
                await asyncio.wait_for(
                    desk_store.compute_full(db, ws),
                    timeout=settings.HEAVY_TICK_TIMEOUT_SECONDS,
                )
        except asyncio.TimeoutError:
            log.warning("desk_heavy_ws_timeout", workspace=str(ws),
                        timeout=settings.HEAVY_TICK_TIMEOUT_SECONDS)
        except Exception as e:
            log.warning("desk_heavy_ws_failed", workspace=str(ws), error=str(e))


async def pipeline_tick() -> None:
    """Run the per-coin LangGraph pipeline feed on its own (slower) schedule.

    Decoupled from heavy_tick: it only refreshes the step-by-step Pipeline feed
    (never the desk snapshot), and run_pipeline_only holds a single-flight lock so
    it won't overlap a manual "Run Pipeline" or a previous auto run. Long but async
    (LLM awaits), so the fast tick + API keep serving while it runs."""
    try:
        ws_ids = await _workspaces_with_watchlist()
    except Exception as e:
        log.warning("desk_pipeline_list_failed", error=str(e))
        return
    for ws in ws_ids:
        try:
            async with AsyncSessionLocal() as db:
                await asyncio.wait_for(
                    desk_store.run_pipeline_only(db, ws),
                    timeout=settings.PIPELINE_TICK_TIMEOUT_SECONDS,
                )
        except asyncio.TimeoutError:
            log.warning("desk_pipeline_ws_timeout", workspace=str(ws),
                        timeout=settings.PIPELINE_TICK_TIMEOUT_SECONDS)
        except Exception as e:
            log.warning("desk_pipeline_ws_failed", workspace=str(ws), error=str(e))


async def fast_tick() -> None:
    """Cheap price-only refresh of every workspace that already has a snapshot."""
    try:
        ws_ids = await _workspaces_with_snapshot()
    except Exception as e:
        log.warning("desk_fast_list_failed", error=str(e))
        return
    for ws in ws_ids:
        try:
            async with AsyncSessionLocal() as db:
                await desk_store.refresh_prices(db, ws)
        except Exception as e:
            log.warning("desk_fast_ws_failed", workspace=str(ws), error=str(e))


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler()
    # run the heavy tick once at startup so desks fill in quickly, then on interval
    _scheduler.add_job(heavy_tick, "interval", seconds=HEAVY_SECONDS, id="desk_heavy")
    _scheduler.add_job(fast_tick, "interval", seconds=FAST_SECONDS, id="desk_fast")
    _scheduler.add_job(heavy_tick, id="desk_heavy_boot")  # immediate first run
    # decoupled auto pipeline (step-by-step feed) — own schedule, won't slow the desk
    if settings.DESK_GRAPH_AUTO:
        _scheduler.add_job(pipeline_tick, "interval",
                           seconds=settings.DESK_GRAPH_INTERVAL_SECONDS,
                           id="desk_pipeline", max_instances=1, coalesce=True)
    _scheduler.start()
    log.info("trading.scheduler.started", heavy_seconds=HEAVY_SECONDS, fast_seconds=FAST_SECONDS,
             pipeline_auto=settings.DESK_GRAPH_AUTO,
             pipeline_seconds=settings.DESK_GRAPH_INTERVAL_SECONDS if settings.DESK_GRAPH_AUTO else None)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
