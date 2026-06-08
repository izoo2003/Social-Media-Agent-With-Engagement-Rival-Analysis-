"""
LinkedIn Workflow Test Script
Tests the full pipeline: content generation -> LinkedIn posting (draft mode)

Run this (with venv activated & backend running) from the backend/ directory:
    python scripts/test_linkedin_workflow.py

Requires:
- Backend server running (python main.py)
- Ollama running with a model (ollama serve)
- .env with OLLAMA_MODEL set (e.g., OLLAMA_MODEL=mistral)
"""

import json
import sys
import time
from pathlib import Path

import requests

API_BASE = "http://localhost:8000/api/v1"

def test_health():
    """Step 1: Check server health."""
    print("\n" + "="*60)
    print("STEP 1: Checking API Health")
    print("="*60)
    try:
        r = requests.get(f"{API_BASE}/health", timeout=5)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.json()}")
        return r.status_code == 200
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return False


def test_generate_content():
    """Step 2: Generate AI content for LinkedIn."""
    print("\n" + "="*60)
    print("STEP 2: Generating AI Content for LinkedIn")
    print("="*60)
    
    payload = {
        "platforms": ["linkedin"],
        "topic": "New sustainable rice export partnership with EU buyers",
        "brand_context": "Kafi Commodities",
        "tone": "professional",
        "target_audience": "business",
        "call_to_action": "Contact our team for bulk pricing",
        "additional_instructions": "Focus on sustainability and quality"
    }
    
    try:
        print("  Sending request to Ollama (this may take 10-30 seconds)...")
        r = requests.post(
            f"{API_BASE}/content/generate",
            json=payload,
            timeout=120
        )
        print(f"  Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            print(f"  ✅ Content generated successfully!")
            for item in data:
                print(f"     - Platform: {item['platform']}")
                print(f"     - Title: {item['title'][:80]}...")
                print(f"     - Content ID: {item['content_id']}")
                print(f"     - Status: {item['status']}")
            return data
        else:
            print(f"  ❌ FAILED: {r.text[:500]}")
            return None
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return None


def test_post_to_linkedin(content_id: int):
    """Step 3: Post to LinkedIn in DRAFT mode (safe - no API call)."""
    print("\n" + "="*60)
    print(f"STEP 3: Posting Content #{content_id} to LinkedIn (DRAFT MODE)")
    print("="*60)
    print("  ✅ DRAFT MODE - No actual API call to LinkedIn will be made")
    
    payload = {
        "content_id": content_id,
        "platforms": ["linkedin"],
        "draft_mode": True  # SAFE - simulates posting
    }
    
    try:
        r = requests.post(
            f"{API_BASE}/content/{content_id}/post",
            json=payload,
            timeout=30
        )
        print(f"  Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            for result in data:
                print(f"  ✅ LinkedIn post result:")
                print(f"     - Status: {result['status']}")
                print(f"     - Platform: {result['platform']}")
                print(f"     - Post ID: {result.get('post_id', 'N/A')}")
                print(f"     - Post URL: {result.get('post_url', 'N/A')}")
                print(f"     - Error: {result.get('error_message', 'None')}")
            return data
        else:
            print(f"  ❌ FAILED: {r.text[:500]}")
            return None
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        return None


def test_check_post_status(content_id: int):
    """Step 4: Check the content detail to see linkedin_post_status."""
    print("\n" + "="*60)
    print(f"STEP 4: Checking Content #{content_id} Post Status")
    print("="*60)
    try:
        r = requests.get(f"{API_BASE}/content/{content_id}", timeout=10)
        print(f"  Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            print(f"  Content: {data['title'][:60]}...")
            print(f"  LinkedIn Post Status: {data.get('linkedin_post_status', 'N/A')}")
            print(f"  LinkedIn Post ID: {data.get('linkedin_post_id', 'N/A')}")
            print(f"  Facebook Post Status: {data.get('facebook_post_status', 'N/A')}")
            print(f"  Instagram Post Status: {data.get('instagram_post_status', 'N/A')}")
        else:
            print(f"  ❌ FAILED: {r.text[:500]}")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")


def test_content_history():
    """Step 5: Check content history."""
    print("\n" + "="*60)
    print("STEP 5: Checking Content History")
    print("="*60)
    try:
        r = requests.get(f"{API_BASE}/content/history?limit=5", timeout=10)
        print(f"  Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            print(f"  Found {len(data)} content records")
            for item in data:
                print(f"     - ID: {item['id']} | Platform: {item['platform']} | Status: {item['status']}")
        else:
            print(f"  Response: {r.text[:300]}")
    except Exception as e:
        print(f"  ❌ FAILED: {e}")


if __name__ == "__main__":
    print("\n" + "🔷"*15)
    print("     LINKEDIN WORKFLOW TEST")
    print("🔷"*15 + "\n")
    print("This will test in DRAFT MODE only (no live posting).")
    
    # Step 1: Health check
    if not test_health():
        print("\n❌ Server not running. Start with: python main.py")
        sys.exit(1)
    
    # Step 2: Generate content
    content_data = test_generate_content()
    
    if content_data:
        content_id = content_data[0]['content_id']
        
        # Step 3: Post to LinkedIn (draft mode)
        test_post_to_linkedin(content_id)
        
        # Step 4: Check post status
        test_check_post_status(content_id)
    else:
        print("\n⚠️  Skipping LinkedIn post test since content generation failed.")
        print("   If the issue is Ollama model not found, ensure:")
        print("   1. OLLAMA_MODEL=mistral (or your model) is set in backend/.env")
        print("   2. Ollama is running: ollama serve")
    
    # Step 5: Content history
    test_content_history()
    
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60)
