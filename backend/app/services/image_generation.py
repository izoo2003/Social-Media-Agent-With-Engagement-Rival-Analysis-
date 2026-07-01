"""
Prompt Studio image generation — routes by IMAGE_PROVIDER (gemini, modelslab, cloudflare).
"""

from __future__ import annotations

from app.config import resolve_image_provider
from app.services.cloudflare_image import generate_cloudflare_image
from app.services.gemini_image import extract_image_prompt, generate_image as generate_gemini_image
from app.services.modelslab_image import generate_modelslab_image
from app.utils.exceptions import LLMConnectionError


def generate_image(prompt: str) -> dict:
    """Generate an image using IMAGE_PROVIDER (default: cloudflare)."""
    provider = resolve_image_provider()

    if provider == "cloudflare":
        return generate_cloudflare_image(prompt)
    if provider == "modelslab":
        return generate_modelslab_image(prompt)
    if provider == "gemini":
        return generate_gemini_image(prompt)

    raise LLMConnectionError(
        f"Image provider '{provider}' is not supported. "
        "Set IMAGE_PROVIDER=cloudflare and add CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN."
    )


__all__ = ["extract_image_prompt", "generate_image"]
