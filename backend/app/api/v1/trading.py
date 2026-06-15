import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.user import User
from app.models.watchlist import WatchlistItem
from app.models.paper import PaperTrade
from app.schemas.trading import (
    WatchlistItemOut, WatchlistItemCreate, WatchlistItemUpdate, PaperOpen,
)
from app.trading.paper import fill_open, close_pnl, unrealized, paper_stats
from app.trading.news import fetch_news, aggregate_sentiment
from app.trading import alerts as alert_store
from datetime import datetime, timezone
from app.api.deps import get_current_user
from app.trading.bitkub import BitkubClient, to_tradingview_symbol, TIMEFRAMES
from app.trading.service import (
    analyze_with_brief, scan_symbols, backtest_symbol, optimize_symbol, ml_symbol,
    daily_opportunity, daily_opportunities, build_desk,
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
    """หาเหรียญที่มีโอกาสชนะวันนี้ — ใช้กลยุทธ์ที่ผูกไว้ต่อ symbol แล้วจัดอันดับ."""
    result = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.workspace_id == workspace_id,
            WatchlistItem.enabled == True,  # noqa: E712
        )
    )
    items = [
        {"symbol": w.symbol, "cfg": (w.strategies[0] if w.strategies else None)}
        for w in result.scalars().all()
    ]
    if not items:
        return {"results": [], "count": 0}
    results = await daily_opportunities(items)
    return {"results": results, "count": len(results)}


# ── trading desk (7 characters from real data) ──────────────────
@router.get("/desk/workspace/{workspace_id}")
async def trading_desk(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """7 trading-desk characters speaking from live data (for /office)."""
    res = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.workspace_id == workspace_id,
            WatchlistItem.enabled == True,  # noqa: E712
        )
    )
    items = [
        {"symbol": w.symbol, "cfg": (w.strategies[0] if w.strategies else None)}
        for w in res.scalars().all()
    ]
    opps = await daily_opportunities(items) if items else []

    pres = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "OPEN"
        )
    )
    positions = [{"symbol": t.symbol} for t in pres.scalars().all()]

    cres = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "CLOSED"
        )
    )
    closed = [{"pnl_pct": t.pnl_pct or 0.0, "pnl_thb": t.pnl_thb or 0.0}
              for t in cres.scalars().all()]
    stats = paper_stats(closed)

    assets = sorted({w["symbol"].split("_")[0] for w in items})
    news_items = await fetch_news()
    news_agg = aggregate_sentiment(news_items, assets or None)

    return {"characters": build_desk(opps, positions, stats, news_agg)}


# ── server-side alerts (detected by the scheduler) ──────────────
@router.get("/alerts/workspace/{workspace_id}")
async def get_alerts(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Alerts สะสมจาก scheduler (เตือนแม้ปิดหน้า)."""
    return {"alerts": alert_store.get_alerts(workspace_id)}


@router.delete("/alerts/workspace/{workspace_id}", status_code=204)
async def clear_alerts(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    alert_store.clear_alerts(workspace_id)


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
    closed = [{"pnl_pct": t.pnl_pct or 0.0, "pnl_thb": t.pnl_thb or 0.0}
              for t in res.scalars().all()]
    return paper_stats(closed)
