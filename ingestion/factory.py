from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ingestion.models import (
    AuthorModel,
    EntityModel,
    LocationModel,
    MediaItemModel,
    RawEvent,
    ReferenceModel,
)


class RawEventFactory:
    @staticmethod
    def create(
        source: str,
        source_type: str,
        extracted_payload: Dict[str, Any],
    ) -> RawEvent:
        event_id = extracted_payload.get("event_id") or f"{source}_{uuid.uuid4()}"
        provenance_id = extracted_payload.get("provenance_id") or str(uuid.uuid4())

        published_at = RawEvent.build_timestamp(extracted_payload.get("published_at") or extracted_payload.get("date") or datetime.utcnow().isoformat())
        ingested_at = RawEvent.build_timestamp(extracted_payload.get("ingested_at") or datetime.utcnow().isoformat())
        collected_at = RawEvent.build_timestamp(extracted_payload.get("collected_at") or extracted_payload.get("ingested_at") or datetime.utcnow().isoformat())

        author_data = RawEventFactory._normalize_author(source, extracted_payload)
        location_data = RawEventFactory._normalize_location(extracted_payload)
        media_items = RawEventFactory._normalize_media(extracted_payload)
        entities = RawEventFactory._normalize_entities(extracted_payload)
        references = RawEventFactory._normalize_references(extracted_payload)

        content = extracted_payload.get("content") or extracted_payload.get("title") or ""
        if not content:
            raise ValueError("RawEvent content cannot be empty")

        raw_event = RawEvent(
            event_id=event_id,
            provenance_id=provenance_id,
            source=source,
            source_type=source_type,
            title=extracted_payload.get("title"),
            content=content,
            summary=extracted_payload.get("summary"),
            published_at=published_at,
            ingested_at=ingested_at,
            collected_at=collected_at,
            author=author_data.author,
            author_id=author_data.author_id,
            author_data=author_data,
            location=location_data.name,
            geo_coordinates=location_data,
            locations=[location_data] if location_data.name else [],
            media_urls=[str(item.url) for item in media_items],
            media=media_items,
            entities=entities,
            references=references,
            tags=RawEventFactory._normalize_tags(extracted_payload),
            payload=extracted_payload,
            collection_metadata=RawEventFactory._normalize_collection_metadata(extracted_payload),
        )

        return raw_event

    @staticmethod
    def _normalize_str_id(value: Any) -> Optional[str]:
        if value is None:
            return None

        normalized = str(value).strip()
        return normalized if normalized else None

    @staticmethod
    def _normalize_str(value: Any) -> Optional[str]:
        if value is None:
            return None

        normalized = str(value).strip()
        return normalized if normalized else None

    @staticmethod
    def _normalize_author(source: str, extracted_payload: Dict[str, Any]) -> AuthorModel:
        author = None
        author_id = None
        source_name = None
        source_id = None

        if source == "telegram":
            user = extracted_payload.get("user") or {}
            author = user.get("username") or user.get("first_name") or user.get("last_name")
            author_id = user.get("user_id")
            source_name = "telegram"
            source_id = extracted_payload.get("source_id")
        elif source == "youtube":
            author = extracted_payload.get("user") or extracted_payload.get("author")
            author_id = extracted_payload.get("user_id") or extracted_payload.get("channel_id")
            source_name = "youtube"
            source_id = extracted_payload.get("source_id")
        else:
            author = extracted_payload.get("author") or extracted_payload.get("publisher")
            author_id = extracted_payload.get("author_id")
            source_name = source
            source_id = extracted_payload.get("source_id")

        author = RawEventFactory._normalize_str(author)
        author_id = RawEventFactory._normalize_str_id(author_id)
        source_id = RawEventFactory._normalize_str_id(source_id)

        return AuthorModel(
            author=author,
            author_id=author_id,
            source_name=source_name,
            source_id=source_id,
        )

    @staticmethod
    def _normalize_location(extracted_payload: Dict[str, Any]) -> LocationModel:
        location_dict = extracted_payload.get("location") or extracted_payload.get("locations") or {}

        if isinstance(location_dict, list):
            location_dict = location_dict[0] if location_dict else {}

        if not isinstance(location_dict, dict):
            return LocationModel()

        return LocationModel(
            name=location_dict.get("name"),
            country=location_dict.get("country"),
            state=location_dict.get("state"),
            city=location_dict.get("city"),
            lat=location_dict.get("lat"),
            lon=location_dict.get("lon"),
        )

    @staticmethod
    def _normalize_media(extracted_payload: Dict[str, Any]) -> List[MediaItemModel]:
        raw_media = extracted_payload.get("media_files") or extracted_payload.get("media") or []

        if isinstance(raw_media, dict):
            raw_media = [raw_media]

        items: List[MediaItemModel] = []
        seen_urls = set()
        for item in raw_media:
            if not isinstance(item, dict):
                continue
            url = item.get("url") or item.get("file_url") or item.get("media_url")
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
            if media.url not in seen_urls:
                seen_urls.add(media.url)
                items.append(media)

        return items

    @staticmethod
    def _normalize_entities(extracted_payload: Dict[str, Any]) -> List[EntityModel]:
        raw_entities = extracted_payload.get("entities") or []
        if isinstance(raw_entities, dict):
            if "type" in raw_entities or "value" in raw_entities:
                raw_entities = [raw_entities]
            else:
                flat_entities = []
                for entity_type, values in raw_entities.items():
                    if isinstance(values, list):
                        for val in values:
                            if val:
                                flat_entities.append({
                                    "type": entity_type,
                                    "value": str(val),
                                })
                    elif values is not None:
                        flat_entities.append({
                            "type": entity_type,
                            "value": str(values),
                        })
                raw_entities = flat_entities

        items: List[EntityModel] = []
        for item in raw_entities:
            if not isinstance(item, dict):
                continue
            items.append(EntityModel(
                type=item.get("type"),
                value=item.get("value"),
                metadata=item.get("metadata"),
            ))
        return items

    @staticmethod
    def _normalize_references(extracted_payload: Dict[str, Any]) -> List[ReferenceModel]:
        raw_references = extracted_payload.get("references") or []
        if isinstance(raw_references, dict):
            raw_references = [raw_references]

        items: List[ReferenceModel] = []
        for item in raw_references:
            if not isinstance(item, dict):
                continue
            items.append(ReferenceModel(
                type=item.get("type"),
                value=item.get("value"),
            ))
        return items

    @staticmethod
    def _normalize_tags(extracted_payload: Dict[str, Any]) -> List[str]:
        raw_tags = extracted_payload.get("tags") or []
        if isinstance(raw_tags, str):
            raw_tags = [raw_tags]
        return [str(tag).strip() for tag in raw_tags if tag]

    @staticmethod
    def _normalize_collection_metadata(extracted_payload: Dict[str, Any]) -> Dict[str, Any]:
        metadata = extracted_payload.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        metadata.update({"source_event_id": extracted_payload.get("event_id")})
        return metadata
