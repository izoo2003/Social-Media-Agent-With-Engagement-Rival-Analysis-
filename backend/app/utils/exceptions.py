"""
Custom Exceptions
"""


class KafiAgentException(Exception):
    """Base exception for Kafi Social Agent."""

    pass


class LLMConnectionError(KafiAgentException):
    """Failed to connect to the LLM provider."""

    pass


# Backward compatibility alias
OllamaConnectionError = LLMConnectionError


class ContentGenerationError(KafiAgentException):
    """Content generation failed."""

    pass


class ScraperError(KafiAgentException):
    """Scraper execution error."""

    pass


class QACheckError(KafiAgentException):
    """QA check failed."""

    pass


class DatabaseError(KafiAgentException):
    """Database operation failed."""

    pass
