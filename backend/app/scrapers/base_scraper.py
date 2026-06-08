"""
Scraper Base Class
"""

from abc import ABC, abstractmethod
from datetime import datetime

from app.database.models import ScraperLog


class BaseScraper(ABC):
    """Abstract base class for all scrapers."""

    def __init__(self, name: str, timeout: int = 30):
        self.name = name
        self.timeout = timeout
        self.records_fetched = 0
        self.records_saved = 0
        self.error_message = None

    @abstractmethod
    async def fetch(self) -> list:
        """Fetch data from source. Must be implemented by subclasses."""
        pass

    @abstractmethod
    async def parse(self, data: list) -> list:
        """Parse fetched data. Must be implemented by subclasses."""
        pass

    async def run(self) -> ScraperLog:
        """Execute complete scraper workflow."""
        try:
            raw_data = await self.fetch()
            self.records_fetched = len(raw_data)

            parsed_data = await self.parse(raw_data)
            self.records_saved = len(parsed_data)

            return ScraperLog(
                scraper_name=self.name,
                status="completed",
                records_fetched=self.records_fetched,
                records_saved=self.records_saved,
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
            )
        except Exception as e:
            self.error_message = str(e)
            return ScraperLog(
                scraper_name=self.name,
                status="failed",
                error_message=self.error_message,
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
            )
