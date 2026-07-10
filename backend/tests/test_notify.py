"""Pure-function tests for Telegram notification gating and formatting."""
from app.trading.notify import (
    in_quiet_hours, fmt_entry, fmt_close, fmt_breakeven, fmt_radar, fmt_regime,
)


def test_quiet_hours_simple_window():
    # 0..8 quiet
    assert in_quiet_hours(3, 0, 8) is True
    assert in_quiet_hours(0, 0, 8) is True
    assert in_quiet_hours(8, 0, 8) is False
    assert in_quiet_hours(12, 0, 8) is False


def test_quiet_hours_wrapping_window():
    # 22..6 wraps midnight
    assert in_quiet_hours(23, 22, 6) is True
    assert in_quiet_hours(2, 22, 6) is True
    assert in_quiet_hours(10, 22, 6) is False


def test_quiet_hours_disabled_when_equal():
    assert in_quiet_hours(3, 0, 0) is False


def test_fmt_entry_includes_rr_and_open_size():
    o = {"symbol": "NEAR_THB", "price": 66.2, "win_chance_pct": 67,
         "ml_prob": 0.58, "market_bias": "bullish",
         "plan": {"stop": 64.1, "target": 70.9}}
    msg = fmt_entry(o, opened_thb=1000)
    assert "NEAR_THB" in msg and "RR 2.2" in msg and "1,000" in msg


def test_fmt_entry_survives_missing_plan():
    msg = fmt_entry({"symbol": "X_THB", "price": 10, "win_chance_pct": 50,
                     "ml_prob": 0.5, "market_bias": None, "plan": None})
    assert "X_THB" in msg


def test_fmt_close_maps_reasons_thai():
    msg = fmt_close("SOL_THB", "stop", -22.77, -2.277, 2715.0)
    assert "🔴" in msg and "stop" in msg and "-22.77" in msg
    win = fmt_close("SOL_THB", "target", 50.0, 5.0, 2900.0)
    assert "🟢" in win and "เป้า" in win


def test_fmt_breakeven_and_radar_and_regime():
    assert "ล็อกทุน" in fmt_breakeven("BTC_THB", 3400000.0)
    assert "52%" in fmt_radar("NEAR_THB", 0.52)
    assert "🐂" in fmt_regime("bearish", "bullish")
    assert "🐻" in fmt_regime("bullish", "bearish")
