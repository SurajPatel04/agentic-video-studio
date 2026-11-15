from fastapi import FastAPI, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from app.utils.llm import call_model

app = FastAPI(title="Agentic Video Studio API")


class ChatRequest(BaseModel):
    prompt: str
    system: str | None = None
    model: str | None = None  # MLflow gateway route; defaults to DEFAULT_MODEL


class ChatResponse(BaseModel):
    reply: str


@app.get("/")
def hello() -> dict[str, str]:
    return {"message": "Hello"}


@app.post("/llm/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    messages = []
    if req.system:
        messages.append(SystemMessage(req.system))
    messages.append(HumanMessage(req.prompt))
    try:
        reply = await call_model(messages, model=req.model)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM gateway error: {exc}") from exc
    return ChatResponse(reply=reply)
