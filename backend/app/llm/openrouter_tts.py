"""
OpenRouter TTS client (audio/speech endpoint).

Used for Fish Audio S2.1 Pro Free voice-overs.
https://openrouter.ai/docs/guides/overview/multimodal/tts
"""

from __future__ import annotations

import requests

from app.config import settings
from app.utils.exceptions import ContentGenerationError
from app.utils.logger import logger

OPENROUTER_SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech"


def synthesize_openrouter_speech(
    text: str,
    *,
    api_key: str | None = None,
    model: str | None = None,
    voice: str | None = None,
    response_format: str = "mp3",
) -> bytes:
    """
    Call OpenRouter TTS and return raw audio bytes.

    Fish Audio free tier typically works without a preset voice id.
    """
    key = (api_key or settings.OPENROUTER_FISH_API_KEY or settings.OPENROUTER_API_KEY).strip()
    if not key:
        raise ContentGenerationError(
            "Fish Audio is not configured. Set OPENROUTER_FISH_API_KEY in backend .env."
        )

    model_id = (model or settings.OPENROUTER_FISH_MODEL).strip()
    if not model_id:
        raise ContentGenerationError(
            "Fish Audio model not configured. Set OPENROUTER_FISH_MODEL in backend .env."
        )

    payload: dict = {
        "model": model_id,
        "input": text,
        "response_format": response_format,
    }
    if voice and voice.strip():
        payload["voice"] = voice.strip()

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": (settings.BACKEND_PUBLIC_URL or "http://localhost:8000").rstrip("/"),
        "X-Title": "Kafi Content Creation Voice",
    }
    timeout = max(30, int(getattr(settings, "OPENROUTER_FISH_TIMEOUT", 120) or 120))

    try:
        response = requests.post(
            OPENROUTER_SPEECH_URL,
            headers=headers,
            json=payload,
            timeout=timeout,
        )
    except requests.exceptions.Timeout as e:
        raise ContentGenerationError(
            f"Fish Audio request timed out after {timeout}s"
        ) from e
    except requests.exceptions.RequestException as e:
        raise ContentGenerationError(f"Fish Audio request failed: {e}") from e

    if response.status_code == 401:
        raise ContentGenerationError(
            "Fish Audio API key is invalid. Check OPENROUTER_FISH_API_KEY in backend .env."
        )
    if response.status_code == 402:
        raise ContentGenerationError(
            "OpenRouter has no credits / free Fish Audio quota exhausted."
        )
    if response.status_code == 429:
        raise ContentGenerationError(
            "Fish Audio rate limit hit. Wait a moment and retry."
        )
    if response.status_code >= 400:
        detail = response.text[:400]
        try:
            err = response.json()
            detail = (
                (err.get("error") or {}).get("message")
                or err.get("message")
                or detail
            )
        except Exception:
            pass
        raise ContentGenerationError(f"Fish Audio error ({response.status_code}): {detail}")

    audio = response.content
    if not audio:
        raise ContentGenerationError("Fish Audio returned empty audio.")

    content_type = (response.headers.get("Content-Type") or "").lower()
    if "json" in content_type or audio[:1] == b"{":
        # Some upstream errors arrive as JSON with HTTP 200.
        raise ContentGenerationError(
            f"Fish Audio returned an error payload instead of audio: {audio[:300]!r}"
        )

    logger.info(f"Fish Audio TTS ok model={model_id} bytes={len(audio)}")
    return audio
