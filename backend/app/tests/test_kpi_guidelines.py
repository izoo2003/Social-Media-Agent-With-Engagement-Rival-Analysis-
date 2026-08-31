"""Tests for KPI Guidelines JSON parsing and report-backed compact payload."""

from datetime import date

from app.services.kpi_guidelines import _compact_summary, parse_guidelines


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
    assert parsed["section_reviews"] == []
    assert parsed["self_improvement"] == []
    assert parsed["final_review"] == ""
    assert parsed["work_validity"]["status"] == "questionable"


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


def test_parse_guidelines_detailed_review_fields():
    raw = """
    {
      "verdict": "partial",
      "summary": "Output covers part of a 9-hour shift but logging looks uneven.",
      "work_validity": {
        "status": "questionable",
        "notes": "Manual Canva count is high while auto images are zero."
      },
      "section_reviews": [
        {
          "section": "Posts published",
          "assessment": "Two live posts, both images. Volume is light for three days.",
          "valid": true,
          "improve": "Ship at least one reel with a voiceover."
        }
      ],
      "final_review": "Across catalog, custom, and website cards the designer logged real work, but quiet days and missing reels mean the shift is only partial. Next: fill the pipeline and log Canva work with notes.",
      "self_improvement": [
        "Keep a daily closing checklist so quiet days are planned, not accidental."
      ],
      "more_needed": ["Schedule tomorrow's reel"],
      "improvements": [],
      "post_notes": []
    }
    """
    parsed = parse_guidelines(raw)
    assert parsed is not None
    assert parsed["work_validity"]["status"] == "questionable"
    assert "Canva" in parsed["work_validity"]["notes"]
    assert parsed["section_reviews"][0]["section"] == "Posts published"
    assert parsed["section_reviews"][0]["valid"] is True
    assert "quiet days" in parsed["final_review"]
    assert parsed["self_improvement"][0].startswith("Keep a daily")


def test_compact_summary_includes_kpi_report_analysis():
    summary = {
        "from": date(2026, 8, 1),
        "to": date(2026, 8, 3),
        "timezone": "Asia/Karachi",
        "catalog": [
            {
                "key": "images_generated",
                "label": "Images generated",
                "description": "Prompt Studio images",
                "auto": 6,
                "manual": 2,
                "total": 8,
            }
        ],
        "custom": [
            {
                "id": 1,
                "name": "Plugin updates",
                "kind": "website_maintenance",
                "auto": 0,
                "manual": 1,
                "total": 1,
            }
        ],
        "manual_entries": [],
        "daily": [
            {
                "date": date(2026, 8, 1),
                "catalog": {"images_generated": {"auto": 6, "manual": 0, "total": 6}},
                "custom": {},
            },
            {
                "date": date(2026, 8, 2),
                "catalog": {"images_generated": {"auto": 0, "manual": 2, "total": 2}},
                "custom": {"1": {"auto": 0, "manual": 1, "total": 1}},
            },
            {
                "date": date(2026, 8, 3),
                "catalog": {"images_generated": {"auto": 0, "manual": 0, "total": 0}},
                "custom": {},
            },
        ],
    }
    compact = _compact_summary(summary)
    report = compact["report"]
    images = next(m for m in report["catalog"] if m["key"] == "images_generated")
    assert images["auto"] == 6
    assert images["manual"] == 2
    assert images["daily_average"] == 2.67
    assert images["peak_day"] == "2026-08-01"
    assert images["days_with_activity"] == 2
    website = next(m for m in report["named_cards"] if m["label"] == "Plugin updates")
    assert website["total"] == 1
    assert "Website Maintenance" in website["description"]
