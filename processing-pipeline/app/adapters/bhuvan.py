# app/adapters/bhuvan.py
import re
from datetime import UTC, datetime

import structlog

from app.adapters.base import SourceAdapter
from app.schemas.raw_event import RawEvent

log = structlog.get_logger()

# Bhuvan layer slugs look like "<state_code>_<district>_<layer>", e.g.
# "up_Sitapur_slope" -> state=UP, district=Sitapur, layer=slope. Not every
# slug follows this pattern, so the parser is best-effort and never
# raises — a non-matching slug just leaves the parsed fields unset and
# the raw content string is kept untouched either way.
_SLUG_RE = re.compile(r"^(?P<state>[a-zA-Z]{2,3})_(?P<district>[^_]+)_(?P<layer>.+)$")


class BhuvanAdapter(SourceAdapter):
    """
    Normalises payloads from the ISRO Bhuvan GIS / change-detection feed
    (e.g. slope/landslide monitoring layers, NDVI change alerts).
    These payloads are intentionally minimal — Bhuvan emits a content
    "slug" identifying the layer/region rather than free text, and no
    author or media metadata is typically present.
    """

    def normalize(self, payload: dict, topic: str) -> RawEvent:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a dictionary")

        source = payload.get("source") or payload.get("source_type") or "bhuvan"
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

        media_urls = self._media_urls(payload)
        source_metadata = self._metadata(payload, topic, content)

        return RawEvent(
            source=str(source),
            source_id=str(source_id),
            content=str(content),
            published_at=published_at,
            collected_at=collected_at,
            author_id=None,  # Bhuvan is an automated institutional feed, no author concept
            media_urls=media_urls,
            language_hint=None,
            source_metadata=source_metadata,
        )

    # ── field extractors ──────────────────────────────────────────────────────

    def _source_id(self, payload: dict) -> str:
        sid = (
            payload.get("source_id")
            or payload.get("fingerprint_hash")
            or payload.get("id")
            or payload.get("event_id")
            or payload.get("provenance_id")
        )
        if not sid:
            raise ValueError(
                "Missing unique identifier (source_id, event_id, or provenance_id) "
                "in bhuvan payload"
            )
        return str(sid)

    def _content(self, payload: dict) -> str:
        content = payload.get("content") or payload.get("layer_id") or payload.get("title") or ""
        return str(content).strip()

    def _media_urls(self, payload: dict) -> list[str]:
        # Bhuvan tile/WMS responses sometimes carry an image/tile
        # reference in source_url; treat it as media when present.
        urls = payload.get("media_urls") or payload.get("media") or []
        if isinstance(urls, str):
            urls = [urls]
        elif not isinstance(urls, list):
            urls = []
        urls = [str(u) for u in urls if u]

        source_url = payload.get("source_url")
        if source_url and str(source_url) not in urls:
            urls.append(str(source_url))
        return urls

    def _parse_slug(self, content: str) -> dict | None:
        match = _SLUG_RE.match(content)
        if not match:
            return None
        return {
            "parsed_state_code": match.group("state").upper(),
            "parsed_district": match.group("district"),
            "parsed_layer": match.group("layer"),
        }

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
            log.warning("bhuvan_adapter.invalid_datetime", value=value)
            return datetime.now(UTC)

    def _metadata(self, payload: dict, topic: str, content: str) -> dict:
        source_metadata = {
            "event_id": payload.get("event_id"),
            "provenance_id": payload.get("provenance_id"),
            "url": payload.get("source_url"),
            "topic_received": topic,
        }
        parsed = self._parse_slug(content)
        if parsed:
            source_metadata.update(parsed)

        for k, v in payload.items():
            if k not in [
                "source", "source_type", "source_id", "event_id", "provenance_id",
                "content", "source_url", "published_at", "publishedAt",
                "collected_at", "collectedAt", "ingested_at", "media_urls", "media",
            ]:
                source_metadata[k] = v
        return source_metadata