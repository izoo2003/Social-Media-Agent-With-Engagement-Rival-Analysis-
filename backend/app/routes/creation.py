"""
API Routes - Content Creation (chatbot)
GET  /creation/models - Chat model info + Meta AI web link
POST /creation/chat   - Chat via dedicated CREATION_GEMINI_API_KEY

The chatbot writes copy-paste-ready image/video prompts for Meta AI, grounded in
the Essence product catalog (packaging, descriptions). Actual generation happens in Meta AI.

Product Knowledge:
  Detects product mentions in the latest user message, injects catalog context into
  the system prompt, and returns matched_product for the frontend product card.
"""

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.llm.ollama_client import LLMClient
from app.schemas.creation import (
    ChatRequest,
    ChatResponse,
    CreationModelsResponse,
    MatchedProduct,
    ModelInfo,
)
from app.services.product_knowledge import (
    build_system_prompt,
    infer_prompt_media_type,
    product_for_query,
)
from app.utils.exceptions import LLMConnectionError
from app.utils.logger import logger

router = APIRouter()

chat_client = LLMClient()


def _creation_model_label() -> str:
    """Human-readable label for the Content Creation Gemini model."""
    name = settings.CREATION_GEMINI_MODEL.replace("gemini-", "Gemini ").replace("-", " ")
    return name.title()


@router.get("/creation/models", response_model=CreationModelsResponse)
async def list_creation_models():
    """Return the Content Creation chat model and the Meta AI link for image/video."""
    return CreationModelsResponse(
        models=[
            ModelInfo(id=settings.CREATION_GEMINI_MODEL, label=_creation_model_label()),
        ],
        gemini_web_url=settings.GEMINI_WEB_URL,
        meta_ai_web_url=settings.META_AI_WEB_URL,
        elevenlabs_web_url=settings.ELEVENLABS_WEB_URL,
        google_flow_characters_url=settings.GOOGLE_FLOW_CHARACTERS_URL,
        google_flow_final_product_url=settings.GOOGLE_FLOW_FINAL_PRODUCT_URL,
        chat_ready=bool(settings.CREATION_GEMINI_API_KEY),
    )


@router.post("/creation/chat", response_model=ChatResponse)
async def creation_chat(request: ChatRequest):
    """
    Chat with Google Gemini using CREATION_GEMINI_API_KEY.

    Detects Essence product mentions, injects catalog-aware prompt-engineering
    instructions, and returns Meta AI-ready image/video prompts.
    """
    try:
        # Find the last user message to check for product mentions
        last_user_text = ""
        for m in reversed(request.messages):
            if m.role.value == "user":
                last_user_text = m.content
                break

        matched = product_for_query(last_user_text) if last_user_text else None
        media_type = infer_prompt_media_type(last_user_text) if last_user_text else None
        system_prompt = build_system_prompt(matched, media_type=media_type)

        # Prepend system message to the conversation
        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        messages += [{"role": m.role.value, "content": m.content} for m in request.messages]

        reply, model = chat_client.chat(
            messages,
            api_key=settings.CREATION_GEMINI_API_KEY,
            model=settings.CREATION_GEMINI_MODEL,
            fallback_model=settings.CREATION_GEMINI_FALLBACK_MODEL,
        )

        # Build the optional MatchedProduct payload for the frontend
        matched_product_payload: MatchedProduct | None = None
        if matched:
            matched_product_payload = MatchedProduct(
                id=matched["id"],
                name=matched["name"],
                brand=matched.get("brand", "Essence"),
                category=matched.get("category", ""),
                description=matched.get("description", ""),
                packaging=matched.get("packaging", []),
            )

        return ChatResponse(model=model, reply=reply, matched_product=matched_product_payload)

    except LLMConnectionError as e:
        logger.error(f"Creation chat error: {str(e)}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Creation chat unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")
