"""
Product Knowledge Service
Loads the Kafi Commodities / Essence brand product catalog and provides:
  - product_for_query()  – detect which product a user message is about
  - build_system_prompt() – craft the system instruction injected into each chat turn
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

_CATALOG_PATH = Path(__file__).parent.parent / "data" / "kafi_products.json"

# ---------------------------------------------------------------------------
# Load catalog once at import time
# ---------------------------------------------------------------------------

def _load_catalog() -> list[dict]:
    try:
        with open(_CATALOG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


CATALOG: list[dict] = _load_catalog()

# Pre-build alias → product index for O(1) lookup
_ALIAS_INDEX: dict[str, int] = {}
for _idx, _product in enumerate(CATALOG):
    for _alias in _product.get("aliases", []):
        _ALIAS_INDEX[_alias.lower()] = _idx


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def product_for_query(user_message: str) -> Optional[dict]:
    """
    Return the best-matching product dict for the given user message, or None.

    Strategy (fast and reliable):
    1. Normalise the message to lowercase.
    2. Check every alias in the index for substring presence.
    3. Prefer the alias with the most words (most specific match wins).
    """
    text = user_message.lower()
    # remove punctuation for cleaner matching
    text = re.sub(r"[^\w\s]", " ", text)

    best_idx: Optional[int] = None
    best_length: int = 0

    for alias, idx in _ALIAS_INDEX.items():
        if alias in text:
            if len(alias) > best_length:
                best_length = len(alias)
                best_idx = idx

    if best_idx is not None:
        return CATALOG[best_idx]
    return None


def get_all_product_names() -> list[str]:
    """Return a flat list of all product names for display purposes."""
    return [p["name"] for p in CATALOG]


def get_categories() -> list[str]:
    """Return a sorted unique list of product categories."""
    return sorted({p.get("category", "Other") for p in CATALOG})


def build_system_prompt(matched_product: Optional[dict] = None) -> str:
    """
    Build the system prompt that is injected at the start of every chat conversation.

    If a product has been detected in the user's latest message, the prompt
    includes the full product details so Gemini gives a precise, grounded answer.
    Otherwise it includes a summary of all available categories so Gemini can
    still guide customers accurately.
    """
    base = (
        "You are a friendly and knowledgeable product assistant for Kafi Commodities (Pvt) Ltd, "
        "a Pakistani export company. You represent the 'Essence' brand. "
        "Your job is to help customers and buyers learn about the products Kafi Commodities supplies.\n\n"
        "RULES:\n"
        "- Only answer questions about Kafi Commodities / Essence brand products.\n"
        "- If a customer asks about a product, always mention its full name, a helpful description, "
        "and the available packaging options.\n"
        "- Be professional, friendly, and concise.\n"
        "- If you are unsure which specific product the customer means, ask a short clarifying question.\n"
        "- Do NOT make up products, prices, or packaging that is not in the catalog.\n\n"
    )

    if matched_product:
        packaging_list = "\n".join(
            f"    • {p}" for p in matched_product.get("packaging", [])
        )
        product_block = (
            "PRODUCT SPOTLIGHT — answer the customer's question using THIS product:\n\n"
            f"  Name       : {matched_product['name']}\n"
            f"  Brand      : {matched_product.get('brand', 'Essence')}\n"
            f"  Category   : {matched_product.get('category', '')}\n"
            f"  Description: {matched_product.get('description', '')}\n"
            f"  Packaging  :\n{packaging_list}\n\n"
            "Lead with the product name, then give the description, then list the packaging options clearly."
        )
        return base + product_block
    else:
        # Generic mode — list categories so Gemini can orient the customer
        categories = get_categories()
        cat_list = "\n".join(f"  • {c}" for c in categories)
        catalog_summary = (
            "PRODUCT CATALOG OVERVIEW — Kafi Commodities / Essence brand supplies:\n"
            f"{cat_list}\n\n"
            "If the customer mentions a specific product or category, describe it accurately from the catalog. "
            "If you need more details to answer, ask what category or product they are interested in."
        )
        return base + catalog_summary
