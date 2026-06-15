"""Server-side alert detection (runs on a schedule, even with no browser open).

In-memory store keyed by workspace. A periodic job scans each workspace's
watchlist for symbols that NEWLY entered a setup and records an alert. The
frontend polls /trading/alerts to display them on the next visit.

In-memory is fine for v1 (alerts reset on backend restart). Persisting to DB
or pushing via web-push/email is a later enhancement.
"""
from __future__ import annotations

import time
import uuid as _uuid
from collections import defaultdict

# workspace_id(str) → list[alert dict]
_alerts: dict[str, list[dict]] = defaultdict(list)
# workspace_id(str) → set of symbols currently in setup (to detect transitions)
_prev_signals: dict[str, set[str]] = defaultdict(set)

MAX_ALERTS = 50


def detect(workspace_id, opportunities: list[dict]) -> list[dict]:
    """Compare current signals vs previous → record alerts for NEW setups."""
    ws = str(workspace_id)
    now_sig = {o["symbol"] for o in opportunities if o.get("signal_today")}
    prev = _prev_signals[ws]
    fresh = now_sig - prev
    new_alerts = []
    for sym in fresh:
        o = next((x for x in opportunities if x["symbol"] == sym), None)
        if not o:
            continue
        alert = {
            "id": _uuid.uuid4().hex[:12],
            "symbol": sym,
            "strategy": o.get("strategy"),
            "timeframe": o.get("timeframe"),
            "win_chance_pct": o.get("win_chance_pct"),
            "label": o.get("label"),
            "ts": time.time(),
            "text": f"{sym} เข้า setup ({o.get('strategy')}) — win ~{o.get('win_chance_pct')}%",
        }
        _alerts[ws].insert(0, alert)
        new_alerts.append(alert)
    _alerts[ws] = _alerts[ws][:MAX_ALERTS]
    _prev_signals[ws] = now_sig
    return new_alerts


def get_alerts(workspace_id) -> list[dict]:
    return _alerts[str(workspace_id)]


def clear_alerts(workspace_id) -> None:
    _alerts[str(workspace_id)] = []
