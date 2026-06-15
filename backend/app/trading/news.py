"""News & Sentiment — crypto RSS ingestion + lexicon sentiment.

No API key required: reads public RSS feeds and scores sentiment with a small
bullish/bearish lexicon (deterministic, works offline). This is an honest,
transparent baseline — an LLM can refine it later, but the lexicon never
hallucinates and is reproducible.

Sentiment is advisory context, not a trade trigger (news is often priced in).
"""
from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

import feedparser

# public RSS feeds (no key)
FEEDS = [
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
    ("Bitcoin Magazine", "https://bitcoinmagazine.com/.rss/full/"),
]

# map keywords → asset code
ASSET_KEYWORDS = {
    "BTC": ["bitcoin", "btc"],
    "ETH": ["ethereum", "eth", "ether"],
    "ADA": ["cardano", "ada"],
    "SOL": ["solana", "sol"],
    "XRP": ["xrp", "ripple"],
    "DOGE": ["dogecoin", "doge"],
    "BNB": ["binance coin", "bnb"],
}

BULLISH = {
    "surge", "soar", "rally", "gain", "gains", "jump", "bullish", "bull", "rise",
    "rises", "record", "high", "adoption", "approve", "approved", "approval",
    "inflow", "inflows", "breakout", "upgrade", "partnership", "soars", "climbs",
    "boost", "support", "buy", "accumulate", "etf", "milestone", "win", "positive",
}
BEARISH = {
    "crash", "plunge", "drop", "drops", "fall", "falls", "bearish", "bear", "dump",
    "selloff", "sell-off", "hack", "hacked", "exploit", "ban", "banned", "lawsuit",
    "sue", "sued", "fraud", "scam", "outflow", "outflows", "liquidation", "fear",
    "decline", "warning", "risk", "collapse", "fud", "down", "loss", "negative",
}

_word_re = re.compile(r"[a-z']+")


@dataclass
class NewsItem:
    source: str
    title: str
    url: str
    published_at: str          # ISO
    assets: list[str]
    sentiment: float           # -1..+1
    stance: str                # bullish | bearish | neutral

    def to_dict(self) -> dict:
        return asdict(self)


def _score_text(text: str) -> tuple[float, str]:
    words = _word_re.findall(text.lower())
    if not words:
        return 0.0, "neutral"
    pos = sum(1 for w in words if w in BULLISH)
    neg = sum(1 for w in words if w in BEARISH)
    total = pos + neg
    if total == 0:
        return 0.0, "neutral"
    score = (pos - neg) / total
    stance = "bullish" if score > 0.15 else ("bearish" if score < -0.15 else "neutral")
    return round(score, 3), stance


def _assets_in(text: str) -> list[str]:
    t = text.lower()
    found = []
    for code, kws in ASSET_KEYWORDS.items():
        if any(re.search(rf"\b{re.escape(k)}\b", t) for k in kws):
            found.append(code)
    return found


def _parse_feed(source: str, url: str, limit: int = 20) -> list[NewsItem]:
    items: list[NewsItem] = []
    try:
        feed = feedparser.parse(url)
    except Exception:
        return items
    for e in feed.entries[:limit]:
        title = getattr(e, "title", "") or ""
        summary = getattr(e, "summary", "") or ""
        link = getattr(e, "link", "") or ""
        text = f"{title}. {summary}"
        assets = _assets_in(text)
        if not assets:
            continue
        score, stance = _score_text(text)
        # published time
        pub = getattr(e, "published_parsed", None) or getattr(e, "updated_parsed", None)
        if pub:
            ts = datetime(*pub[:6], tzinfo=timezone.utc).isoformat()
        else:
            ts = datetime.now(timezone.utc).isoformat()
        items.append(NewsItem(
            source=source, title=title[:200], url=link, published_at=ts,
            assets=assets, sentiment=score, stance=stance,
        ))
    return items


# RSS rarely changes minute-to-minute; cache so frequent pollers (e.g. the
# /office desk on a 15s loop) don't re-hit the feeds every time.
_NEWS_TTL = 300.0  # 5 minutes
_news_cache: dict[int, tuple[float, list[NewsItem]]] = {}


async def fetch_news(limit_per_feed: int = 20) -> list[NewsItem]:
    """Fetch + parse all feeds concurrently (feedparser is sync → thread).

    Results are cached per `limit_per_feed` for _NEWS_TTL seconds.
    """
    now = time.monotonic()
    cached = _news_cache.get(limit_per_feed)
    if cached and now - cached[0] < _NEWS_TTL:
        return cached[1]

    tasks = [asyncio.to_thread(_parse_feed, name, url, limit_per_feed) for name, url in FEEDS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    items: list[NewsItem] = []
    for r in results:
        if isinstance(r, list):
            items.extend(r)
    # newest first
    items.sort(key=lambda x: x.published_at, reverse=True)
    # only cache a non-empty fetch — keep retrying if all feeds failed
    if items:
        _news_cache[limit_per_feed] = (now, items)
    return items


def aggregate_sentiment(items: list[NewsItem], assets: list[str] | None = None) -> dict:
    """Per-asset sentiment index + headline counts."""
    by_asset: dict[str, dict] = {}
    for it in items:
        for a in it.assets:
            if assets and a not in assets:
                continue
            d = by_asset.setdefault(a, {"asset": a, "scores": [], "bull": 0, "bear": 0, "headlines": []})
            d["scores"].append(it.sentiment)
            if it.stance == "bullish":
                d["bull"] += 1
            elif it.stance == "bearish":
                d["bear"] += 1
            if len(d["headlines"]) < 3:
                d["headlines"].append({"title": it.title, "source": it.source,
                                       "url": it.url, "stance": it.stance})
    out = []
    for a, d in by_asset.items():
        scores = d["scores"]
        avg = round(sum(scores) / len(scores), 3) if scores else 0.0
        label = "🟢 บวก" if avg > 0.15 else ("🔴 ลบ" if avg < -0.15 else "⚪ กลาง")
        out.append({
            "asset": a, "sentiment": avg, "label": label,
            "count": len(scores), "bullish": d["bull"], "bearish": d["bear"],
            "headlines": d["headlines"],
        })
    out.sort(key=lambda x: -x["count"])
    return {"assets": out, "total_items": len(items),
            "disclaimer": "Sentiment เป็นบริบทช่วยตัดสินใจ ไม่ใช่สัญญาณเข้า — ข่าวมักถูก price-in แล้ว"}
