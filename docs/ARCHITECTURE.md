# Kafi Social Agent - Architecture Guide

## System Overview

The **Kafi Social Agent** is a modular, multi-agent AI system designed for B2B/B2C social media strategy and content generation for agricultural commodities export.

## Architecture Layers

### 1. **Presentation Layer** (Frontend - Next.js)
- Real-time dashboard with content calendar
- Analytics visualization using Recharts
- Multi-platform content generation interface
- QA compliance reporting
- Scraper activity logs

### 2. **API Layer** (FastAPI - Backend)
- RESTful endpoints for all system operations
- Request validation using Pydantic schemas
- CORS middleware for frontend communication
- Global exception handling
- Health check endpoints

### 3. **Business Logic Layer** (Services)
- Decoupled service classes for content, analytics, QA operations
- Caching layer integration (Redis)
- Database queries and persistence

### 4. **AI Agent Layer** (CrewAI/Langflow)
Three specialized agents orchestrated by a manager:

1. **Strategy Agent**
   - Analyzes market trends via scraped data
   - Performs SWOT analysis
   - Identifies keyword gaps vs competitors
   - Extracts trending hashtags

2. **Creative Agent**
   - Generates platform-specific copy
   - Adapts tone per platform (LinkedIn ≠ TikTok)
   - Creates CTAs and hashtag suggestions
   - Maintains brand voice consistency

3. **QA Agent**
   - Validates content against brand guidelines
   - Checks compliance requirements
   - Scores content quality (0-100)
   - Provides improvement recommendations

### 5. **Data Collection Layer** (Scrapers)
- Competitor blog scraper (BeautifulSoup)
- News feed scraper (Feedparser)
- Social trend aggregator
- Scheduled execution via APScheduler

### 6. **LLM Layer** (Ollama Integration)
- HTTP client for local Ollama inference
- Prompt templating & engineering
- Model configuration management
- Health checks & error handling

### 7. **Data Persistence** (PostgreSQL + SQLAlchemy)
- ORM models for Content, Calendar, QA Reports, Metrics
- Alembic migrations for schema versioning
- Transaction support & data integrity

## Data Flow

```
User Input (Frontend)
    ↓
API Request (FastAPI Routes)
    ↓
Business Logic (Services)
    ↓
Agent Orchestrator
    ├→ Strategy Agent → Ollama LLM → Database
    ├→ Creative Agent → Ollama LLM → Database
    └→ QA Agent → Ollama LLM → Database
    ↓
Response Builder
    ↓
API Response (JSON)
    ↓
Frontend Rendering
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.10+, Uvicorn |
| Database | PostgreSQL, SQLAlchemy ORM, Alembic |
| AI/LLM | Ollama, Langchain, CrewAI |
| Scraping | BeautifulSoup, Feedparser, Requests |
| Utilities | Pydantic, Structlog, APScheduler |

## Key Design Patterns

1. **Service Layer Pattern**: Business logic isolated from HTTP concerns
2. **Repository Pattern**: Database operations abstracted via SQLAlchemy
3. **Orchestrator Pattern**: Agent coordination via central orchestrator
4. **Dependency Injection**: FastAPI dependencies for clean code
5. **Async/Await**: Non-blocking operations for scalability

## Deployment Options

### Development
```bash
# Backend
cd backend && python main.py

# Frontend (separate terminal)
cd frontend && npm run dev
```

### Docker Compose (All-in-one)
```bash
docker-compose up -d
```

### Production
- Backend: Deploy as containerized service (Gunicorn + Uvicorn)
- Frontend: Deploy to Vercel, Netlify, or any static host
- Database: Managed PostgreSQL (AWS RDS, Supabase)
- LLM: Self-hosted Ollama or cloud LLM API

## Security Considerations

1. **Environment Variables**: Sensitive config via `.env` files
2. **CORS**: Restricted origins (configurable)
3. **Input Validation**: All inputs validated via Pydantic
4. **Error Handling**: No sensitive info in error responses
5. **Database**: Use connection pooling, prepared statements

## Performance Optimization

1. **Caching**: Redis for query results, LLM responses
2. **Async Operations**: Non-blocking scrapers, LLM calls
3. **Pagination**: Limit results per API request
4. **Indexing**: Database indices on frequently queried fields
5. **Rate Limiting**: Throttle API requests (future enhancement)

## Monitoring & Logging

- Structured JSON logging via `structlog`
- API response logging with timestamps
- Error tracking and alerts
- Database query performance monitoring
- Agent execution time tracking
