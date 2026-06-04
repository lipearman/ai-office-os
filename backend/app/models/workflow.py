import uuid
from sqlalchemy import String, ForeignKey, JSON, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Workflow(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workflows"

    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    nodes: Mapped[list] = mapped_column(JSON, default=list)   # React Flow nodes
    edges: Mapped[list] = mapped_column(JSON, default=list)   # React Flow edges
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class WorkflowRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workflow_runs"

    workflow_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflows.id"), nullable=False)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running, success, error
    steps: Mapped[list] = mapped_column(JSON, default=list)   # per-node results log
    input: Mapped[dict] = mapped_column(JSON, default=dict)
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
