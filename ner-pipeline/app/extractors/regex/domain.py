import re
import tldextract
import structlog

from app.config import settings
from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()


# ── URL pattern — catches http, https, ftp and bare domain references ─────────
_URL_PATTERN = re.compile(
    r"""
    (?:
        https?://                          # explicit scheme
        |ftp://
        |(?<![a-zA-Z0-9@\-_.])            # or bare domain — not preceded by email/path chars
    )
    (
        (?:[a-zA-Z0-9]                     # domain start — alphanumeric
        (?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?  # domain body
        \.)+                               # one or more labels
        [a-zA-Z]{2,63}                     # TLD
        (?:/[^\s<>"']*)?                   # optional path
    )
    """,
    re.VERBOSE | re.UNICODE,
)

# IP address pattern — exclude bare IPs from domain extraction
_IP_PATTERN = re.compile(
    r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"
)

# Single-label hostnames with no TLD — not public domains
_SINGLE_LABEL = re.compile(r"^[a-zA-Z0-9\-]+$")


class DomainExtractor(EntityExtractor):
    def __init__(self):
        super().__init__(entity_type="domain")
        # Initialize extractor in offline mode by setting suffix_list_urls to an empty tuple
        self.tld_extractor = tldextract.TLDExtract(suffix_list_urls=())

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

            for match in _URL_PATTERN.finditer(text):
                raw_url = match.group(1)

                # skip bare IPs — handled by IPAddressExtractor
                if _IP_PATTERN.match(raw_url.split("/")[0]):
                    continue

                # parse with tldextract — offline, no DNS lookup
                extracted = self.tld_extractor(raw_url)

                # must have both domain and suffix to be a valid registered domain
                if not extracted.domain or not extracted.suffix:
                    continue

                # skip single-label entries with no recognizable TLD
                if _SINGLE_LABEL.match(raw_url):
                    continue

                registered_domain = f"{extracted.domain}.{extracted.suffix}".lower()
                subdomain         = extracted.subdomain.lower() if extracted.subdomain else ""
                full_domain       = (
                    f"{subdomain}.{registered_domain}"
                    if subdomain else registered_domain
                )

                # skip excluded high-noise domains
                if registered_domain in settings.NER_EXCLUDED_DOMAINS:
                    continue

                # deduplicate on registered domain level
                # www.example.com and api.example.com → one entity for example.com
                if registered_domain in seen:
                    continue
                seen.add(registered_domain)

                # detect Indian ccTLD or .in domains — higher ILA relevance
                is_indian = (
                    extracted.suffix == "in"
                    or extracted.suffix.endswith(".in")
                    or extracted.suffix == "co.in"
                    or extracted.suffix == "gov.in"
                    or extracted.suffix == "nic.in"
                )

                results.append(
                    ExtractedEntity(
                        entity_type="domain",
                        value=registered_domain,
                        raw_value=raw_url.split("/")[0],  # just host, no path
                        confidence=1.0,
                        low_confidence=False,
                        source_field=source_field,
                        char_start=match.start(1),
                        char_end=match.end(1),
                        metadata={
                            "registered_domain": registered_domain,
                            "subdomain":         subdomain,
                            "full_domain":       full_domain,
                            "tld":               extracted.suffix,
                            "is_indian_domain":  is_indian,
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.domain.failed",
                source_field=source_field,
                error=str(exc),
            )

        return results
