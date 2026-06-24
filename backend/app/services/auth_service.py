"""Dashboard login — JWT issue/verify and credential check."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt

from app.config import settings


def credentials_configured() -> bool:
    return bool(
        settings.DASHBOARD_USERNAME.strip()
        and settings.DASHBOARD_PASSWORD.strip()
    )


def verify_credentials(username: str, password: str) -> bool:
    if not credentials_configured():
        return False
    user_ok = secrets.compare_digest(username.strip(), settings.DASHBOARD_USERNAME)
    pass_ok = secrets.compare_digest(password, settings.DASHBOARD_PASSWORD)
    return user_ok and pass_ok


def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": username,
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
