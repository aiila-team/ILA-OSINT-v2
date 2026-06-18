# app/tasks/translate.py
import time
from functools import lru_cache

import structlog
from celery.exceptions import SoftTimeLimitExceeded
from lingua import Language, LanguageDetector, LanguageDetectorBuilder

from app.celery_app import celery_app
from app.config import settings
from app.observability.metrics import STAGE_LATENCY, STAGE_MESSAGES
from app.strategies.translation import get_translation_strategy

log = structlog.get_logger()


@lru_cache(maxsize=1)
def get_language_detector() -> LanguageDetector:
    """
    Build and cache the Lingua language detector once per process.
    Enumerates specific target languages to optimize accuracy and memory footprint
    (avoids loading all 75+ languages).
    """
    languages = [
        Language.ENGLISH,
        Language.HINDI,
        Language.BENGALI,
        Language.GUJARATI,
        Language.MARATHI,
        Language.PUNJABI,
        Language.TAMIL,
        Language.TELUGU,
        Language.URDU,
    ]
    return LanguageDetectorBuilder.from_languages(*languages).build()


@celery_app.task(
    bind=True,
    name="app.tasks.translate.translate_task",
    max_retries=3,
    queue="medium",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
)
def translate_task(self, doc_dict: dict) -> dict:
    """
    Celery task to detect language and translate Indic content to English.
    Implements circuit-breaker fallback on Triton failure.
    """
    # Short-circuit immediately if document is a duplicate
    if doc_dict.get("is_duplicate"):
        return doc_dict

    start_time = time.perf_counter()
    source = doc_dict.get("source", "unknown")
    source_id = doc_dict.get("source_id", "unknown")
    content = doc_dict.get("content", "")

    bound_log = log.bind(
        task="translate",
        source=source,
        source_id=source_id,
    )

    bound_log.info("Starting translation stage")
    STAGE_MESSAGES.labels(stage="translate", source=source, status="started").inc()

    if not content.strip():
        bound_log.debug("translate.skipped_empty_content")
        STAGE_MESSAGES.labels(stage="translate", source=source, status="success").inc()
        doc_dict["_stage"] = "translate"
        return doc_dict

    try:
        # 1. Language detection
        lang_code = doc_dict.get("language")
        if not lang_code:
            try:
                detector = get_language_detector()
                detected_lang = detector.detect_language_of(content)
                if detected_lang:
                    # name property of the ISO enum returns string repr
                    lang_code = detected_lang.iso_code_639_1.name.lower()
                    bound_log.info("Language detected", detected_lang=lang_code)
                else:
                    lang_code = "en"
            except Exception as e:
                bound_log.warn("Language detection failed, falling back to English", error=str(e))
                lang_code = "en"

        doc_dict["language"] = lang_code

        # 2. Get translation strategy and translate (truncate text based on max limit)
        strategy = get_translation_strategy(lang_code)
        if len(content) > settings.TRANSLATION_MAX_CHARS:
            truncated_content = content[: settings.TRANSLATION_MAX_CHARS]
        else:
            truncated_content = content
        translated_text, confidence, failed = strategy.translate(truncated_content)

        # Flag as failed if confidence score is below threshold
        if confidence < settings.TRANSLATION_MIN_CONFIDENCE:
            failed = True

        doc_dict["translated_content"] = translated_text
        doc_dict["translation_confidence"] = confidence
        doc_dict["translation_failed"] = failed
        doc_dict["_stage"] = "translate"

        duration = time.perf_counter() - start_time
        STAGE_LATENCY.labels(stage="translate", source=source).observe(duration)
        STAGE_MESSAGES.labels(stage="translate", source=source, status="success").inc()
        
        bound_log.info(
            "translate.done",
            lang=lang_code,
            confidence=round(confidence, 3),
            failed=failed,
            duration_seconds=duration
        )
        return doc_dict

    except SoftTimeLimitExceeded:
        bound_log.error("translate.soft_time_limit_exceeded")
        STAGE_MESSAGES.labels(stage="translate", source=source, status="failure").inc()
        
        doc_dict["translated_content"] = content
        doc_dict["translation_failed"] = True
        doc_dict["translation_confidence"] = 0.0
        doc_dict["_stage"] = "translate"
        return doc_dict

    except Exception as e:
        STAGE_MESSAGES.labels(stage="translate", source=source, status="failure").inc()
        bound_log.error("Translation stage failed", error=str(e))
        raise
