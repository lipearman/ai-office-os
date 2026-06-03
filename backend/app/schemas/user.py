import uuid
from datetime import datetime
from typing import Annotated
from pydantic import BaseModel, AfterValidator
import email_validator as ev


def _validate_email(v: str) -> str:
    try:
        info = ev.validate_email(v, check_deliverability=False)
        return info.normalized
    except ev.EmailNotValidError as e:
        raise ValueError(str(e))


Email = Annotated[str, AfterValidator(_validate_email)]


class UserCreate(BaseModel):
    email: Email
    username: str
    full_name: str
    password: str


class UserLogin(BaseModel):
    email: Email
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    full_name: str
    role: str
    is_active: bool
    avatar_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshTokenIn(BaseModel):
    refresh_token: str
