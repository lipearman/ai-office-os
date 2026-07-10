"""Runtime-tunable trading parameters (DB-backed, hard-clamped).

The weekly coach adjusts these from REAL closed-trade results — no code change,
no rebuild. Safety model:

- only the params whitelisted in TUNABLE can be overridden, and every write is
  clamped to its (min, max) bounds — the coach can nudge, never runaway.
- config (settings) stays the default; a DB row overrides it until removed.
- reads are cached in-process for a short TTL because auto_close runs every 20s.
"""
from __future__ import annotations

import time

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.trading_state import DeskTuning

log = structlog.get_logger()

# param -> (min, max). Bounds are deliberately narrow: the tuners (coach, night
# shift, human via API) turn knobs within a sane envelope; a human edits
# config/env to move the envelope itself.
TUNABLE: dict[str, tuple[float, float]] = {
    # wide floor: the demo env runs this at 30, and the envelope must contain
    # the current operating point or the coach's first nudge would jump the value
    "AUTO_PAPER_MIN_WIN_PCT":      (25.0, 80.0),
    "ML_VOTE_MIN_PROB":            (0.45, 0.65),
    "AUTO_PAPER_BEARISH_ML_EXTRA": (0.0, 0.15),
    "AUTO_PAPER_BEARISH_WIN_EXTRA": (0.0, 30.0),
    "AUTO_PAPER_MAX_HOLD_HOURS":   (24.0, 168.0),
    "AUTO_PAPER_BREAKEVEN_AT_R":   (0.5, 2.0),
    "AUTO_PAPER_MAX_POSITIONS":    (1.0, 10.0),
    "AUTO_PAPER_SIZE_THB":         (100.0, 10000.0),
    "AUTO_PAPER_MAX_LOSS_PCT":     (3.0, 15.0),
    "DESK_SCAN_TOP_N":             (5.0, 50.0),
    "AUTO_WATCHLIST_TOP_N":        (1.0, 10.0),
    # behaviour switches stored as 0/1 — a runtime kill switch, no rebuild
    "AUTO_PAPER_ENABLED":          (0.0, 1.0),
    "AUTO_PAPER_REQUIRE_SIGNAL":   (0.0, 1.0),
}

# enum-typed params: value must be one of the listed choices (first = the
# conservative fallback used when a stored value goes stale/invalid)
TUNABLE_ENUM: dict[str, tuple[str, ...]] = {
    # the scan/signal timeframe — the game's heartbeat. Changing it re-frames
    # every downstream layer (ML training window, signal cadence, time stop),
    # so only the human / night shift may change it, with backtest evidence.
    "DESK_SCAN_TIMEFRAME": ("1H", "15M", "4H", "1D"),
}


def validate_enum(key: str, value: str) -> str:
    """Return the stored choice for an enum param (fallback: first option)."""
    opts = TUNABLE_ENUM[key]
    v = str(value).strip().upper()
    return v if v in opts else opts[0]


# the WEEKLY COACH may only turn risk knobs — never the on/off switches
# (those belong to the human and, in emergencies, the night-shift analyst)
COACH_ADJUSTABLE = {
    "AUTO_PAPER_MIN_WIN_PCT", "ML_VOTE_MIN_PROB", "AUTO_PAPER_BEARISH_ML_EXTRA",
    "AUTO_PAPER_BEARISH_WIN_EXTRA", "AUTO_PAPER_MAX_HOLD_HOURS",
    "AUTO_PAPER_BREAKEVEN_AT_R", "AUTO_PAPER_MAX_LOSS_PCT",
}

_cache: dict = {}
_cache_at: float = 0.0
_CACHE_TTL = 30.0


def clamp(key: str, value: float) -> float:
    lo, hi = TUNABLE[key]
    return max(lo, min(hi, float(value)))


def _defaults() -> dict:
    out: dict = {k: float(getattr(settings, k)) for k in TUNABLE}
    out.update({k: validate_enum(k, getattr(settings, k)) for k in TUNABLE_ENUM})
    return out


async def get_params(db: AsyncSession) -> dict:
    """Effective params (floats + enum strings): config defaults overridden by
    validated DB rows."""
    global _cache, _cache_at
    now = time.monotonic()
    if _cache and now - _cache_at < _CACHE_TTL:
        return dict(_cache)
    out = _defaults()
    try:
        res = await db.execute(select(DeskTuning))
        for row in res.scalars().all():
            if row.key in TUNABLE and row.value is not None:
                out[row.key] = clamp(row.key, row.value)
            elif row.key in TUNABLE_ENUM and row.text_value:
                out[row.key] = validate_enum(row.key, row.text_value)
    except Exception as e:                      # table missing mid-migration etc.
        log.warning("tuning.read_failed", error=str(e))
    _cache, _cache_at = dict(out), now
    return out


async def set_param(db: AsyncSession, key: str, value, reason: str,
                    source: str = "coach"):
    """Upsert one override (clamped floats / validated enums). Returns what
    was actually stored."""
    if key in TUNABLE:
        stored: float | str = clamp(key, value)
    elif key in TUNABLE_ENUM:
        v = validate_enum(key, value)
        if v != str(value).strip().upper():
            raise ValueError(f"{key} ต้องเป็นหนึ่งใน {', '.join(TUNABLE_ENUM[key])}")
        stored = v
    else:
        raise ValueError(f"{key} is not tunable")
    res = await db.execute(select(DeskTuning).where(DeskTuning.key == key))
    row = res.scalar_one_or_none()
    if row is None:
        row = DeskTuning(key=key, value=0.0)
        db.add(row)
    if key in TUNABLE_ENUM:
        row.text_value = str(stored)
        row.value = 0.0
    else:
        row.value = float(stored)
        row.text_value = None
    row.reason = reason[:200]
    row.source = source
    invalidate_cache()
    log.info("tuning.set", key=key, value=stored, reason=reason, source=source)
    return stored


def invalidate_cache() -> None:
    global _cache_at
    _cache_at = 0.0
