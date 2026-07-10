"""Pure-function tests for the per-coin timeframe picker."""
from app.trading.tf_tuner import pick_timeframe


def _st(trades, win, pf, ret):
    return {"total_trades": trades, "win_rate": win, "profit_factor": pf,
            "total_return_pct": ret}


def test_assigns_the_qualifying_tf():
    results = {
        "15M": _st(11, 72.7, 1.89, 3.38),    # ADA's real numbers — qualifies
        "1H":  _st(12, 58.3, 0.87, -1.37),
        "4H":  _st(3, 33.3, 0.41, -4.3),
    }
    assert pick_timeframe(results, "1H", min_trades=5, min_pf=1.2) == "15M"


def test_falls_back_to_default_when_nothing_qualifies():
    results = {                              # XLM's real numbers — all losing
        "15M": _st(7, 42.9, 0.72, -1.88),
        "1H":  _st(16, 31.2, 0.49, -18.68),
        "4H":  _st(3, 0.0, 0.0, -12.04),
    }
    assert pick_timeframe(results, "1H", min_trades=5, min_pf=1.2) == "1H"


def test_small_sample_never_wins_even_if_pretty():
    results = {"4H": _st(4, 75.0, 5.59, 7.58)}   # ETH: gorgeous but n=4
    assert pick_timeframe(results, "1H", min_trades=5, min_pf=1.2) == "1H"


def test_pf_none_with_wins_counts_as_infinite():
    results = {"4H": _st(6, 100.0, None, 5.0),   # no losing trade yet
               "1H": _st(10, 60.0, 1.5, 3.0)}
    assert pick_timeframe(results, "1H", min_trades=5, min_pf=1.2) == "4H"


def test_negative_return_disqualifies_despite_pf():
    results = {"4H": _st(8, 55.0, 1.4, -0.5)}
    assert pick_timeframe(results, "1H", min_trades=5, min_pf=1.2) == "1H"


def test_highest_pf_wins_among_qualifiers():
    results = {"15M": _st(8, 60.0, 1.3, 2.0), "4H": _st(9, 62.0, 1.8, 2.5)}
    assert pick_timeframe(results, "1H", min_trades=5, min_pf=1.2) == "4H"
