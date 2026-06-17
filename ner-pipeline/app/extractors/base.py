import abc
import structlog
from prometheus_client import Counter
from app.schemas.extracted_entity import ExtractedEntity

logger = structlog.get_logger()

# Shared Prometheus counter to avoid duplicate timeseries registration errors
ENTITIES_EXTRACTED_COUNTER = Counter(
    "ner_extracted_entities_total",
    "Total number of entities extracted",
    labelnames=["extractor", "entity_type"]
)

class EntityExtractor(abc.ABC):
    """
    Base class for all 12 entity extractors.

    Contract:
    - extract() never raises — catch all exceptions internally, return []
    - extract() receives the full text and source_field name
    - extract() returns list[ExtractedEntity], empty list on no match or error
    - Subclasses must not load models at import time — use lazy initialization
    """

    def __init__(self, entity_type: str):
        self.entity_type = entity_type
        self.counter = ENTITIES_EXTRACTED_COUNTER

    @abc.abstractmethod
    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        pass

    def extract_all_fields(
        self,
        fields: dict[str, str],
    ) -> list[ExtractedEntity]:
        """
        Runs extract() over all available text fields.
        Deduplicates by (entity_type, value) across fields —
        same entity found in content and translated_content counts once.
        Preserves the first occurrence (content > translated_content > ocr_text).
        """
        log = logger.bind(entity_type=self.entity_type, stage="extract_all_fields")
        seen = set()
        results = []

        for source_field, text in fields.items():
            if not text or not text.strip():
                continue
            try:
                extracted = self.extract(text, source_field)
                if not extracted:
                    continue

                for entity in extracted:
                    key = (entity.entity_type, entity.value)
                    if key not in seen:
                        seen.add(key)
                        results.append(entity)

                # Increment Prometheus metrics safely
                self.counter.labels(
                    extractor=self.__class__.__name__,
                    entity_type=self.entity_type
                ).inc(len(extracted))

            except Exception as e:
                log.exception(
                    "Extractor failed on field",
                    source_field=source_field,
                    error=str(e)
                )

        return results

# Backward compatibility alias
BaseExtractor = EntityExtractor
