# app/tasks/ocr.py
import time
from functools import lru_cache

import structlog
from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.observability.metrics import STAGE_LATENCY, STAGE_MESSAGES
from app.services.ocr_service import OCRService, get_ocr_service

log = structlog.get_logger()


@lru_cache(maxsize=1)
def get_ocr_service_cached() -> OCRService:
    """Get or create OCRService instance cached per process."""
    return get_ocr_service()


@celery_app.task(
    bind=True,
    name="app.tasks.ocr.ocr_task",
    max_retries=3,
    queue="low",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def ocr_task(self, doc_dict: dict) -> dict:
    """
    Celery task to run OCR/ASR on any media URLs associated with the event.
    """
    # Short-circuit immediately if document is a duplicate
    if doc_dict.get("is_duplicate"):
        return doc_dict

    start_time = time.perf_counter()
    source = doc_dict.get("source", "unknown")
    source_id = doc_dict.get("source_id", "unknown")
    media_urls = doc_dict.get("media_urls", [])

    bound_log = log.bind(
        task="ocr",
        source=source,
        source_id=source_id,
    )

    if not media_urls:
        bound_log.debug("ocr.skipped_no_media")
        doc_dict["ocr_text"] = None
        doc_dict["_stage"] = "ocr"
        return doc_dict

    bound_log.info("Starting OCR/ASR stage", num_urls=len(media_urls))
    STAGE_MESSAGES.labels(stage="ocr", source=source, status="started").inc()

    try:
        service = get_ocr_service_cached()
        
        # If language hint is missing, perform a fast in-process language detection 
        # on the main text content to avoid losing the language context when running in parallel.
        language_hint = doc_dict.get("language")
        content = doc_dict.get("content", "")
        if not language_hint and content.strip():
            try:
                from app.tasks.translate import get_language_detector
                detector = get_language_detector()
                detected_lang = detector.detect_language_of(content)
                if detected_lang:
                    language_hint = detected_lang.iso_code_639_1.name.lower()
                    bound_log.info("Resolved language hint for OCR", resolved_lang=language_hint)
            except Exception as e:
                bound_log.debug("Fast language detection for OCR hint failed", error=str(e))

        ocr_text = service.process_media(media_urls, language_hint=language_hint)
        doc_dict["ocr_text"] = ocr_text if ocr_text else None
        doc_dict["_stage"] = "ocr"

        duration = time.perf_counter() - start_time
        STAGE_LATENCY.labels(stage="ocr", source=source).observe(duration)
        STAGE_MESSAGES.labels(stage="ocr", source=source, status="success").inc()
        
        bound_log.info(
            "ocr.done",
            media_count=len(media_urls),
            extracted=bool(ocr_text),
            duration_seconds=duration
        )
        return doc_dict

    except SoftTimeLimitExceeded:
        bound_log.error("ocr.soft_time_limit_exceeded")
        STAGE_MESSAGES.labels(stage="ocr", source=source, status="failure").inc()
        
        doc_dict["ocr_text"] = None
        doc_dict["_stage"] = "ocr"
        return doc_dict

    except Exception as e:
        STAGE_MESSAGES.labels(stage="ocr", source=source, status="failure").inc()
        bound_log.error("OCR/ASR stage failed", error=str(e))
        raise
