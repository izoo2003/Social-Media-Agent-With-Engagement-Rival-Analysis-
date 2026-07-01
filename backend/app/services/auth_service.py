"""Dashboard login — JWT issue/verify and credential check."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

import jwt

from app.config import settings

DashboardRole = Literal["senior", "junior"]


def credentials_configured() -> bool:
    return bool(
        settings.DASHBOARD_USERNAME.strip()
        and settings.DASHBOARD_PASSWORD.strip()
    )


def junior_credentials_configured() -> bool:
    return bool(
        settings.JUNIOR_DASHBOARD_USERNAME.strip()
        and settings.JUNIOR_DASHBOARD_PASSWORD.strip()
    )


def any_credentials_configured() -> bool:
    return credentials_configured() or junior_credentials_configured()


def authenticate(username: str, password: str) -> Optional[tuple[str, DashboardRole]]:
    """Return (username, role) when credentials match senior or junior account."""
    user = username.strip()

    if credentials_configured():
        senior_user = settings.DASHBOARD_USERNAME.strip()
        if secrets.compare_digest(user, senior_user) and secrets.compare_digest(
            password, settings.DASHBOARD_PASSWORD
        ):
            return senior_user, "senior"

    if junior_credentials_configured():
        junior_user = settings.JUNIOR_DASHBOARD_USERNAME.strip()
        if secrets.compare_digest(user, junior_user) and secrets.compare_digest(
            password, settings.JUNIOR_DASHBOARD_PASSWORD
        ):
            return junior_user, "junior"

    return None


def verify_credentials(username: str, password: str) -> bool:
    """Backward-compatible senior-only credential check."""
    result = authenticate(username, password)
    return result is not None and result[1] == "senior"


def create_access_token(username: str, role: DashboardRole = "senior") -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict[str, Any]]:
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except jwt.PyJWTError:
        return None


def role_from_payload(payload: Optional[dict[str, Any]]) -> DashboardRole:
    if not payload:
        return "senior"
    role = payload.get("role")
    if role == "junior":
        return "junior"
    return "senior"
