"""Weekly coach — reads REAL closed-trade results and tunes the game within bounds.

Division of labour (same philosophy as the desk):
- deterministic rules DECIDE (pure `recommend()` — unit-testable, explainable,
  gated on minimum sample sizes so noise can't steer the system);
- the LLM only NARRATES the coaching message (best-effort, falls back to a
  deterministic summary);
- every applied change goes through tuning.set_param (hard-clamped) and is
  announced as a '_COACH' TradingAlert — which the Coach character speaks on
  /office and the alerts panel shows on /trading. Nothing changes silently.
"""
from __future__ import annotations

import asyncio
import json
import time

import structlog
from sqlalchemy import select
from langchain_core.messages import HumanMessage, SystemMessage

from app.core.config import settings
from app.core.redis import get_redis
from app.models.paper import PaperTrade
from app.models.trading_state import DeskSnapshot, TradingAlert
from app.trading import tuning
from app.trading.paper import calibration_stats

log = structlog.get_logger()

COACH_KIND = "_COACH"
LAST_RUN_KEY = "desk:coach:last_run"
LOCK_KEY = "desk:coach:lock"

# rule thresholds — how much evidence a rule needs before it may move a param
MIN_TRADES_STRATEGY = 10     # per-strategy calibration verdicts
MIN_TRADES_EXITS = 10        # exit-reason distribution verdicts
MIN_TRADES_REGIME = 8        # bearish-regime verdicts


async def gather_evidence(db, workspace_id) -> dict:
    """Everything the coach may reason about, as one plain dict (also the
    payload shown to the LLM narrator — numbers only, no live objects)."""
    res = await db.execute(
        select(PaperTrade).where(
            PaperTrade.workspace_id == workspace_id, PaperTrade.status == "CLOSED"
        )
    )
    rows = res.scalars().all()
    closed = [{
        "strategy": t.strategy, "pnl_thb": t.pnl_thb or 0.0,
        "pnl_pct": t.pnl_pct or 0.0, "exit_reason": t.exit_reason,
        "indicators": t.indicators or {},
    } for t in rows]

    exits: dict[str, int] = {}
    for t in closed:
        exits[t["exit_reason"] or "?"] = exits.get(t["exit_reason"] or "?", 0) + 1
    bearish = [t for t in closed if (t["indicators"].get("market_bias") == "bearish")]
    n = len(closed)
    wins = sum(1 for t in closed if t["pnl_thb"] > 0)
    return {
        "n_closed": n,
        "wins": wins,
        "win_rate": round(wins / n * 100, 1) if n else None,
        "total_pnl_thb": round(sum(t["pnl_thb"] for t in closed), 2),
        "exit_reasons": exits,
        "bearish": {
            "n": len(bearish),
            "wins": sum(1 for t in bearish if t["pnl_thb"] > 0),
        },
        "calibration": calibration_stats(closed),
        "params": await tuning.get_params(db),
    }


def recommend(ev: dict) -> list[dict]:
    """Deterministic tuning proposals from the evidence. Pure — unit-tested.

    Each rule needs a minimum sample size; with thin data this returns [] and
    the coach only reports. Steps are small on purpose: the coach nudges weekly,
    it does not re-derive the strategy.
    """
    recs: list[dict] = []
    p = ev["params"]
    n = ev["n_closed"]

    # 1) a strategy that over-promises (predicted win% >> realized) → demand a
    #    higher predicted bar before entering at all
    for s in ev["calibration"]["strategies"]:
        if s["trades"] >= MIN_TRADES_STRATEGY and s.get("gap_pct") is not None:
            if s["gap_pct"] <= -15:
                recs.append({
                    "param": "AUTO_PAPER_MIN_WIN_PCT",
                    "proposed": p["AUTO_PAPER_MIN_WIN_PCT"] + 5,
                    "reason": (f"{s['strategy']} ทำนาย {s['predicted_win_pct']}% "
                               f"แต่ชนะจริง {s['realized_win_pct']}% (n={s['trades']})"),
                })
            elif s["gap_pct"] >= 10:
                recs.append({
                    "param": "AUTO_PAPER_MIN_WIN_PCT",
                    "proposed": p["AUTO_PAPER_MIN_WIN_PCT"] - 5,
                    "reason": (f"{s['strategy']} ชนะจริง {s['realized_win_pct']}% "
                               f"สูงกว่าที่ทำนาย — เปิดรับดีลเพิ่มได้"),
                })
            break   # one win-bar adjustment per week is enough

    # 1b) fallback when no calibration verdict fired (e.g. legacy trades carry no
    #     prediction snapshot): steer the win bar from the REALIZED win rate alone
    if not any(r["param"] == "AUTO_PAPER_MIN_WIN_PCT" for r in recs) and n >= MIN_TRADES_STRATEGY:
        wr = (ev["wins"] / n) * 100
        if wr < 40:
            recs.append({
                "param": "AUTO_PAPER_MIN_WIN_PCT",
                "proposed": p["AUTO_PAPER_MIN_WIN_PCT"] + 5,
                "reason": f"ชนะจริงแค่ {wr:.0f}% จาก {n} ไม้ — คัดดีลเข้มขึ้น",
            })
        elif wr > 65:
            recs.append({
                "param": "AUTO_PAPER_MIN_WIN_PCT",
                "proposed": p["AUTO_PAPER_MIN_WIN_PCT"] - 5,
                "reason": f"ชนะจริง {wr:.0f}% จาก {n} ไม้ — เปิดรับดีลเพิ่มได้",
            })

    if n >= MIN_TRADES_EXITS:
        exits = ev["exit_reasons"]
        # 2) most trades die of old age → the hold budget is too long
        if exits.get("time", 0) / n >= 0.4:
            recs.append({
                "param": "AUTO_PAPER_MAX_HOLD_HOURS",
                "proposed": p["AUTO_PAPER_MAX_HOLD_HOURS"] - 24,
                "reason": f"{exits.get('time', 0)}/{n} ไม้จบด้วย time stop — setup ยืดเยื้อเกินไป",
            })
        # 3) too many catastrophe exits → entries are too loose; raise the ML bar
        if exits.get("max_loss", 0) / n >= 0.2:
            recs.append({
                "param": "ML_VOTE_MIN_PROB",
                "proposed": p["ML_VOTE_MIN_PROB"] + 0.02,
                "reason": f"{exits.get('max_loss', 0)}/{n} ไม้หลุดถึง catastrophe stop — คัดเข้มขึ้น",
            })

    # 4) longs keep losing in a bearish regime → demand more conviction there
    b = ev["bearish"]
    if b["n"] >= MIN_TRADES_REGIME and (b["wins"] / b["n"]) * 100 < 30:
        recs.append({
            "param": "AUTO_PAPER_BEARISH_ML_EXTRA",
            "proposed": p["AUTO_PAPER_BEARISH_ML_EXTRA"] + 0.05,
            "reason": (f"ตลาดหมีชนะแค่ {b['wins']}/{b['n']} ไม้ — "
                       f"long สวนเทรนด์ต้องเข้มกว่านี้"),
        })
    return recs


def _fallback_narrative(ev: dict, recs: list[dict]) -> str:
    n = ev["n_closed"]
    if n < settings.COACH_MIN_TRADES:
        return (f"🧢 โค้ชรายสัปดาห์: ปิดไปแล้ว {n} ไม้ (ต้องการ {settings.COACH_MIN_TRADES} "
                f"ก่อนเริ่มจูน) — เก็บข้อมูลต่อ วินัยเดิม")
    head = (f"🧢 โค้ชรายสัปดาห์: {n} ไม้ ชนะ {ev['win_rate']}% "
            f"PnL {ev['total_pnl_thb']:+,.0f}฿.")
    if not recs:
        return head + " ระบบสมดุลดี ไม่ปรับอะไรสัปดาห์นี้"
    return head + " ปรับ: " + "; ".join(f"{r['param']}→{r['proposed']}" for r in recs)


async def _llm_narrative(ev: dict, recs: list[dict]) -> str | None:
    """Best-effort in-character coach message (LLM narrates, never decides)."""
    try:
        from app.agents.llm import get_llm, _FallbackLLM
        llm = get_llm("auto", "auto")
        if isinstance(llm, _FallbackLLM):
            return None
        payload = {k: ev[k] for k in
                   ("n_closed", "win_rate", "total_pnl_thb", "exit_reasons", "bearish")}
        payload["changes"] = [
            {"param": r["param"], "to": r["proposed"], "why": r["reason"]} for r in recs
        ]
        resp = await asyncio.wait_for(
            llm.ainvoke([
                SystemMessage(content=(
                    "คุณคือโค้ชประจำโต๊ะเทรด (เกมจำลอง ไม่ใช่คำแนะนำการลงทุน) "
                    "เขียนคำให้กำลังใจ/ข้อคิดสั้น ๆ 1 ประโยคจากข้อมูล JSON "
                    "ห้ามพูดตัวเลขใด ๆ (ตัวเลขถูกรายงานไปแล้ว)")),
                HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
            ]),
            timeout=settings.LLM_TIMEOUT_SECONDS,
        )
        text = (getattr(resp, "content", None) or "").strip()
        return text[:120] if text else None
    except Exception:
        return None


async def run_coach(db, workspace_id, force: bool = False) -> dict:
    """One coaching pass: evidence → rules → apply (clamped) → announce."""
    r = None
    try:
        r = await get_redis()
        if not await r.set(LOCK_KEY, "1", nx=True, ex=120):
            return {"status": "skipped", "reason": "already running"}
        if not force:
            last = await r.get(LAST_RUN_KEY)
            if last and time.time() - float(last) < settings.COACH_INTERVAL_SECONDS:
                return {"status": "skipped", "reason": "ran recently"}
    except Exception:
        r = None

    try:
        ev = await gather_evidence(db, workspace_id)
        recs = recommend(ev) if ev["n_closed"] >= settings.COACH_MIN_TRADES else []
        # defence in depth: the coach may only turn risk knobs, never switches —
        # even if a future rule (or a bad merge) proposes one
        recs = [r for r in recs if r["param"] in tuning.COACH_ADJUSTABLE]
        applied = []
        for rec in recs:
            val = await tuning.set_param(db, rec["param"], rec["proposed"],
                                         rec["reason"], source="coach")
            applied.append({**rec, "applied": val})

        # facts come from the deterministic summary (always accurate); the LLM
        # may only append a short in-character remark — a weak local model can
        # then never misreport the numbers, only sound less charming
        text = _fallback_narrative(ev, recs)
        extra = await _llm_narrative(ev, recs)
        if extra:
            text = f"{text} · {extra}"
        db.add(TradingAlert(workspace_id=workspace_id, symbol=COACH_KIND,
                            text=text[:300]))
        try:
            from app.trading import notify
            await notify.send(text, tier=4, dedupe_key=f"coach:{int(time.time() // 86400)}")
        except Exception:
            pass
        await db.commit()
        if r is not None:
            try:
                await r.set(LAST_RUN_KEY, str(time.time()))
            except Exception:
                pass
        report = {"status": "ok", "n_closed": ev["n_closed"],
                  "applied": applied, "message": text}
        log.info("coach.ran", workspace=str(workspace_id),
                 n_closed=ev["n_closed"], applied=len(applied))
        return report
    finally:
        if r is not None:
            try:
                await r.delete(LOCK_KEY)
            except Exception:
                pass


async def coach_workspaces(db) -> list:
    """Workspaces the coach visits: any with a desk snapshot."""
    res = await db.execute(select(DeskSnapshot.workspace_id))
    return [row[0] for row in res.all()]
