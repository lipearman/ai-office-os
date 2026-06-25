"""Unit tests for backtest cost model (slippage) + walk-forward win rate.

Pure functions — no DB / network. The slippage test hand-builds the prepared
numpy arrays so exactly one trade fires, making the cost math deterministic.
"""
import math
from decimal import Decimal
from datetime import datetime, timezone, timedelta

import numpy as np

from app.trading.backtest import (
    BacktestParams, simulate, walk_forward_winrate, _compute_stats,
)
from app.trading.bitkub import Candle


def _one_trade_C() -> dict:
    """Hand-built arrays: an ema_pullback entry at bar 1, target hit at bar 2."""
    n = 5
    col = lambda v: np.array([v] * n, dtype="float64")  # noqa: E731
    C = {
        "open": col(100.0), "high": col(101.0), "low": col(99.0), "close": col(100.0),
        "ema20": col(99.0), "ema50": col(98.0), "ema200": col(97.0),
        "rsi14": col(55.0), "macd": col(1.0), "macd_signal": col(0.0),
        "atr14": col(2.0), "adx14": col(30.0),
        "volume_ratio": col(2.0), "bb_mid": col(100.0), "bb_lower": col(95.0),
    }
    # bar 2: hit target (high >= 106 = 100 + 2*(100-97)); keep low above stop (97)
    C["high"][2] = 107.0
    C["low"][2] = 104.0
    # bars 0/3/4: below EMA200 so no entry fires (isolate the single trade)
    for i in (0, 3, 4):
        C["close"][i] = 90.0
    C["ts"] = np.array([f"t{i}" for i in range(n)])
    return C


def test_slippage_drops_pnl_by_round_trip_amount():
    C = _one_trade_C()
    t0 = simulate(C, BacktestParams(slippage=0.0))
    t1 = simulate(C, BacktestParams(slippage=0.01))
    # slippage must not change WHICH trades fire (entry/exit use price, not net)
    assert len(t0) == 1 and len(t1) == 1
    # net pnl drops by exactly the round-trip slippage: 2 * 1% = 2 percentage points
    assert abs((t0[0].pnl_pct - t1[0].pnl_pct) - 2.0) < 1e-6


def test_slippage_never_increases_expectancy():
    C = _one_trade_C()
    s0 = _compute_stats(simulate(C, BacktestParams(slippage=0.0)))[0]
    s2 = _compute_stats(simulate(C, BacktestParams(slippage=0.02)))[0]
    assert s2["expectancy_pct"] <= s0["expectancy_pct"]


def _synth_candles(n: int) -> list[Candle]:
    """Gentle uptrend + oscillation — well-defined for indicators (no flat NaNs)."""
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    out = []
    for i in range(n):
        price = 100.0 * (1 + 0.001 * i) * (1 + 0.02 * math.sin(i / 5.0))
        hi = price * 1.005
        lo = price * 0.995
        out.append(Candle(
            symbol="BTC_THB", timeframe="1H", ts=base + timedelta(hours=i),
            open=Decimal(str(round(price, 2))), high=Decimal(str(round(hi, 2))),
            low=Decimal(str(round(lo, 2))), close=Decimal(str(round(price, 2))),
            volume=Decimal("1000"), closed=True,
        ))
    return out


def test_walk_forward_insufficient_data_returns_empty():
    assert walk_forward_winrate(_synth_candles(60)) == {}


def test_walk_forward_returns_well_formed_dict():
    res = walk_forward_winrate(_synth_candles(500))
    assert isinstance(res, dict)
    if res:  # when trades fired, the shape must be sane
        assert 0.0 <= res["oos_win_rate"] <= 100.0
        assert res["wf_stability_std"] >= 0.0
        assert res["wf_folds"] == len(res["fold_win_rates"])
