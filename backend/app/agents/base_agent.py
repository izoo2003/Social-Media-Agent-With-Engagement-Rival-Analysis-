"""
Base Agent Class - Abstract foundation for all AI agents
"""

from abc import ABC, abstractmethod
from typing import Any, Dict

from pydantic import BaseModel


class AgentOutput(BaseModel):
    """Standard output format for all agents."""

    success: bool
    data: Dict[str, Any] = {}
    message: str = ""
    errors: list[str] = []


class BaseAgent(ABC):
    """Abstract base class for all AI agents."""

    def __init__(self, model_name: str = "gemini-3.5-flash", temperature: float = 0.7):
        self.model_name = model_name
        self.temperature = temperature

    @abstractmethod
    async def execute(self, **kwargs) -> AgentOutput:
        """Execute agent task. Must be implemented by subclasses."""
        pass

    def _format_output(
        self, success: bool, data: Dict[str, Any] = None, message: str = "", errors: list = None
    ) -> AgentOutput:
        """Format standardized agent output."""
        return AgentOutput(
            success=success,
            data=data or {},
            message=message,
            errors=errors or [],
        )
