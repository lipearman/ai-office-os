"""Tests for the outbound alert webhook helper."""
from app.trading import alert_webhook as W


def test_valid_webhook_url():
    assert W.valid_webhook_url("http://x.com/hook")
    assert W.valid_webhook_url("https://x.com/hook")
    assert not W.valid_webhook_url("ftp://x.com")
    assert not W.valid_webhook_url("x.com")
    assert not W.valid_webhook_url("")
    assert not W.valid_webhook_url(None)  # type: ignore[arg-type]


async def test_post_alerts_short_circuits_without_network():
    # invalid url or empty alerts → False, never attempts a request
    assert await W.post_alerts("not-a-url", "ws", [{"text": "x"}]) is False
    assert await W.post_alerts("https://x.com", "ws", []) is False
