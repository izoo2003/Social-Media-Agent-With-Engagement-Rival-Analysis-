"""
Pydantic Schemas - Content Creation (chatbot + image generation)
"""

from enum import Enum as PyEnum
from typing import Optional

from pydantic import BaseModel, Field


class ChatRole(str, PyEnum):
    """Chat message roles."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessage(BaseModel):
    """A single chat message."""

    role: ChatRole
    content: str


class ChatRequest(BaseModel):
    """Request body for the chatbot."""

    model: str = Field(default="", description="Ignored — chat uses GEMINI_MODEL from config.")
    messages: list[ChatMessage] = Field(..., min_length=1)


class MatchedProduct(BaseModel):
    """A product that was detected in the user's message."""

    id: str
    name: str
    brand: str
    category: str
    description: str
    packaging: list[str]


class ChatResponse(BaseModel):
    """Chatbot reply."""

    model: str
    reply: str
    matched_product: Optional[MatchedProduct] = None


class ModelInfo(BaseModel):
    """A selectable chat model."""

    id: str
    label: str


class CreationModelsResponse(BaseModel):
    """Available chat models + the Gemini web link for image/video."""

    models: list[ModelInfo]
    gemini_web_url: str
    chat_ready: bool
