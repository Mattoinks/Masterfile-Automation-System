from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    ENGINEER = "engineer"
    VIEWER = "viewer"


ROLE_PERMISSIONS: dict[UserRole, set[str]] = {
    UserRole.ADMIN: {
        "view", "search", "download", "upload", "process", "edit", "insert",
        "replace", "delete", "restore", "configure", "force_insert", "revision",
        "manage_users", "view_logs",
    },
    UserRole.ENGINEER: {
        "view", "search", "download", "upload", "process", "edit", "insert",
        "replace", "revision", "view_logs",
    },
    UserRole.VIEWER: {
        "view", "search", "download", "view_logs",
    },
}

# Route → required permission
ROUTE_PERMISSIONS: dict[str, str] = {
    "/upload": "upload",
    "/preview": "process",
    "/recycle-bin": "delete",
    "/settings": "configure",
    "/users": "manage_users",
}


def has_permission(role: str, permission: str) -> bool:
    try:
        user_role = UserRole(role.lower())
    except ValueError:
        user_role = UserRole.VIEWER
    return permission in ROLE_PERMISSIONS.get(user_role, set())


def require_permission(role: str, permission: str) -> None:
    if not has_permission(role, permission):
        raise PermissionError(f"Role '{role}' cannot perform '{permission}'")
