import re
import structlog

from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()


# ── Hashtag pattern — covers Latin + all major Indic scripts ─────────────────
#
# Unicode ranges included:
#   \u0900-\u097F  Devanagari      (Hindi, Marathi, Sanskrit, Nepali)
#   \u0980-\u09FF  Bengali         (Bengali, Assamese)
#   \u0A00-\u0A7F  Gurmukhi        (Punjabi)
#   \u0A80-\u0AFF  Gujarati
#   \u0B00-\u0B7F  Oriya
#   \u0B80-\u0BFF  Tamil
#   \u0C00-\u0C7F  Telugu
#   \u0C80-\u0CFF  Kannada
#   \u0D00-\u0D7F  Malayalam
#   \u0D80-\u0DFF  Sinhala
#   \u0E00-\u0E7F  Thai            (cross-border content)
#   \u0600-\u06FF  Arabic/Urdu
#   \u0750-\u077F  Arabic Supplement
#   \uFB50-\uFDFF  Arabic Presentation Forms-A (Nastaliq Urdu)
#   \uFE70-\uFEFF  Arabic Presentation Forms-B

_HASHTAG_CHARS = (
    r"\w"
    r"\u0900-\u097F"
    r"\u0980-\u09FF"
    r"\u0A00-\u0A7F"
    r"\u0A80-\u0AFF"
    r"\u0B00-\u0B7F"
    r"\u0B80-\u0BFF"
    r"\u0C00-\u0C7F"
    r"\u0C80-\u0CFF"
    r"\u0D00-\u0D7F"
    r"\u0D80-\u0DFF"
    r"\u0E00-\u0E7F"
    r"\u0600-\u06FF"
    r"\u0750-\u077F"
    r"\uFB50-\uFDFF"
    r"\uFE70-\uFEFF"
)

_HASHTAG_PATTERN = re.compile(
    rf"(?<![&\w])#([{_HASHTAG_CHARS}]{{2,100}})(?![{_HASHTAG_CHARS}])",
    re.UNICODE,
)

# Hashtags that are pure noise — platform artifacts, not intelligence signals
_NOISE_HASHTAGS: frozenset[str] = frozenset({
    "ff", "followfriday", "rt", "retweet", "like",
    "follow", "share", "viral", "trending", "news",
    "breakingnews", "live", "video", "photo", "photos",
    "instagram", "twitter", "facebook", "youtube",
    "tbt", "throwbackthursday", "mondaymotivation",
    "wcw", "mcm", "ootd", "selfie", "nofilter",
})

# Script detection — which Unicode block does a char belong to?
_SCRIPT_RANGES: list[tuple[int, int, str]] = [
    (0x0900, 0x097F, "Devanagari"),
    (0x0980, 0x09FF, "Bengali"),
    (0x0A00, 0x0A7F, "Gurmukhi"),
    (0x0A80, 0x0AFF, "Gujarati"),
    (0x0B00, 0x0B7F, "Oriya"),
    (0x0B80, 0x0BFF, "Tamil"),
    (0x0C00, 0x0C7F, "Telugu"),
    (0x0C80, 0x0CFF, "Kannada"),
    (0x0D00, 0x0D7F, "Malayalam"),
    (0x0D80, 0x0DFF, "Sinhala"),
    (0x0E00, 0x0E7F, "Thai"),
    (0x0600, 0x06FF, "Arabic_Urdu"),
    (0x0750, 0x077F, "Arabic_Urdu"),
    (0xFB50, 0xFDFF, "Arabic_Urdu"),
    (0xFE70, 0xFEFF, "Arabic_Urdu"),
    (0x0041, 0x007A, "Latin"),
]


def _detect_script(text: str) -> str:
    """Returns dominant script of the hashtag text."""
    counts: dict[str, int] = {}
    for char in text:
        cp = ord(char)
        for start, end, script in _SCRIPT_RANGES:
            if start <= cp <= end:
                counts[script] = counts.get(script, 0) + 1
                break
    if not counts:
        return "unknown"
    return max(counts, key=lambda k: counts[k])


class HashtagExtractor(EntityExtractor):
    def __init__(self):
        super().__init__(entity_type="hashtag")

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []

        try:
            seen: set[str] = set()

            for match in _HASHTAG_PATTERN.finditer(text):
                raw_tag   = match.group(1)
                normalized_no_hash = raw_tag.lower().strip()

                # skip noise hashtags
                if normalized_no_hash in _NOISE_HASHTAGS:
                    continue

                # skip pure numeric hashtags — #123456 is not intelligence
                if normalized_no_hash.isdigit():
                    continue

                normalized = f"#{normalized_no_hash}"

                # deduplicate within field
                if normalized in seen:
                    continue
                seen.add(normalized)

                script = _detect_script(raw_tag)
                is_indic = script not in ("Latin", "unknown")

                results.append(
                    ExtractedEntity(
                        entity_type="hashtag",
                        value=normalized,
                        raw_value=f"#{raw_tag}",
                        confidence=1.0,
                        low_confidence=False,
                        source_field=source_field,
                        char_start=match.start(),
                        char_end=match.end(),
                        metadata={
                            "script":    script,
                            "is_indic":  is_indic,
                            "char_count": len(raw_tag),
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.hashtag.failed",
                source_field=source_field,
                error=str(exc),
            )

        return results
