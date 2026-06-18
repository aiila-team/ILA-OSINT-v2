"""Parser for YouTube Data API v3 responses.

Responsibility
--------------
- Understand YouTube API JSON structure
- Extract video metadata and comment data
- Return source-specific records as plain dicts

Does NOT
--------
- Generate AIILA event schema
- Create event IDs
- Perform classification or risk scoring
- Build Kafka payloads
- Call the API (that is the collector's job)
"""

from __future__ import annotations

import re
from typing import Any


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_int(value: Any, default: int = 0) -> int:
    """Safely convert a YouTube stat string to int."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _extract_urls(text: str) -> list[str]:
    """Extract all URLs from a block of text."""
    if not text:
        return []
    pattern = r"https?://[^\s\)\]\>\"']+"
    return re.findall(pattern, text)


def _extract_hashtags(text: str) -> list[str]:
    """Extract hashtags from title or description."""
    if not text:
        return []
    return re.findall(r"#\w+", text)


def _duration_to_seconds(iso_duration: str) -> int | None:
    """Convert ISO 8601 duration (PT4M13S) to total seconds."""
    if not iso_duration:
        return None
    pattern = r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"
    match = re.match(pattern, iso_duration)
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


# ── Video parser ───────────────────────────────────────────────────────────────

def parse_video_item(item: dict[str, Any], channel_meta: dict[str, Any]) -> dict[str, Any] | None:
    """
    Parse a single video item from the YouTube videos.list API response.

    Parameters
    ----------
    item : dict
        A single element from the ``items`` list in the API response.
    channel_meta : dict
        Metadata about the monitored channel this video belongs to
        (name, priority, tags from config.MONITORED_CHANNELS).

    Returns
    -------
    dict or None
        Normalised source record, or None if the item is malformed.
    """
    video_id: str | None = item.get("id")
    if not video_id:
        return None

    snippet: dict = item.get("snippet", {})
    statistics: dict = item.get("statistics", {})
    content_details: dict = item.get("contentDetails", {})

    title: str = snippet.get("title", "").strip()
    description: str = snippet.get("description", "").strip()
    channel_id: str = snippet.get("channelId", "")
    channel_title: str = snippet.get("channelTitle", "")
    published_at: str | None = snippet.get("publishedAt")
    tags: list[str] = snippet.get("tags", []) or []
    category_id: str = snippet.get("categoryId", "")
    default_language: str = snippet.get("defaultLanguage", "") or snippet.get("defaultAudioLanguage", "") or ""
    live_status: str = snippet.get("liveBroadcastContent", "none")

    thumbnail_url: str = (
        snippet.get("thumbnails", {}).get("high", {}).get("url")
        or snippet.get("thumbnails", {}).get("default", {}).get("url")
        or ""
    )

    # Statistics
    view_count: int = _safe_int(statistics.get("viewCount"))
    like_count: int = _safe_int(statistics.get("likeCount"))
    comment_count: int = _safe_int(statistics.get("commentCount"))
    favourite_count: int = _safe_int(statistics.get("favoriteCount"))

    # Content details
    duration_iso: str = content_details.get("duration", "")
    duration_seconds: int | None = _duration_to_seconds(duration_iso)
    definition: str = content_details.get("definition", "")   # hd / sd
    caption: str = content_details.get("caption", "false")    # "true" / "false"

    # Derived fields
    video_url: str = f"https://www.youtube.com/watch?v={video_id}"
    urls_in_description: list[str] = _extract_urls(description)
    hashtags: list[str] = _extract_hashtags(f"{title} {description}")

    return {
        # Identity
        "video_id": video_id,
        "video_url": video_url,

        # Channel
        "channel_id": channel_id,
        "channel_title": channel_title,
        "channel_name": channel_meta.get("name", channel_title),
        "channel_priority": channel_meta.get("priority", "medium"),
        "channel_tags": channel_meta.get("tags", []),

        # Content
        "title": title,
        "description": description,
        "tags": tags,
        "hashtags": hashtags,
        "category_id": category_id,
        "language": default_language,
        "live_status": live_status,
        "thumbnail_url": thumbnail_url,
        "caption_available": caption == "true",

        # Timing
        "published_at": published_at,
        "duration_iso": duration_iso,
        "duration_seconds": duration_seconds,

        # Engagement
        "view_count": view_count,
        "like_count": like_count,
        "comment_count": comment_count,
        "favourite_count": favourite_count,

        # Extracted signals
        "urls_in_description": urls_in_description,

        # Quality indicator
        "definition": definition,

        # Raw response preserved for provenance
        "raw": {
            "id": video_id,
            "snippet": snippet,
            "statistics": statistics,
            "contentDetails": content_details,
        },
    }


def parse_videos_response(
    response: dict[str, Any],
    channel_meta: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Parse a full ``videos.list`` API response into a list of video records.

    Parameters
    ----------
    response : dict
        Raw JSON response from the YouTube ``videos.list`` endpoint.
    channel_meta : dict
        Channel metadata from ``config.MONITORED_CHANNELS``.

    Returns
    -------
    list[dict]
        List of parsed video records. Malformed items are silently skipped.
    """
    items: list[dict] = response.get("items", [])
    records: list[dict[str, Any]] = []

    for item in items:
        parsed = parse_video_item(item, channel_meta)
        if parsed:
            records.append(parsed)

    return records


# ── Comment parser ─────────────────────────────────────────────────────────────

def parse_comment_thread(thread: dict[str, Any], video_record: dict[str, Any]) -> dict[str, Any] | None:
    """
    Parse a single comment thread from the ``commentThreads.list`` response.

    Parameters
    ----------
    thread : dict
        A single element from the ``items`` list.
    video_record : dict
        The already-parsed video record this comment belongs to.

    Returns
    -------
    dict or None
    """
    thread_id: str | None = thread.get("id")
    if not thread_id:
        return None

    snippet: dict = thread.get("snippet", {})
    top_comment_snippet: dict = (
        snippet.get("topLevelComment", {}).get("snippet", {})
    )

    comment_id: str = snippet.get("topLevelComment", {}).get("id", thread_id)
    text: str = top_comment_snippet.get("textOriginal", "").strip()
    if not text:
        text = top_comment_snippet.get("textDisplay", "").strip()

    author_name: str = top_comment_snippet.get("authorDisplayName", "")
    author_channel_id: str = top_comment_snippet.get("authorChannelId", {}).get("value", "")
    author_channel_url: str = top_comment_snippet.get("authorChannelUrl", "")
    like_count: int = _safe_int(top_comment_snippet.get("likeCount"))
    published_at: str | None = top_comment_snippet.get("publishedAt")
    updated_at: str | None = top_comment_snippet.get("updatedAt")
    reply_count: int = _safe_int(snippet.get("totalReplyCount"))
    can_reply: bool = bool(snippet.get("canReply", False))

    # Signals extracted from comment text
    urls_in_comment: list[str] = _extract_urls(text)
    hashtags: list[str] = _extract_hashtags(text)

    return {
        # Identity
        "comment_id": comment_id,
        "thread_id": thread_id,

        # Parent video context
        "video_id": video_record["video_id"],
        "video_url": video_record["video_url"],
        "channel_id": video_record["channel_id"],
        "channel_name": video_record["channel_name"],
        "channel_priority": video_record["channel_priority"],
        "channel_tags": video_record["channel_tags"],

        # Comment content
        "text": text,
        "hashtags": hashtags,
        "urls_in_comment": urls_in_comment,

        # Author
        "author_name": author_name,
        "author_channel_id": author_channel_id,
        "author_channel_url": author_channel_url,

        # Engagement
        "like_count": like_count,
        "reply_count": reply_count,
        "can_reply": can_reply,

        # Timing
        "published_at": published_at,
        "updated_at": updated_at,

        # Raw preserved for provenance
        "raw": thread,
    }


def parse_comments_response(
    response: dict[str, Any],
    video_record: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Parse a full ``commentThreads.list`` API response.

    Parameters
    ----------
    response : dict
        Raw JSON response from the ``commentThreads.list`` endpoint.
    video_record : dict
        The already-parsed video record these comments belong to.

    Returns
    -------
    list[dict]
        List of parsed comment records.
    """
    items: list[dict] = response.get("items", [])
    records: list[dict[str, Any]] = []

    for thread in items:
        parsed = parse_comment_thread(thread, video_record)
        if parsed:
            records.append(parsed)

    return records


# ── Channel parser ─────────────────────────────────────────────────────────────

def parse_channel_response(
    response: dict[str, Any],
    channel_config: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Parse a ``channels.list`` response to resolve a handle to a channel ID
    and extract channel-level metadata.

    Returns
    -------
    dict or None
    """
    items: list[dict] = response.get("items", [])
    if not items:
        return None

    item = items[0]
    channel_id: str | None = item.get("id")
    if not channel_id:
        return None

    snippet: dict = item.get("snippet", {})
    statistics: dict = item.get("statistics", {})

    return {
        "channel_id": channel_id,
        "name": channel_config.get("name", snippet.get("title", "")),
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "country": snippet.get("country", ""),
        "published_at": snippet.get("publishedAt"),
        "thumbnail_url": (
            snippet.get("thumbnails", {}).get("high", {}).get("url", "")
        ),
        "subscriber_count": _safe_int(statistics.get("subscriberCount")),
        "video_count": _safe_int(statistics.get("videoCount")),
        "view_count": _safe_int(statistics.get("viewCount")),
        "priority": channel_config.get("priority", "medium"),
        "tags": channel_config.get("tags", []),
        "raw": item,
    }
