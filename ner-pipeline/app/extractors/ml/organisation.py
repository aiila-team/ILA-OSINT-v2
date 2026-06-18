import re
import structlog

from app.config import settings
from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity
from app.extractors.ml.person import _build_span_text
from app.services.muril_client import get_muril_client

log = structlog.get_logger()


# ── Organisation type classification ─────────────────────────────────────────
# Keyword sets used to classify org type from surface form
# Checked after MuRIL extraction — no model needed

_GOV_KEYWORDS: frozenset[str] = frozenset({
    "ministry", "department", "government", "govt", "bureau",
    "commission", "committee", "authority", "board", "council",
    "tribunal", "court", "directorate", "office", "national",
    "central", "state", "district", "municipal",
    "मंत्रालय", "सरकार", "विभाग", "आयोग",    # Hindi
    "সরকার", "মন্ত্রণালয়",                  # Bengali
})

_MILITARY_KEYWORDS: frozenset[str] = frozenset({
    "army", "navy", "airforce", "air force", "military",
    "regiment", "brigade", "battalion", "corps", "division",
    "defence", "defense", "armed forces", "paramilitary",
    "crpf", "bsf", "cisf", "itbp", "ssb", "nsf",
    "सेना", "वायुसेना", "नौसेना",            # Hindi
})

_FINANCIAL_KEYWORDS: frozenset[str] = frozenset({
    "bank", "finance", "financial", "capital", "investment",
    "securities", "insurance", "fund", "asset", "credit",
    "payment", "fintech", "wallet", "exchange",
    "बैंक", "वित्त",                         # Hindi
    "ব্যাংক", "অর্থ",                        # Bengali
})

_MILITANT_KEYWORDS: frozenset[str] = frozenset({
    "front", "liberation", "movement", "resistance", "force",
    "federation", "alliance", "jihad", "mujahideen", "lashkar",
    "jaish", "hizbul", "hamas", "isis", "isil", "daesh",
    "naxal", "maoist", "ulfa", "nscn", "pfi",
})

_MEDIA_KEYWORDS: frozenset[str] = frozenset({
    "news", "media", "press", "broadcast", "television", "tv",
    "radio", "channel", "times", "post", "herald", "tribune",
    "express", "journal", "daily", "weekly",
})

# Common false positives from MuRIL — fragments tagged as ORG
_NOISE_ORGS: frozenset[str] = frozenset({
    "the", "a", "an", "said", "according",
    "inc", "ltd", "llp", "pvt",            # suffixes alone
    "ji", "sahib",
})

# Suffixes that confirm an entity is an organisation
_ORG_SUFFIXES = re.compile(
    r"""
    \b(
        inc\.?|ltd\.?|llp\.?|llc\.?|pvt\.?|
        limited|incorporated|corporation|corp\.?|
        co\.?|company|group|holdings|enterprises|
        foundation|trust|society|association|union|
        प्राइवेट\s*लिमिटेड|लिमिटेड|    # Hindi
        প্রাইভেট\s*লিমিটেড              # Bengali
    )\b
    """,
    re.VERBOSE | re.IGNORECASE | re.UNICODE,
)


def _classify_org(name: str) -> str:
    """Classifies organisation into a broad category."""
    lower = name.lower()

    if any(kw in lower for kw in _MILITANT_KEYWORDS):
        return "militant_group"
    if any(kw in lower for kw in _MILITARY_KEYWORDS):
        return "military"
    if any(kw in lower for kw in _GOV_KEYWORDS):
        return "government"
    if any(kw in lower for kw in _FINANCIAL_KEYWORDS):
        return "financial"
    if any(kw in lower for kw in _MEDIA_KEYWORDS):
        return "media"
    if _ORG_SUFFIXES.search(name):
        return "corporate"
    return "unknown"


def _normalize_org_name(name: str) -> str:
    """
    Normalizes organisation name:
    - Strip punctuation edges
    - Collapse whitespace
    - Expand common abbreviations
    - Do NOT lowercase — org names are case-sensitive for entity resolution
    """
    name = name.strip(" .,;:-'\"")
    name = " ".join(name.split())
    return name


def _is_noise_org(name: str) -> bool:
    lower = name.lower().strip()

    if len(lower) < 2:
        return True

    if lower in _NOISE_ORGS:
        return True

    # single token that is only a suffix
    if _ORG_SUFFIXES.fullmatch(lower):
        return True

    if lower.replace(" ", "").isdigit():
        return True

    return False


class OrganisationExtractor(EntityExtractor):
    """
    Extracts organisation names using MuRIL-NER via Triton.
    Reads from Redis cache — does not call Triton directly.
    The first ML extractor task to run for a given source_id
    populates the cache; subsequent extractors (org, location) read from it.
    """

    def __init__(self, source_id: str | None = None, translation_failed: bool = False):
        super().__init__(entity_type="org")
        self.source_id = source_id or "unknown_doc"
        self.translation_failed = translation_failed

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        # Delegate to extract_for_doc utilizing the instance properties
        return self.extract_for_doc(
            text=text,
            source_field=source_field,
            source_id=self.source_id,
            translation_failed=self.translation_failed,
        )

    def extract_for_doc(
        self,
        text: str,
        source_field: str,
        source_id: str,
        translation_failed: bool = False,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []

        try:
            client = get_muril_client()
            spans  = client.get_tags_by_type(
                source_id=source_id,
                text=text,
                entity_prefix="ORG",
            )

            seen: set[str] = set()

            for span in spans:
                surface, raw, avg_score, char_start, char_end = _build_span_text(span)
                normalized = _normalize_org_name(surface)

                if _is_noise_org(normalized):
                    continue

                if normalized in seen:
                    continue
                seen.add(normalized)

                # boost confidence if org suffix found — strong structural signal
                has_suffix = bool(_ORG_SUFFIXES.search(normalized))
                confidence = avg_score
                if has_suffix:
                    confidence = min(1.0, confidence + 0.05)
                if translation_failed:
                    confidence = confidence * 0.85

                confidence = round(confidence, 4)
                is_low     = confidence < settings.NER_CONFIDENCE_THRESHOLD

                org_type   = _classify_org(normalized)

                # militant group detection — flag for risk engine
                is_militant = org_type == "militant_group"

                results.append(
                    ExtractedEntity(
                        entity_type="org",
                        value=normalized,
                        raw_value=raw,
                        confidence=confidence,
                        low_confidence=is_low,
                        source_field=source_field,
                        char_start=char_start,
                        char_end=char_end,
                        metadata={
                            "org_type":          org_type,
                            "is_militant_group": is_militant,
                            "has_org_suffix":    has_suffix,
                            "token_count":       len(span),
                            "translation_failed": translation_failed,
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.organisation.failed",
                source_id=source_id,
                source_field=source_field,
                error=str(exc),
            )

        return results
