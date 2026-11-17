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
    LLM_TIMEOUT_SECONDS: float = 1200.0  # 20 min per call; rich diagram plans (IsoScene) can take several minutes
    # "gateway" (default): MLflow routes. "test": every call uses the TEST key (OpenAI) with TEST_MODEL,
    # whatever route name the code asks for. For live tests, keeps test traffic off production.
    LLM_PROFILE: str = "gateway"
    TEST: str = ""  # OpenAI API key for LLM_PROFILE=test (never logged)
    TEST_MODEL: str = "gpt-6-luna"

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
    PLANNER_MAX_TEXT_SHARE: float = 0.3  # at most 30% of scenes may be text-only
    PLANNER_CODE_EVERY: int = 5  # programming topics: >= 1 CodeScene per 5 scenes (0 = off)
    PLANNER_STYLE_RETRIES: int = 1  # retries for style problems; then the plan with the fewest problems is used
    PLANNER_DEFAULT_STYLE: str = "iso-diagrams"  # visual style skill used when no style matches the topic ("" = none)
    PLANNER_MAX_SAME_LAYOUT: int = 2  # IsoScene: the same objects in the same places in at most 2 scenes in a row
    PLANNER_MAX_TEXT_RUN: int = 3  # max Definition/Explain/BulletList scenes in a row (1 style retry, then accepted)

    # Component agent (writes new scenes when nothing in the library fits).
    AGENT_MODEL: str = ""  # MLflow gateway route; empty = DEFAULT_MODEL
    AGENT_MAX_STEPS: int = 40  # LLM calls per component
    AGENT_MAX_CHECKS: int = 6  # check_component runs per component
    AGENT_MAX_INPUT_TOKENS: int = 250_000  # stop a run that gets too expensive
    AGENT_HISTORY_TURNS: int = Field(default=3, ge=1)  # complete recent assistant/tool turns
    AGENT_MAX_CONTEXT_TOKENS: int = Field(default=60_000, ge=1)  # conservative reservation per call
    AGENT_VISION: bool = True  # show the agent its rendered frames after a passing check

    # Long videos (outline -> chapters -> render each -> join).
    LONG_MODEL: str = ""  # outline LLM route; empty = PLANNER_MODEL / DEFAULT_MODEL
    LONG_WORDS_PER_MINUTE: int = 150  # narration speed used for word budgets
    LONG_CHAPTER_MINUTES: float = 5.0  # target length of one chapter
    LONG_WORDS_PER_SCENE: int = 30  # narration words per scene -> scenes per chapter
    LONG_RENDER_WORKERS: int = 2  # chapters rendering at the same time (each render is CPU-heavy)
    LONG_RENDER_CONCURRENCY: int = 0  # Remotion threads per render; 0 = CPU cores / LONG_RENDER_WORKERS
    LONG_PARALLEL_PLANNING: bool = False  # plan all chapters at once (faster; chapters see the outline, not each other)
    LONG_PLAN_WORKERS: int = 4  # LLM calls at once when planning in parallel
    LONG_BUDGET_TOLERANCE: float = 0.35  # chapter narration may be +-35% of its word budget, else re-plan once

    # Console output (app/utils/console.py).
    LOG_LEVEL: str = "INFO"
    LOG_PROMPTS: bool = True  # print LLM prompts and replies (truncated)
    LOG_MAX_CHARS: int = 1500  # per printed message
    LOG_LAST_MESSAGES: int = 3  # long conversations (agent): print only the newest messages
    LOG_COLOR: bool = True  # off automatically when output is not a terminal

    # Rendering (Remotion project + where jobs and videos go).
    RENDERING_DIR: Path = PROJECT_ROOT / "rendering"
    WORKSPACE_DIR: Path = PROJECT_ROOT / "workspace"
    RENDER_TIMEOUT_SECONDS: float = 1800.0
    # Captions: burn = styled in the picture (current word highlighted, cannot be switched off);
    # track = subtitle track the player switches on/off; both = the two. JSON "captions": {"mode"} wins.
    CAPTIONS_MODE: str = "track"
    # Brand (logo intro + corner logo, rendering/src/brand.tsx). Used when the JSON has no "brand" key.
    BRAND_ENABLED: bool = True  # false = no intro and no corner logo
    BRAND_INTRO: bool = True  # animated logo before the first scene
    BRAND_WATERMARK: bool = True  # logo in the corner for the whole video


settings = Settings()
