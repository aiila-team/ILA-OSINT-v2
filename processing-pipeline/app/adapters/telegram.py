# app/adapters/telegram.py
import re
from datetime import UTC, datetime

import structlog

from app.adapters.base import SourceAdapter
from app.schemas.raw_event import RawEvent

log = structlog.get_logger()

# Matches t.me channel/post links and the "max.ru" mirror links seen in
# Telegram forward footers, so they can be pulled into metadata as
# referenced channels rather than left buried in markdown.
_TELEGRAM_LINK_RE = re.compile(r"https?://(?:t\.me|max\.ru)/[\w/-]+", re.IGNORECASE)
_MD_LINK_RE = re.compile(r"\[(.*?)\]\([^)]*\)")
_MD_ASTERISKS_RE = re.compile(r"\*+")


class TelegramAdapter(SourceAdapter):
    """
    Normalises payloads from the Telegram collector. Telegram messages
    arrive as raw Markdown (bold emphasis, inline channel links / forward
    footers) with very little structured metadata attached — this
    adapter extracts referenced channel links into metadata and produces
    a markdown-stripped plain-text variant for downstream NLP, while
    preserving the original raw content untouched in `content`.
    """

    def normalize(self, payload: dict, topic: str) -> RawEvent:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a dictionary")

        source = payload.get("source") or payload.get("source_type") or "telegram"
        source_id = self._source_id(payload)
        content = self._content(payload)

        published_at = self._parse_dt(
            payload.get("published_at") or payload.get("publishedAt")
        )
        collected_at = self._parse_dt(
            payload.get("collected_at")
            or payload.get("collectedAt")
            or payload.get("ingested_at")
        )

        author_id = self._author_id(payload)
        media_urls = self._media_urls(payload)
        source_metadata = self._metadata(payload, topic, content)

        return RawEvent(
            source=str(source),
            source_id=str(source_id),
            content=str(content),
            published_at=published_at,
            collected_at=collected_at,
            author_id=author_id,
            media_urls=media_urls,
            language_hint=payload.get("language_hint") or payload.get("language"),
            source_metadata=source_metadata,
        )

    # ── field extractors ──────────────────────────────────────────────────────

    def _source_id(self, payload: dict) -> str:
        sid = (
            payload.get("source_id")
            or payload.get("message_id")
            or payload.get("id")
            or payload.get("event_id")
            or payload.get("provenance_id")
        )
        if not sid:
            raise ValueError(
                "Missing unique identifier (source_id, message_id, or event_id) "
                "in telegram payload"
            )
        return str(sid)

    def _content(self, payload: dict) -> str:
        return (payload.get("content") or payload.get("text") or "").strip()

    def _author_id(self, payload: dict) -> str | None:
        author = (
            payload.get("author_id")
            or payload.get("from_id")
            or payload.get("channel_id")
            or payload.get("channel")
        )
        return str(author) if author else None

    def _media_urls(self, payload: dict) -> list[str]:
        urls = (
            payload.get("media_urls")
            or payload.get("media")
            or payload.get("photo")
            or payload.get("video")
            or []
        )
        if isinstance(urls, str):
            urls = [urls]
        elif not isinstance(urls, list):
            urls = []
        return [str(u) for u in urls if u]

    def _referenced_channels(self, content: str) -> list[str]:
        return sorted(set(_TELEGRAM_LINK_RE.findall(content or "")))

    def _plain_text(self, content: str) -> str:
        # Best-effort markdown cleanup for downstream NLP — not a full
        # markdown parser. Telegram forward footers sometimes contain
        # malformed/irregular asterisk runs (e.g. "****") that don't form
        # valid paired bold markers, so rather than trying to match pairs,
        # links are collapsed to their visible text first and then every
        # run of asterisks is stripped outright, regardless of pairing.
        text = _MD_LINK_RE.sub(r"\1", content or "")
        text = _MD_ASTERISKS_RE.sub("", text)
        return re.sub(r"\s+", " ", text).strip()

    def _parse_dt(self, value) -> datetime:
        if not value:
            return datetime.now(UTC)
        try:
            if isinstance(value, datetime):
                dt = value
            else:
                # Telegram timestamps observed as "YYYY-MM-DD HH:MM:SS+00:00"
                # (space-separated) as well as standard ISO "T"-separated —
                # fromisoformat accepts both on Python 3.11+.
                dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                return dt.replace(tzinfo=UTC)
            return dt.astimezone(UTC)
        except Exception:
            log.warning("telegram_adapter.invalid_datetime", value=value)
            return datetime.now(UTC)

    def _metadata(self, payload: dict, topic: str, content: str) -> dict:
        source_metadata = {
            "event_id": payload.get("event_id"),
            "provenance_id": payload.get("provenance_id"),
            "url": payload.get("source_url"),
            "topic_received": topic,
            "referenced_channels": self._referenced_channels(content),
            "content_plain": self._plain_text(content),
        }
        for k, v in payload.items():
            if k not in [
                "source", "source_type", "source_id", "event_id", "provenance_id",
                "content", "text", "source_url", "published_at", "publishedAt",
                "collected_at", "collectedAt", "ingested_at", "author_id",
                "from_id", "channel_id", "channel", "media_urls", "media",
                "photo", "video", "language_hint", "language",
            ]:
                source_metadata[k] = v
        return source_metadata