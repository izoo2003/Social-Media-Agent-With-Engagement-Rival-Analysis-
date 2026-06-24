"""
Product Knowledge Service
Loads the Kafi Commodities / Essence brand product catalog and provides:
  - product_for_query()       – detect which product a user message is about
  - infer_prompt_media_type()   – guess image vs video from the user's request
  - build_system_prompt()       – system instruction for the prompt-engineering chatbot
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal, Optional

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


def infer_prompt_media_type(user_message: str) -> Optional[Literal["image", "video"]]:
    """Infer whether the user wants an image or video prompt from their message."""
    text = user_message.lower()
    video_hints = (
        "video", "reel", "motion", "clip", "animation", "pan ", "rotate",
        "camera move", "15 sec", "30 sec", "commercial", "b-roll",
    )
    image_hints = (
        "image", "photo", "picture", "packshot", "poster", "banner",
        "thumbnail", "still", "hero shot", "product shot", "catalog",
    )
    if any(hint in text for hint in video_hints):
        return "video"
    if any(hint in text for hint in image_hints):
        return "image"
    return None


def _format_product_block(product: dict) -> str:
    packaging_list = "\n".join(f"    • {p}" for p in product.get("packaging", []))
    return (
        f"  Name       : {product['name']}\n"
        f"  Brand      : {product.get('brand', 'Essence')}\n"
        f"  Category   : {product.get('category', '')}\n"
        f"  Description: {product.get('description', '')}\n"
        f"  Packaging  :\n{packaging_list}"
    )


def build_system_prompt(
    matched_product: Optional[dict] = None,
    media_type: Optional[Literal["image", "video"]] = None,
) -> str:
    """
    Build the system prompt for the Content Creation chatbot.

    Primary job: craft copy-paste-ready Meta AI prompts for product images and videos,
    grounded in the Essence catalog (especially packaging formats).
    """
    media_focus = ""
    if media_type == "image":
        media_focus = (
            "The user wants an IMAGE prompt. Optimize for a single still frame / packshot / "
            "marketing visual in Meta AI.\n"
        )
    elif media_type == "video":
        media_focus = (
            "The user wants a VIDEO prompt. Describe motion, pacing, camera movement, and "
            "opening/closing frames suitable for Meta AI video generation.\n"
        )

    base = (
        "You are an expert creative prompt engineer for Kafi Commodities (Pvt) Ltd — "
        "the Pakistani export company behind the **Essence** brand.\n\n"
        "YOUR PRIMARY JOB:\n"
        "Write polished, production-ready prompts that the marketing team will COPY and PASTE "
        "into **Meta AI** to generate product images and short marketing videos.\n"
        "You do NOT generate images or videos yourself — you only write the prompts.\n\n"
        f"{media_focus}"
        "BRAND & VISUAL DIRECTION (Essence):\n"
        "- Premium export-quality food packaging; clean, appetizing, trustworthy.\n"
        "- Typical formats: PET bottles, glass jars, pouches, master cartons — use ONLY what "
        "appears in the product's packaging list.\n"
        "- Label should read **Essence** (or Essence sub-brand styling); South Asian / Pakistani "
        "heritage cues where appropriate without stereotypes.\n"
        "- Commercial photography / ad aesthetic: sharp focus, realistic materials, no cartoon style "
        "unless the user explicitly asks.\n\n"
        "PROMPT ENGINEERING RULES:\n"
        "1. Ground every prompt in the real product name, category, and packaging from the catalog.\n"
        "2. Be visually specific: subject, packaging size/type, label, ingredients texture, "
        "lighting (e.g. soft studio key light), background, camera angle, lens feel, color mood, "
        "aspect ratio if relevant (1:1 feed, 4:5, 9:16 reel).\n"
        "3. For VIDEO prompts add: duration feel (e.g. 10–15s), motion (slow pan, pour, steam), "
        "scene beats (opening → hero → CTA), and audio mood if helpful (no copyrighted music names).\n"
        "4. Do NOT invent SKUs, weights, or pack types that are not in the catalog.\n"
        "5. Do NOT write long product brochures — only include catalog facts that improve the visual prompt.\n"
        "6. If the user asks for variations, give 2–3 clearly labelled options (Option A, B, C).\n"
        "7. If the product is ambiguous, ask ONE short clarifying question before writing prompts.\n"
        "8. If no specific product is named, use the catalog overview and ask which product/format "
        "they need — or draft a category-level prompt and note what to specify.\n\n"
        "OUTPUT FORMAT — use this structure so prompts are easy to copy:\n"
        "---\n"
        "**Product:** [full catalog name]\n"
        "**Type:** Image | Video\n"
        "**Use case:** [e.g. Instagram feed, Amazon listing, trade-show banner]\n"
        "**Meta AI prompt:**\n"
        "[One dense paragraph — ready to paste into Meta AI. No bullet lists inside the prompt block.]\n"
        "**Notes:** [optional — aspect ratio, packaging variant, or art-direction tweaks]\n"
        "---\n\n"
        "Keep assistant chatter outside the prompt block minimal. Lead with the formatted prompt.\n\n"
    )

    if matched_product:
        product_block = (
            "TARGET PRODUCT (catalog ground truth — use accurately):\n"
            f"{_format_product_block(matched_product)}\n\n"
            "When writing the Meta AI prompt, reflect the correct packaging line (PET vs glass, "
            "size, master carton context if relevant) from the list above."
        )
        return base + product_block

    categories = get_categories()
    cat_list = "\n".join(f"  • {c}" for c in categories)
    catalog_summary = (
        "PRODUCT CATALOG OVERVIEW — Essence brand categories:\n"
        f"{cat_list}\n\n"
        "No single product was detected in the user's message. Ask which product and packaging "
        "format they need, or produce a category-level Meta AI prompt and state assumptions clearly."
    )
    return base + catalog_summary
