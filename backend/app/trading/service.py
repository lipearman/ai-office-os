"""High-level trading-intelligence service: fetch → indicators → MTF → brief.

Reused by the analyze endpoint (single symbol) and the scanner (watchlist).
"""
from __future__ import annotations

import asyncio

from app.trading.bitkub import BitkubClient, to_tradingview_symbol, BitkubError
from app.trading.indicators import compute_features
from app.trading.mtf import build_snapshot, build_daily_brief, MTFSnapshot
from app.trading.backtest import (
    run_backtest, walk_forward_winrate, BacktestParams, prepare, _valid_i, _entry_ok_i,
)
from app.trading.indicators import indicator_frame
from app.trading.optimizer import optimize
from app.trading.ml import ml_report


async def analyze_symbol(client: BitkubClient, symbol: str) -> MTFSnapshot | None:
    """Full top-down analysis for one symbol. None if data unavailable."""
    tv = to_tradingview_symbol(symbol)
    try:
        mtf = await client.fetch_mtf(tv)
    except BitkubError:
        return None
    features = {}
    for tf, candles in mtf.items():
        f = compute_features(candles)
        if f:
            features[tf] = f
    if not features:
        return None
    return build_snapshot(tv, features)


async def analyze_with_brief(client: BitkubClient, symbol: str) -> dict | None:
    snap = await analyze_symbol(client, symbol)
    if not snap:
        return None
    return {"snapshot": snap.to_dict(), "brief": build_daily_brief(snap)}


async def backtest_symbol(
    client: BitkubClient, symbol: str, timeframe: str = "4H", limit: int = 1500
) -> dict | None:
    """Run baseline vs validated backtest → both results for A/B comparison."""
    tv = to_tradingview_symbol(symbol)
    try:
        candles = await client.fetch_ohlcv(tv, timeframe, limit=limit)
    except BitkubError:
        return None
    if not candles:
        return None

    baseline = run_backtest(candles, BacktestParams(use_validator=False))
    validated = run_backtest(candles, BacktestParams(use_validator=True))

    def _delta(a: dict, b: dict, key: str):
        av, bv = a.get(key), b.get(key)
        if av is None or bv is None:
            return None
        return round(bv - av, 2)

    bs, vs = baseline.stats, validated.stats
    return {
        "symbol": tv,
        "timeframe": timeframe,
        "bars": baseline.bars,
        "baseline": baseline.to_dict(),
        "validated": validated.to_dict(),
        "delta": {
            "profit_factor": _delta(bs, vs, "profit_factor"),
            "win_rate": _delta(bs, vs, "win_rate"),
            "total_return_pct": _delta(bs, vs, "total_return_pct"),
            "total_trades": _delta(bs, vs, "total_trades"),
        },
    }


async def optimize_symbol(
    client: BitkubClient, symbol: str, timeframe: str = "1H", limit: int = 2000
) -> dict | None:
    """Walk-forward auto-optimize → suggested params + OOS evidence (human gate)."""
    tv = to_tradingview_symbol(symbol)
    try:
        candles = await client.fetch_ohlcv(tv, timeframe, limit=limit)
    except BitkubError:
        return None
    if not candles:
        return None
    return await asyncio.to_thread(optimize, candles, 4)


async def ml_symbol(
    client: BitkubClient, symbol: str, timeframe: str = "1H", limit: int = 2000,
    horizon: int = 8,
) -> dict | None:
    """ML ensemble report (walk-forward) + rule-vs-ensemble compare (human gate)."""
    tv = to_tradingview_symbol(symbol)
    try:
        candles = await client.fetch_ohlcv(tv, timeframe, limit=limit)
    except BitkubError:
        return None
    if not candles:
        return None
    return await asyncio.to_thread(ml_report, candles, horizon)


async def daily_opportunity(
    client: BitkubClient, symbol: str, cfg: dict | None = None, default_tf: str = "1H",
    regime: dict | None = None,
) -> dict | None:
    """Estimate today's winning chance for a symbol.

    Combines (a) whether the (assigned) strategy's entry condition fires on the
    latest CLOSED bar, with (b) that strategy's historical win rate / profit
    factor from a backtest. This is an *estimate* from past setups + the current
    signal — not a guarantee.
    """
    tv = to_tradingview_symbol(symbol)
    tf = (cfg or {}).get("timeframe") or default_tf
    params = BacktestParams(**cfg["params"]) if cfg and cfg.get("params") else BacktestParams()
    strategy = params.strategy

    try:
        candles = await client.fetch_ohlcv(tv, tf, limit=1500)
    except BitkubError:
        return None
    if not candles:
        return None

    # historical edge for this strategy on this symbol
    bt = run_backtest(candles, params)
    hist = bt.stats
    wr = hist.get("win_rate")
    pf = hist.get("profit_factor")
    n = hist.get("total_trades", 0)
    exp = hist.get("expectancy_pct")
    # walk-forward view: is the edge consistent across time + still alive recently?
    # (the single backtest above is all-history; this is the more honest signal)
    wf = walk_forward_winrate(candles, params)
    oos_wr = wf.get("oos_win_rate")
    recent_wr = wf.get("recent_win_rate")
    wf_std = wf.get("wf_stability_std")

    # today's signal: does the entry fire on the latest closed bar?
    df = indicator_frame(candles, closed_only=True).reset_index(drop=True)
    C = prepare(df)
    last = len(df) - 1
    signal_today = bool(last >= 0 and _valid_i(C, last) and _entry_ok_i(C, last, params))

    # trade plan from the latest bar
    close = float(C["close"][last]); atr = float(C["atr14"][last]) or close * 0.01
    stop = close - params.stop_atr * atr
    target = close + params.tp_rr * (close - stop)

    confidence = min(1.0, n / 15.0)              # sample-size confidence
    has_edge = (pf is not None and pf >= 1.2 and (wr or 0) >= 50)
    reasons: list[str] = []

    if signal_today:
        # win chance: prefer the walk-forward (out-of-sample) view, weighted toward
        # recent performance, so a coin whose edge decayed lately scores lower.
        if oos_wr is not None and recent_wr is not None:
            win_chance = round(0.4 * oos_wr + 0.6 * recent_wr, 1)
        elif oos_wr is not None:
            win_chance = oos_wr
        elif wr is not None and n >= 5:
            win_chance = wr
        else:
            win_chance = 50.0
        # an unstable edge across periods (high fold spread) lowers confidence
        stab_factor = max(0.5, 1.0 - (wf_std or 0) / 40.0)
        eff_conf = confidence * stab_factor
        # opportunity score: win chance, tempered by edge quality + confidence
        edge_mult = 1.0 if has_edge else (0.8 if (pf or 0) >= 1.0 else 0.6)
        score = round(win_chance * (0.55 + 0.45 * eff_conf) * edge_mult, 1)
        reasons.append(f"✅ สัญญาณ {strategy} เกิดวันนี้ ({tf})")
        if oos_wr is not None:
            reasons.append(f"walk-forward: เฉลี่ย {oos_wr}% · ล่าสุด {recent_wr}% (อดีตรวม {wr}% จาก {n} เทรด)")
        elif wr is not None and n >= 5:
            reasons.append(f"อดีตชนะ {wr}% จาก {n} เทรด (PF {pf}, expectancy {exp}%)")
        else:
            reasons.append(f"ตัวอย่างอดีตน้อย ({n} เทรด) — ความเชื่อมั่นต่ำ")
        if recent_wr is not None and oos_wr is not None and recent_wr < oos_wr - 10:
            reasons.append(f"⚠️ edge ระยะหลังอ่อนลง (ล่าสุด {recent_wr}% < เฉลี่ย {oos_wr}%)")
        if wf_std is not None and wf_std > 15:
            reasons.append(f"⚠️ win-rate ไม่เสถียรข้ามช่วงเวลา (±{wf_std}%)")
        if not has_edge:
            reasons.append("⚠️ กลยุทธ์นี้ยังไม่พิสูจน์ว่ามี edge ชัด — ระวัง")
        if confidence < 0.5:
            reasons.append("⚠️ sample เล็ก ผลอาจไม่น่าเชื่อถือ")
        if win_chance >= 55 and has_edge:
            label = "🟢 จังหวะดี"
        elif win_chance >= 45:
            label = "🟡 พอมีลุ้น"
        else:
            label = "🟠 สัญญาณมา แต่อดีตอ่อน"
    else:
        win_chance = None
        score = round((10 if has_edge else 3) * confidence, 1)  # watch value only
        label = "🔵 ยังไม่มีจังหวะวันนี้"
        reasons.append(f"ยังไม่เข้าเงื่อนไข {strategy} บนแท่งล่าสุด ({tf})")
        if has_edge:
            reasons.append(f"กลยุทธ์มี edge ในอดีต (ชนะ {wr}% PF {pf}) — รอ setup")
        else:
            reasons.append("กลยุทธ์ยังไม่มี edge ชัดในอดีต")

    # market-regime overlay: a long pullback that fights the BTC trend is riskier,
    # so discount its score (ranking) and tag the bias for the auto-trader.
    bias = (regime or {}).get("bias", "neutral")
    regime_mult = {"bullish": 1.0, "neutral": 0.92, "bearish": 0.7}.get(bias, 1.0)
    score = round(score * regime_mult, 1)
    if signal_today and bias == "bearish":
        reasons.append("⚠️ ตลาดรวมขาลง (BTC) — long สวนเทรนด์ เสี่ยงสูง")
    elif signal_today and bias == "bullish":
        reasons.append("ตลาดรวมขาขึ้น (BTC) หนุนฝั่ง long")

    return {
        "symbol": tv,
        "timeframe": tf,
        "strategy": strategy,
        "assigned": cfg is not None,
        "signal_today": signal_today,
        "market_bias": bias,
        "win_chance_pct": win_chance,
        "opportunity_score": score,
        "label": label,
        "reasons": reasons,
        "historical": {"win_rate": wr, "profit_factor": pf, "expectancy_pct": exp, "trades": n,
                       "oos_win_rate": oos_wr, "recent_win_rate": recent_wr,
                       "wf_stability_std": wf_std, "wf_folds": wf.get("wf_folds")},
        "price": round(close, 2),
        "plan": {"entry": round(close, 2), "stop": round(stop, 2),
                 "target": round(target, 2), "rr": params.tp_rr} if signal_today else None,
        "disclaimer": "ประมาณการจากสถิติอดีต + สัญญาณวันนี้ ไม่ใช่การรับประกัน",
    }


async def market_regime(client: BitkubClient, symbol: str = "BTC_THB", tf: str = "1D") -> dict:
    """Overall market bias from the BTC trend (close vs EMA200, EMA50 vs EMA200).

    The desk strategy is a LONG-only pullback, so setups taken in a downtrend
    fight the tide and are riskier — the scan discounts them and auto-trade
    demands a stronger edge before opening one. Best-effort → neutral on any issue.
    """
    try:
        candles = await client.fetch_ohlcv(symbol, tf, limit=320)
        df = indicator_frame(candles, closed_only=True).reset_index(drop=True)
        row = df.iloc[-1]
        close = float(row["close"]); ema50 = float(row["ema50"]); ema200 = float(row["ema200"])
    except Exception:
        return {"bias": "neutral", "detail": "ประเมินเทรนด์ตลาดไม่ได้"}
    # NaN / bad-data guard (x != x is True only for NaN)
    if not (ema200 > 0) or ema50 != ema50 or ema200 != ema200:
        return {"bias": "neutral", "detail": "ข้อมูลเทรนด์ไม่พอ"}
    if close > ema200 and ema50 >= ema200:
        bias = "bullish"
    elif close < ema200 and ema50 <= ema200:
        bias = "bearish"
    else:
        bias = "neutral"
    return {"bias": bias, "tf": tf, "detail": f"BTC {bias}"}


async def daily_opportunities(items: list[dict], concurrency: int = 4) -> list[dict]:
    """Evaluate each watchlist item (symbol + assigned cfg) → ranked by score."""
    client = BitkubClient()
    regime = await market_regime(client)          # market-wide bias, computed once
    sem = asyncio.Semaphore(concurrency)

    async def one(it: dict) -> dict | None:
        async with sem:
            try:
                return await daily_opportunity(client, it["symbol"], it.get("cfg"), regime=regime)
            except Exception:
                # a single bad/illiquid symbol (esp. from market discovery) must
                # not abort the whole scan
                return None

    results = await asyncio.gather(*[one(it) for it in items], return_exceptions=True)
    out = [r for r in results if isinstance(r, dict)]
    # signals-with-today first, then by opportunity score
    out.sort(key=lambda r: (0 if r["signal_today"] else 1, -r["opportunity_score"]))
    return out


def _fmt_price(p: float | None) -> str:
    return f"{p:,.0f}" if p is not None and p >= 100 else (f"{p:,.4f}" if p is not None else "—")


def build_desk(opps: list[dict], positions: list[dict], stats: dict,
               news_agg: dict, prices: dict | None = None, seed: int = 0) -> list[dict]:
    """Synthesize 7 trading-desk characters' messages from live data.

    Deterministic (no LLM). Messages include moving numbers (live price /
    unrealized PnL) and a rotation `seed` so they reflect fresh data instead
    of repeating a static snapshot.
    """
    prices = prices or {}
    sig = [o for o in opps if o.get("signal_today")]
    top = sig[0] if sig else (opps[0] if opps else None)
    n_pos = len(positions)
    news_assets = news_agg.get("assets", []) if news_agg else []

    # 📊 Market Analyst — current price of the focus symbol (moves each poll)
    if top:
        sym = top["symbol"]
        px = _fmt_price(prices.get(sym) or top.get("price"))
        if sig:
            analyst = f"{sym} {px} เข้า setup แล้ว (win ~{top.get('win_chance_pct')}%) · มีสัญญาณ {len(sig)} เหรียญ"
        else:
            analyst = f"{sym} ราคา {px} · ยังไม่เข้า setup — เฝ้าดู {len(opps)} เหรียญ"
    else:
        analyst = "ยังไม่มีเหรียญใน watchlist — เพิ่มเหรียญเพื่อเริ่มวิเคราะห์"

    # 📰 News & Sentiment — rotate which asset's headline surfaces
    if news_assets:
        na = news_assets[seed % len(news_assets)]
        head = na["headlines"][0]["title"][:70] if na.get("headlines") else ""
        news_msg = f"{na['asset']}: {na['label']} ({na['count']} ข่าว) — {head}" if head else \
                   f"{na['asset']}: {na['label']} ({na['count']} ข่าว, {na['bullish']}↑/{na['bearish']}↓)"
    else:
        news_msg = "ยังไม่มีข่าวเด่นเกี่ยวกับเหรียญใน watchlist"

    # 🛡️ Risk Officer — live unrealized exposure
    unreal = sum((p.get("unrealized_thb") or 0.0) for p in positions)
    if n_pos == 0:
        risk = "ไม่มี position เปิดอยู่ — ความเสี่ยงเป็นศูนย์"
    else:
        tone = "ระวังกระจุกตัว ⚠️" if n_pos > 3 else "อยู่ในเกณฑ์โอเค"
        risk = f"{n_pos} position · unrealized {unreal:+,.0f}฿ — {tone}"

    # 🤖 Trader — live floating PnL per holding
    if n_pos:
        parts = [f"{p['symbol']} {(p.get('unrealized_thb') or 0):+,.0f}฿" for p in positions[:2]]
        trader = f"ถือ {n_pos} ดีล · " + ", ".join(parts)
    elif sig:
        px = _fmt_price(prices.get(top["symbol"]) or top.get("price"))
        trader = f"พร้อมเข้า {top['symbol']} ที่ {px} — กด 📝 เทรดได้เลย"
    else:
        trader = "รอจังหวะ — ยังไม่มี setup ให้เข้า"

    # 🎯 Coach — rotate through real stat facets by `seed` so the desk keeps
    # talking instead of saying the same line once and going silent.
    nt = stats.get("total_trades", 0)
    if nt:
        wr = stats.get("win_rate") or 0
        coach_lines = [
            f"สถิติสะสม: {nt} เทรด, ชนะ {stats.get('win_rate')}%, PnL {stats.get('total_pnl_thb')}฿",
            f"Expectancy {stats.get('expectancy_pct')}% ต่อเทรด ({stats.get('wins')}W/{stats.get('losses')}L)",
            f"win rate {wr}% — " + ("รักษาวินัยไว้ อย่าเพิ่งเพิ่มไซซ์" if wr >= 50 else "เน้น setup คุณภาพ อย่าไล่ราคา"),
        ]
        coach = coach_lines[seed % len(coach_lines)]
    else:
        coach = "ยังไม่มีประวัติเทรด — เริ่ม paper trade เพื่อสะสมสถิติ"

    # 📉 Model Monitor — rotate real facets (assigned strategies / watch coverage / top score)
    assigned = [o for o in opps if o.get("assigned")]
    if opps:
        monitor_lines: list[str] = []
        if assigned:
            monitor_lines.append(f"{len(assigned)} เหรียญมีกลยุทธ์เฉพาะตัวที่ optimize แล้ว")
        else:
            monitor_lines.append("ยังไม่ได้ optimize กลยุทธ์ต่อเหรียญ — ลองใช้ Auto-Optimizer")
        monitor_lines.append(f"เฝ้า {len(opps)} เหรียญ · มีสัญญาณวันนี้ {len(sig)}")
        if top is not None and top.get("opportunity_score") is not None:
            monitor_lines.append(f"{top['symbol']} opportunity score {top.get('opportunity_score')}")
        monitor = monitor_lines[seed % len(monitor_lines)]
    else:
        monitor = "ยังไม่ได้ optimize กลยุทธ์ต่อเหรียญ — ลองใช้ Auto-Optimizer"

    # 🔍 Execution Reviewer — rotate quality facets by `seed`
    if nt:
        pf = stats.get("profit_factor")
        wins = stats.get("wins") or 0
        losses = stats.get("losses") or 0
        exec_lines = [
            f"Profit Factor {pf if pf is not None else '∞'} · avg win {stats.get('avg_win_pct')}% / loss {stats.get('avg_loss_pct')}%",
            f"{wins} ดีลกำไร / {losses} ขาดทุน — " + ("คุณภาพการเข้าโอเค" if wins >= losses else "ทบทวนจังหวะเข้า"),
        ]
        exec_rev = exec_lines[seed % len(exec_lines)]
    else:
        exec_rev = "ยังไม่มีดีลปิดให้รีวิวคุณภาพการเข้า/ออก"

    return [
        {"key": "trader",   "name": "Trader",          "emoji": "🤖", "role": "engine",   "message": trader},
        {"key": "analyst",  "name": "Market Analyst",  "emoji": "📊", "role": "advisory", "message": analyst},
        {"key": "news",     "name": "News & Sentiment","emoji": "📰", "role": "advisory", "message": news_msg},
        {"key": "risk",     "name": "Risk Officer",    "emoji": "🛡️", "role": "advisory", "message": risk},
        {"key": "coach",    "name": "Coach",           "emoji": "🎯", "role": "advisory", "message": coach},
        {"key": "monitor",  "name": "Model Monitor",   "emoji": "📉", "role": "advisory", "message": monitor},
        {"key": "exec",     "name": "Execution Reviewer","emoji": "🔍","role": "advisory", "message": exec_rev},
    ]


# rank: BUY first, then by strength/alignment desc
_SIGNAL_RANK = {"BUY": 0, "HOLD": 1, "SELL": 2}


async def scan_symbols(symbols: list[str], concurrency: int = 4) -> list[dict]:
    """Scan many symbols and return ranked scan results."""
    client = BitkubClient()
    sem = asyncio.Semaphore(concurrency)

    async def one(sym: str) -> dict | None:
        async with sem:
            snap = await analyze_symbol(client, sym)
        if not snap:
            return None
        f1h = snap.features.get("1H")
        return {
            "symbol": snap.symbol,
            "signal": snap.signal,
            "strength": round(snap.strength, 3),
            "alignment_score": round(snap.alignment_score, 3),
            "bias": snap.bias,
            "reason": "; ".join(snap.reasons) or "—",
            "warnings": snap.warnings,
            "price": f1h.close if f1h else None,
            "entry": snap.entry,
            "stop": snap.stop,
            "target": snap.target,
            "rr": snap.rr,
        }

    results = await asyncio.gather(*[one(s) for s in symbols])
    out = [r for r in results if r]
    out.sort(key=lambda r: (_SIGNAL_RANK.get(r["signal"], 9), -r["strength"]))
    return out
