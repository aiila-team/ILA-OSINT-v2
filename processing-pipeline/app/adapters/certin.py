# app/adapters/certin.py
import re
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

import structlog

from app.adapters.base import SourceAdapter
from app.schemas.raw_event import RawEvent

log = structlog.get_logger()

_MULTI_SPACE = re.compile(r"\s+")

# CERT-In's published_at field is occasionally a free-text date string
# rather than ISO-8601 (observed: "June      10, 2026" — multiple spaces
# between month and day), so several strptime formats are attempted after
# whitespace normalization, rather than relying on fromisoformat alone.
_DATE_FORMATS = (
    "%B %d, %Y",   # "June 10, 2026"
    "%b %d, %Y",   # "Jun 10, 2026"
    "%d %B %Y",    # "10 June 2026"
    "%d %b %Y",    # "10 Jun 2026"
    "%Y-%m-%d",
)


class CertInAdapter(SourceAdapter):
    """
    Normalises vulnerability/security advisory payloads from CERT-In
    (Indian Computer Emergency Response Team). CERT-In's `published_at`
    is frequently a loosely-formatted date string rather than ISO-8601 —
    this adapter is built specifically to tolerate that, plus the
    occasional malformed whitespace seen in scraped advisory pages.
    """

    def normalize(self, payload: dict, topic: str) -> RawEvent:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a dictionary")

        source = payload.get("source") or payload.get("source_type") or "cert-in"
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

        source_metadata = self._metadata(payload, topic)

        return RawEvent(
            source=str(source),
            source_id=str(source_id),
            content=str(content),
            published_at=published_at,
            collected_at=collected_at,
            author_id=None,  # institutional advisory feed, no individual author
            media_urls=[],
            language_hint=None,
            source_metadata=source_metadata,
        )

    # ── field extractors ──────────────────────────────────────────────────────

    def _source_id(self, payload: dict) -> str:
        # Prefer the advisory's own code (e.g. CIAD-2026-0030) extracted
        # from the source URL's VLCODE query param — that's CERT-In's real
        # stable identifier, more durable than our internal event_id.
        advisory_id = self._advisory_id(payload)
        sid = (
            payload.get("source_id")
            or advisory_id
            or payload.get("event_id")
            or payload.get("provenance_id")
        )
        if not sid:
            raise ValueError(
                "Missing unique identifier (source_id, VLCODE, or event_id) "
                "in cert-in payload"
            )
        return str(sid)

    def _advisory_id(self, payload: dict) -> str | None:
        url = payload.get("source_url")
        if not url:
            return None
        try:
            query = parse_qs(urlsplit(str(url)).query)
            vlcode = query.get("VLCODE")
            if vlcode:
                return vlcode[0]
        except Exception:
            log.warning("certin_adapter.url_parse_failed", url=url)
        return None

    def _content(self, payload: dict) -> str:
        return (
            payload.get("content")
            or payload.get("title")
            or payload.get("summary")
            or payload.get("description")
            or ""
        ).strip()

    def _parse_dt(self, value) -> datetime:
        if not value:
            return datetime.now(UTC)
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=UTC)

        raw = _MULTI_SPACE.sub(" ", str(value).strip())

        # Try ISO-8601 first, in case a well-formed feed sends one.
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt.astimezone(UTC) if dt.tzinfo else dt.replace(tzinfo=UTC)
        except Exception:
            pass

        for fmt in _DATE_FORMATS:
            try:
                dt = datetime.strptime(raw, fmt)
                return dt.replace(tzinfo=UTC)
            except ValueError:
                continue

        log.warning("certin_adapter.invalid_datetime", value=value)
        return datetime.now(UTC)

    def _metadata(self, payload: dict, topic: str) -> dict:
        source_metadata = {
            "event_id": payload.get("event_id"),
            "provenance_id": payload.get("provenance_id"),
            "url": payload.get("source_url"),
            "advisory_id": self._advisory_id(payload),
            "topic_received": topic,
        }
        for k, v in payload.items():
            if k not in [
                "source", "source_type", "source_id", "event_id", "provenance_id",
                "content", "title", "summary", "description", "source_url",
                "published_at", "publishedAt", "collected_at", "collectedAt",
                "ingested_at",
            ]:
                source_metadata[k] = v
        return source_metadata