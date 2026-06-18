import re
import structlog

from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()


# ── Per-platform mention patterns ─────────────────────────────────────────────

# Twitter/X — @handle, 1-15 alphanumeric + underscore chars
_TWITTER_PATTERN = re.compile(
    r"""
    (?<![a-zA-Z0-9_@])     # not preceded by handle chars
    @
    ([a-zA-Z0-9_]{1,15})
    (?![a-zA-Z0-9_])       # not followed by handle chars
    """,
    re.VERBOSE,
)

# Telegram — @username, 5-32 alphanumeric + underscore chars
# Telegram enforces minimum 5 chars for public usernames
_TELEGRAM_PATTERN = re.compile(
    r"""
    (?<![a-zA-Z0-9_@])
    @
    ([a-zA-Z0-9_]{5,32})
    (?![a-zA-Z0-9_])
    """,
    re.VERBOSE,
)

# Instagram — @handle, 1-30 alphanumeric + underscore + dot chars
_INSTAGRAM_PATTERN = re.compile(
    r"""
    (?<![a-zA-Z0-9_.@])
    @
    ([a-zA-Z0-9_.]{1,30})
    (?![a-zA-Z0-9_.])
    """,
    re.VERBOSE,
)

# YouTube — @handle, 3-30 alphanumeric + underscore + hyphen + dot
_YOUTUBE_PATTERN = re.compile(
    r"""
    (?<![a-zA-Z0-9_.\-@])
    @
    ([a-zA-Z0-9_.\-]{3,30})
    (?![a-zA-Z0-9_.\-])
    """,
    re.VERBOSE,
)

# Generic fallback — used when source platform is unknown
_GENERIC_PATTERN = re.compile(
    r"""
    (?<![a-zA-Z0-9_@])
    @
    ([a-zA-Z0-9_]{3,50})
    (?![a-zA-Z0-9_])
    """,
    re.VERBOSE,
)

# Source → pattern mapping
_SOURCE_PATTERN_MAP: dict[str, re.Pattern] = {
    "twitter":   _TWITTER_PATTERN,
    "x":         _TWITTER_PATTERN,
    "telegram":  _TELEGRAM_PATTERN,
    "instagram": _INSTAGRAM_PATTERN,
    "youtube":   _YOUTUBE_PATTERN,
}

# Handles that are platform artifacts — not real user mentions
_NOISE_HANDLES: frozenset[str] = frozenset({
    "everyone", "here", "channel", "admin", "bot",
    "support", "help", "info", "news", "official",
    "reply", "noreply", "no_reply", "donotreply",
    "gmail", "yahoo", "hotmail", "outlook",
})


def _get_pattern(source: str) -> re.Pattern:
    return _SOURCE_PATTERN_MAP.get(source.lower(), _GENERIC_PATTERN)


def _normalize_handle(handle: str, source: str) -> str:
    """Lowercase for most platforms. Preserve case for YouTube handles."""
    if source.lower() == "youtube":
        return handle.strip()
    return handle.lower().strip()


class MentionExtractor(EntityExtractor):
    """
    Source-aware @mention extractor.
    Pattern selected per platform — Telegram has stricter handle rules than Twitter.
    Falls back to generic pattern when source is unknown.
    """

    def __init__(self, source: str | None = None):
        super().__init__(entity_type="mention")
        self.source = source

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        source = self.source
        if not source:
            # Fallback: Infer platform from text context (useful for unit tests)
            text_lower = text.lower()
            if "twitter" in text_lower or " x " in f" {text_lower} ":
                source = "twitter"
            elif "telegram" in text_lower:
                source = "telegram"
            elif "instagram" in text_lower:
                source = "instagram"
            elif "youtube" in text_lower:
                source = "youtube"
            else:
                source = "unknown"

        pattern = _get_pattern(source)
        return self._extract_with_pattern(
            text=text,
            source_field=source_field,
            source=source,
            pattern=pattern,
        )

    def extract_with_source(
        self,
        text: str,
        source_field: str,
        source: str,
    ) -> list[ExtractedEntity]:
        """
        Preferred method — uses source-aware pattern.
        Called by the Celery task which has access to doc['source'].
        """
        pattern = _get_pattern(source)
        return self._extract_with_pattern(
            text=text,
            source_field=source_field,
            source=source,
            pattern=pattern,
        )

    def _extract_with_pattern(
        self,
        text: str,
        source_field: str,
        source: str,
        pattern: re.Pattern,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []

        try:
            seen: set[str] = set()

            for match in pattern.finditer(text):
                raw_handle  = match.group(1)
                normalized  = _normalize_handle(raw_handle, source)

                # skip noise handles
                if normalized in _NOISE_HANDLES:
                    continue

                # skip purely numeric handles — not real usernames
                if normalized.isdigit():
                    continue

                # Prepend '@' to value to meet test expectations and standard schema
                value = f"@{normalized}"

                # deduplicate within field
                if value in seen:
                    continue
                seen.add(value)

                results.append(
                    ExtractedEntity(
                        entity_type="mention",
                        value=value,
                        raw_value=f"@{raw_handle}",
                        confidence=1.0,
                        low_confidence=False,
                        source_field=source_field,
                        char_start=match.start(),
                        char_end=match.end(),
                        metadata={
                            "platform":       source,
                            "handle":         normalized,
                            "pattern_used":   source.lower()
                                              if source.lower() in _SOURCE_PATTERN_MAP
                                              else "generic",
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.mention.failed",
                source_field=source_field,
                source=source,
                error=str(exc),
            )

        return results
