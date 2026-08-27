"""
OpenRouter chat client (OpenAI-compatible API).

Used by Content Creation for optional providers:
  - Claude dropdown → Nemotron free
  - ChatGPT dropdown → Gemma 4 free
https://openrouter.ai/docs
"""

from __future__ import annotations

import json

import requests

from app.config import settings
from app.utils.exceptions import LLMConnectionError
from app.utils.logger import logger

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"


def chat_openrouter(
    messages: list[dict],
    *,
    api_key: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    include_images: bool = False,
) -> tuple[str, str]:
    """
    Multi-turn chat via OpenRouter.

    Args:
        messages: List of {role, content} (system/user/assistant). Optional images
                  on user messages when include_images=True (OpenAI vision format).
        api_key: OpenRouter key override.
        model: OpenRouter model slug override.
        temperature: Sampling temperature.
        max_tokens: Max completion tokens.
        include_images: If True, attach reference images as multimodal content parts.

    Returns:
        Tuple of (reply text, model id used).
    """
    key = (api_key or settings.OPENROUTER_API_KEY).strip()
    if not key:
        raise LLMConnectionError(
            "OpenRouter API key not configured. "
            "Set OPENROUTER_API_KEY (or OPENROUTER_CHATGPT_API_KEY) in the backend .env."
        )

    model_id = (model or settings.OPENROUTER_CHAT_MODEL).strip()
    if not model_id:
        raise LLMConnectionError(
            "OpenRouter model not configured. Set OPENROUTER_CHAT_MODEL in backend .env."
        )

    openai_messages: list[dict] = []
    for msg in messages:
        role = msg.get("role", "user")
        text = (msg.get("content") or "").strip()
        if role == "system":
            if text:
                openai_messages.append({"role": "system", "content": text})
            continue
        if role not in ("user", "assistant"):
            role = "user"

        image_parts: list[dict] = []
        if include_images and role == "user":
            for attachment in msg.get("images") or []:
                if not isinstance(attachment, dict):
                    continue
                b64 = (attachment.get("image_base64") or "").strip()
                if not b64:
                    continue
                mime = (attachment.get("image_mime_type") or "image/jpeg").strip()
                image_parts.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    }
                )
            # Backward-compatible single-image fields
            single_b64 = (msg.get("image_base64") or "").strip()
            if single_b64 and not image_parts:
                mime = (msg.get("image_mime_type") or "image/jpeg").strip()
                image_parts.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{single_b64}"},
                    }
                )

        if image_parts:
            content_parts: list[dict] = []
            if text:
                content_parts.append({"type": "text", "text": text})
            content_parts.extend(image_parts)
            openai_messages.append({"role": role, "content": content_parts})
        else:
            if not text:
                continue
            openai_messages.append({"role": role, "content": text})

    if not openai_messages:
        raise LLMConnectionError("No messages to send to OpenRouter.")

    payload = {
        "model": model_id,
        "messages": openai_messages,
        "temperature": temperature if temperature is not None else settings.TEMPERATURE,
        "max_tokens": max_tokens if max_tokens is not None else settings.MAX_TOKENS,
    }

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": (settings.BACKEND_PUBLIC_URL or "http://localhost:8000").rstrip("/"),
        "X-Title": "Kafi Content Creation Chat",
    }

    timeout = max(30, int(getattr(settings, "OPENROUTER_TIMEOUT", 120) or 120))

    try:
        response = requests.post(
            OPENROUTER_CHAT_URL,
            headers=headers,
            json=payload,
            timeout=timeout,
        )
    except requests.exceptions.Timeout as e:
        raise LLMConnectionError(
            f"OpenRouter request timed out after {timeout}s"
        ) from e
    except requests.exceptions.RequestException as e:
        raise LLMConnectionError(f"OpenRouter request failed: {e}") from e

    if response.status_code == 401:
        raise LLMConnectionError(
            "OpenRouter API key is invalid. Check the OpenRouter key in backend .env."
        )
    if response.status_code == 402:
        raise LLMConnectionError(
            "OpenRouter account has no credits / free quota exhausted for this model."
        )
    if response.status_code == 429:
        raise LLMConnectionError(
            "OpenRouter rate limit hit. Free models are limited (e.g. ~20 req/min, ~200/day). "
            "Try again shortly."
        )
    if response.status_code >= 400:
        detail = response.text[:300]
        try:
            err = response.json()
            detail = (
                err.get("error", {}).get("message")
                or err.get("message")
                or detail
            )
        except Exception:
            pass
        raise LLMConnectionError(f"OpenRouter error ({response.status_code}): {detail}")

    try:
        data = response.json()
    except json.JSONDecodeError as e:
        raise LLMConnectionError("OpenRouter returned invalid JSON") from e

    # Some providers return HTTP 200 with an embedded error payload.
    embedded_error = data.get("error")
    if isinstance(embedded_error, dict) and embedded_error.get("message"):
        code = embedded_error.get("code") or "unknown"
        raise LLMConnectionError(
            f"OpenRouter upstream error ({code}): {embedded_error.get('message')}"
        )

    choices = data.get("choices") or []
    if not choices:
        raise LLMConnectionError(
            f"OpenRouter returned no choices. Response: {json.dumps(data)[:200]}"
        )

    message = choices[0].get("message") or {}
    reply = (message.get("content") or "").strip()
    if not reply:
        # Some reasoning models put text in reasoning fields; surface a clear error.
        raise LLMConnectionError("OpenRouter returned an empty reply.")

    used_model = data.get("model") or model_id
    logger.info(f"OpenRouter chat ok model={used_model}")
    return reply, used_model
