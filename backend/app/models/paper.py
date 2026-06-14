import uuid
from sqlalchemy import String, Float, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class PaperTrade(Base, UUIDMixin, TimestampMixin):
    """A simulated (paper) trade. status OPEN = a live position, CLOSED = journaled.

    Float (not Decimal) is fine for simulation; Decimal is reserved for live (Phase 6).
    """
    __tablename__ = "paper_trades"

    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    strategy: Mapped[str] = mapped_column(String(40), default="manual")
    timeframe: Mapped[str] = mapped_column(String(8), default="1H")
    side: Mapped[str] = mapped_column(String(8), default="BUY")    # spot long only

    # entry
    entry_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    size_thb: Mapped[float] = mapped_column(Float, nullable=False)  # notional at entry
    qty: Mapped[float] = mapped_column(Float, nullable=False)       # base units
    stop: Mapped[float | None] = mapped_column(Float, nullable=True)
    target: Mapped[float | None] = mapped_column(Float, nullable=True)
    fee_pct: Mapped[float] = mapped_column(Float, default=0.0025)

    status: Mapped[str] = mapped_column(String(8), default="OPEN")  # OPEN | CLOSED

    # exit
    exit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    exit_reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pnl_thb: Mapped[float | None] = mapped_column(Float, nullable=True)
    pnl_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    result: Mapped[str | None] = mapped_column(String(10), nullable=True)  # WIN|LOSS|BREAKEVEN

    # reasoning snapshot (why we entered)
    rationale: Mapped[str | None] = mapped_column(String(500), nullable=True)
    indicators: Mapped[dict] = mapped_column(JSON, default=dict)
