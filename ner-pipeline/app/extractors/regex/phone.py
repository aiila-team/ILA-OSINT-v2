import phonenumbers
from phonenumbers import PhoneNumberMatcher, PhoneNumberFormat, NumberParseException, carrier
import structlog

from app.config import settings
from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()

class PhoneExtractor(EntityExtractor):
    def __init__(self):
        super().__init__(entity_type="phone")

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []

        try:
            matches = PhoneNumberMatcher(
                text,
                settings.NER_PHONE_DEFAULT_REGION,
            )

            for match in matches:
                number = match.number

                # only keep valid numbers
                if not phonenumbers.is_valid_number(number):
                    continue

                normalized = phonenumbers.format_number(
                    number,
                    PhoneNumberFormat.E164,
                )

                try:
                    carrier_name = carrier.name_for_number(number, "en")
                except Exception:
                    carrier_name = ""

                try:
                    region = phonenumbers.region_code_for_number(number)
                except Exception:
                    region = ""

                number_type = phonenumbers.number_type(number)
                type_name   = _NUMBER_TYPE_MAP.get(number_type, "unknown")

                results.append(
                    ExtractedEntity(
                        entity_type="phone",
                        value=normalized,
                        raw_value=match.raw_string,
                        confidence=1.0,
                        low_confidence=False,
                        source_field=source_field,
                        char_start=match.start,
                        char_end=match.end,
                        metadata={
                            "carrier":      carrier_name,
                            "country_code": region,
                            "number_type":  type_name,
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.phone.failed",
                source_field=source_field,
                error=str(exc),
            )

        return results

# phonenumbers PhoneNumberType int → readable string
_NUMBER_TYPE_MAP: dict[int, str] = {
    0:  "fixed_line",
    1:  "mobile",
    2:  "fixed_or_mobile",
    3:  "toll_free",
    4:  "premium_rate",
    5:  "shared_cost",
    6:  "voip",
    7:  "personal_number",
    8:  "pager",
    9:  "uan",
    10: "voicemail",
    27: "unknown",
}
