import re
import ipaddress
import structlog

from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()


# ── IPv4 ──────────────────────────────────────────────────────────────────────
# Strict octet validation — each octet 0-255
_IPV4_PATTERN = re.compile(
    r"""
    (?<![.\d])                        # no preceding digit or dot
    (
        (?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}
        (?:25[0-5]|2[0-4]\d|[01]?\d\d?)
    )
    (?![.\d])                         # no trailing digit or dot
    """,
    re.VERBOSE,
)

# ── IPv6 ──────────────────────────────────────────────────────────────────────
# Full and compressed forms including ::1, fe80::, 2001:db8:: etc.
_IPV6_PATTERN = re.compile(
    r"""
    (?<![:\w])
    (
        (?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}          # full form
        |(?:[a-fA-F0-9]{1,4}:){1,7}:                       # trailing ::
        |:(?::[a-fA-F0-9]{1,4}){1,7}                       # leading ::
        |(?:[a-fA-F0-9]{1,4}:){1,6}:[a-fA-F0-9]{1,4}
        |(?:[a-fA-F0-9]{1,4}:){1,5}(?::[a-fA-F0-9]{1,4}){1,2}
        |(?:[a-fA-F0-9]{1,4}:){1,4}(?::[a-fA-F0-9]{1,4}){1,3}
        |(?:[a-fA-F0-9]{1,4}:){1,3}(?::[a-fA-F0-9]{1,4}){1,4}
        |(?:[a-fA-F0-9]{1,4}:){1,2}(?::[a-fA-F0-9]{1,4}){1,5}
        |[a-fA-F0-9]{1,4}:(?::[a-fA-F0-9]{1,4}){1,6}
        |::(?:[a-fA-F0-9]{1,4}:){0,5}[a-fA-F0-9]{1,4}
        |::1                                                # loopback
        |::                                                 # unspecified
    )
    (?![:\w])
    """,
    re.VERBOSE,
)


def _is_excluded(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _classify_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str:
    """Returns a broad geographic/ownership classification where possible."""
    if ip.version == 4:
        try:
            first_octet = int(str(ip).split(".")[0])
            if first_octet in range(117, 128):
                return "IN_ISP_likely"
            if first_octet in range(49, 60):
                return "APAC"
        except Exception:
            pass
    return "public"


class IPAddressExtractor(EntityExtractor):
    def __init__(self):
        super().__init__(entity_type="ip")

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

            # ── IPv4 ──────────────────────────────────────────────────────────
            for match in _IPV4_PATTERN.finditer(text):
                raw = match.group(1)
                try:
                    ip = ipaddress.ip_address(raw)
                    if ip.version != 4:
                        continue
                    if _is_excluded(ip):
                        continue

                    normalized = str(ip)
                    if normalized in seen:
                        continue
                    seen.add(normalized)

                    classification = _classify_ip(ip)

                    results.append(
                        ExtractedEntity(
                            entity_type="ip",
                            value=normalized,
                            raw_value=raw,
                            confidence=1.0,
                            low_confidence=False,
                            source_field=source_field,
                            char_start=match.start(1),
                            char_end=match.end(1),
                            metadata={
                                "ip_version":      "v4",
                                "classification":  classification,
                            },
                        )
                    )
                except ValueError:
                    continue

            # ── IPv6 ──────────────────────────────────────────────────────────
            for match in _IPV6_PATTERN.finditer(text):
                raw = match.group(1)
                try:
                    ip = ipaddress.ip_address(raw)
                    if ip.version != 6:
                        continue
                    if _is_excluded(ip):
                        continue

                    # ipaddress normalizes IPv6 to compressed lowercase form
                    normalized = str(ip)
                    if normalized in seen:
                        continue
                    seen.add(normalized)

                    results.append(
                        ExtractedEntity(
                            entity_type="ip",
                            value=normalized,
                            raw_value=raw,
                            confidence=1.0,
                            low_confidence=False,
                            source_field=source_field,
                            char_start=match.start(1),
                            char_end=match.end(1),
                            metadata={
                                "ip_version":     "v6",
                                "classification": "public",
                            },
                        )
                    )
                except ValueError:
                    continue

        except Exception as exc:
            log.error(
                "extractor.ip_address.failed",
                source_field=source_field,
                error=str(exc),
            )

        return results