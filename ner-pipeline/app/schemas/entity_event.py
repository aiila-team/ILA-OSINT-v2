from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.extracted_entity import ExtractedEntity

class EntityEvent(BaseModel):
    # ── passthrough from EnrichedDocument ────────────────────────────────────
    source: str
    source_id: str
    published_at: datetime
    language: str | None = None

    # ── pipeline stamp ────────────────────────────────────────────────────────
    processed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    # ── extracted entities ────────────────────────────────────────────────────
    entities: list[ExtractedEntity] = Field(default_factory=list)
    entity_count: int = 0
    entity_type_counts: dict[str, int] = Field(default_factory=dict)

    # ── extraction metadata ───────────────────────────────────────────────────
    has_ml_entities: bool = False        # True if person/org/location found
    extraction_partial: bool = False     # True if chord error handler fired
    failed_extractors: list[str] = Field(default_factory=list)

    # ── versioning ────────────────────────────────────────────────────────────
    pipeline_version: str = "1.0.0"

    @field_validator("published_at", mode="before")
    @classmethod
    def ensure_utc(cls, v: datetime | str) -> datetime:
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

    @model_validator(mode="after")
    def auto_compute_counts(self) -> "EntityEvent":
        """Automatically calls compute_counts on initialization or update."""
        self.compute_counts()
        return self

    def compute_counts(self) -> "EntityEvent":
        """
        Populates entity_count, entity_type_counts, and has_ml_entities.
        """
        self.entity_count = len(self.entities)
        counts: dict[str, int] = {}
        for entity in self.entities:
            counts[entity.entity_type] = counts.get(entity.entity_type, 0) + 1
        self.entity_type_counts = counts
        self.has_ml_entities = any(
            e.entity_type in {"person", "org", "location"}
            for e in self.entities
        )
        return self
