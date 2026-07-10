"""Pure-function tests for paper trading stats + calibration."""
from app.trading.paper import paper_stats, calibration_stats


def _trade(pnl_thb, strategy="auto:ema_pullback", win_chance=None):
    return {
        "pnl_thb": pnl_thb,
        "pnl_pct": pnl_thb / 10.0,
        "strategy": strategy,
        "indicators": {"win_chance_pct": win_chance} if win_chance is not None else {},
    }


def test_calibration_empty():
    out = calibration_stats([])
    assert out == {"strategies": [], "total_closed": 0}


def test_calibration_predicted_vs_realized():
    closed = [
        _trade(+50, win_chance=70),   # win
        _trade(-30, win_chance=70),   # loss
        _trade(-20, win_chance=60),   # loss
        _trade(+10, win_chance=80),   # win
    ]
    out = calibration_stats(closed)
    assert out["total_closed"] == 4
    s = out["strategies"][0]
    assert s["strategy"] == "auto:ema_pullback"
    assert s["trades"] == 4
    assert s["realized_win_pct"] == 50.0
    assert s["predicted_win_pct"] == 70.0        # (70+70+60+80)/4
    assert s["gap_pct"] == -20.0                 # over-promised by 20 points
    assert s["with_prediction"] == 4


def test_calibration_groups_by_strategy_and_handles_missing_prediction():
    closed = [
        _trade(+50, strategy="auto:ema_pullback", win_chance=60),
        _trade(-50, strategy="auto:rsi_reversion"),          # no snapshot (legacy)
        _trade(+10, strategy=None),                          # manual trade
    ]
    out = calibration_stats(closed)
    by_name = {s["strategy"]: s for s in out["strategies"]}
    assert set(by_name) == {"auto:ema_pullback", "auto:rsi_reversion", "manual"}
    rsi = by_name["auto:rsi_reversion"]
    assert rsi["predicted_win_pct"] is None and rsi["gap_pct"] is None
    assert rsi["realized_win_pct"] == 0.0
    assert by_name["manual"]["realized_win_pct"] == 100.0


def test_paper_stats_still_works_with_extra_keys():
    closed = [_trade(+50, win_chance=70), _trade(-30, win_chance=60)]
    out = paper_stats(closed)
    assert out["total_trades"] == 2
    assert out["wins"] == 1 and out["losses"] == 1
