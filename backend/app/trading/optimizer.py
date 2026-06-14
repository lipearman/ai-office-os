"""Smart auto-optimizer — multi-template, OOS-selection, holdout-verdict.

Smarter than picking the best in-sample params (which overfits):
  1. tries MULTIPLE strategy templates (trend pullback + range reversion),
  2. selects the config by aggregate OUT-OF-SAMPLE robustness across several
     selection folds (not in-sample best),
  3. validates the winner on a final HOLDOUT segment never used in selection,
  4. is willing to recommend "don't trade" when nothing has an edge.

This lets each symbol get its own best-fitting strategy.

HUMAN GATE: returns a suggestion only — never changes live config or trades.
The user reviews the holdout evidence and clicks Apply.
"""
from __future__ import annotations

import itertools

from app.trading.bitkub import Candle
from app.trading.indicators import indicator_frame
from app.trading.backtest import BacktestParams, prepare, simulate, _compute_stats

WARMUP = 210
MIN_TRADES_SEL = 12    # min pooled trades across selection folds to be considered
MIN_TRADES_HOLD = 3    # min trades on holdout to trust the verdict
FREQ_TARGET = 24       # pooled trades for full "tradeable enough" credit


def _candidates() -> list[dict]:
    cands: list[dict] = []
    # trend: EMA pullback
    for adx, stop, tp, val in itertools.product(
        [18.0, 22.0, 26.0], [1.0, 1.5, 2.0], [1.5, 2.0, 3.0], [False, True]
    ):
        cands.append({"strategy": "ema_pullback", "adx_min": adx,
                      "stop_atr": stop, "tp_rr": tp, "use_validator": val})
    # range: RSI reversion
    for rsi_os, stop, tp, amax in itertools.product(
        [25.0, 30.0, 35.0], [1.0, 1.5, 2.0], [1.5, 2.0], [25.0, 35.0]
    ):
        cands.append({"strategy": "rsi_reversion", "rsi_os": rsi_os,
                      "stop_atr": stop, "tp_rr": tp, "adx_max": amax})
    return cands


def _robust_score(fold_stats: list[dict]) -> tuple[float, int]:
    """Aggregate OOS robustness across folds.

    Rewards positive expectancy that is *consistent* across folds; gated by a
    minimum number of pooled trades. Returns (score, pooled_trades).
    """
    pooled = sum(s.get("total_trades", 0) for s in fold_stats)
    if pooled < MIN_TRADES_SEL:
        return -1e9, pooled
    exps = [s.get("expectancy_pct", 0.0) or 0.0 for s in fold_stats if s.get("total_trades")]
    if not exps:
        return -1e9, pooled
    mean_exp = sum(exps) / len(exps)
    # consistency: fraction of folds with positive expectancy
    pos_frac = sum(1 for e in exps if e > 0) / len(exps)
    # penalize dispersion
    var = sum((e - mean_exp) ** 2 for e in exps) / len(exps)
    spread = var ** 0.5
    # frequency credit: prefer configs that trade often enough to be validated
    # (avoids degenerate "one great trade" configs that can't generalise)
    freq = min(1.0, pooled / FREQ_TARGET)
    score = (mean_exp * pos_frac - 0.25 * spread) * freq
    return score, pooled


def _stats_of(C, params: BacktestParams, lo: int, hi: int) -> dict:
    return _compute_stats(simulate(C, params, lo, hi))[0]


def optimize(candles: list[Candle], folds: int = 4) -> dict:
    df = indicator_frame(candles, closed_only=True).reset_index(drop=True)
    n = len(df)
    symbol = candles[0].symbol if candles else "?"
    timeframe = candles[0].timeframe if candles else "?"
    if n < WARMUP + 250:
        return {"symbol": symbol, "timeframe": timeframe, "bars": n,
                "error": "ข้อมูลไม่พอสำหรับ optimize (ต้องการประวัติยาวกว่านี้)"}

    C = prepare(df)
    start = WARMUP
    usable = n - start

    # holdout = last ~30% (never used for selection); selection = first ~70%
    hold_lo = start + int(usable * 0.70)
    hold_hi = n
    sel_len = hold_lo - start
    seg = sel_len // folds
    sel_bounds = [(start + seg * k, start + seg * (k + 1) if k < folds - 1 else hold_lo)
                  for k in range(folds)]

    # ── select the config by aggregate OOS robustness across selection folds ──
    best = None  # (cand, score, pooled, sel_fold_stats)
    for cand in _candidates():
        p = BacktestParams(**cand)
        fold_stats = [_stats_of(C, p, lo, hi) for lo, hi in sel_bounds]
        score, pooled = _robust_score(fold_stats)
        if best is None or score > best[1]:
            best = (cand, score, pooled, fold_stats)

    # default for comparison (on holdout)
    default_hold = _stats_of(C, BacktestParams(), hold_lo, hold_hi)

    if best is None or best[1] <= -1e8:
        return {
            "symbol": symbol, "timeframe": timeframe, "bars": n,
            "suggested": None,
            "default_holdout": default_hold,
            "verdict": "🔴 ไม่มี config ใดมีดีลพอ/มี edge — แนะนำไม่เทรด symbol นี้",
            "human_gate": "คำแนะนำเท่านั้น — ไม่เปลี่ยนกลยุทธ์/ไม่เทรดให้",
        }

    cand, score, pooled, sel_fold_stats = best
    best_params = BacktestParams(**cand)

    # ── verdict on the untouched holdout ──
    hold_stats = _stats_of(C, best_params, hold_lo, hold_hi)
    verdict = _verdict(hold_stats, default_hold, pooled)

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "bars": n,
        "suggested": {
            "strategy": cand["strategy"],
            "params": cand,
            "selection": {
                "pooled_trades": pooled,
                "robust_score": round(score, 4),
                "folds": [{kk: s.get(kk) for kk in
                           ("total_trades", "win_rate", "profit_factor", "expectancy_pct")}
                          for s in sel_fold_stats],
            },
        },
        "holdout": hold_stats,
        "default_holdout": default_hold,
        "verdict": verdict,
        "human_gate": "คำแนะนำเท่านั้น — กด Apply เพื่อผูกกับ symbol (คนอนุมัติ) ระบบไม่เทรดเอง",
    }


def _verdict(hold: dict, default: dict, pooled: int) -> str:
    n = hold.get("total_trades", 0)
    if n < MIN_TRADES_HOLD:
        return f"⚠️ ดีลบน holdout น้อย ({n}) — ยังเชื่อไม่ได้ ต้องการประวัติมากขึ้น"
    pf = hold.get("profit_factor")
    ret = hold.get("total_return_pct", 0.0)
    def_pf = default.get("profit_factor")
    parts = []
    if pf is None:
        parts.append("holdout ไม่มีดีลขาดทุน (sample เล็ก)")
    elif pf >= 1.3 and ret > 0:
        parts.append(f"✅ holdout มี edge (PF {pf}, ret {ret}%)")
    elif pf >= 1.0:
        parts.append(f"🟡 holdout ก้ำกึ่ง (PF {pf}, ret {ret}%) — ยังไม่ชัด")
    else:
        parts.append(f"🔴 holdout ไม่มี edge (PF {pf}, ret {ret}%) — แนะนำไม่เทรด")
    if def_pf is not None and pf is not None:
        better = "ดีกว่า" if pf > def_pf else "ไม่ดีกว่า"
        parts.append(f"({better} default PF {def_pf})")
    return " ".join(parts)
