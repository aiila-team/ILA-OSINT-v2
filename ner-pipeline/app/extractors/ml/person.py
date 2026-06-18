import structlog

from app.config import settings
from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity
from app.services.muril_client import get_muril_client, NERTag

log = structlog.get_logger()


def _build_span_text(span: list[NERTag]) -> tuple[str, str, float, int, int]:
    """
    Reconstructs surface form from BIO span tokens.
    Returns (normalized_value, raw_value, avg_confidence, char_start, char_end).
    Handles subword tokens — MuRIL uses WordPiece tokenization,
    tokens starting with ## are subwords and must be joined without space.
    """
    tokens:     list[str] = []
    raw_tokens: list[str] = []
    scores:     list[float] = []

    for tag in span:
        word = tag.word
        raw_tokens.append(word)

        # WordPiece subword — join directly to previous token
        if word.startswith("##"):
            if tokens:
                tokens[-1] = tokens[-1] + word[2:]
            else:
                tokens.append(word[2:])
        else:
            tokens.append(word)

        scores.append(tag.score)

    surface     = " ".join(tokens).strip()
    raw_surface = " ".join(raw_tokens).strip()
    avg_score   = sum(scores) / len(scores) if scores else 0.0
    char_start  = span[0].start
    char_end    = span[-1].end

    return surface, raw_surface, avg_score, char_start, char_end


def _normalize_person_name(name: str) -> str:
    """
    Light normalization for person names:
    - Title case
    - Remove leading/trailing punctuation
    - Collapse internal whitespace
    Does NOT transliterate — that happens in entity resolution (graph-engine).
    """
    name = name.strip(" .,;:-'\"")
    name = " ".join(name.split())         # collapse whitespace
    # Title case only for Latin script names
    # Indic names retain their original casing from MuRIL output
    if name.isascii():
        name = name.title()
    return name


def _is_noise_name(name: str) -> bool:
    """
    Filters out common false positives from MuRIL-NER person extraction.
    MuRIL sometimes tags organization fragments, honorifics, and
    common words as person names in certain contexts.
    """
    lower = name.lower().strip()

    # too short to be a real name
    if len(lower) < 3:
        return True

    # single token that is a known honorific only — no actual name
    _HONORIFICS_ONLY: frozenset[str] = frozenset({
        "mr", "mrs", "ms", "dr", "prof", "shri", "smt",
        "श्री", "श्रीमती", "डॉ",
        "sir", "madam", "sahib", "ji",
    })
    if lower in _HONORIFICS_ONLY:
        return True

    # purely numeric — not a name
    if lower.replace(" ", "").isdigit():
        return True

    return False


class PersonExtractor(EntityExtractor):
    """
    Extracts person names using MuRIL-NER via Triton.
    Reads from Redis cache — does not call Triton directly.
    The first ML extractor task to run for a given source_id
    populates the cache; subsequent extractors (org, location) read from it.
    """

    def __init__(self, source_id: str | None = None, translation_failed: bool = False):
        super().__init__(entity_type="person")
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
                entity_prefix="PER",
            )

            seen: set[str] = set()

            for span in spans:
                surface, raw, avg_score, char_start, char_end = _build_span_text(span)
                normalized = _normalize_person_name(surface)

                if _is_noise_name(normalized):
                    continue

                if normalized in seen:
                    continue
                seen.add(normalized)

                # if translation failed, MuRIL ran on untranslated text
                # lower confidence to reflect reduced accuracy
                confidence = avg_score
                if translation_failed:
                    confidence = confidence * 0.85

                confidence      = round(confidence, 4)
                is_low          = confidence < settings.NER_CONFIDENCE_THRESHOLD

                results.append(
                    ExtractedEntity(
                        entity_type="person",
                        value=normalized,
                        raw_value=raw,
                        confidence=confidence,
                        low_confidence=is_low,
                        source_field=source_field,
                        char_start=char_start,
                        char_end=char_end,
                        metadata={
                            "token_count":        len(span),
                            "translation_failed": translation_failed,
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.person.failed",
                source_id=source_id,
                source_field=source_field,
                error=str(exc),
            )

        return results
