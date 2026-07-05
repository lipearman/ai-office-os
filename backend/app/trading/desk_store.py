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

# Redis key for a cached ML vote P(up) per symbol (refreshed by a background job).
ML_VOTE_KEY = "desk:mlvote:{symbol}"
# Redis key tracking which watchlist symbols were AUTO-added from ML (so we can
# prune only those, never the user's manually-added coins).
AUTO_WATCHLIST_KEY = "desk:auto_watchlist:{workspace_id}"

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
from app.trading.service import (
    daily_opportunities, build_desk, market_breadth, is_early_turn, filter_pumped,
)
from app.trading.paper import unrealized, paper_stats
from app.trading.news import fetch_news, aggregate_sentiment
from app.trading.bitkub import BitkubClient, to_market_symbol, to_tradingview_symbol
from app.trading import desk_llm
from app.trading import auto_trader
from app.trading.graph import get_graph
from app.trading.state import DeskState
from app.trading.ml import ml_vote, ml_vote_pooled
from app.core.config import settings


async def _empty_aiter():
    """Async iterator that yields nothing — used to skip the graph stream."""
    return
    yield  # pragma: no cover — makes this an async generator


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


async def _discovered_symbols(limit: int, extra_excluded: set[str] | None = None) -> list[str]:
    """Market discovery: top-N Bitkub THB pairs by 24h volume (one ticker call).

    The desk scans these on top of the watchlist so good movers surface without
    being added by hand. `extra_excluded` = DB-backed exclusions (delisted coins
    found by the market watcher) merged with the static config denylist.
    """
    if limit <= 0:
        return []
    try:
        ticker = await BitkubClient().ticker()
        if not isinstance(ticker, dict):
            return []
        stable = {"USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD"}
        # delisting denylist — a DE-flagged coin spikes on volume but can't be held
        excluded = {s.strip().upper() for s in settings.DESK_SCAN_EXCLUDE_SYMBOLS}
        excluded |= extra_excluded or set()
        rows: list[tuple[str, float]] = []
        for mk, rec in ticker.items():
            if not isinstance(mk, str) or not mk.startswith("THB_") or not isinstance(rec, dict):
                continue
            try:
                tv = to_tradingview_symbol(mk)
            except Exception:
                continue
            # keep only proper BASE_THB pairs; skip stablecoins (no trading signal)
            # and any symbol on the delisting denylist
            if not tv.endswith("_THB") or tv.split("_")[0] in stable or tv.upper() in excluded:
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
    # DB-backed exclusions (delisted coins) apply to the watchlist too — a coin
    # that left the exchange must not keep a desk seat just because it's pinned
    try:
        from app.trading.market_watch import db_exclusions
        excluded = await db_exclusions(db)
    except Exception:
        excluded = set()
    if excluded:
        items = [it for it in items if it["symbol"].upper() not in excluded]
    if settings.DESK_SCAN_ENABLED:
        from app.trading import tuning
        top_n = int((await tuning.get_params(db))["DESK_SCAN_TOP_N"])
        wl = {it["symbol"] for it in items}
        discovered = await _discovered_symbols(top_n, excluded)
        items = items + [{"symbol": s, "cfg": None, "discovered": True}
                         for s in discovered if s not in wl]
    # per-coin timeframe map (weekly tf_tuner): a coin with a PROVEN better
    # heartbeat gets it here — the single funnel every consumer (signal scan,
    # ML training, pipeline) passes through, so all layers stay on one clock.
    if settings.PER_COIN_TF_ENABLED and items:
        from app.trading.tf_tuner import get_tf_map
        tf_map = await get_tf_map()
        if tf_map:
            for it in items:
                if not (it.get("cfg") or {}).get("timeframe") and it["symbol"] in tf_map:
                    it["cfg"] = {**(it.get("cfg") or {}), "timeframe": tf_map[it["symbol"]]}
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


async def _notify_market_events(opps: list[dict], news_agg: dict) -> None:
    """Regime flips + strong news → Telegram (deduped; regime state in Redis)."""
    from app.trading import notify
    regime = next((o["market_bias"] for o in opps if o.get("market_bias")), "neutral")
    try:
        r = await get_redis()
        prev = await r.get("notify:regime")
        prev = prev.decode() if isinstance(prev, bytes) else prev
        if prev and prev != regime:
            await notify.send(notify.fmt_regime(prev, regime), tier=2,
                              dedupe_key=f"regime:{regime}", dedupe_ttl=43200)
        await r.set("notify:regime", regime)
    except Exception:
        pass
    for a in (news_agg or {}).get("assets", []) or []:
        s = a.get("sentiment") or 0
        if (abs(s) >= settings.NOTIFY_NEWS_MIN_ABS_SENTIMENT
                and (a.get("count") or 0) >= settings.NOTIFY_NEWS_MIN_COUNT):
            head = (a.get("headlines") or [{}])[0].get("title", "")
            await notify.send(
                notify.fmt_news(a.get("asset", "?"), s, a.get("label", ""),
                                a.get("count", 0), head),
                tier=3,
                dedupe_key=f"news:{a.get('asset')}:{'p' if s > 0 else 'n'}")


async def compute_full(db: AsyncSession, workspace_id, force_graph: bool = False) -> DeskSnapshot:
    """Heavy tick: full analysis → LangGraph pipeline → upsert snapshot + detect alerts.

    `force_graph=True` runs the per-coin LangGraph even when DESK_GRAPH_ENABLED is
    off — used by the manual "Run Pipeline" trigger so users can see the step-by-step
    feed on demand, while the periodic tick stays fast/deterministic.
    """
    # watchlist (pinned) + market-scan discoveries (top-N by volume)
    items = await watchlist_plus_discovered(db, workspace_id)
    ml_votes = (await get_ml_votes([it["symbol"] for it in items])
                if (items and settings.DESK_ML_VOTE_ENABLED) else {})
    from app.trading import tuning
    scan_tf = str((await tuning.get_params(db))["DESK_SCAN_TIMEFRAME"])
    opps = (await daily_opportunities(items, ml_votes=ml_votes, default_tf=scan_tf)
            if items else [])
    prices = await _live_prices(items)
    positions = await _positions(db, workspace_id, prices)
    stats = await _stats(db, workspace_id)

    # auto paper-trading (opt-in) — run EARLY (before the slow LangGraph/LLM) and
    # commit immediately, so a watchdog cancel of the graph can't prevent trades
    try:
        await auto_trader.auto_close(db, workspace_id, prices)
        await auto_trader.auto_open(db, workspace_id, opps, prices)
        await db.commit()
    except Exception as e:
        log.warning("auto_paper.heavy_failed", error=str(e))

    assets = sorted({w["symbol"].split("_")[0] for w in items})
    news_items = await fetch_news()
    news_agg = aggregate_sentiment(news_items, assets or None)

    # Telegram: market-level intel — regime flips (tier 2) + unusually strong
    # per-asset news (tier 3). Best-effort; a Telegram hiccup can't hurt the tick.
    try:
        await _notify_market_events(opps, news_agg)
    except Exception as e:
        log.warning("notify.market_events_failed", error=str(e))

    # deterministic fallback (always computed, used when graph is unavailable)
    det_chars = build_desk(opps, positions, stats, news_agg, prices, _seed())

    snap = await get_snapshot(db, workspace_id)

    # ── LangGraph multi-agent pipeline (streamed step-by-step) — opt-in ──
    # When DESK_GRAPH_ENABLED is off, the stream is skipped and `characters`
    # stays the deterministic desk; enrich_commentary (below) adds AI flavor.
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
        stream = graph.astream(state) if (settings.DESK_GRAPH_ENABLED or force_graph) else _empty_aiter()
        async for step_data in stream:
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
        # Telegram: ML-confirmed fresh setup = tier-1 entry timing; a rule signal
        # the ML vetoes is a tier-2 near-miss (shows the system holding back)
        try:
            from app.trading import notify, tuning
            floor = (await tuning.get_params(db))["ML_VOTE_MIN_PROB"]
            mp = o.get("ml_prob")
            if mp is not None and mp >= floor:
                await notify.send(notify.fmt_entry(o), tier=1,
                                  dedupe_key=f"entry:{sym}")
            else:
                await notify.send(
                    f"🟡 เกือบครบเงื่อนไข — {sym}\n"
                    f"มีสัญญาณกฎ (win ~{o.get('win_chance_pct')}%) แต่ ML ให้ "
                    f"{mp if mp is not None else 'ไม่มีคะแนน'} < {floor} — ระบบขอรอ",
                    tier=2, dedupe_key=f"nearmiss:{sym}")
        except Exception as e:
            log.warning("notify.setup_failed", error=str(e))

    # stash analysis so the cheap price-only tick can rebuild without re-scanning
    fact_lines = {c["key"]: c["message"] for c in det_chars}
    ticker = await _live_ticker(items)

    # early-turn detector: breadth EMA + news vs the (slow) structural regime.
    # State lives in Redis so auto_open (next tick) can soften the bearish
    # extras; a flip in either direction notifies once (tier 2).
    breadth = market_breadth(ticker)
    early_turn = False
    if settings.REGIME_TURN_ENABLED and breadth is not None:
        try:
            from app.trading import notify
            r = await get_redis()
            prev = await r.get("regime:breadth_ema")
            prev_f = float(prev) if prev else breadth
            ema = round(prev_f + settings.REGIME_TURN_EMA_ALPHA * (breadth - prev_f), 4)
            await r.set("regime:breadth_ema", str(ema))
            regime = next((o["market_bias"] for o in opps if o.get("market_bias")), "neutral")
            senti = [a.get("sentiment") for a in (news_agg or {}).get("assets", [])
                     if a.get("sentiment") is not None]
            news_sent = sum(senti) / len(senti) if senti else None
            early_turn = is_early_turn(regime == "bearish", ema, news_sent,
                                       settings.REGIME_TURN_BREADTH)
            was = (await r.get("regime:early_turn")) in (b"1", "1")
            await r.set("regime:early_turn", "1" if early_turn else "0")
            # early-turn is a STATE, not a moment — send while it holds (dedupe
            # fires it once per 12h). A flip inside quiet hours is then delivered
            # right after 08:00 instead of being swallowed forever: the quiet-
            # hours gate runs BEFORE the dedupe key is written, so a muted
            # attempt leaves no key and the next tick simply retries.
            if early_turn:
                await notify.send(notify.fmt_early_turn(int(ema * 100), news_sent or 0.0),
                                  tier=2, dedupe_key="earlyturn:on", dedupe_ttl=43200)
            elif was and not early_turn:
                await notify.send("🌫️ ถอนสัญญาณกลับตัว — breadth อ่อนลง กลับไปเกณฑ์หมีเต็ม",
                                  tier=2, dedupe_key="earlyturn:off", dedupe_ttl=43200)
        except Exception as e:
            log.warning("early_turn_failed", error=str(e))

    meta = {"opps": opps, "stats": stats, "news_agg": news_agg, "prices": prices,
            "ticker": ticker,
            "breadth": breadth, "early_turn": early_turn,
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


async def run_pipeline_only(db: AsyncSession, workspace_id) -> str:
    """Run the per-coin LangGraph for the step-by-step Pipeline feed ONLY.

    Streams steps over WS + stores the run in Redis, but does NOT touch the desk
    snapshot, auto-trades, alerts or commentary — those belong to the heavy tick.
    Decoupled so it can run on its own (slower) schedule without slowing the desk.

    Single-flight: a Redis lock guarantees only one pipeline runs at a time per
    workspace (across the manual trigger + the auto job + multi-process worker),
    so the shared Ollama isn't hammered by overlapping runs. Best-effort — if
    Redis is unavailable the run still proceeds. Returns a short status string.
    """
    lock_key = f"desk:pipeline:lock:{workspace_id}"
    r = None
    try:
        r = await get_redis()
        got = await r.set(lock_key, "1", nx=True, ex=settings.PIPELINE_LOCK_TTL_SECONDS)
        if not got:
            log.info("desk_pipeline_skipped_locked", workspace=str(workspace_id))
            return "locked"
    except Exception:
        r = None  # Redis down → proceed without the lock (best-effort)

    try:
        items = await watchlist_plus_discovered(db, workspace_id)
        ml_votes = (await get_ml_votes([it["symbol"] for it in items])
                    if (items and settings.DESK_ML_VOTE_ENABLED) else {})
        from app.trading import tuning
        scan_tf = str((await tuning.get_params(db))["DESK_SCAN_TIMEFRAME"])
        opps = (await daily_opportunities(items, ml_votes=ml_votes, default_tf=scan_tf)
                if items else [])
        if not opps:
            return "no_opps"
        prices = await _live_prices(items)
        positions = await _positions(db, workspace_id, prices)
        stats = await _stats(db, workspace_id)
        news_agg = aggregate_sentiment(await fetch_news(), None)
        det_chars = build_desk(opps, positions, stats, news_agg, prices, _seed())

        graph = get_graph()
        state: DeskState = {
            "workspace_id": str(workspace_id),
            "watchlist_items": items, "prices": prices, "positions": positions,
            "stats": stats, "news_agg": news_agg, "news_summary": "",
            "ranked_opportunities": opps,
            "risk_verdict": "", "risk_level": "low", "can_trade": True,
            "model_verdict": "", "trade_decisions": [], "trader_message": "",
            "review_verdict": "", "exec_approved": True, "exec_quality": 0.5,
            "coach_message": "", "analyst_message": "", "analyst_levels": None,
            "market_bias": "neutral", "focus_timeframe": "1H",
            "characters": det_chars, "errors": [],
            "pipeline_status": "running", "pipeline_steps": [],
            "ranked_coins": [], "coin_index": 0, "coin_results": [],
            "current_coin": None, "agent_configs": {},
        }
        pipeline_steps: list[dict] = []
        run_status = "completed"
        try:
            async for step_data in graph.astream(state):
                for node_id, output in step_data.items():
                    if node_id == "__end__":
                        continue
                    coin_sym = state.get("current_coin", {}).get("symbol") if state.get("current_coin") else None
                    label = node_id
                    if coin_sym and node_id in ("news", "trader", "risk", "exec", "coach"):
                        label = f"{coin_sym}_{node_id}"
                    step_rec = {
                        "node_id": node_id, "label": label, "coin": coin_sym,
                        "coin_index": state.get("coin_index", 0),
                        "status": "completed", "ts": time.time(),
                        "report": _extract_report(node_id, output, state),
                    }
                    pipeline_steps.append(step_rec)
                    state.update(output)
                    if state.get("ranked_coins"):
                        step_rec["ranked_coins"] = [c["symbol"] for c in state["ranked_coins"]]
                    await _publish_pipeline_step(str(workspace_id), step_rec, "running")
        except Exception as e:
            log.warning("desk_pipeline_only_failed", workspace=str(workspace_id), error=str(e))
            run_status = "error"

        try:
            r2 = r or await get_redis()
            await _store_pipeline_run(r2, str(workspace_id), pipeline_steps, run_status)
            await _publish_pipeline_step(str(workspace_id), {"node_id": "__complete__", "status": run_status}, run_status)
        except Exception:
            pass
        return run_status
    finally:
        if r is not None:
            try:
                await r.delete(lock_key)
            except Exception:
                pass


async def refresh_ml_votes(db: AsyncSession, workspace_id) -> int:
    """Background: train the ML ensemble per candidate symbol and cache P(up).

    Heavy (XGBoost per coin) — runs on its own slow schedule with a single-flight
    lock; the scan only READS these cached votes (never trains inline). Returns
    how many votes were refreshed. Best-effort.
    """
    lock_key = f"desk:mlvote:lock:{workspace_id}"
    r = None
    try:
        r = await get_redis()
        if not await r.set(lock_key, "1", nx=True, ex=settings.ML_VOTE_LOCK_TTL_SECONDS):
            return 0
    except Exception:
        r = None
    try:
        items = await watchlist_plus_discovered(db, workspace_id)
        if not items:
            return 0
        client = BitkubClient()
        rr = r or await get_redis()
        from app.trading import tuning
        scan_tf = str((await tuning.get_params(db))["DESK_SCAN_TIMEFRAME"])
        candle_sets: dict[str, list] = {}
        for it in items:
            sym = it["symbol"]
            # ML must train on the SAME timeframe the signal scan reads,
            # or the vote confirms a different game than the one being played
            tf = (it.get("cfg") or {}).get("timeframe") or scan_tf
            try:
                candle_sets[sym] = await client.fetch_ohlcv(sym, tf, limit=1500)
            except Exception:
                continue
        votes: dict[str, float] = {}
        mode = "per_coin"
        if settings.ML_VOTE_POOLED:
            # one model over all coins pooled — steadier votes, one fit not N
            votes = ml_vote_pooled(candle_sets)
            if votes:
                mode = "pooled"
        if not votes:
            for sym, candles in candle_sets.items():
                prob = ml_vote(candles)
                if prob is not None:
                    votes[sym] = prob
        done = 0
        for sym, prob in votes.items():
            try:
                await rr.setex(ML_VOTE_KEY.format(symbol=sym),
                               settings.ML_VOTE_TTL_SECONDS, str(round(prob, 4)))
                done += 1
            except Exception:
                continue
        log.info("desk_ml_votes_refreshed", workspace=str(workspace_id),
                 count=done, mode=mode)
        try:
            await reconcile_auto_watchlist(db, workspace_id, votes, rr)
        except Exception as e:
            log.warning("auto_watchlist_failed", workspace=str(workspace_id), error=str(e))
        return done
    finally:
        if r is not None:
            try:
                await r.delete(lock_key)
            except Exception:
                pass


async def get_ml_votes(symbols: list[str]) -> dict[str, float]:
    """Read cached ML votes {symbol: P(up)} for the given symbols (best-effort)."""
    if not symbols:
        return {}
    try:
        r = await get_redis()
    except Exception:
        return {}
    out: dict[str, float] = {}
    for s in symbols:
        try:
            v = await r.get(ML_VOTE_KEY.format(symbol=s))
            if v is not None:
                out[s] = float(v)
        except Exception:
            continue
    return out


async def reconcile_auto_watchlist(db: AsyncSession, workspace_id, votes: dict[str, float], r=None) -> None:
    """Non-destructively pin the coins the ML model likes most into the watchlist.

    `desired` = top-N symbols with P(up) >= ML_VOTE_MIN_PROB. We add the desired
    ones that aren't already in the watchlist, and remove ONLY symbols we added
    automatically in a previous cycle (tracked in Redis) that are no longer
    desired. Manually-added coins are never touched.
    """
    if not settings.AUTO_WATCHLIST_FROM_ML:
        return
    from app.trading import tuning
    tp = await tuning.get_params(db)
    floor = tp["ML_VOTE_MIN_PROB"]
    ranked = sorted(((s, p) for s, p in votes.items() if p >= floor), key=lambda x: -x[1])
    # pump guard: momentum features make the pooled ML love a coin right AFTER
    # it already ran (EPIC: +32% pump -> ML 0.55 -> radar ping mid-dump). Coins
    # up >= RADAR_PUMP_MAX_24H_CHG in 24h drop out of `desired`, so they never
    # auto-pin or ping — and an earlier-pinned pump prunes itself next pass.
    chg24: dict[str, float] = {}
    try:
        tkr = await BitkubClient().ticker()
        if isinstance(tkr, dict):
            for s, _ in ranked:
                rec = tkr.get(to_market_symbol(s))
                if isinstance(rec, dict) and rec.get("percentChange") is not None:
                    chg24[s] = float(rec["percentChange"])
    except Exception:
        pass
    guarded = filter_pumped(ranked, chg24, settings.RADAR_PUMP_MAX_24H_CHG)
    if len(guarded) < len(ranked):
        log.info("auto_watchlist.pump_guard",
                 skipped=[s for s, _ in ranked if s not in {g for g, _ in guarded}])
    desired = [s for s, _ in guarded[: int(tp["AUTO_WATCHLIST_TOP_N"])]]

    res = await db.execute(select(WatchlistItem).where(WatchlistItem.workspace_id == workspace_id))
    current = {w.symbol: w for w in res.scalars().all()}

    r = r or await get_redis()
    key = AUTO_WATCHLIST_KEY.format(workspace_id=workspace_id)
    try:
        raw = await r.get(key)
        prev_auto = set(json.loads(raw)) if raw else set()
    except Exception:
        prev_auto = set()

    to_add = [s for s in desired if s not in current]
    to_remove = [s for s in prev_auto if s not in desired and s in current]

    for s in to_add:
        db.add(WatchlistItem(workspace_id=workspace_id, symbol=s, enabled=True, strategies=[]))
    for s in to_remove:
        await db.delete(current[s])
    if to_add or to_remove:
        await db.commit()

    new_auto = (prev_auto - set(to_remove)) | set(to_add)
    try:
        await r.setex(key, 7 * 24 * 3600, json.dumps(sorted(new_auto)))
    except Exception:
        pass
    if to_add or to_remove:
        log.info("auto_watchlist_reconciled", workspace=str(workspace_id),
                 added=to_add, removed=to_remove)
    # Telegram tier 2: a coin crossing the ML bar onto the radar is worth a ping
    # (with its 24h move attached, so a reader can spot a late entry instantly)
    for s in to_add:
        try:
            from app.trading import notify
            await notify.send(notify.fmt_radar(s, votes.get(s, 0.0), chg24.get(s)),
                              tier=2, dedupe_key=f"radar:{s}")
        except Exception:
            pass


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

    # auto paper-trading (opt-in): responsive stop/target exits on the 20s tick
    try:
        await auto_trader.auto_close(db, workspace_id, prices)
    except Exception as e:
        log.warning("auto_paper.fast_failed", error=str(e))

    await db.commit()
    # characters unchanged → push only the refreshed live numbers
    await _publish(workspace_id, snap.characters, ticker, meta.get("news_agg"))
    return snap
