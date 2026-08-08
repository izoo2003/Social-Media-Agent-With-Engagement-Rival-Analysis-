"""
TikTok OAuth 2.0 routes — Login Kit + Content Posting API.

Live: https://kafi-social-media-agent-production.up.railway.app/api/v1/auth/tiktok

Create an app at https://developers.tiktok.com, enable Login Kit and Content
Posting API, register the redirect URI below, then authorize with the
marketing TikTok account (email login in TikTok's browser consent screen).
"""

import secrets
from urllib.parse import unquote, urlencode

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import public_api_url, settings
from app.services.social_publisher import TikTokClient
from app.services.token_store import save_credentials
from app.utils.logger import logger

router = APIRouter()

TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"

REQUIRED_POSTING_SCOPES = ("video.upload", "video.publish")
REQUIRED_ANALYTICS_SCOPES = ("user.info.basic", "user.info.stats", "video.list")


def _clean_oauth_value(value: str) -> str:
    clean = (value or "").strip()
    if len(clean) >= 2 and clean[0] == clean[-1] and clean[0] in ("'", '"'):
        clean = clean[1:-1].strip()
    return clean


def _tiktok_oauth_config() -> tuple[str, str, str]:
    return (
        _clean_oauth_value(settings.TIKTOK_CLIENT_KEY),
        _clean_oauth_value(settings.TIKTOK_CLIENT_SECRET),
        _clean_oauth_value(settings.TIKTOK_REDIRECT_URI),
    )


def _oauth_scopes() -> str:
    scopes = [s.strip() for s in settings.TIKTOK_OAUTH_SCOPES.split(",") if s.strip()]
    return ",".join(scopes)


def _build_tiktok_auth_url() -> str:
    client_key, _, redirect_uri = _tiktok_oauth_config()
    params = {
        "client_key": client_key,
        "response_type": "code",
        "scope": _oauth_scopes(),
        "redirect_uri": redirect_uri,
        "state": secrets.token_urlsafe(16),
    }
    return f"{TIKTOK_AUTH_URL}?{urlencode(params)}"


def _scope_status(granted: str) -> str:
    granted_set = {s.strip() for s in granted.split(",") if s.strip()}
    parts = []
    if all(scope in granted_set for scope in REQUIRED_POSTING_SCOPES):
        parts.append("Posting scopes granted — you can publish videos.")
    else:
        missing = [s for s in REQUIRED_POSTING_SCOPES if s not in granted_set]
        parts.append(
            f"WARNING: missing posting scopes ({', '.join(missing)}). "
            "Enable Content Posting API on the TikTok app and re-authorize."
        )
    if all(scope in granted_set for scope in REQUIRED_ANALYTICS_SCOPES):
        parts.append("Analytics scopes granted — dashboard TikTok stats will work.")
    else:
        missing = [s for s in REQUIRED_ANALYTICS_SCOPES if s not in granted_set]
        parts.append(
            f"WARNING: missing analytics scopes ({', '.join(missing)}). "
            "Enable Login Kit / Display API scopes and re-authorize."
        )
    return " ".join(parts)


@router.get("/auth/tiktok/status")
async def tiktok_auth_status():
    """Show whether this backend can post to / read analytics for TikTok."""
    client_key, client_secret, redirect_uri = _tiktok_oauth_config()
    client = TikTokClient(draft_mode=False)

    if not client_key or not client_secret:
        return {
            "configured": False,
            "redirect_uri": redirect_uri,
            "message": (
                "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env "
                "(from https://developers.tiktok.com), then authorize here."
            ),
        }

    if not client.is_configured:
        return {
            "configured": True,
            "oauth_valid": False,
            "redirect_uri": redirect_uri,
            "message": (
                "Client key/secret are set, but TIKTOK_REFRESH_TOKEN is missing. "
                "Authorize at /api/v1/auth/tiktok with the marketing account."
            ),
        }

    user = client.get_user_info()
    if not user:
        return {
            "configured": True,
            "oauth_valid": False,
            "redirect_uri": redirect_uri,
            "message": (
                "TikTok token refresh failed. Re-authorize at /api/v1/auth/tiktok."
            ),
        }

    username = user.get("username") or ""
    display_name = user.get("display_name") or username or "TikTok account"
    return {
        "configured": True,
        "oauth_valid": True,
        "redirect_uri": redirect_uri,
        "open_id": user.get("open_id") or settings.TIKTOK_OPEN_ID or None,
        "account": {
            "display_name": display_name,
            "username": username,
            "follower_count": user.get("follower_count"),
            "likes_count": user.get("likes_count"),
            "video_count": user.get("video_count"),
        },
        "message": (
            f"Posts from THIS backend go to @{username or display_name}."
            if username or display_name
            else "TikTok is connected."
        ),
    }


@router.get("/auth/tiktok")
async def tiktok_auth_start():
    """Start TikTok OAuth — instructions, then TikTok consent."""
    client_key, client_secret, redirect_uri = _tiktok_oauth_config()
    if not client_key or not client_secret:
        raise HTTPException(
            status_code=400,
            detail=(
                "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env first "
                "(create an app at https://developers.tiktok.com)."
            ),
        )

    continue_url = "/api/v1/auth/tiktok/continue"
    return HTMLResponse(
        content=f"""
        <html><body style="font-family:sans-serif;padding:2rem;max-width:720px;line-height:1.5">
          <h2>Connect TikTok for posting &amp; analytics</h2>
          <p>This backend will save tokens for:</p>
          <pre style="background:#f4f4f4;padding:0.75rem">{redirect_uri}</pre>

          <div style="background:#eff6ff;border:1px solid #93c5fd;padding:1rem;border-radius:6px;margin:1rem 0">
            <p><strong>Use the marketing TikTok account</strong></p>
            <p>On TikTok's login screen, sign in as
            <code>marketing@kafi-group.com</code> (the account that should receive posts).
            Do not authorize with a personal TikTok account.</p>
            <p>Approve every permission (upload, publish, profile, video list) so
            both posting and dashboard analytics work.</p>
          </div>

          <div style="background:#fff7ed;border:1px solid #fdba74;padding:1rem;border-radius:6px;margin:1rem 0">
            <p><strong>Developer portal checklist</strong></p>
            <ol>
              <li>App products: <strong>Login Kit</strong> + <strong>Content Posting API</strong></li>
              <li>Redirect URI exactly matches the value above</li>
              <li>Scopes include video.upload, video.publish, user.info.*, video.list</li>
              <li>Unaudited apps can only post as <code>SELF_ONLY</code> until TikTok approves public posting</li>
            </ol>
          </div>

          <p><a href="{continue_url}"
             style="display:inline-block;background:#000;color:white;padding:0.75rem 1.25rem;
                    border-radius:6px;text-decoration:none;font-weight:600">
             Continue to TikTok sign-in
          </a></p>

          <p style="color:#666;font-size:0.9rem">
            Already connected? Check
            <a href="{public_api_url('/api/v1/auth/tiktok/status')}">TikTok status</a>.
          </p>
        </body></html>
        """
    )


@router.get("/auth/tiktok/continue")
async def tiktok_auth_continue():
    """Redirect to TikTok OAuth consent."""
    client_key, client_secret, _ = _tiktok_oauth_config()
    if not client_key or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env first.",
        )
    return RedirectResponse(url=_build_tiktok_auth_url())


@router.get("/auth/tiktok/callback", response_class=HTMLResponse)
async def tiktok_auth_callback(
    code: str = Query(default=""),
    error: str = Query(default=""),
    error_description: str = Query(default=""),
):
    """Exchange OAuth code for tokens and persist them."""
    if error:
        detail = error_description or error
        return HTMLResponse(
            status_code=400,
            content=f"""
            <html><body style="font-family:sans-serif;padding:2rem;max-width:720px;line-height:1.5">
              <h2>TikTok authorization denied</h2>
              <pre style="background:#f4f4f4;padding:1rem;overflow:auto">{detail}</pre>
              <p><a href="/api/v1/auth/tiktok">Try again</a></p>
            </body></html>
            """,
        )

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code.")

    # TikTok may return a URL-encoded code; decode once before exchange.
    auth_code = unquote(code)
    client_key, client_secret, redirect_uri = _tiktok_oauth_config()

    try:
        response = requests.post(
            TIKTOK_TOKEN_URL,
            data={
                "client_key": client_key,
                "client_secret": client_secret,
                "code": auth_code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.error(f"TikTok OAuth token exchange failed: {exc}")
        raise HTTPException(status_code=502, detail="Failed to contact TikTok OAuth.") from exc

    data = response.json() if response.content else {}
    access_token = data.get("access_token", "")
    refresh_token = data.get("refresh_token", "")
    open_id = data.get("open_id", "")
    granted_scopes = data.get("scope", "")

    if not response.ok or not access_token or not refresh_token:
        body = response.text[:500]
        logger.error(f"TikTok OAuth token exchange error: {body}")
        return HTMLResponse(
            status_code=400,
            content=f"""
            <html><body style="font-family:sans-serif;padding:2rem;max-width:720px;line-height:1.5">
              <h2>TikTok authorization failed</h2>
              <p>Confirm the redirect URI in the TikTok developer portal matches:</p>
              <pre style="background:#f4f4f4;padding:0.75rem">{redirect_uri}</pre>
              <p>TikTok response:</p>
              <pre style="background:#f4f4f4;padding:1rem;overflow:auto">{body}</pre>
              <p><a href="/api/v1/auth/tiktok">Try again</a></p>
            </body></html>
            """,
        )

    saved_keys = save_credentials(
        {
            "TIKTOK_ACCESS_TOKEN": access_token,
            "TIKTOK_REFRESH_TOKEN": refresh_token,
            "TIKTOK_OPEN_ID": open_id,
        }
    )

    account_block = ""
    client = TikTokClient(draft_mode=False)
    user = client.get_user_info(access_token=access_token)
    if user:
        username = user.get("username") or ""
        display_name = user.get("display_name") or username
        account_block = f"""
          <h3>Connected account</h3>
          <p><strong>{display_name}</strong>
             {f'(@{username})' if username else ''}</p>
          <p>Followers: {user.get('follower_count', '—')} ·
             Likes: {user.get('likes_count', '—')} ·
             Videos: {user.get('video_count', '—')}</p>
        """

    saved_note = (
        f"""
          <p style="background:#ecfdf5;border:1px solid #6ee7b7;padding:1rem;border-radius:6px">
            <strong>Saved automatically:</strong> {', '.join(saved_keys)}.
            Access tokens refresh on every API call (no restart needed).
          </p>
        """
        if saved_keys
        else (
            "<p style='color:#b45309'>Tokens obtained but could not be persisted. "
            "Check backend logs / database.</p>"
        )
    )

    return HTMLResponse(
        content=f"""
        <html><body style="font-family:sans-serif;padding:2rem;max-width:720px;line-height:1.5">
          <h2>TikTok authorization successful</h2>
          {saved_note}
          <p><strong>{_scope_status(granted_scopes)}</strong></p>
          <p>Callback / redirect URI for this token:</p>
          <pre style="background:#f4f4f4;padding:1rem;overflow:auto">{redirect_uri}</pre>
          <p>Granted scopes:</p>
          <pre style="background:#f4f4f4;padding:1rem;overflow:auto">{granted_scopes}</pre>
          {account_block}
          <h3>Next steps</h3>
          <ol>
            <li>Confirm at <code>/api/v1/auth/tiktok/status</code></li>
            <li>Open Dashboard → Analytics — TikTok should show Connected</li>
            <li>Post a <strong>video</strong> draft with TikTok selected
                (TikTok Direct Post is video-only)</li>
            <li>Submit the Content Posting API for TikTok audit if you need
                public (not private) posts</li>
          </ol>
          <p style="color:#666;font-size:0.9rem">
            Tokens are stored in the database and local .env. Do not commit them to git.
          </p>
        </body></html>
        """
    )
