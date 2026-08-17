"""
CloudConvert video processing — fast server-side encode via free API key.

Browser uploads the large file directly to CloudConvert (not Railway),
then the backend downloads the smaller result into our media storage.
"""

from __future__ import annotations

import time
from typing import Any, Optional

import requests

from app.config import settings
from app.utils.exceptions import ContentGenerationError
from app.utils.logger import logger

_API = "https://api.cloudconvert.com/v2"


def cloudconvert_enabled() -> bool:
    return bool((settings.CLOUDCONVERT_API_KEY or "").strip())


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.CLOUDCONVERT_API_KEY.strip()}",
        "Content-Type": "application/json",
    }


def create_process_job(*, filename: str) -> dict[str, Any]:
    """
    Create a CloudConvert job (import/upload → convert → export/url).

    Returns:
        job_id, upload_url, upload_parameters (for browser FormData POST)
    """
    if not cloudconvert_enabled():
        raise ContentGenerationError("CloudConvert is not configured")

    height = max(360, int(settings.CLOUDCONVERT_TARGET_HEIGHT or 720))
    crf = max(18, min(40, int(settings.CLOUDCONVERT_CRF or 28)))
    audio_br = max(48, int(settings.CLOUDCONVERT_AUDIO_BITRATE_K or 96))

    payload = {
        "tasks": {
            "import-1": {"operation": "import/upload"},
            "convert-1": {
                "operation": "convert",
                "input": "import-1",
                "output_format": "mp4",
                "video_codec": "x264",
                "crf": crf,
                "height": height,
                "fit": "max",
                "audio_codec": "aac",
                "audio_bitrate": audio_br,
                "filename": "processed.mp4",
            },
            "export-1": {
                "operation": "export/url",
                "input": ["convert-1"],
            },
        },
        "tag": "kafi-social-media-process",
    }

    try:
        res = requests.post(f"{_API}/jobs", headers=_headers(), json=payload, timeout=60)
        res.raise_for_status()
    except requests.RequestException as exc:
        logger.error(f"CloudConvert create job failed: {exc}")
        raise ContentGenerationError(
            "Could not start fast video processing. Try again or use a smaller file."
        ) from exc

    data = res.json().get("data") or {}
    job_id = data.get("id")
    tasks = data.get("tasks") or []
    import_task = next((t for t in tasks if t.get("name") == "import-1"), None)
    if not job_id or not import_task:
        raise ContentGenerationError("CloudConvert did not return an upload task")

    form = (import_task.get("result") or {}).get("form") or {}
    upload_url = form.get("url")
    upload_parameters = form.get("parameters") or {}
    if not upload_url:
        raise ContentGenerationError("CloudConvert did not return an upload URL")

    logger.info(f"CloudConvert job created: {job_id} for {filename}")
    return {
        "job_id": job_id,
        "upload_url": upload_url,
        "upload_parameters": upload_parameters,
    }


def _find_export_url(job: dict[str, Any]) -> Optional[str]:
    tasks = job.get("tasks") or []
    for task in tasks:
        if task.get("name") != "export-1":
            continue
        if task.get("status") != "finished":
            continue
        files = (task.get("result") or {}).get("files") or []
        if files and files[0].get("url"):
            return files[0]["url"]
    return None


def wait_for_export_url(job_id: str) -> str:
    """Poll CloudConvert until the export URL is ready."""
    if not cloudconvert_enabled():
        raise ContentGenerationError("CloudConvert is not configured")

    timeout = max(60, int(settings.CLOUDCONVERT_POLL_TIMEOUT_SEC or 600))
    deadline = time.time() + timeout
    last_status = "unknown"

    while time.time() < deadline:
        try:
            res = requests.get(
                f"{_API}/jobs/{job_id}",
                headers=_headers(),
                timeout=30,
            )
            res.raise_for_status()
        except requests.RequestException as exc:
            logger.warning(f"CloudConvert poll error for {job_id}: {exc}")
            time.sleep(2)
            continue

        job = res.json().get("data") or {}
        status = job.get("status") or ""
        last_status = status

        if status == "finished":
            url = _find_export_url(job)
            if url:
                return url
            raise ContentGenerationError("CloudConvert finished but no export URL was returned")

        if status in {"error", "failed"}:
            # Surface first task message if present
            msg = "CloudConvert processing failed"
            for task in job.get("tasks") or []:
                if task.get("status") == "error" and task.get("message"):
                    msg = f"CloudConvert error: {task.get('message')}"
                    break
            raise ContentGenerationError(msg)

        time.sleep(2)

    raise ContentGenerationError(
        f"CloudConvert timed out after {timeout}s (last status: {last_status})"
    )


def download_processed_bytes(export_url: str) -> bytes:
    """Download the processed MP4 from CloudConvert's temporary export URL."""
    try:
        res = requests.get(export_url, timeout=300)
        res.raise_for_status()
    except requests.RequestException as exc:
        raise ContentGenerationError(
            "Failed to download processed video from CloudConvert"
        ) from exc
    if not res.content:
        raise ContentGenerationError("CloudConvert returned an empty video")
    return res.content
