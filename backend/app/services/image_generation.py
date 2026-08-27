"""
Prompt Studio image generation — Cloudflare Flux.2 only.

Attachments are sent as Flux.2 reference images (input_image_0…).
Gemini image-generation keys are not used (free tier has no usable image quota).
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from app.config import (
    _cloudflare_image_ready,
    settings,
    resolve_image_provider,
)
from app.services.cloudflare_image import generate_cloudflare_image
from app.services.gemini_image import extract_image_prompt
from app.utils.exceptions import LLMConnectionError
from app.utils.logger import logger

_GEMINI_DAILY_COUNTER_PATH = Path(__file__).resolve().parent.parent / ".gemini_image_daily.json"


def _is_gemini_quota_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(
        term in text
        for term in ("quota", "billing", "rate limit", "resource_exhausted", "429")
    )


def _is_gemini_auth_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(
        term in text
        for term in (
            "401",
            "403",
            "unauthenticated",
            "invalid authentication",
            "not authorized",
            "invalid or not authorized",
        )
    )


def _gemini_priority_limit() -> int:
    try:
        return max(0, int(settings.IMAGE_GEMINI_PRIORITY_COUNT))
    except (TypeError, ValueError):
        return 5


def _read_gemini_daily_count() -> tuple[str, int]:
    today = date.today().isoformat()
    try:
        if _GEMINI_DAILY_COUNTER_PATH.exists():
            data = json.loads(_GEMINI_DAILY_COUNTER_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("date") == today:
                return today, max(0, int(data.get("success_count", 0)))
    except Exception as exc:
        logger.warning(f"Could not read Gemini daily image counter: {exc}")
    return today, 0


def _write_gemini_daily_count(day: str, count: int) -> None:
    try:
        _GEMINI_DAILY_COUNTER_PATH.write_text(
            json.dumps({"date": day, "success_count": max(0, int(count))}),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning(f"Could not write Gemini daily image counter: {exc}")


def _increment_gemini_daily_count() -> int:
    day, count = _read_gemini_daily_count()
    count += 1
    _write_gemini_daily_count(day, count)
    return count


def _cloudflare_result(
    prompt: str,
    *,
    reason: str,
    reference_images: list[dict] | None = None,
) -> dict:
    result = generate_cloudflare_image(prompt, reference_images=reference_images)
    result["provider"] = "cloudflare"
    model = result.get("model", "@cf/black-forest-labs/flux-1-schnell")
    if reason == "daily_budget":
        result["model"] = f"{model} (after Gemini daily budget)"
        result["fallback_reason"] = (
            f"Gemini daily priority budget used "
            f"({_gemini_priority_limit()} images). Using Cloudflare Flux."
        )
    elif reason == "quota":
        result["model"] = f"{model} (Gemini quota fallback)"
        prior = result.get("fallback_reason")
        result["fallback_reason"] = prior or (
            "Gemini image quota exceeded on the configured API keys. "
            "Used Cloudflare with reference-aware generation instead."
        )
    elif reason == "auth":
        result["model"] = f"{model} (Gemini auth fallback)"
        result["fallback_reason"] = (
            "STUDIO_IMAGE_GEMINI_API_KEY was rejected (401). Used Cloudflare instead. "
            "In AI Studio, restrict the key to 'Gemini API only' (AQ... and AIza... keys both work), "
            "save STUDIO_IMAGE_GEMINI_API_KEY in .env, and restart the backend."
        )
    else:
        result["fallback_reason"] = result.get("fallback_reason") or reason
    return result


def generate_image(
    prompt: str,
    preferred_provider: str | None = None,
    reference_images: list[dict] | None = None,
) -> dict:
    """Generate an image via Cloudflare (Prompt Studio).

    Gemini image generation is intentionally not used — free Gemini image keys
    have no usable quota. Attachments go to Flux.2 as input_image_0….
    """
    override = (preferred_provider or "").strip().lower()
    provider = override or resolve_image_provider()
    refs = [
        r
        for r in (reference_images or [])
        if isinstance(r, dict)
        and str(r.get("image_base64") or r.get("data") or "").strip()
    ]

    if not _cloudflare_image_ready():
        raise LLMConnectionError(
            "Cloudflare image generation is required for Prompt Studio. "
            "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the backend .env "
            "(and on Railway). Gemini image keys are not used."
        )

    logger.info(
        f"Image gen via Cloudflare only (requested={provider or 'default'}, refs={len(refs)})"
    )
    result = generate_cloudflare_image(prompt, reference_images=refs or None)
    result["provider"] = "cloudflare"
    if refs and result.get("used_reference_images"):
        result["fallback_reason"] = (
            result.get("fallback_reason")
            or "Cloudflare Flux.2 used your prompt and attached reference image(s)."
        )
    elif not result.get("fallback_reason"):
        result["fallback_reason"] = None
    return result


__all__ = ["extract_image_prompt", "generate_image"]
