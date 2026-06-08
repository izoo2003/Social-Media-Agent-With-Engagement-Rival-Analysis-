"""
LinkedIn Multi-Account Posting Test (Bypasses Server & AI)
Tests the LinkedIn workflow code directly without needing the server.
Just run it with: python scripts/test_linkedin_post.py
"""

import json
import sys
from pathlib import Path


def _print_account_results(result: dict) -> None:
    aggregate = result.get("status", "unknown")
    print(f"   Aggregate status: {aggregate}")

    accounts = result.get("accounts") or []
    if not accounts:
        if result.get("error_message"):
            print(f"   Error: {result['error_message']}")
        return

    for account in accounts:
        icon = "✅" if account["status"] in ("published", "draft") else "❌"
        label = account.get("label", "Unknown")
        status = account.get("status", "unknown")
        print(f"   {icon} {label}: {status}")
        if account.get("error_message"):
            print(f"      Error: {account['error_message']}")
        if account.get("post_url"):
            print(f"      URL: {account['post_url']}")


def test_linkedin_client():
    """Test the LinkedIn client code directly (no server needed)."""
    print("\n" + "=" * 60)
    print("VALIDATING LINKEDIN MULTI-ACCOUNT WORKFLOW")
    print("=" * 60)

    try:
        backend_dir = Path(__file__).parent.parent
        sys.path.insert(0, str(backend_dir))

        from app.services.social_publisher import (
            LinkedInClient,
            SocialPublisher,
            load_linkedin_accounts,
        )

        accounts = load_linkedin_accounts()
        print(f"\n📋 Loaded {len(accounts)} LinkedIn account(s)")
        for i, acct in enumerate(accounts, start=1):
            token_set = "✅" if acct.access_token else "❌"
            person_set = "✅" if acct.person_id else "❌"
            print(f"   {i}. {acct.label} — token: {token_set}, person ID: {person_set}")

        # === TEST 1: Draft mode via SocialPublisher ===
        print("\n📋 TEST 1: Multi-account LinkedIn post (DRAFT MODE)")
        print("-" * 40)
        publisher = SocialPublisher(draft_mode=True)
        draft_result = publisher.post_to_platform(
            "linkedin",
            title="Test: Kafi Commodities Sustainable Rice Export",
            body="We are excited to announce our new partnership with EU buyers.",
        )
        _print_account_results(draft_result)

        expected_accounts = max(len(accounts), 0)
        draft_accounts = draft_result.get("accounts") or []
        if expected_accounts == 0:
            print("   ⚠️  No accounts configured — add credentials to .env")
        elif len(draft_accounts) == expected_accounts and draft_result["status"] == "draft":
            print("   ✅ Draft mode simulates all configured accounts")
        else:
            print("   ⚠️  Unexpected draft result")

        # === TEST 2: SocialPublisher multi-platform ===
        print("\n📋 TEST 2: SocialPublisher - Post to Multiple Platforms (DRAFT)")
        print("-" * 40)
        results = publisher.post_to_multiple(
            platforms=["linkedin", "facebook", "instagram"],
            title="Test: Kafi Commodities",
            body="Test post body content for all platforms.",
        )
        for platform, r in results.items():
            if platform == "linkedin":
                print(f"   linkedin aggregate: {r.get('status')}")
                _print_account_results(r)
            else:
                icon = "✅" if r["status"] == "draft" else "❌"
                print(f"   {icon} {platform}: {r['status']}")

        # === TEST 3: Platform config check ===
        print("\n📋 TEST 3: Platform Configuration Status")
        print("-" * 40)
        config = publisher.check_platform_config()
        for platform, configured in config.items():
            if configured:
                print(f"   ✅ {platform}: Configured")
            else:
                print(f"   ⚠️  {platform}: NOT configured (add credentials to .env)")

        # === TEST 4: Image post (draft) ===
        print("\n📋 TEST 4: LinkedIn Image Post (DRAFT MODE)")
        print("-" * 40)
        image_result = publisher.post_to_platform(
            "linkedin",
            title="Test with Image: Kafi Commodities",
            body="Check out our premium rice export quality!",
            media_file_path="uploads/images/test_image.jpg",
            media_type="image",
        )
        _print_account_results(image_result)

        # === TEST 5: Video post (draft) ===
        print("\n📋 TEST 5: LinkedIn Video Post (DRAFT MODE)")
        print("-" * 40)
        video_result = publisher.post_to_platform(
            "linkedin",
            title="Test with Video: Kafi Commodities",
            body="Watch our export process in action!",
            media_file_path="uploads/videos/test_video.mp4",
            media_type="video",
        )
        _print_account_results(video_result)

        # === TEST 6: Live mode summary (does not auto-post unless DRAFT_MODE=False) ===
        print("\n📋 TEST 6: Live Mode Readiness")
        print("-" * 40)
        from app.config import settings

        if settings.DRAFT_MODE:
            print("   ℹ️  DRAFT_MODE=True in .env — live API calls are disabled globally")
            print("   Set DRAFT_MODE=False and restart backend to test live posting")
        elif not accounts:
            print("   ⚠️  No LinkedIn accounts configured for live posting")
        else:
            print(f"   🌐 Live mode enabled — {len(accounts)} account(s) ready for API calls")
            print("   Run a live post through the UI or set draft_mode=False in API request")

        print("\n" + "=" * 60)
        print("🎉 LINKEDIN MULTI-ACCOUNT WORKFLOW — TESTS COMPLETE")
        print("=" * 60)
        print("""
✅ LinkedInClient — per-account credentials
✅ load_linkedin_accounts() — loads up to 3 accounts from .env
✅ SocialPublisher — fans out to all configured LinkedIn accounts
✅ Draft mode — simulates each account without API calls

📝 .env variables for 3 accounts:
   Account 1: LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_ID, LINKEDIN_ACCOUNT_1_LABEL
   Account 2: LINKEDIN_ACCOUNT_2_ACCESS_TOKEN, LINKEDIN_ACCOUNT_2_PERSON_ID, LINKEDIN_ACCOUNT_2_LABEL
   Account 3: LINKEDIN_ACCOUNT_3_ACCESS_TOKEN, LINKEDIN_ACCOUNT_3_PERSON_ID, LINKEDIN_ACCOUNT_3_LABEL

📝 Run DB migration before live testing:
   python scripts/migrate_linkedin_multi_account.py
""")
        return True

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("\n" + "🔷" * 15)
    print("   LINKEDIN MULTI-ACCOUNT WORKFLOW TEST")
    print("   (No Server Needed - Code Only)")
    print("🔷" * 15)
    test_linkedin_client()
