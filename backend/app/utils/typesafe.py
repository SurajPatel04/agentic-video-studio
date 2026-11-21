"""LangChain TypeSafe decisions and provider usage accounting."""

from types import SimpleNamespace

from httpx2 import AsyncClient, Client
from langchain_core.decisions import ClassifierResponse, Question

from app.config import settings
from app.utils.llm_accounting import record_usage


async def decide(state: str, questions: dict[str, Question]) -> ClassifierResponse:
    """Submit a batch of typed questions in a single provider request."""
    from langchain_typesafe import TypeSafeClassifier

    with Client(timeout=30) as client:
        async with AsyncClient(timeout=30) as async_client:
            classifier = TypeSafeClassifier(api_key=settings.TYPESAFE_API_KEY, base_url=settings.TYPESAFE_BASE_URL,
                                            client=client, async_client=async_client)
            response = await classifier.ainvoke({"state": state, "questions": questions})
    message = SimpleNamespace(response_metadata={"model": response.model})
    record_usage(message, response.usage or {}, settings.LLM_PRICING_USD_PER_MTOK)
    return response
