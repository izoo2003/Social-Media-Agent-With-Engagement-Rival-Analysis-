"""Dashboard login — username/password JWT auth."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.dependencies import get_current_user
from app.middleware.rate_limiter import limiter
from app.services import auth_service

router = APIRouter()


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class MeResponse(BaseModel):
    username: str


@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    """Validate dashboard credentials and return a JWT access token."""
    if not auth_service.credentials_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Dashboard login is not configured. "
                "Set DASHBOARD_USERNAME and DASHBOARD_PASSWORD on the server."
            ),
        )

    if not auth_service.verify_credentials(body.username, body.password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = auth_service.create_access_token(body.username.strip())
    return LoginResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/auth/me", response_model=MeResponse)
async def me(username: str = Depends(get_current_user)):
    """Return the authenticated dashboard user (requires Bearer token)."""
    return MeResponse(username=username)
