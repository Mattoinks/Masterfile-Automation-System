from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.services.auth_service import get_auth_service
from app.services.permissions import has_permission


def _extract_token(
    authorization: str | None = Header(default=None),
    x_session_token: str | None = Header(default=None),
) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return x_session_token


async def get_current_user(
    token: Annotated[str | None, Depends(_extract_token)],
) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = get_auth_service().validate_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return user


async def get_optional_user(
    token: Annotated[str | None, Depends(_extract_token)],
) -> dict | None:
    if not token:
        return None
    return get_auth_service().validate_token(token)


def require_perm(permission: str):
    async def _checker(user: Annotated[dict, Depends(get_current_user)]) -> dict:
        if not has_permission(user["role"], permission):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {permission}",
            )
        return user

    return _checker
