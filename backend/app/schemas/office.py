import uuid
from pydantic import BaseModel
from datetime import datetime


class RoomOut(BaseModel):
    id: uuid.UUID
    name: str
    room_type: str
    description: str | None
    position_x: float
    position_y: float
    position_z: float
    width: float
    depth: float
    config: dict
    is_active: bool

    model_config = {"from_attributes": True}


class OfficeOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str | None
    theme: str
    config: dict
    is_active: bool
    created_at: datetime
    rooms: list[RoomOut] = []

    model_config = {"from_attributes": True}


class OfficeCreate(BaseModel):
    name: str
    description: str | None = None
    theme: str = "default"


class RoomCreate(BaseModel):
    name: str
    room_type: str
    description: str | None = None
    position_x: float = 0.0
    position_y: float = 0.0
    position_z: float = 0.0
    width: float = 10.0
    depth: float = 10.0
    config: dict = {}


class RoomUpdate(BaseModel):
    position_x: float | None = None
    position_y: float | None = None
    position_z: float | None = None
    config: dict | None = None


# --- Static office templates ---

class Marker(BaseModel):
    id: str
    agent_id: str
    x: float           # 0-100 (% of image width)
    y: float           # 0-100 (% of image height)
    scale: float = 1.0


class OfficeTemplateOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    image_url: str | None
    markers: list[Marker] = []
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class OfficeTemplateCreate(BaseModel):
    name: str
    image_url: str | None = None
    markers: list[Marker] = []
    is_active: bool = False


class OfficeTemplateUpdate(BaseModel):
    name: str | None = None
    image_url: str | None = None
    markers: list[Marker] | None = None
    is_active: bool | None = None
