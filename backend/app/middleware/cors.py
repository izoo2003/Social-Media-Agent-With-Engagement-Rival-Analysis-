"""
CORS Middleware Configuration
"""


def get_cors_settings() -> dict:
    """Get CORS settings."""
    return {
        "allow_origins": [
            "http://localhost:3000",
            "http://localhost:8000",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8000",
        ],
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
