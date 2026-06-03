import uuid
from pydantic import BaseModel
from datetime import datetime


class AgentOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    room_id: uuid.UUID | None
    name: str
    agent_type: str
    description: str | None
    model_provider: str
    model_name: str
    avatar_url: str | None
    status: str
    is_active: bool
    tools: list
    position_x: float
    position_y: float
    position_z: float
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentCreate(BaseModel):
    name: str
    agent_type: str
    description: str | None = None
    system_prompt: str
    model_provider: str = "openai"
    model_name: str = "gpt-4o-mini"
    room_id: uuid.UUID | None = None
    tools: list = []
    config: dict = {}


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    model_provider: str | None = None
    model_name: str | None = None
    room_id: uuid.UUID | None = None
    position_x: float | None = None
    position_y: float | None = None
    position_z: float | None = None
    is_active: bool | None = None
