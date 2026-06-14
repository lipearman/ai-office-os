import uuid
from pydantic import BaseModel
from datetime import datetime


class WatchlistItemOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    symbol: str
    enabled: bool
    strategies: list
    created_at: datetime

    model_config = {"from_attributes": True}


class WatchlistItemCreate(BaseModel):
    symbol: str
    enabled: bool = True
    strategies: list = []


class WatchlistItemUpdate(BaseModel):
    enabled: bool | None = None
    strategies: list | None = None


class PaperOpen(BaseModel):
    symbol: str
    size_thb: float = 10000.0
    timeframe: str = "1H"
    strategy: str = "manual"
    stop: float | None = None
    target: float | None = None
    rationale: str | None = None
    indicators: dict = {}
