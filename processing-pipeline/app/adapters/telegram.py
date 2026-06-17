# app/adapters/telegram.py
from datetime import UTC, datetime

from app.adapters.base import SourceAdapter
from app.schemas.raw_event import RawEvent


class TelegramAdapter(SourceAdapter):
    """Adapter for Telegram sources normalising payloads to canonical RawEvent."""

    def normalize(self, payload: dict, topic: str) -> RawEvent:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a dictionary")

        source = payload.get("source") or "telegram"
        
        # Unique ID for telegram is typically channel_id:message_id
        msg_id = payload.get("message_id") or payload.get("id")
        chat_id = payload.get("chat_id") or payload.get("channel_id")
        
        if msg_id is None or chat_id is None:
            # Fallback to source_id if present
            source_id = payload.get("source_id")
            if not source_id:
                raise ValueError(
                    "Missing unique identifier (message_id and chat_id, or source_id) "
                    "in Telegram payload"
                )
        else:
            source_id = f"{chat_id}_{msg_id}"

        # Parse timestamps
        published_at_raw = (
            payload.get("published_at")
            or payload.get("date")
            or payload.get("publishedAt")
        )
        if published_at_raw:
            try:
                # Handle Unix timestamp if provided as int/float
                if isinstance(published_at_raw, (int, float)):
                    published_at = datetime.fromtimestamp(published_at_raw, tz=UTC)
                else:
                    published_at = datetime.fromisoformat(
                        str(published_at_raw).replace("Z", "+00:00")
                    )
            except (ValueError, OSError):
                published_at = datetime.now(UTC)
        else:
            published_at = datetime.now(UTC)

        collected_at_raw = payload.get("collected_at") or payload.get("collectedAt")
        if collected_at_raw:
            try:
                if isinstance(collected_at_raw, (int, float)):
                    collected_at = datetime.fromtimestamp(collected_at_raw, tz=UTC)
                else:
                    collected_at = datetime.fromisoformat(
                        str(collected_at_raw).replace("Z", "+00:00")
                    )
            except (ValueError, OSError):
                collected_at = datetime.now(UTC)
        else:
            collected_at = datetime.now(UTC)

        # Content
        content = payload.get("content") or payload.get("text") or payload.get("caption") or ""
        
        # Author / Sender
        author_id = payload.get("author_id") or payload.get("sender_id") or payload.get("from_id")
        if author_id is not None:
            author_id = str(author_id)

        # Media URLs (photos, videos, documents, voice messages)
        media_urls = payload.get("media_urls") or []
        if isinstance(media_urls, str):
            media_urls = [media_urls]
        elif not isinstance(media_urls, list):
            media_urls = []
        
        # Single media link fallbacks
        photo_url = payload.get("photo_url") or payload.get("media_url")
        if photo_url:
            media_urls.append(photo_url)
            
        # Clean media urls list
        seen = set()
        cleaned_media_urls = []
        for url in media_urls:
            if url and url not in seen:
                cleaned_media_urls.append(str(url))
                seen.add(url)

        language_hint = payload.get("language_hint") or payload.get("language")

        # Collect extra metadata
        source_metadata = {
            "chat_title": payload.get("chat_title") or payload.get("channel_name"),
            "chat_username": payload.get("chat_username") or payload.get("channel_username"),
            "views": payload.get("views"),
            "forwards": payload.get("forwards"),
            "replies": payload.get("replies"),
            "topic_received": topic,
        }
        exclude_keys = [
            "source", "source_id", "message_id", "id", "chat_id", "channel_id",
            "content", "text", "caption", "published_at", "date", "publishedAt",
            "collected_at", "collectedAt", "author_id", "sender_id", "from_id",
            "media_urls", "photo_url", "media_url", "language_hint", "language"
        ]
        for k, v in payload.items():
            if k not in exclude_keys:
                source_metadata[k] = v

        return RawEvent(
            source=str(source),
            source_id=str(source_id),
            content=str(content),
            published_at=published_at,
            collected_at=collected_at,
            author_id=author_id,
            media_urls=cleaned_media_urls,
            language_hint=str(language_hint) if language_hint else None,
            source_metadata=source_metadata,
        )
