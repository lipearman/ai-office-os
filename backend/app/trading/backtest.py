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
    strategy: str = "ema_pullback"   # "ema_pullback" (trend) | "rsi_reversion" (range)
    adx_min: float = 22.0
    rsi_lo: float = 45.0
    rsi_hi: float = 68.0
    stop_atr: float = 1.5
    tp_rr: float = 2.0
    fee: float = 0.0025          # per side
    slippage: float = 0.0005     # per side — assume fills a touch worse than signal price
    rsi_exit: float = 70.0
    # ── rsi_reversion template ──
    rsi_os: float = 30.0         # oversold entry
    rsi_tp: float = 55.0         # take-profit (mean revert)
    adx_max: float = 25.0        # only in range (low ADX)
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
    pnl_pct: float               # net of fees + slippage
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


_ARR_COLS = (
    "open", "high", "low", "close", "ema20", "ema50", "ema200",
    "rsi14", "macd", "macd_signal", "atr14", "adx14", "volume_ratio",
    "bb_mid", "bb_lower",
)


def prepare(df) -> dict:
    """Extract numpy arrays from the indicator DataFrame for a fast loop.

    The optimizer/walk-forward calls simulate() hundreds of times; indexing
    numpy arrays is far cheaper than df.iloc per row.
    """
    C = {c: df[c].to_numpy(dtype="float64") for c in _ARR_COLS}
    C["ts"] = df["ts"].astype(str).to_numpy()
    return C


_VALID_COLS = ("ema20", "ema50", "ema200", "rsi14", "adx14", "atr14", "macd", "macd_signal")


def _valid_i(C: dict, i: int) -> bool:
    for c in _VALID_COLS:
        if math.isnan(C[c][i]):
            return False
    return True


def _entry_ok_i(C: dict, i: int, p: BacktestParams) -> bool:
    if p.strategy == "rsi_reversion":
        # buy oversold dips in a range (low ADX), near/below lower band
        close = C["close"][i]; rsi = C["rsi14"][i]
        if not (rsi <= p.rsi_os and close <= C["bb_lower"][i] and C["adx14"][i] <= p.adx_max):
            return False
        if close < C["ema200"][i] * 0.85:
            return False  # avoid catching a falling knife in a deep downtrend
        if p.use_validator and C["volume_ratio"][i] < p.vol_min:
            return False
        return True

    # default: ema_pullback (trend)
    close = C["close"][i]; ema20 = C["ema20"][i]; ema50 = C["ema50"][i]
    ema200 = C["ema200"][i]; rsi = C["rsi14"][i]; macd = C["macd"][i]
    bias_up = close > ema200 and ema50 > ema200
    trending = C["adx14"][i] >= p.adx_min
    trigger = close > ema20 and p.rsi_lo <= rsi <= p.rsi_hi and macd >= C["macd_signal"][i]
    if not (bias_up and trending and trigger):
        return False
    if p.use_validator:
        if C["volume_ratio"][i] < p.vol_min:
            return False
        if p.require_ema_stack and not (ema20 > ema50):
            return False
        if p.require_macd_positive and not (macd > 0):
            return False
        if close > ema20 * (1 + p.max_ext_pct):
            return False  # overextended — don't chase
    return True


def _exit_signal_i(C: dict, i: int, p: BacktestParams) -> bool:
    """Strategy-specific discretionary exit (besides stop/target)."""
    if p.strategy == "rsi_reversion":
        return C["rsi14"][i] >= p.rsi_tp or C["close"][i] >= C["bb_mid"][i]
    return C["close"][i] < C["ema50"][i] or C["rsi14"][i] > p.rsi_exit


def simulate(C: dict, p: BacktestParams, lo: int = 0, hi: int | None = None,
             ml_prob=None, ml_threshold: float = 0.5) -> list[Trade]:
    """Run the long-only state machine over rows [lo, hi) of prepared arrays C.

    Operates on precomputed numpy arrays so the optimizer/walk-forward can reuse
    one computation and evaluate any sub-range with no warmup loss (indicators at
    bar i use only data up to i — no look-ahead).

    `ml_prob` (optional): array aligned to C; when given, an entry also requires
    ml_prob[i] >= ml_threshold (ensemble: rule AND model agree).
    """
    if hi is None:
        hi = len(C["close"])
    close_a = C["close"]; high_a = C["high"]; low_a = C["low"]
    rsi_a = C["rsi14"]; atr_a = C["atr14"]
    adx_a = C["adx14"]; ts_a = C["ts"]
    trades: list[Trade] = []
    fee_round = 2 * p.fee
    slip_round = 2 * p.slippage   # entry fills higher + exit fills lower → round-trip cost
    in_pos = False
    entry_price = stop = target = 0.0
    entry_idx = 0
    entry_reason = ""
    last_loss_idx = -10_000

    for i in range(lo, hi):
        if not _valid_i(C, i):
            continue

        if not in_pos:
            if p.use_validator and (i - last_loss_idx) <= p.cooldown_bars:
                continue
            if _entry_ok_i(C, i, p):
                if ml_prob is not None and ml_prob[i] < ml_threshold:
                    continue  # ML vote rejects
                entry_price = close_a[i]
                atr = atr_a[i] or entry_price * 0.01
                stop = entry_price - p.stop_atr * atr
                target = entry_price + p.tp_rr * (entry_price - stop)
                entry_idx = i
                ml_txt = f", ML {ml_prob[i]:.2f}" if ml_prob is not None else ""
                label = "RSI reversion" if p.strategy == "rsi_reversion" else "EMA pullback"
                entry_reason = f"{label} (RSI {rsi_a[i]:.0f}, ADX {adx_a[i]:.0f}{ml_txt})"
                in_pos = True
            continue

        exit_price = None
        exit_reason = ""
        if low_a[i] <= stop:
            exit_price, exit_reason = stop, "stop_loss"
        elif high_a[i] >= target:
            exit_price, exit_reason = target, "take_profit"
        elif _exit_signal_i(C, i, p):
            exit_price, exit_reason = close_a[i], "signal_exit"

        if exit_price is not None:
            net = (exit_price / entry_price - 1.0) - fee_round - slip_round
            risk = entry_price - stop
            trades.append(Trade(
                entry_at=str(ts_a[entry_idx]),
                entry_price=round(entry_price, 2),
                exit_at=str(ts_a[i]),
                exit_price=round(exit_price, 2),
                exit_reason=exit_reason,
                bars_held=i - entry_idx,
                pnl_pct=round(net * 100, 3),
                r_multiple=round((exit_price - entry_price) / risk if risk > 0 else 0.0, 3),
                result="WIN" if net > 0 else ("LOSS" if net < 0 else "BREAKEVEN"),
                reason=entry_reason,
            ))
            in_pos = False
            if net < 0:
                last_loss_idx = i

    if in_pos:
        exit_price = close_a[hi - 1]
        net = (exit_price / entry_price - 1.0) - fee_round - slip_round
        risk = entry_price - stop
        trades.append(Trade(
            entry_at=str(ts_a[entry_idx]),
            entry_price=round(entry_price, 2),
            exit_at=str(ts_a[hi - 1]),
            exit_price=round(exit_price, 2),
            exit_reason="eod",
            bars_held=(hi - 1) - entry_idx,
            pnl_pct=round(net * 100, 3),
            r_multiple=round((exit_price - entry_price) / risk if risk > 0 else 0.0, 3),
            result="WIN" if net > 0 else ("LOSS" if net < 0 else "BREAKEVEN"),
            reason=entry_reason,
        ))
    return trades


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

    res.trades = simulate(prepare(df), p, 0, len(df))
    res.stats, res.equity_curve = _compute_stats(res.trades)
    return res


def walk_forward_winrate(
    candles: list[Candle], params: BacktestParams | None = None, folds: int = 4
) -> dict:
    """Walk-forward win rate: evaluate the (fixed-rule) strategy across consecutive
    time folds, so we can see whether the edge HOLDS recently and consistently
    instead of trusting one all-history number.

    Returns {} when there isn't enough history. `oos_win_rate` equal-weights folds
    (each period counts the same), `recent_win_rate` is the most recent fold, and
    `wf_stability_std` is the spread of fold win-rates (high = unreliable).
    Cheap — just a few extra simulate() passes on slices of precomputed arrays.
    """
    p = params or BacktestParams()
    df = indicator_frame(candles, closed_only=True).reset_index(drop=True)
    n = len(df)
    if n < 120 or folds < 2:
        return {}
    C = prepare(df)
    start = min(200, n // 5)          # warmup so ema200 etc. are valid before entries
    seg = (n - start) // folds
    if seg < 20:
        return {}
    fold_wr: list[float] = []
    fold_tn: list[int] = []
    recent_wr: float | None = None
    for k in range(folds):
        lo = start + k * seg
        hi = n if k == folds - 1 else start + (k + 1) * seg
        st, _ = _compute_stats(simulate(C, p, lo, hi))
        tn = st.get("total_trades", 0)
        wr = st.get("win_rate")
        if tn > 0 and wr is not None:
            fold_wr.append(wr)
            fold_tn.append(tn)
        if k == folds - 1:
            recent_wr = wr if (tn > 0 and wr is not None) else None
    if not fold_wr:
        return {}
    mean_wr = sum(fold_wr) / len(fold_wr)
    std = (sum((x - mean_wr) ** 2 for x in fold_wr) / len(fold_wr)) ** 0.5
    return {
        "oos_win_rate": round(mean_wr, 1),
        "recent_win_rate": recent_wr,
        "fold_win_rates": [round(x, 1) for x in fold_wr],
        "wf_stability_std": round(std, 1),
        "wf_folds": len(fold_wr),
        "wf_total_trades": sum(fold_tn),
    }


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
