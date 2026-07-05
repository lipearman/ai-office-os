"""Pure-function tests for the weekly coach's deterministic tuning rules."""
from app.trading.coach import recommend
from app.trading.tuning import TUNABLE, COACH_ADJUSTABLE, clamp


PARAMS = {
    "AUTO_PAPER_MIN_WIN_PCT": 55.0,
    "ML_VOTE_MIN_PROB": 0.5,
    "AUTO_PAPER_BEARISH_ML_EXTRA": 0.05,
    "AUTO_PAPER_MAX_HOLD_HOURS": 72.0,
    "AUTO_PAPER_BREAKEVEN_AT_R": 1.0,
}


def _ev(**over):
    ev = {
        "n_closed": 0, "wins": 0, "win_rate": None, "total_pnl_thb": 0.0,
        "exit_reasons": {}, "bearish": {"n": 0, "wins": 0},
        "calibration": {"strategies": [], "total_closed": 0},
        "params": dict(PARAMS),
    }
    ev.update(over)
    return ev


def test_no_data_no_recommendations():
    assert recommend(_ev()) == []


def test_overpromising_strategy_raises_win_bar():
    ev = _ev(n_closed=12, calibration={"strategies": [{
        "strategy": "auto:ema_pullback", "trades": 12,
        "predicted_win_pct": 70.0, "realized_win_pct": 40.0, "gap_pct": -30.0,
        "with_prediction": 12,
    }], "total_closed": 12})
    recs = recommend(ev)
    assert any(r["param"] == "AUTO_PAPER_MIN_WIN_PCT" and r["proposed"] == 60.0
               for r in recs)


def test_small_sample_never_tunes():
    ev = _ev(n_closed=5, calibration={"strategies": [{
        "strategy": "auto:ema_pullback", "trades": 5,
        "predicted_win_pct": 70.0, "realized_win_pct": 0.0, "gap_pct": -70.0,
        "with_prediction": 5,
    }], "total_closed": 5},
        exit_reasons={"max_loss": 5}, bearish={"n": 5, "wins": 0})
    assert recommend(ev) == []


def test_time_stop_dominance_shrinks_hold_budget():
    ev = _ev(n_closed=10, exit_reasons={"time": 5, "stop": 3, "target": 2})
    recs = recommend(ev)
    assert any(r["param"] == "AUTO_PAPER_MAX_HOLD_HOURS" and r["proposed"] == 48.0
               for r in recs)


def test_catastrophe_exits_raise_ml_floor():
    ev = _ev(n_closed=10, exit_reasons={"max_loss": 3, "stop": 7})
    recs = recommend(ev)
    assert any(r["param"] == "ML_VOTE_MIN_PROB" and abs(r["proposed"] - 0.52) < 1e-9
               for r in recs)


def test_bearish_losses_demand_more_conviction():
    ev = _ev(n_closed=10, bearish={"n": 8, "wins": 1})
    recs = recommend(ev)
    assert any(r["param"] == "AUTO_PAPER_BEARISH_ML_EXTRA"
               and abs(r["proposed"] - 0.10) < 1e-9 for r in recs)


def test_low_realized_winrate_raises_bar_without_calibration():
    # legacy trades: no prediction snapshots, so no calibration verdict — the
    # realized win rate alone must still steer the bar
    ev = _ev(n_closed=12, wins=3)
    recs = recommend(ev)
    assert any(r["param"] == "AUTO_PAPER_MIN_WIN_PCT" and r["proposed"] == 60.0
               for r in recs)


def test_high_realized_winrate_lowers_bar():
    ev = _ev(n_closed=12, wins=9)
    recs = recommend(ev)
    assert any(r["param"] == "AUTO_PAPER_MIN_WIN_PCT" and r["proposed"] == 50.0
               for r in recs)


def test_winrate_fallback_defers_to_calibration_rule():
    # when calibration already adjusted the bar, the fallback must not stack
    ev = _ev(n_closed=12, wins=3, calibration={"strategies": [{
        "strategy": "auto:ema_pullback", "trades": 12,
        "predicted_win_pct": 70.0, "realized_win_pct": 25.0, "gap_pct": -45.0,
        "with_prediction": 12,
    }], "total_closed": 12})
    recs = [r for r in recommend(ev) if r["param"] == "AUTO_PAPER_MIN_WIN_PCT"]
    assert len(recs) == 1


def test_clamp_keeps_every_param_inside_bounds():
    for key, (lo, hi) in TUNABLE.items():
        assert clamp(key, lo - 999) == lo
        assert clamp(key, hi + 999) == hi
        mid = (lo + hi) / 2
        assert clamp(key, mid) == mid


def test_enum_param_validation():
    from app.trading.tuning import TUNABLE_ENUM, validate_enum
    assert "DESK_SCAN_TIMEFRAME" in TUNABLE_ENUM
    assert validate_enum("DESK_SCAN_TIMEFRAME", "4h") == "4H"      # case-insensitive
    assert validate_enum("DESK_SCAN_TIMEFRAME", "1D") == "1D"
    assert validate_enum("DESK_SCAN_TIMEFRAME", "7M") == "1H"      # invalid -> fallback
    # the scan heartbeat must never be coach-adjustable (weekly flip = chaos)
    assert "DESK_SCAN_TIMEFRAME" not in COACH_ADJUSTABLE


def test_coach_whitelist_excludes_switches():
    # the coach must never be able to flip the game on/off or resize positions —
    # those knobs belong to the human / night-shift analyst
    assert COACH_ADJUSTABLE <= set(TUNABLE)
    for switch in ("AUTO_PAPER_ENABLED", "AUTO_PAPER_REQUIRE_SIGNAL",
                   "AUTO_PAPER_SIZE_THB", "AUTO_PAPER_MAX_POSITIONS"):
        assert switch not in COACH_ADJUSTABLE


def test_every_recommendation_is_coach_adjustable():
    # any rule that proposes a non-whitelisted param would be silently dropped
    # at apply time — catch that drift here instead
    evs = [
        _ev(n_closed=12, wins=3),
        _ev(n_closed=10, exit_reasons={"time": 5, "stop": 5}),
        _ev(n_closed=10, exit_reasons={"max_loss": 3, "stop": 7}),
        _ev(n_closed=10, bearish={"n": 8, "wins": 1}),
    ]
    for ev in evs:
        for r in recommend(ev):
            assert r["param"] in COACH_ADJUSTABLE
