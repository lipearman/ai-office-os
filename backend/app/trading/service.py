"""High-level trading-intelligence service: fetch → indicators → MTF → brief.

Reused by the analyze endpoint (single symbol) and the scanner (watchlist).
"""
from __future__ import annotations

import asyncio

from app.trading.bitkub import BitkubClient, to_tradingview_symbol, BitkubError
from app.trading.indicators import compute_features
from app.trading.mtf import build_snapshot, build_daily_brief, MTFSnapshot


async def analyze_symbol(client: BitkubClient, symbol: str) -> MTFSnapshot | None:
    """Full top-down analysis for one symbol. None if data unavailable."""
    tv = to_tradingview_symbol(symbol)
    try:
        mtf = await client.fetch_mtf(tv)
    except BitkubError:
        return None
    features = {}
    for tf, candles in mtf.items():
        f = compute_features(candles)
        if f:
            features[tf] = f
    if not features:
        return None
    return build_snapshot(tv, features)


async def analyze_with_brief(client: BitkubClient, symbol: str) -> dict | None:
    snap = await analyze_symbol(client, symbol)
    if not snap:
        return None
    return {"snapshot": snap.to_dict(), "brief": build_daily_brief(snap)}


# rank: BUY first, then by strength/alignment desc
_SIGNAL_RANK = {"BUY": 0, "HOLD": 1, "SELL": 2}


async def scan_symbols(symbols: list[str], concurrency: int = 4) -> list[dict]:
    """Scan many symbols and return ranked scan results."""
    client = BitkubClient()
    sem = asyncio.Semaphore(concurrency)

    async def one(sym: str) -> dict | None:
        async with sem:
            snap = await analyze_symbol(client, sym)
        if not snap:
            return None
        f1h = snap.features.get("1H")
        return {
            "symbol": snap.symbol,
            "signal": snap.signal,
            "strength": round(snap.strength, 3),
            "alignment_score": round(snap.alignment_score, 3),
            "bias": snap.bias,
            "reason": "; ".join(snap.reasons) or "—",
            "warnings": snap.warnings,
            "price": f1h.close if f1h else None,
            "entry": snap.entry,
            "stop": snap.stop,
            "target": snap.target,
            "rr": snap.rr,
        }

    results = await asyncio.gather(*[one(s) for s in symbols])
    out = [r for r in results if r]
    out.sort(key=lambda r: (_SIGNAL_RANK.get(r["signal"], 9), -r["strength"]))
    return out
