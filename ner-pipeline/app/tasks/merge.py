import json
import structlog
from datetime import datetime, timezone
from typing import cast
from pydantic import BaseModel
from prometheus_client import Histogram

from app.celery_app import celery_app
from app.schemas.entity_event import EntityEvent
from app.schemas.extracted_entity import ExtractedEntity
from app.schemas.enriched_doc import EnrichedDocument
from app.services.muril_client import redis_client

logger = structlog.get_logger()

# Prometheus latency histogram
CHORD_LATENCY_HISTOGRAM = Histogram(
    "ner_chord_latency_seconds",
    "Total processing latency of the entity extraction chord in seconds",
    labelnames=["status"]
)

class FailedNEREvent(BaseModel):
    source: str
    source_id: str
    error_message: str
    failed_at: datetime
    stage: str = "ner-pipeline"

# Task settings matching guidelines
TASK_SETTINGS = {
    "bind": True,
    "max_retries": 3,
    "autoretry_for": (Exception,),
    "retry_backoff": True,
}


# ── Merge callback ────────────────────────────────────────────────────────────

@celery_app.task(**TASK_SETTINGS)
def merge_entities(self, results: list[list[dict]], doc_dict: dict) -> dict:
    """
    Chord callback task that merges entity results from all 12 tasks, 
    deduplicates them, and publishes the final success payload.
    """
    try:
        doc = EnrichedDocument.model_validate(doc_dict)
    except Exception as exc:
        logger.error("merge.document_validation_failed", error=str(exc))
        raise

    log = logger.bind(
        task="merge_entities",
        source=doc.source,
        source_id=doc.source_id,
        stage="merge_success"
    )
    log.info("Starting merge of entities from successful parallel extraction.")

    # Deferred import to avoid circular dependency
    from app.tasks.publish import publish_entity_event

    try:
        # ── flatten 12 lists into one ─────────────────────────────────────────
        raw_entities: list[dict] = []
        for result in results:
            if isinstance(result, list):
                raw_entities.extend(result)

        log.debug("merge.raw_count", count=len(raw_entities))

        # ── deserialize to ExtractedEntity ────────────────────────────────────
        entities: list[ExtractedEntity] = []
        for raw in raw_entities:
            try:
                entities.append(ExtractedEntity.model_validate(raw))
            except Exception as exc:
                log.warning(
                    "merge.entity_validation_failed",
                    error=str(exc),
                    raw=str(raw)[:100],
                )

        # ── cross-extractor deduplication ─────────────────────────────────────
        # Same entity found in content + translated_content → keep first
        # Keyed by (entity_type, value) — case-sensitive for orgs/persons
        deduplicated: list[ExtractedEntity] = []
        seen: set[tuple[str, str]]          = set()

        # Sort: content first, translated_content second, ocr_text last
        # This ensures content-sourced entities win dedup over OCR/translated text
        _FIELD_ORDER = {"content": 0, "translated_content": 1, "ocr_text": 2}
        entities.sort(
            key=lambda e: _FIELD_ORDER.get(e.source_field, 3)
        )

        for entity in entities:
            key = (entity.entity_type, entity.value)
            if key not in seen:
                seen.add(key)
                deduplicated.append(entity)

        log.debug(
            "merge.after_dedup",
            before=len(entities),
            after=len(deduplicated),
        )

        # ── build EntityEvent ─────────────────────────────────────────────────
        event = EntityEvent(
            source=doc.source,
            source_id=doc.source_id,
            published_at=doc.published_at,
            language=doc.language,
            processed_at=datetime.now(timezone.utc),
            entities=deduplicated,
            extraction_partial=False,
            failed_extractors=[],
        )

        # compute counts
        event.compute_counts()

        log.info(
            "merge.complete",
            entity_count=event.entity_count,
            has_ml_entities=event.has_ml_entities,
            type_counts=event.entity_type_counts,
        )

        # ── hand off to publish task ──────────────────────────────────────────
        publish_entity_event.apply_async(
            args=[event.model_dump(mode="json")],
            queue="ner-ml",
        )

        # ── Clean up Redis partial cache keys ─────────────────────────────────
        try:
            partial_keys = cast(list[str], redis_client.keys(f"ner:partial:{doc.source_id}:*"))
            if partial_keys:
                redis_client.delete(*partial_keys)
        except Exception as e:
            log.error("Failed to clean up partial cache keys in Redis", error=str(e))

        # ── Record latency ────────────────────────────────────────────────────
        start_time = doc.processed_at or doc.collected_at
        if start_time:
            latency = (datetime.now(timezone.utc) - start_time).total_seconds()
            CHORD_LATENCY_HISTOGRAM.labels(status="success").observe(latency)
            log.info("NER extraction and merging completed successfully", duration_seconds=latency)

        return event.model_dump(mode="json")

    except Exception as exc:
        log.error("merge.unexpected_error", error=str(exc))
        raise


# ── Chord error handler ───────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.merge.handle_chord_error",
    max_retries=1,
    queue="ner-dlq",
)
def handle_chord_error(self, request, exc, traceback, doc_dict: dict) -> None:
    """
    Fires via link_error if any chord subtask exhausts retries.
    Collects whatever partial results are available in Redis,
    publishes a partial EntityEvent, and logs to DLQ.
    Never raises — this is the last line of defense.
    """
    try:
        doc = EnrichedDocument.model_validate(doc_dict)
    except Exception as e:
        logger.error("chord.error_handler_validation_failed", error=str(e))
        return

    log = logger.bind(
        task="handle_chord_error",
        source=doc.source,
        source_id=doc.source_id,
        stage="merge_failure",
        exc=str(exc),
    )
    log.error("NER extraction chord failed. Executing error handling workflow.")

    # Deferred imports to avoid circular dependency
    from app.tasks.publish import publish_entity_event, publish_failed_event

    merged_entities: list[ExtractedEntity] = []
    seen: set[tuple[str, str]]             = set()

    try:
        # Retrieve partial results from completed tasks from Redis
        partial_keys = cast(list[str], redis_client.keys(f"ner:partial:{doc.source_id}:*"))
        for key in partial_keys:
            val = cast(str | None, redis_client.get(key))
            if val:
                try:
                    task_entities = json.loads(val)
                    for entity_data in task_entities:
                        entity = ExtractedEntity.model_validate(entity_data)
                        dup_key = (entity.entity_type, entity.value)
                        if dup_key not in seen:
                            seen.add(dup_key)
                            merged_entities.append(entity)
                except Exception as exc_parse:
                    log.warning("chord.failed_to_parse_partial_result", key=key, error=str(exc_parse))

        log.warning(
            "chord.partial_recovery",
            recovered_entity_count=len(merged_entities),
        )

        # Delete partial keys
        if partial_keys:
            redis_client.delete(*partial_keys)
    except Exception as e:
        log.error("Failed to collect or clear partial results from Redis", error=str(e))

    try:
        # 1. Publish partial result
        partial_event = EntityEvent(
            source=doc.source,
            source_id=doc.source_id,
            published_at=doc.published_at,
            processed_at=datetime.now(timezone.utc),
            language=doc.language,
            entities=merged_entities,
            extraction_partial=True,
            failed_extractors=[str(exc)],
        )
        partial_event.compute_counts()
        publish_entity_event.apply_async(
            args=[partial_event.model_dump(mode="json")],
            queue="ner-ml",
        )
    except Exception as e:
        log.error("Failed to publish partial entity event to Kafka", error=str(e))

    try:
        # 2. Publish failure event to processing.failed topic
        error_msg = f"Chord execution failed. Task Request ID: {getattr(request, 'id', str(request))}. Error: {exc}"
        failed_event = FailedNEREvent(
            source=doc.source,
            source_id=doc.source_id,
            error_message=error_msg,
            failed_at=datetime.now(timezone.utc)
        )
        publish_failed_event.apply_async(
            args=[failed_event.model_dump(mode="json")],
            queue="ner-dlq",
        )
    except Exception as e:
        log.error("Failed to publish failure event to DLQ", error=str(e))

    # Record latency
    start_time = doc.processed_at or doc.collected_at
    if start_time:
        latency = (datetime.now(timezone.utc) - start_time).total_seconds()
        CHORD_LATENCY_HISTOGRAM.labels(status="failed").observe(latency)
        log.info("NER extraction failure handling finished", duration_seconds=latency)
