# app/schemas/raw_event.py
from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator


class RawEvent(BaseModel):
    source: str = Field(..., description="Source identifier (e.g., news, youtube, telegram)")
    source_id: str = Field(..., description="Unique ID within the source")
    content: str = Field(..., description="Raw text content of the event")
    published_at: datetime = Field(..., description="Datetime the event was published")
    collected_at: datetime = Field(..., description="Datetime the event was ingested/collected")
    author_id: str | None = Field(default=None, description="Author identifier, if available")
    media_urls: list[str] = Field(default_factory=list, description="Associated media URLs")
    language_hint: str | None = Field(
        default=None,
        description="Hint for the language (e.g., 'en', 'hi')",
    )
    source_metadata: dict = Field(
        default_factory=dict,
        description="Source-specific key-value fields",
    )

    @field_validator("published_at", "collected_at", mode="before")
    @classmethod
    def ensure_utc(cls, v: datetime | str) -> datetime:
        if isinstance(v, str):
            v = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v.astimezone(UTC)

    @field_validator("source_id", mode="before")
    @classmethod
    def coerce_to_str(cls, v) -> str:
        # Telegram message IDs are ints — normalise to str here
        return str(v)

    @field_validator("content", mode="before")
    @classmethod
    def strip_content(cls, v: str) -> str:
        return v.strip() if v else ""

    @field_validator("source", mode="before")
    @classmethod
    def lowercase_source(cls, v: str) -> str:
        return v.lower().strip()
