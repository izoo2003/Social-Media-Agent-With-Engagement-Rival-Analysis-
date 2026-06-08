"""Diagnose LinkedIn 403 errors per configured account (no secrets printed)."""

import sys
from pathlib import Path

import requests

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import settings  # noqa: E402
from app.services.social_publisher import LinkedInClient, load_linkedin_accounts  # noqa: E402


def check_token_introspect(token: str) -> dict:
    """LinkedIn token introspection — shows if token is active and scopes."""
    try:
        r = requests.post(
            "https://www.linkedin.com/oauth/v2/introspectToken",
            data={
                "token": token,
                "client_id": settings.LINKEDIN_CLIENT_ID,
                "client_secret": settings.LINKEDIN_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )
        if r.ok:
            return r.json()
        return {"error": r.status_code, "body": r.text[:300]}
    except Exception as e:
        return {"error": str(e)}


def test_text_post(client: LinkedInClient) -> tuple[int, str]:
    """Try a minimal text-only UGC post (Share on LinkedIn API)."""
    payload = {
        "author": client._author_urn(),
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": "API connectivity test — please ignore if published."},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    r = requests.post(
        "https://api.linkedin.com/v2/ugcPosts",
        headers=client._headers(),
        json=payload,
        timeout=30,
    )
    return r.status_code, r.text[:400]


def test_userinfo(token: str) -> tuple[int, str]:
    r = requests.get(
        "https://api.linkedin.com/v2/userinfo",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    return r.status_code, r.text[:300]


def test_image_init(client: LinkedInClient) -> tuple[int, str]:
    """Try image upload initialization only."""
    r = requests.post(
        client.MEDIA_API_URL,
        headers=client._headers(),
        json={
                    "initializeUploadRequest": {
                        "owner": client._author_urn(),
                    }
        },
        timeout=20,
    )
    return r.status_code, r.text[:400]


def main() -> None:
    accounts = load_linkedin_accounts()
    print(f"\nLoaded {len(accounts)} LinkedIn account(s)\n")

    tokens_seen: dict[str, list[str]] = {}
    for acct in accounts:
        tokens_seen.setdefault(acct.access_token[:20], []).append(acct.label)

    print("Token uniqueness check:")
    for prefix, labels in tokens_seen.items():
        flag = "DUPLICATE TOKEN" if len(labels) > 1 else "unique"
        print(f"  [{flag}] {', '.join(labels)} (token starts: {prefix}...)")
    print()

    for acct in accounts:
        print("=" * 60)
        print(f"Account: {acct.label}")
        print(f"Person ID: {acct.person_id}")

        intro = check_token_introspect(acct.access_token)
        if "active" in intro:
            active = intro.get("active")
            print(f"Token active: {active}")
            print(f"Token scopes: {intro.get('scope', '(none reported)')}")
            print(f"Token expires: {intro.get('expires_at', 'unknown')}")
            if not active:
                print("  >> TOKEN IS DEAD — generate a new one in OAuth Tool and paste into .env")
        else:
            print(f"Introspection: {intro}")

        ui_status, ui_body = test_userinfo(acct.access_token)
        print(f"Token owner (userinfo): HTTP {ui_status}")
        if ui_status == 200:
            print(f"  {ui_body}")

        post_status, post_body = test_text_post(
            LinkedInClient(acct.access_token, acct.person_id, acct.label, draft_mode=False)
        )
        print(f"Text-only post: HTTP {post_status}")
        print(f"  Response: {post_body}")

        img_status, img_body = test_image_init(
            LinkedInClient(acct.access_token, acct.person_id, acct.label, draft_mode=False)
        )
        print(f"Image init: HTTP {img_status}")
        print(f"  Response: {img_body}")
        print()


if __name__ == "__main__":
    main()
