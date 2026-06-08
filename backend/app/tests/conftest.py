"""
Pytest Configuration & Fixtures
"""

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def sample_content_request():
    """Sample content generation request."""
    return {
        "platforms": ["linkedin", "facebook"],
        "topic": "New Rice Export Initiative",
        "brand_context": "Kafi Commodities",
        "tone": "professional",
        "target_audience": "business",
    }
