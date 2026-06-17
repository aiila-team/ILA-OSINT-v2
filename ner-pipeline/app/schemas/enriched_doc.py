from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator

class EnrichedDocument(BaseModel):
    # ── core ──────────────────────────────────────────────────────────────────
    source: str
    source_id: str
    content: str
    published_at: datetime
    collected_at: datetime
    author_id: str | None = None
    media_urls: list[str] = Field(default_factory=list)
    source_metadata: dict = Field(default_factory=dict)

    # ── dedup stage ───────────────────────────────────────────────────────────
    content_hash: str = ""
    is_duplicate: bool = False
    duplicate_of: str | None = None

    # ── translation stage ─────────────────────────────────────────────────────
    language: str | None = None
    translated_content: str | None = None
    translation_confidence: float | None = None
    translation_failed: bool = False

    # ── OCR stage ─────────────────────────────────────────────────────────────
    ocr_text: str | None = None

    # ── embed stage ───────────────────────────────────────────────────────────
    embedding: list[float] | None = None
    cluster_id: str | None = None

    # ── pipeline metadata ─────────────────────────────────────────────────────
    pipeline_version: str = "1.0.0"
    processed_at: datetime | None = None

    @field_validator("published_at", "collected_at", "processed_at", mode="before")
    @classmethod
    def ensure_utc(cls, v: datetime | str) -> datetime | None:
        if v is None:
            return None
        if isinstance(v, str):
            try:
                v = datetime.fromisoformat(v.replace("Z", "+00:00"))
            except ValueError:
                return datetime.now(timezone.utc)
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v.astimezone(timezone.utc)
        return datetime.now(timezone.utc)

    def get_extractable_fields(self) -> dict[str, str]:
        """
        Returns all text fields available for extraction,
        keyed by source_field name. Truncated based on configuration.
        """
        try:
            from app.config import settings
            limit = settings.NER_MAX_CONTENT_CHARS
        except Exception:
            limit = 10000

        fields: dict[str, str] = {}
        if self.content:
            fields["content"] = self.content[:limit]
        if self.translated_content:
            fields["translated_content"] = self.translated_content[:limit]
        if self.ocr_text:
            fields["ocr_text"] = self.ocr_text[:limit]
        return fields
