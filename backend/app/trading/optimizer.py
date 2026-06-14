"""Auto-optimizer with walk-forward validation.

Searches a small grid of strategy parameters and reports:
  - suggested params (optimized over all usable history) — for going forward
  - in-sample stats (will look optimistic — overfit risk)
  - WALK-FORWARD out-of-sample stats (the honest number to trust)
  - a verdict comparing OOS vs default + warning if it overfits

HUMAN GATE: this only *suggests* parameters. It never changes the live
strategy or trades anything. The user reviews the OOS evidence and decides.
"""
from __future__ import annotations

import itertools
import math

from app.trading.bitkub import Candle
from app.trading.indicators import indicator_frame
from app.trading.backtest import (
    BacktestParams, prepare, simulate, _compute_stats,
)

# small grid — keep fast; expand later
PARAM_GRID = {
    "adx_min": [18.0, 22.0, 26.0],
    "stop_atr": [1.0, 1.5, 2.0],
    "tp_rr": [1.5, 2.0, 3.0],
    "use_validator": [False, True],
}

WARMUP = 210          # skip indicator warmup (EMA200) when evaluating
MIN_TRADES = 6        # ignore param sets with too few trades to be meaningful


def _combos() -> list[dict]:
    keys = list(PARAM_GRID)
    return [dict(zip(keys, vals)) for vals in itertools.product(*PARAM_GRID.values())]


def _score(stats: dict) -> float:
    """Robust objective: profit factor (capped) + return tilt, gated by #trades."""
    n = stats.get("total_trades", 0)
    if n < MIN_TRADES:
        return -1e9
    pf = stats.get("profit_factor")
    pf_v = pf if pf is not None else 5.0          # no losses → treat as strong
    ret = stats.get("total_return_pct", 0.0) or 0.0
    return min(pf_v, 5.0) + ret / 100.0


def _optimize_range(C: dict, lo: int, hi: int) -> tuple[dict, dict, float]:
    """Return (best_params_dict, best_stats, best_score) over [lo, hi)."""
    best_params, best_stats, best_score = None, {"total_trades": 0}, -1e18
    for combo in _combos():
        p = BacktestParams(**combo)
        trades = simulate(C, p, lo, hi)
        stats, _ = _compute_stats(trades)
        sc = _score(stats)
        if sc > best_score:
            best_params, best_stats, best_score = combo, stats, sc
    if best_params is None:                        # nothing met MIN_TRADES
        best_params = {k: PARAM_GRID[k][0] for k in PARAM_GRID}
    return best_params, best_stats, best_score


def optimize(candles: list[Candle], folds: int = 4) -> dict:
    df = indicator_frame(candles, closed_only=True).reset_index(drop=True)
    n = len(df)
    symbol = candles[0].symbol if candles else "?"
    timeframe = candles[0].timeframe if candles else "?"
    if n < WARMUP + 200:
        return {"symbol": symbol, "timeframe": timeframe, "bars": n,
                "error": "ข้อมูลไม่พอสำหรับ optimize (ต้องการประวัติยาวกว่านี้)"}

    C = prepare(df)
    start = WARMUP

    # ── default (baseline) over usable range ──
    default_stats, _ = _compute_stats(simulate(C, BacktestParams(), start, n))

    # ── suggested params: optimize over all usable history (in-sample) ──
    suggested, in_sample_stats, _ = _optimize_range(C, start, n)

    # ── walk-forward: anchored train grows, test on the next segment ──
    seg = (n - start) // (folds + 1)
    oos_trades = []
    fold_reports = []
    for k in range(1, folds + 1):
        train_hi = start + seg * k
        test_lo = train_hi
        test_hi = start + seg * (k + 1) if k < folds else n
        if test_hi - test_lo < 10:
            continue
        fp, _, _ = _optimize_range(C, start, train_hi)      # optimize on train only
        t = simulate(C, BacktestParams(**fp), test_lo, test_hi)  # evaluate OOS
        fstats, _ = _compute_stats(t)
        oos_trades.extend(t)
        fold_reports.append({
            "fold": k,
            "train_bars": train_hi - start,
            "test_bars": test_hi - test_lo,
            "params": fp,
            "test": {kk: fstats.get(kk) for kk in
                     ("total_trades", "win_rate", "profit_factor", "total_return_pct")},
        })

    oos_stats, oos_curve = _compute_stats(oos_trades)

    # ── verdict (honest, OOS-based) ──
    verdict = _verdict(default_stats, in_sample_stats, oos_stats)

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "bars": n,
        "default": {"params": "default", "stats": default_stats},
        "suggested": {"params": suggested, "in_sample_stats": in_sample_stats},
        "walk_forward": {
            "folds": fold_reports,
            "oos_stats": oos_stats,
            "oos_equity": oos_curve,
        },
        "verdict": verdict,
        "human_gate": "นี่เป็นเพียงคำแนะนำ — ระบบยังไม่เปลี่ยนกลยุทธ์/ไม่เทรดให้ ต้องคนกดอนุมัติ",
    }


def _verdict(default: dict, in_sample: dict, oos: dict) -> str:
    oos_pf = oos.get("profit_factor")
    is_pf = in_sample.get("profit_factor")
    def_pf = default.get("profit_factor")
    oos_n = oos.get("total_trades", 0)

    if oos_n < MIN_TRADES:
        return "⚠️ ดีล OOS น้อยเกินไป — ยังสรุปไม่ได้ ต้องการประวัติมากขึ้น"
    parts = []
    if oos_pf is not None and def_pf is not None:
        if oos_pf > def_pf + 0.1:
            parts.append(f"✅ OOS ดีกว่า default (PF {oos_pf} vs {def_pf})")
        elif oos_pf < def_pf - 0.1:
            parts.append(f"🔴 OOS แย่กว่า default (PF {oos_pf} vs {def_pf}) — อย่าใช้")
        else:
            parts.append(f"🟡 OOS ใกล้เคียง default (PF {oos_pf} vs {def_pf})")
    # overfit check: in-sample much better than OOS
    if is_pf is not None and oos_pf is not None and is_pf > oos_pf + 0.5:
        parts.append(f"⚠️ in-sample ({is_pf}) ดีกว่า OOS ({oos_pf}) มาก — ระวัง overfit")
    if oos_pf is not None and oos_pf >= 1.5:
        parts.append("OOS PF ≥ 1.5 = มี edge จริงพอควร")
    return " · ".join(parts) or "ไม่มีข้อสรุปชัดเจน"
