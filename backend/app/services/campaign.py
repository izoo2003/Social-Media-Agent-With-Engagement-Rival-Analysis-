"""
Campaign planning service.

Generates multi-day content timelines via Gemini (structured JSON), stores them
as Campaign + CampaignItem rows, and commits items into Content + CalendarEvent
for the existing auto-publisher. All planning times use Asia/Karachi (PKT);
calendar storage remains naive UTC.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from app.database.models import (
    Campaign,
    CampaignAssetType,
    CampaignItem,
    CampaignStatus,
    Content,
    ContentPlatform,
    ContentStatus,
)
from app.llm.ollama_client import LLMClient, LLMConnectionError
from app.config import get_campaign_gemini_slots
from app.schemas.calendar import CalendarEventCreate
from app.schemas.campaign import CampaignPlanRequest
from app.schemas.content import ContentPlatform as PlatformEnum
from app.services.calendar import CalendarService, as_aware_utc, to_naive_utc
from app.utils.logger import logger

PKT = ZoneInfo("Asia/Karachi")
CAMPAIGN_TZ = "Asia/Karachi"

# International-reach posting windows in Pakistan Standard Time (Karachi).
# Chosen to overlap Gulf midday, EU lunch/afternoon, and US morning/evening.
PKT_POSTING_WINDOWS: list[time] = [
    time(13, 0),   # Gulf midday / early EU
    time(16, 0),   # EU afternoon
    time(20, 0),   # US morning East Coast
    time(21, 0),   # US mid-morning / West early
    time(22, 0),   # US West Coast morning
]

VALID_ASSET_TYPES = {a.value for a in CampaignAssetType}


def _parse_llm_json(raw: str) -> Any:
    """Parse Gemini JSON, tolerating fenced markdown wrappers."""
    text = (raw or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


def _snap_to_window(local_dt: datetime) -> datetime:
    """Snap a PKT datetime to the nearest configured posting window on that day."""
    if local_dt.tzinfo is None:
        local_dt = local_dt.replace(tzinfo=PKT)
    else:
        local_dt = local_dt.astimezone(PKT)

    day = local_dt.date()
    candidates = [
        datetime.combine(day, w, tzinfo=PKT) for w in PKT_POSTING_WINDOWS
    ]
    return min(candidates, key=lambda c: abs((c - local_dt).total_seconds()))


# Prefer one post per day. Extra AI items become a 2nd slot on some days,
# still spanning the full duration — never 2/day for half the window.
MAX_POSTS_PER_DAY = 2


def assign_campaign_day_indices(count: int, duration_days: int) -> list[int]:
    """Spread `count` posts across days 0..duration_days-1, covering the last day."""
    if count <= 0 or duration_days <= 0:
        return []

    if count == 1:
        return [0]

    if count <= duration_days:
        raw = [
            int(round(i * (duration_days - 1) / (count - 1)))
            for i in range(count)
        ]
        used: set[int] = set()
        unique: list[int] = []
        for idx in raw:
            idx = max(0, min(idx, duration_days - 1))
            if idx in used:
                shifted = next(
                    (
                        candidate
                        for candidate in list(range(idx + 1, duration_days))
                        + list(range(idx - 1, -1, -1))
                        if candidate not in used
                    ),
                    idx,
                )
                idx = shifted
            used.add(idx)
            unique.append(idx)
        unique.sort()
        return unique

    base, extra = divmod(count, duration_days)
    extra_days = set(assign_campaign_day_indices(extra, duration_days)) if extra else set()
    result: list[int] = []
    for day in range(duration_days):
        copies = base + (1 if day in extra_days else 0)
        result.extend([day] * copies)
    while len(result) < count:
        result.append(len(result) % duration_days)
    return result[:count]


def _windows_for_day_count(n: int) -> list[time]:
    """Pick distinct PKT posting windows for n posts on the same calendar day."""
    n = max(1, n)
    windows = PKT_POSTING_WINDOWS
    if n == 1:
        return [windows[2]]  # 20:00 — strongest international overlap
    if n == 2:
        return [windows[0], windows[2]]  # 13:00 and 20:00
    if n >= len(windows):
        return [windows[i % len(windows)] for i in range(n)]
    picks = [
        int(round(i * (len(windows) - 1) / (n - 1)))
        for i in range(n)
    ]
    return [windows[i] for i in picks]


def spread_campaign_schedule(
    items: list,
    *,
    start_date: date,
    duration_days: int,
) -> list:
    """Rewrite item datetimes so posts span the full campaign window."""
    if not items or duration_days < 1:
        return items

    items.sort(
        key=lambda i: (
            getattr(i, "scheduled_at_utc", None) or datetime.min,
            getattr(i, "sort_order", 0),
        )
    )
    cap = duration_days * MAX_POSTS_PER_DAY
    if len(items) > cap:
        del items[cap:]

    day_indices = assign_campaign_day_indices(len(items), duration_days)
    per_day = Counter(day_indices)
    windows_by_day = {
        day: _windows_for_day_count(per_day[day]) for day in per_day
    }
    slot_on_day: Counter[int] = Counter()

    for item, day_index in zip(items, day_indices):
        slot = slot_on_day[day_index]
        slot_on_day[day_index] += 1
        windows = windows_by_day[day_index]
        clock = windows[min(slot, len(windows) - 1)]
        local_dt = datetime.combine(
            start_date + timedelta(days=day_index),
            clock,
            tzinfo=PKT,
        )
        utc_dt = local_dt.astimezone(timezone.utc)
        item.day_index = day_index
        item.scheduled_at_utc = to_naive_utc(utc_dt)
        item.scheduled_at_pkt = local_dt.isoformat()

    for i, item in enumerate(items):
        item.sort_order = i
    return items


def _build_summary(items: list[CampaignItem]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for item in items:
        counts[item.asset_type or CampaignAssetType.POST_IMAGE.value] += 1
    return dict(counts)


def _default_campaign_name(req: CampaignPlanRequest) -> str:
    cats = sorted({p.category for p in req.products})
    label = ", ".join(cats[:3])
    if len(cats) > 3:
        label += f" +{len(cats) - 3}"
    return f"Campaign · {label} · {req.start_date.isoformat()}"


class CampaignService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------ Query

    def list_campaigns(self, skip: int = 0, limit: int = 50) -> list[Campaign]:
        return (
            self.db.query(Campaign)
            .options(joinedload(Campaign.items))
            .order_by(Campaign.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_campaign(self, campaign_id: int) -> Optional[Campaign]:
        return (
            self.db.query(Campaign)
            .options(joinedload(Campaign.items))
            .filter(Campaign.id == campaign_id)
            .first()
        )

    def delete_campaign(self, campaign_id: int) -> bool:
        campaign = self.get_campaign(campaign_id)
        if not campaign:
            return False
        if campaign.status == CampaignStatus.COMMITTED.value:
            # Keep Content/Calendar; only remove campaign rows (unlink items first).
            for item in campaign.items:
                item.content_id = None
                item.calendar_event_id = None
            self.db.flush()
        self.db.delete(campaign)
        self.db.commit()
        return True

    # ------------------------------------------------------------------ Plan

    def plan_campaign(self, request: CampaignPlanRequest) -> Campaign:
        platforms = [p.value for p in request.platforms]
        if not platforms:
            raise ValueError("Select at least one platform")

        products_payload = [
            {"category": p.category, "product": p.product}
            for p in request.products
        ]

        prompt = self._build_prompt(request, platforms, products_payload)
        logger.info(
            "Generating campaign plan via Gemini (days=%s, products=%s, platforms=%s)",
            request.duration_days,
            len(products_payload),
            platforms,
        )

        try:
            slots = get_campaign_gemini_slots()
            if not slots:
                raise ValueError(
                    "Campaign Gemini keys not configured. "
                    "Set CAMPAIGN_GEMINI_API_KEY (and optional _2) in .env / Railway."
                )
            logger.info(
                "Campaign Gemini slots: %s",
                ", ".join(
                    f"{s['label']}({len(s['models'])} models)" for s in slots
                ),
            )
            raw = LLMClient().generate(
                prompt,
                temperature=0.5,
                max_output_tokens=8192,
                response_mime_type="application/json",
                slots=slots,
            )
        except LLMConnectionError as exc:
            logger.error(f"Campaign plan LLM call failed: {exc}")
            raise ValueError(f"AI planning unavailable: {exc}") from exc

        parsed = _parse_llm_json(raw)
        if not parsed:
            raise ValueError("Could not parse campaign plan from AI response")

        raw_items = parsed.get("items") if isinstance(parsed, dict) else parsed
        if not isinstance(raw_items, list) or not raw_items:
            raise ValueError("AI returned an empty campaign plan")

        name = (request.name or "").strip() or _default_campaign_name(request)
        if isinstance(parsed, dict) and parsed.get("name") and not request.name:
            name = str(parsed["name"]).strip()[:255] or name

        campaign = Campaign(
            name=name,
            start_date=request.start_date,
            duration_days=request.duration_days,
            platforms=platforms,
            products=products_payload,
            status=CampaignStatus.PLANNED.value,
            timezone=CAMPAIGN_TZ,
        )
        self.db.add(campaign)
        self.db.flush()

        items = self._normalize_items(
            raw_items,
            campaign_id=campaign.id,
            start_date=request.start_date,
            duration_days=request.duration_days,
            default_platforms=platforms,
            products=products_payload,
        )
        if not items:
            self.db.rollback()
            raise ValueError("No valid timeline items after normalizing the AI plan")

        for item in items:
            self.db.add(item)

        campaign.plan_summary = _build_summary(items)
        campaign.updated_at = datetime.utcnow()
        self.db.commit()
        return self.get_campaign(campaign.id)  # type: ignore[return-value]

    def _build_prompt(
        self,
        request: CampaignPlanRequest,
        platforms: list[str],
        products: list[dict],
    ) -> str:
        end_date = request.start_date + timedelta(days=request.duration_days - 1)
        windows = ", ".join(w.strftime("%H:%M") for w in PKT_POSTING_WINDOWS)
        products_json = json.dumps(products, ensure_ascii=False)
        target_posts = request.duration_days
        last_day_index = request.duration_days - 1

        return f"""You are a social media strategist for Kafi Commodities (Pakistan-based spice/rice/food brand).
Create a complete multi-day content campaign plan optimized so posts from Karachi reach as much international audience as possible.

CAMPAIGN INPUT
- Start date (PKT calendar): {request.start_date.isoformat()}
- End date (PKT calendar): {end_date.isoformat()}
- Duration: {request.duration_days} days (day_index 0 through {last_day_index})
- Platforms: {", ".join(platforms)}
- Products/categories (product may be null — plan for the category): {products_json}
- Timezone for all times: Asia/Karachi (PKT, UTC+5)

POSTING WINDOWS (PKT) — ONLY use these clock times:
{windows}
Rationale: 13:00 Gulf midday / early EU; 16:00 EU afternoon; 20:00–22:00 US morning coverage.

REQUIREMENTS
1. Return exactly {target_posts} items — one post per calendar day from {request.start_date.isoformat()} through {end_date.isoformat()}.
2. day_index must run 0, 1, 2, … {last_day_index}. The LAST item must fall on {end_date.isoformat()} (day_index {last_day_index}).
3. Do NOT put two posts on the same day. Do NOT pack the first half of the campaign and leave later days empty.
4. Mix asset types: reel, post_image, story, graphic, animation, video.
5. Cover every provided category/product at least once when possible (rotate across days, do not double-post).
6. Each item needs a short topic/hook, draft title, and draft caption body suitable for the platforms.
7. Prefer Instagram Reels / TikTok for short video; LinkedIn more professional tone; Facebook broader.
8. Captions should be ready to post (no placeholders like [INSERT]).
9. scheduled_at_pkt must be ISO 8601 with offset +05:00 and a clock time from the windows above.

Respond with JSON ONLY in this shape:
{{
  "name": "short campaign name",
  "items": [
    {{
      "day_index": 0,
      "scheduled_at_pkt": "2026-08-28T20:00:00+05:00",
      "platforms": ["instagram", "facebook"],
      "asset_type": "reel",
      "topic": "hook or angle",
      "title": "short title",
      "body": "full draft caption",
      "product": "optional product name or null",
      "category": "category name"
    }}
  ]
}}
"""

    def _normalize_items(
        self,
        raw_items: list[Any],
        *,
        campaign_id: int,
        start_date: date,
        duration_days: int,
        default_platforms: list[str],
        products: list[dict],
    ) -> list[CampaignItem]:
        end_date = start_date + timedelta(days=duration_days - 1)
        fallback_category = products[0]["category"] if products else "General"
        items: list[CampaignItem] = []
        window_idx = 0

        for idx, raw in enumerate(raw_items):
            if not isinstance(raw, dict):
                continue

            asset_type = str(raw.get("asset_type") or "post_image").strip().lower()
            if asset_type in ("carousel", "multi_image"):
                asset_type = CampaignAssetType.POST_IMAGE.value
            if asset_type not in VALID_ASSET_TYPES:
                asset_type = CampaignAssetType.POST_IMAGE.value

            title = str(raw.get("title") or raw.get("topic") or "Campaign post").strip()[:255]
            body = str(raw.get("body") or raw.get("caption") or title).strip()
            topic = (str(raw.get("topic")).strip() if raw.get("topic") else None) or None
            product = (str(raw.get("product")).strip() if raw.get("product") else None) or None
            category = (
                str(raw.get("category")).strip() if raw.get("category") else None
            ) or fallback_category

            plats = raw.get("platforms") or default_platforms
            if isinstance(plats, str):
                plats = [plats]
            plats = [
                str(p).strip().lower()
                for p in plats
                if str(p).strip().lower() in {e.value for e in ContentPlatform}
            ] or list(default_platforms)

            local_dt = self._resolve_pkt_datetime(
                raw,
                start_date=start_date,
                end_date=end_date,
                day_index=raw.get("day_index"),
                fallback_day=min(idx % max(duration_days, 1), duration_days - 1),
                window_idx=window_idx,
            )
            window_idx += 1
            local_dt = _snap_to_window(local_dt)
            # Clamp to campaign date range
            if local_dt.date() < start_date:
                local_dt = datetime.combine(start_date, local_dt.time(), tzinfo=PKT)
                local_dt = _snap_to_window(local_dt)
            if local_dt.date() > end_date:
                local_dt = datetime.combine(end_date, local_dt.time(), tzinfo=PKT)
                local_dt = _snap_to_window(local_dt)

            utc_dt = local_dt.astimezone(timezone.utc)
            day_index = (local_dt.date() - start_date).days

            items.append(
                CampaignItem(
                    campaign_id=campaign_id,
                    day_index=max(0, day_index),
                    scheduled_at_utc=to_naive_utc(utc_dt),
                    scheduled_at_pkt=local_dt.isoformat(),
                    platforms=plats,
                    asset_type=asset_type,
                    topic=topic,
                    title=title or "Campaign post",
                    body=body or title or "Campaign post",
                    product=product,
                    category=category,
                    sort_order=idx,
                )
            )

        spread_campaign_schedule(
            items,
            start_date=start_date,
            duration_days=duration_days,
        )
        return items

    def _resolve_pkt_datetime(
        self,
        raw: dict,
        *,
        start_date: date,
        end_date: date,
        day_index: Any,
        fallback_day: int,
        window_idx: int,
    ) -> datetime:
        pkt_str = raw.get("scheduled_at_pkt") or raw.get("scheduled_at") or raw.get("datetime")
        if isinstance(pkt_str, str) and pkt_str.strip():
            try:
                parsed = datetime.fromisoformat(pkt_str.strip().replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=PKT)
                else:
                    parsed = parsed.astimezone(PKT)
                return parsed
            except ValueError:
                pass

        try:
            di = int(day_index) if day_index is not None else fallback_day
        except (TypeError, ValueError):
            di = fallback_day
        di = max(0, min(di, (end_date - start_date).days))
        day = start_date + timedelta(days=di)
        window = PKT_POSTING_WINDOWS[window_idx % len(PKT_POSTING_WINDOWS)]
        return datetime.combine(day, window, tzinfo=PKT)

    # ----------------------------------------------------------------- Commit

    def commit_campaign(self, campaign_id: int) -> tuple[Campaign, list[int], list[int]]:
        campaign = self.get_campaign(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")
        if campaign.status == CampaignStatus.COMMITTED.value:
            raise ValueError("Campaign is already committed to the calendar")
        if not campaign.items:
            raise ValueError("Campaign has no timeline items to commit")

        calendar = CalendarService(self.db)
        content_ids: list[int] = []
        event_ids: list[int] = []

        try:
            for item in sorted(campaign.items, key=lambda i: i.sort_order):
                if item.content_id and item.calendar_event_id:
                    continue

                plats = item.platforms or campaign.platforms or ["instagram"]
                primary = plats[0]
                try:
                    platform_enum = ContentPlatform(primary)
                except ValueError:
                    platform_enum = ContentPlatform.INSTAGRAM

                meta = {
                    "campaign_id": campaign.id,
                    "campaign_item_id": item.id,
                    "asset_type": item.asset_type,
                    "needs_media": True,
                    "timezone": CAMPAIGN_TZ,
                    "product": item.product,
                    "category": item.category,
                    "topic": item.topic,
                    "scheduled_at_pkt": item.scheduled_at_pkt,
                }

                content = Content(
                    platform=platform_enum,
                    status=ContentStatus.GENERATED,
                    title=(item.title or "Campaign post")[:255],
                    body=item.body or item.title or "Campaign post",
                    meta_data=meta,
                    created_by="campaign",
                )
                self.db.add(content)
                self.db.flush()

                platform_enums: list[PlatformEnum] = []
                for p in plats:
                    try:
                        platform_enums.append(PlatformEnum(p))
                    except ValueError:
                        continue
                if not platform_enums:
                    platform_enums = [PlatformEnum.INSTAGRAM]

                notes = (
                    f"Campaign #{campaign.id}: {item.asset_type}"
                    f"{f' · {item.category}' if item.category else ''}"
                    f"{f' / {item.product}' if item.product else ''}"
                    f" · attach media before publish"
                )
                event = calendar.create_event(
                    CalendarEventCreate(
                        content_id=content.id,
                        scheduled_date=as_aware_utc(item.scheduled_at_utc)
                        or item.scheduled_at_utc.replace(tzinfo=timezone.utc),
                        platforms=platform_enums,
                        draft_mode=False,
                        notes=notes,
                    ),
                    commit=False,
                )

                item.content_id = content.id
                item.calendar_event_id = event.id
                content_ids.append(content.id)
                event_ids.append(event.id)

            campaign.status = CampaignStatus.COMMITTED.value
            campaign.updated_at = datetime.utcnow()
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        refreshed = self.get_campaign(campaign_id)
        assert refreshed is not None
        return refreshed, content_ids, event_ids

    # -------------------------------------------------------------- Responses

    def to_response_dict(self, campaign: Campaign, *, include_items: bool = True) -> dict:
        items = sorted(campaign.items or [], key=lambda i: i.sort_order)
        payload: dict[str, Any] = {
            "id": campaign.id,
            "name": campaign.name,
            "start_date": campaign.start_date,
            "duration_days": campaign.duration_days,
            "platforms": campaign.platforms or [],
            "products": campaign.products or [],
            "status": campaign.status,
            "plan_summary": campaign.plan_summary,
            "timezone": campaign.timezone or CAMPAIGN_TZ,
            "created_at": as_aware_utc(campaign.created_at) or campaign.created_at,
            "updated_at": as_aware_utc(campaign.updated_at),
        }
        if include_items:
            payload["items"] = [self.item_to_dict(i) for i in items]
        else:
            payload["item_count"] = len(items)
        return payload

    def item_to_dict(self, item: CampaignItem) -> dict:
        return {
            "id": item.id,
            "campaign_id": item.campaign_id,
            "day_index": item.day_index,
            "scheduled_at_utc": as_aware_utc(item.scheduled_at_utc) or item.scheduled_at_utc,
            "scheduled_at_pkt": item.scheduled_at_pkt,
            "platforms": item.platforms or [],
            "asset_type": item.asset_type,
            "topic": item.topic,
            "title": item.title,
            "body": item.body,
            "product": item.product,
            "category": item.category,
            "content_id": item.content_id,
            "calendar_event_id": item.calendar_event_id,
            "sort_order": item.sort_order,
        }
