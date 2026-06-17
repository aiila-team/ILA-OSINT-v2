import re
import structlog

from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()

# UPI VPA (Virtual Payment Address) pattern
# Format: localpart@psp
# localpart: alphanumeric, dots, hyphens, underscores — 2 to 256 chars
# psp: registered PSP handle — letters only, 2 to 64 chars
# Examples: rahul.sharma@okicici, 9876543210@paytm, business.name@ybl
_UPI_PATTERN = re.compile(
    r"""
    (?<![a-zA-Z0-9.\-_@])     # no preceding UPI chars
    (
        [a-zA-Z0-9.\-_]{2,256}   # local part
        @
        [a-zA-Z]{2,64}           # PSP handle — letters only, no digits
    )
    (?![a-zA-Z0-9\-_@])      # no trailing UPI chars (allow trailing dot punctuation)
    (?![.][a-zA-Z])          # but prevent trailing dot if followed by a letter (like email)
    """,
    re.VERBOSE | re.UNICODE,
)

# Known registered PSP handles in India
# Used to boost confidence and add metadata
_KNOWN_PSP_HANDLES: dict[str, str] = {
    "okicici":   "ICICI Bank",
    "oksbi":     "State Bank of India",
    "okaxis":    "Axis Bank",
    "okhdfcbank":"HDFC Bank",
    "paytm":     "Paytm Payments Bank",
    "ybl":       "Yes Bank (PhonePe)",
    "ibl":       "IndusInd Bank (PhonePe)",
    "axl":       "Axis Bank (PhonePe)",
    "upi":       "Generic UPI",
    "gpay":      "Google Pay",
    "apl":       "Amazon Pay",
    "freecharge": "FreeCharge",
    "ikwik":     "MobiKwik",
    "slice":     "Slice",
    "jupiteraxis":"Jupiter (Axis)",
    "niyoicici": "Niyo (ICICI)",
    "kotak":     "Kotak Mahindra Bank",
    "pnb":       "Punjab National Bank",
    "boi":       "Bank of India",
    "centralbank":"Central Bank of India",
    "citi":      "Citibank",
    "hsbc":      "HSBC",
}

# Email-like patterns that regex will catch but are NOT UPI handles
# Filtered out to avoid false positives from email extraction overlap
_EMAIL_TLDS: frozenset[str] = frozenset({
    "com", "in", "org", "net", "gov", "edu",
    "co", "io", "ai", "app", "dev", "info",
})


class UPIExtractor(EntityExtractor):
    def __init__(self):
        super().__init__(entity_type="upi")

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []

        try:
            for match in _UPI_PATTERN.finditer(text):
                raw = match.group(1)
                normalized = raw.lower().strip()

                psp_handle = normalized.split("@")[-1]

                # filter out email addresses caught by the pattern
                # UPI PSP handles are never standard TLDs
                if psp_handle in _EMAIL_TLDS:
                    continue

                # filter out handles that are too generic to be UPI
                # e.g. single-char handles, pure numeric handles
                local_part = normalized.split("@")[0]
                if len(local_part) < 2:
                    continue
                if local_part.isdigit() and len(local_part) < 5:
                    continue

                # resolve PSP name if known
                psp_name = _KNOWN_PSP_HANDLES.get(psp_handle, "")
                is_known = bool(psp_name)

                results.append(
                    ExtractedEntity(
                        entity_type="upi",
                        value=normalized,
                        raw_value=raw,
                        confidence=1.0,
                        low_confidence=False,
                        source_field=source_field,
                        char_start=match.start(1),
                        char_end=match.end(1),
                        metadata={
                            "psp":        psp_handle,
                            "psp_handle": psp_handle,
                            "psp_name":   psp_name,
                            "is_known_psp": is_known,
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.upi.failed",
                source_field=source_field,
                error=str(exc),
            )

        return results
