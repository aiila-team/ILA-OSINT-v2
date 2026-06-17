# app/tasks/dedup.py
import hashlib
import time
from functools import lru_cache

import structlog
from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.observability.metrics import DEDUP_HITS, STAGE_LATENCY, STAGE_MESSAGES
from app.schemas.enriched_doc import EnrichedDocument
from app.schemas.raw_event import RawEvent
from app.services.dedup_engine import DedupEngine, get_dedup_engine

logger = structlog.get_logger()


@lru_cache(maxsize=1)
def get_dedup_engine_cached() -> DedupEngine:
    """Get or create DedupEngine instance cached per process."""
    return get_dedup_engine()


def dispatch_downstream(doc_dict: dict) -> None:
    """Dynamically dispatch downstream tasks for a unique document."""
    from celery import chain, group, chord
    from app.tasks.translate import translate_task
    from app.tasks.ocr import ocr_task
    from app.tasks.embed import embed_task
    from app.tasks.publish import publish_task

    pipeline_flow = chord(
        group(
            translate_task.s(doc_dict),
            ocr_task.s(doc_dict)
        ),
        body=chain(
            merge_parallel_results.s(),
            embed_task.s(),
            publish_task.s()
        )
    )
    pipeline_flow.delay()


@celery_app.task(
    bind=True,
    name="app.tasks.dedup.dedup_task",
    max_retries=3,
    queue="medium",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
)
def dedup_task(self, raw_event_dict: dict) -> dict:
    """
    Celery task to run deduplication on an incoming raw event.
    Performs exact matches on source/ID and near-duplicate detection via MinHash LSH.
    """
    # Short-circuit if duplicate check was already flagged upstream
    # (e.g., in a test or retry scenario)
    if raw_event_dict.get("is_duplicate"):
        return raw_event_dict

    start_time = time.perf_counter()
    source = raw_event_dict.get("source", "unknown")
    source_id = raw_event_dict.get("source_id", "unknown")
    topic = raw_event_dict.get("source_metadata", {}).get("topic_received", "unknown")

    # Bind metadata to structlog context
    log = logger.bind(
        task="dedup",
        source=source,
        source_id=source_id,
        topic=topic,
    )

    log.info("Starting deduplication stage")
    STAGE_MESSAGES.labels(stage="dedup", source=source, status="started").inc()

    try:
        # Validate input schema
        raw_event = RawEvent.model_validate(raw_event_dict)
        
        # Calculate content hash (SHA-256) of raw content
        content_hash = hashlib.sha256(raw_event.content.encode("utf-8")).hexdigest()
        
        engine = get_dedup_engine_cached()
        is_dup = False
        duplicate_of = None

        # 1. Check Exact Duplicate (Layer 1)
        if engine.check_exact_duplicate(raw_event.source, raw_event.source_id):
            is_dup = True
            duplicate_of = raw_event.source_id
            DEDUP_HITS.labels(type="exact", source=raw_event.source).inc()
            log.info("Exact duplicate detected via Redis key", duplicate_of=duplicate_of)
        
        # 2. Check Near Duplicate (Layer 2 & 3 - only if not an exact match)
        if not is_dup:
            matched_id = engine.check_near_duplicate(
                raw_event.source, raw_event.source_id, raw_event.content
            )
            if matched_id:
                is_dup = True
                duplicate_of = matched_id
                DEDUP_HITS.labels(type="near", source=raw_event.source).inc()
                log.info("Near duplicate detected via MinHash LSH", duplicate_of=duplicate_of)

        # 3. Register if unique
        if not is_dup:
            engine.register_exact_document(raw_event.source, raw_event.source_id, content_hash)
            engine.register_lsh_document(raw_event.source, raw_event.source_id, raw_event.content)
            log.debug("Registered new unique document in Redis")

        # Initialize enriched document representation
        enriched_doc = EnrichedDocument(
            source=raw_event.source,
            source_id=raw_event.source_id,
            content=raw_event.content,
            published_at=raw_event.published_at,
            collected_at=raw_event.collected_at,
            author_id=raw_event.author_id,
            media_urls=raw_event.media_urls,
            source_metadata=raw_event.source_metadata,
            is_duplicate=is_dup,
            duplicate_of=duplicate_of,
            content_hash=content_hash,
            language=raw_event.language_hint
        )

        duration = time.perf_counter() - start_time
        STAGE_LATENCY.labels(stage="dedup", source=source).observe(duration)
        STAGE_MESSAGES.labels(stage="dedup", source=source, status="success").inc()
        
        log.info("Deduplication stage completed", is_duplicate=is_dup, duration_seconds=duration)
        
        result_dict = enriched_doc.model_dump(mode="json")
        if not is_dup:
            dispatch_downstream(result_dict)
            log.info("Dispatched downstream enrichment workflow dynamically")
        else:
            log.info("Document is duplicate, suppressing downstream enrichment and publication")
        return result_dict

    except SoftTimeLimitExceeded:
        log.error("dedup.soft_time_limit_exceeded")
        # Fail-safe: mark as non-duplicate to allow downstream ingestion rather than losing data
        STAGE_MESSAGES.labels(stage="dedup", source=source, status="failure").inc()
        
        raw_event_dict["is_duplicate"] = False
        raw_event_dict["duplicate_of"] = None
        raw_event_dict["content_hash"] = ""
        dispatch_downstream(raw_event_dict)
        log.info("Dispatched downstream enrichment workflow dynamically (soft time limit fail-safe)")
        return raw_event_dict

    except Exception as e:
        STAGE_MESSAGES.labels(stage="dedup", source=source, status="failure").inc()
        log.error("Deduplication stage failed", error=str(e))
        raise


@celery_app.task(name="app.tasks.dedup.merge_parallel_results")
def merge_parallel_results(results: list[dict]) -> dict:
    """
    Callback task for Celery chord. Merges the results of parallel tasks
    (translate_task and ocr_task) back into a single document dictionary.
    """
    if not results:
        return {}

    # Start with the first dictionary as base
    merged = results[0].copy()
    merged.pop("_stage", None)

    # If the first task was duplicate, it short-circuited.
    # Check if either result is flagged as duplicate.
    is_dup = any(r.get("is_duplicate") for r in results)
    if is_dup:
        merged["is_duplicate"] = True
        # Find the duplicate_of source id
        for r in results:
            if r.get("duplicate_of"):
                merged["duplicate_of"] = r["duplicate_of"]
                break
        return merged

    translate_res = None
    ocr_res = None

    # Identify which result came from which task using the _stage metadata
    for r in results:
        stage = r.get("_stage")
        if stage == "translate":
            translate_res = r
        elif stage == "ocr":
            ocr_res = r

    # Fallback to field identification in case _stage metadata is missing
    if not translate_res or not ocr_res:
        for r in results:
            if r.get("translation_confidence") is not None:
                translate_res = r
            else:
                ocr_res = r

    # Merge translation fields (from translate_task result)
    if translate_res:
        merged["translated_content"] = translate_res.get("translated_content")
        merged["translation_confidence"] = translate_res.get("translation_confidence")
        merged["translation_failed"] = translate_res.get("translation_failed", False)
        merged["language"] = translate_res.get("language")

    # Merge OCR fields (from ocr_task result)
    if ocr_res:
        merged["ocr_text"] = ocr_res.get("ocr_text")

    return merged
