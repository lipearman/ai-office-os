"""Event-driven backtest for the EMA-pullback (top-down) strategy.

Long-only (Bitkub spot has no shorting). Decisions are made on CLOSED bars;
exits check intrabar high/low on subsequent bars. Fee 0.25% per side.

This is a single-timeframe backtest with the daily bias approximated from the
same series' EMA200/EMA50 — enough to evaluate whether the algorithm has an
edge (Win/Loss, Profit Factor). Full 4-timeframe alignment is a later refinement.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import pandas as pd

from app.trading.bitkub import Candle
from app.trading.indicators import indicator_frame


@dataclass
class BacktestParams:
    adx_min: float = 22.0
    rsi_lo: float = 45.0
    rsi_hi: float = 68.0
    stop_atr: float = 1.5
    tp_rr: float = 2.0
    fee: float = 0.0025          # per side
    rsi_exit: float = 70.0
    # ── Signal Validator (กรองสัญญาณหลอก) — off = baseline ──
    use_validator: bool = False
    vol_min: float = 1.2         # volume confirmation: vol >= vol_min * avg
    require_ema_stack: bool = True   # ema20 > ema50 (โครงสร้างเทรนด์แข็งขึ้น)
    require_macd_positive: bool = True  # macd > 0 (ไม่ใช่แค่ตัด signal)
    max_ext_pct: float = 0.06    # ไม่ไล่ราคา: close <= ema20 * (1+max_ext_pct)
    cooldown_bars: int = 3       # พักหลังแพ้ N แท่ง


@dataclass
class Trade:
    entry_at: str
    entry_price: float
    exit_at: str
    exit_price: float
    exit_reason: str             # take_profit | stop_loss | signal_exit | eod
    bars_held: int
    pnl_pct: float               # net of fees
    r_multiple: float
    result: str                  # WIN | LOSS | BREAKEVEN
    reason: str                  # why we entered


@dataclass
class BacktestResult:
    symbol: str
    timeframe: str
    bars: int
    trades: list[Trade] = field(default_factory=list)
    stats: dict = field(default_factory=dict)
    equity_curve: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "bars": self.bars,
            "stats": self.stats,
            "trades": [t.__dict__ for t in self.trades],
            "equity_curve": self.equity_curve,
        }


def _valid(row) -> bool:
    for c in ("ema20", "ema50", "ema200", "rsi14", "adx14", "atr14", "macd", "macd_signal"):
        v = row[c]
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return False
    return True


def _entry_ok(row, p: BacktestParams) -> bool:
    bias_up = row["close"] > row["ema200"] and row["ema50"] > row["ema200"]
    trending = row["adx14"] >= p.adx_min
    trigger = (
        row["close"] > row["ema20"]
        and p.rsi_lo <= row["rsi14"] <= p.rsi_hi
        and row["macd"] >= row["macd_signal"]
    )
    if not (bias_up and trending and trigger):
        return False

    if p.use_validator:
        # ── extra confluence to filter false signals ──
        if row["volume_ratio"] < p.vol_min:
            return False
        if p.require_ema_stack and not (row["ema20"] > row["ema50"]):
            return False
        if p.require_macd_positive and not (row["macd"] > 0):
            return False
        if row["close"] > row["ema20"] * (1 + p.max_ext_pct):
            return False  # overextended — don't chase

    return True


def run_backtest(
    candles: list[Candle], params: BacktestParams | None = None
) -> BacktestResult:
    p = params or BacktestParams()
    df = indicator_frame(candles, closed_only=True).reset_index(drop=True)
    symbol = candles[0].symbol if candles else "?"
    timeframe = candles[0].timeframe if candles else "?"
    res = BacktestResult(symbol=symbol, timeframe=timeframe, bars=len(df))
    if len(df) < 60:
        res.stats = {"note": "ข้อมูลไม่พอสำหรับ backtest", "total_trades": 0}
        return res

    fee_round = 2 * p.fee
    in_pos = False
    entry_price = stop = target = 0.0
    entry_idx = 0
    entry_reason = ""
    last_loss_idx = -10_000   # for cooldown

    for i in range(len(df)):
        row = df.iloc[i]
        if not _valid(row):
            continue

        if not in_pos:
            # cooldown after a loss (validator only)
            if p.use_validator and (i - last_loss_idx) <= p.cooldown_bars:
                continue
            if _entry_ok(row, p):
                entry_price = float(row["close"])
                atr = float(row["atr14"]) or entry_price * 0.01
                stop = entry_price - p.stop_atr * atr
                risk = entry_price - stop
                target = entry_price + p.tp_rr * risk
                entry_idx = i
                entry_reason = (
                    f"EMA pullback (RSI {row['rsi14']:.0f}, ADX {row['adx14']:.0f})"
                )
                in_pos = True
            continue

        # ── in position: check exits on this bar ──
        low = float(row["low"]); high = float(row["high"]); close = float(row["close"])
        exit_price = None
        exit_reason = ""
        # stop checked first (conservative: assume worst case within the bar)
        if low <= stop:
            exit_price, exit_reason = stop, "stop_loss"
        elif high >= target:
            exit_price, exit_reason = target, "take_profit"
        elif close < float(row["ema50"]) or row["rsi14"] > p.rsi_exit:
            exit_price, exit_reason = close, "signal_exit"

        if exit_price is not None:
            gross = exit_price / entry_price - 1.0
            net = gross - fee_round
            risk = entry_price - stop
            r_mult = (exit_price - entry_price) / risk if risk > 0 else 0.0
            res.trades.append(Trade(
                entry_at=str(df.iloc[entry_idx]["ts"]),
                entry_price=round(entry_price, 2),
                exit_at=str(row["ts"]),
                exit_price=round(exit_price, 2),
                exit_reason=exit_reason,
                bars_held=i - entry_idx,
                pnl_pct=round(net * 100, 3),
                r_multiple=round(r_mult, 3),
                result="WIN" if net > 0 else ("LOSS" if net < 0 else "BREAKEVEN"),
                reason=entry_reason,
            ))
            in_pos = False
            if net < 0:
                last_loss_idx = i

    # close any open position at the last bar
    if in_pos:
        last = df.iloc[-1]
        exit_price = float(last["close"])
        gross = exit_price / entry_price - 1.0
        net = gross - fee_round
        risk = entry_price - stop
        res.trades.append(Trade(
            entry_at=str(df.iloc[entry_idx]["ts"]),
            entry_price=round(entry_price, 2),
            exit_at=str(last["ts"]),
            exit_price=round(exit_price, 2),
            exit_reason="eod",
            bars_held=len(df) - 1 - entry_idx,
            pnl_pct=round(net * 100, 3),
            r_multiple=round((exit_price - entry_price) / risk if risk > 0 else 0.0, 3),
            result="WIN" if net > 0 else ("LOSS" if net < 0 else "BREAKEVEN"),
            reason=entry_reason,
        ))

    res.stats, res.equity_curve = _compute_stats(res.trades)
    return res


def _compute_stats(trades: list[Trade]) -> tuple[dict, list[dict]]:
    n = len(trades)
    if n == 0:
        return {"total_trades": 0}, []

    pnls = [t.pnl_pct / 100 for t in trades]
    wins = [x for x in pnls if x > 0]
    losses = [x for x in pnls if x < 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))

    # equity curve (compounding, full-position simplification)
    equity = 1.0
    peak = 1.0
    max_dd = 0.0
    curve = [{"i": 0, "equity": 1.0}]
    for idx, x in enumerate(pnls, 1):
        equity *= (1 + x)
        peak = max(peak, equity)
        dd = (equity - peak) / peak
        max_dd = min(max_dd, dd)
        curve.append({"i": idx, "equity": round(equity, 4)})

    # max consecutive losses
    max_consec = consec = 0
    for t in trades:
        if t.result == "LOSS":
            consec += 1
            max_consec = max(max_consec, consec)
        else:
            consec = 0

    avg_r = sum(t.r_multiple for t in trades) / n
    stats = {
        "total_trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(len(wins) / n * 100, 1),
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss > 0 else None,
        "expectancy_pct": round(sum(pnls) / n * 100, 3),
        "avg_win_pct": round(sum(wins) / len(wins) * 100, 2) if wins else 0.0,
        "avg_loss_pct": round(sum(losses) / len(losses) * 100, 2) if losses else 0.0,
        "avg_r": round(avg_r, 2),
        "total_return_pct": round((equity - 1) * 100, 2),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "max_consec_losses": max_consec,
    }
    return stats, curve
