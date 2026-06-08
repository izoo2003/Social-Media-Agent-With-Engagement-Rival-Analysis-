# API Documentation

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

Currently, the API uses no authentication. In production, JWT tokens will be required.

## Response Format

All responses follow this standard format:

```json
{
  "status": "success|error",
  "data": {},
  "message": "Optional message",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Endpoints

### Health Check

#### GET /health
Check API health status.

**Response:**
```json
{
  "status": "healthy",
  "service": "Kafi Social Agent API"
}
```

### Content Generation

#### POST /content/generate
Generate content for specified platforms.

**Request Body:**
```json
{
  "platforms": ["linkedin", "facebook"],
  "topic": "New Rice Export Initiative",
  "brand_context": "Kafi Commodities",
  "tone": "professional",
  "target_audience": "business",
  "call_to_action": "Learn more",
  "additional_instructions": "Focus on sustainability"
}
```

**Response:**
```json
{
  "content_id": 1,
  "platform": "linkedin",
  "title": "Kafi Commodities Announces New Rice Export Initiative",
  "body": "We're excited to announce...",
  "metadata": {
    "hashtags": ["#Rice", "#Export", "#Agriculture"],
    "keywords": ["sustainable", "quality", "bulk"],
    "tone": "professional",
    "target_audience": "business"
  },
  "status": "generated",
  "generated_at": "2024-01-15T10:30:00Z"
}
```

#### GET /content/history
Fetch content generation history.

**Query Parameters:**
- `skip` (int): Skip N records (default: 0)
- `limit` (int): Return N records (default: 20)
- `platform` (string): Filter by platform

**Response:**
```json
[
  {
    "id": 1,
    "platform": "linkedin",
    "title": "Content Title",
    "status": "generated",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:35:00Z"
  }
]
```

#### GET /content/{content_id}
Get detailed content information.

### Content Calendar

#### GET /calendar/events
Fetch scheduled content events.

**Query Parameters:**
- `skip` (int): Skip N records
- `limit` (int): Return N records
- `start_date` (string): ISO format date
- `end_date` (string): ISO format date

#### POST /calendar/events
Schedule content for publication.

**Request Body:**
```json
{
  "content_id": 1,
  "scheduled_date": "2024-02-01T09:00:00Z"
}
```

#### PUT /calendar/events/{event_id}
Update calendar event.

### Analytics

#### GET /analytics/overview
Get overall analytics dashboard metrics.

**Response:**
```json
{
  "total_content_generated": 42,
  "content_by_platform": {
    "linkedin": 15,
    "facebook": 12,
    "tiktok": 15
  },
  "total_qa_passed": 35,
  "qa_pass_rate": 0.833
}
```

#### GET /analytics/trends
Get trending topics and keywords.

**Query Parameters:**
- `days` (int): Last N days (default: 7)

**Response:**
```json
{
  "trending_hashtags": ["#Rice", "#Export", "#Organic"],
  "trending_keywords": ["sustainable", "quality", "bulk"],
  "trending_topics": ["Climate action", "Fair trade", "Sustainability"]
}
```

### QA/Compliance

#### POST /qa/check
Run QA compliance check on content.

**Request Body:**
```json
{
  "content_id": 1
}
```

**Response:**
```json
{
  "content_id": 1,
  "status": "passed",
  "score": 0.92,
  "issues": [
    {
      "severity": "warning",
      "message": "Consider adding call-to-action"
    }
  ],
  "recommendations": ["Add contact info", "Increase emoji usage for social"]
}
```

#### GET /qa/reports/{report_id}
Get detailed QA report.

### Scraper Management

#### GET /scraper/logs
Fetch scraper execution logs.

**Query Parameters:**
- `scraper_name` (string): Filter by scraper
- `skip` (int): Skip N records
- `limit` (int): Return N records

**Response:**
```json
[
  {
    "id": 1,
    "scraper_name": "competitor_blog_scraper",
    "status": "completed",
    "records_fetched": 150,
    "records_saved": 142,
    "started_at": "2024-01-15T00:00:00Z",
    "completed_at": "2024-01-15T00:05:30Z"
  }
]
```

#### POST /scraper/trigger
Manually trigger a scraper.

**Request Body:**
```json
{
  "scraper_name": "competitor_blog_scraper"
}
```

**Response:**
```json
{
  "scraper_name": "competitor_blog_scraper",
  "status": "triggered",
  "message": "Scraper execution started"
}
```

## Error Responses

### 400 Bad Request
```json
{
  "detail": "Invalid input parameters",
  "error_type": "ValidationError"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error",
  "error_type": "ServerError"
}
```

## Rate Limiting

Currently not implemented. Production implementation will limit:
- Content generation: 100 requests/hour
- General API calls: 1000 requests/hour

## Interactive API Documentation

Swagger UI: `http://localhost:8000/docs`
ReDoc: `http://localhost:8000/redoc`

## Webhooks (Future)

Planned features:
- Content generation completion webhooks
- QA check result webhooks
- Scraper completion webhooks
