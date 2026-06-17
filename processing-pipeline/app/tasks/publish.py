# app/tasks/publish.py
import json
import time
from datetime import UTC, datetime
from functools import lru_cache

import structlog
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded
from kafka import KafkaProducer

from app.celery_app import celery_app
from app.config import settings
from app.observability.metrics import STAGE_LATENCY, STAGE_MESSAGES
from app.schemas.enriched_doc import EnrichedDocument

log = structlog.get_logger()


@lru_cache(maxsize=1)
def _get_producer() -> KafkaProducer:
    """
    Synchronous Kafka producer cached per worker process.
    Optimizes network performance by reusing connections across tasks.
    """
    return KafkaProducer(
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        acks="all",         # wait for all replicas to acknowledge
        retries=5,
        compression_type="snappy",
        api_version=(2, 5, 0),  # clamp api version to prevent metadata loop warnings with Kafka 3.x/4.x
        request_timeout_ms=10000,       # 10s request timeout
        metadata_max_age_ms=60000,      # refresh metadata every 60s
        reconnect_backoff_ms=1000,
        reconnect_backoff_max_ms=10000,
    )


@celery_app.task(
    bind=True,
    name="app.tasks.publish.publish_task",
    max_retries=5,          # higher retries — losing an enriched doc is costly
    queue="high",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def publish_task(self: Task, doc_dict: dict) -> dict:
    """
    Celery task to publish the final enriched document to Kafka.
    If publishing fails after all retries, routes the message to the DLQ topic.
    """
    # Short-circuit immediately if document is a duplicate
    if doc_dict.get("is_duplicate"):
        return doc_dict

    start_time = time.perf_counter()
    source = doc_dict.get("source", "unknown")
    source_id = doc_dict.get("source_id", "unknown")

    bound_log = log.bind(
        task="publish",
        source=source,
        source_id=source_id,
    )

    bound_log.info("Starting publication stage")
    STAGE_MESSAGES.labels(stage="publish", source=source, status="started").inc()

    try:
        # Stamp pipeline completion time
        doc_dict["processed_at"] = datetime.now(UTC).isoformat()

        # Validate against schema before publishing
        # Filter out intermediate keys that are not part of EnrichedDocument schema
        cleaned_doc = {
            k: v for k, v in doc_dict.items()
            if k in EnrichedDocument.model_fields
        }
        enriched = EnrichedDocument.model_validate(cleaned_doc)
        payload = enriched.model_dump(mode="json")

        producer = _get_producer()
        future = producer.send(
            settings.KAFKA_OUTPUT_TOPIC,
            key=enriched.source_id,
            value=payload,
        )
        producer.flush()
        record_metadata = future.get(timeout=10)

        duration = time.perf_counter() - start_time
        STAGE_LATENCY.labels(stage="publish", source=source).observe(duration)
        STAGE_MESSAGES.labels(stage="publish", source=source, status="success").inc()

        bound_log.info(
            "publish.done",
            topic=record_metadata.topic,
            partition=record_metadata.partition,
            offset=record_metadata.offset,
            is_duplicate=enriched.is_duplicate,
            language=enriched.language,
            has_embedding=enriched.embedding is not None,
            duration_seconds=duration,
        )
        return doc_dict

    except SoftTimeLimitExceeded:
        bound_log.error("publish.soft_time_limit_exceeded")
        STAGE_MESSAGES.labels(stage="publish", source=source, status="failure").inc()
        raise  # Do not swallow, this task must retry or fallback

    except Exception as exc:
        STAGE_MESSAGES.labels(stage="publish", source=source, status="failure").inc()
        
        # Check if we have exhausted all retries
        if self.request.retries >= self.max_retries:
            bound_log.critical(
                "Exhausted all retries for publication. Routing to DLQ.", 
                topic=settings.KAFKA_DLQ_TOPIC, 
                error=str(exc),
            )
            try:
                # Publish the full intermediate doc_dict to the dead-letter queue topic
                producer = _get_producer()
                producer.send(
                    settings.KAFKA_DLQ_TOPIC,
                    key=source_id,
                    value=doc_dict,
                )
                producer.flush()
                bound_log.info(
                    "Successfully published failed event to DLQ",
                    topic=settings.KAFKA_DLQ_TOPIC,
                )
            except Exception as dlq_err:
                bound_log.critical("Failed to publish to DLQ", error=str(dlq_err))
        else:
            bound_log.warning(
                "Publication failed, scheduling retry", 
                retry=self.request.retries + 1, 
                error=str(exc),
            )
            
        raise exc

