"""
Media Service - Supabase Storage with Local Disk Fallback
Handles file uploads, storage, validation, and retrieval to/from Supabase Storage
(or local disk when Supabase is not configured).
"""

import os
import uuid
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import UploadFile
from app.config import settings
from app.utils.logger import logger
from app.utils.exceptions import ContentGenerationError

# Allowed file extensions
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm", ".mkv"}
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS | ALLOWED_DOCUMENT_EXTENSIONS

# Max file size (50MB)
MAX_FILE_SIZE = 50 * 1024 * 1024

# Local fallback directory
LOCAL_UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"

# MIME type mapping for Supabase uploads
EXTENSION_TO_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def get_media_type(extension: str) -> str:
    """Determine media type from file extension."""
    ext = extension.lower()
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return "image"
    elif ext in ALLOWED_VIDEO_EXTENSIONS:
        return "video"
    elif ext in ALLOWED_DOCUMENT_EXTENSIONS:
        return "document"
    return "unknown"


def _get_subdirectory(media_type: str) -> str:
    """Get subdirectory name for media type."""
    mapping = {
        "image": "images",
        "video": "videos",
        "document": "documents",
    }
    return mapping.get(media_type, "other")


def _generate_storage_path(original_filename: str, media_type: str) -> tuple[str, str, str]:
    """
    Generate a unique storage path for a file.

    Returns:
        Tuple of (relative_path, safe_filename, subdirectory)
    """
    extension = Path(original_filename).suffix.lower()
    subdir = _get_subdirectory(media_type)
    unique_id = uuid.uuid4().hex[:12]
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{unique_id}{extension}"
    relative_path = f"{subdir}/{safe_filename}"
    return relative_path, safe_filename, subdir


class SupabaseStorageBackend:
    """Backend for Supabase Storage operations. Initialised lazily."""

    def __init__(self):
        self._client = None
        self._bucket_name = settings.SUPABASE_STORAGE_BUCKET

    @property
    def is_configured(self) -> bool:
        return bool(settings.SUPABASE_URL and settings.SUPABASE_SECRET_KEY)

    @property
    def _client_instance(self):
        """Lazy initialise the Supabase client."""
        if self._client is None and self.is_configured:
            try:
                from supabase import create_client
                self._client = create_client(
                    settings.SUPABASE_URL,
                    settings.SUPABASE_SECRET_KEY,
                )
                logger.info(f"Supabase Storage client initialised (bucket: {self._bucket_name})")
            except Exception as e:
                logger.error(f"Failed to initialise Supabase client: {e}")
                self._client = None
        return self._client

    def upload(self, path: str, file_data: bytes, content_type: str) -> str:
        """
        Upload file bytes to Supabase Storage.

        Args:
            path: Storage path (e.g., "images/abc.jpg")
            file_data: Raw file bytes
            content_type: MIME type

        Returns:
            Public URL of the uploaded file

        Raises:
            ContentGenerationError: On upload failure
        """
        client = self._client_instance
        if not client:
            raise ContentGenerationError("Supabase Storage is not configured")

        try:
            client.storage.from_(self._bucket_name).upload(
                path=path,
                file=file_data,
                file_options={"content-type": content_type},
            )
            logger.info(f"Uploaded to Supabase: {path} ({len(file_data)} bytes)")
            return self.get_public_url(path)
        except Exception as e:
            error_msg = str(e)
            # If file already exists, try deleting first (safety net)
            if "already exists" in error_msg.lower():
                try:
                    client.storage.from_(self._bucket_name).remove([path])
                    client.storage.from_(self._bucket_name).upload(
                        path=path,
                        file=file_data,
                        file_options={"content-type": content_type},
                    )
                    return self.get_public_url(path)
                except Exception as e2:
                    raise ContentGenerationError(
                        f"Supabase upload failed (retry): {e2}"
                    ) from e2
            raise ContentGenerationError(f"Supabase upload failed: {error_msg}") from e

    def download(self, path: str) -> bytes:
        """
        Download file bytes from Supabase Storage.

        Args:
            path: Storage path (e.g., "images/abc.jpg")

        Returns:
            Raw file bytes

        Raises:
            ContentGenerationError: If download fails
        """
        client = self._client_instance
        if not client:
            raise ContentGenerationError("Supabase Storage is not configured")

        try:
            data = client.storage.from_(self._bucket_name).download(path)
            logger.info(f"Downloaded from Supabase: {path} ({len(data)} bytes)")
            return data
        except Exception as e:
            raise ContentGenerationError(f"Supabase download failed: {e}") from e

    def get_public_url(self, path: str) -> str:
        """Get the public URL for a file in Supabase Storage."""
        client = self._client_instance
        if not client:
            return ""
        try:
            url = client.storage.from_(self._bucket_name).get_public_url(path)
            return url
        except Exception as e:
            logger.warning(f"Failed to get public URL for {path}: {e}")
            return ""

    def delete(self, path: str) -> bool:
        """Delete a file from Supabase Storage."""
        client = self._client_instance
        if not client:
            return False
        try:
            client.storage.from_(self._bucket_name).remove([path])
            logger.info(f"Deleted from Supabase: {path}")
            return True
        except Exception as e:
            logger.warning(f"Failed to delete {path} from Supabase: {e}")
            return False


class LocalStorageBackend:
    """Backend for local disk storage (fallback when Supabase is not configured)."""

    def __init__(self):
        self._ensure_upload_dir()

    def _ensure_upload_dir(self):
        """Create upload directory and subdirectories."""
        LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        for media_type in ["images", "videos", "documents", "other"]:
            (LOCAL_UPLOAD_DIR / media_type).mkdir(parents=True, exist_ok=True)

    def upload(self, path: str, file_data: bytes, content_type: str) -> str:
        """Save file to local disk and return relative URL path."""
        full_path = LOCAL_UPLOAD_DIR / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(file_data)
        logger.info(f"Saved locally: {path} ({len(file_data)} bytes)")
        return f"/uploads/{path}"

    def download(self, path: str) -> bytes:
        """Read file bytes from local disk."""
        full_path = LOCAL_UPLOAD_DIR / path
        if not full_path.exists():
            raise ContentGenerationError(f"Local file not found: {path}")
        with open(full_path, "rb") as f:
            return f.read()

    def get_public_url(self, path: str) -> str:
        """Return the local serving URL path."""
        return f"/uploads/{path}"

    def get_full_path(self, path: str) -> Optional[Path]:
        """Get the full filesystem Path object."""
        full_path = LOCAL_UPLOAD_DIR / path
        if full_path.exists():
            return full_path
        return None

    def delete(self, path: str) -> bool:
        """Delete a file from local disk."""
        full_path = LOCAL_UPLOAD_DIR / path
        if full_path.exists():
            full_path.unlink()
            logger.info(f"Deleted locally: {path}")
            return True
        return False


class MediaService:
    """
    Service for handling media file uploads.

    Supports two backends:
    1. Supabase Storage (preferred) - when SUPABASE_URL + SUPABASE_SECRET_KEY are set
    2. Local disk (fallback) - stores files in backend/uploads/

    Usage:
        service = MediaService()
        result = await service.upload_file(uploaded_file)
        # result = { media_path, media_type, media_original_name, media_url }
    """

    def __init__(self):
        self.supabase = SupabaseStorageBackend()
        self.local = LocalStorageBackend()

    @property
    def is_supabase_configured(self) -> bool:
        """Check if Supabase Storage is available."""
        return self.supabase.is_configured

    def _get_backend(self):
        """Return the active storage backend (Supabase preferred, local fallback)."""
        return self.supabase if self.is_supabase_configured else self.local

    async def upload_file(self, file: UploadFile) -> dict:
        """
        Upload a media file and return its metadata.

        - If Supabase is configured: uploads to Supabase Storage bucket
        - Otherwise: saves to local backend/uploads/

        Returns:
            Dict with:
            - media_path: Storage path (e.g., "images/abc.jpg")
            - media_type: "image", "video", or "document"
            - media_original_name: Original filename
            - media_url: Public URL or serving path
        """
        # Validate file
        if not file.filename:
            raise ContentGenerationError("No file provided")

        # Check extension
        extension = Path(file.filename).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise ContentGenerationError(
                f"File type '{extension}' is not supported. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        # Read file content
        content = await file.read()

        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise ContentGenerationError(
                f"File size exceeds maximum of {MAX_FILE_SIZE // (1024*1024)}MB"
            )

        # Determine media type
        media_type = get_media_type(extension)

        # Generate storage path
        relative_path, _, _ = _generate_storage_path(file.filename, media_type)

        # Get MIME type
        mime_type = EXTENSION_TO_MIME.get(extension, "application/octet-stream")

        # Upload to the active backend
        backend = self._get_backend()
        media_url = backend.upload(relative_path, content, mime_type)

        logger.info(
            f"Media uploaded: {file.filename} -> {relative_path} "
            f"(type: {media_type}, size: {len(content)} bytes, "
            f"storage: {'supabase' if self.is_supabase_configured else 'local'})"
        )

        return {
            "media_path": relative_path,
            "media_type": media_type,
            "media_original_name": file.filename,
            "media_url": media_url,
        }

    def download_file(self, media_path: str) -> bytes:
        """
        Download a media file as bytes from wherever it's stored.

        Args:
            media_path: Storage path (e.g., "images/abc.jpg")

        Returns:
            Raw file bytes

        Raises:
            ContentGenerationError: If file not found or download fails
        """
        backend = self._get_backend()
        return backend.download(media_path)

    def download_to_temp(self, media_path: str) -> str:
        """
        Download a media file to a temporary file on disk and return the path.

        This is needed by the social publisher (LinkedIn/Facebook) which
        reads files from disk to upload to their APIs.

        Args:
            media_path: Storage path (e.g., "images/abc.jpg")

        Returns:
            Absolute path to a temporary file with the media content

        Raises:
            ContentGenerationError: If download fails
        """
        data = self.download_file(media_path)

        # Determine file extension from the stored path
        extension = Path(media_path).suffix or ".tmp"

        # Write to a temp file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=extension)
        temp_file.write(data)
        temp_file.close()

        logger.info(f"Downloaded to temp file: {temp_file.name} (from {media_path})")
        return temp_file.name

    def get_public_url(self, media_path: str) -> str:
        """
        Get the public URL for a stored media file.

        - With Supabase: Returns the Supabase public URL (accessible from anywhere)
        - With local: Returns the relative serving path (/uploads/...)

        Args:
            media_path: Storage path (e.g., "images/abc.jpg")

        Returns:
            Public URL string
        """
        backend = self._get_backend()
        return backend.get_public_url(media_path)

    def get_full_path(self, media_path: str) -> Optional[Path]:
        """
        Get the full filesystem path (local backend only).
        Returns None if using Supabase.
        """
        if not self.is_supabase_configured:
            return self.local.get_full_path(media_path)
        return None

    def delete_file(self, media_path: str) -> bool:
        """
        Delete a media file from wherever it's stored.

        Args:
            media_path: Storage path (e.g., "images/abc.jpg")

        Returns:
            True if deleted, False if not found
        """
        backend = self._get_backend()
        return backend.delete(media_path)

    def cleanup_temp_file(self, temp_path: str):
        """
        Delete a temporary file created by download_to_temp().

        Should be called after social posting is done to avoid disk bloat.
        """
        try:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                logger.debug(f"Cleaned up temp file: {temp_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temp file {temp_path}: {e}")
