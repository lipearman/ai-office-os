"""Tests for the deterministic desk synthesis (the source of truth)."""
from app.trading.service import build_desk

ROLES = {"trader", "analyst", "news", "risk", "coach", "monitor", "exec"}


def _desk(**kw):
    return build_desk(
        kw.get("opps", []),
        kw.get("positions", []),
        kw.get("stats", {}),
        kw.get("news_agg", {}),
        kw.get("prices", {}),
        kw.get("seed", 0),
    )


def test_returns_seven_known_roles():
    chars = _desk()
    assert len(chars) == 7
    assert {c["key"] for c in chars} == ROLES
    for c in chars:
        assert c["message"]  # never empty


def test_trader_reflects_open_position():
    chars = _desk(positions=[{"symbol": "NEAR_THB", "unrealized_thb": 1086.0}])
    trader = next(c for c in chars if c["key"] == "trader")
    assert "NEAR_THB" in trader["message"]


def test_deterministic_same_inputs_same_output():
    args = dict(prices={"BTC_THB": 2_000_000}, seed=5)
    assert _desk(**args) == _desk(**args)


def test_seed_rotates_advisory_facets():
    # coach rotates through real stat facets by seed when there are closed trades
    stats = {"total_trades": 2, "win_rate": 0.0, "total_pnl_thb": -74.91,
             "wins": 0, "losses": 2, "expectancy_pct": -1.0,
             "profit_factor": 0.0, "avg_win_pct": 0.0, "avg_loss_pct": -0.5}
    msgs = {build_desk([], [], stats, {}, {}, s)[4]["message"] for s in range(3)}
    # coach is index 4; 3 seeds should surface more than one distinct line
    assert len(msgs) >= 2
