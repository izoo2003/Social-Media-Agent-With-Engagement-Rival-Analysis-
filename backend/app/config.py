"""
Application Configuration Management
Uses Pydantic Settings for environment variables
"""

from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # App Settings
    APP_NAME: str = "Kafi Social Agent"
    API_VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1

    # Database Settings
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/kafi_social_agent"
    DATABASE_ECHO: bool = False  # Set to True to log SQL queries

    # Supabase Settings (Optional)
    SUPABASE_URL: str = ""
    SUPABASE_API_KEY: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SECRET_KEY: str = ""

    # LLM Provider Settings
    # Using Google Gemini API (fast, free, no local model needed)
    LLM_PROVIDER: str = "gemini"

    # Ollama Settings (used when LLM_PROVIDER="ollama")
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "mistral"
    OLLAMA_TIMEOUT: int = 300

    # Google Gemini Settings (used when LLM_PROVIDER="gemini")
    # Get a free API key at https://aistudio.google.com/apikey
    GEMINI_API_KEY: str = ""
    # Primary model. gemini-3.5-flash can hit 503 under high demand; fallback is used automatically.
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_FALLBACK_MODEL: str = "gemini-3.1-flash-lite"
    GEMINI_TIMEOUT: int = 120
    GEMINI_MAX_RETRIES: int = 3

    # LLM Settings
    TEMPERATURE: float = 0.7
    MAX_TOKENS: int = 2048
    TOP_P: float = 0.9

    # Scraper Settings
    SCRAPER_TIMEOUT: int = 30
    SCRAPER_BATCH_SIZE: int = 10
    SCRAPER_SCHEDULE_INTERVAL: int = 3600  # seconds

    # Rival Review Settings
    # YouTube Data API v3 key for PUBLIC competitor channel stats (separate from
    # the YouTube upload OAuth creds). Get a free key in Google Cloud Console.
    YOUTUBE_DATA_API_KEY: str = ""
    # When True, a background job refreshes rival snapshots on SCRAPER_SCHEDULE_INTERVAL.
    RIVAL_AUTO_REFRESH: bool = False

    # Post Scheduler Settings (auto-publish scheduled calendar events)
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_POLL_INTERVAL_SECONDS: int = 30  # how often to check for due posts

    # Redis (optional caching)
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_ENABLED: bool = False

    # CORS Settings
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
    ]

    # JWT/Auth Settings
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Social Media API Settings
    LINKEDIN_ACCESS_TOKEN: str = ""
    LINKEDIN_PERSON_ID: str = ""
    LINKEDIN_ACCOUNT_1_LABEL: str = "Account 1"
    LINKEDIN_ACCOUNT_1_ACCESS_TOKEN: str = ""
    LINKEDIN_ACCOUNT_1_PERSON_ID: str = ""
    LINKEDIN_ACCOUNT_2_LABEL: str = "Account 2"
    LINKEDIN_ACCOUNT_2_ACCESS_TOKEN: str = ""
    LINKEDIN_ACCOUNT_2_PERSON_ID: str = ""
    LINKEDIN_ACCOUNT_3_LABEL: str = "Account 3"
    LINKEDIN_ACCOUNT_3_ACCESS_TOKEN: str = ""
    LINKEDIN_ACCOUNT_3_PERSON_ID: str = ""
    LINKEDIN_ORGANIZATION_ID: str = ""
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    FACEBOOK_APP_ID: str = ""
    FACEBOOK_APP_SECRET: str = ""
    FACEBOOK_PAGE_ID: str = ""
    FACEBOOK_PAGE_ACCESS_TOKEN: str = ""
    FACEBOOK_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/meta/callback"
    INSTAGRAM_ACCOUNT_ID: str = ""
    META_GRAPH_API_VERSION: str = "v21.0"

    # YouTube Settings (YouTube Data API v3 - OAuth 2.0)
    YOUTUBE_CLIENT_ID: str = ""
    YOUTUBE_CLIENT_SECRET: str = ""
    YOUTUBE_REFRESH_TOKEN: str = ""
    YOUTUBE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/youtube/callback"
    YOUTUBE_CHANNEL_ID: str = ""
    YOUTUBE_VIDEO_CATEGORY_ID: str = "22"  # 22 = People & Blogs (default)
    # Scopes required for upload + analytics (comma-separated in .env)
    YOUTUBE_OAUTH_SCOPES: str = (
        "https://www.googleapis.com/auth/youtube.upload,"
        "https://www.googleapis.com/auth/youtube.readonly,"
        "https://www.googleapis.com/auth/yt-analytics.readonly"
    )

    # Draft / Test Mode
    DRAFT_MODE: bool = True

    # Supabase Storage Settings
    SUPABASE_STORAGE_BUCKET: str = "Media"

    # Upload Settings
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Ignore unknown env vars so .env can have extra vars


settings = Settings()
