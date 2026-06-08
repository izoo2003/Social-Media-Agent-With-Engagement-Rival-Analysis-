"""
Meta (Facebook + Instagram) OAuth 2.0 re-authorization route.

Generates a long-lived Page access token that never expires (as long as the
user does not revoke app access). Use this when FACEBOOK_PAGE_ACCESS_TOKEN
expires and analytics / posting stop working.

Usage:
  1. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to backend/.env
     (find them in your Meta App Dashboard under App Settings → Basic)
  2. Add the callback URI to your app's Valid OAuth Redirect URIs:
     http://localhost:8000/api/v1/auth/meta/callback
  3. Visit http://localhost:8000/api/v1/auth/meta while the backend is running
  4. Log in and approve permissions
  5. Copy the new token from the success page into FACEBOOK_PAGE_ACCESS_TOKEN
"""

from urllib.parse import urlencode

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import settings
from app.utils.logger import logger

router = APIRouter()

FACEBOOK_AUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth"
FACEBOOK_TOKEN_URL = "https://graph.facebook.com/oauth/access_token"

REQUIRED_SCOPES = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_read_user_content",
    "read_insights",
    "instagram_basic",
    "instagram_manage_insights",
    "pages_manage_posts",
    "pages_manage_engagement",
]


@router.get("/auth/meta")
async def meta_auth_start():
    """
    Start Meta OAuth — redirects to Facebook login/consent screen.
    Requires FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env.
    """
    if not settings.FACEBOOK_APP_ID or not settings.FACEBOOK_APP_SECRET:
        raise HTTPException(
            status_code=400,
            detail=(
                "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in backend/.env first. "
                "Find them in your Meta App Dashboard under App Settings → Basic."
            ),
        )

    params = {
        "client_id": settings.FACEBOOK_APP_ID,
        "redirect_uri": settings.FACEBOOK_REDIRECT_URI,
        "scope": ",".join(REQUIRED_SCOPES),
        "response_type": "code",
        "auth_type": "rerequest",
    }
    auth_url = f"{FACEBOOK_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@router.get("/auth/meta/callback", response_class=HTMLResponse)
async def meta_auth_callback(
    code: str = Query(default=""),
    error: str = Query(default=""),
    error_description: str = Query(default=""),
):
    """
    Exchange Facebook OAuth code for a long-lived Page access token.
    Displays the new token so you can paste it into .env.
    """
    if error:
        raise HTTPException(
            status_code=400,
            detail=f"Facebook OAuth error: {error} — {error_description}",
        )
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code.")

    # Step 1: Exchange code for a short-lived user access token
    try:
        token_resp = requests.get(
            FACEBOOK_TOKEN_URL,
            params={
                "client_id": settings.FACEBOOK_APP_ID,
                "client_secret": settings.FACEBOOK_APP_SECRET,
                "redirect_uri": settings.FACEBOOK_REDIRECT_URI,
                "code": code,
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.error(f"Meta OAuth token exchange failed: {exc}")
        raise HTTPException(status_code=502, detail="Failed to contact Facebook OAuth.") from exc

    if not token_resp.ok:
        raise HTTPException(
            status_code=400,
            detail=f"Facebook token exchange error: {token_resp.text[:300]}",
        )

    short_lived_token = token_resp.json().get("access_token", "")
    if not short_lived_token:
        raise HTTPException(status_code=400, detail="Facebook did not return an access token.")

    # Step 2: Exchange for a long-lived user token (valid ~60 days)
    try:
        ll_resp = requests.get(
            FACEBOOK_TOKEN_URL,
            params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.FACEBOOK_APP_ID,
                "client_secret": settings.FACEBOOK_APP_SECRET,
                "fb_exchange_token": short_lived_token,
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.error(f"Meta long-lived token exchange failed: {exc}")
        raise HTTPException(status_code=502, detail="Failed to get long-lived token.") from exc

    if not ll_resp.ok:
        raise HTTPException(
            status_code=400,
            detail=f"Long-lived token exchange error: {ll_resp.text[:300]}",
        )
    long_lived_user_token = ll_resp.json().get("access_token", "")

    # Step 3: Get a never-expiring Page access token
    graph_url = f"https://graph.facebook.com/{settings.META_GRAPH_API_VERSION}"
    page_id = settings.FACEBOOK_PAGE_ID.strip()

    page_token = ""
    page_token_note = ""
    if page_id and long_lived_user_token:
        try:
            page_resp = requests.get(
                f"{graph_url}/{page_id}",
                params={
                    "fields": "access_token,name",
                    "access_token": long_lived_user_token,
                },
                timeout=30,
            )
            if page_resp.ok:
                page_data = page_resp.json()
                page_token = page_data.get("access_token", "")
                page_name = page_data.get("name", "your page")
                page_token_note = f"Page: <strong>{page_name}</strong>"
            else:
                logger.warning(f"Could not fetch page token: {page_resp.text[:200]}")
                page_token_note = (
                    "Could not auto-fetch page token (check FACEBOOK_PAGE_ID). "
                    "Use the long-lived user token below instead for now."
                )
        except requests.RequestException as exc:
            logger.warning(f"Page token fetch failed: {exc}")
            page_token_note = "Page token fetch failed — use long-lived user token below."

    if page_token:
        token_to_use = page_token
        token_label = "Page access token (non-expiring)"
        token_note = page_token_note
    else:
        token_to_use = long_lived_user_token
        token_label = "Long-lived user token (~60 days)"
        token_note = page_token_note or "Set FACEBOOK_PAGE_ID in .env to get a non-expiring page token."

    return HTMLResponse(
        content=f"""
        <html><body style="font-family:sans-serif;padding:2rem;max-width:720px">
          <h2>Meta (Facebook + Instagram) authorization successful</h2>
          <p>{token_note}</p>
          <p><strong>{token_label}</strong></p>
          <p>Copy this value into <code>backend/.env</code> as
          <code>FACEBOOK_PAGE_ACCESS_TOKEN</code>, then restart the backend:</p>
          <pre style="background:#f4f4f4;padding:1rem;overflow:auto;word-break:break-all">{token_to_use}</pre>
          <h3>Next steps</h3>
          <ol>
            <li>Open <code>backend/.env</code></li>
            <li>Replace <code>FACEBOOK_PAGE_ACCESS_TOKEN=...</code> with the token above</li>
            <li>Restart the backend server</li>
            <li>Facebook and Instagram analytics should work again</li>
          </ol>
          <p style="color:#666;font-size:0.9rem">
            Keep this token secret. Do not commit it to git. A Page access token
            derived from a long-lived user token does not expire unless the user
            revokes app access.
          </p>
        </body></html>
        """
    )
