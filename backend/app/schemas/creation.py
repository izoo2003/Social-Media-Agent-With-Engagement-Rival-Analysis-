"""
Pydantic Schemas - Content Creation (chatbot + image generation)
"""

from enum import Enum as PyEnum
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.data.creation_languages import normalize_language_code


class CreationIntent(str, PyEnum):
    """What the user wants Prompt Studio to do for this message."""

    PROMPT = "prompt"  # write prompts (default)
    CREATE_IMAGE = "create_image"  # build prompt + in-app Gemini image
    CREATE_VOICE = "create_voice"  # build script + in-app TTS
    VIDEO_PROMPT = "video_prompt"  # Meta AI / Flow video prompts only
    GENERAL_CHAT = "general_chat"  # normal Q&A chatbot (any topic)


class ChatRole(str, PyEnum):
    """Chat message roles."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class ChatImageAttachment(BaseModel):
    """One reference image attached to a user chat message."""

    image_base64: str = Field(
        ...,
        description="Base64 image bytes (no data-URL prefix). Max ~4MB decoded.",
    )
    image_mime_type: Optional[str] = Field(
        default="image/jpeg",
        description="e.g. image/jpeg, image/png, image/webp",
    )


class ChatMessage(BaseModel):
    """A single chat message."""

    role: ChatRole
    content: str
    # Optional reference image (user messages only) — sent to Gemini vision for prompt writing.
    # Prefer `images` for multiple attachments; single fields kept for backward compatibility.
    image_base64: Optional[str] = Field(
        default=None,
        description="Base64 image bytes (no data-URL prefix). Max ~4MB decoded.",
    )
    image_mime_type: Optional[str] = Field(
        default=None,
        description="e.g. image/jpeg, image/png, image/webp",
    )
    images: Optional[list[ChatImageAttachment]] = Field(
        default=None,
        max_length=5,
        description="Up to 5 reference images for vision-based prompt writing.",
    )


class CreationLanguageInfo(BaseModel):
    """A selectable output language for Prompt Studio."""

    code: str
    label: str
    speech_lang: str


class ChatProvider(str, PyEnum):
    """UI chat-model dropdown value."""

    GEMINI = "gemini"
    CHATGPT = "chatgpt"
    DEEPSEEK = "deepseek"
    CLAUDE = "claude"  # wired to OpenRouter (Nemotron free) when configured


class ChatRequest(BaseModel):
    """Request body for the chatbot."""

    model: str = Field(default="", description="Ignored — chat uses configured provider models.")
    provider: ChatProvider = Field(
        default=ChatProvider.GEMINI,
        description="UI model dropdown: gemini | chatgpt | deepseek | claude.",
    )
    intent: CreationIntent = Field(
        default=CreationIntent.PROMPT,
        description=(
            "User-selected mode: prompt, create_image, create_voice, "
            "video_prompt, or general_chat."
        ),
    )
    language: str = Field(
        default="en",
        description="ISO-style language code for assistant replies (e.g. en, ur, de).",
    )
    messages: list[ChatMessage] = Field(..., min_length=1)

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        return normalize_language_code(value)


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
    intent: CreationIntent = CreationIntent.PROMPT


class ModelInfo(BaseModel):
    """A selectable chat model."""

    id: str
    label: str


class CreationModelsResponse(BaseModel):
    """Available chat models + generation capabilities."""

    models: list[ModelInfo]
    gemini_web_url: str
    meta_ai_web_url: str = "https://www.meta.ai/"
    elevenlabs_web_url: str = "https://elevenlabs.io/app/speech-synthesis/text-to-speech"
    google_flow_characters_url: str = (
        "https://labs.google/fx/tools/flow/project/cc16a3ce-33ec-4248-bb1a-3341c7817479/characters"
    )
    google_flow_final_product_url: str = (
        "https://labs.google/fx/tools/flow/project/0b5aa7ed-bd40-490d-af9a-24208f855710"
    )
    chat_ready: bool
    openrouter_configured: bool = False
    openrouter_model: str = ""
    openrouter_model_label: str = ""
    chatgpt_configured: bool = False
    chatgpt_model_label: str = ""
    deepseek_configured: bool = False
    image_ready: bool = False
    image_model: str = ""
    image_provider: str = ""
    image_provider_configured: str = ""
    cloudflare_configured: bool = False
    gemini_image_configured: bool = False
    creation_api_keys_loaded: int = 0
    voice_ready: bool = True
    voice_moods: list[dict[str, str]] = Field(default_factory=list)
    voice_characters: list[dict[str, str]] = Field(default_factory=list)
    voice_providers: list[dict[str, str]] = Field(default_factory=list)
    fish_voice_configured: bool = False
    languages: list[CreationLanguageInfo] = Field(default_factory=list)


class ImageGenerateRequest(BaseModel):
    """Generate an image from prompt text (usually extracted from chat reply)."""

    prompt: str = Field(..., min_length=3, max_length=8000)
    provider: Optional[str] = Field(
        default=None,
        description="Optional override: cloudflare | gemini | modelslab. Defaults to IMAGE_PROVIDER.",
    )
    images: Optional[list[ChatImageAttachment]] = Field(
        default=None,
        max_length=5,
        description=(
            "Optional product/logo reference images. Sent to Cloudflare Flux.2 as "
            "input_image_0… so packaging/logo stay faithful to the attachment."
        ),
    )


class ImageGenerateResponse(BaseModel):
    media_path: str
    media_url: str
    model: str
    provider: str = Field(
        default="",
        description="Image backend used: gemini | cloudflare | modelslab",
    )
    fallback_reason: Optional[str] = Field(
        default=None,
        description="If Cloudflare was used as fallback, explains why.",
    )
    caption: Optional[str] = None


class VoiceGenerateRequest(BaseModel):
    """Generate voice-over from script text."""

    text: str = Field(..., min_length=3, max_length=5000)
    provider: str = Field(
        default="edge",
        description="Voice engine: edge (free Edge TTS) | fish (Fish Audio via OpenRouter).",
    )
    language: str = Field(
        default="en",
        description="Language code for TTS voice selection (matches Prompt Studio language).",
    )
    # Kept for backward compatibility; ignored — tone/character come from the prompt text.
    mood: str = Field(default="professional", description="Ignored — detected from prompt.")
    character: str = Field(default="auto", description="Ignored — detected from prompt.")

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        return normalize_language_code(value)

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        cleaned = (value or "edge").strip().lower()
        if cleaned not in {"edge", "fish"}:
            raise ValueError("Invalid provider. Choose: edge | fish")
        return cleaned


class VoiceGenerateResponse(BaseModel):
    media_path: str
    media_url: str
    mood: str
    character: str = "auto"
    provider: str = "edge"
    voice: str
    script_preview: str


class SuggestMode(str, PyEnum):
    """How aggressively to rewrite the user's text."""

    FIX = "fix"  # spelling / grammar only
    IMPROVE = "improve"  # clearer wording, keep meaning


class SuggestContext(str, PyEnum):
    """Where the text came from — steers tone slightly."""

    CHAT = "chat"
    CAPTION_TITLE = "caption_title"
    CAPTION_BODY = "caption_body"


class SuggestRequest(BaseModel):
    """Request body for AI fix / improve suggestions."""

    text: str = Field(..., min_length=1, max_length=4000)
    mode: SuggestMode = SuggestMode.FIX
    context: SuggestContext = SuggestContext.CHAT
    language: str = Field(
        default="en",
        description="ISO-style language code for the suggestion (e.g. en, ur, de).",
    )

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        return normalize_language_code(value)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("Text cannot be empty.")
        return cleaned


class SuggestResponse(BaseModel):
    """AI-suggested rewrite of the user's text."""

    suggestion: str
    mode: SuggestMode
    model: str
