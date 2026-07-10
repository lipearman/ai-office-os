"""Pure-function tests for the market watcher's symbols diff."""
from app.trading.market_watch import diff_symbols


def test_first_run_baselines_quietly():
    vanished, appeared = diff_symbols(set(), {"BTC_THB", "ETH_THB"})
    assert vanished == set() and appeared == set()


def test_vanished_and_appeared():
    known = {"BTC_THB", "ETH_THB", "SYND_THB"}
    current = {"BTC_THB", "ETH_THB", "NEWCOIN_THB"}
    vanished, appeared = diff_symbols(known, current)
    assert vanished == {"SYND_THB"}
    assert appeared == {"NEWCOIN_THB"}


def test_no_change():
    s = {"BTC_THB", "ETH_THB"}
    assert diff_symbols(s, set(s)) == (set(), set())
