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
import time
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis

log = structlog.get_logger()

# Redis channel the worker publishes desk updates on; the API process bridges
# these to connected WebSocket clients (works across separate processes).
DESK_CHANNEL = "desk-updates"

# Redis key prefix for the latest pipeline run (per workspace, TTL 10 min).
PIPELINE_RUN_KEY = "pipeline_run:{workspace_id}"
PIPELINE_TTL = 600

_PIPELINE_NODE_DEFS = {
    "monitor": {"id": "monitor", "name": "Model Monitor",     "emoji": "📉", "role": "advisory", "description": "Scan หา 10 เหรียญที่ดีที่สุดของวันนี้"},
    "analyst": {"id": "analyst", "name": "Market Analyst",    "emoji": "📊", "role": "advisory", "description": "วิเคราะห์ภาพรวมตลาดและแนวโน้ม"},
    "news":    {"id": "news",    "name": "News & Sentiment",  "emoji": "📰", "role": "advisory", "description": "ตรวจสอบข่าว/sentiment ทีละเหรียญ"},
    "trader":  {"id": "trader",  "name": "Trader",            "emoji": "🤖", "role": "engine",   "description": "หาจุดเข้าซื้อที่ดีที่สุดสำหรับเหรียญนั้น"},
    "risk":    {"id": "risk",    "name": "Risk Officer",      "emoji": "🛡️", "role": "advisory", "description": "ประเมินความเสี่ยงของพอร์ต"},
    "exec":    {"id": "exec",    "name": "Execution Reviewer","emoji": "🔍", "role": "advisory", "description": "Backtest กลยุทธ์ ดู WIN/LOSS"},
    "coach":   {"id": "coach",   "name": "Coach",             "emoji": "🎯", "role": "advisory", "description": "ปรับกลยุทธ์และระวังความเสี่ยงสูง"},
    "summary": {"id": "summary", "name": "Summary",           "emoji": "📋", "role": "advisory", "description": "สรุปผลของแต่ละเหรียญ"},
}


def _extract_report(node_id: str, output: dict, state: dict) -> str:
    """Extract a human-readable report from a node's return value."""
    if node_id == "monitor":
        coins = output.get("ranked_coins") or state.get("ranked_coins") or []
        verdict = str(output.get("model_verdict") or state.get("model_verdict") or "")
        if coins:
            syms = ", ".join(c["symbol"] for c in coins if c.get("symbol"))
            return f"พบ {len(coins)} เหรียญ: {syms} | {verdict}"[:300]
        return verdict[:300]

    if node_id == "summary":
        chars = output.get("characters") or state.get("characters") or []
        lines = []
        for c in chars:
            if c.get("key", "").startswith("coin_") and c.get("message"):
                lines.append(c["message"])
        coach = output.get("coach_message") or state.get("coach_message") or ""
        if lines:
            preview = " | ".join(lines)
            return f"{coach} | {preview}"[:300]
        return str(coach)[:300]

    field_map = {
        "analyst": "analyst_message",
        "news":    "news_summary",
        "trader":  "trader_message",
        "risk":    "risk_verdict",
        "exec":    "review_verdict",
        "coach":   "coach_message",
    }
    key = field_map.get(node_id)
    if key:
        val = output.get(key) or state.get(key) or ""
        return str(val)[:300]
    return ""


def _pipeline_step_event(workspace_id: str, step: dict, run_status: str) -> dict:
    return {
        "type": "desk.pipeline_step",
        "workspace_id": workspace_id,
        "step": step,
        "run_status": run_status,
    }


async def _publish(workspace_id, characters, ticker: dict | None = None, news_agg: dict | None = None) -> None:
    """Best-effort realtime push of the latest desk state via Redis."""
    try:
        r = await get_redis()
        payload = {"workspace_id": str(workspace_id), "characters": characters}
        if ticker:
            payload["ticker"] = ticker
        if news_agg:
            payload["news_agg"] = news_agg
        await r.publish(
            DESK_CHANNEL,
            json.dumps(payload, default=str),
        )
    except Exception:
        pass


async def _publish_pipeline_step(workspace_id: str, step: dict, run_status: str) -> None:
    try:
        r = await get_redis()
        await r.publish(
            DESK_CHANNEL,
            json.dumps(_pipeline_step_event(workspace_id, step, run_status), default=str),
        )
    except Exception:
        pass


async def _store_pipeline_run(r, workspace_id: str, steps: list[dict], run_status: str):
    """Store complete pipeline run in Redis for API to serve."""
    key = PIPELINE_RUN_KEY.format(workspace_id=workspace_id)
    try:
        await r.setex(
            key, PIPELINE_TTL,
            json.dumps({
                "run_status": run_status,
                "steps": steps,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }, default=str),
        )
    except Exception:
        pass

from app.models.watchlist import WatchlistItem
from app.models.paper import PaperTrade
from app.models.trading_state import DeskSnapshot, TradingAlert, DeskLLMConfig, AlertWebhook
from app.models.agent import Agent
from app.trading import alert_webhook
from app.trading.service import daily_opportunities, build_desk
from app.trading.paper import unrealized, paper_stats
from app.trading.news import fetch_news, aggregate_sentiment
from app.trading.bitkub import BitkubClient, to_market_symbol, to_tradingview_symbol
from app.trading import desk_llm
from app.trading.graph import get_graph
from app.trading.state import DeskState
from app.core.config import settings


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


async def _discovered_symbols(limit: int) -> list[str]:
    """Market discovery: top-N Bitkub THB pairs by 24h volume (one ticker call).

    The desk scans these on top of the watchlist so good movers surface without
    being added by hand.
    """
    if limit <= 0:
        return []
    try:
        ticker = await BitkubClient().ticker()
        if not isinstance(ticker, dict):
            return []
        stable = {"USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD"}
        rows: list[tuple[str, float]] = []
        for mk, rec in ticker.items():
            if not isinstance(mk, str) or not mk.startswith("THB_") or not isinstance(rec, dict):
                continue
            try:
                tv = to_tradingview_symbol(mk)
            except Exception:
                continue
            # keep only proper BASE_THB pairs; skip stablecoins (no trading signal)
            if not tv.endswith("_THB") or tv.split("_")[0] in stable:
                continue
            vol = rec.get("quoteVolume") or rec.get("baseVolume") or 0
            rows.append((tv, float(vol)))
        rows.sort(key=lambda r: -r[1])
        return [s for s, _ in rows[:limit]]
    except Exception:
        return []


async def watchlist_plus_discovered(db: AsyncSession, workspace_id) -> list[dict]:
    """Watchlist items (pinned) + market-scan discoveries (top-N by volume).

    Shared by the /office desk and the /trading opportunities endpoint so both
    surface the same scan-discovered movers.
    """
    items = await _watchlist_items(db, workspace_id)
    if settings.DESK_SCAN_ENABLED:
        wl = {it["symbol"] for it in items}
        discovered = await _discovered_symbols(settings.DESK_SCAN_TOP_N)
        items = items + [{"symbol": s, "cfg": None, "discovered": True}
                         for s in discovered if s not in wl]
    return items


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


async def _live_ticker(items: list[dict]) -> dict[str, dict]:
    """Full ticker data (last, change%, volume, high, low, sparkline closes) per watchlist symbol."""
    result: dict[str, dict] = {}
    try:
        client = BitkubClient()
        ticker = await client.ticker()
        for w in items:
            mk = to_market_symbol(w["symbol"])
            rec = ticker.get(mk) if isinstance(ticker, dict) else None
            if isinstance(rec, dict) and rec.get("last") is not None:
                entry = {
                    "s": w["symbol"],
                    "p": float(rec["last"]),
                    "c": float(rec.get("percentChange", 0)),
                    "v": float(rec.get("baseVolume", 0)),
                    "h": float(rec.get("high24hr", 0)),
                    "l": float(rec.get("low24hr", 0)),
                    "a": float(rec.get("lowestAsk", 0)),
                    "b": float(rec.get("highestBid", 0)),
                }
                # fetch close prices for sparkline (use tradingview format, not market format)
                try:
                    tv_symbol = to_tradingview_symbol(mk)
                    candles = await client.fetch_ohlcv(tv_symbol, "1H", 24)
                    entry["closes"] = [float(c.close) for c in candles]
                except Exception:
                    entry["closes"] = []
                result[w["symbol"]] = entry
    except Exception:
        pass
    return result


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
    """Heavy tick: full analysis → LangGraph pipeline → upsert snapshot + detect alerts."""
    # watchlist (pinned) + market-scan discoveries (top-N by volume)
    items = await watchlist_plus_discovered(db, workspace_id)
    opps = await daily_opportunities(items) if items else []
    prices = await _live_prices(items)
    positions = await _positions(db, workspace_id, prices)
    stats = await _stats(db, workspace_id)

    assets = sorted({w["symbol"].split("_")[0] for w in items})
    news_items = await fetch_news()
    news_agg = aggregate_sentiment(news_items, assets or None)

    # deterministic fallback (always computed, used when graph is unavailable)
    det_chars = build_desk(opps, positions, stats, news_agg, prices, _seed())

    snap = await get_snapshot(db, workspace_id)

    # ── LangGraph multi-agent pipeline (streamed step-by-step) ──
    graph = get_graph()
    state: DeskState = {
        "workspace_id": str(workspace_id),
        "watchlist_items": items,
        "prices": prices,
        "positions": positions,
        "stats": stats,
        "news_agg": news_agg,
        "news_summary": "",
        "ranked_opportunities": opps,
        "risk_verdict": "",
        "risk_level": "low",
        "can_trade": True,
        "model_verdict": "",
        "trade_decisions": [],
        "trader_message": "",
        "review_verdict": "",
        "exec_approved": True,
        "exec_quality": 0.5,
        "coach_message": "",
        "analyst_message": "",
        "analyst_levels": None,
        "market_bias": "neutral",
        "focus_timeframe": "1H",
        "characters": det_chars,
        "errors": [],
        "pipeline_status": "running",
        "pipeline_steps": [],
        "ranked_coins": [],
        "coin_index": 0,
        "coin_results": [],
        "current_coin": None,
        "agent_configs": {},
    }
    pipeline_steps: list[dict] = []
    graph_commentary: dict = {}
    characters = det_chars
    try:
        async for step_data in graph.astream(state):
            for node_id, output in step_data.items():
                if node_id == "__end__":
                    continue
                ts = time.time()
                coin_sym = state.get("current_coin", {}).get("symbol") if state.get("current_coin") else None
                label = node_id
                if coin_sym and node_id in ("news", "trader", "risk", "exec", "coach"):
                    label = f"{coin_sym}_{node_id}"
                step_rec = {
                    "node_id": node_id,
                    "label": label,
                    "coin": coin_sym,
                    "coin_index": state.get("coin_index", 0),
                    "status": "completed",
                    "ts": ts,
                    "report": _extract_report(node_id, output, state),
                }
                pipeline_steps.append(step_rec)
                # merge output into running state for subsequent nodes
                state.update(output)
                # expose ranked_coins so the frontend can show the symbol list
                if state.get("ranked_coins"):
                    step_rec["ranked_coins"] = [c["symbol"] for c in state["ranked_coins"]]
                await _publish_pipeline_step(str(workspace_id), step_rec, "running")

        run_status = "completed"
        result = state
        characters = result.get("characters") or det_chars
        for c in characters:
            if c.get("commentary"):
                graph_commentary[c["key"]] = c["commentary"]
    except Exception as e:
        import traceback
        log.warning("desk_graph_failed", workspace=str(workspace_id), error=str(e), tb=traceback.format_exc())
        run_status = "error"
        characters = det_chars
        graph_commentary = {}

    # store pipeline run in Redis (served by /desk/pipeline API)
    try:
        r2 = await get_redis()
        await _store_pipeline_run(r2, str(workspace_id), pipeline_steps, run_status)
        # publish final pipeline-step event with overall status
        await _publish_pipeline_step(str(workspace_id), {"node_id": "__complete__", "status": run_status}, run_status)
    except Exception:
        pass

    # per-role LLM provider/model overrides from agents table
    agent_res = await db.execute(
        select(Agent).where(
            Agent.workspace_id == workspace_id,
            Agent.agent_type.in_(["trader", "analyst", "news", "risk", "coach", "monitor", "exec", "summary"]),
        )
    )
    agent_configs: dict[str, dict] = {}
    role_overrides: dict[str, dict] = {}
    for a in agent_res.scalars().all():
        acfg = {}
        if a.system_prompt:
            acfg["system_prompt"] = a.system_prompt
        if a.model_provider and a.model_provider != "auto":
            acfg["provider"] = a.model_provider
        if a.model_name and a.model_name != "auto":
            acfg["model"] = a.model_name
        if a.config and isinstance(a.config, dict) and a.config.get("temperature") is not None:
            acfg["temperature"] = float(a.config["temperature"])
        agent_configs[a.agent_type] = acfg
        role_overrides[a.agent_type] = acfg

    # inject agent_configs into pipeline state for node-level LLM selection
    state["agent_configs"] = agent_configs

    # if graph didn't produce commentary, try the old desk_llm layer
    if not graph_commentary and desk_llm.llm_available():
        fact_lines = {c["key"]: c["message"] for c in det_chars}
        prev_meta = snap.meta or {} if snap else {}
        unchanged = (
            snap is not None
            and fact_lines == prev_meta.get("fact_lines")
            and role_overrides == prev_meta.get("role_overrides")
        )
        if unchanged:
            commentary = {c.get("key"): c.get("commentary") for c in (snap.characters or [])}
        else:
            commentary = await desk_llm.enrich_commentary(det_chars, role_overrides)
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
    fact_lines = {c["key"]: c["message"] for c in det_chars}
    ticker = await _live_ticker(items)
    meta = {"opps": opps, "stats": stats, "news_agg": news_agg, "prices": prices,
            "ticker": ticker,
            "fact_lines": fact_lines, "role_overrides": role_overrides,
            "agent_configs": agent_configs,
            "graph_active": len(graph_commentary) > 0}
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
    await _publish(workspace_id, snap.characters, ticker, meta.get("news_agg"))

    # opt-in outbound webhook for newly-detected setups (best-effort)
    if new_alerts:
        wh = (await db.execute(
            select(AlertWebhook).where(AlertWebhook.workspace_id == workspace_id)
        )).scalar_one_or_none()
        if wh and wh.enabled and wh.url:
            await alert_webhook.post_alerts(wh.url, workspace_id, new_alerts)
    return snap


async def refresh_prices(db: AsyncSession, workspace_id) -> DeskSnapshot | None:
    """Cheap tick: refresh live prices ONLY, never rebuild the node/character
    structure.

    The heavy tick decides the desk layout (LangGraph coin-nodes); the fast tick
    must not swap it for the deterministic 7-role layout — otherwise the desk
    flips format every ~20s. So here we just update the last price / %change in
    the stored ticker (one ticker call, no per-symbol OHLC, no build_desk) and
    leave `snap.characters` untouched.
    """
    snap = await get_snapshot(db, workspace_id)
    if snap is None or not snap.meta:
        return None  # nothing computed yet — wait for the heavy tick
    meta = snap.meta

    try:
        raw = await BitkubClient().ticker()
    except Exception:
        raw = None
    if not isinstance(raw, dict):
        snap.priced_at = datetime.now(timezone.utc)
        await db.commit()
        return snap

    ticker = dict(meta.get("ticker") or {})
    prices = dict(meta.get("prices") or {})
    for sym, entry in ticker.items():
        rec = raw.get(to_market_symbol(sym))
        if isinstance(rec, dict) and rec.get("last") is not None:
            p = float(rec["last"])
            prices[sym] = p
            if isinstance(entry, dict):
                entry["p"] = p
                entry["c"] = float(rec.get("percentChange", entry.get("c", 0)))
    meta["ticker"] = ticker
    meta["prices"] = prices
    snap.meta = meta
    snap.priced_at = datetime.now(timezone.utc)
    await db.commit()
    # characters unchanged → push only the refreshed live numbers
    await _publish(workspace_id, snap.characters, ticker, meta.get("news_agg"))
    return snap
