"""Social platform configuration routes (read-only, no secrets exposed)."""

from fastapi import APIRouter

from app.services.social_publisher import SocialPublisher, load_linkedin_accounts

router = APIRouter()


@router.get("/social/linkedin/accounts")
def list_linkedin_accounts():
    """Return configured LinkedIn account labels for the frontend account picker."""
    accounts = load_linkedin_accounts()
    return [
        {
            "index": idx,
            "label": acct.label,
            "configured": True,
        }
        for idx, acct in enumerate(accounts, start=1)
    ]


@router.get("/social/platforms/config")
def get_platform_config():
    """Return which social platforms are configured and ready to post."""
    publisher = SocialPublisher(draft_mode=True)
    config = publisher.check_platform_config()
    linkedin_accounts = load_linkedin_accounts()
    return {
        "platforms": config,
        "linkedin_accounts": [
            {"index": idx, "label": acct.label, "configured": True}
            for idx, acct in enumerate(linkedin_accounts, start=1)
        ],
        "linkedin_account_count": len(linkedin_accounts),
    }
