"""Paper trading — simulated fills (fee 0.25% + slippage 0.05%/side), positions,
journal, stats.

Pure functions here; DB I/O lives in the API layer. Prices come from Bitkub.
The cost model matches the backtest (FEE + SLIPPAGE per side) so the forward
(paper) results are comparable to the backtested win-rate, not flattered.
"""
from __future__ import annotations

FEE = 0.0025
SLIPPAGE = 0.0005        # per side — fills land a touch worse than the signal price


def fill_open(entry_price: float, size_thb: float) -> dict:
    """Open a long: qty after entry fee, filled a touch above the signal price."""
    eff_entry = entry_price * (1 + SLIPPAGE)       # buy fills slightly higher
    qty = (size_thb * (1 - FEE)) / eff_entry
    return {"qty": qty, "fee_pct": FEE}


def close_pnl(entry_price: float, exit_price: float, size_thb: float, qty: float) -> dict:
    """Realized PnL (THB + %) net of round-trip fee + slippage."""
    proceeds = qty * exit_price * (1 - SLIPPAGE) * (1 - FEE)   # sell fills lower + exit fee
    pnl_thb = proceeds - size_thb
    pnl_pct = pnl_thb / size_thb * 100 if size_thb else 0.0
    result = "WIN" if pnl_thb > 0 else ("LOSS" if pnl_thb < 0 else "BREAKEVEN")
    return {"pnl_thb": round(pnl_thb, 2), "pnl_pct": round(pnl_pct, 3), "result": result}


def unrealized(entry_price: float, cur_price: float, size_thb: float, qty: float) -> dict:
    proceeds = qty * cur_price * (1 - SLIPPAGE) * (1 - FEE)
    pnl_thb = proceeds - size_thb
    return {"cur_price": cur_price, "pnl_thb": round(pnl_thb, 2),
            "pnl_pct": round(pnl_thb / size_thb * 100 if size_thb else 0.0, 3)}


def paper_stats(closed: list[dict]) -> dict:
    """Accumulated stats over CLOSED paper trades."""
    n = len(closed)
    if n == 0:
        return {"total_trades": 0, "total_pnl_thb": 0.0}
    pnls = [t["pnl_pct"] / 100 for t in closed]
    pnl_thb = sum(t["pnl_thb"] for t in closed)
    wins = [x for x in pnls if x > 0]
    losses = [x for x in pnls if x < 0]
    gp = sum(wins); gl = abs(sum(losses))
    return {
        "total_trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(len(wins) / n * 100, 1),
        "profit_factor": round(gp / gl, 2) if gl > 0 else None,
        "total_pnl_thb": round(pnl_thb, 2),
        "expectancy_pct": round(sum(pnls) / n * 100, 3),
        "avg_win_pct": round(sum(wins) / len(wins) * 100, 2) if wins else 0.0,
        "avg_loss_pct": round(sum(losses) / len(losses) * 100, 2) if losses else 0.0,
    }
