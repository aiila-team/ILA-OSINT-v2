from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from ingestion.models import EntityModel, LocationModel, MediaItemModel


class AuthorNormalizationService:
    @staticmethod
    def normalize(raw_author: Any, raw_author_id: Any) -> Dict[str, Any]:
        return {
            "author": str(raw_author).strip() if raw_author else None,
            "author_id": str(raw_author_id).strip() if raw_author_id else None,
        }


class LocationNormalizationService:
    @staticmethod
    def normalize(raw_location: Any) -> LocationModel:
        if not isinstance(raw_location, dict):
            return LocationModel()

        return LocationModel(
            name=raw_location.get("name"),
            country=raw_location.get("country"),
            state=raw_location.get("state"),
            city=raw_location.get("city"),
            lat=raw_location.get("lat"),
            lon=raw_location.get("lon"),
        )


class MediaNormalizationService:
    @staticmethod
    def normalize(raw_media: Any) -> List[MediaItemModel]:
        if isinstance(raw_media, dict):
            raw_media = [raw_media]

        if not isinstance(raw_media, list):
            return []

        cleaned: List[MediaItemModel] = []
        seen_urls = set()
        for item in raw_media:
            if not isinstance(item, dict):
                continue
            url = item.get("url") or item.get("media_url") or item.get("file_url")
            if not url:
                continue
            try:
                media = MediaItemModel(
                    url=url,
                    type=item.get("type") or item.get("media_type"),
                    mime_type=item.get("mime_type"),
                    title=item.get("title"),
                    description=item.get("description"),
                )
            except Exception:
                continue
            if media.url in seen_urls:
                continue
            seen_urls.add(media.url)
            cleaned.append(media)
        return cleaned


class EntityNormalizationService:
    @staticmethod
    def normalize(raw_entities: Any) -> List[EntityModel]:
        if isinstance(raw_entities, dict):
            raw_entities = [raw_entities]
        if not isinstance(raw_entities, list):
            return []

        normalized: List[EntityModel] = []
        for entity in raw_entities:
            if not isinstance(entity, dict):
                continue
            normalized.append(EntityModel(
                type=entity.get("type"),
                value=entity.get("value"),
                metadata=entity.get("metadata"),
            ))
        return normalized


class TimestampNormalizationService:
    @staticmethod
    def to_utc_iso(value: Any) -> str:
        if value is None:
            return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        if isinstance(value, str):
            if value.endswith("Z"):
                return value
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        if isinstance(value, datetime):
            return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        raise ValueError("Unsupported timestamp type")
