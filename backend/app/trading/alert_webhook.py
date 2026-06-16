"""Outbound alert webhook (opt-in, best-effort).

The user configures their own URL per workspace; when the worker detects new
setups it POSTs them here. Never raises into the worker tick — failures are
logged and swallowed. No destinations are hard-coded.
"""
from __future__ import annotations

import structlog

log = structlog.get_logger()


def valid_webhook_url(url: str) -> bool:
    """Only allow http(s). (Self-hosted: the user owns the target.)"""
    u = (url or "").strip().lower()
    return u.startswith("http://") or u.startswith("https://")


async def post_alerts(url: str, workspace_id, alerts: list[dict]) -> bool:
    """POST {workspace_id, alerts} to the webhook. Returns True on 2xx."""
    if not valid_webhook_url(url) or not alerts:
        return False
    import httpx
    payload = {
        "source": "ai-office-os/trading-desk",
        "workspace_id": str(workspace_id),
        "alerts": alerts,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload)
            ok = 200 <= resp.status_code < 300
            if not ok:
                log.warning("alert_webhook.non_2xx", status=resp.status_code)
            return ok
    except Exception as e:
        log.warning("alert_webhook.failed", error=str(e))
        return False
