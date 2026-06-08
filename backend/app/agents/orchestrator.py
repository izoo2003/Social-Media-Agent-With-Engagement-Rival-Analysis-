"""
Agent Orchestrator
Coordinates multi-agent workflows and manages agent execution
"""

from typing import Dict, Any, List

from app.agents.strategy_agent import StrategyAgent
from app.agents.creative_agent import CreativeAgent
from app.agents.qa_agent import QAAgent


class AgentOrchestrator:
    """Orchestrates agent workflows and execution."""

    def __init__(self):
        self.strategy_agent = StrategyAgent()
        self.creative_agent = CreativeAgent()
        self.qa_agent = QAAgent()

    async def generate_content_workflow(
        self,
        topic: str,
        platforms: List[str],
        brand_context: str = "Kafi Commodities",
        run_qa: bool = True,
    ) -> Dict[str, Any]:
        """
        Complete content generation workflow:
        1. Strategy Agent: Analyze market/trends
        2. Creative Agent: Generate content
        3. QA Agent: Validate quality & compliance
        """
        # Step 1: Strategy analysis
        strategy_result = await self.strategy_agent.execute(
            analysis_type="trends",
            context={"topic": topic},
        )

        # Step 2: Generate content
        creative_result = await self.creative_agent.execute(
            platforms=platforms,
            topic=topic,
            brand_context=brand_context,
            tone="professional",
        )

        # Step 3: QA check
        qa_result = None
        if run_qa:
            qa_result = await self.qa_agent.execute(
                content_text=str(creative_result.data),
                platforms=platforms,
            )

        return {
            "strategy": strategy_result.dict(),
            "creative": creative_result.dict(),
            "qa": qa_result.dict() if qa_result else None,
        }
