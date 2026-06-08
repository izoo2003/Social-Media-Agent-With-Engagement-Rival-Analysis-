"""
YouTube OAuth 2.0 routes — obtain a refresh token with upload permissions.

Visit http://localhost:8000/api/v1/auth/youtube while the backend is running.
"""

from urllib.parse import urlencode

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import settings
from app.utils.logger import logger

router = APIRouter()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

REQUIRED_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"


def _oauth_scopes() -> list[str]:
    return [s.strip() for s in settings.YOUTUBE_OAUTH_SCOPES.split(",") if s.strip()]


@router.get("/auth/youtube")
async def youtube_auth_start():
    """
    Start YouTube OAuth — redirects to Google consent screen.
    After approval, copy the refresh token from the callback page into .env.
    """
    if not settings.YOUTUBE_CLIENT_ID or not settings.YOUTUBE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400,
            detail="Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first.",
        )

    params = {
        "client_id": settings.YOUTUBE_CLIENT_ID,
        "redirect_uri": settings.YOUTUBE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(_oauth_scopes()),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@router.get("/auth/youtube/callback", response_class=HTMLResponse)
async def youtube_auth_callback(code: str = Query(default="")):
    """Exchange OAuth code for refresh token and display it for .env."""
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code.")

    try:
        response = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.YOUTUBE_CLIENT_ID,
                "client_secret": settings.YOUTUBE_CLIENT_SECRET,
                "redirect_uri": settings.YOUTUBE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.error(f"YouTube OAuth token exchange failed: {exc}")
        raise HTTPException(status_code=502, detail="Failed to contact Google OAuth.") from exc

    if not response.ok:
        logger.error(f"YouTube OAuth token exchange error: {response.text[:500]}")
        raise HTTPException(
            status_code=400,
            detail=f"Google OAuth error: {response.text[:300]}",
        )

    data = response.json()
    refresh_token = data.get("refresh_token", "")
    granted_scopes = data.get("scope", "")

    if not refresh_token:
        return HTMLResponse(
            status_code=400,
            content="""
            <html><body style="font-family:sans-serif;padding:2rem;max-width:640px">
              <h2>No refresh token returned</h2>
              <p>Google did not return a refresh token. This usually means the app was
              already authorized without forcing consent.</p>
              <ol>
                <li>Revoke access at
                  <a href="https://myaccount.google.com/permissions">Google Account permissions</a>
                </li>
                <li>Visit <a href="/api/v1/auth/youtube">/api/v1/auth/youtube</a> again</li>
              </ol>
            </body></html>
            """,
        )

    upload_ok = REQUIRED_UPLOAD_SCOPE in granted_scopes.split()
    scope_status = (
        "Upload scope granted — you can post videos."
        if upload_ok
        else "WARNING: youtube.upload scope missing. Re-authorize after revoking app access."
    )

    return HTMLResponse(
        content=f"""
        <html><body style="font-family:sans-serif;padding:2rem;max-width:720px">
          <h2>YouTube authorization successful</h2>
          <p><strong>{scope_status}</strong></p>
          <p>Granted scopes:</p>
          <pre style="background:#f4f4f4;padding:1rem;overflow:auto">{granted_scopes}</pre>
          <p>Add this to <code>backend/.env</code>, restart the backend, then try posting again:</p>
          <pre style="background:#f4f4f4;padding:1rem;overflow:auto;word-break:break-all">YOUTUBE_REFRESH_TOKEN="{refresh_token}"</pre>
          <p style="color:#666;font-size:0.9rem">
            Keep this token secret. Do not commit it to git.
          </p>
        </body></html>
        """
    )
