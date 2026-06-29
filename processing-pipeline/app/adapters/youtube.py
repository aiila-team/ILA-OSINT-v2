# app/adapters/youtube.py
import json
from datetime import UTC, datetime

import structlog

from app.adapters.base import SourceAdapter
from app.schemas.raw_event import RawEvent

log = structlog.get_logger()


class YoutubeAdapter(SourceAdapter):
    """
    Normalises payloads from the YouTube collector. Unlike the other
    adapters in this module, YouTube's envelope carries a fully nested
    `payload` dict mirroring the raw YouTube Data API comment-thread
    resource — most of the useful structure (the actual comment author,
    as opposed to the video's channel, plus pre-extracted entities) lives
    there rather than at the top level. This adapter prefers the nested
    payload's fields throughout and falls back to the envelope's
    top-level fields only when the nested payload is absent or sparse.
    """

    def normalize(self, payload: dict, topic: str) -> RawEvent:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a dictionary")

        nested = self._nested_payload(payload)
        nested_meta = nested.get("metadata") or {}

        source = nested.get("source") or payload.get("source_type") or "youtube"
        source_id = self._source_id(payload, nested)
        content = self._content(payload, nested)

        published_at = self._parse_dt(
            nested.get("published_at") or payload.get("published_at")
        )
        collected_at = self._parse_dt(
            nested.get("collected_at")
            or payload.get("collected_at")
            or payload.get("ingested_at")
        )

        author_id = self._author_id(nested, nested_meta)
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
            language_hint=nested.get("language_hint") or nested.get("language"),
            source_metadata=source_metadata,
        )

    # ── field extractors ──────────────────────────────────────────────────────

    def _nested_payload(self, payload: dict) -> dict:
        nested = payload.get("payload")
        if isinstance(nested, dict):
            return nested
        if isinstance(nested, str) and nested.strip():
            try:
                parsed = json.loads(nested)
                return parsed if isinstance(parsed, dict) else {}
            except (json.JSONDecodeError, TypeError):
                log.warning("youtube_adapter.nested_json_parse_failed")
        return {}

    def _source_id(self, payload: dict, nested: dict) -> str:
        # Prefer the YouTube comment/thread id (e.g. "Ugy3P7...") — the
        # real stable platform identifier — over our internal event_id.
        sid = (
            nested.get("source_id")
            or payload.get("source_id")
            or nested.get("video_id")
            or payload.get("video_id")
            or nested.get("comment_id")
            or payload.get("comment_id")
            or nested.get("id")
            or payload.get("id")
            or payload.get("event_id")
            or payload.get("provenance_id")
        )
        if not sid:
            raise ValueError(
                "Missing unique identifier (source_id, video_id, comment_id, or event_id) "
                "in youtube payload"
            )
        return str(sid)

    def _content(self, payload: dict, nested: dict) -> str:
        return str(
            nested.get("content")
            or payload.get("content")
            or nested.get("transcript")
            or payload.get("transcript")
            or nested.get("text")
            or payload.get("text")
            or nested.get("description")
            or payload.get("description")
            or nested.get("title")
            or payload.get("title")
            or ""
        ).strip()

    def _author_id(self, nested: dict, nested_meta: dict) -> str | None:
        # The video's *channel* (e.g. "NDTV") is distinct from the actual
        # comment author — prefer the comment author's channel id, since
        # that's who actually authored this piece of content. The video's
        # own channel is preserved separately in source_metadata.
        author_channel_ids = (nested.get("entities") or {}).get("author_channel_ids") or []
        author = (
            nested_meta.get("author_channel_id")
            or (author_channel_ids[0] if author_channel_ids else None)
            or nested.get("user_id")
        )
        return str(author) if author else None

    def _media_urls(self, payload: dict, nested: dict) -> list[str]:
        urls: list[str] = []
        media_files = nested.get("media_files") or payload.get("media_urls") or []
        if isinstance(media_files, list):
            for item in media_files:
                if isinstance(item, dict):
                    url = item.get("url") or item.get("media_url")
                    if url:
                        urls.append(str(url))
                elif item:
                    urls.append(str(item))
        return urls

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
            log.warning("youtube_adapter.invalid_datetime", value=value)
            return datetime.now(UTC)

    def _metadata(self, payload: dict, topic: str, nested: dict, nested_meta: dict) -> dict:
        entities = nested.get("entities") or {}
        source_metadata = {
            "event_id": payload.get("event_id"),
            "provenance_id": payload.get("provenance_id"),
            "url": nested.get("source_url") or payload.get("source_url"),
            "topic_received": topic,
            "record_type": nested_meta.get("record_type"),
            "video_id": nested_meta.get("video_id") or nested.get("video_id"),
            "video_url": nested_meta.get("video_url"),
            "channel_id": nested_meta.get("channel_id") or nested.get("user_id"),
            "channel_name": nested_meta.get("channel_name") or nested.get("user"),
            "channel_priority": nested.get("channel_priority"),
            "author_name": nested_meta.get("author_name"),
            "author_channel_url": nested_meta.get("author_channel_url"),
            "thread_id": nested_meta.get("thread_id"),
            "like_count": nested_meta.get("like_count"),
            "reply_count": nested_meta.get("reply_count"),
            "can_reply": nested_meta.get("can_reply"),
            "category": nested.get("category"),
            "provider": nested.get("provider"),
            "tags": nested.get("tags") or [],
            "video_ids": entities.get("video_ids") or [],
            "channel_ids": entities.get("channel_ids") or [],
            "author_channel_ids": entities.get("author_channel_ids") or [],
            "hashtags": entities.get("hashtags") or [],
            "urls": entities.get("urls") or [],
            "cves": entities.get("cves") or [],
            "phone_numbers": entities.get("phone_numbers") or [],
            "emails": entities.get("emails") or [],
        }
        return source_metadata