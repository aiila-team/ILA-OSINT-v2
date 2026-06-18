from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, constr, field_validator


class LocationModel(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None

    model_config = ConfigDict(validate_default=True, extra='forbid')


class AuthorModel(BaseModel):
    author: Optional[str] = None
    author_id: Optional[str] = None
    source_name: Optional[str] = None
    source_id: Optional[str] = None

    model_config = ConfigDict(validate_default=True, extra='forbid')


class MediaItemModel(BaseModel):
    url: HttpUrl
    type: Optional[str] = None
    mime_type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None

    model_config = ConfigDict(validate_default=True, extra='forbid')


class EntityModel(BaseModel):
    type: Optional[str] = None
    value: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(validate_default=True, extra='forbid')


class ReferenceModel(BaseModel):
    type: Optional[str] = None
    value: Optional[str] = None

    model_config = ConfigDict(validate_default=True, extra='forbid')


class RawEvent(BaseModel):
    event_id: constr(strip_whitespace=True, min_length=1)
    provenance_id: constr(strip_whitespace=True, min_length=1)

    source: constr(strip_whitespace=True, min_length=1)
    source_type: constr(strip_whitespace=True, min_length=1)
    source_url: Optional[HttpUrl] = None

    title: Optional[str] = None
    content: str = Field(..., min_length=1)
    summary: Optional[str] = None

    published_at: datetime
    ingested_at: datetime
    collected_at: datetime

    author: Optional[str] = None
    author_id: Optional[str] = None
    author_data: Optional[AuthorModel] = None

    location: Optional[str] = None
    geo_coordinates: Optional[LocationModel] = None
    locations: List[LocationModel] = Field(default_factory=list)

    media_urls: List[str] = Field(default_factory=list)
    media: List[MediaItemModel] = Field(default_factory=list)

    entities: List[EntityModel] = Field(default_factory=list)
    references: List[ReferenceModel] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

    payload: Dict[str, Any] = Field(default_factory=dict)
    collection_metadata: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(
        extra='forbid',
        frozen=True,
        validate_default=True,
        str_strip_whitespace=True,
    )

    @classmethod
    def build_timestamp(cls, value: Any) -> datetime:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)

        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
            except Exception as exc:
                raise ValueError(f"Invalid timestamp: {value}") from exc

        raise ValueError("published_at must be datetime or ISO8601 string")

    @field_validator("published_at", "ingested_at", "collected_at", mode="before")
    @classmethod
    def validate_timestamp(cls, value: Any) -> datetime:
        return cls.build_timestamp(value)
