import uuid
from sqlalchemy import String, Float, Boolean, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class DeskSnapshot(Base, UUIDMixin, TimestampMixin):
    """Latest trading-desk state for a workspace, produced by the worker.

    One row per workspace (upserted each tick). The /office desk endpoint reads
    this instead of computing on-demand — the web is a pure view of the worker.
    """
    __tablename__ = "desk_snapshots"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, unique=True, index=True
    )
    # output of build_desk(...) — the 7 characters + their messages
    characters: Mapped[list] = mapped_column(JSON, default=list)
    # symbols currently in setup — persisted so alert transitions survive restart
    prev_signals: Mapped[list] = mapped_column(JSON, default=list)
    # auxiliary data (last prices, opp count, etc.) for the fast price-only tick
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # last time the cheap price-only refresh ran
    priced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DeskLLMConfig(Base, UUIDMixin, TimestampMixin):
    """Per-workspace, per-role LLM provider/model for the trading desk.

    `roles` = {role_key: {"provider": "...", "model": "..."}}. Roles not listed
    (or set to "auto") use the global default provider. Lets each of the 7 desk
    characters speak via a different LLM.
    """
    __tablename__ = "desk_llm_configs"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, unique=True, index=True
    )
    roles: Mapped[dict] = mapped_column(JSON, default=dict)


class AlertWebhook(Base, UUIDMixin, TimestampMixin):
    """Per-workspace outbound webhook for trading alerts (opt-in).

    The user sets their own URL; the worker POSTs new-setup alerts to it. Empty/
    disabled = no outbound calls.
    """
    __tablename__ = "alert_webhooks"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, unique=True, index=True
    )
    url: Mapped[str] = mapped_column(String(500), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ScanExclusion(Base, UUIDMixin, TimestampMixin):
    """A symbol the market scan must never surface (exchange-wide, not per workspace).

    Rows come from the daily market watcher (a market that vanished from Bitkub's
    official symbols list = delisted) or are added by hand. DB-backed so a new
    delisting needs no code change / container rebuild — unlike the static
    DESK_SCAN_EXCLUDE_SYMBOLS config list, which stays as a bootstrap.
    """
    __tablename__ = "scan_exclusions"

    symbol: Mapped[str] = mapped_column(String(30), nullable=False, unique=True, index=True)
    reason: Mapped[str] = mapped_column(String(200), default="")
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | symbols_diff


class DeskTuning(Base, UUIDMixin, TimestampMixin):
    """One runtime override of a tunable trading parameter (see trading/tuning.py).

    Written by the weekly coach (from real closed-trade results) or by hand via
    the API. Values are clamped to the TUNABLE bounds on every read AND write,
    so a bad row can never push the system outside its safety envelope.
    """
    __tablename__ = "desk_tunings"

    key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    # enum-typed params (e.g. DESK_SCAN_TIMEFRAME) store their choice here and
    # keep `value` at 0.0 — numeric params leave this NULL
    text_value: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reason: Mapped[str] = mapped_column(String(200), default="")
    source: Mapped[str] = mapped_column(String(20), default="coach")  # coach | manual


class TradingAlert(Base, UUIDMixin, TimestampMixin):
    """A 'new setup' alert detected by the worker (durable, replaces in-memory)."""
    __tablename__ = "trading_alerts"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    strategy: Mapped[str | None] = mapped_column(String(40), nullable=True)
    timeframe: Mapped[str | None] = mapped_column(String(8), nullable=True)
    win_chance_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    text: Mapped[str] = mapped_column(String(300), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
