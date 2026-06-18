"""Async collector for the YouTube OSINT source.

Collects video metadata and comments from monitored YouTube channels,
transforms records into AIILA payloads, and publishes to Kafka raw-events.

Flow
----
1.  For each channel in config.MONITORED_CHANNELS:
    a.  Fetch latest videos via search.list (or playlistItems if upload
        playlist is cached)
    b.  Fetch full video details (stats, content details) via videos.list
    c.  Parse and build video payload → publish to Kafka
    d.  If COLLECT_COMMENTS=true, fetch comment threads per video → publish
2.  ContinuousCollector calls collect() every COLLECTION_INTERVAL seconds.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from logging import getLogger
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve()
ROOT_DIR = HERE.parents[3]

for p in (str(ROOT_DIR), str(HERE.parent), str(HERE.parent.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from .config import (
        YOUTUBE_API_KEY,
        SEARCH_URL,
        VIDEOS_URL,
        COMMENTS_URL,
        CHANNELS_URL,
        RATE_LIMIT,
        COLLECTION_INTERVAL,
        MAX_RETRIES,
        RETRY_DELAY,
        MAX_RESULTS_PER_PAGE,
        MAX_COMMENT_PAGES,
        COLLECT_COMMENTS,
        MONITORED_CHANNELS,
        VIDEO_PARTS,
        COMMENT_PARTS,
        SEARCH_PARTS,
        CHANNEL_PARTS,
    )
    from .parser import (
        parse_videos_response,
        parse_comments_response,
        parse_channel_response,
    )
    from .payload_extractor import build_video_payload, build_comment_payload
    from .continuous_collector import ContinuousCollector
except ImportError:
    from config import (
        YOUTUBE_API_KEY,
        SEARCH_URL,
        VIDEOS_URL,
        COMMENTS_URL,
        CHANNELS_URL,
        RATE_LIMIT,
        COLLECTION_INTERVAL,
        MAX_RETRIES,
        RETRY_DELAY,
        MAX_RESULTS_PER_PAGE,
        MAX_COMMENT_PAGES,
        COLLECT_COMMENTS,
        MONITORED_CHANNELS,
        VIDEO_PARTS,
        COMMENT_PARTS,
        SEARCH_PARTS,
        CHANNEL_PARTS,
    )
    from parser import (
        parse_videos_response,
        parse_comments_response,
        parse_channel_response,
    )
    from payload_extractor import build_video_payload, build_comment_payload
    from continuous_collector import ContinuousCollector

from ingestion.kafka_producer import publish_raw_event

import aiohttp

logger = getLogger(__name__)

# ── Rate-limit semaphore ───────────────────────────────────────────────────────
# YouTube API: 10,000 units/day. We use a semaphore to space out calls.
_semaphore = asyncio.Semaphore(RATE_LIMIT)


# ── Low-level API helpers ──────────────────────────────────────────────────────

async def _get(
    session: aiohttp.ClientSession,
    url: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    """
    Execute a single authenticated GET request against the YouTube Data API.

    Raises
    ------
    aiohttp.ClientResponseError
        On non-2xx HTTP responses (includes 403 quota exceeded).
    """
    async with _semaphore:
        params["key"] = YOUTUBE_API_KEY
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            resp.raise_for_status()
            return await resp.json()


async def _get_paginated(
    session: aiohttp.ClientSession,
    url: str,
    params: dict[str, Any],
    max_pages: int = 1,
) -> list[dict[str, Any]]:
    """
    Fetch up to ``max_pages`` pages from a paginated YouTube endpoint.

    Returns
    -------
    list[dict]
        Accumulated ``items`` lists across all pages.
    """
    all_items: list[dict[str, Any]] = []
    page_token: str | None = None
    pages_fetched: int = 0

    while pages_fetched < max_pages:
        page_params = dict(params)
        if page_token:
            page_params["pageToken"] = page_token

        response = await _get(session, url, page_params)
        all_items.extend(response.get("items", []))
        pages_fetched += 1

        page_token = response.get("nextPageToken")
        if not page_token:
            break

        # Brief pause between pages to respect rate limits
        await asyncio.sleep(0.5)

    return all_items


# ── Channel resolution ─────────────────────────────────────────────────────────

async def _resolve_channel_id(
    session: aiohttp.ClientSession,
    channel_config: dict[str, Any],
) -> str | None:
    """
    Return a confirmed channel ID.

    If channel_config already contains a ``channel_id`` starting with "UC",
    it is returned as-is (no API call needed). Otherwise, the channel handle
    is resolved via the channels.list API.
    """
    channel_id: str = channel_config.get("channel_id", "")

    if channel_id.startswith("UC"):
        return channel_id

    # Resolve @handle or custom URL to channel ID
    handle = channel_id.lstrip("@")
    try:
        response = await _get(session, CHANNELS_URL, {
            "part": CHANNEL_PARTS,
            "forHandle": f"@{handle}",
            "maxResults": 1,
        })
        parsed = parse_channel_response(response, channel_config)
        if parsed:
            logger.info(
                "Resolved YouTube handle to channel ID",
                extra={"handle": handle, "channel_id": parsed["channel_id"]},
            )
            return parsed["channel_id"]
    except Exception as exc:
        logger.warning(
            "Could not resolve YouTube channel handle",
            extra={"handle": handle, "error": str(exc)},
        )

    return None


# ── Video collection ───────────────────────────────────────────────────────────

async def _collect_videos_for_channel(
    session: aiohttp.ClientSession,
    channel_config: dict[str, Any],
    channel_id: str,
    published_after: str | None = None,
) -> list[dict[str, Any]]:
    """
    Fetch the latest videos from one channel and return parsed video records.

    Uses search.list to get video IDs, then videos.list to get full metadata
    (stats + content details) in a single batch call.
    """
    # Step 1: search.list to get recent video IDs for this channel
    search_params: dict[str, Any] = {
        "part": SEARCH_PARTS,
        "channelId": channel_id,
        "type": "video",
        "order": "date",
        "maxResults": MAX_RESULTS_PER_PAGE,
    }
    if published_after:
        search_params["publishedAfter"] = published_after

    try:
        search_items = await _get_paginated(session, SEARCH_URL, search_params, max_pages=1)
    except aiohttp.ClientResponseError as exc:
        logger.error(
            "YouTube search.list failed",
            extra={"channel_id": channel_id, "status": exc.status, "error": str(exc)},
        )
        return []

    if not search_items:
        logger.debug("No new videos found", extra={"channel_id": channel_id})
        return []

    video_ids: list[str] = [
        item["id"]["videoId"]
        for item in search_items
        if item.get("id", {}).get("kind") == "youtube#video"
        and item["id"].get("videoId")
    ]

    if not video_ids:
        return []

    # Step 2: videos.list for full metadata — batch all IDs in one call
    try:
        videos_response = await _get(session, VIDEOS_URL, {
            "part": VIDEO_PARTS,
            "id": ",".join(video_ids),
            "maxResults": len(video_ids),
        })
    except aiohttp.ClientResponseError as exc:
        logger.error(
            "YouTube videos.list failed",
            extra={"channel_id": channel_id, "video_ids": video_ids, "error": str(exc)},
        )
        return []

    records = parse_videos_response(videos_response, channel_config)

    logger.info(
        "Parsed video records",
        extra={"channel_id": channel_id, "count": len(records)},
    )
    return records


# ── Comment collection ─────────────────────────────────────────────────────────

async def _collect_comments_for_video(
    session: aiohttp.ClientSession,
    video_record: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Fetch comment threads for one video and return parsed comment records.

    Skips videos where comments are disabled (API returns 403 with
    commentsDisabled error).
    """
    video_id: str = video_record["video_id"]

    # Skip if no comments exist
    if video_record.get("comment_count", 0) == 0:
        return []

    try:
        comment_items = await _get_paginated(
            session,
            COMMENTS_URL,
            {
                "part": COMMENT_PARTS,
                "videoId": video_id,
                "order": "relevance",
                "maxResults": 100,
            },
            max_pages=MAX_COMMENT_PAGES,
        )
    except aiohttp.ClientResponseError as exc:
        if exc.status == 403:
            logger.debug(
                "Comments disabled for video",
                extra={"video_id": video_id},
            )
        else:
            logger.warning(
                "Failed to fetch comments",
                extra={"video_id": video_id, "status": exc.status, "error": str(exc)},
            )
        return []

    records = parse_comments_response({"items": comment_items}, video_record)

    logger.debug(
        "Parsed comment records",
        extra={"video_id": video_id, "count": len(records)},
    )
    return records


# ── Publishing helper ──────────────────────────────────────────────────────────

def _publish(payload: dict[str, Any], record_type: str) -> str | None:
    """
    Publish one AIILA payload to Kafka raw-events topic.

    Returns
    -------
    str or None
        Kafka event_id on success, None on failure.
    """
    try:
        event_id = publish_raw_event(
            source_type="youtube",
            content=payload.get("content", ""),
            published_at=payload.get("published_at"),
            source_url=payload.get("source_url"),
            payload=payload,
        )
        logger.info(
            "Published YouTube event",
            extra={
                "event_id": event_id,
                "record_type": record_type,
                "source_id": payload.get("source_id"),
            },
        )
        return event_id
    except Exception as exc:
        logger.error(
            "Failed to publish YouTube event",
            extra={
                "record_type": record_type,
                "source_id": payload.get("source_id"),
                "error": str(exc),
            },
            exc_info=True,
        )
        return None


# ── Main collect function ──────────────────────────────────────────────────────

async def collect() -> list[dict[str, Any]]:
    """
    Collect YouTube video metadata and comments from all monitored channels,
    build AIILA payloads, and publish each to the Kafka ``raw-events`` topic.

    Returns
    -------
    list[dict]
        All successfully built payloads (videos + comments) for this run.
        Used by ContinuousCollector for logging; does not affect Kafka.

    Notes
    -----
    - Channels are processed concurrently up to RATE_LIMIT parallel requests.
    - Comment collection runs sequentially per video to avoid quota spikes.
    - Any single channel/video failure is logged and skipped; the rest continue.
    """
    logger.info("collector_started", extra={"source": "youtube"})

    if not YOUTUBE_API_KEY:
        logger.error(
            "YOUTUBE_API_KEY is not set. Skipping collection.",
            extra={"source": "youtube"},
        )
        return []

    all_payloads: list[dict[str, Any]] = []

    # Fetch everything that was published in the last collection window
    published_after: str = (
        (datetime.now(timezone.utc) - timedelta(seconds=COLLECTION_INTERVAL))
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

    async with aiohttp.ClientSession() as session:

        # ── Resolve channel IDs ────────────────────────────────────────────────
        resolved_channels: list[tuple[dict[str, Any], str]] = []

        for channel_config in MONITORED_CHANNELS:
            channel_id = await _resolve_channel_id(session, channel_config)
            if channel_id:
                resolved_channels.append((channel_config, channel_id))
            else:
                logger.warning(
                    "Skipping unresolvable channel",
                    extra={"channel": channel_config.get("name")},
                )

        if not resolved_channels:
            logger.warning("No resolvable channels found. Aborting collection.")
            return []

        # ── Collect videos per channel ─────────────────────────────────────────
        for channel_config, channel_id in resolved_channels:
            channel_name = channel_config.get("name", channel_id)

            try:
                video_records = await _collect_videos_for_channel(
                    session, channel_config, channel_id, published_after=published_after
                )
            except Exception as exc:
                logger.error(
                    "Unexpected error collecting channel videos",
                    extra={"channel": channel_name, "error": str(exc)},
                    exc_info=True,
                )
                continue

            # ── Build + publish video payloads ─────────────────────────────────
            for video_record in video_records:
                try:
                    video_payload = build_video_payload(video_record)
                    _publish(video_payload, record_type="video")
                    all_payloads.append(video_payload)
                except Exception as exc:
                    logger.error(
                        "Failed to build video payload",
                        extra={
                            "video_id": video_record.get("video_id"),
                            "error": str(exc),
                        },
                        exc_info=True,
                    )
                    continue

                # ── Collect + publish comments per video ───────────────────────
                if not COLLECT_COMMENTS:
                    continue

                try:
                    comment_records = await _collect_comments_for_video(
                        session, video_record
                    )
                except Exception as exc:
                    logger.error(
                        "Unexpected error collecting comments",
                        extra={
                            "video_id": video_record.get("video_id"),
                            "error": str(exc),
                        },
                        exc_info=True,
                    )
                    continue

                for comment_record in comment_records:
                    try:
                        comment_payload = build_comment_payload(comment_record)
                        _publish(comment_payload, record_type="comment")
                        all_payloads.append(comment_payload)
                    except Exception as exc:
                        logger.error(
                            "Failed to build comment payload",
                            extra={
                                "comment_id": comment_record.get("comment_id"),
                                "error": str(exc),
                            },
                            exc_info=True,
                        )

                # Small pause between videos to spread quota usage
                await asyncio.sleep(0.2)

            logger.info(
                "Completed channel collection",
                extra={
                    "channel": channel_name,
                    "videos": len(video_records),
                },
            )

    logger.info(
        "collection_success",
        extra={"source": "youtube", "events_collected": len(all_payloads)},
    )
    logger.info(
        "YouTube collection run complete",
        extra={"total_payloads": len(all_payloads)},
    )
    return all_payloads


# ── Entrypoint ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    collector = ContinuousCollector(
        name="youtube",
        collect_fn=collect,
        interval=COLLECTION_INTERVAL,
        max_retries=MAX_RETRIES,
        retry_delay=RETRY_DELAY,
    )

    try:
        asyncio.run(collector.run_continuous())
    except KeyboardInterrupt:
        print("\nYouTube collection stopped by user.")
