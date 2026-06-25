import asyncio
import json
import structlog
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.llm import get_llm, _FallbackLLM
from app.trading.state import DeskState
from app.core.config import settings

log = structlog.get_logger()


def _llm_available() -> bool:
    if not settings.DESK_LLM_ENABLED:
        return False
    try:
        return not isinstance(get_llm(), _FallbackLLM)
    except Exception:
        return False


async def _llm_call(system: str, user: str, provider: str = "auto", model: str = "auto", temperature: float | None = None) -> str | None:
    # honor the kill-switch — when desk LLM is off, skip the (possibly slow)
    # network call entirely so the heavy tick stays fast and never times out.
    if not settings.DESK_LLM_ENABLED:
        return None
    try:
        llm = get_llm(provider, model, temperature if temperature is not None else 0.3)
        if isinstance(llm, _FallbackLLM):
            return None
        resp = await asyncio.wait_for(
            llm.ainvoke([SystemMessage(content=system), HumanMessage(content=user)]),
            timeout=settings.LLM_TIMEOUT_SECONDS,
        )
        return resp.content if isinstance(resp.content, str) else str(resp.content)
    except Exception as e:
        log.warning("desk_node_llm_failed", provider=provider, model=model, error=str(e))
        return None


def _parse_json(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        inner = text[3:]
        if "```" in inner:
            inner = inner[: inner.index("```")]
        text = inner.lstrip("json").strip()
    i, j = text.find("{"), text.rfind("}")
    if i < 0 or j <= i:
        return {}
    try:
        return json.loads(text[i : j + 1])
    except Exception:
        return {}


# ─── Prompts ────────────────────────────────────────────────────────────────

_PROMPT_MONITOR = """คุณคือ Model Monitor — หน้าที่: scan หาเหรียญที่มีโอกาสทำกำไรดีที่สุด 10 อันดับ
ข้อมูลที่ได้รับ:
- opportunities: โอกาสเทรดที่คำนวณจาก indicator (win_chance_pct, opportunity_score, signal_today ฯลฯ)

ตอบเป็น JSON:
{{
  "top_coins": [{{"symbol": ชื่อเหรียญ, "reason": "เหตุผลที่เลือก (ภาษาไทย)", "timeframe": timeframe}}],
  "summary": "สรุปภาพรวมโอกาสวันนี้ (ภาษาไทย ไม่เกิน 150 ตัวอักษร)"
}}
เลือกมา 10 เหรียญ เรียงจากดีที่สุดไปน้อยที่สุด"""

_PROMPT_ANALYST = """คุณคือ Market Analyst
หน้าที่: วิเคราะห์ภาพรวมตลาดและแนวโน้มของเหรียญที่ได้รับ คำนวณแนวรับ/แนวต้าน และระดับเทคนิค

ข้อมูลที่ได้รับ:
- opportunities: โอกาสเทรดที่คำนวณจาก indicator (win_chance_pct, opportunity_score, signal_today ฯลฯ)
- prices: ราคาล่าสุดของแต่ละเหรียญ
- news_agg: สรุป sentiment ข่าวโดยรวม

ตอบเป็น JSON:
{{
  "market_bias": "bullish|bearish|neutral",
  "focus_timeframe": "15M|1H|4H|1D",
  "analyst_message": "สรุปภาพรวมตลาด (ภาษาไทย ไม่เกิน 150 ตัวอักษร)",
  "key_levels": "แนวรับ/แนวต้านสำคัญ (ภาษาไทย) หรือ null"
}}
วิเคราะห์ทั้งตลาด ไม่ใช่เฉพาะเหรียญเดียว ใช้ข้อมูลที่ได้รับทั้งหมด"""

_PROMPT_RISK = """คุณคือ Risk Officer
หน้าที่: ประเมินความเสี่ยงของพอร์ตการลงทุน โดยรวมจากสภาพตลาดและสถานะปัจจุบัน

ข้อมูลที่ได้รับ:
- stats: สถิติการเทรดสะสม (win_rate, total_trades, profit_factor, total_pnl_thb)
- positions: รายการ position ที่เปิดอยู่ (symbol, unrealized_thb)
- opportunities: โอกาสเทรดที่คำนวณจาก indicator
- market_bias: ทิศทางตลาดโดยรวม
- trader_action: action ที่ Trader เสนอ (ENTER|HOLD|SKIP)

ตอบเป็น JSON:
{{
  "risk_level": "low|medium|high",
  "can_trade": true|false,
  "risk_verdict": "สรุปความเสี่ยง (ภาษาไทย ไม่เกิน 150 ตัวอักษร)",
  "max_position_size": "ขนาด position สูงสุดที่แนะนำ (ภาษาไทย) หรือ null",
  "warning": "คำเตือนพิเศษ (ภาษาไทย) หรือ null"
}}
เข้มงวดแต่สมเหตุสมผล เน้นรักษาเงินต้น"""

_PROMPT_NEWS = """คุณคือ News & Sentiment Analyst
หน้าที่: ตรวจสอบข่าวและ sentiment ที่มีผลกับเหรียญนี้โดยเฉพาะ

ข้อมูลที่ได้รับ:
- coin: {{symbol, price, reason}}
- news_agg: ข่าวล่าสุด

ตอบเป็น JSON:
{{
  "sentiment": "positive|negative|neutral",
  "summary": "สรุปข่าวที่มีผลกับเหรียญนี้ (ภาษาไทย ไม่เกิน 100 ตัวอักษร)",
  "key_news": "ข่าวเด่นที่เกี่ยวข้อง (ภาษาไทย) หรือ null"
}}"""

_PROMPT_TRADER = """คุณคือ Trader
หน้าที่: หาจุดเข้าซื้อที่ดีที่สุดสำหรับเหรียญนี้ โดยพิจารณาจากปัจจัยทั้งหมด

ข้อมูลที่ได้รับ:
- coin: {{symbol, price, reason, sentiment}}
- prices: ราคาล่าสุด
- news: สรุป sentiment

ตอบเป็น JSON:
{{
  "entry_zone": "ช่วงราคาที่เหมาะสมในการเข้า (ภาษาไทย เช่น 67,500-68,200)",
  "action": "ENTER|HOLD|SKIP",
  "reason": "เหตุผลในการตัดสินใจ (ภาษาไทย ไม่เกิน 120 ตัวอักษร)",
  "target": "เป้าหมายราคา (ถ้ามี)",
  "stop_loss": "จุด stop loss (ถ้ามี)",
  "confidence": 0.0-1.0
}}"""

_PROMPT_EXEC = """คุณคือ Execution Reviewer
หน้าที่: ตรวจสอบกลยุทธ์ของเหรียญนี้ด้วยการ backtest ตามกลยุทธ์ที่เสนอ

ข้อมูลที่ได้รับ:
- coin: {{symbol, price, action, entry_zone, reason}}
- stats: สถิติการเทรดสะสมของพอร์ต (win_rate, total_trades, profit_factor, total_pnl_thb)

ตอบเป็น JSON:
{{
  "verdict": "approve|adjust|reject",
  "backtest_summary": "สรุปผล backtest (ภาษาไทย ไม่เกิน 120 ตัวอักษร)",
  "win_rate_est": "ประมาณการ win rate (เป็น % หรือ 'N/A')",
  "risk_warning": "คำเตือนความเสี่ยง (ภาษาไทย) หรือ null",
  "suggestion": "คำแนะนำปรับกลยุทธ์ (ภาษาไทย) หรือ null"
}}"""

_PROMPT_COACH = """คุณคือ Coach
หน้าที่: ปรับกลยุทธ์และระวังความเสี่ยงสูงของเหรียญนี้ โดยสรุปจากข้อมูลทั้งหมด

ข้อมูลที่ได้รับ:
- coin: {{symbol, price, action, entry_zone, reason}}
- news: สรุป sentiment
- execution: ผล backtest + คำแนะนำ
- stats: สถิติรวมของพอร์ต

ตอบเป็น JSON:
{{
  "verdict": "go|caution|avoid",
  "advice": "คำแนะนำเชิงกลยุทธ์ (ภาษาไทย ไม่เกิน 120 ตัวอักษร)",
  "risk_level": "low|medium|high",
  "adjusted_strategy": "กลยุทธ์ที่ปรับแล้ว (ภาษาไทย ไม่เกิน 100 ตัวอักษร) หรือ null",
  "coach_tip": "เคล็ดลับ (ภาษาไทย) หรือ null"
}}"""

_PROMPT_SUMMARY = """คุณคือผู้สรุปผลการวิเคราะห์เหรียญทั้งหมด
หน้าที่: สรุปผลการวิเคราะห์แต่ละเหรียญที่ผ่านการตรวจสอบแล้ว

ข้อมูลที่ได้รับ:
- results: รายการผลลัพธ์ของแต่ละเหรียญ {{symbol, news, trader, exec, coach}}

ตอบเป็น JSON:
{{
  "overall": "สรุปภาพรวมวันนี้ (ภาษาไทย ไม่เกิน 150 ตัวอักษร)",
  "best_pick": "เหรียญที่น่าสนใจที่สุด",
  "total_analysed": จำนวนเหรียญที่วิเคราะห์,
  "recommendations": ["รายการคำแนะนำสั้นๆ ภาษาไทย 3-5 รายการ"]
}}"""


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _fmt_price(p: float | None) -> str:
    if p is None or p != p:
        return "—"
    return f"{p:,.0f}" if p >= 100 else f"{p:,.4f}"


# ─── Node: Model Monitor — scan top 10 coins ────────────────────────────────

async def node_monitor(state: DeskState) -> dict:
    opps = state.get("ranked_opportunities") or []
    if not opps:
        return {"ranked_coins": [], "coin_index": 0, "coin_results": [], "model_verdict": "ไม่มีโอกาสเทรดวันนี้"}

    prices = state.get("prices") or {}
    # Cap how many coins the per-coin agents (news/trader/coach) analyze with the
    # LLM — each coin = 3 LLM calls, so the heavy tick budget (150s) is what limits
    # this, not the model. Tune via DESK_LLM_MAX_COINS.
    max_coins = max(1, settings.DESK_LLM_MAX_COINS)
    top_n = opps[:max_coins]
    acfg = (state.get("agent_configs") or {}).get("monitor") or {}

    user = json.dumps({
        "opportunities": [{
            "symbol": o["symbol"],
            "price": prices.get(o["symbol"], o.get("price")),
            "signal_today": o.get("signal_today", False),
            "win_chance_pct": o.get("win_chance_pct"),
            "opportunity_score": o.get("opportunity_score"),
            "timeframe": o.get("timeframe", "1H"),
        } for o in top_n],
    }, ensure_ascii=False, default=str)

    prompt = acfg.get("system_prompt") or _PROMPT_MONITOR
    text = await _llm_call(prompt, user, acfg.get("provider", "auto"), acfg.get("model", "auto"), acfg.get("temperature"))
    if text:
        data = _parse_json(text)
        top_list = data.get("top_coins", [])
        summary = data.get("summary", "")
    else:
        top_list = [{"symbol": o["symbol"], "reason": "", "timeframe": o.get("timeframe", "1H")} for o in top_n]
        summary = f"พบ {len(top_n)} เหรียญมีโอกาส วันนี้มีสัญญาณ {len([o for o in opps if o.get('signal_today')])} เหรียญ"

    ranked_coins = []
    for item in top_list:
        sym = item["symbol"]
        opp = next((o for o in opps if o["symbol"] == sym), {})
        ranked_coins.append({
            "symbol": sym,
            "price": prices.get(sym) or opp.get("price"),
            "reason": item.get("reason", ""),
            "timeframe": item.get("timeframe", opp.get("timeframe", "1H")),
        })
    # hard cap regardless of what the LLM returned, so the per-coin loop stays in budget
    ranked_coins = ranked_coins[:max_coins]

    return {
        "ranked_coins": ranked_coins,
        "coin_index": 0,
        "coin_results": [],
        "current_coin": ranked_coins[0] if ranked_coins else None,
        "model_verdict": summary,
    }


# ─── Node: Market Analyst — overall market analysis ──────────────────────────

async def node_analyst(state: DeskState) -> dict:
    opps = state.get("ranked_opportunities") or []
    prices = state.get("prices") or {}
    news_agg = state.get("news_agg") or {}
    acfg = (state.get("agent_configs") or {}).get("analyst") or {}

    user = json.dumps({
        "opportunities": [{
            "symbol": o["symbol"],
            "price": prices.get(o["symbol"], o.get("price")),
            "signal_today": o.get("signal_today", False),
            "win_chance_pct": o.get("win_chance_pct"),
            "opportunity_score": o.get("opportunity_score"),
        } for o in (opps or [])[:5]],
        "prices": prices,
        "news_agg": {
            "overall": news_agg.get("overall", "neutral"),
            "asset_count": len(news_agg.get("assets", [])),
        },
    }, ensure_ascii=False, default=str)

    prompt = acfg.get("system_prompt") or _PROMPT_ANALYST
    text = await _llm_call(prompt, user, acfg.get("provider", "auto"), acfg.get("model", "auto"), acfg.get("temperature"))
    if text:
        data = _parse_json(text)
        bias = data.get("market_bias", "neutral")
        tf = data.get("focus_timeframe", "1H")
        msg = data.get("analyst_message", "")
        levels = data.get("key_levels")
    else:
        signal_count = len([o for o in opps if o.get("signal_today")])
        bias = "neutral"
        tf = "1H"
        msg = f"พบ {len(opps)} เหรียญใน watchlist · มีสัญญาณวันนี้ {signal_count} เหรียญ"
        levels = None

    return {
        "market_bias": bias,
        "focus_timeframe": tf,
        "analyst_message": msg,
        "analyst_levels": levels,
    }


# ─── Node: News & Sentiment (per coin) ──────────────────────────────────────

async def node_news(state: DeskState) -> dict:
    coins = state.get("ranked_coins") or []
    idx = state.get("coin_index", 0)
    if idx >= len(coins):
        return {"news_summary": ""}

    coin = coins[idx] if idx < len(coins) else {}
    sym = coin.get("symbol") or ""
    if not sym:
        log.warning("node_news_no_symbol", idx=idx, coin=coin)
        return {"news_summary": ""}

    news_agg = state.get("news_agg") or {}
    assets_raw = news_agg.get("assets", [])
    asset_syms = [a.get("symbol") if isinstance(a, dict) else str(a) for a in assets_raw if isinstance(a, dict)]
    related = [s for s in asset_syms if s and sym.startswith(s)]
    acfg = (state.get("agent_configs") or {}).get("news") or {}

    user = json.dumps({
        "coin": {"symbol": sym, "price": coin.get("price"), "reason": coin.get("reason", "")},
        "news_agg": {"assets": related, "overall": news_agg.get("overall", "neutral")},
    }, ensure_ascii=False, default=str)

    prompt = acfg.get("system_prompt") or _PROMPT_NEWS
    text = await _llm_call(prompt, user, acfg.get("provider", "auto"), acfg.get("model", "auto"), acfg.get("temperature"))
    if text:
        data = _parse_json(text)
        sentiment = data.get("sentiment", "neutral")
        summary = data.get("summary", f"{coin['symbol']} sentiment {sentiment}")
    else:
        sentiment = "neutral"
        summary = f"{coin['symbol']} — ยังไม่มีข่าวเด่น"

    return {
        "news_summary": f"{coin['symbol']}: {summary} (sentiment: {sentiment})",
        "current_coin": coin,
    }


# ─── Node: Trader — find best entry (per coin) ──────────────────────────────

async def node_trader(state: DeskState) -> dict:
    coins = state.get("ranked_coins") or []
    idx = state.get("coin_index", 0)
    if idx >= len(coins):
        return {"trader_message": ""}

    coin = coins[idx]
    prices = state.get("prices") or {}
    news = state.get("news_summary", "")
    acfg = (state.get("agent_configs") or {}).get("trader") or {}

    user = json.dumps({
        "coin": {
            "symbol": coin["symbol"],
            "price": prices.get(coin["symbol"]) or coin.get("price"),
            "reason": coin.get("reason", ""),
            "sentiment": news,
        },
        "prices": prices,
        "news": news,
    }, ensure_ascii=False, default=str)

    prompt = acfg.get("system_prompt") or _PROMPT_TRADER
    text = await _llm_call(prompt, user, acfg.get("provider", "auto"), acfg.get("model", "auto"), acfg.get("temperature"))
    if text:
        data = _parse_json(text)
        entry = data.get("entry_zone", "")
        action = data.get("action", "HOLD")
        reason = data.get("reason", "")
        target = data.get("target")
        stop = data.get("stop_loss")
        confidence = data.get("confidence", 0.5)
    else:
        px = _fmt_price(prices.get(coin["symbol"]) or coin.get("price"))
        entry = f"{px}"
        action = "HOLD"
        reason = "รอจังหวะที่เหมาะสม"
        target = None
        stop = None
        confidence = 0.3

    msg = f"{coin['symbol']}: {action}"
    if entry and action == "ENTER":
        msg += f" เข้าโซน {entry}"
    msg += f" — {reason}"
    if target:
        msg += f" · เป้า {target}"
    if stop:
        msg += f" · SL {stop}"

    return {
        "trader_message": msg,
        "trade_decisions": [{
            "symbol": coin["symbol"],
            "action": action,
            "entry_zone": entry,
            "reason": reason,
            "target": target,
            "stop_loss": stop,
            "confidence": confidence,
        }],
    }


# ─── Node: Risk Officer — per-trade risk assessment ─────────────────────────

async def node_risk(state: DeskState) -> dict:
    decisions = state.get("trade_decisions") or []
    stats = state.get("stats") or {}
    positions = state.get("positions") or []
    opps = state.get("ranked_opportunities") or []
    bias = state.get("market_bias", "neutral")
    coin_dec = decisions[-1] if decisions else {}
    acfg = (state.get("agent_configs") or {}).get("risk") or {}

    user = json.dumps({
        "stats": {
            "total_trades": stats.get("total_trades", 0),
            "win_rate": stats.get("win_rate"),
            "profit_factor": stats.get("profit_factor"),
            "total_pnl_thb": stats.get("total_pnl_thb"),
        },
        "positions": [{"symbol": p.get("symbol"), "unrealized_thb": p.get("unrealized_thb")} for p in positions],
        "opportunities": [{"symbol": o["symbol"], "signal_today": o.get("signal_today", False)} for o in (opps or [])[:5]],
        "market_bias": bias,
        "trader_action": coin_dec.get("action", "HOLD"),
    }, ensure_ascii=False, default=str)

    prompt = acfg.get("system_prompt") or _PROMPT_RISK
    text = await _llm_call(prompt, user, acfg.get("provider", "auto"), acfg.get("model", "auto"), acfg.get("temperature"))
    if text:
        data = _parse_json(text)
        risk_lvl = data.get("risk_level", "medium")
        can_trade = data.get("can_trade", True)
        verdict = data.get("risk_verdict", "")
    else:
        n_pos = len(positions)
        if n_pos == 0:
            risk_lvl = "low"
            verdict = "ไม่มี position เปิด — ความเสี่ยงต่ำ"
        elif n_pos > 3:
            risk_lvl = "high"
            un = sum((p.get("unrealized_thb") or 0.0) for p in positions)
            verdict = f"มี {n_pos} position · unrealized {un:+,.0f}฿ — ระวังกระจุกตัว"
        else:
            risk_lvl = "medium"
            un = sum((p.get("unrealized_thb") or 0.0) for p in positions)
            verdict = f"มี {n_pos} position · unrealized {un:+,.0f}฿ — อยู่ในเกณฑ์โอเค"
        can_trade = True

    return {
        "risk_level": risk_lvl,
        "can_trade": can_trade,
        "risk_verdict": verdict,
    }


# ─── Node: Execution Reviewer — backtest (per coin) ────────────────────────

async def node_exec(state: DeskState) -> dict:
    decisions = state.get("trade_decisions") or []
    stats = state.get("stats") or {}
    coin_dec = decisions[-1] if decisions else {}
    acfg = (state.get("agent_configs") or {}).get("exec") or {}

    user = json.dumps({
        "coin": coin_dec,
        "stats": {
            "total_trades": stats.get("total_trades", 0),
            "win_rate": stats.get("win_rate"),
            "profit_factor": stats.get("profit_factor"),
            "total_pnl_thb": stats.get("total_pnl_thb"),
        },
    }, ensure_ascii=False, default=str)

    prompt = acfg.get("system_prompt") or _PROMPT_EXEC
    text = await _llm_call(prompt, user, acfg.get("provider", "auto"), acfg.get("model", "auto"), acfg.get("temperature"))
    if text:
        data = _parse_json(text)
        verdict = data.get("verdict", "approve")
        summary = data.get("backtest_summary", "")
        win_est = data.get("win_rate_est", "N/A")
        warning = data.get("risk_warning")
        suggestion = data.get("suggestion")
    else:
        nt = stats.get("total_trades", 0)
        if nt == 0:
            summary = "ยังไม่มีดีลปิด — รอสะสมสถิติ"
        else:
            wr = stats.get("win_rate") or 0
            summary = f"สถิติรวม {nt} เทรด ชนะ {wr}%"
        verdict = "approve"
        win_est = f"{stats.get('win_rate', 0)*100:.0f}%" if nt else "N/A"
        warning = None
        suggestion = None

    msg = f"{coin_dec.get('symbol', '')}: {verdict} — {summary}"
    if warning:
        msg += f" ⚠️ {warning}"
    if suggestion:
        msg += f" 💡 {suggestion}"

    return {
        "review_verdict": msg,
        "exec_approved": verdict != "reject",
    }


# ─── Node: Coach — adjust strategy, save result, advance coin (per coin) ────

async def node_coach(state: DeskState) -> dict:
    coins = state.get("ranked_coins") or []
    idx = state.get("coin_index", 0)
    if idx >= len(coins):
        return {"coach_message": "", "coin_index": idx}

    coin = coins[idx]
    coin_dec = (state.get("trade_decisions") or [None])[-1] or {}
    exec_msg = state.get("review_verdict", "")
    stats = state.get("stats") or {}
    news = state.get("news_summary", "")
    acfg = (state.get("agent_configs") or {}).get("coach") or {}

    user = json.dumps({
        "coin": {
            "symbol": coin["symbol"],
            "price": coin.get("price"),
            "action": coin_dec.get("action", "HOLD"),
            "entry_zone": coin_dec.get("entry_zone", ""),
            "reason": coin.get("reason", ""),
        },
        "news": news,
        "execution": exec_msg,
        "stats": {
            "total_trades": stats.get("total_trades", 0),
            "win_rate": stats.get("win_rate"),
            "total_pnl_thb": stats.get("total_pnl_thb"),
        },
    }, ensure_ascii=False, default=str)

    prompt = acfg.get("system_prompt") or _PROMPT_COACH
    text = await _llm_call(prompt, user, acfg.get("provider", "auto"), acfg.get("model", "auto"), acfg.get("temperature"))
    if text:
        data = _parse_json(text)
        verdict = data.get("verdict", "caution")
        advice = data.get("advice", "")
        risk_lvl = data.get("risk_level", "medium")
        strategy = data.get("adjusted_strategy")
        tip = data.get("coach_tip")
    else:
        verdict = "caution"
        advice = f"{coin['symbol']} — รอจังหวะที่เหมาะสม"
        risk_lvl = "medium"
        strategy = None
        tip = None

    coach_msg = f"{coin['symbol']}: {verdict} — {advice}"
    if strategy:
        coach_msg += f" | กลยุทธ์: {strategy}"
    if tip:
        coach_msg += f" 💡 {tip}"

    # save this coin's result
    coin_result = {
        "symbol": coin["symbol"],
        "price": coin.get("price"),
        "news": news,
        "trader": coin_dec.get("action", "SKIP"),
        "exec": exec_msg,
        "coach": coach_msg,
        "verdict": verdict,
    }
    prev_results = state.get("coin_results") or []
    new_results = prev_results + [coin_result]

    next_idx = idx + 1
    next_coin = coins[next_idx] if next_idx < len(coins) else None

    return {
        "coach_message": coach_msg,
        "coin_results": new_results,
        "coin_index": next_idx,
        "current_coin": next_coin,
    }


# ─── Node: Summary — compile all results ─────────────────────────────────────

async def node_summary(state: DeskState) -> dict:
    results = state.get("coin_results") or []
    if not results:
        return {"characters": [], "coach_message": "ยังไม่มีผลการวิเคราะห์"}
    acfg = (state.get("agent_configs") or {}).get("summary") or {}

    user = json.dumps({
        "results": [{
            "symbol": r["symbol"],
            "news": r.get("news", ""),
            "trader": r.get("trader", ""),
            "exec": r.get("exec", ""),
            "coach": r.get("coach", ""),
            "verdict": r.get("verdict", "caution"),
        } for r in results],
    }, ensure_ascii=False, default=str)

    prompt = acfg.get("system_prompt") or _PROMPT_SUMMARY
    text = await _llm_call(prompt, user, acfg.get("provider", "auto"), acfg.get("model", "auto"), acfg.get("temperature"))
    if text:
        data = _parse_json(text)
        overall = data.get("overall", "")
        best = data.get("best_pick", "")
        recs = data.get("recommendations", [])
    else:
        overall = f"วิเคราะห์ {len(results)} เหรียญ"
        best = results[0]["symbol"] if results else ""
        recs = []

    # Build characters array for the trading desk UI
    characters = []
    for r in results:
        sym = r["symbol"]
        emoji_map = {"go": "✅", "caution": "⚠️", "avoid": "❌"}
        emoji = emoji_map.get(r.get("verdict", "caution"), "❓")
        characters.append({
            "key": f"coin_{sym}",
            "name": sym,
            "emoji": emoji,
            "role": "advisory",
            "message": f"{sym}: {r.get('trader', '')} | {r.get('coach', '')}",
        })

    # Add overall summary as coach character
    coach_msg = overall
    if best:
        coach_msg += f" | แนะนำ: {best}"
    if recs:
        coach_msg += " · " + " | ".join(recs[:3])

    characters.append({
        "key": "coach",
        "name": "Coach",
        "emoji": "🎯",
        "role": "advisory",
        "message": coach_msg,
    })
    characters.append({
        "key": "monitor",
        "name": "Model Monitor",
        "emoji": "📉",
        "role": "advisory",
        "message": state.get("model_verdict", ""),
    })

    return {
        "characters": characters,
        "coach_message": coach_msg,
    }
