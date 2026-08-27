"""
Cloudflare Workers AI image generation for Prompt Studio.

Uses Flux.2 Klein for text + optional reference images (input_image_0…).
No Gemini calls — attachments and prompts are handled entirely by Cloudflare.
"""

from __future__ import annotations

import base64
from typing import Any

import requests

from app.config import settings
from app.services.media import MediaService
from app.utils.exceptions import LLMConnectionError
from app.utils.logger import logger

_FLUX2_MODELS = {
    "@cf/black-forest-labs/flux-2-dev",
    "@cf/black-forest-labs/flux-2-klein-4b",
    "@cf/black-forest-labs/flux-2-klein-9b",
    "black-forest-labs/flux-2-dev",
    "black-forest-labs/flux-2-klein-4b",
    "black-forest-labs/flux-2-klein-9b",
}


def _model_path(model: str) -> str:
    path = (model or "").strip()
    if path and not path.startswith("@"):
        path = f"@{path}"
    return path


def _strip_data_url_prefix(raw: str) -> str:
    value = (raw or "").strip()
    if value.startswith("data:") and "," in value:
        return value.split(",", 1)[1].strip()
    return value


def _normalize_refs(reference_images: list[dict] | None) -> list[dict[str, str]]:
    if not reference_images:
        return []
    allowed = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
    cleaned: list[dict[str, str]] = []
    for item in reference_images[:4]:
        if not isinstance(item, dict):
            continue
        data = _strip_data_url_prefix(
            str(item.get("image_base64") or item.get("data") or "")
        )
        if not data:
            continue
        mime = (
            str(
                item.get("image_mime_type")
                or item.get("mimeType")
                or item.get("mime_type")
                or "image/jpeg"
            )
            .strip()
            .lower()
            or "image/jpeg"
        )
        if mime == "image/jpg":
            mime = "image/jpeg"
        if mime not in allowed:
            continue
        cleaned.append({"mime": mime, "data": data})
    return cleaned


def build_reference_prompt(prompt: str, ref_count: int) -> str:
    """Combine the user prompt with strict instructions to use attached refs."""
    user_brief = (prompt or "").strip() or (
        "Clean commercial studio product shot, soft light, sharp focus, white background."
    )
    if ref_count <= 0:
        return user_brief[:4000]

    index_list = ", ".join(f"input_image_{i}" for i in range(ref_count))
    return (
        f"Attached reference photo(s): {index_list}. "
        "These images are the ground-truth product/logo. "
        "Reproduce the same packaging, logo artwork, label text, brand colors, "
        "shape, and proportions as closely as possible. "
        "Do not invent a different brand or redesign the label.\n\n"
        "Also follow this user scene prompt exactly "
        "(background, lighting, camera, mood, composition):\n"
        f"{user_brief}"
    )[:4000]


def _store_cloudflare_image(image_b64: str, *, model: str) -> dict:
    try:
        image_bytes = base64.b64decode(image_b64)
    except (ValueError, TypeError) as exc:
        raise LLMConnectionError("Cloudflare returned invalid base64 image data.") from exc

    stored = MediaService().save_bytes(
        image_bytes,
        extension=".jpg",
        media_type="image",
        original_name="cloudflare-generated.jpg",
    )
    return {
        "media_path": stored["media_path"],
        "media_url": stored["media_url"],
        "model": model,
        "provider": "cloudflare",
        "caption": None,
    }


def _is_flux2_model(model: str) -> bool:
    path = _model_path(model).lower()
    return "flux-2" in path or path in {m.lower() for m in _FLUX2_MODELS}


def _run_flux_schnell(prompt: str, *, account_id: str, api_token: str, model: str) -> dict:
    model_path = _model_path(model)
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model_path}"
    payload: dict[str, Any] = {
        "prompt": prompt[:2048],
        "steps": settings.CLOUDFLARE_IMAGE_STEPS,
    }
    logger.info(f"Cloudflare Workers AI image gen (model: {model}, text-only JSON)")
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=settings.CLOUDFLARE_IMAGE_TIMEOUT,
    )
    return _parse_cloudflare_response(response, model=model)


def _run_flux2(
    prompt: str,
    refs: list[dict[str, str]] | None = None,
    *,
    account_id: str,
    api_token: str,
    model: str,
) -> dict:
    refs = refs or []
    model_path = _model_path(model)
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model_path}"
    full_prompt = build_reference_prompt(prompt, len(refs)) if refs else (prompt or "")[:4000]

    files: list[tuple[str, Any]] = [
        ("prompt", (None, full_prompt)),
        ("width", (None, "1024")),
        ("height", (None, "1024")),
    ]
    if "klein" not in model_path.lower():
        files.append(
            ("steps", (None, str(max(4, int(settings.CLOUDFLARE_IMAGE_STEPS or 4)))))
        )

    for index, ref in enumerate(refs[:4]):
        try:
            raw = base64.b64decode(ref["data"])
        except (ValueError, TypeError) as exc:
            raise LLMConnectionError("Invalid reference image data for Cloudflare.") from exc
        mime = ref["mime"]
        ext = "png" if "png" in mime else "jpg"
        files.append((f"input_image_{index}", (f"ref{index}.{ext}", raw, mime)))

    logger.info(
        f"Cloudflare Flux.2 image gen (model: {model}, refs={len(refs)}, "
        f"prompt_chars={len(full_prompt)}, multipart)"
    )
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {api_token}"},
        files=files,
        timeout=settings.CLOUDFLARE_IMAGE_TIMEOUT,
    )
    return _parse_cloudflare_response(response, model=model)


def _parse_cloudflare_response(response: requests.Response, *, model: str) -> dict:
    if response.status_code == 401:
        raise LLMConnectionError(
            "Cloudflare API token is invalid. Check CLOUDFLARE_API_TOKEN in .env."
        )

    if not response.ok:
        raise LLMConnectionError(
            f"Cloudflare API error ({response.status_code}): {response.text[:400]}"
        )

    data = response.json()
    if not data.get("success"):
        errors = data.get("errors") or data
        raise LLMConnectionError(f"Cloudflare generation failed: {errors}")

    result = data.get("result") or {}
    image_b64 = result.get("image")
    if not image_b64:
        raise LLMConnectionError("Cloudflare returned no image data.")

    return _store_cloudflare_image(image_b64, model=model)


def generate_cloudflare_image(
    prompt: str,
    reference_images: list[dict] | None = None,
) -> dict:
    """
    Generate via Cloudflare only.

    With attachments: Flux.2 multipart with input_image_0… + user prompt.
    Without: Flux.2 (or configured model) from text prompt.
    Falls back to flux-1-schnell if Flux.2 fails.
    """
    account_id = settings.CLOUDFLARE_ACCOUNT_ID.strip()
    api_token = settings.CLOUDFLARE_API_TOKEN.strip()
    default_model = (
        settings.CLOUDFLARE_IMAGE_MODEL.strip()
        or "@cf/black-forest-labs/flux-2-klein-4b"
    )
    ref_model = (
        (settings.CLOUDFLARE_REFERENCE_IMAGE_MODEL or "").strip() or default_model
    )
    schnell_fallback = "@cf/black-forest-labs/flux-1-schnell"

    if not account_id or not api_token:
        raise LLMConnectionError(
            "Cloudflare image generation is not configured. "
            "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in backend .env."
        )

    refs = _normalize_refs(reference_images)
    primary = ref_model if refs else default_model
    working_prompt = (prompt or "").strip()

    logger.info(
        f"Cloudflare generate_image start: refs={len(refs)} model={primary} "
        f"prompt_preview={(working_prompt[:80] + '…') if len(working_prompt) > 80 else working_prompt}"
    )

    try:
        if _is_flux2_model(primary) or refs:
            try:
                result = _run_flux2(
                    working_prompt,
                    refs,
                    account_id=account_id,
                    api_token=api_token,
                    model=primary,
                )
                result["used_reference_images"] = bool(refs)
                result["prompt_enriched"] = bool(refs)
                return result
            except (LLMConnectionError, requests.exceptions.RequestException) as exc:
                logger.warning(
                    f"Cloudflare Flux.2 ({primary}) failed ({exc}); "
                    f"falling back to {schnell_fallback}."
                )
                # Schnell cannot take image bytes — keep fidelity instructions in text.
                text_prompt = build_reference_prompt(working_prompt, len(refs)) if refs else working_prompt
                result = _run_flux_schnell(
                    text_prompt,
                    account_id=account_id,
                    api_token=api_token,
                    model=schnell_fallback,
                )
                result["used_reference_images"] = False
                result["prompt_enriched"] = bool(refs)
                result["fallback_reason"] = (
                    f"{primary} unavailable; used {schnell_fallback}. "
                    + (
                        "Reference pixels could not be sent — describe the product in your prompt for best results."
                        if refs
                        else ""
                    )
                ).strip()
                return result

        result = _run_flux_schnell(
            working_prompt,
            account_id=account_id,
            api_token=api_token,
            model=primary,
        )
        result["used_reference_images"] = False
        result["prompt_enriched"] = False
        return result
    except requests.exceptions.Timeout as exc:
        raise LLMConnectionError(
            f"Cloudflare request timed out after {settings.CLOUDFLARE_IMAGE_TIMEOUT}s"
        ) from exc
    except requests.exceptions.RequestException as exc:
        raise LLMConnectionError(f"Cloudflare request failed: {exc}") from exc
