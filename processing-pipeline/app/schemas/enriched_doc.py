# app/schemas/enriched_doc.py
from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator


class EnrichedDocument(BaseModel):
    # ── passthrough from RawEvent ─────────────────────────────────────────────
    source: str
    source_id: str
    content: str
    published_at: datetime
    collected_at: datetime
    author_id: str | None = None
    media_urls: list[str] = Field(default_factory=list)
    source_metadata: dict = Field(default_factory=dict)

    # ── dedup stage ───────────────────────────────────────────────────────────
    content_hash: str = ""                         # SHA-256 of raw content
    is_duplicate: bool = False
    duplicate_of: str | None = None                # source_id of the original

    # ── translation stage ─────────────────────────────────────────────────────
    language: str | None = None                    # ISO 639-1 code e.g. "hi", "en"
    translated_content: str | None = None
    translation_confidence: float | None = None
    translation_failed: bool = False

    # ── OCR / ASR stage ───────────────────────────────────────────────────────
    ocr_text: str | None = None                    # extracted from media_urls

    # ── embed stage ───────────────────────────────────────────────────────────
    embedding: list[float] | None = None           # 1024-dim from e5-large
    cluster_id: str | None = None                  # assigned by HDBSCAN batch job

    # ── pipeline metadata ─────────────────────────────────────────────────────
    pipeline_version: str = "1.0.0"
    processed_at: datetime | None = None

    @field_validator("published_at", "collected_at", mode="before")
    @classmethod
    def ensure_utc(cls, v: datetime | str) -> datetime:
        if isinstance(v, str):
            v = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v.astimezone(UTC)

    def is_processable(self) -> bool:
        """Returns False if downstream stages should skip heavy processing."""
        return not self.is_duplicate and bool(self.content)

    def effective_content(self) -> str:
        """Returns the best available text for NLP — translated if available."""
        return self.translated_content or self.content