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
    """Generate an image using the resolved IMAGE_PROVIDER."""
    provider = resolve_image_provider()

    if provider == "modelslab":
        return generate_modelslab_image(prompt)
    if provider == "gemini":
        return generate_gemini_image(prompt)
    if provider == "cloudflare":
        return generate_cloudflare_image(prompt)

    raise LLMConnectionError(
        f"Image provider '{provider}' is not configured. "
        "Set IMAGE_PROVIDER to cloudflare, modelslab, or gemini and add matching API keys."
    )


__all__ = ["extract_image_prompt", "generate_image"]
