# app/tasks/embed.py
import time
from functools import lru_cache

import structlog
from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.observability.metrics import STAGE_LATENCY, STAGE_MESSAGES
from app.services.embed_service import EmbedService, get_embed_service

log = structlog.get_logger()


@lru_cache(maxsize=1)
def get_embed_service_cached() -> EmbedService:
    """Get or create EmbedService instance cached per process."""
    return get_embed_service()


@celery_app.task(
    bind=True,
    name="app.tasks.embed.embed_task",
    max_retries=3,
    queue="medium",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
)
def embed_task(self, doc_dict: dict) -> dict:
    """
    Celery task to generate text embeddings using the multilingual-e5-large model.
    """
    # Short-circuit immediately if document is a duplicate
    if doc_dict.get("is_duplicate"):
        return doc_dict

    start_time = time.perf_counter()
    source = doc_dict.get("source", "unknown")
    source_id = doc_dict.get("source_id", "unknown")

    bound_log = log.bind(
        task="embed",
        source=source,
        source_id=source_id,
    )

    # Determine the text representation to embed
    # Prioritize English translated content, fall back to raw content
    text_to_embed = doc_dict.get("translated_content") or doc_dict.get("content") or ""
    
    # Append OCR text if it was extracted to capture visual intelligence
    ocr_text = doc_dict.get("ocr_text")
    if ocr_text:
        text_to_embed = f"{text_to_embed}\n\n[Extracted Media Text]: {ocr_text}".strip()

    if not text_to_embed.strip():
        bound_log.debug("embed.skipped_empty_text")
        doc_dict["embedding"] = None
        doc_dict["cluster_id"] = None
        STAGE_MESSAGES.labels(stage="embed", source=source, status="success").inc()
        return doc_dict

    bound_log.info("Starting embedding stage")
    STAGE_MESSAGES.labels(stage="embed", source=source, status="started").inc()

    try:
        service = get_embed_service_cached()
        embedding = service.embed(text_to_embed)
        doc_dict["embedding"] = embedding
        doc_dict["cluster_id"] = None  # assigned later by nightly HDBSCAN batch job

        duration = time.perf_counter() - start_time
        STAGE_LATENCY.labels(stage="embed", source=source).observe(duration)
        STAGE_MESSAGES.labels(stage="embed", source=source, status="success").inc()
        
        bound_log.info(
            "embed.done",
            dim=len(embedding),
            duration_seconds=duration
        )
        return doc_dict

    except SoftTimeLimitExceeded:
        bound_log.error("embed.soft_time_limit_exceeded")
        STAGE_MESSAGES.labels(stage="embed", source=source, status="failure").inc()
        
        doc_dict["embedding"] = None
        doc_dict["cluster_id"] = None
        return doc_dict

    except Exception as e:
        STAGE_MESSAGES.labels(stage="embed", source=source, status="failure").inc()
        bound_log.error("Embedding stage failed", error=str(e))
        raise


@celery_app.task(
    name="app.tasks.embed.run_hdbscan_clustering",
    queue="batch",
)
def run_hdbscan_clustering() -> None:
    """
    Nightly batch job — reads accumulated embeddings from MongoDB,
    runs HDBSCAN, writes cluster_id back to each document.
    Triggered by Celery Beat on a 24-hour schedule.
    Implemented in Phase 2 when enough documents have accumulated.
    """
    log.info("hdbscan.clustering.started")
    # Phase 2 implementation
    log.info("hdbscan.clustering.finished")
