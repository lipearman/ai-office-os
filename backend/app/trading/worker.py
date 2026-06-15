"""Standalone trading-desk worker.

Run it as its own process so desk computation is independent of the web tier
(and so scaling the API to multiple processes doesn't multiply the ticks):

    python -m app.trading.worker

When using a dedicated worker, set RUN_WORKER_IN_PROCESS=false on the API so
the scheduler doesn't also run there. The worker publishes desk updates to
Redis; the API process rebroadcasts them to WebSocket clients.
"""
from __future__ import annotations

import asyncio
import signal

import structlog

from app.trading.scheduler import start_scheduler, stop_scheduler

log = structlog.get_logger()


async def _main() -> None:
    start_scheduler()
    log.info("trading.worker.started")

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (getattr(signal, "SIGINT", None), getattr(signal, "SIGTERM", None)):
        if sig is None:
            continue
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass  # signal handlers aren't supported on Windows event loops

    try:
        await stop.wait()
    finally:
        stop_scheduler()
        log.info("trading.worker.stopped")


def main() -> None:
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
