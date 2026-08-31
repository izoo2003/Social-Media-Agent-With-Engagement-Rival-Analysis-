"""Voice-over character and tone selection must reach TTS, not stay prompt-guessed."""

import asyncio

from app.schemas.creation import VoiceGenerateRequest
from app.services.voice_tts import (
    _fish_styled_input,
    list_voice_characters,
    list_voice_moods,
    resolve_voice,
)


def test_models_helpers_expose_selectable_characters_and_moods():
    character_ids = {item["id"] for item in list_voice_characters()}
    mood_ids = {item["id"] for item in list_voice_moods()}
    assert {"male", "female"}.issubset(character_ids)
    assert {"professional", "calm", "energetic", "warm", "promo"}.issubset(mood_ids)


def test_creation_models_endpoint_returns_voice_options():
    from app.routes.creation import list_creation_models

    resp = asyncio.run(list_creation_models())
    assert {item["id"] for item in resp.voice_characters} >= {"male", "female"}
    assert {item["id"] for item in resp.voice_moods} >= {
        "professional",
        "calm",
        "energetic",
        "warm",
        "promo",
    }


def test_resolve_voice_honors_explicit_female_over_male_script():
    voice, _rate, _pitch, character = resolve_voice(
        language="en",
        mood="professional",
        character="female",
        hint_text="A man walks through the market and buys salt.",
    )
    assert character == "female"
    assert voice == "en-US-JennyNeural"


def test_resolve_voice_honors_explicit_male_over_female_script():
    voice, _rate, _pitch, character = resolve_voice(
        language="en",
        mood="calm",
        character="male",
        hint_text="She says welcome to our kitchen.",
    )
    assert character == "male"
    assert voice == "en-US-GuyNeural"


def test_resolve_voice_applies_energetic_delivery():
    _voice, rate, pitch, _character = resolve_voice(
        language="en",
        mood="energetic",
        character="female",
    )
    assert rate == "+22%"
    assert pitch == "+5Hz"


def test_fish_styled_input_uses_explicit_character_and_mood():
    styled, mood, character = _fish_styled_input(
        "Welcome to Kafi pink salt.",
        "A professional male announcer reads this.",
        mood="energetic",
        character="female",
    )
    assert mood == "energetic"
    assert character == "female"
    assert "female speaker" in styled
    assert "energetic" in styled.lower()
    assert ", male speaker" not in styled


def test_voice_generate_request_accepts_character_and_mood():
    body = VoiceGenerateRequest(
        text="Welcome to Kafi pink salt.",
        provider="edge",
        language="en",
        mood="warm",
        character="female",
    )
    assert body.mood == "warm"
    assert body.character == "female"
