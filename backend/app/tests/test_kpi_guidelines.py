"""Tests for KPI Guidelines JSON parsing."""

from app.services.kpi_guidelines import parse_guidelines


def test_parse_guidelines_happy_path():
    raw = """
    {
      "verdict": "enough",
      "summary": "Published three posts and generated enough assets for a 9-hour shift.",
      "more_needed": [],
      "improvements": [
        {
          "area": "captions",
          "finding": "Captions are short.",
          "action": "Add a product benefit line.",
          "priority": "medium"
        }
      ],
      "post_notes": [
        {"content_id": 12, "title": "Spice launch", "comment": "Crop tighter on the jar."}
      ]
    }
    """
    parsed = parse_guidelines(raw)
    assert parsed is not None
    assert parsed["verdict"] == "enough"
    assert parsed["verdict_label"] == "Enough for the shift"
    assert "9-hour" in parsed["summary"]
    assert parsed["more_needed"] == []
    assert parsed["improvements"][0]["area"] == "captions"
    assert parsed["post_notes"][0]["content_id"] == 12


def test_parse_guidelines_markdown_fence_and_unknown_verdict():
    raw = """```json
    {
      "verdict": "light",
      "summary": "Only one image went out.",
      "more_needed": ["Schedule tomorrow's reel", ""],
      "improvements": [{"area": "volume", "finding": "Low output", "action": "Ship two more posts"}],
      "post_notes": [{"content_id": "abc", "title": "Reel", "comment": "Add captions."}]
    }
    ```"""
    parsed = parse_guidelines(raw)
    assert parsed is not None
    assert parsed["verdict"] == "partial"
    assert parsed["verdict_label"] == "Partial — more work would help"
    assert parsed["more_needed"] == ["Schedule tomorrow's reel"]
    assert parsed["improvements"][0]["priority"] == "medium"
    assert parsed["post_notes"][0]["content_id"] is None


def test_parse_guidelines_rejects_empty_summary():
    assert parse_guidelines('{"verdict": "enough", "summary": "  "}') is None
    assert parse_guidelines("not json") is None
    assert parse_guidelines("") is None
