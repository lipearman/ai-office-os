"""Multi-Timeframe (Top-Down) engine + Daily Trading Intelligence brief.

Cascade: 1D bias → 4H setup → 1H trigger → 15M confirmation.
Rule: an upper timeframe that disagrees vetoes the lower ones.

This is the deterministic baseline used by the scanner and the daily brief.
Phase 2 turns the entry rules into config-driven plug-in strategies; the
top-down structure here stays the same.

Note: Bitkub spot has no shorting, so a bearish bias means "stay flat / avoid",
not "open short". Signals are BUY (enter long) / SELL (exit/avoid) / HOLD.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.trading.indicators import FeatureSet

ADX_TREND = 22.0     # ADX above this = trending (else chop)


@dataclass
class MTFSnapshot:
    symbol: str
    features: dict[str, FeatureSet]      # {"1D": fs, "4H": fs, ...}
    bias: str = "neutral"                # "long" | "short" | "neutral"
    setup_ready: bool = False
    trigger_fired: bool = False
    confirmed: bool = False
    alignment_score: float = 0.0         # 0..1
    signal: str = "HOLD"                 # BUY | SELL | HOLD
    strength: float = 0.0                # 0..1 (confidence of signal)
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    # trade plan (long)
    entry: float | None = None
    stop: float | None = None
    target: float | None = None
    rr: float | None = None

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "bias": self.bias,
            "setup_ready": self.setup_ready,
            "trigger_fired": self.trigger_fired,
            "confirmed": self.confirmed,
            "alignment_score": round(self.alignment_score, 3),
            "signal": self.signal,
            "strength": round(self.strength, 3),
            "reasons": self.reasons,
            "warnings": self.warnings,
            "entry": self.entry,
            "stop": self.stop,
            "target": self.target,
            "rr": self.rr,
            "features": {tf: f.to_dict() for tf, f in self.features.items()},
        }


def _bias_from_1d(f: FeatureSet, reasons: list[str], warnings: list[str]) -> str:
    up = f.close > f.ema200 and f.ema50 > f.ema200
    down = f.close < f.ema200 and f.ema50 < f.ema200
    trending = f.adx14 >= ADX_TREND
    if up and trending:
        reasons.append(f"1D ขาขึ้น (close>EMA200, ADX {f.adx14:.0f})")
        return "long"
    if down and trending:
        reasons.append(f"1D ขาลง (close<EMA200, ADX {f.adx14:.0f})")
        return "short"
    if not trending:
        warnings.append(f"1D ไม่มีเทรนด์ชัด (ADX {f.adx14:.0f}<{ADX_TREND:.0f})")
    return "neutral"


def build_snapshot(symbol: str, features: dict[str, FeatureSet]) -> MTFSnapshot:
    """Run the top-down cascade and produce a signal + trade plan."""
    snap = MTFSnapshot(symbol=symbol, features=features)
    reasons, warnings = snap.reasons, snap.warnings

    f1d = features.get("1D")
    f4h = features.get("4H")
    f1h = features.get("1H")
    f15 = features.get("15M")
    if not (f1d and f4h and f1h and f15):
        warnings.append("ข้อมูลไม่ครบทุก timeframe")
        return snap

    # ── 1D: bias ──
    snap.bias = _bias_from_1d(f1d, reasons, warnings)

    # focus on long (spot). bearish/neutral bias → no long entry.
    if snap.bias != "long":
        snap.signal = "SELL" if snap.bias == "short" else "HOLD"
        snap.strength = 0.0
        # still score partial alignment for transparency
        snap.alignment_score = 0.4 if snap.bias == "short" else 0.0
        return snap

    # ── 4H: setup zone (pullback toward EMA20/50 within an uptrend) ──
    near_ema = f4h.close <= f4h.ema20 * 1.01 or (40 <= f4h.rsi14 <= 58)
    snap.setup_ready = bool(f4h.close > f4h.ema200 and near_ema)
    if snap.setup_ready:
        reasons.append(f"4H อยู่โซนเข้า (ย่อแตะ EMA, RSI {f4h.rsi14:.0f})")
    else:
        warnings.append("4H ยังไม่เข้าโซน (ราคายังไม่ย่อ)")

    # ── 1H: trigger ──
    snap.trigger_fired = bool(
        f1h.close > f1h.ema20 and 45 <= f1h.rsi14 <= 68 and f1h.macd >= f1h.macd_signal
    )
    if snap.trigger_fired:
        reasons.append(f"1H trigger (close>EMA20, RSI {f1h.rsi14:.0f}, MACD ตัดขึ้น)")
    else:
        warnings.append("1H ยังไม่เกิด trigger")

    # ── 15M: confirmation ──
    snap.confirmed = bool(
        f15.macd >= f15.macd_signal and f15.volume_ratio >= 1.0 and f15.close > f15.ema20
    )
    if snap.confirmed:
        reasons.append(f"15M ยืนยัน (momentum+, vol x{f15.volume_ratio:.1f})")
    else:
        warnings.append("15M ยังไม่ยืนยัน")

    # ── alignment score (weighted) ──
    snap.alignment_score = (
        0.40                                   # bias long
        + 0.20 * snap.setup_ready
        + 0.20 * snap.trigger_fired
        + 0.20 * snap.confirmed
    )

    # ── final signal + trade plan ──
    if snap.setup_ready and snap.trigger_fired and snap.confirmed:
        snap.signal = "BUY"
        snap.strength = snap.alignment_score
        entry = f1h.close
        atr = f1h.atr14 or (entry * 0.01)
        stop = entry - 1.5 * atr
        risk = entry - stop
        target = entry + 2.0 * risk
        snap.entry = round(entry, 2)
        snap.stop = round(stop, 2)
        snap.target = round(target, 2)
        snap.rr = 2.0
    else:
        snap.signal = "HOLD"
        snap.strength = snap.alignment_score * 0.5

    return snap


def build_daily_brief(snap: MTFSnapshot) -> dict:
    """Human-readable daily plan derived from the MTF snapshot."""
    f1d = snap.features.get("1D")
    f4h = snap.features.get("4H")
    f1h = snap.features.get("1H")

    bias_txt = {"long": "ขาขึ้น → หา LONG", "short": "ขาลง → เลี่ยง/อยู่เฉย",
                "neutral": "ไม่ชัด → รอ"}.get(snap.bias, snap.bias)

    lines = [f"📋 Daily Brief — {snap.symbol}"]
    if f1d:
        lines.append(f"├ 1D Bias:   {bias_txt} (ADX {f1d.adx14:.0f})")
    if f4h:
        zone = "อยู่โซนเข้า" if snap.setup_ready else "ยังไม่ย่อเข้าโซน"
        lines.append(f"├ 4H Setup:  {zone} (RSI {f4h.rsi14:.0f})")
    if f1h:
        trig = "เกิด trigger" if snap.trigger_fired else "รอ trigger"
        lines.append(f"├ 1H:        {trig} (RSI {f1h.rsi14:.0f})")
    conf = "ยืนยันแล้ว" if snap.confirmed else "รอ 15M ยืนยัน"
    lines.append(f"├ 15M:       {conf}")
    if snap.signal == "BUY" and snap.entry:
        lines.append(
            f"└ แผน:       BUY ~{snap.entry:,.0f} | stop {snap.stop:,.0f} | "
            f"target {snap.target:,.0f} (R:R 1:{snap.rr:.0f})"
        )
    else:
        lines.append(f"└ แผน:       {snap.signal} — {'; '.join(snap.warnings) or 'รอจังหวะ'}")

    return {
        "symbol": snap.symbol,
        "signal": snap.signal,
        "strength": round(snap.strength, 3),
        "alignment_score": round(snap.alignment_score, 3),
        "bias": snap.bias,
        "text": "\n".join(lines),
        "reasons": snap.reasons,
        "warnings": snap.warnings,
        "plan": {
            "entry": snap.entry, "stop": snap.stop,
            "target": snap.target, "rr": snap.rr,
        },
    }
