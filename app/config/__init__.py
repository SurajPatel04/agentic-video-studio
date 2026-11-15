from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Same convention as the discovery service: credentials live in the tracking URI,
    # e.g. https://user:password@dev.landnextrole.com/mlflow
    MLFLOW_TRACKING_URI: str = ""
    # Optional. When empty it is derived as {MLFLOW_TRACKING_URI}/gateway/openai/v1.
    MLFLOW_GATEWAY_BASE_URL: str = ""
    # Gateway route name (the "model" sent to the OpenAI-compatible gateway).
    DEFAULT_MODEL: str = "summary"
    LLM_TIMEOUT_SECONDS: float = 60.0


settings = Settings()
