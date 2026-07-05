"""Pure-function tests for the sustained-volume baseline + pump detector."""
from app.trading.market_watch import median, is_pump
from app.trading.notify import fmt_pump


def test_median_odd_even_empty():
    assert median([3.0, 1.0, 2.0]) == 2.0
    assert median([4.0, 1.0, 2.0, 3.0]) == 2.5
    assert median([]) is None


def test_pump_needs_both_price_and_volume():
    # EPIC-like: +32% on 6x normal volume -> pump
    assert is_pump(32.5, 6.0, min_chg=20.0, min_ratio=4.0) is True
    # rally on normal volume = just a rally
    assert is_pump(32.5, 1.2, min_chg=20.0, min_ratio=4.0) is False
    # volume spike without price = accumulation/news, not a chase trap
    assert is_pump(3.0, 8.0, min_chg=20.0, min_ratio=4.0) is False
    # missing data never flags
    assert is_pump(None, 6.0, min_chg=20.0, min_ratio=4.0) is False
    assert is_pump(32.5, None, min_chg=20.0, min_ratio=4.0) is False


def test_pump_message_carries_evidence():
    msg = fmt_pump("EPIC_THB", 32.5, 6.3)
    assert "EPIC_THB" in msg and "+33%" in msg or "+32%" in msg
    assert "6.3x" in msg and msg.startswith("🎪")
