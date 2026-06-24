"""
API Routes - Content Creation (chatbot)
GET  /creation/models - Chat model info + Gemini web link
POST /creation/chat   - Chat via dedicated CREATION_GEMINI_API_KEY

Image and video creation open Google Gemini in the browser (GEMINI_WEB_URL).

Product Knowledge:
  Every chat request is checked against the Kafi Commodities / Essence product
  catalog.  If the latest user message mentions a known product, a system prompt
  with the product's full details is prepended so Gemini answers accurately.
  The matched product is also returned in the response for the frontend to
  display a highlighted product card.
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
from app.services.product_knowledge import build_system_prompt, product_for_query
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
    """Return the Content Creation chat model and the Gemini web link for image/video."""
    return CreationModelsResponse(
        models=[
            ModelInfo(id=settings.CREATION_GEMINI_MODEL, label=_creation_model_label()),
        ],
        gemini_web_url=settings.GEMINI_WEB_URL,
        chat_ready=bool(settings.CREATION_GEMINI_API_KEY),
    )


@router.post("/creation/chat", response_model=ChatResponse)
async def creation_chat(request: ChatRequest):
    """
    Chat with Google Gemini using CREATION_GEMINI_API_KEY.

    Automatically detects Kafi Commodities / Essence product mentions in the
    latest user message, injects a product-aware system prompt, and returns
    the matched product alongside the reply for frontend highlighting.
    """
    try:
        # Find the last user message to check for product mentions
        last_user_text = ""
        for m in reversed(request.messages):
            if m.role.value == "user":
                last_user_text = m.content
                break

        # Detect product from user's latest message
        matched = product_for_query(last_user_text) if last_user_text else None

        # Build system prompt (product-specific if matched, generic overview otherwise)
        system_prompt = build_system_prompt(matched)

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
