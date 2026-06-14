import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.user import User
from app.models.watchlist import WatchlistItem
from app.schemas.trading import (
    WatchlistItemOut, WatchlistItemCreate, WatchlistItemUpdate,
)
from app.api.deps import get_current_user
from app.trading.bitkub import BitkubClient, to_tradingview_symbol, TIMEFRAMES
from app.trading.service import (
    analyze_with_brief, scan_symbols, backtest_symbol, optimize_symbol, ml_symbol,
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
