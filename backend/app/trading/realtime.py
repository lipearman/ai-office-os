"""Bridge desk updates from Redis pub/sub to WebSocket clients.

The worker publishes the latest desk state on the Redis DESK_CHANNEL (possibly
from a separate process). The API process — which holds the live WebSocket
connections — runs this subscriber and rebroadcasts each update to the right
workspace as a `desk.update` or `desk.pipeline_step` event. Clients then update
in realtime instead of waiting for the next poll.
"""
from __future__ import annotations

import asyncio
import json

import structlog

from app.core.redis import get_redis
from app.websocket.manager import manager
from app.trading.desk_store import DESK_CHANNEL

log = structlog.get_logger()
_task: asyncio.Task | None = None


async def _listen() -> None:
    while True:
        try:
            r = await get_redis()
            pubsub = r.pubsub()
            await pubsub.subscribe(DESK_CHANNEL)
            log.info("desk_realtime.subscribed", channel=DESK_CHANNEL)
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                try:
                    data = json.loads(msg["data"])
                    event_type = data.get("type", "desk.update")
                    if event_type == "desk.pipeline_step":
                        await manager.broadcast_workspace(
                            str(data["workspace_id"]),
                            {
                                "type": "desk.pipeline_step",
                                "step": data.get("step"),
                                "run_status": data.get("run_status"),
                            },
                        )
                    else:
                        await manager.broadcast_workspace(
                            str(data["workspace_id"]),
                            {
                                "type": "desk.update",
                                "characters": data.get("characters", []),
                                "ticker": data.get("ticker", {}),
                                "news_agg": data.get("news_agg", {}),
                            },
                        )
                except Exception as e:
                    log.warning("desk_realtime.dispatch_failed", error=str(e))
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("desk_realtime.reconnect", error=str(e))
            await asyncio.sleep(3)


def start_realtime() -> None:
    global _task
    if _task is None:
        _task = asyncio.create_task(_listen())


async def stop_realtime() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        try:
            await _task
        except Exception:
            pass
        _task = None
