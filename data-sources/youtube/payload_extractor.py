"""Payload extractor for YouTube OSINT source.

Converts parsed YouTube records (video or comment) into the
AIILA standard event schema ready for Kafka publication.

Responsibility
--------------
- Accept parsed source record (from parser.py)
- Produce AIILA-compliant event payload dict
- Assign deterministic event_id
- Set source_type, category, tags

Does NOT
--------
- Call the YouTube API
- Parse raw API JSON
- Publish to Kafka (collector.py does that)
- Perform NLP / classification
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


# ── Helpers ────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_common_fields(
    event_id: str,
    source_id: str,
    content: str,
    published_at: str | None,
    source_url: str,
    channel_id: str,
    channel_name: str,
    channel_priority: str,
    channel_tags: list[str],
    extra_tags: list[str],
    metadata: dict[str, Any],
    entities: dict[str, Any],
    raw: dict[str, Any],
) -> dict[str, Any]:
    """
    Shared structure for both video and comment payloads.
    Keeps both payload builders DRY while remaining explicit.
    """
    return {
        # ── Identity ──────────────────────────────────────────────────────────
        "event_id": event_id,

        # ── Source metadata ───────────────────────────────────────────────────
        "source": "youtube",
        "source_type": "social_media",
        "source_id": source_id,

        # ── Content ───────────────────────────────────────────────────────────
        "content": content,

        # ── Timing ───────────────────────────────────────────────────────────
        "published_at": published_at,
        "collected_at": _now_iso(),

        # ── Author / channel context ──────────────────────────────────────────
        "user": channel_name,
        "user_id": channel_id,

        # ── URLs ──────────────────────────────────────────────────────────────
        "source_url": source_url,

        # ── Media ─────────────────────────────────────────────────────────────
        "media_type": "video",
        "media_info": None,
        "media_files": [],

        # ── Classification ────────────────────────────────────────────────────
        "category": "social_osint",
        "provider": "Google/YouTube",

        # ── Priority signal for Decision Layer ────────────────────────────────
        "channel_priority": channel_priority,  # "high" | "medium" | "low"

        # ── Tags ──────────────────────────────────────────────────────────────
        "tags": list({"youtube", "video", *channel_tags, *extra_tags}),

        # ── Entities (pre-extracted; NER pipeline enriches further) ───────────
        "entities": entities,

        # ── Locations ─────────────────────────────────────────────────────────
        "locations": [],

        # ── Graph relationships ───────────────────────────────────────────────
        "relationships": [],

        # ── Source-specific metadata ──────────────────────────────────────────
        "metadata": metadata,

        # ── Provenance: full raw API response preserved ───────────────────────
        "raw": raw,
    }


# ── Video payload ──────────────────────────────────────────────────────────────

def build_video_payload(video: dict[str, Any]) -> dict[str, Any]:
    """
    Convert a parsed video record (from ``parser.parse_video_item``)
    into an AIILA standard event payload.

    Parameters
    ----------
    video : dict
        Output of ``parser.parse_video_item``.

    Returns
    -------
    dict
        AIILA-compliant event payload.
    """
    video_id: str = video["video_id"]

    # Deterministic event_id — same video always produces same ID
    event_id: str = f"youtube_video_{video_id}"

    # Content field: title + description, capped at 2000 chars for Kafka
    content_parts = filter(None, [video.get("title"), video.get("description")])
    content: str = "\n\n".join(content_parts)[:2000]

    # Entities extracted from the video itself
    entities: dict[str, Any] = {
        "urls": video.get("urls_in_description", []),
        "hashtags": video.get("hashtags", []),
        "youtube_tags": video.get("tags", []),
        "channel_ids": [video["channel_id"]] if video.get("channel_id") else [],
        "video_ids": [video_id],
        "cves": [],
        "phone_numbers": [],
        "emails": [],
    }

    metadata: dict[str, Any] = {
        # Video stats
        "view_count": video.get("view_count", 0),
        "like_count": video.get("like_count", 0),
        "comment_count": video.get("comment_count", 0),
        "favourite_count": video.get("favourite_count", 0),

        # Video properties
        "duration_iso": video.get("duration_iso"),
        "duration_seconds": video.get("duration_seconds"),
        "definition": video.get("definition"),
        "caption_available": video.get("caption_available", False),
        "live_status": video.get("live_status", "none"),
        "language": video.get("language", ""),
        "category_id": video.get("category_id", ""),
        "thumbnail_url": video.get("thumbnail_url", ""),

        # Channel context
        "channel_id": video.get("channel_id"),
        "channel_title": video.get("channel_title"),
        "channel_name": video.get("channel_name"),
        "channel_priority": video.get("channel_priority"),

        # Record type for downstream routing
        "record_type": "video",
    }

    return _build_common_fields(
        event_id=event_id,
        source_id=video_id,
        content=content,
        published_at=video.get("published_at"),
        source_url=video["video_url"],
        channel_id=video.get("channel_id", ""),
        channel_name=video.get("channel_name", ""),
        channel_priority=video.get("channel_priority", "medium"),
        channel_tags=video.get("channel_tags", []),
        extra_tags=["video_metadata"],
        metadata=metadata,
        entities=entities,
        raw=video.get("raw", {}),
    )


# ── Comment payload ────────────────────────────────────────────────────────────

def build_comment_payload(comment: dict[str, Any]) -> dict[str, Any]:
    """
    Convert a parsed comment record (from ``parser.parse_comment_thread``)
    into an AIILA standard event payload.

    Parameters
    ----------
    comment : dict
        Output of ``parser.parse_comment_thread``.

    Returns
    -------
    dict
        AIILA-compliant event payload.
    """
    comment_id: str = comment["comment_id"]
    video_id: str = comment["video_id"]

    # Deterministic event_id
    event_id: str = f"youtube_comment_{comment_id}"

    # Content is the raw comment text
    content: str = comment.get("text", "")[:2000]

    # Entities extracted from the comment
    entities: dict[str, Any] = {
        "urls": comment.get("urls_in_comment", []),
        "hashtags": comment.get("hashtags", []),
        "youtube_tags": [],
        "channel_ids": [comment["channel_id"]] if comment.get("channel_id") else [],
        "video_ids": [video_id],
        "author_channel_ids": (
            [comment["author_channel_id"]] if comment.get("author_channel_id") else []
        ),
        "cves": [],
        "phone_numbers": [],
        "emails": [],
    }

    metadata: dict[str, Any] = {
        # Comment stats
        "like_count": comment.get("like_count", 0),
        "reply_count": comment.get("reply_count", 0),
        "can_reply": comment.get("can_reply", False),
        "updated_at": comment.get("updated_at"),

        # Author context
        "author_name": comment.get("author_name", ""),
        "author_channel_id": comment.get("author_channel_id", ""),
        "author_channel_url": comment.get("author_channel_url", ""),

        # Parent video context
        "video_id": video_id,
        "video_url": comment.get("video_url", ""),
        "thread_id": comment.get("thread_id", ""),

        # Channel context
        "channel_id": comment.get("channel_id"),
        "channel_name": comment.get("channel_name"),
        "channel_priority": comment.get("channel_priority"),

        # Record type for downstream routing
        "record_type": "comment",
    }

    return _build_common_fields(
        event_id=event_id,
        source_id=comment_id,
        content=content,
        published_at=comment.get("published_at"),
        source_url=comment.get("video_url", ""),
        channel_id=comment.get("channel_id", ""),
        channel_name=comment.get("channel_name", ""),
        channel_priority=comment.get("channel_priority", "medium"),
        channel_tags=comment.get("channel_tags", []),
        extra_tags=["comment", f"video_{video_id}"],
        metadata=metadata,
        entities=entities,
        raw=comment.get("raw", {}),
    )
