import asyncio
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from app.core.database import get_db
from app.models.user import User
from app.models.watchlist import WatchlistItem
from app.models.paper import PaperTrade
from app.models.trading_state import TradingAlert, DeskLLMConfig, AlertWebhook, ScanExclusion
from app.trading import alert_webhook, tuning
from app.schemas.trading import (
    WatchlistItemOut, WatchlistItemCreate, WatchlistItemUpdate, PaperOpen,
)
from app.trading.paper import fill_open, close_pnl, unrealized, paper_stats, calibration_stats
from app.trading.news import fetch_news, aggregate_sentiment
from app.trading import desk_store
from app.core.config import settings
from datetime import datetime, timezone
from app.api.deps import get_current_user
from app.trading.bitkub import BitkubClient, to_tradingview_symbol, TIMEFRAMES
from app.trading.service import (
    analyze_with_brief, scan_symbols, backtest_symbol, optimize_symbol, ml_symbol,
    daily_opportunity, daily_opportunities,
)

router = APIRouter(prefix="/trading", tags=["trading"])


# ── reference data ──────────────────────────────────────────────
@router.get("/symbols")
async def list_symbols(current_user: User = Depends(get_current_user)):
    """Available Bitkub symbols in tradingview format (e.g. BTC_THB)."""
    client = BitkubClient()
    raw = await client.list_symbols()
    out = []
    for s in raw:
        market = s.get("symbol", "")            # e.g. "THB_BTC"
        out.append({
            "market": market,
            "symbol": to_tradingview_symbol(market),
            "info": s.get("info", ""),
        })
    return out


# ── scan exclusions (DB-backed delisting denylist) ──────────────
@router.get("/exclusions")
async def list_exclusions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Denylist the market scan skips (delisted coins). Managed by the daily
    market watcher; rows can also be added/removed here without a redeploy."""
    res = await db.execute(select(ScanExclusion).order_by(ScanExclusion.created_at.desc()))
    rows = res.scalars().all()
    return {"exclusions": [
        {"id": str(x.id), "symbol": x.symbol, "reason": x.reason,
         "source": x.source, "created_at": x.created_at.isoformat() if x.created_at else None}
        for x in rows
    ], "config_static": settings.DESK_SCAN_EXCLUDE_SYMBOLS}


@router.post("/exclusions", status_code=201)
async def add_exclusion(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    symbol = str(payload.get("symbol", "")).strip().upper()
    if not symbol or "_" not in symbol:
        raise HTTPException(status_code=422, detail="symbol ต้องเป็นรูปแบบ BASE_THB เช่น SYND_THB")
    existing = await db.execute(select(ScanExclusion).where(ScanExclusion.symbol == symbol))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"{symbol} อยู่ใน denylist แล้ว")
    db.add(ScanExclusion(symbol=symbol, reason=str(payload.get("reason", ""))[:200],
                         source="manual"))
    await db.commit()
    return {"symbol": symbol, "status": "added"}


@router.delete("/exclusions/{symbol}")
async def remove_exclusion(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(delete(ScanExclusion).where(ScanExclusion.symbol == symbol.upper()))
    await db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"{symbol} ไม่อยู่ใน denylist")
    return {"symbol": symbol.upper(), "status": "removed"}


# ── coach + tunings (runtime-tunable params, adjusted from real results) ──
@router.get("/tunings")
async def list_tunings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Effective params (config defaults + coach overrides) + the raw overrides."""
    from app.models.trading_state import DeskTuning
    res = await db.execute(select(DeskTuning).order_by(DeskTuning.key))
    rows = res.scalars().all()
    return {
        "effective": await tuning.get_params(db),
        "bounds": {k: {"min": lo, "max": hi} for k, (lo, hi) in tuning.TUNABLE.items()},
        "overrides": [
            {"key": x.key, "value": x.value, "reason": x.reason, "source": x.source,
             "updated_at": x.updated_at.isoformat() if x.updated_at else None}
            for x in rows
        ],
    }


@router.put("/tunings/{key}")
async def set_tuning(
    key: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually override a tunable param (clamped to its bounds, no redeploy)."""
    key = key.upper()
    if key not in tuning.TUNABLE:
        raise HTTPException(status_code=422,
                            detail=f"ปรับได้เฉพาะ: {', '.join(tuning.TUNABLE)}")
    try:
        value = float(payload.get("value"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="value ต้องเป็นตัวเลข")
    stored = await tuning.set_param(db, key, value,
                                    str(payload.get("reason", "ปรับเอง"))[:200],
                                    source="manual")
    await db.commit()
    lo, hi = tuning.TUNABLE[key]
    return {"key": key, "requested": value, "stored": stored,
            "clamped": stored != value, "bounds": {"min": lo, "max": hi}}


@router.post("/coach/run/workspace/{workspace_id}")
async def run_coach_now(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run one coaching pass immediately (bypasses the weekly stamp)."""
    from app.trading import coach
    return await coach.run_coach(db, workspace_id, force=True)


# ── single-symbol analysis ──────────────────────────────────────
@router.get("/analyze/{symbol}")
async def analyze(symbol: str, current_user: User = Depends(get_current_user)):
    """Full Multi-Timeframe top-down analysis + daily brief for one symbol."""
    client = BitkubClient()
    result = await analyze_with_brief(client, symbol)
    if not result:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    return result


# ── backtest ────────────────────────────────────────────────────
@router.get("/backtest/{symbol}")
async def backtest(
    symbol: str,
    timeframe: str = "4H",
    limit: int = 1500,
    current_user: User = Depends(get_current_user),
):
    """Run the EMA-pullback backtest over history → trades + stats."""
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"timeframe must be one of {list(TIMEFRAMES)}")
    limit = max(100, min(limit, 2000))
    client = BitkubClient()
    result = await backtest_symbol(client, symbol, timeframe, limit)
    if not result:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    return result


# ── auto-optimizer (walk-forward) ───────────────────────────────
@router.get("/optimize/{symbol}")
async def optimize_strategy(
    symbol: str,
    timeframe: str = "1H",
    limit: int = 2000,
    current_user: User = Depends(get_current_user),
):
    """Walk-forward param optimization → suggested params + OOS evidence.

    Human gate: returns a suggestion only; does not change the live strategy.
    """
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"timeframe must be one of {list(TIMEFRAMES)}")
    limit = max(500, min(limit, 2000))
    client = BitkubClient()
    result = await optimize_symbol(client, symbol, timeframe, limit)
    if not result:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    return result


# ── ML ensemble report ──────────────────────────────────────────
@router.get("/ml/{symbol}")
async def ml_strategy(
    symbol: str,
    timeframe: str = "1H",
    limit: int = 2000,
    horizon: int = 8,
    current_user: User = Depends(get_current_user),
):
    """ML ensemble (XGBoost+Logistic) walk-forward report + rule-vs-ensemble.

    Human gate: evidence only; the model is an advisory vote, it does not trade.
    """
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"timeframe must be one of {list(TIMEFRAMES)}")
    limit = max(500, min(limit, 2000))
    client = BitkubClient()
    result = await ml_symbol(client, symbol, timeframe, limit, horizon)
    if not result:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    return result


# ── watchlist CRUD ──────────────────────────────────────────────
@router.get("/watchlist/workspace/{workspace_id}", response_model=list[WatchlistItemOut])
async def list_watchlist(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WatchlistItem).where(WatchlistItem.workspace_id == workspace_id)
    )
    return [WatchlistItemOut.model_validate(w) for w in result.scalars().all()]


@router.post("/watchlist/workspace/{workspace_id}", response_model=WatchlistItemOut, status_code=201)
async def add_watchlist(
    workspace_id: uuid.UUID,
    data: WatchlistItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    symbol = to_tradingview_symbol(data.symbol)
    # avoid duplicates per workspace
    existing = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.workspace_id == workspace_id,
            WatchlistItem.symbol == symbol,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"{symbol} already in watchlist")

    item = WatchlistItem(
        workspace_id=workspace_id,
        symbol=symbol,
        enabled=data.enabled,
        strategies=data.strategies,
    )
    db.add(item)
    await db.flush()
    return WatchlistItemOut.model_validate(item)


@router.patch("/watchlist/{item_id}", response_model=WatchlistItemOut)
async def update_watchlist(
    item_id: uuid.UUID,
    data: WatchlistItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(WatchlistItem).where(WatchlistItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    return WatchlistItemOut.model_validate(item)


@router.delete("/watchlist/{item_id}", status_code=204)
async def delete_watchlist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(WatchlistItem).where(WatchlistItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    await db.delete(item)


# ── signal scanner ──────────────────────────────────────────────
@router.get("/scan/workspace/{workspace_id}")
async def scan_watchlist(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Scan every enabled watchlist symbol → ranked signals (BUY first)."""
    result = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.workspace_id == workspace_id,
            WatchlistItem.enabled == True,  # noqa: E712
        )
    )
    items = result.scalars().all()
    symbols = [w.symbol for w in items]
    if not symbols:
        return {"results": [], "count": 0}
    # map symbol → assigned strategy (from optimizer "Apply")
    assigned: dict[str, dict | None] = {}
    for w in items:
        cfg = (w.strategies or [None])[0] if w.strategies else None
        assigned[w.symbol] = (
            {"strategy": cfg.get("strategy"), "timeframe": cfg.get("timeframe")}
            if isinstance(cfg, dict) else None
        )
    results = await scan_symbols(symbols)
    for r in results:
        r["assigned_strategy"] = assigned.get(r["symbol"])
    return {"results": results, "count": len(results)}


# ── today's opportunities ───────────────────────────────────────
@router.get("/opportunity/{symbol}")
async def opportunity(
    symbol: str,
    timeframe: str = "1H",
    current_user: User = Depends(get_current_user),
):
    """ประเมินโอกาสชนะวันนี้ของ symbol (default strategy)."""
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"timeframe must be one of {list(TIMEFRAMES)}")
    client = BitkubClient()
    result = await daily_opportunity(client, symbol, cfg=None, default_tf=timeframe)
    if not result:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    return result


@router.get("/opportunities/workspace/{workspace_id}")
async def opportunities(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """หาเหรียญที่มีโอกาสชนะวันนี้ — watchlist + market-scan (top-N by volume) → จัดอันดับ."""
    # same source as the /office desk: watchlist (pinned) + scan discoveries
    items = await desk_store.watchlist_plus_discovered(db, workspace_id)
    if not items:
        return {"results": [], "count": 0}
    results = await daily_opportunities(items)
    return {"results": results, "count": len(results)}


# ── trading desk (read-only view of worker-computed state) ──────
@router.get("/desk/workspace/{workspace_id}")
async def trading_desk(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """7 trading-desk characters (for /office).

    Read-only: the background worker computes and persists this; here we just
    return the latest snapshot. If the worker hasn't produced one yet, signal
    `warming_up` so the UI can show a pending state instead of an error.
    """
    snap = await desk_store.get_snapshot(db, workspace_id)
    if snap is None:
        return {"characters": [], "status": "warming_up", "computed_at": None}
    meta = snap.meta or {}
    opps = meta.get("opps", [])
    # always return a fresh live ticker (with sparkline closes) regardless of snapshot age
    items = await desk_store._watchlist_items(db, workspace_id)
    if not items:
        # fallback: extract symbols from meta.opps
        items = [{"symbol": o["symbol"]} for o in opps if o.get("symbol")]
    live_ticker = await desk_store._live_ticker(items)
    # "watch" = coins the ML model likes (P_up high) that have no entry signal yet
    # (tuned floor — must match the auto-trader's real gate, or "go" lies)
    floor = (await tuning.get_params(db))["ML_VOTE_MIN_PROB"]
    watch = sorted(
        ({"symbol": o.get("symbol"), "ml_prob": o.get("ml_prob"),
          "win_chance_pct": o.get("win_chance_pct"), "price": o.get("price"),
          "label": o.get("label"), "market_bias": o.get("market_bias")}
         for o in opps if not o.get("signal_today") and (o.get("ml_prob") or 0) >= floor),
        key=lambda x: -(x["ml_prob"] or 0),
    )[:6]
    return {
        "characters": snap.characters or [],
        "ticker": live_ticker or meta.get("ticker", {}),
        "news_agg": meta.get("news_agg", {}),
        "watch": watch,
        "game_summary": {**_game_summary(opps, floor),
                         "breadth": meta.get("breadth"),
                         "early_turn": bool(meta.get("early_turn"))},
        "status": "ready",
        "computed_at": snap.computed_at.isoformat() if snap.computed_at else None,
    }


def _game_summary(opps: list[dict], floor: float) -> dict:
    """One-glance "state of the game" from the worker's scanned opportunities.

    Surfaces what both engines see right now: the BTC regime (shared market bias),
    how many coins fired an entry signal, the ML model's top P(up) picks (even when
    all sit below the confirm floor — that itself is the signal in a weak market),
    the single best-structured coin by opportunity_score, and a wait/go verdict.
    """
    regime = "neutral"
    for o in opps:
        if o.get("market_bias"):
            regime = o["market_bias"]
            break
    signals = [o for o in opps if o.get("signal_today")]
    top_ml = sorted(
        ({"symbol": o.get("symbol"), "ml_prob": o.get("ml_prob")}
         for o in opps if o.get("ml_prob") is not None),
        key=lambda x: -(x["ml_prob"] or 0),
    )[:3]
    pick = max(opps, key=lambda o: (o.get("opportunity_score") or 0), default=None)
    top_pick = None
    if pick and pick.get("symbol"):
        top_pick = {
            "symbol": pick.get("symbol"),
            "opportunity_score": pick.get("opportunity_score"),
            "ml_prob": pick.get("ml_prob"),
            "signal_today": bool(pick.get("signal_today")),
        }
    # "go" only when a coin both fired a signal AND the ML model confirms it
    go = any((o.get("ml_prob") or 0) >= floor for o in signals)
    return {
        "regime": regime,
        "scanned": len(opps),
        "signals_today": len(signals),
        "top_ml": top_ml,
        "top_pick": top_pick,
        "ml_floor": floor,
        "verdict": "go" if go else "wait",
    }


# ── desk pipeline definition (LangGraph workflow) ──────────────────
_DESK_PIPELINE = {
    "nodes": [
        {"id": "monitor", "name": "Model Monitor",     "emoji": "📉", "role": "advisory", "description": "Scan หา 10 เหรียญที่ดีที่สุดของวันนี้"},
        {"id": "analyst", "name": "Market Analyst",    "emoji": "📊", "role": "advisory", "description": "วิเคราะห์ภาพรวมตลาดและแนวโน้ม"},
        {"id": "news",    "name": "News & Sentiment",  "emoji": "📰", "role": "advisory", "description": "ตรวจสอบข่าว/sentiment ทีละเหรียญ"},
        {"id": "trader",  "name": "Trader",            "emoji": "🤖", "role": "engine",   "description": "หาจุดเข้าซื้อที่ดีที่สุดสำหรับเหรียญนั้น"},
        {"id": "risk",    "name": "Risk Officer",      "emoji": "🛡️", "role": "advisory", "description": "ประเมินความเสี่ยงของพอร์ต"},
        {"id": "exec",    "name": "Execution Reviewer","emoji": "🔍", "role": "advisory", "description": "Backtest กลยุทธ์ ดู WIN/LOSS"},
        {"id": "coach",   "name": "Coach",             "emoji": "🎯", "role": "advisory", "description": "ปรับกลยุทธ์และระวังความเสี่ยงสูง"},
        {"id": "summary", "name": "Summary",           "emoji": "📋", "role": "advisory", "description": "สรุปผลของแต่ละเหรียญ"},
    ],
    "edges": [
        {"from": "monitor", "to": "analyst"},
        {"from": "analyst", "to": "news"},
        {"from": "news",    "to": "trader"},
        {"from": "trader",  "to": "risk"},
        {"from": "risk",    "to": "exec"},
        {"from": "exec",    "to": "coach"},
        {"from": "coach",   "to": "news"},
        {"from": "coach",   "to": "summary"},
        {"from": "summary", "to": "end"},
    ],
}


@router.get("/desk/pipeline")
async def desk_pipeline(
    workspace_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """LangGraph multi-agent pipeline structure + latest run status."""
    from app.agents.llm import _FallbackLLM, get_llm
    from app.core.redis import get_redis
    from app.trading.desk_store import PIPELINE_RUN_KEY
    from app.models.agent import Agent

    # override node descriptions from agents table
    nodes = list(_DESK_PIPELINE["nodes"])
    if workspace_id:
        try:
            ws_uuid = uuid.UUID(workspace_id)
            agent_res = await db.execute(
                select(Agent).where(
                    Agent.workspace_id == ws_uuid,
                    Agent.agent_type.in_([n["id"] for n in nodes]),
                )
            )
            agent_map = {a.agent_type: a for a in agent_res.scalars().all()}
            nodes = [
                {**n, "description": agent_map[n["id"]].description}
                if n["id"] in agent_map and agent_map[n["id"]].description else n
                for n in nodes
            ]
        except Exception:
            pass

    llm_ok = not isinstance(get_llm(), _FallbackLLM)
    result = {**_DESK_PIPELINE, "nodes": nodes, "llm_available": llm_ok, "run": None}
    if workspace_id:
        try:
            r = await get_redis()
            raw = await r.get(PIPELINE_RUN_KEY.format(workspace_id=workspace_id))
            if raw:
                result["run"] = json.loads(raw)
        except Exception:
            pass
    return result


# ── agent meeting (post-pipeline discussion) ───────────────────
@router.post("/desk/workspace/{workspace_id}/meeting")
async def trigger_meeting(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate agent meeting commentary using latest snapshot data.

    Called by frontend after pipeline completes. Returns {role_key: text}
    and pushes each as a desk.update with commentary so realtime UI gets it.
    """
    from app.models.agent import Agent
    from app.trading import desk_llm
    from app.trading.desk_store import get_snapshot, _watchlist_items, _live_ticker

    snap = await get_snapshot(db, workspace_id)
    if snap is None:
        raise HTTPException(status_code=404, detail="No snapshot yet")

    meta = snap.meta or {}
    characters = snap.characters or []

    # per-role LLM overrides
    agent_res = await db.execute(
        select(Agent).where(
            Agent.workspace_id == workspace_id,
            Agent.agent_type.in_([c["key"] for c in characters if c.get("key")]),
        )
    )
    role_overrides: dict[str, dict] = {}
    for a in agent_res.scalars().all():
        cfg = {}
        if a.model_provider and a.model_provider != "auto":
            cfg["provider"] = a.model_provider
        if a.model_name and a.model_name != "auto":
            cfg["model"] = a.model_name
        role_overrides[a.agent_type] = cfg

    # include fresh ticker in meta for the meeting
    items = await _watchlist_items(db, workspace_id)
    if items:
        live_ticker = await _live_ticker(items)
        meta = {**meta, "ticker": live_ticker}

    commentary = await desk_llm.meeting_commentary(characters, meta, role_overrides)

    return {"commentary": commentary}


# ── desk chat (ask questions about pipeline data) ──────────────
_CHAT_SYSTEM = """คุณคือทีมวิเคราะห์การเทรดคริปโตที่มีสมาชิก 7 คน:
- 📊 Market Analyst: วิเคราะห์แนวโน้มตลาด แนวรับแนวต้าน
- 📰 News & Sentiment: วิเคราะห์ข่าวและ sentiment
- 🤖 Trader: วิเคราะห์จุดเข้าซื้อ/ขาย
- 🛡️ Risk Officer: ประเมินความเสี่ยง
- 🎯 Coach: ให้คำแนะนำเชิงกลยุทธ์
- 📉 Model Monitor: วิเคราะห์โอกาสเหรียญ
- 🔍 Execution Reviewer: ตรวจสอบประสิทธิภาพ

เมื่อมีคำถามจากผู้ใช้ ให้ทุกคนช่วยกันตอบโดยใช้ข้อมูลที่มี แต่ละคนแสดงความเห็นตามบทบาทของตน
ตอบสั้น กระชับ เป็นธรรมชาติ ภาษาไทย"""


@router.post("/desk/workspace/{workspace_id}/chat")
async def desk_chat(
    workspace_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Answer user questions about pipeline data using all agent personas."""
    from langchain_core.messages import SystemMessage, HumanMessage
    from app.agents.llm import get_llm
    from app.trading.desk_store import get_snapshot, _watchlist_items, _live_ticker

    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    snap = await get_snapshot(db, workspace_id)
    if snap is None:
        raise HTTPException(status_code=404, detail="No snapshot yet")

    meta = snap.meta or {}
    characters = snap.characters or []

    # build context
    ctx_lines = ["ข้อมูลล่าสุดจาก Pipeline:"]
    prices = meta.get("prices", {})
    if prices:
        ctx_lines.append("ราคา:")
        for sym, p in sorted(prices.items()):
            ctx_lines.append(f"  {sym}: {p:,.2f}")

    ticker = meta.get("ticker", {})
    if ticker:
        ctx_lines.append("เปลี่ยนแปลง:")
        for sym, t in sorted(ticker.items()):
            chg = t.get("c", 0)
            ctx_lines.append(f"  {sym}: {'+' if chg >= 0 else ''}{chg:.2f}%")

    opps = meta.get("opps", [])
    if opps:
        ctx_lines.append("โอกาสวันนี้:")
        for o in opps[:5]:
            ctx_lines.append(f"  {o.get('symbol', '?')}: {o.get('strategy', '?')} win={o.get('win_chance_pct', 0)}%")

    news = meta.get("news_agg", {})
    assets = news.get("assets", [])
    if assets:
        ctx_lines.append("Sentiment:")
        for a in assets[:3]:
            ctx_lines.append(f"  {a.get('asset', '?')}: bullish={a.get('bullish', 0)} bearish={a.get('bearish', 0)}")

    stats = meta.get("stats", {})
    if stats:
        ctx_lines.append(
            f"สถิติ: win={stats.get('win_rate', 0):.1f}% "
            f"profit={stats.get('total_pnl_thb', 0):,.0f} THB "
            f"trades={stats.get('total_trades', 0)}"
        )

    ctx_lines.append("ข้อเท็จจริงของสมาชิก:")
    for c in characters:
        msg = c.get("message", "")
        if msg:
            ctx_lines.append(f"  {c.get('name', c.get('key', '?'))}: {msg}")

    context = "\n".join(ctx_lines)

    try:
        llm = get_llm()
        resp = await llm.ainvoke([
            SystemMessage(content=_CHAT_SYSTEM),
            HumanMessage(content=f"ข้อมูล Pipeline:\n{context}\n\nคำถามผู้ใช้:\n{message}"),
        ])
        answer = resp.content if isinstance(resp.content, str) else str(resp.content)
    except Exception as e:
        answer = f"ขออภัย ไม่สามารถตอบได้ในตอนนี้: {str(e)}"

    return {"response": answer, "context": context}
@router.get("/desk/pipeline/status")
async def pipeline_status():
    """Check if the background scheduler + realtime subscriber are running."""
    from app.trading.scheduler import _scheduler as sched
    if sched is None:
        return {"scheduler": "stopped", "jobs": []}
    jobs = []
    for j in sched.get_jobs():
        jobs.append({"id": j.id, "next_run": str(j.next_run_time) if j.next_run_time else None})
    from app.trading.realtime import _task as rt_task
    realtime = "running" if (rt_task and not rt_task.done()) else ("done" if rt_task else "not started")
    return {"scheduler": "running", "jobs": jobs, "realtime": realtime}


# ── manual pipeline trigger (fire-and-forget) ──────────────────
@router.post("/desk/pipeline/trigger")
async def trigger_pipeline(workspace_id: str):
    """Start a pipeline run in background and return immediately."""
    from app.core.database import AsyncSessionLocal
    from app.trading import desk_store

    async def _run():
        async with AsyncSessionLocal() as db:
            try:
                # pipeline-feed only: runs the LangGraph for the step-by-step feed
                # without overwriting the desk snapshot, and shares the single-flight
                # lock with the auto pipeline job so runs never overlap.
                await desk_store.run_pipeline_only(db, uuid.UUID(workspace_id))
            except Exception:
                pass

    asyncio.create_task(_run())
    return {"status": "accepted", "message": "pipeline started in background"}


# ── per-role desk LLM config (which provider/model each character uses) ─
@router.get("/desk/llm-config/workspace/{workspace_id}")
async def get_desk_llm_config(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(DeskLLMConfig).where(DeskLLMConfig.workspace_id == workspace_id)
    )
    cfg = res.scalar_one_or_none()
    return {"roles": (cfg.roles if cfg else {})}


@router.put("/desk/llm-config/workspace/{workspace_id}")
async def set_desk_llm_config(
    workspace_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """payload: {"roles": {role_key: {"provider": "...", "model": "..."}}}."""
    roles = payload.get("roles", {}) if isinstance(payload, dict) else {}
    res = await db.execute(
        select(DeskLLMConfig).where(DeskLLMConfig.workspace_id == workspace_id)
    )
    cfg = res.scalar_one_or_none()
    if cfg is None:
        cfg = DeskLLMConfig(workspace_id=workspace_id, roles=roles)
        db.add(cfg)
    else:
        cfg.roles = roles
    await db.commit()
    return {"roles": roles}


# ── server-side alerts (detected by the worker, stored in DB) ───
@router.get("/alerts/workspace/{workspace_id}")
async def get_alerts(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alerts สะสมจาก worker (เตือนแม้ปิดหน้า) + จำนวนที่ยังไม่อ่าน."""
    res = await db.execute(
        select(TradingAlert)
        .where(TradingAlert.workspace_id == workspace_id)
        .order_by(TradingAlert.created_at.desc())
        .limit(50)
    )
    rows = res.scalars().all()
    alerts = [
        {
            "id": a.id.hex, "symbol": a.symbol, "strategy": a.strategy,
            "timeframe": a.timeframe, "win_chance_pct": a.win_chance_pct,
            "label": a.label, "text": a.text, "is_read": a.is_read,
            "ts": a.created_at.timestamp() if a.created_at else None,
        }
        for a in rows
    ]
    return {"alerts": alerts, "unread": sum(1 for a in rows if not a.is_read)}


@router.post("/alerts/{alert_id}/read", status_code=204)
async def mark_alert_read(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(TradingAlert).where(TradingAlert.id == alert_id).values(is_read=True)
    )
    await db.commit()


@router.post("/alerts/workspace/{workspace_id}/read-all", status_code=204)
async def mark_all_alerts_read(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(TradingAlert)
        .where(TradingAlert.workspace_id == workspace_id, TradingAlert.is_read == False)  # noqa: E712
        .values(is_read=True)
    )
    await db.commit()


@router.delete("/alerts/workspace/{workspace_id}", status_code=204)
async def clear_alerts(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        delete(TradingAlert).where(TradingAlert.workspace_id == workspace_id)
    )
    await db.commit()


# ── outbound alert webhook (opt-in; user sets their own URL) ────
@router.get("/alerts/webhook/workspace/{workspace_id}")
async def get_alert_webhook(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wh = (await db.execute(
        select(AlertWebhook).where(AlertWebhook.workspace_id == workspace_id)
    )).scalar_one_or_none()
    return {"url": wh.url if wh else "", "enabled": wh.enabled if wh else False}


@router.put("/alerts/webhook/workspace/{workspace_id}")
async def set_alert_webhook(
    workspace_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    url = (payload.get("url") or "").strip()
    enabled = bool(payload.get("enabled"))
    if enabled and not alert_webhook.valid_webhook_url(url):
        raise HTTPException(status_code=400, detail="URL ต้องขึ้นต้นด้วย http:// หรือ https://")
    wh = (await db.execute(
        select(AlertWebhook).where(AlertWebhook.workspace_id == workspace_id)
    )).scalar_one_or_none()
    if wh is None:
        wh = AlertWebhook(workspace_id=workspace_id, url=url, enabled=enabled)
        db.add(wh)
    else:
        wh.url = url
        wh.enabled = enabled
    await db.commit()
    return {"url": url, "enabled": enabled}


@router.post("/alerts/webhook/workspace/{workspace_id}/test")
async def test_alert_webhook(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wh = (await db.execute(
        select(AlertWebhook).where(AlertWebhook.workspace_id == workspace_id)
    )).scalar_one_or_none()
    if not wh or not wh.url:
        raise HTTPException(status_code=400, detail="ยังไม่ได้ตั้งค่า webhook URL")
    ok = await alert_webhook.post_alerts(
        wh.url, workspace_id,
        [{"symbol": "TEST", "text": "🔔 ทดสอบ webhook จาก AI Office OS trading desk"}],
    )
    return {"ok": ok}


# ── news & sentiment ────────────────────────────────────────────
@router.get("/news")
async def news_all(current_user: User = Depends(get_current_user)):
    """ข่าวคริปโตล่าสุด + sentiment รายเหรียญ (ทุกเหรียญ)."""
    items = await fetch_news()
    agg = aggregate_sentiment(items)
    return {"items": [i.to_dict() for i in items[:30]], **agg}


@router.get("/news/workspace/{workspace_id}")
async def news_workspace(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """ข่าว + sentiment กรองเฉพาะเหรียญใน watchlist."""
    res = await db.execute(
        select(WatchlistItem).where(WatchlistItem.workspace_id == workspace_id)
    )
    assets = sorted({w.symbol.split("_")[0] for w in res.scalars().all()})
    items = await fetch_news()
    agg = aggregate_sentiment(items, assets or None)
    # only headlines mentioning watchlist assets
    rel = [i for i in items if not assets or any(a in assets for a in i.assets)]
    return {"items": [i.to_dict() for i in rel[:30]], "assets_filter": assets, **agg}


# ── paper trading ───────────────────────────────────────────────
def _trade_out(t: PaperTrade) -> dict:
    return {
        "id": str(t.id), "symbol": t.symbol, "strategy": t.strategy,
        "timeframe": t.timeframe, "side": t.side, "status": t.status,
        "entry_at": t.entry_at.isoformat() if t.entry_at else None,
        "entry_price": t.entry_price, "size_thb": t.size_thb, "qty": t.qty,
        "stop": t.stop, "target": t.target,
        "exit_at": t.exit_at.isoformat() if t.exit_at else None,
        "exit_price": t.exit_price, "exit_reason": t.exit_reason,
        "pnl_thb": t.pnl_thb, "pnl_pct": t.pnl_pct, "result": t.result,
        "rationale": t.rationale,
    }


@router.post("/paper/open/workspace/{workspace_id}", status_code=201)
async def paper_open(
    workspace_id: uuid.UUID,
    data: PaperOpen,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """เปิด paper position ที่ราคาตลาดปัจจุบัน (หัก fee 0.25%)."""
    symbol = to_tradingview_symbol(data.symbol)
    client = BitkubClient()
    price = await client.last_price(symbol)
    if not price:
        raise HTTPException(status_code=404, detail=f"ดึงราคา {symbol} ไม่ได้")
    fill = fill_open(price, data.size_thb)
    t = PaperTrade(
        workspace_id=workspace_id, symbol=symbol, strategy=data.strategy,
        timeframe=data.timeframe, side="BUY", entry_price=price,
        size_thb=data.size_thb, qty=fill["qty"], stop=data.stop, target=data.target,
        fee_pct=fill["fee_pct"], status="OPEN",
        rationale=data.rationale, indicators=data.indicators or {},
    )
    db.add(t)
    await db.flush()
    return _trade_out(t)


@router.post("/paper/close/{trade_id}")
async def paper_close(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """ปิด paper position ที่ราคาตลาดปัจจุบัน."""
    res = await db.execute(select(PaperTrade).where(PaperTrade.id == trade_id))
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Trade not found")
    if t.status == "CLOSED":
        raise HTTPException(status_code=409, detail="ปิดไปแล้ว")
    client = BitkubClient()
    price = await client.last_price(t.symbol)
    if not price:
        raise HTTPException(status_code=404, detail=f"ดึงราคา {t.symbol} ไม่ได้")
    pnl = close_pnl(t.entry_price, price, t.size_thb, t.qty)
    t.status = "CLOSED"
    t.exit_at = datetime.now(timezone.utc)
    t.exit_price = price
    t.exit_reason = "manual"
    t.pnl_thb = pnl["pnl_thb"]
    t.pnl_pct = pnl["pnl_pct"]
    t.result = pnl["result"]
    return _trade_out(t)


@router.get("/paper/positions/workspace/{workspace_id}")
async def paper_positions(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Open positions + live unrealized PnL."""
    res = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "OPEN"
        ).order_by(PaperTrade.entry_at.desc())
    )
    rows = res.scalars().all()
    client = BitkubClient()
    out = []
    for t in rows:
        d = _trade_out(t)
        price = await client.last_price(t.symbol)
        d["live"] = unrealized(t.entry_price, price, t.size_thb, t.qty) if price else None
        out.append(d)
    return {"positions": out, "count": len(out)}


@router.get("/paper/trades/workspace/{workspace_id}")
async def paper_trades(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Closed-trade journal (newest first)."""
    res = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "CLOSED"
        ).order_by(PaperTrade.exit_at.desc())
    )
    return {"trades": [_trade_out(t) for t in res.scalars().all()]}


@router.get("/paper/stats/workspace/{workspace_id}")
async def paper_stats_endpoint(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accumulated stats over closed paper trades."""
    res = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "CLOSED"
        )
    )
    closed = [{"pnl_pct": t.pnl_pct or 0.0, "pnl_thb": t.pnl_thb or 0.0,
               "strategy": t.strategy, "indicators": t.indicators}
              for t in res.scalars().all()]
    out = paper_stats(closed)
    out["calibration"] = calibration_stats(closed)
    return out
