import uuid
from sqlalchemy import String, Boolean, ForeignKey, JSON, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Office(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "offices"

    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    theme: Mapped[str] = mapped_column(String(50), default="default")
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    workspace: Mapped["Workspace"] = relationship(back_populates="offices")
    rooms: Mapped[list["Room"]] = relationship(back_populates="office")


class Room(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "rooms"

    office_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("offices.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    room_type: Mapped[str] = mapped_column(String(50), nullable=False)  # ceo, ba, dev, dba, qa, rag, meeting
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)
    position_z: Mapped[float] = mapped_column(Float, default=0.0)
    width: Mapped[float] = mapped_column(Float, default=10.0)
    depth: Mapped[float] = mapped_column(Float, default=10.0)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    office: Mapped["Office"] = relationship(back_populates="rooms")
    agents: Mapped[list["Agent"]] = relationship(back_populates="room")


class OfficeObject(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "office_objects"

    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rooms.id"), nullable=False)
    object_type: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)
    position_z: Mapped[float] = mapped_column(Float, default=0.0)
    rotation_y: Mapped[float] = mapped_column(Float, default=0.0)
    config: Mapped[dict] = mapped_column(JSON, default=dict)


class OfficeTemplate(Base, UUIDMixin, TimestampMixin):
    """A static-image office layout: one background image plus agent markers.

    markers is a JSON list of:
        {"id": str, "agent_id": str, "x": float, "y": float, "scale": float}
    where x/y are percentages (0-100) of the image, so the layout is responsive.
    """
    __tablename__ = "office_templates"

    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    markers: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)

    workspace: Mapped["Workspace"] = relationship()
