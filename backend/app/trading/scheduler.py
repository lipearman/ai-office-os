"""APScheduler job: periodically scan watchlists for new setups → alerts.

Runs server-side so setups are detected even when no browser is open.
"""
from __future__ import annotations

from collections import defaultdict

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
import structlog

from app.core.database import AsyncSessionLocal
from app.models.watchlist import WatchlistItem
from app.trading.service import daily_opportunities
from app.trading import alerts

log = structlog.get_logger()
_scheduler: AsyncIOScheduler | None = None

SCAN_MINUTES = 5


async def alert_scan_job() -> None:
    """Scan every workspace's enabled watchlist; record alerts for new setups."""
    try:
        async with AsyncSessionLocal() as db:
            res = await db.execute(
                select(WatchlistItem).where(WatchlistItem.enabled == True)  # noqa: E712
            )
            by_ws: dict = defaultdict(list)
            for w in res.scalars().all():
                by_ws[w.workspace_id].append(
                    {"symbol": w.symbol, "cfg": (w.strategies[0] if w.strategies else None)}
                )
        for ws, items in by_ws.items():
            try:
                opps = await daily_opportunities(items)
                new = alerts.detect(ws, opps)
                if new:
                    log.info("trading.alerts", workspace=str(ws), new=len(new))
            except Exception as e:
                log.warning("alert_scan_ws_failed", workspace=str(ws), error=str(e))
    except Exception as e:
        log.warning("alert_scan_failed", error=str(e))


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler()
    # run shortly after startup, then every SCAN_MINUTES
    _scheduler.add_job(alert_scan_job, "interval", minutes=SCAN_MINUTES,
                       next_run_time=None, id="alert_scan")
    _scheduler.start()
    log.info("trading.scheduler.started", every_minutes=SCAN_MINUTES)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
