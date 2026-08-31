"""
Voice-over generation via edge-tts (free, no API key).

Moods pick distinct voices + rate/pitch.
Optional character (male/female/kid) overrides the speaker; "auto" reads cues from text.
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path
from typing import Literal

import edge_tts

from app.config import settings
from app.data.creation_languages import get_language
from app.services.media import MediaService
from app.utils.exceptions import ContentGenerationError
from app.utils.logger import logger

VoiceMood = Literal["professional", "calm", "energetic", "warm", "promo"]
VoiceCharacter = Literal["auto", "male", "female", "kid"]
VoiceProvider = Literal["edge", "fish"]

# Mood delivery style (applied on top of the chosen voice for Edge TTS).
MOOD_PRESETS: dict[VoiceMood, dict[str, str]] = {
    "professional": {
        "rate": "+0%",
        "pitch": "+0Hz",
        "label": "Professional",
        "fish_cue": "professional clear narration",
    },
    "calm": {
        "rate": "-15%",
        "pitch": "-3Hz",
        "label": "Calm & soothing",
        "fish_cue": "calm soothing gentle tone",
    },
    "energetic": {
        "rate": "+22%",
        "pitch": "+5Hz",
        "label": "Energetic",
        "fish_cue": "energetic upbeat lively tone",
    },
    "warm": {
        "rate": "-8%",
        "pitch": "-1Hz",
        "label": "Warm & friendly",
        "fish_cue": "warm friendly inviting tone",
    },
    "promo": {
        "rate": "+25%",
        "pitch": "+4Hz",
        "label": "Promo / sales",
        "fish_cue": "promotional sales energetic announcer tone",
    },
}

# Per-language voice bank: mood voices + character overrides.
# Kid voices are rare on edge-tts; English uses AnaNeural, others pitch-shift female.
_LANGUAGE_VOICE_BANK: dict[str, dict] = {
    "en": {
        "moods": {
            "professional": "en-US-GuyNeural",
            "calm": "en-US-AriaNeural",
            "energetic": "en-US-JennyNeural",
            "warm": "en-GB-SoniaNeural",
            "promo": "en-US-DavisNeural",
        },
        "male": "en-US-GuyNeural",
        "female": "en-US-JennyNeural",
        "kid": "en-US-AnaNeural",
    },
    "ur": {
        "moods": {
            "professional": "ur-PK-AsadNeural",
            "calm": "ur-PK-UzmaNeural",
            "energetic": "ur-PK-UzmaNeural",
            "warm": "ur-PK-UzmaNeural",
            "promo": "ur-PK-AsadNeural",
        },
        "male": "ur-PK-AsadNeural",
        "female": "ur-PK-UzmaNeural",
        "kid": "ur-PK-UzmaNeural",
    },
    "ar": {
        "moods": {
            "professional": "ar-SA-HamedNeural",
            "calm": "ar-SA-ZariyahNeural",
            "energetic": "ar-SA-ZariyahNeural",
            "warm": "ar-SA-ZariyahNeural",
            "promo": "ar-SA-HamedNeural",
        },
        "male": "ar-SA-HamedNeural",
        "female": "ar-SA-ZariyahNeural",
        "kid": "ar-SA-ZariyahNeural",
    },
    "de": {
        "moods": {
            "professional": "de-DE-ConradNeural",
            "calm": "de-DE-KatjaNeural",
            "energetic": "de-DE-AmalaNeural",
            "warm": "de-DE-KatjaNeural",
            "promo": "de-DE-ConradNeural",
        },
        "male": "de-DE-ConradNeural",
        "female": "de-DE-KatjaNeural",
        "kid": "de-DE-KatjaNeural",
    },
    "es": {
        "moods": {
            "professional": "es-ES-AlvaroNeural",
            "calm": "es-ES-ElviraNeural",
            "energetic": "es-ES-ElviraNeural",
            "warm": "es-ES-ElviraNeural",
            "promo": "es-ES-AlvaroNeural",
        },
        "male": "es-ES-AlvaroNeural",
        "female": "es-ES-ElviraNeural",
        "kid": "es-ES-ElviraNeural",
    },
    "fr": {
        "moods": {
            "professional": "fr-FR-HenriNeural",
            "calm": "fr-FR-DeniseNeural",
            "energetic": "fr-FR-EloiseNeural",
            "warm": "fr-FR-DeniseNeural",
            "promo": "fr-FR-HenriNeural",
        },
        "male": "fr-FR-HenriNeural",
        "female": "fr-FR-DeniseNeural",
        "kid": "fr-FR-EloiseNeural",
    },
    "pt": {
        "moods": {
            "professional": "pt-BR-AntonioNeural",
            "calm": "pt-BR-FranciscaNeural",
            "energetic": "pt-BR-FranciscaNeural",
            "warm": "pt-BR-FranciscaNeural",
            "promo": "pt-BR-AntonioNeural",
        },
        "male": "pt-BR-AntonioNeural",
        "female": "pt-BR-FranciscaNeural",
        "kid": "pt-BR-FranciscaNeural",
    },
    "it": {
        "moods": {
            "professional": "it-IT-DiegoNeural",
            "calm": "it-IT-ElsaNeural",
            "energetic": "it-IT-IsabellaNeural",
            "warm": "it-IT-ElsaNeural",
            "promo": "it-IT-DiegoNeural",
        },
        "male": "it-IT-DiegoNeural",
        "female": "it-IT-ElsaNeural",
        "kid": "it-IT-ElsaNeural",
    },
    "ru": {
        "moods": {
            "professional": "ru-RU-DmitryNeural",
            "calm": "ru-RU-SvetlanaNeural",
            "energetic": "ru-RU-SvetlanaNeural",
            "warm": "ru-RU-SvetlanaNeural",
            "promo": "ru-RU-DmitryNeural",
        },
        "male": "ru-RU-DmitryNeural",
        "female": "ru-RU-SvetlanaNeural",
        "kid": "ru-RU-SvetlanaNeural",
    },
    "tr": {
        "moods": {
            "professional": "tr-TR-AhmetNeural",
            "calm": "tr-TR-EmelNeural",
            "energetic": "tr-TR-EmelNeural",
            "warm": "tr-TR-EmelNeural",
            "promo": "tr-TR-AhmetNeural",
        },
        "male": "tr-TR-AhmetNeural",
        "female": "tr-TR-EmelNeural",
        "kid": "tr-TR-EmelNeural",
    },
    "zh": {
        "moods": {
            "professional": "zh-CN-YunxiNeural",
            "calm": "zh-CN-XiaoxiaoNeural",
            "energetic": "zh-CN-XiaoyiNeural",
            "warm": "zh-CN-XiaoxiaoNeural",
            "promo": "zh-CN-YunxiNeural",
        },
        "male": "zh-CN-YunxiNeural",
        "female": "zh-CN-XiaoxiaoNeural",
        "kid": "zh-CN-XiaoyiNeural",
    },
    "ja": {
        "moods": {
            "professional": "ja-JP-KeitaNeural",
            "calm": "ja-JP-NanamiNeural",
            "energetic": "ja-JP-NanamiNeural",
            "warm": "ja-JP-NanamiNeural",
            "promo": "ja-JP-KeitaNeural",
        },
        "male": "ja-JP-KeitaNeural",
        "female": "ja-JP-NanamiNeural",
        "kid": "ja-JP-NanamiNeural",
    },
    "ko": {
        "moods": {
            "professional": "ko-KR-InJoonNeural",
            "calm": "ko-KR-SunHiNeural",
            "energetic": "ko-KR-SunHiNeural",
            "warm": "ko-KR-SunHiNeural",
            "promo": "ko-KR-InJoonNeural",
        },
        "male": "ko-KR-InJoonNeural",
        "female": "ko-KR-SunHiNeural",
        "kid": "ko-KR-SunHiNeural",
    },
    "nl": {
        "moods": {
            "professional": "nl-NL-MaartenNeural",
            "calm": "nl-NL-ColetteNeural",
            "energetic": "nl-NL-FennaNeural",
            "warm": "nl-NL-ColetteNeural",
            "promo": "nl-NL-MaartenNeural",
        },
        "male": "nl-NL-MaartenNeural",
        "female": "nl-NL-ColetteNeural",
        "kid": "nl-NL-FennaNeural",
    },
    "pl": {
        "moods": {
            "professional": "pl-PL-MarekNeural",
            "calm": "pl-PL-ZofiaNeural",
            "energetic": "pl-PL-ZofiaNeural",
            "warm": "pl-PL-ZofiaNeural",
            "promo": "pl-PL-MarekNeural",
        },
        "male": "pl-PL-MarekNeural",
        "female": "pl-PL-ZofiaNeural",
        "kid": "pl-PL-ZofiaNeural",
    },
    "id": {
        "moods": {
            "professional": "id-ID-ArdiNeural",
            "calm": "id-ID-GadisNeural",
            "energetic": "id-ID-GadisNeural",
            "warm": "id-ID-GadisNeural",
            "promo": "id-ID-ArdiNeural",
        },
        "male": "id-ID-ArdiNeural",
        "female": "id-ID-GadisNeural",
        "kid": "id-ID-GadisNeural",
    },
    "ms": {
        "moods": {
            "professional": "ms-MY-OsmanNeural",
            "calm": "ms-MY-YasminNeural",
            "energetic": "ms-MY-YasminNeural",
            "warm": "ms-MY-YasminNeural",
            "promo": "ms-MY-OsmanNeural",
        },
        "male": "ms-MY-OsmanNeural",
        "female": "ms-MY-YasminNeural",
        "kid": "ms-MY-YasminNeural",
    },
    "vi": {
        "moods": {
            "professional": "vi-VN-NamMinhNeural",
            "calm": "vi-VN-HoaiMyNeural",
            "energetic": "vi-VN-HoaiMyNeural",
            "warm": "vi-VN-HoaiMyNeural",
            "promo": "vi-VN-NamMinhNeural",
        },
        "male": "vi-VN-NamMinhNeural",
        "female": "vi-VN-HoaiMyNeural",
        "kid": "vi-VN-HoaiMyNeural",
    },
    "th": {
        "moods": {
            "professional": "th-TH-NiwatNeural",
            "calm": "th-TH-PremwadeeNeural",
            "energetic": "th-TH-PremwadeeNeural",
            "warm": "th-TH-PremwadeeNeural",
            "promo": "th-TH-NiwatNeural",
        },
        "male": "th-TH-NiwatNeural",
        "female": "th-TH-PremwadeeNeural",
        "kid": "th-TH-PremwadeeNeural",
    },
    "uk": {
        "moods": {
            "professional": "uk-UA-OstapNeural",
            "calm": "uk-UA-PolinaNeural",
            "energetic": "uk-UA-PolinaNeural",
            "warm": "uk-UA-PolinaNeural",
            "promo": "uk-UA-OstapNeural",
        },
        "male": "uk-UA-OstapNeural",
        "female": "uk-UA-PolinaNeural",
        "kid": "uk-UA-PolinaNeural",
    },
    "ro": {
        "moods": {
            "professional": "ro-RO-EmilNeural",
            "calm": "ro-RO-AlinaNeural",
            "energetic": "ro-RO-AlinaNeural",
            "warm": "ro-RO-AlinaNeural",
            "promo": "ro-RO-EmilNeural",
        },
        "male": "ro-RO-EmilNeural",
        "female": "ro-RO-AlinaNeural",
        "kid": "ro-RO-AlinaNeural",
    },
    "el": {
        "moods": {
            "professional": "el-GR-NestorasNeural",
            "calm": "el-GR-AthinaNeural",
            "energetic": "el-GR-AthinaNeural",
            "warm": "el-GR-AthinaNeural",
            "promo": "el-GR-NestorasNeural",
        },
        "male": "el-GR-NestorasNeural",
        "female": "el-GR-AthinaNeural",
        "kid": "el-GR-AthinaNeural",
    },
    "bn": {
        "moods": {
            "professional": "bn-BD-PradeepNeural",
            "calm": "bn-BD-NabanitaNeural",
            "energetic": "bn-BD-NabanitaNeural",
            "warm": "bn-BD-NabanitaNeural",
            "promo": "bn-BD-PradeepNeural",
        },
        "male": "bn-BD-PradeepNeural",
        "female": "bn-BD-NabanitaNeural",
        "kid": "bn-BD-NabanitaNeural",
    },
    "fa": {
        "moods": {
            "professional": "fa-IR-FaridNeural",
            "calm": "fa-IR-DilaraNeural",
            "energetic": "fa-IR-DilaraNeural",
            "warm": "fa-IR-DilaraNeural",
            "promo": "fa-IR-FaridNeural",
        },
        "male": "fa-IR-FaridNeural",
        "female": "fa-IR-DilaraNeural",
        "kid": "fa-IR-DilaraNeural",
    },
    "sw": {
        "moods": {
            "professional": "sw-KE-RafikiNeural",
            "calm": "sw-KE-ZuriNeural",
            "energetic": "sw-KE-ZuriNeural",
            "warm": "sw-KE-ZuriNeural",
            "promo": "sw-KE-RafikiNeural",
        },
        "male": "sw-KE-RafikiNeural",
        "female": "sw-KE-ZuriNeural",
        "kid": "sw-KE-ZuriNeural",
    },
}

VOICE_CHARACTERS: list[dict[str, str]] = [
    {"id": "auto", "label": "Auto (from prompt)"},
    {"id": "male", "label": "Male"},
    {"id": "female", "label": "Female"},
    {"id": "kid", "label": "Kid / child"},
]

VOICE_PROVIDERS: list[dict[str, str]] = [
    {"id": "edge", "label": "Gemini"},
    {"id": "fish", "label": "Fish Audio"},
]


def list_voice_moods() -> list[dict[str, str]]:
    return [{"id": "auto", "label": "Auto (from prompt)"}] + [
        {"id": mood, "label": preset["label"]} for mood, preset in MOOD_PRESETS.items()
    ]


def list_voice_characters() -> list[dict[str, str]]:
    return list(VOICE_CHARACTERS)


def list_voice_providers(*, fish_configured: bool = False) -> list[dict[str, str]]:
    providers = [{"id": "edge", "label": "Gemini"}]
    if fish_configured:
        providers.append({"id": "fish", "label": "Fish Audio"})
    else:
        providers.append({"id": "fish", "label": "Fish Audio (API key required)"})
    return providers


def detect_voice_mood(text: str) -> VoiceMood:
    """Infer delivery mood from prompt / script wording."""
    t = (text or "").lower()
    if re.search(
        r"\b(promo|promotional|sales|hard.?sell|call to action|buy now|limited time)\b",
        t,
    ):
        return "promo"
    if re.search(r"\b(energetic|upbeat|exciting|hype|lively|enthusiastic)\b", t):
        return "energetic"
    if re.search(r"\b(calm|soothing|soft|peaceful|relaxing|gentle|serene)\b", t):
        return "calm"
    if re.search(r"\b(warm|friendly|cozy|heartfelt|caring)\b", t):
        return "warm"
    if re.search(r"\b(professional|corporate|formal|business|clean)\b", t):
        return "professional"
    return "professional"


def extract_voice_script(text: str) -> str:
    """Use narration-friendly text from an assistant reply."""
    if not text.strip():
        raise ContentGenerationError("No script text provided.")

    patterns = [
        r"\*\*Voice-over script:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n---|\Z)",
        r"\*\*Voice[/-]?over script:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n---|\Z)",
        r"\*\*Narration:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n---|\Z)",
        r"\*\*Script:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n---|\Z)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            script = match.group(1).strip()
            if script:
                return script[:5000]

    # Strip markdown formatting for a readable default script
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    cleaned = re.sub(r"^---\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()
    if len(cleaned) > 5000:
        cleaned = cleaned[:5000]
    return cleaned


def detect_voice_character(text: str) -> VoiceCharacter | None:
    """Infer male/female/kid from prompt or script wording."""
    t = (text or "").lower()
    if re.search(
        r"\b(kid|kids|child|children|childlike|little (girl|boy)|young child|"
        r"children'?s voice|kid'?s? voice|child voice)\b",
        t,
    ):
        return "kid"
    if re.search(
        r"\b(female|woman|women|girl|lady|ladies|she\b|her voice|female voice|"
        r"woman'?s? voice|girl'?s? voice)\b",
        t,
    ):
        return "female"
    if re.search(
        r"\b(male|man|men|boy|gentleman|he\b|his voice|male voice|"
        r"man'?s? voice|boy'?s? voice)\b",
        t,
    ):
        return "male"
    return None


def _adjust_pitch(base_pitch: str, delta_hz: int) -> str:
    """Shift a pitch string like '+0Hz' / '-2Hz' by delta_hz."""
    match = re.fullmatch(r"([+-]?\d+)Hz", base_pitch.strip())
    if not match:
        return base_pitch
    return f"{int(match.group(1)) + delta_hz:+d}Hz"


def resolve_voice(
    *,
    language: str,
    mood: VoiceMood,
    character: VoiceCharacter = "auto",
    hint_text: str = "",
) -> tuple[str, str, str, VoiceCharacter]:
    """
    Pick edge-tts voice + rate + pitch.

    Returns (voice_id, rate, pitch, resolved_character).
    """
    lang = get_language(language)
    code = lang["code"]
    bank = _LANGUAGE_VOICE_BANK.get(code, {})
    moods = bank.get("moods") or {}
    preset = MOOD_PRESETS.get(mood, MOOD_PRESETS["professional"])
    rate = preset["rate"]
    pitch = preset["pitch"]

    resolved: VoiceCharacter = character
    if character == "auto":
        detected = detect_voice_character(hint_text)
        resolved = detected or "auto"

    if resolved in ("male", "female", "kid") and bank.get(resolved):
        voice = bank[resolved]
        # Soften/raise kid delivery when using an adult female stand-in.
        if resolved == "kid" and voice != "en-US-AnaNeural":
            pitch = _adjust_pitch(pitch, 6)
            if rate.startswith("+"):
                # Keep kids a bit quicker/lighter without blowing past energetic.
                pass
            else:
                pitch = _adjust_pitch(pitch, 2)
    else:
        voice = moods.get(mood) or lang["tts_voice"]

    return voice, rate, pitch, resolved if resolved != "auto" else "auto"


async def _synthesize_to_bytes(
    text: str,
    mood: VoiceMood,
    language: str = "en",
    character: VoiceCharacter = "auto",
    hint_text: str = "",
) -> tuple[bytes, str, VoiceCharacter]:
    voice, rate, pitch, resolved = resolve_voice(
        language=language,
        mood=mood,
        character=character,
        hint_text=hint_text or text,
    )
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
    )

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        await communicate.save(str(tmp_path))
        data = tmp_path.read_bytes()
        if not data:
            raise ContentGenerationError("Voice synthesis returned empty audio.")
        return data, voice, resolved
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def _fish_styled_input(
    script: str,
    hint_text: str,
    mood: VoiceMood | None = None,
    character: VoiceCharacter = "auto",
) -> tuple[str, VoiceMood, VoiceCharacter]:
    """
    Build Fish Audio input with natural-language style cues.

    Explicit mood/character from the UI win; otherwise infer from hint_text.
    """
    resolved_mood: VoiceMood = mood if mood in MOOD_PRESETS else detect_voice_mood(hint_text)
    resolved_character: VoiceCharacter = character
    if character == "auto":
        resolved_character = detect_voice_character(hint_text) or "auto"
    cue_parts = [MOOD_PRESETS[resolved_mood].get("fish_cue", "natural narration")]
    if resolved_character == "female":
        cue_parts.append("female speaker")
    elif resolved_character == "male":
        cue_parts.append("male speaker")
    elif resolved_character == "kid":
        cue_parts.append("child kid voice")
    cue = ", ".join(cue_parts)
    styled = f"({cue})\n{script}"
    return styled, resolved_mood, resolved_character


async def generate_voice_async(
    text: str,
    mood: VoiceMood | None = None,
    language: str = "en",
    character: VoiceCharacter = "auto",
    provider: VoiceProvider = "edge",
) -> dict:
    """Generate MP3 voice-over and store via MediaService."""
    script = extract_voice_script(text)
    if len(script.strip()) < 3:
        raise ContentGenerationError("Script is too short for voice generation.")

    lang = get_language(language)
    resolved_mood: VoiceMood = mood if mood in MOOD_PRESETS else detect_voice_mood(text)
    resolved_character: VoiceCharacter = character if character in ("male", "female", "kid") else "auto"
    if resolved_character == "auto":
        resolved_character = detect_voice_character(text) or "auto"

    logger.info(
        f"Generating voice-over (provider={provider}, mood={resolved_mood}, "
        f"character={resolved_character}, language={lang['code']}, chars={len(script)})"
    )

    try:
        if provider == "fish":
            from app.llm.openrouter_tts import synthesize_openrouter_speech

            styled, resolved_mood, resolved_character = _fish_styled_input(
                script,
                text,
                mood=resolved_mood,
                character=resolved_character,
            )
            audio_bytes = synthesize_openrouter_speech(styled)
            voice_id = settings.OPENROUTER_FISH_MODEL.strip() or "fish-audio"
        else:
            audio_bytes, voice_id, resolved_character = await _synthesize_to_bytes(
                script,
                resolved_mood,
                language=lang["code"],
                character=resolved_character,
                hint_text=text,
            )
    except ContentGenerationError:
        raise
    except Exception as exc:
        raise ContentGenerationError(
            f"Voice generation failed. If this repeats, wait a few seconds and retry. ({exc})"
        ) from exc

    media_service = MediaService()
    stored = media_service.save_bytes(
        audio_bytes,
        extension=".mp3",
        media_type="audio",
        original_name=f"voiceover-{provider}-{resolved_mood}.mp3",
        validate=False,
    )

    return {
        "media_path": stored["media_path"],
        "media_url": stored["media_url"],
        "mood": resolved_mood,
        "character": resolved_character if resolved_character != "auto" else "auto",
        "provider": provider,
        "voice": voice_id,
        "script_preview": script[:200] + ("…" if len(script) > 200 else ""),
    }
