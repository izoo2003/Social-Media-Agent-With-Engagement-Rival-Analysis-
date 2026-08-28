"""
KPI Guidelines — Gemini review of designer KPIs vs a 9-hour shift.

Uses posting/campaign Gemini keys. Looks at KPI totals plus recent published
posts (captions and, when possible, a few product images).
"""

from __future__ import annotations

import base64
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.config import get_posting_gemini_api_keys, get_posting_gemini_models
from app.llm.ollama_client import LLMClient
from app.services.kpi import KpiService
from app.services.media import MediaService
from app.utils.exceptions import ContentGenerationError, LLMConnectionError
from app.utils.logger import logger

SHIFT_HOURS = 9
MAX_POSTS = 12
MAX_REVIEW_IMAGES = 3
MAX_IMAGE_BYTES = 3_500_000

_MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

_VERDICT_LABELS = {
    "enough": "Enough for the shift",
    "partial": "Partial — more work would help",
    "not_enough": "Not enough for the shift",
}


def _compact_summary(summary: dict[str, Any]) -> dict[str, Any]:
    catalog = [
        {
            "key": m["key"],
            "label": m["label"],
            "auto": m.get("auto", 0),
            "manual": m.get("manual", 0),
            "total": m.get("total", 0),
            "breakdown": m.get("breakdown"),
        }
        for m in summary.get("catalog") or []
    ]
    custom = [
        {"name": c["name"], "manual": c.get("manual", 0), "total": c.get("total", 0)}
        for c in summary.get("custom") or []
    ]
    manual_notes = [
        {
            "metric": e.get("custom_name") or e.get("metric_key"),
            "quantity": e.get("quantity"),
            "note": e.get("note"),
            "occurred_on": str(e.get("occurred_on")),
        }
        for e in (summary.get("manual_entries") or [])[:20]
    ]
    return {
        "from": str(summary.get("from")),
        "to": str(summary.get("to")),
        "timezone": summary.get("timezone") or "Asia/Karachi",
        "catalog": catalog,
        "custom": custom,
        "manual_notes": manual_notes,
    }


def _load_review_images(posts: list[dict[str, Any]]) -> list[dict[str, str]]:
    images: list[dict[str, str]] = []
    media = MediaService()
    for post in posts:
        if len(images) >= MAX_REVIEW_IMAGES:
            break
        if (post.get("media_type") or "") != "image":
            continue
        path = (post.get("media_path") or "").strip()
        if not path:
            continue
        try:
            data = media.download_file(path)
        except (ContentGenerationError, OSError, Exception) as exc:
            logger.warning(f"KPI guidelines skipped image {path}: {exc}")
            continue
        if not data or len(data) > MAX_IMAGE_BYTES:
            continue
        ext = Path(path).suffix.lower()
        mime = _MIME_BY_EXT.get(ext, "image/jpeg")
        images.append(
            {
                "image_base64": base64.b64encode(data).decode("ascii"),
                "image_mime_type": mime,
                "content_id": str(post.get("id") or ""),
                "title": post.get("title") or "",
            }
        )
        post["image_reviewed"] = True
    return images


def _build_prompt(
    compact: dict[str, Any],
    posts: list[dict[str, Any]],
    *,
    shift_days: int,
    image_count: int,
) -> str:
    posts_for_prompt = [
        {k: v for k, v in p.items() if k != "media_path"}
        for p in posts
    ]
    return f"""You are a senior social-media design lead reviewing a graphic designer's
work for Kafi Commodities (Pakistani spice, rice, and chutney brand selling
internationally). Judge whether the recorded KPIs plus recent published posts
are enough for {shift_days} design shift(s) of {SHIFT_HOURS} hours each.

Benchmarks for ONE 9-hour designer shift (adjust if judging several days):
- Published posts/reels: 2–4 is a solid live output; 0–1 is light unless they
  spent the day producing many assets for later.
- Images generated (in-app or manual/Canva): 4–8 is typical for feed work.
- Voiceovers + scripts: expected when reels/videos went out.
- Posts scheduled: a healthy pipeline for the next day.
- Campaigns/rivals: strategic extras, not required every single shift.
- Manual KPI notes mean work done in Photoshop/Canva/other tools — count them.

KPI TOTALS (Auto from this agent + Manual the designer typed):
{json.dumps(compact, indent=2, default=str)}

RECENT PUBLISHED POSTS in this range (captions and media type).
{image_count} product image(s) may also be attached for visual review:
{json.dumps(posts_for_prompt, indent=2, default=str)}

If images are attached, comment on product clarity, brand look, text-on-image,
and whether they look ready for Instagram/Facebook/LinkedIn.

Return ONLY a JSON object (no markdown) with exactly these keys:
- "verdict": one of "enough", "partial", "not_enough"
- "summary": 2-4 sentences. Say clearly if the 9-hour shift(s) look filled or
  if more work is still needed.
- "more_needed": array of 0-6 short strings — concrete leftover tasks if output
  is light (empty array if the shift is enough).
- "improvements": array of 3-6 objects, each with:
    "area" (e.g. volume, mix, captions, visuals, scheduling),
    "finding" (what you noticed),
    "action" (what the designer should do next),
    "priority" ("high" | "medium" | "low")
- "post_notes": array of 0-5 objects about specific published posts, each with:
    "content_id" (number or null),
    "title" (post title),
    "comment" (how to improve that post/image/video)

Be direct and practical. Do not invent posts or KPIs that are not in the data.
If there are no published posts, still judge generation/scheduling KPIs."""


def _extract_json_object(raw: str) -> str:
    text = (raw or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


def parse_guidelines(raw: str) -> Optional[dict[str, Any]]:
    """Parse the Gemini JSON object. Returns None if unusable."""
    if not raw:
        return None
    text = _extract_json_object(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("KPI guidelines JSON parse failed")
        return None
    if not isinstance(data, dict):
        return None
    verdict = str(data.get("verdict") or "partial").strip().lower()
    if verdict not in _VERDICT_LABELS:
        verdict = "partial"
    improvements = []
    for item in data.get("improvements") or []:
        if not isinstance(item, dict):
            continue
        improvements.append(
            {
                "area": str(item.get("area") or "general")[:80],
                "finding": str(item.get("finding") or "")[:400],
                "action": str(item.get("action") or "")[:400],
                "priority": str(item.get("priority") or "medium").lower()[:12],
            }
        )
    more_needed = [
        str(x).strip()[:240]
        for x in (data.get("more_needed") or [])
        if str(x).strip()
    ]
    post_notes = []
    for item in data.get("post_notes") or []:
        if not isinstance(item, dict):
            continue
        cid = item.get("content_id")
        try:
            cid_int = int(cid) if cid is not None and str(cid).strip() else None
        except (TypeError, ValueError):
            cid_int = None
        post_notes.append(
            {
                "content_id": cid_int,
                "title": str(item.get("title") or "")[:200],
                "comment": str(item.get("comment") or "")[:400],
            }
        )
    summary = str(data.get("summary") or "").strip()
    if not summary:
        return None
    return {
        "verdict": verdict,
        "verdict_label": _VERDICT_LABELS[verdict],
        "summary": summary[:2000],
        "more_needed": more_needed[:8],
        "improvements": improvements[:8],
        "post_notes": post_notes[:6],
    }


def _public_reviewed_posts(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop local media paths before returning posts to the client."""
    return [
        {
            "id": p["id"],
            "title": p.get("title") or "",
            "body_preview": p.get("body_preview") or "",
            "platform": p.get("platform"),
            "media_type": p.get("media_type"),
            "occurred_on": p.get("occurred_on"),
            "image_reviewed": bool(p.get("image_reviewed")),
        }
        for p in posts
    ]


def generate_guidelines(
    db: Session,
    from_date: date,
    to_date: date,
) -> dict[str, Any]:
    if to_date < from_date:
        raise ValueError("to date must be on or after from date")

    service = KpiService(db)
    summary = service.get_summary(from_date, to_date)
    posts = service.list_published_posts(from_date, to_date, limit=MAX_POSTS)
    for post in posts:
        post["image_reviewed"] = False

    images = _load_review_images(posts)
    compact = _compact_summary(summary)
    shift_days = (to_date - from_date).days + 1
    prompt = _build_prompt(
        compact,
        posts,
        shift_days=shift_days,
        image_count=len(images),
    )

    keys = get_posting_gemini_api_keys()
    models = get_posting_gemini_models()
    client = LLMClient()
    used_model: Optional[str] = None
    raw = ""

    logger.info(
        "KPI guidelines: days=%s posts=%s images=%s",
        shift_days,
        len(posts),
        len(images),
    )

    try:
        if images:
            user_msg: dict[str, Any] = {
                "role": "user",
                "content": prompt,
                "images": [
                    {
                        "image_base64": img["image_base64"],
                        "image_mime_type": img["image_mime_type"],
                    }
                    for img in images
                ],
            }
            raw, used_model = client.chat(
                [
                    {
                        "role": "system",
                        "content": "Return only valid JSON. No markdown fences.",
                    },
                    user_msg,
                ],
                api_keys=keys,
                models=models,
            )
        else:
            raw = client.generate(
                prompt,
                temperature=0.35,
                max_output_tokens=4096,
                response_mime_type="application/json",
                api_keys=keys,
                models=models,
            )
            used_model = (models[0] if models else None)
    except LLMConnectionError as exc:
        logger.error(f"KPI guidelines LLM failed: {exc}")
        return {
            "from": from_date,
            "to": to_date,
            "timezone": "Asia/Karachi",
            "shift_hours": SHIFT_HOURS,
            "shift_days": shift_days,
            "verdict": "partial",
            "verdict_label": _VERDICT_LABELS["partial"],
            "summary": "",
            "more_needed": [],
            "improvements": [],
            "post_notes": [],
            "reviewed_posts": _public_reviewed_posts(posts),
            "images_reviewed": len(images),
            "generated_at": datetime.utcnow(),
            "model": None,
            "message": f"AI guidelines unavailable: {exc}",
        }

    parsed = parse_guidelines(raw)
    if not parsed:
        return {
            "from": from_date,
            "to": to_date,
            "timezone": "Asia/Karachi",
            "shift_hours": SHIFT_HOURS,
            "shift_days": shift_days,
            "verdict": "partial",
            "verdict_label": _VERDICT_LABELS["partial"],
            "summary": (raw or "")[:1500],
            "more_needed": [],
            "improvements": [],
            "post_notes": [],
            "reviewed_posts": _public_reviewed_posts(posts),
            "images_reviewed": len(images),
            "generated_at": datetime.utcnow(),
            "model": used_model,
            "message": "Could not parse structured guidelines; showing raw model output.",
        }

    return {
        "from": from_date,
        "to": to_date,
        "timezone": "Asia/Karachi",
        "shift_hours": SHIFT_HOURS,
        "shift_days": shift_days,
        "verdict": parsed["verdict"],
        "verdict_label": parsed["verdict_label"],
        "summary": parsed["summary"],
        "more_needed": parsed["more_needed"],
        "improvements": parsed["improvements"],
        "post_notes": parsed["post_notes"],
        "reviewed_posts": _public_reviewed_posts(posts),
        "images_reviewed": len(images),
        "generated_at": datetime.utcnow(),
        "model": used_model,
        "message": None,
    }
