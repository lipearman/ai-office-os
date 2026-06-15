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
