"""
Publishing Service
Shared logic for posting stored Content to social platforms.

Used by:
- The immediate "post now" route (POST /content/{id}/post)
- The background scheduler that publishes due CalendarEvents

Keeping this in one place guarantees scheduled posts behave identically to
posts triggered manually from the UI.
"""

from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.database.models import Content, ContentStatus, PostStatus as DBPostStatus
from app.services.content import ContentService
from app.services.media import MediaService
from app.config import public_api_url, settings
from app.services.social_publisher import SocialPublisher
from app.utils.logger import logger

# Single shared media service instance (mirrors the route module)
media_service = MediaService()


def _map_post_status(status: str) -> DBPostStatus:
    """Map a publisher result status string to the DB PostStatus enum."""
    if status == "published":
        return DBPostStatus.PUBLISHED
    if status == "draft":
        return DBPostStatus.PENDING
    if status == "partial":
        return DBPostStatus.PARTIAL
    return DBPostStatus.FAILED


def publish_content(
    db: Session,
    content_id: int,
    platforms: list[str],
    draft_mode: bool = False,
    override_title: Optional[str] = None,
    override_body: Optional[str] = None,
    linkedin_account_labels: Optional[list[str]] = None,
) -> list[dict]:
    """
    Publish a stored Content record (caption + any attached media) to the
    requested social platforms and persist the per-platform posting status.

    Args:
        db: Active SQLAlchemy session
        content_id: ID of the Content row to publish
        platforms: Platform names, e.g. ["linkedin", "facebook", "instagram"]
        draft_mode: When True, simulates posting without hitting live APIs
        override_title: Optional edited caption title
        override_body: Optional edited caption body
        linkedin_account_labels: Optional subset of LinkedIn accounts to post from

    Returns:
        A list of result dicts (one per platform / LinkedIn account) with keys:
        content_id, platform, status, post_url, post_id, error_message, account_label

    Raises:
        ValueError: If the content_id does not exist.
    """
    service = ContentService(db)
    content = service.get_content(content_id)

    if not content:
        raise ValueError(f"Content {content_id} not found")

    post_title = override_title if override_title else content["title"]
    post_body = override_body if override_body else content["body"]

    if override_title or override_body:
        logger.info(f"Using edited caption for content {content_id}")

    # Resolve media for upload
    media_file_path = None
    media_type_val = None
    media_supabase_url = None
    temp_file_path = None
    thumbnail_file_path = None
    thumbnail_supabase_url = None
    temp_thumbnail_path = None

    if content.get("media_path"):
        media_type_val = content.get("media_type")

        if media_service.is_supabase_configured:
            try:
                temp_file_path = media_service.download_to_temp(content["media_path"])
                media_file_path = temp_file_path
                media_supabase_url = media_service.get_public_url(content["media_path"])
                logger.info(
                    f"Using Supabase storage: temp={temp_file_path}, url={media_supabase_url}"
                )
            except Exception as e:
                logger.error(f"Failed to download media from Supabase: {e}")
        else:
            upload_dir = Path(__file__).parent.parent.parent / "uploads"
            full_path = upload_dir / content["media_path"]
            if full_path.exists():
                media_file_path = str(full_path.absolute())

    meta_data = content.get("meta_data") or {}
    if isinstance(meta_data, str):
        import json

        try:
            meta_data = json.loads(meta_data)
        except Exception:
            meta_data = {}

    thumbnail_relative_path = meta_data.get("thumbnail_path")
    logger.info(
        f"Publish content {content_id}: media_type={media_type_val}, "
        f"media_path={content.get('media_path')}, "
        f"thumbnail_path={thumbnail_relative_path or '(none)'}"
    )

    if thumbnail_relative_path and media_type_val == "video":
        if media_service.is_supabase_configured:
            try:
                temp_thumbnail_path = media_service.download_to_temp(thumbnail_relative_path)
                thumbnail_file_path = temp_thumbnail_path
                thumbnail_supabase_url = media_service.get_public_url(thumbnail_relative_path)
                if not (thumbnail_supabase_url or "").startswith("https://"):
                    # File may have been saved locally due to Supabase fallback
                    local_thumb = (
                        Path(__file__).parent.parent.parent / "uploads" / thumbnail_relative_path
                    )
                    if local_thumb.exists():
                        thumbnail_file_path = str(local_thumb.absolute())
                        thumbnail_supabase_url = public_api_url(
                            f"/uploads/{thumbnail_relative_path}"
                        )
                logger.info(
                    f"Using thumbnail: file={thumbnail_file_path}, "
                    f"url={thumbnail_supabase_url}"
                )
            except Exception as e:
                logger.error(f"Failed to download thumbnail from Supabase: {e}")
                # Fall back to local uploads if present
                local_thumb = (
                    Path(__file__).parent.parent.parent / "uploads" / thumbnail_relative_path
                )
                if local_thumb.exists():
                    thumbnail_file_path = str(local_thumb.absolute())
                    thumbnail_supabase_url = public_api_url(
                        f"/uploads/{thumbnail_relative_path}"
                    )
                    logger.info(
                        f"Using local thumbnail fallback: {thumbnail_file_path} "
                        f"url={thumbnail_supabase_url}"
                    )
        else:
            upload_dir = Path(__file__).parent.parent.parent / "uploads"
            thumb_full_path = upload_dir / thumbnail_relative_path
            if thumb_full_path.exists():
                thumbnail_file_path = str(thumb_full_path.absolute())
                thumbnail_supabase_url = public_api_url(
                    f"/uploads/{thumbnail_relative_path}"
                )
                logger.info(
                    f"Using local thumbnail: {thumbnail_file_path} "
                    f"url={thumbnail_supabase_url}"
                )
            else:
                logger.error(f"Thumbnail file missing on disk: {thumb_full_path}")
    elif thumbnail_relative_path and media_type_val != "video":
        logger.warning(
            f"Ignoring thumbnail_path={thumbnail_relative_path} because media_type="
            f"{media_type_val} (thumbnails only apply to videos)"
        )

    publisher = SocialPublisher(draft_mode=draft_mode)

    youtube_tags = meta_data.get("hashtags", []) if content else []

    platform_results = publisher.post_to_multiple(
        platforms=platforms,
        title=post_title,
        body=post_body,
        media_file_path=media_file_path,
        media_type=media_type_val,
        media_relative_path=content.get("media_path"),
        media_url=media_supabase_url,
        thumbnail_file_path=thumbnail_file_path,
        thumbnail_relative_path=thumbnail_relative_path,
        thumbnail_url=thumbnail_supabase_url,
        tags=youtube_tags,
        privacy_status=settings.YOUTUBE_DEFAULT_PRIVACY_STATUS,
        linkedin_account_labels=linkedin_account_labels,
    )

    if temp_file_path:
        media_service.cleanup_temp_file(temp_file_path)
    if temp_thumbnail_path:
        media_service.cleanup_temp_file(temp_thumbnail_path)

    # Persist per-platform status onto the Content row
    responses: list[dict] = []
    db_content = db.query(Content).filter(Content.id == content_id).first()

    for platform_name, result in platform_results.items():
        response_status = result.get("status", "failed")
        post_id_value = result.get("post_id")

        if db_content:
            if platform_name == "linkedin":
                account_results = result.get("accounts") or []
                db_content.linkedin_post_status = _map_post_status(response_status)
                db_content.linkedin_post_id = post_id_value
                if account_results:
                    db_content.linkedin_accounts_results = account_results
            elif platform_name == "facebook":
                db_content.facebook_post_status = _map_post_status(response_status)
                db_content.facebook_post_id = post_id_value
            elif platform_name == "instagram":
                db_content.instagram_post_status = _map_post_status(response_status)
                db_content.instagram_post_id = post_id_value
            elif platform_name == "youtube":
                db_content.youtube_post_status = _map_post_status(response_status)
                db_content.youtube_post_id = post_id_value
            elif platform_name == "tiktok":
                db_content.tiktok_post_status = _map_post_status(response_status)
                db_content.tiktok_post_id = post_id_value

        if platform_name == "linkedin" and result.get("accounts"):
            for account_result in result["accounts"]:
                responses.append(
                    {
                        "content_id": content_id,
                        "platform": platform_name,
                        "status": account_result.get("status", "failed"),
                        "post_url": account_result.get("post_url"),
                        "post_id": account_result.get("post_id"),
                        "error_message": account_result.get("error_message"),
                        "account_label": account_result.get("label"),
                    }
                )
        else:
            responses.append(
                {
                    "content_id": content_id,
                    "platform": platform_name,
                    "status": response_status,
                    "post_url": result.get("post_url"),
                    "post_id": post_id_value,
                    "error_message": result.get("error_message"),
                    "account_label": None,
                }
            )

    if db_content:
        overall = summarize_statuses(responses)
        if overall in ("published", "partial"):
            db_content.status = ContentStatus.PUBLISHED
        db.commit()

    return responses


def summarize_statuses(responses: list[dict]) -> str:
    """
    Reduce a list of per-platform results into one overall status string:
    'published', 'partial', 'draft', or 'failed'.
    """
    if not responses:
        return "failed"

    statuses = [r.get("status", "failed") for r in responses]
    ok = [s for s in statuses if s in ("published", "draft")]

    if len(ok) == len(statuses):
        # All succeeded — distinguish draft simulations from live publishes
        return "draft" if all(s == "draft" for s in statuses) else "published"
    if ok:
        return "partial"
    return "failed"
