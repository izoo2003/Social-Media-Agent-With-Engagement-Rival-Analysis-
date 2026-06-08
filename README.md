# Kafi Commodities Social Media & Branding AI Agent

Multi-agent AI system for social media strategy, content generation, and optimization for B2B/B2C agricultural export corporation.

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+ (for frontend)
- PostgreSQL or Supabase
- Google Gemini API key (free, get one at https://aistudio.google.com/apikey)

### Setup

1. **Backend Setup**
   ```bash
   cd backend
   cp .env.example .env
   pip install -r requirements.txt
   python scripts/setup_db.py
   python main.py
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   cp .env.local.example .env.local
   npm install
   npm run dev
   ```

### Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [Setup Guide](docs/SETUP_GUIDE.md)
- [Agent Design](docs/AGENT_DESIGN.md)

## Features

✅ Multi-platform content generation (LinkedIn, TikTok, Facebook, YouTube, WhatsApp)
✅ SWOT analysis & competitor research
✅ AI-powered QA compliance checking
✅ Content calendar management
✅ Real-time analytics dashboard
✅ 100% local & free-tier compatible

## Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS, Recharts
- **Backend**: FastAPI, Python 3.10+
- **Database**: PostgreSQL/Supabase
- **LLM**: Google Gemini API (gemini-2.0-flash, free tier)
- **AI Framework**: CrewAI/Langflow

## Project Structure

```
kafi-social-agent/
├── frontend/          # Next.js React application
├── backend/           # FastAPI Python backend
├── docs/              # Documentation
├── .github/workflows/ # CI/CD pipelines
└── misc/              # Docker configs, scripts
```

## License

MIT License - See LICENSE file for details

## Author

Built for **Kafi Commodities (Pvt) Ltd** - Global Agro-Commodity Exporter
