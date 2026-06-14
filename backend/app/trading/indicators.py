"""Indicator Engine — deterministic, pure functions.

Computed with pandas only (no TA-Lib / pandas-ta) to stay install-friendly on
Windows + numpy 2.x. Formulas follow the standard definitions (Wilder smoothing
for RSI/ATR/ADX). Decisions are made on CLOSED candles only.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

import pandas as pd

from app.trading.bitkub import Candle


@dataclass(frozen=True)
class FeatureSet:
    symbol: str
    timeframe: str
    ts: str                # ISO time of the candle these features describe
    close: float
    ema20: float
    ema50: float
    ema200: float
    rsi14: float
    macd: float
    macd_signal: float
    macd_hist: float
    atr14: float
    adx14: float
    plus_di: float
    minus_di: float
    bb_upper: float
    bb_mid: float
    bb_lower: float
    volume: float
    volume_ratio: float    # volume / SMA(volume, 20)

    def to_dict(self) -> dict:
        return asdict(self)


def candles_to_df(candles: list[Candle], closed_only: bool = True) -> pd.DataFrame:
    rows = [c for c in candles if (c.closed or not closed_only)]
    df = pd.DataFrame(
        {
            "ts": [c.ts for c in rows],
            "open": [float(c.open) for c in rows],
            "high": [float(c.high) for c in rows],
            "low": [float(c.low) for c in rows],
            "close": [float(c.close) for c in rows],
            "volume": [float(c.volume) for c in rows],
        }
    )
    return df


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _wilder(s: pd.Series, n: int) -> pd.Series:
    """Wilder's smoothing (RMA) = EMA with alpha = 1/n."""
    return s.ewm(alpha=1 / n, adjust=False).mean()


def _rsi(close: pd.Series, n: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = _wilder(gain, n)
    avg_loss = _wilder(loss, n)
    rs = avg_gain / avg_loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(100)  # no losses → RSI 100


def _atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return _wilder(tr, n)


def _adx(df: pd.DataFrame, n: int = 14) -> tuple[pd.Series, pd.Series, pd.Series]:
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = ((up > down) & (up > 0)) * up
    minus_dm = ((down > up) & (down > 0)) * down

    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    atr = _wilder(tr, n)

    plus_di = 100 * _wilder(plus_dm, n) / atr.replace(0, pd.NA)
    minus_di = 100 * _wilder(minus_dm, n) / atr.replace(0, pd.NA)
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, pd.NA)
    adx = _wilder(dx.fillna(0), n)
    return adx, plus_di.fillna(0), minus_di.fillna(0)


def _f(series: pd.Series) -> float:
    """Last value as a clean float (0.0 if NaN)."""
    v = series.iloc[-1]
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if pd.isna(v) else round(v, 8)


def compute_features(candles: list[Candle]) -> FeatureSet | None:
    """Compute indicator snapshot for the latest CLOSED candle.

    Returns None if there aren't enough candles for a meaningful read.
    """
    df = candles_to_df(candles, closed_only=True)
    if len(df) < 30:           # need a baseline; EMA200 fills in once we have history
        return None

    close = df["close"]
    ema20 = _ema(close, 20)
    ema50 = _ema(close, 50)
    ema200 = _ema(close, 200)
    rsi = _rsi(close, 14)
    macd_line = _ema(close, 12) - _ema(close, 26)
    macd_signal = _ema(macd_line, 9)
    macd_hist = macd_line - macd_signal
    atr = _atr(df, 14)
    adx, plus_di, minus_di = _adx(df, 14)

    bb_mid = close.rolling(20).mean()
    bb_std = close.rolling(20).std()
    bb_upper = bb_mid + 2 * bb_std
    bb_lower = bb_mid - 2 * bb_std

    vol_sma = df["volume"].rolling(20).mean()
    vol_ratio = (df["volume"] / vol_sma.replace(0, pd.NA)).fillna(1.0)

    last = df.iloc[-1]
    return FeatureSet(
        symbol=candles[0].symbol,
        timeframe=candles[0].timeframe,
        ts=pd.Timestamp(last["ts"]).isoformat(),
        close=_f(close),
        ema20=_f(ema20),
        ema50=_f(ema50),
        ema200=_f(ema200),
        rsi14=_f(rsi),
        macd=_f(macd_line),
        macd_signal=_f(macd_signal),
        macd_hist=_f(macd_hist),
        atr14=_f(atr),
        adx14=_f(adx),
        plus_di=_f(plus_di),
        minus_di=_f(minus_di),
        bb_upper=_f(bb_upper),
        bb_mid=_f(bb_mid),
        bb_lower=_f(bb_lower),
        volume=_f(df["volume"]),
        volume_ratio=_f(vol_ratio),
    )
