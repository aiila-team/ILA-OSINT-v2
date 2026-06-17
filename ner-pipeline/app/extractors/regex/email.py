import re
import structlog

from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()

# RFC 5322 simplified — covers 99% of real-world email addresses
# Includes Indic unicode characters in local part (rare but valid)
_EMAIL_PATTERN = re.compile(
    r"""
    (?<![a-zA-Z0-9._%+\-])   # no preceding email chars — prevents partial matches
    (
        [a-zA-Z0-9._%+\-]{1,64}   # local part
        @
        [a-zA-Z0-9.\-]{1,253}     # domain
        \.
        [a-zA-Z]{2,63}            # TLD
    )
    (?![a-zA-Z0-9_%+\-])     # no trailing email chars (allow dot punctuation)
    (?![.][a-zA-Z0-9])        # but prevent dot if followed by domain alphanumeric
    """,
    re.VERBOSE | re.UNICODE,
)

# Domains that produce extremely high false-positive rates in OSINT content
# e.g. "reply@twitter.com" in scraped notification emails
_NOISE_DOMAINS: frozenset[str] = frozenset({
    "twitter.com", "t.co", "telegram.org", "t.me",
    "youtube.com", "gmail.com", "yahoo.com", "hotmail.com",
    "outlook.com", "facebook.com", "instagram.com",
    "noreply.github.com", "mailer.example.com",
})


class EmailExtractor(EntityExtractor):
    def __init__(self):
        super().__init__(entity_type="email")

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []

        try:
            for match in _EMAIL_PATTERN.finditer(text):
                raw   = match.group(1)
                lower = raw.lower()

                # extract domain for noise filtering
                domain = lower.split("@")[-1]
                if domain in _NOISE_DOMAINS:
                    continue

                # basic structural sanity — local part must not start/end with dot
                local = lower.split("@")[0]
                if local.startswith(".") or local.endswith("."):
                    continue

                results.append(
                    ExtractedEntity(
                        entity_type="email",
                        value=lower,           # normalized to lowercase
                        raw_value=raw,
                        confidence=1.0,
                        low_confidence=False,
                        source_field=source_field,
                        char_start=match.start(1),
                        char_end=match.end(1),
                        metadata={
                            "domain": domain,
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.email.failed",
                source_field=source_field,
                error=str(exc),
            )

        return results
