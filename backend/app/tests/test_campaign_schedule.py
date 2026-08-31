"""Campaign posts must cover the full duration without clustering into the first half."""

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.campaign import (
    PKT,
    assign_campaign_day_indices,
    spread_campaign_schedule,
)


def test_one_post_per_day_covers_full_thirty_days():
    days = assign_campaign_day_indices(30, 30)
    assert days[0] == 0
    assert days[-1] == 29
    assert days == list(range(30))


def test_fewer_posts_than_days_still_reaches_the_last_day():
    days = assign_campaign_day_indices(15, 30)
    assert days[0] == 0
    assert days[-1] == 29
    assert len(days) == 15
    assert len(set(days)) == 15
    assert max(Counter(days).values()) == 1


def test_fourteen_day_campaign_is_not_compressed():
    days = assign_campaign_day_indices(14, 14)
    assert min(days) == 0
    assert max(days) == 13
    assert len(set(days)) == 14


def test_extra_posts_use_the_full_window_instead_of_doubling_early_days():
    days = assign_campaign_day_indices(45, 30)
    counts = Counter(days)
    assert min(days) == 0
    assert max(days) == 29
    assert set(days) == set(range(30))
    assert max(counts.values()) == 2
    assert min(counts.values()) == 1


def test_spread_rewrites_clustered_llm_dates_across_duration():
    start = date(2026, 9, 1)
    clustered = []
    for i in range(30):
        # Simulate Gemini packing 2 posts/day into the first 15 days.
        day = start.toordinal() + (i // 2)
        local = datetime.fromordinal(day).replace(hour=20, tzinfo=PKT)
        clustered.append(
            SimpleNamespace(
                day_index=i // 2,
                scheduled_at_utc=local.astimezone(timezone.utc).replace(tzinfo=None),
                scheduled_at_pkt=local.isoformat(),
                sort_order=i,
            )
        )

    spread_campaign_schedule(clustered, start_date=start, duration_days=30)
    pkt_dates = [item.scheduled_at_pkt[:10] for item in clustered]
    assert pkt_dates[0] == "2026-09-01"
    assert pkt_dates[-1] == "2026-09-30"
    assert clustered[0].day_index == 0
    assert clustered[-1].day_index == 29
    assert len(set(pkt_dates)) == 30


def test_normalize_items_spreads_clustered_ai_dates():
    from app.services.campaign import CampaignService

    start = date(2026, 9, 1)
    raw = []
    for i in range(30):
        day = start + timedelta(days=i // 2)
        raw.append(
            {
                "day_index": i // 2,
                "scheduled_at_pkt": f"{day.isoformat()}T20:00:00+05:00",
                "title": f"Post {i}",
                "body": "caption",
                "asset_type": "post_image",
                "platforms": ["instagram"],
                "category": "Rice",
            }
        )
    items = CampaignService(db=None)._normalize_items(
        raw,
        campaign_id=1,
        start_date=start,
        duration_days=30,
        default_platforms=["instagram"],
        products=[{"category": "Rice", "product": None}],
    )
    dates = [item.scheduled_at_pkt[:10] for item in items]
    assert dates[0] == "2026-09-01"
    assert dates[-1] == "2026-09-30"
    assert len(set(dates)) == 30
    assert max(Counter(dates).values()) == 1
