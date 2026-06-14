import uuid
from sqlalchemy import String, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class WatchlistItem(Base, UUIDMixin, TimestampMixin):
    """A crypto symbol the user wants the system to monitor / scan."""
    __tablename__ = "watchlist_items"

    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)   # tradingview format e.g. "BTC_THB"
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    strategies: Mapped[list] = mapped_column(JSON, default=list)      # strategy names applied to this symbol
