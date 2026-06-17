# app/adapters/news.py
from datetime import UTC, datetime

import structlog

from app.adapters.base import SourceAdapter
from app.schemas.raw_event import RawEvent

log = structlog.get_logger()


class NewsAdapter(SourceAdapter):
    """
    Normalises payloads published by the Go news-collector.
    The collector already produces a fairly clean schema — this adapter
    handles edge cases: missing fields, malformed dates, empty content.
    """

    def normalize(self, payload: dict, topic: str) -> RawEvent:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a dictionary")

        raw_source = payload.get("source")
        if isinstance(raw_source, dict):
            source = raw_source.get("publisher") or raw_source.get("feed_name") or "news"
        else:
            source = raw_source or "news"
        source_id = self._source_id(payload)
        content = self._content(payload)
        
        published_at_raw = payload.get("published_at") or payload.get("publishedAt")
        collected_at_raw = payload.get("collected_at") or payload.get("collectedAt")
        
        published_at = self._parse_dt(published_at_raw)
        collected_at = self._parse_dt(collected_at_raw)
        
        author_id = self._author_id(payload)
        media_urls = self._media_urls(payload)
        
        language_hint = (
            payload.get("language_hint")
            or payload.get("language")
            or payload.get("lang")
        )
        
        source_metadata = self._metadata(payload, topic)

        return RawEvent(
            source=str(source),
            source_id=str(source_id),
            content=str(content),
            published_at=published_at,
            collected_at=collected_at,
            author_id=author_id,
            media_urls=media_urls,
            language_hint=str(language_hint) if language_hint else None,
            source_metadata=source_metadata,
        )

    # ── field extractors ──────────────────────────────────────────────────────

    def _source_id(self, payload: dict) -> str:
        # Prioritize fingerprint_hash (stable deterministic identifier from collector)
        # over random id/source_id UUIDs to enable true idempotency/deduplication downstream.
        sid = (
            payload.get("source_id")
            or payload.get("fingerprint_hash")
            or payload.get("id")
            or payload.get("url")
        )
        if not sid:
            raise ValueError(
                "Missing unique identifier (source_id, fingerprint_hash, id, or url) "
                "in news payload"
            )
        return str(sid)

    def _content(self, payload: dict) -> str:
        # Prefer full article body, fall back to summary, then description, then title
        return (
            payload.get("content")
            or payload.get("body")
            or payload.get("summary")
            or payload.get("description")
            or payload.get("title")
            or ""
        ).strip()

    def _author_id(self, payload: dict) -> str | None:
        author = (
            payload.get("author_id")
            or payload.get("author")
            or payload.get("creator")
        )
        if isinstance(author, list) and len(author) > 0:
            return str(author[0])
        elif author is not None:
            return str(author)
        return None

    def _media_urls(self, payload: dict) -> list[str]:
        urls = (
            payload.get("media_urls")
            or payload.get("image_urls")
            or payload.get("media")
            or payload.get("images")
            or []
        )
        if isinstance(urls, str):
            urls = [urls]
        elif not isinstance(urls, list):
            urls = []
        return [str(u) for u in urls if u]

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
            log.warning("news_adapter.invalid_datetime", value=value)
            return datetime.now(UTC)

    def _metadata(self, payload: dict, topic: str) -> dict:
        # Preserve news-specific fields that don't map to RawEvent
        raw_source = payload.get("source")
        publisher = payload.get("publisher")
        if not publisher and isinstance(raw_source, dict):
            publisher = raw_source.get("publisher")
            
        category = (
            payload.get("category")
            or payload.get("section")
            or payload.get("categories")
        )
        if isinstance(category, list) and len(category) > 0:
            category = category[0]

        source_metadata = {
            "title": payload.get("title"),
            "url": payload.get("url"),
            "publisher": publisher,
            "category": category,
            "topic_received": topic,
        }
        # Add any other payload keys that are not part of canonical schema to source_metadata
        for k, v in payload.items():
            if k not in [
                "source", "source_id", "id", "content", "body", "description", 
                "published_at", "publishedAt", "collected_at", "collectedAt", 
                "author_id", "author", "creator", "media_urls", "media", 
                "language_hint", "language", "lang", "fingerprint_hash",
                "image_urls", "images"
            ]:
                source_metadata[k] = v
        return source_metadata

