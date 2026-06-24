"""List LinkedIn company pages Khalid's token can administer (read-only lookup)."""

import sys
from pathlib import Path

import requests

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import settings  # noqa: E402


def headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": "202604",
    }


def fetch_admin_organizations(token: str) -> None:
    print("Fetching organizations where this token holder is an admin...\n")
    r = requests.get(
        "https://api.linkedin.com/rest/organizationAcls",
        headers=headers(token),
        params={"q": "roleAssignee", "role": "ADMINISTRATOR", "state": "APPROVED"},
        timeout=30,
    )
    if not r.ok:
        print(f"organizationAcls failed: HTTP {r.status_code}")
        print(r.text[:500])
        if r.status_code == 403:
            print(
                "\nTip: token may need w_organization_social / r_organization_admin. "
                "Re-generate Khalid's token with org scopes and try again."
            )
        return

    elements = r.json().get("elements", [])
    if not elements:
        print("No administered organizations found for this token.")
        return

    org_ids: list[str] = []
    for el in elements:
        org_urn = el.get("organization", "")
        if org_urn.startswith("urn:li:organization:"):
            org_ids.append(org_urn.split(":")[-1])

    if not org_ids:
        print("Found ACL entries but no organization URNs parsed.")
        print(elements)
        return

    # Batch lookup org names
    ids_param = ",".join(f"({oid})" for oid in org_ids)
    detail = requests.get(
        f"https://api.linkedin.com/rest/organizations",
        headers=headers(token),
        params={"ids": f"List({ids_param})"},
        timeout=30,
    )
    if not detail.ok:
        print("Organization IDs (names lookup failed):")
        for oid in org_ids:
            print(f"  LINKEDIN_ORGANIZATION_ID={oid}")
        print(f"\nDetail lookup error: HTTP {detail.status_code} {detail.text[:300]}")
        return

    results = detail.json().get("results", {})
    for oid in org_ids:
        info = results.get(str(oid), {})
        name = info.get("localizedName") or info.get("vanityName") or "(unknown)"
        vanity = info.get("vanityName", "")
        print(f"  Name: {name}")
        if vanity:
            print(f"  Vanity URL: https://www.linkedin.com/company/{vanity}/")
        print(f"  Organization ID: {oid}")
        print(f"  URN: urn:li:organization:{oid}")
        print(f"  .env line: LINKEDIN_ORGANIZATION_ID={oid}")
        print()


def lookup_by_vanity(token: str, vanity: str) -> None:
    print(f"Looking up vanity name: {vanity!r}\n")
    r = requests.get(
        "https://api.linkedin.com/rest/organizations",
        headers=headers(token),
        params={"q": "vanityName", "vanityName": vanity},
        timeout=30,
    )
    if not r.ok:
        print(f"Vanity lookup failed: HTTP {r.status_code}")
        print(r.text[:500])
        return

    elements = r.json().get("elements", [])
    if not elements:
        print("No organization found for that vanity name.")
        return

    for el in elements:
        oid = el.get("id")
        name = el.get("localizedName") or el.get("vanityName")
        print(f"  Name: {name}")
        print(f"  Organization ID: {oid}")
        print(f"  .env line: LINKEDIN_ORGANIZATION_ID={oid}")
        print()


def main() -> None:
    token = (settings.LINKEDIN_ACCESS_TOKEN or "").strip()
    if not token:
        print("LINKEDIN_ACCESS_TOKEN is not set in .env")
        sys.exit(1)

    vanity = sys.argv[1] if len(sys.argv) > 1 else ""
    if vanity:
        lookup_by_vanity(token, vanity)
    else:
        fetch_admin_organizations(token)
        print("Tip: pass a vanity slug to search directly, e.g.:")
        print("  python scripts/lookup_linkedin_organizations.py essence-foods")


if __name__ == "__main__":
    main()
