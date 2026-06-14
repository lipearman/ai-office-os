"""Bitkub public market-data client.

Public endpoints only (no API key needed) — used for paper trading.
Private/trading endpoints (HMAC) come in a later phase (live).

Docs: https://github.com/bitkub/bitkub-official-api-docs
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

import httpx

BASE_URL = "https://api.bitkub.com"

# Timeframe → Bitkub tradingview resolution
# (1D=daily, 240=4h, 60=1h, 15=15m)
TIMEFRAMES: dict[str, str] = {
    "1D": "1D",
    "4H": "240",
    "1H": "60",
    "15M": "15",
}

# how many candles back to fetch per timeframe (enough for EMA200)
LOOKBACK: dict[str, int] = {
    "1D": 320,
    "4H": 320,
    "1H": 320,
    "15M": 320,
}

# seconds per candle, to compute the `from` timestamp
_TF_SECONDS: dict[str, int] = {
    "1D": 86_400,
    "4H": 14_400,
    "1H": 3_600,
    "15M": 900,
}


@dataclass(frozen=True)
class Candle:
    symbol: str
    timeframe: str
    ts: datetime          # UTC, candle open time
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    closed: bool          # True except possibly the most recent forming candle


class BitkubError(RuntimeError):
    pass


class BitkubClient:
    """Thin async wrapper over Bitkub public REST."""

    def __init__(self, base_url: str = BASE_URL, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def list_symbols(self) -> list[dict]:
        """Return tradeable symbols, e.g. {'symbol': 'THB_BTC', 'info': ...}."""
        url = f"{self.base_url}/api/market/symbols"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
        if data.get("error", 0) != 0:
            raise BitkubError(f"symbols error={data.get('error')}")
        return data.get("result", [])

    async def ticker(self, symbol: str | None = None) -> dict:
        """Latest ticker(s). symbol format e.g. 'THB_BTC'."""
        url = f"{self.base_url}/api/market/ticker"
        params = {"sym": symbol} if symbol else None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            return r.json()

    async def last_price(self, symbol: str) -> float | None:
        """Latest traded price. Accepts tradingview (BTC_THB) or market (THB_BTC)."""
        market = to_market_symbol(symbol)
        data = await self.ticker()          # full ticker dict keyed by market symbol
        rec = data.get(market) if isinstance(data, dict) else None
        last = rec.get("last") if isinstance(rec, dict) else None
        return float(last) if last is not None else None

    async def fetch_ohlcv(
        self, symbol: str, timeframe: str, limit: int | None = None
    ) -> list[Candle]:
        """Fetch OHLCV candles for one timeframe.

        `symbol` uses the tradingview format BASE_QUOTE, e.g. 'BTC_THB'.
        """
        if timeframe not in TIMEFRAMES:
            raise ValueError(f"unknown timeframe {timeframe!r}")
        resolution = TIMEFRAMES[timeframe]
        bars = limit or LOOKBACK[timeframe]
        now = int(time.time())
        frm = now - _TF_SECONDS[timeframe] * (bars + 2)

        url = f"{self.base_url}/tradingview/history"
        params = {
            "symbol": symbol,
            "resolution": resolution,
            "from": frm,
            "to": now,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        if data.get("s") != "ok":
            # 'no_data' or error
            raise BitkubError(f"history s={data.get('s')} for {symbol} {timeframe}")

        ts, op, hi, lo, cl, vol = (
            data["t"], data["o"], data["h"], data["l"], data["c"], data["v"]
        )
        out: list[Candle] = []
        last_i = len(ts) - 1
        for i in range(len(ts)):
            out.append(
                Candle(
                    symbol=symbol,
                    timeframe=timeframe,
                    ts=datetime.fromtimestamp(ts[i], tz=timezone.utc),
                    open=Decimal(str(op[i])),
                    high=Decimal(str(hi[i])),
                    low=Decimal(str(lo[i])),
                    close=Decimal(str(cl[i])),
                    volume=Decimal(str(vol[i])),
                    # the most recent bar may still be forming
                    closed=(i != last_i),
                )
            )
        return out

    async def fetch_mtf(
        self, symbol: str, timeframes: list[str] | None = None
    ) -> dict[str, list[Candle]]:
        """Fetch all timeframes for one symbol → {tf: [candles]}."""
        tfs = timeframes or list(TIMEFRAMES.keys())
        out: dict[str, list[Candle]] = {}
        for tf in tfs:
            out[tf] = await self.fetch_ohlcv(symbol, tf)
        return out


def to_market_symbol(symbol: str) -> str:
    """Normalize to Bitkub market format QUOTE_BASE, e.g. 'BTC_THB' → 'THB_BTC'."""
    s = symbol.upper().strip()
    if "_" not in s:
        return s
    a, b = s.split("_", 1)
    if b in ("THB", "USDT") and a not in ("THB", "USDT"):
        return f"{b}_{a}"
    return s


def to_tradingview_symbol(symbol: str) -> str:
    """Normalize a symbol to tradingview BASE_QUOTE format.

    Accepts 'THB_BTC' (Bitkub market format) or 'BTC_THB' (tradingview) → 'BTC_THB'.
    """
    s = symbol.upper().strip()
    if "_" not in s:
        return s
    a, b = s.split("_", 1)
    # Bitkub market lists quote first (THB_BTC); tradingview wants base first (BTC_THB)
    if a in ("THB", "USDT") and b not in ("THB", "USDT"):
        return f"{b}_{a}"
    return s
