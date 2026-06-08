"""
API Routes - Content Generation & Social Media Posting
POST /content/generate - Generate content with optional media attachment
POST /content/media/upload - Upload media file (image/video)
POST /content/{id}/post - Post content to social media
GET /content/history - Fetch content history
GET /content/{id} - Get content details
PATCH /content/{id}/status - Update content status
DELETE /content/{id} - Delete content
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.database.models import ContentStatus
from app.schemas.content import (
    ContentGenerationRequest,
    ContentGenerationResponse,
    ContentHistoryResponse,
    ContentDetailResponse,
    MediaUploadResponse,
    SocialPostRequest,
    SocialPostResponse,
)
from app.services.content import ContentService
from app.services.media import MediaService
from app.services.publishing import publish_content
from app.utils.logger import logger

router = APIRouter()

# Initialize services
media_service = MediaService()


@router.post("/content/generate", response_model=list[ContentGenerationResponse])
async def generate_content(
    request: ContentGenerationRequest,
    db: Session = Depends(get_db),
):
    """
    Generate AI-powered social media post captions for selected platforms.
    The graphic designer provides media separately - this generates text only.
    """
    try:
        logger.info(f"Received content generation request for platforms: {request.platforms}")

        service = ContentService(db)
        generated_contents = service.generate_content(request)

        # Map to response model
        responses = []
        for content in generated_contents:
            responses.append(
                ContentGenerationResponse(
                    content_id=content["id"],
                    platform=content["platform"],
                    title=content["title"],
                    body=content["body"],
                    metadata={
                        "hashtags": content["meta_data"].get("hashtags", []),
                        "keywords": content["meta_data"].get("keywords", []),
                        "tone": content["meta_data"].get("tone", "professional"),
                        "target_audience": request.target_audience,
                        "call_to_action": request.call_to_action,
                    },
                    status=content["status"],
                    generated_at=content["generated_at"],
                )
            )

        return responses

    except Exception as e:
        logger.error(f"Content generation endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")


@router.post("/content/generate-with-media", response_model=list[ContentGenerationResponse])
async def generate_content_with_media(
    platforms: str = Form(...),
    topic: str = Form(...),
    brand_context: str = Form("Kafi Commodities"),
    tone: str = Form("professional"),
    target_audience: str = Form("business"),
    call_to_action: str = Form(""),
    additional_instructions: str = Form(""),
    media_file: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    """
    Generate AI social media captions AND attach a media file (image/video)
    uploaded by the graphic designer. Then you can post the media + caption
    directly to social platforms.

    This is the main endpoint for the graphic designer workflow:
    1. Upload their image/video
    2. AI generates the caption
    3. Both are saved together for posting
    """
    try:
        logger.info(
            f"Received content-with-media generation request for platforms: {platforms}"
        )

        # Parse platforms from JSON string
        import json
        platform_list = json.loads(platforms) if isinstance(platforms, str) else platforms

        # Build request
        request = ContentGenerationRequest(
            platforms=[p.strip() for p in platform_list],
            topic=topic,
            brand_context=brand_context,
            tone=tone,
            target_audience=target_audience,
            call_to_action=call_to_action,
            additional_instructions=additional_instructions,
        )

        service = ContentService(db)

        # Handle media upload if provided
        media_path = None
        media_type = None
        media_original_name = None

        if media_file:
            media_info = await media_service.upload_file(media_file)
            media_path = media_info["media_path"]
            media_type = media_info["media_type"]
            media_original_name = media_info["media_original_name"]
            logger.info(f"Media attached: {media_original_name} ({media_type})")

        # Generate content with media info
        generated_contents = service.generate_content(
            request,
            media_path=media_path,
            media_type=media_type,
            media_original_name=media_original_name,
        )

        # Map to response model
        responses = []
        for content in generated_contents:
            responses.append(
                ContentGenerationResponse(
                    content_id=content["id"],
                    platform=content["platform"],
                    title=content["title"],
                    body=content["body"],
                    metadata={
                        "hashtags": content["meta_data"].get("hashtags", []),
                        "keywords": content["meta_data"].get("keywords", []),
                        "tone": content["meta_data"].get("tone", "professional"),
                        "target_audience": request.target_audience,
                        "call_to_action": request.call_to_action,
                    },
                    status=content["status"],
                    generated_at=content["generated_at"],
                    media_path=content.get("media_path"),
                    media_type=content.get("media_type"),
                    media_original_name=content.get("media_original_name"),
                )
            )

        return responses

    except Exception as e:
        logger.error(f"Content-with-media generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")


@router.post("/content/media/upload", response_model=MediaUploadResponse)
async def upload_media(
    file: UploadFile = File(...),
):
    """
    Upload a media file (image or video) to attach to content later.
    The graphic designer uploads their designed image/video here.
    """
    try:
        logger.info(f"Media upload request: {file.filename}")

        result = await media_service.upload_file(file)

        return MediaUploadResponse(
            media_path=result["media_path"],
            media_type=result["media_type"],
            media_original_name=result["media_original_name"],
            media_url=result["media_url"],
        )

    except Exception as e:
        logger.error(f"Media upload error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/content/{content_id}/post", response_model=list[SocialPostResponse])
async def post_content_to_socials(
    content_id: int,
    request: SocialPostRequest,
    db: Session = Depends(get_db),
):
    """
    Post generated content (caption + any attached media) to social media platforms.
    Posts to LinkedIn, Facebook, and/or Instagram using their APIs.

    In draft_mode=True, it simulates posting for testing with dummy accounts.
    """
    try:
        logger.info(
            f"Post request for content {content_id} to platforms: {request.platforms}"
        )

        from app.schemas.content import ContentPlatform as PlatformEnum

        results = publish_content(
            db=db,
            content_id=content_id,
            platforms=[p.value for p in request.platforms],
            draft_mode=request.draft_mode,
            override_title=request.override_title,
            override_body=request.override_body,
            linkedin_account_labels=request.linkedin_account_labels,
        )

        responses = []
        for result in results:
            platform_name = result["platform"]
            try:
                platform_enum = PlatformEnum(platform_name)
            except ValueError:
                platform_enum = platform_name

            responses.append(
                SocialPostResponse(
                    content_id=result["content_id"],
                    platform=platform_enum,
                    status=result["status"],
                    post_url=result.get("post_url"),
                    post_id=result.get("post_id"),
                    error_message=result.get("error_message"),
                    account_label=result.get("account_label"),
                )
            )

        return responses

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Social posting error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to post to social media: {str(e)}")


@router.get("/content/history", response_model=list[ContentHistoryResponse])
async def get_content_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    platform: str = Query(None, description="Filter by platform"),
    db: Session = Depends(get_db),
):
    """
    Fetch content generation history.
    """
    try:
        logger.info(f"Fetching content history: skip={skip}, limit={limit}, platform={platform}")

        service = ContentService(db)
        contents = service.list_content(platform=platform, limit=limit)

        # Apply skip for pagination
        contents = contents[skip:]

        return [
            ContentHistoryResponse(
                id=c["id"],
                platform=c["platform"],
                title=c["title"],
                body=c["body"],
                status=c["status"],
                created_at=c["generated_at"],
                updated_at=c["generated_at"],
                media_path=c.get("media_path"),
                media_type=c.get("media_type"),
                linkedin_post_status=c.get("linkedin_post_status", "pending"),
                facebook_post_status=c.get("facebook_post_status", "pending"),
                instagram_post_status=c.get("instagram_post_status", "pending"),
                youtube_post_status=c.get("youtube_post_status", "pending"),
                linkedin_post_id=c.get("linkedin_post_id"),
                facebook_post_id=c.get("facebook_post_id"),
                instagram_post_id=c.get("instagram_post_id"),
                youtube_post_id=c.get("youtube_post_id"),
                linkedin_accounts_results=c.get("linkedin_accounts_results"),
            )
            for c in contents
        ]

    except Exception as e:
        logger.error(f"Content history endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch content history: {str(e)}")


@router.get("/content/{content_id}", response_model=ContentDetailResponse)
async def get_content_detail(
    content_id: int,
    db: Session = Depends(get_db),
):
    """
    Get detailed content information including media and posting status.
    """
    try:
        logger.info(f"Fetching content detail: {content_id}")

        service = ContentService(db)
        content = service.get_content(content_id)

        if not content:
            raise HTTPException(status_code=404, detail=f"Content {content_id} not found")

        return ContentDetailResponse(
            id=content["id"],
            platform=content["platform"],
            title=content["title"],
            body=content["body"],
            metadata=content["meta_data"] or {},
            status=content["status"],
            generated_at=content["generated_at"],
            created_at=content["created_at"],
            updated_at=content["created_at"],
            media_path=content.get("media_path"),
            media_type=content.get("media_type"),
            media_original_name=content.get("media_original_name"),
            linkedin_post_status=content.get("linkedin_post_status", "pending"),
            facebook_post_status=content.get("facebook_post_status", "pending"),
            instagram_post_status=content.get("instagram_post_status", "pending"),
            youtube_post_status=content.get("youtube_post_status", "pending"),
            linkedin_post_id=content.get("linkedin_post_id"),
            facebook_post_id=content.get("facebook_post_id"),
            instagram_post_id=content.get("instagram_post_id"),
            youtube_post_id=content.get("youtube_post_id"),
            linkedin_accounts_results=content.get("linkedin_accounts_results"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Content detail endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch content: {str(e)}")


@router.patch("/content/{content_id}/status")
async def update_content_status(
    content_id: int,
    status: ContentStatus,
    db: Session = Depends(get_db),
):
    """
    Update content status (e.g., from DRAFT to APPROVED).
    """
    try:
        logger.info(f"Updating content {content_id} status to {status}")

        service = ContentService(db)
        success = service.update_content_status(content_id, status)

        if not success:
            raise HTTPException(status_code=404, detail=f"Content {content_id} not found")

        content = service.get_content(content_id)
        return {
            "message": f"Content status updated to {status}",
            "content": content,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update status endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update status: {str(e)}")


@router.delete("/content/{content_id}")
async def delete_content(
    content_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a content record and its associated media.
    """
    try:
        logger.info(f"Deleting content {content_id}")

        service = ContentService(db)
        success = service.delete_content(content_id)

        if not success:
            raise HTTPException(status_code=404, detail=f"Content {content_id} not found")

        return {"message": f"Content {content_id} deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete content endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete content: {str(e)}")
