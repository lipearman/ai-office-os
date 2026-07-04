"""Pure-function tests for the breadth-based early-turn detector."""
from app.trading.service import market_breadth, is_early_turn


def test_breadth_counts_green_fraction():
    ticker = {"A_THB": {"c": 2.0}, "B_THB": {"c": -1.0}, "C_THB": {"c": 0.5},
              "D_THB": {"c": 4.0}}
    assert market_breadth(ticker) == 0.75


def test_breadth_handles_empty_and_missing():
    assert market_breadth({}) is None
    assert market_breadth({"A_THB": {"p": 1.0}}) is None      # no change field
    assert market_breadth({"A_THB": {"c": 0.0}}) == 0.0       # flat is not green


def test_early_turn_requires_bearish_structure():
    # in a bullish/neutral regime there is nothing to "turn" from
    assert is_early_turn(False, 0.9, 0.5, threshold=0.6) is False


def test_early_turn_fires_on_breadth_and_nonnegative_news():
    assert is_early_turn(True, 0.72, 0.3, threshold=0.6) is True
    assert is_early_turn(True, 0.72, 0.0, threshold=0.6) is True
    assert is_early_turn(True, 0.72, None, threshold=0.6) is True


def test_early_turn_blocked_by_weak_breadth_or_bad_news():
    assert is_early_turn(True, 0.45, 0.5, threshold=0.6) is False
    assert is_early_turn(True, 0.72, -0.2, threshold=0.6) is False
    assert is_early_turn(True, None, 0.5, threshold=0.6) is False
