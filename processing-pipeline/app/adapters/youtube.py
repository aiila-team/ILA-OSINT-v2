# app/adapters/youtube.py
from datetime import UTC, datetime

from app.adapters.base import SourceAdapter
from app.schemas.raw_event import RawEvent


class YouTubeAdapter(SourceAdapter):
    """Adapter for YouTube sources normalising payloads to canonical RawEvent."""

    def normalize(self, payload: dict, topic: str) -> RawEvent:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a dictionary")

        source = payload.get("source") or "youtube"
        source_id = (
            payload.get("source_id")
            or payload.get("video_id")
            or payload.get("id")
        )
        if not source_id:
            raise ValueError(
                "Missing unique identifier (source_id, video_id, or id) "
                "in YouTube payload"
            )

        # Parse timestamps
        published_at_raw = payload.get("published_at") or payload.get("publishedAt")
        if published_at_raw:
            try:
                published_at = datetime.fromisoformat(
                    str(published_at_raw).replace("Z", "+00:00")
                )
            except ValueError:
                published_at = datetime.now(UTC)
        else:
            published_at = datetime.now(UTC)

        collected_at_raw = payload.get("collected_at") or payload.get("collectedAt")
        if collected_at_raw:
            try:
                collected_at = datetime.fromisoformat(
                    str(collected_at_raw).replace("Z", "+00:00")
                )
            except ValueError:
                collected_at = datetime.now(UTC)
        else:
            collected_at = datetime.now(UTC)

        # Content of YouTube is video description and/or transcript
        title = payload.get("title") or ""
        description = payload.get("description") or ""
        transcript = payload.get("transcript") or ""
        
        # Combine title, description, and transcript for downstream processing if they exist
        content_parts = []
        if title:
            content_parts.append(title)
        if description:
            content_parts.append(description)
        if transcript:
            content_parts.append(transcript)
        content = "\n\n".join(content_parts)

        author_id = (
            payload.get("author_id")
            or payload.get("channel_id")
            or payload.get("channelId")
        )
        if author_id is not None:
            author_id = str(author_id)

        # Media URLs can include the video link itself and thumbnail URLs
        media_urls = payload.get("media_urls") or []
        video_url = payload.get("video_url") or payload.get("url")
        if video_url:
            media_urls.append(video_url)
        thumbnail_url = payload.get("thumbnail_url")
        if thumbnail_url:
            media_urls.append(thumbnail_url)
        
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
            "channel_title": payload.get("channel_title") or payload.get("channelTitle"),
            "view_count": payload.get("view_count") or payload.get("viewCount"),
            "like_count": payload.get("like_count") or payload.get("likeCount"),
            "comment_count": payload.get("comment_count") or payload.get("commentCount"),
            "duration": payload.get("duration"),
            "topic_received": topic,
        }
        exclude_keys = [
            "source", "source_id", "video_id", "id", "content", "title", "description", 
            "transcript", "published_at", "publishedAt", "collected_at", "collectedAt", 
            "author_id", "channel_id", "channelId", "media_urls", "video_url", "url", 
            "thumbnail_url", "language_hint", "language"
        ]
        for k, v in payload.items():
            if k not in exclude_keys:
                source_metadata[k] = v

        return RawEvent(
            source=str(source),
            source_id=str(source_id),
            content=content,
            published_at=published_at,
            collected_at=collected_at,
            author_id=author_id,
            media_urls=cleaned_media_urls,
            language_hint=str(language_hint) if language_hint else None,
            source_metadata=source_metadata,
        )
