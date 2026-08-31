"""KPI Reports analysis — totals, peaks, and period labels."""

from datetime import date

from app.services.kpi_reports import (
    analyze_metric,
    build_report_analysis,
    computed_overview,
    period_label,
)


def test_period_label_daily_week_month():
    assert period_label(date(2026, 8, 31), date(2026, 8, 31)).startswith("Daily")
    assert period_label(date(2026, 8, 24), date(2026, 8, 30)).startswith("Weekly")
    assert "August 2026" in period_label(date(2026, 8, 1), date(2026, 8, 31))


def test_analyze_metric_finds_peak_and_quiet_days():
    daily = [
        {"date": date(2026, 8, 1), "catalog": {"images_generated": {"auto": 0, "manual": 0, "total": 0}}},
        {"date": date(2026, 8, 2), "catalog": {"images_generated": {"auto": 3, "manual": 1, "total": 4}}},
        {"date": date(2026, 8, 3), "catalog": {"images_generated": {"auto": 1, "manual": 0, "total": 1}}},
    ]
    result = analyze_metric(
        key="images_generated",
        label="Images generated",
        description="Product images",
        totals={"auto": 4, "manual": 1, "total": 5},
        daily=daily,
        cell_fn=lambda row: row["catalog"]["images_generated"],
    )
    assert result["days_with_activity"] == 2
    assert result["days_in_range"] == 3
    assert result["peak_day"] == "2026-08-02"
    assert result["peak_total"] == 4
    assert result["daily_average"] == 1.67


def test_build_report_analysis_keeps_each_kpi_distinct():
    summary = {
        "catalog": [
            {
                "key": "posts_published",
                "label": "Posts published",
                "description": "Live posts",
                "auto": 2,
                "manual": 0,
                "total": 2,
                "breakdown": {"image": 1, "video": 1},
            },
            {
                "key": "images_generated",
                "label": "Images generated",
                "description": "Prompt Studio images",
                "auto": 5,
                "manual": 0,
                "total": 5,
            },
        ],
        "custom": [],
        "daily": [
            {
                "date": date(2026, 8, 1),
                "catalog": {
                    "posts_published": {"auto": 2, "manual": 0, "total": 2},
                    "images_generated": {"auto": 5, "manual": 0, "total": 5},
                },
                "custom": {},
            }
        ],
    }
    analysis = build_report_analysis(summary)
    keys = [m["key"] for m in analysis["metrics"]]
    assert keys == ["posts_published", "images_generated"]
    published = analysis["metrics"][0]
    assert published["breakdown"] == {"image": 1, "video": 1}
    assert "Posts published" in computed_overview(date(2026, 8, 1), date(2026, 8, 1), analysis)
    assert "images 1" in computed_overview(date(2026, 8, 1), date(2026, 8, 1), analysis)


def test_build_report_analysis_splits_website_maintenance_description():
    summary = {
        "catalog": [],
        "custom": [
            {
                "id": 1,
                "name": "Plugin updates",
                "kind": "website_maintenance",
                "auto": 0,
                "manual": 2,
                "total": 2,
            },
            {
                "id": 2,
                "name": "Canva graphics",
                "kind": "custom",
                "auto": 0,
                "manual": 1,
                "total": 1,
            },
        ],
        "daily": [
            {
                "date": date(2026, 8, 1),
                "catalog": {},
                "custom": {
                    "1": {"auto": 0, "manual": 2, "total": 2},
                    "2": {"auto": 0, "manual": 1, "total": 1},
                },
            }
        ],
    }
    analysis = build_report_analysis(summary)
    by_key = {m["key"]: m for m in analysis["custom"]}
    assert "Website Maintenance" in by_key["custom:1"]["description"]
    assert "Custom KPI" in by_key["custom:2"]["description"]
    overview = computed_overview(date(2026, 8, 1), date(2026, 8, 1), analysis)
    assert "Plugin updates" in overview
    assert "Canva graphics" in overview
