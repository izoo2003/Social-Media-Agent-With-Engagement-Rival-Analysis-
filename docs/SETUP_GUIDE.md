# Setup Guide - Local Development

## Prerequisites

- **Python 3.10+** (for backend)
- **Node.js 18+** (for frontend)
- **PostgreSQL 14+** or Supabase account
- **Ollama** (for local LLM)
- **Git** & **Docker** (optional, for containerized setup)

## Quick Start (5 minutes)

### 1. Clone & Setup Project

```bash
cd /path/to/kafi-social-agent
git clone <repo-url> .
```

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Copy environment template
cp .env.example .env

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Initialize database
python scripts/setup_db.py

# Start FastAPI server
python main.py
```

Backend runs at `http://localhost:8000`

### 3. Frontend Setup

```bash
# Navigate to frontend (new terminal)
cd frontend

# Copy environment template
cp .env.local.example .env.local

# Install Node dependencies
npm install

# Start Next.js dev server
npm run dev
```

Frontend runs at `http://localhost:3000`

### 4. Start Ollama (Local LLM)

```bash
# Download & run Ollama
ollama serve

# In another terminal, pull a model
ollama pull llama2
# or
ollama pull mistral
```

Ollama runs at `http://localhost:11434`

## Detailed Setup Instructions

### Backend Configuration

**1. Database Setup**

Option A: Local PostgreSQL
```bash
# macOS (via Homebrew)
brew install postgresql
brew services start postgresql
psql -c "CREATE DATABASE kafi_social_agent;"
psql -c "CREATE USER kafi_user WITH PASSWORD 'kafi_secure_password';"

# Linux (Ubuntu/Debian)
sudo apt-get install postgresql
sudo -u postgres psql
postgres=# CREATE DATABASE kafi_social_agent;
postgres=# CREATE USER kafi_user WITH PASSWORD 'kafi_secure_password';

# Windows
# Use PostgreSQL installer or WSL
```

Option B: Supabase (Cloud)
```bash
# Sign up at https://supabase.com
# Copy connection string to .env
DATABASE_URL=postgresql://user:password@host:port/database
```

**2. Environment Variables**

Edit `backend/.env`:
```env
DATABASE_URL=postgresql://kafi_user:kafi_secure_password@localhost:5432/kafi_social_agent
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
ENVIRONMENT=development
DEBUG=True
SECRET_KEY=your-dev-secret-key-123
```

**3. Database Initialization**

```bash
python scripts/setup_db.py
# Output: ✅ Created 7 tables: user, content, calendar_event, qa_report, scraper_log, analytics_metric, ...
```

**4. Test Ollama Connection**

```bash
python scripts/test_ollama.py
# Output: ✅ Ollama is running!
# Output: ✅ Generated response: Hello! 2+2 equals 4...
```

### Frontend Configuration

**1. Environment Variables**

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_VERSION=v1
NEXT_PUBLIC_APP_NAME=Kafi Social Agent
NEXT_PUBLIC_FEATURE_CALENDAR=true
NEXT_PUBLIC_FEATURE_ANALYTICS=true
```

**2. Install Dependencies**

```bash
npm install
# or with yarn
yarn install
```

**3. Start Development Server**

```bash
npm run dev
# Visit http://localhost:3000
```

## Docker Compose Setup (All-in-One)

For containerized development:

```bash
# From project root
docker-compose up -d

# Check services
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Pull Ollama model inside container
docker exec kafi-ollama ollama pull llama2

# Stop services
docker-compose down
```

## Verification Checklist

- [ ] Backend API running: `curl http://localhost:8000/health`
- [ ] Frontend loads: Visit `http://localhost:3000`
- [ ] Database connected: Check `backend/app/database/models.py` imports without error
- [ ] Ollama running: `python backend/scripts/test_ollama.py` passes
- [ ] Can see API docs: Visit `http://localhost:8000/docs`

## Common Issues

### Issue: `ModuleNotFoundError: No module named 'sqlalchemy'`
```bash
# Solution: Install dependencies
pip install -r requirements.txt
```

### Issue: `Connection refused` to PostgreSQL
```bash
# Solution: Start PostgreSQL service
# macOS:
brew services start postgresql
# Linux:
sudo systemctl start postgresql
# Windows: Use PostgreSQL service in Services app
```

### Issue: `Connection refused` to Ollama
```bash
# Solution: Start Ollama
ollama serve
# In another terminal:
ollama pull llama2
```

### Issue: Frontend cannot reach backend
```bash
# Ensure CORS is enabled in backend/.env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
# Then restart backend
```

## Next Steps

1. **Explore API Documentation**: Visit `http://localhost:8000/docs`
2. **Check Dashboard**: Visit `http://localhost:3000/dashboard`
3. **Generate Content**: Use the Content Generator page
4. **Review Logs**: Check database logs via `SELECT * FROM scraper_log;`

## Development Tools

### Backend Testing
```bash
# Run tests
pytest app/tests/ -v

# With coverage
pytest app/tests/ --cov=app
```

### Code Quality
```bash
# Linting
flake8 app/

# Type checking
mypy app/

# Code formatting
black app/
```

### Frontend Testing
```bash
# Linting
npm run lint

# Type checking
npm run type-check

# Formatting
npm run format
```

## Support

For issues or questions:
1. Check [Troubleshooting Guide](TROUBLESHOOTING.md)
2. Review [API Documentation](API_DOCUMENTATION.md)
3. Open an issue on GitHub
