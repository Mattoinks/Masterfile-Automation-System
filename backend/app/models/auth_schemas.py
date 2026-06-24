from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False


class LoginResponse(BaseModel):
    token: str
    expires_at: str
    user: dict


class UserPublic(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    active: bool
    created_at: Optional[str] = None
    last_login: Optional[str] = None


class CreateUserRequest(BaseModel):
    username: str
    password: str
    display_name: str
    role: str


class UpdateUserRequest(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None
