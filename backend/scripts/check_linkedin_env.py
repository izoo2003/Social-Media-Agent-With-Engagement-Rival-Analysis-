"""Local-only check: verify LinkedIn .env values parse correctly (no API calls)."""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import settings  # noqa: E402
from app.services.social_publisher import load_linkedin_accounts  # noqa: E402


def inspect(name: str, val: str) -> None:
    v = val or ""
    issues: list[str] = []
    if v.startswith(" ") or v.startswith('"'):
        issues.append("leading space or quote")
    if v.endswith('"'):
        issues.append("trailing quote")
    if not v.strip():
        issues.append("empty")
    print(f"{name}: length={len(v)}, issues={issues or 'none'}")


def main() -> None:
    print("LinkedIn .env parse check (no external API calls)\n")
    inspect("LINKEDIN_ACCESS_TOKEN", settings.LINKEDIN_ACCESS_TOKEN)
    inspect("LINKEDIN_ACCOUNT_2_ACCESS_TOKEN", settings.LINKEDIN_ACCOUNT_2_ACCESS_TOKEN)
    inspect("LINKEDIN_ACCOUNT_3_ACCESS_TOKEN", settings.LINKEDIN_ACCOUNT_3_ACCESS_TOKEN)
    inspect("LINKEDIN_CLIENT_ID", settings.LINKEDIN_CLIENT_ID)
    inspect("LINKEDIN_CLIENT_SECRET", settings.LINKEDIN_CLIENT_SECRET)
    print(f"DRAFT_MODE: {settings.DRAFT_MODE}")
    print(f"LINKEDIN_ORGANIZATION_ID set: {bool((settings.LINKEDIN_ORGANIZATION_ID or '').strip())}")

    accounts = load_linkedin_accounts()
    print(f"\nLoaded accounts: {len(accounts)}")
    for i, acct in enumerate(accounts, start=1):
        label_issues = []
        if acct.label.startswith(" ") or acct.label.startswith('"'):
            label_issues.append("label has leading space/quote")
        print(
            f"  {i}. label={acct.label!r}, token_length={len(acct.access_token)}, "
            f"person_id_set={bool(acct.person_id)}, label_issues={label_issues or 'none'}"
        )

    tokens = [a.access_token for a in accounts if a.access_token]
    if len(tokens) != len(set(tokens)):
        print("\nWARNING: duplicate access tokens detected across accounts")
    elif len(accounts) == 3:
        print("\nAll 3 accounts loaded with unique tokens")


if __name__ == "__main__":
    main()
