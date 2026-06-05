import uuid
from sqlalchemy import String, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class AuditLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "audit_logs"

    workspace_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workspaces.id"), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor: Mapped[str | None] = mapped_column(String(160), nullable=True)   # display name/email
    action: Mapped[str] = mapped_column(String(80), nullable=False)         # e.g. workspace.create
    target_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ok")           # ok, denied, error
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
