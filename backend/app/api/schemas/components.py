from pydantic import BaseModel, Field


class ComponentRequest(BaseModel):
    skills: list[str] | None = None
    request: str = Field(min_length=10, max_length=4000)  # what the new scene should show
    name: str | None = Field(default=None, pattern=r"^[A-Z][A-Za-z0-9]{2,40}Scene$")
    model: str | None = None
