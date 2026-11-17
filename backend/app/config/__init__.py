from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root: backend/app/config/__init__.py -> parents[3]
PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    # Same convention as the discovery service: credentials live in the tracking URI,
    # e.g. https://user:password@dev.landnextrole.com/mlflow
    MLFLOW_TRACKING_URI: str = ""
    # Optional. When empty it is derived as {MLFLOW_TRACKING_URI}/gateway/openai/v1.
    MLFLOW_GATEWAY_BASE_URL: str = ""
    # Gateway route name (the "model" sent to the OpenAI-compatible gateway).
    DEFAULT_MODEL: str = "summary"
    LLM_TIMEOUT_SECONDS: float = 60.0

    # Deepgram text-to-speech (narration audio).
    DEEPGRAM_TTS_API_KEY: str = ""
    DEEPGRAM_TTS_URL: str = "https://api.deepgram.com/v1/speak"
    TTS_VOICE: str = "aura-2-thalia-en"  # default Deepgram voice
    TTS_SAMPLE_RATE: int = 24000
    TTS_TIMEOUT_SECONDS: float = 60.0
    # Word timings for captions: Deepgram speech-to-text on our own clip (falls back to an estimate).
    DEEPGRAM_STT_API_KEY: str = ""  # empty = use DEEPGRAM_TTS_API_KEY
    DEEPGRAM_STT_URL: str = "https://api.deepgram.com/v1/listen"
    STT_MODEL: str = "nova-3"

    # Planner (LLM writes the composition JSON).
    PLANNER_MODEL: str = ""  # MLflow gateway route; empty = DEFAULT_MODEL
    PLANNER_MAX_ATTEMPTS: int = 3
    PLANNER_MODE: str = "auto"  # auto | catalog | tools
    PLANNER_TOOLS_THRESHOLD: int = 80  # auto: use tools once the library has more scenes than this
    PLANNER_MAX_STEPS: int = 30  # tools mode: max LLM calls (lookups + answers)

    # Component agent (writes new scenes when nothing in the library fits).
    AGENT_MODEL: str = ""  # MLflow gateway route; empty = DEFAULT_MODEL
    AGENT_MAX_STEPS: int = 40  # LLM calls per component
    AGENT_MAX_CHECKS: int = 6  # check_component runs per component
    AGENT_MAX_INPUT_TOKENS: int = 250_000  # stop a run that gets too expensive
    AGENT_HISTORY_TURNS: int = Field(default=3, ge=1)  # complete recent assistant/tool turns
    AGENT_MAX_CONTEXT_TOKENS: int = Field(default=60_000, ge=1)  # conservative reservation per call
    AGENT_VISION: bool = True  # show the agent its rendered frames after a passing check

    # Rendering (Remotion project + where jobs and videos go).
    RENDERING_DIR: Path = PROJECT_ROOT / "rendering"
    WORKSPACE_DIR: Path = PROJECT_ROOT / "workspace"
    RENDER_TIMEOUT_SECONDS: float = 1800.0


settings = Settings()
