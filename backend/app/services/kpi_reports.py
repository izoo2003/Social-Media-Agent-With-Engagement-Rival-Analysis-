"""
KPI Reports — per-metric daily/weekly/monthly breakdown plus a generated summary.

Numbers always come from KpiService.get_summary. Gemini (when available) writes
the prose overview; otherwise a computed overview is returned.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.config import get_posting_gemini_api_keys, get_posting_gemini_models
from app.llm.ollama_client import LLMClient
from app.services.kpi import KpiService
from app.utils.exceptions import LLMConnectionError
from app.utils.logger import logger


def period_label(from_date: date, to_date: date) -> str:
    days = (to_date - from_date).days + 1
    if days == 1:
        return f"Daily · {from_date.isoformat()}"
    if days == 7:
        return f"Weekly · {from_date.isoformat()} to {to_date.isoformat()}"
    if from_date.day == 1 and (to_date + timedelta(days=1)).day == 1 and from_date.month == to_date.month:
        return f"Monthly · {from_date.strftime('%B %Y')}"
    return f"{from_date.isoformat()} to {to_date.isoformat()} ({days} days)"


def _cell(row: dict[str, Any], key: str) -> dict[str, Any]:
    return dict(row.get("catalog") or {}).get(key) or {"auto": 0, "manual": 0, "total": 0}


def _custom_cell(row: dict[str, Any], cid: str) -> dict[str, Any]:
    return dict(row.get("custom") or {}).get(cid) or {"auto": 0, "manual": 0, "total": 0}


def analyze_metric(
    *,
    key: str,
    label: str,
    description: str,
    totals: dict[str, Any],
    daily: list[dict[str, Any]],
    cell_fn,
) -> dict[str, Any]:
    days = len(daily) or 1
    peak_day: Optional[str] = None
    peak_total = 0
    active = 0
    for row in daily:
        cell = cell_fn(row)
        total = int(cell.get("total") or 0)
        if total > 0:
            active += 1
        if total > peak_total:
            peak_total = total
            occurred = row.get("date")
            peak_day = occurred.isoformat() if hasattr(occurred, "isoformat") else str(occurred)

    total = int(totals.get("total") or 0)
    auto = int(totals.get("auto") or 0)
    manual = int(totals.get("manual") or 0)
    return {
        "key": key,
        "label": label,
        "description": description,
        "auto": auto,
        "manual": manual,
        "total": total,
        "breakdown": totals.get("breakdown"),
        "days_with_activity": active,
        "days_in_range": days,
        "daily_average": round(total / days, 2),
        "peak_day": peak_day if peak_total else None,
        "peak_total": peak_total,
    }


def build_report_analysis(summary: dict[str, Any]) -> dict[str, Any]:
    daily = list(summary.get("daily") or [])
    metrics = []
    for item in summary.get("catalog") or []:
        key = item["key"]
        metrics.append(
            analyze_metric(
                key=key,
                label=item.get("label") or key,
                description=item.get("description") or "",
                totals=item,
                daily=daily,
                cell_fn=lambda row, metric_key=key: _cell(row, metric_key),
            )
        )
    custom = []
    for item in summary.get("custom") or []:
        cid = str(item["id"])
        kind = item.get("kind") or "custom"
        if kind == "website_maintenance":
            description = "Website Maintenance KPI (manual entries only)"
            fallback = f"Website {cid}"
        else:
            description = "Custom KPI (manual entries only)"
            fallback = f"Custom {cid}"
        custom.append(
            analyze_metric(
                key=f"custom:{cid}",
                label=item.get("name") or fallback,
                description=description,
                totals=item,
                daily=daily,
                cell_fn=lambda row, custom_id=cid: _custom_cell(row, custom_id),
            )
        )
    return {"metrics": metrics, "custom": custom}


def computed_overview(from_date: date, to_date: date, analysis: dict[str, Any]) -> str:
    label = period_label(from_date, to_date)
    bits = []
    for m in analysis.get("metrics") or []:
        if m["total"]:
            extra = ""
            breakdown = m.get("breakdown") or {}
            if breakdown:
                extra = (
                    f" (images {int(breakdown.get('image') or 0)}, "
                    f"reels/video {int(breakdown.get('video') or 0)})"
                )
            bits.append(
                f"{m['label']}: {m['total']} total "
                f"(auto {m['auto']}, manual {m['manual']}){extra}; "
                f"active {m['days_with_activity']}/{m['days_in_range']} days"
                + (f", peak {m['peak_day']} ({m['peak_total']})" if m.get("peak_day") else "")
            )
    for m in analysis.get("custom") or []:
        if m["total"]:
            bits.append(f"{m['label']}: {m['total']} (manual only)")
    if not bits:
        return f"{label}. No KPI activity in this range (auto or manual)."
    return f"{label}. " + " ".join(bits) + "."


def _parse_llm_json(raw: str) -> Optional[dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        return None
    candidates = [text]
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        candidates.append(fence.group(1).strip())
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        candidates.append(text[start : end + 1])
    for blob in candidates:
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and str(data.get("overview") or "").strip():
            highlights = data.get("highlights") or []
            if not isinstance(highlights, list):
                highlights = []
            return {
                "overview": str(data["overview"]).strip(),
                "highlights": [str(h).strip() for h in highlights if str(h).strip()][:12],
            }
    return None


def _build_prompt(from_date: date, to_date: date, analysis: dict[str, Any]) -> str:
    payload = {
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "timezone": "Asia/Karachi",
        "metrics": analysis.get("metrics"),
        "custom": analysis.get("custom"),
    }
    return f"""You are writing a KPI report for a social-media designer at Kafi Commodities.
Use ONLY the numbers in this JSON. Do not invent counts.

{json.dumps(payload, default=str)}

Write a detailed breakdown for this date range. Distinguish Auto (counted by the agent)
from Manual (logged by the designer). For posts published, mention image vs reel/video
when a breakdown is present. Call out quiet days and peak days.

Return JSON only:
{{
  "overview": "3-6 sentence report covering the whole period",
  "highlights": ["short bullet", "short bullet"]
}}
"""


def generate_kpi_report(
    db: Session,
    from_date: date,
    to_date: date,
) -> dict[str, Any]:
    if to_date < from_date:
        raise ValueError("to date must be on or after from date")

    summary = KpiService(db).get_summary(from_date, to_date)
    analysis = build_report_analysis(summary)
    fallback = computed_overview(from_date, to_date, analysis)
    payload: dict[str, Any] = {
        "from": from_date,
        "to": to_date,
        "timezone": "Asia/Karachi",
        "period_label": period_label(from_date, to_date),
        "overview": fallback,
        "highlights": [],
        "metrics": analysis["metrics"],
        "custom": analysis["custom"],
        "generated_at": datetime.utcnow(),
        "model": None,
        "source": "computed",
        "message": None,
    }

    keys = get_posting_gemini_api_keys()
    models = get_posting_gemini_models()
    if not keys:
        payload["message"] = "Showing a computed breakdown (Gemini posting keys are not configured)."
        return payload

    try:
        raw = LLMClient().generate(
            _build_prompt(from_date, to_date, analysis),
            temperature=0.3,
            max_output_tokens=2048,
            response_mime_type="application/json",
            api_keys=keys,
            models=models,
        )
        parsed = _parse_llm_json(raw)
        if parsed:
            payload["overview"] = parsed["overview"]
            payload["highlights"] = parsed["highlights"]
            payload["source"] = "ai"
            payload["model"] = models[0] if models else None
        else:
            payload["message"] = "Could not parse the AI overview; showing the computed breakdown."
            if raw:
                payload["highlights"] = [raw[:800]]
    except LLMConnectionError as exc:
        logger.error(f"KPI report LLM failed: {exc}")
        payload["message"] = f"AI overview unavailable: {exc}"
    return payload
