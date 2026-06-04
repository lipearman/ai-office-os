import uuid
from sqlalchemy import String, ForeignKey, JSON, Enum as SAEnum, Text, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin
import enum


class ToolStatus(str, enum.Enum):
    SUCCESS = "SUCCESS"
    ERROR = "ERROR"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    DENIED = "DENIED"


class ToolLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tool_logs"

    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[ToolStatus] = mapped_column(SAEnum(ToolStatus), default=ToolStatus.SUCCESS)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
