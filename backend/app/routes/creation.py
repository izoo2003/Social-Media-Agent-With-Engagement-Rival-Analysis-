"""
API Routes - Content Creation (chatbot)
GET  /creation/models          - Capabilities + external video links
POST /creation/chat            - Prompt engineering chat (CREATION_GEMINI_API_KEY)
POST /creation/suggest         - Fix spelling / improve wording for chat & captions
POST /creation/generate-image  - Image gen (provider per IMAGE_PROVIDER)
POST /creation/generate-voice  - edge-tts voice-over (free)
"""

import base64
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from app.config import (
    _cloudflare_image_ready,
    get_creation_gemini_api_keys,
    get_creation_gemini_models,
    get_general_chat_gemini_api_keys,
    get_general_chat_gemini_models,
    get_image_gemini_api_key,
    get_image_generation_model_label,
    is_image_generation_ready,
    resolve_image_provider,
    settings,
)
from app.llm.ollama_client import LLMClient
from app.llm.openrouter_client import chat_openrouter
from app.middleware.rate_limiter import limiter
from app.schemas.creation import (
    ChatProvider,
    ChatRequest,
    ChatResponse,
    CreationIntent,
    CreationLanguageInfo,
    CreationModelsResponse,
    ImageGenerateRequest,
    ImageGenerateResponse,
    ModelInfo,
    SuggestContext,
    SuggestMode,
    SuggestRequest,
    SuggestResponse,
    VoiceGenerateRequest,
    VoiceGenerateResponse,
)
from app.services.image_generation import extract_image_prompt, generate_image
from app.services.media import MediaService
from app.data.creation_languages import list_creation_languages
from app.services.product_knowledge import (
    build_system_prompt,
    infer_prompt_media_type,
)
from app.services.voice_tts import (
    generate_voice_async,
    list_voice_providers,
)
from app.utils.exceptions import ContentGenerationError, LLMConnectionError
from app.utils.logger import logger

router = APIRouter()

chat_client = LLMClient()


def _creation_model_label() -> str:
    """Human-readable label for the Content Creation Gemini model."""
    name = settings.CREATION_GEMINI_MODEL.replace("gemini-", "Gemini ").replace("-", " ")
    return name.title()


def _openrouter_model_label() -> str:
    """UI label for the Claude dropdown (backed by OpenRouter Nemotron)."""
    return "Claude"


def _chatgpt_model_label() -> str:
    """UI label for the DeepSeek dropdown (backed by OpenRouter Gemma)."""
    return "DeepSeek"


def _normalize_source_media_path(raw: str) -> str:
    """Normalize client storage path to MediaService relative path (e.g. images/abc.jpg)."""
    path = (raw or "").strip()
    if not path:
        raise ContentGenerationError("source_media_path is empty")
    if path.startswith("http://") or path.startswith("https://"):
        raise ContentGenerationError("source_media_path must be a storage path, not a URL")
    path = path.lstrip("/")
    if path.startswith("uploads/"):
        path = path[len("uploads/") :]
    if not path or ".." in Path(path).parts:
        raise ContentGenerationError("Invalid source_media_path")
    return path


def _load_source_image_ref(media_path: str) -> dict[str, str]:
    """Load a prior generated upload as a Flux.2 reference image dict."""
    storage_path = _normalize_source_media_path(media_path)
    data = MediaService().download_file(storage_path)
    ext = Path(storage_path).suffix.lower()
    mime_by_ext = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    mime = mime_by_ext.get(ext, "image/jpeg")
    return {
        "image_base64": base64.b64encode(data).decode("ascii"),
        "image_mime_type": mime,
    }


def _resolve_media_url(media_url: str, request: Request) -> str:
    """Turn relative /uploads/ paths into absolute URLs for the frontend."""
    if not media_url:
        return media_url
    if media_url.startswith("http://") or media_url.startswith("https://"):
        return media_url
    # Railway/reverse proxies often expose http:// to the app while clients use https://
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    forwarded_host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    if forwarded_proto and forwarded_host:
        base = f"{forwarded_proto}://{forwarded_host}"
    else:
        base = str(request.base_url).rstrip("/")
    if media_url.startswith("/"):
        return f"{base}{media_url}"
    return f"{base}/{media_url}"


@router.get("/creation/models", response_model=CreationModelsResponse)
async def list_creation_models():
    """Return chat/image/voice capabilities and external video tool links."""
    image_ready = is_image_generation_ready()
    openrouter_ready = bool(settings.OPENROUTER_API_KEY.strip())
    chatgpt_ready = bool(settings.OPENROUTER_CHATGPT_API_KEY.strip())
    return CreationModelsResponse(
        models=[
            ModelInfo(id=settings.CREATION_GEMINI_MODEL, label=_creation_model_label()),
        ],
        gemini_web_url=settings.GEMINI_WEB_URL,
        meta_ai_web_url=settings.META_AI_WEB_URL,
        elevenlabs_web_url=settings.ELEVENLABS_WEB_URL,
        google_flow_characters_url=settings.GOOGLE_FLOW_CHARACTERS_URL,
        google_flow_final_product_url=settings.GOOGLE_FLOW_FINAL_PRODUCT_URL,
        chat_ready=bool(get_creation_gemini_api_keys()) or openrouter_ready or chatgpt_ready,
        openrouter_configured=openrouter_ready,
        openrouter_model=settings.OPENROUTER_CHAT_MODEL.strip() if openrouter_ready else "",
        openrouter_model_label=_openrouter_model_label() if openrouter_ready else "",
        chatgpt_configured=chatgpt_ready,
        chatgpt_model_label=_chatgpt_model_label() if chatgpt_ready else "",
        deepseek_configured=False,
        image_ready=image_ready,
        image_model=get_image_generation_model_label() if image_ready else "",
        image_provider=resolve_image_provider(),
        image_provider_configured=settings.IMAGE_PROVIDER,
        cloudflare_configured=_cloudflare_image_ready(),
        # Dedicated paid image key only — creation/chat keys do not count as "Gemini images ready".
        gemini_image_configured=bool(get_image_gemini_api_key()),
        creation_api_keys_loaded=len(get_creation_gemini_api_keys()),
        voice_ready=True,
        voice_moods=[],
        voice_characters=[],
        fish_voice_configured=bool(settings.OPENROUTER_FISH_API_KEY.strip()),
        voice_providers=list_voice_providers(
            fish_configured=bool(settings.OPENROUTER_FISH_API_KEY.strip())
        ),
        languages=[CreationLanguageInfo(**lang) for lang in list_creation_languages()],
    )


@router.post("/creation/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def creation_chat(request: Request, body: ChatRequest):
    """Chat via Gemini or OpenRouter (Claude dropdown → Nemotron free)."""
    try:
        if body.provider == ChatProvider.DEEPSEEK:
            raise HTTPException(
                status_code=402,
                detail="ChatGPT requires a paid API key.",
            )

        if body.provider == ChatProvider.CHATGPT and not settings.OPENROUTER_CHATGPT_API_KEY.strip():
            raise HTTPException(
                status_code=402,
                detail="You need to buy an API key for this model to work.",
            )

        if body.provider == ChatProvider.CLAUDE and not settings.OPENROUTER_API_KEY.strip():
            raise HTTPException(
                status_code=402,
                detail="You need to buy an API key for this model to work.",
            )

        last_user_text = ""
        has_reference_image = False
        reference_image_count = 0
        for m in reversed(body.messages):
            if m.role.value != "user":
                continue
            last_user_text = m.content
            if m.images:
                reference_image_count = sum(
                    1
                    for img in m.images[:5]
                    if img.image_base64 and img.image_base64.strip()
                )
            elif m.image_base64 and m.image_base64.strip():
                reference_image_count = 1
            has_reference_image = reference_image_count > 0
            break

        if body.provider == ChatProvider.CLAUDE and has_reference_image:
            raise HTTPException(
                status_code=400,
                    detail=(
                        "Claude is text-only right now. "
                        "Switch to Gemini or DeepSeek to analyze reference images."
                    ),
            )

        if body.intent == CreationIntent.CREATE_IMAGE:
            media_type = "image"
        elif body.intent == CreationIntent.CREATE_VOICE:
            media_type = None
        elif body.intent == CreationIntent.GENERAL_CHAT:
            media_type = None
        else:
            media_type = infer_prompt_media_type(last_user_text) if last_user_text else None

        system_prompt = build_system_prompt(
            media_type=media_type,
            intent=body.intent,
            has_reference_image=has_reference_image,
            language=body.language,
            reference_image_count=reference_image_count,
        )

        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        for m in body.messages:
            content = m.content
            image_entries: list[dict] = []
            if m.images:
                for img in m.images[:5]:
                    b64 = (img.image_base64 or "").strip()
                    if not b64:
                        continue
                    # ~25 MB binary ≈ 35M base64 chars; larger still OK after client compress.
                    if len(b64) > 35_000_000:
                        raise HTTPException(
                            status_code=400,
                            detail="One reference image is too large. Use images under 25 MB each.",
                        )
                    image_entries.append(
                        {
                            "image_base64": b64,
                            "image_mime_type": (img.image_mime_type or "image/jpeg").strip(),
                        }
                    )
            elif m.image_base64 and m.image_base64.strip():
                if len(m.image_base64) > 35_000_000:
                    raise HTTPException(
                        status_code=400,
                        detail="Reference image is too large. Use an image under 25 MB.",
                    )
                image_entries.append(
                    {
                        "image_base64": m.image_base64.strip(),
                        "image_mime_type": (m.image_mime_type or "image/jpeg").strip(),
                    }
                )

            # Explicit multi-image cue so the model knows how many visuals to analyze.
            if m.role.value == "user" and image_entries:
                n = len(image_entries)
                cue = (
                    f"[User attached {n} reference image{'s' if n != 1 else ''}. "
                    f"Analyze {'every image' if n > 1 else 'this image'} carefully, "
                    "follow the user's written request exactly, and respond accordingly.]"
                )
                content = f"{cue}\n\n{content}".strip() if content.strip() else cue

            entry: dict = {"role": m.role.value, "content": content}
            if image_entries:
                entry["images"] = image_entries
            messages.append(entry)

        if body.provider == ChatProvider.CLAUDE:
            reply, model = chat_openrouter(messages)
        elif body.provider == ChatProvider.CHATGPT:
            reply, model = chat_openrouter(
                messages,
                api_key=settings.OPENROUTER_CHATGPT_API_KEY,
                model=settings.OPENROUTER_CHATGPT_MODEL,
                include_images=True,
            )
        else:
            if body.intent == CreationIntent.GENERAL_CHAT:
                api_keys = get_general_chat_gemini_api_keys()
                models = get_general_chat_gemini_models()
            else:
                api_keys = get_creation_gemini_api_keys()
                models = get_creation_gemini_models()

            reply, model = chat_client.chat(
                messages,
                api_keys=api_keys,
                models=models,
            )

        return ChatResponse(
            model=model,
            reply=reply,
            matched_product=None,
            intent=body.intent,
        )

    except HTTPException:
        raise
    except LLMConnectionError as e:
        logger.error(f"Creation chat error: {str(e)}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Creation chat unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


def _suggest_system_prompt(
    mode: SuggestMode,
    context: SuggestContext,
    language: str,
) -> str:
    """Build a strict rewrite-only system prompt for Fix / Improve."""
    context_hint = {
        SuggestContext.CHAT: "This is a chat / prompt composer message.",
        SuggestContext.CAPTION_TITLE: "This is a short social-media caption title.",
        SuggestContext.CAPTION_BODY: (
            "This is a social-media caption body. Preserve hashtags, mentions, "
            "emojis, line breaks, and any call-to-action."
        ),
    }[context]

    if mode == SuggestMode.FIX:
        task = (
            "Correct spelling, grammar, and punctuation only. "
            "Do not change wording, tone, meaning, structure, or length "
            "beyond what is required for those corrections."
        )
    else:
        task = (
            "Improve clarity and wording for social media while keeping the same "
            "meaning, facts, brand voice, hashtags, mentions, and call-to-action. "
            "Do not add new claims or marketing fluff."
        )

    return (
        "You rewrite user text. "
        f"{context_hint} "
        f"{task} "
        f"Write the result in language code '{language}'. "
        "Return ONLY the rewritten text. "
        "No quotes, no markdown fences, no explanations, no preamble."
    )


def _clean_suggestion(raw: str, original: str) -> str:
    """Strip common model wrappers; fall back to original if empty."""
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in ('"', "'"):
        text = text[1:-1].strip()
    return text or original


@router.post("/creation/suggest", response_model=SuggestResponse)
@limiter.limit("30/minute")
async def creation_suggest(request: Request, body: SuggestRequest):
    """Return a fixed or improved version of the given text (rewrite only)."""
    _ = request
    try:
        api_keys = get_creation_gemini_api_keys()
        models = get_creation_gemini_models()
        if not api_keys:
            raise HTTPException(
                status_code=503,
                detail="Creation Gemini API key is not configured.",
            )

        system_prompt = _suggest_system_prompt(body.mode, body.context, body.language)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": body.text},
        ]
        reply, model = chat_client.chat(
            messages,
            api_keys=api_keys,
            models=models,
        )
        return SuggestResponse(
            suggestion=_clean_suggestion(reply, body.text),
            mode=body.mode,
            model=model,
        )
    except HTTPException:
        raise
    except LLMConnectionError as e:
        logger.error(f"Creation suggest error: {str(e)}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Creation suggest unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Suggestion failed: {str(e)}")


@router.post("/creation/generate-image", response_model=ImageGenerateResponse)
@limiter.limit("10/minute")
async def creation_generate_image(request: Request, body: ImageGenerateRequest):
    """Generate a product image via Cloudflare Flux (attachments → Flux.2 refs)."""
    try:
        prompt = extract_image_prompt(body.prompt)
        preferred = (body.provider or "").strip().lower() or None
        edit_mode = bool(body.edit_mode)
        reference_images: list[dict[str, str]] = []
        if body.source_media_path:
            reference_images.append(_load_source_image_ref(body.source_media_path))
            edit_mode = True
        if body.images:
            reference_images.extend(
                {
                    "image_base64": img.image_base64,
                    "image_mime_type": img.image_mime_type or "image/jpeg",
                }
                for img in body.images
                if (img.image_base64 or "").strip()
            )
        refs_for_gen = reference_images or None
        logger.info(
            f"/creation/generate-image requested provider={preferred!r} "
            f"refs={len(reference_images)} edit_mode={edit_mode} prompt_len={len(prompt)}"
        )
        result = generate_image(
            prompt,
            preferred_provider=preferred,
            reference_images=refs_for_gen,
            edit_mode=edit_mode,
        )
        return ImageGenerateResponse(
            media_path=result["media_path"],
            media_url=_resolve_media_url(result["media_url"], request),
            model=result["model"],
            provider=result.get("provider") or preferred or resolve_image_provider(),
            fallback_reason=result.get("fallback_reason"),
            caption=result.get("caption"),
        )
    except ContentGenerationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LLMConnectionError as e:
        provider = (body.provider or "").strip().lower() or resolve_image_provider()
        logger.error(f"Image generation error (provider={provider}): {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Image generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Image generation failed: {e}")


@router.get("/creation/image-diagnostics")
async def creation_image_diagnostics():
    """
    Report what the backend actually parsed for image generation.
    Secrets are masked — safe to expose. Use to debug why Cloudflare
    isn't active on production despite env vars being set.
    """
    def _mask(value: str) -> str:
        v = (value or "").strip()
        if not v:
            return ""
        if len(v) <= 8:
            return "*" * len(v)
        return f"{v[:4]}...{v[-4:]} (len={len(v)})"

    account_id = settings.CLOUDFLARE_ACCOUNT_ID
    api_token = settings.CLOUDFLARE_API_TOKEN
    return {
        "IMAGE_PROVIDER_raw": settings.IMAGE_PROVIDER,
        "resolved_provider": resolve_image_provider(),
        "image_model_label": get_image_generation_model_label(),
        "cloudflare": {
            "account_id_present": bool(account_id.strip()),
            "account_id_masked": _mask(account_id),
            "api_token_present": bool(api_token.strip()),
            "api_token_masked": _mask(api_token),
            "model": settings.CLOUDFLARE_IMAGE_MODEL,
            "ready": bool(account_id.strip() and api_token.strip()),
        },
        "creation_chat_keys_loaded": len(get_creation_gemini_api_keys()),
    }


@router.post("/creation/generate-voice", response_model=VoiceGenerateResponse)
@limiter.limit("15/minute")
async def creation_generate_voice(request: Request, body: VoiceGenerateRequest):
    """Generate voice-over MP3 via Edge TTS or Fish Audio."""
    provider = body.provider.strip().lower()
    if provider == "fish" and not settings.OPENROUTER_FISH_API_KEY.strip():
        raise HTTPException(
            status_code=402,
            detail="Fish Audio is not configured. Add OPENROUTER_FISH_API_KEY in backend .env.",
        )

    try:
        result = await generate_voice_async(
            body.text,
            language=body.language,
            provider=provider,  # type: ignore[arg-type]
        )
        return VoiceGenerateResponse(
            media_path=result["media_path"],
            media_url=_resolve_media_url(result["media_url"], request),
            mood=result["mood"],
            character=result.get("character", "auto"),
            provider=result.get("provider", provider),
            voice=result["voice"],
            script_preview=result["script_preview"],
        )
    except ContentGenerationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Voice generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Voice generation failed: {e}")
