# app/adapters/nasa.py
import json
from datetime import UTC, datetime

import structlog

from app.adapters.base import SourceAdapter
from app.schemas.raw_event import RawEvent

log = structlog.get_logger()


class NasaAdapter(SourceAdapter):
    """
    Normalises payloads from the NASA feed (currently APOD — Astronomy
    Picture of the Day — but written to tolerate other NASA feed shapes
    too). NASA's envelope is the richest of the institutional sources:
    most of the useful detail (event_type, category, media URLs, the
    original source-assigned id) is embedded in a stringified JSON blob
    under `payload` / `collection_metadata` rather than at the top level,
    so this adapter parses those defensively before falling back to
    top-level fields.
    """

    def normalize(self, payload: dict, topic: str) -> RawEvent:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a dictionary")

        nested = self._parse_json_field(payload.get("payload"))
        nested_meta = self._parse_json_field(payload.get("collection_metadata"))

        source = payload.get("source") or payload.get("source_type") or "nasa"
        source_id = self._source_id(payload, nested)
        content = self._content(payload)

        published_at = self._parse_dt(
            payload.get("published_at") or nested.get("published_at")
        )
        collected_at = self._parse_dt(
            payload.get("collected_at")
            or nested.get("collected_at")
            or payload.get("ingested_at")
        )

        author_id = self._author_id(payload)
        media_urls = self._media_urls(payload, nested)
        source_metadata = self._metadata(payload, topic, nested, nested_meta)

        return RawEvent(
            source=str(source),
            source_id=str(source_id),
            content=str(content),
            published_at=published_at,
            collected_at=collected_at,
            author_id=author_id,
            media_urls=media_urls,
            language_hint=None,
            source_metadata=source_metadata,
        )

    # ── field extractors ──────────────────────────────────────────────────────

    def _parse_json_field(self, value) -> dict:
        """`payload` / `collection_metadata` sometimes arrive as
        JSON-encoded strings rather than nested objects. Parses
        defensively and never raises — a malformed nested blob just means
        we fall back to top-level fields instead of failing the whole
        event."""
        if isinstance(value, dict):
            return value
        if isinstance(value, str) and value.strip():
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, dict) else {}
            except (json.JSONDecodeError, TypeError):
                log.warning("nasa_adapter.nested_json_parse_failed")
        return {}

    def _source_id(self, payload: dict, nested: dict) -> str:
        # NASA's APOD feed assigns its own date-based id (e.g.
        # "2026-06-12") inside the nested payload blob — prefer that over
        # our internal event_id since it's the source's own stable key.
        sid = (
            payload.get("source_id")
            or nested.get("source_id")
            or (nested.get("metadata") or {}).get("source_event_id")
            or payload.get("event_id")
            or payload.get("provenance_id")
        )
        if not sid:
            raise ValueError(
                "Missing unique identifier (source_id, event_id, or provenance_id) "
                "in nasa payload"
            )
        return str(sid)

    def _content(self, payload: dict) -> str:
        # NASA's top-level "content" field frequently just duplicates the
        # title; "summary" carries the actual narrative body, so it takes
        # priority here — unlike the news adapter, where content/body are
        # the real article text and summary is a shorter fallback.
        return (
            payload.get("summary")
            or payload.get("content")
            or payload.get("description")
            or payload.get("title")
            or ""
        ).strip()

    def _author_id(self, payload: dict) -> str | None:
        author_data = payload.get("author_data") or {}
        author = (
            payload.get("author_id")
            or payload.get("author")
            or author_data.get("author")
            or author_data.get("author_id")
        )
        return str(author) if author else None

    def _media_urls(self, payload: dict, nested: dict) -> list[str]:
        urls: list[str] = []

        for key in ("media_urls", "media"):
            raw = payload.get(key) or []
            if isinstance(raw, str):
                raw = [raw]
            if isinstance(raw, list):
                urls.extend(str(u) for u in raw if u)

        for key in ("media_url", "hd_media_url"):
            val = nested.get(key)
            if val:
                urls.append(str(val))

        for ref in payload.get("references") or []:
            if isinstance(ref, dict) and ref.get("value"):
                urls.append(str(ref["value"]))
            elif isinstance(ref, str):
                urls.append(ref)

        # de-dupe while preserving first-seen order
        seen: set[str] = set()
        deduped = []
        for u in urls:
            if u not in seen:
                seen.add(u)
                deduped.append(u)
        return deduped

    def _parse_dt(self, value) -> datetime:
        if not value:
            return datetime.now(UTC)
        try:
            if isinstance(value, datetime):
                dt = value
            else:
                dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                return dt.replace(tzinfo=UTC)
            return dt.astimezone(UTC)
        except Exception:
            log.warning("nasa_adapter.invalid_datetime", value=value)
            return datetime.now(UTC)

    def _metadata(self, payload: dict, topic: str, nested: dict, nested_meta: dict) -> dict:
        geo = payload.get("geo_coordinates") or {}
        source_metadata = {
            "event_id": payload.get("event_id"),
            "provenance_id": payload.get("provenance_id"),
            "url": payload.get("source_url"),
            "title": payload.get("title"),
            "topic_received": topic,
            "event_type": nested.get("event_type"),
            "category": nested.get("category"),
            "sub_category": nested.get("sub_category"),
            "severity": nested.get("severity"),
            "media_type": nested.get("media_type"),
            "provider": nested.get("provider"),
            "tags": payload.get("tags") or nested.get("tags") or [],
            "locations": payload.get("locations") or [],
            "geo_coordinates": geo if any(geo.values()) else None,
            "copyright": nested_meta.get("copyright") or (nested.get("raw") or {}).get("copyright"),
        }

        for k, v in payload.items():
            if k not in [
                "source", "source_type", "source_id", "event_id", "provenance_id",
                "content", "summary", "description", "title", "source_url",
                "published_at", "publishedAt", "collected_at", "collectedAt",
                "ingested_at", "author_id", "author", "author_data",
                "media_urls", "media", "references", "tags", "locations",
                "geo_coordinates", "payload", "collection_metadata",
            ]:
                source_metadata[k] = v
        return source_metadata