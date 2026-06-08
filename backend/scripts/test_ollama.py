"""
Test Gemini API connection
"""

import sys
from pathlib import Path

# Add the backend directory to Python path so 'app' module can be found
# This allows the script to be run from any directory
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import settings
from app.llm.ollama_client import LLMClient


def test_gemini():
    """Test Gemini API connectivity."""
    print(f"Testing Gemini API (model: {settings.GEMINI_MODEL})...")

    client = LLMClient()

    if client.health_check():
        print("✅ Gemini API key is configured!\n")
    else:
        print("❌ Gemini API key is NOT set in .env")
        print("   Add GEMINI_API_KEY=your-key to the .env file")
        print("   Get a free key at https://aistudio.google.com/apikey")
        return

    try:
        response = client.generate("Hello, what is 2+2? Answer in one word.")
        print(f"✅ Gemini response: {response[:200]}...\n")
        print("Gemini is working correctly!")
    except Exception as e:
        print(f"❌ Generation failed: {e}")


if __name__ == "__main__":
    test_gemini()
