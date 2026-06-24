from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException

from app.api.deps import get_current_user, require_perm
from app.models.auth_schemas import CreateUserRequest, LoginRequest, UpdateUserRequest
from app.services.audit_logger import AuditLogger
from app.services.auth_service import AuthError, get_auth_service

router = APIRouter(prefix="/api/auth")
audit = AuditLogger()


def _token_from_header(
    authorization: str | None = Header(default=None),
    x_session_token: str | None = Header(default=None),
) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return x_session_token


@router.post("/login")
def login(request: LoginRequest):
    try:
        result = get_auth_service().login(
            request.username, request.password, request.remember_me
        )
        audit.log(
            request.username, "N/A", "Login", "Success",
            user=request.username, details=f"Role: {result['user']['role']}",
        )
        return result
    except AuthError as exc:
        audit.log(request.username, "N/A", "Login", "Failed", user=request.username)
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.post("/logout")
def logout(token: Annotated[str | None, Depends(_token_from_header)]):
    user = get_auth_service().validate_token(token) if token else None
    get_auth_service().logout(token or "")
    if user:
        audit.log(user["username"], "N/A", "Logout", "Success", user=user["username"])
    return {"message": "Logged out"}


@router.get("/me")
def get_me(user: Annotated[dict, Depends(get_current_user)]):
    permissions = get_auth_service().get_permissions(user["role"])
    return {"user": user, "permissions": permissions}


@router.post("/refresh")
def refresh_session(token: Annotated[str | None, Depends(_token_from_header)]):
    if not token:
        raise HTTPException(status_code=401, detail="No session")
    new_token = get_auth_service().refresh_session(token)
    if not new_token:
        user = get_auth_service().validate_token(token)
        if not user:
            raise HTTPException(status_code=401, detail="Session expired")
        return {"token": token, "refreshed": False}
    return {"token": new_token, "refreshed": True}


@router.get("/users")
def list_users(_: Annotated[dict, Depends(require_perm("manage_users"))]):
    return {"users": get_auth_service().list_users()}


@router.post("/users")
def create_user(
    request: CreateUserRequest,
    admin: Annotated[dict, Depends(require_perm("manage_users"))],
):
    try:
        user = get_auth_service().create_user(
            request.username, request.password, request.display_name, request.role
        )
        audit.log(
            request.username, "N/A", "User Created", "Success",
            user=admin["username"], details=f"Role: {request.role}",
        )
        return user
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    request: UpdateUserRequest,
    admin: Annotated[dict, Depends(require_perm("manage_users"))],
):
    try:
        user = get_auth_service().update_user(
            user_id,
            display_name=request.display_name,
            role=request.role,
            active=request.active,
            password=request.password,
        )
        audit.log(
            str(user_id), "N/A", "User Updated", "Success",
            user=admin["username"],
        )
        return user
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
