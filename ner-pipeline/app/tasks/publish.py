from datetime import datetime, timezone
from functools import lru_cache
import json
import structlog
from celery.exceptions import SoftTimeLimitExceeded
from kafka import KafkaProducer
from prometheus_client import Counter

from app.celery_app import celery_app
from app.config import settings
from app.schemas.entity_event import EntityEvent

log = structlog.get_logger()

# ── Prometheus Counters ───────────────────────────────────────────────────────
# Counters are module-level singletons in prometheus_client.
# Defining them at the module level prevents duplicate timeseries registration errors.
_ENTITIES_PUBLISHED = Counter(
    "ner_entities_published_total",
    "Total entities published to entity-events",
    ["entity_type", "source"],
)
_EVENTS_PUBLISHED = Counter(
    "ner_events_published_total",
    "Total EntityEvent messages published",
    ["source", "partial"],
)


@lru_cache(maxsize=1)
def _get_producer() -> KafkaProducer:
    """
    Sync Kafka producer — one instance per worker process.
    acks=all ensures all replicas acknowledge before returning.
    snappy compression reduces network overhead for entity-heavy payloads.
    """
    return KafkaProducer(
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        acks="all",
        retries=5,
        retry_backoff_ms=300,
        compression_type="snappy",
        max_request_size=5 * 1024 * 1024,    # 5MB — entity-heavy docs can be large
    )


@celery_app.task(
    bind=True,
    name="app.tasks.publish.publish_entity_event",
    max_retries=5,
    queue="ner-ml",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def publish_entity_event(self, event_dict: dict) -> dict:
    """
    Final stage — validates EntityEvent schema and publishes to entity-events.
    Higher max_retries than other tasks — losing an entity event means
    the graph-engine and MongoDB writer both miss this document permanently.
    Re-raises SoftTimeLimitExceeded to force retry.
    """
    source_id = event_dict.get("source_id", "unknown")
    source    = event_dict.get("source", "unknown")

    bound_log = log.bind(
        task="publish_entity_event",
        source=source,
        source_id=source_id,
    )

    try:
        # ── stamp publish time ────────────────────────────────────────────────
        event_dict["processed_at"] = datetime.now(timezone.utc).isoformat()

        # ── validate schema before publishing ─────────────────────────────────
        # Catches any mutation errors from merge or error handler
        try:
            event = EntityEvent.model_validate(event_dict)
        except Exception as exc:
            bound_log.error(
                "publish.schema_validation_failed",
                error=str(exc),
            )
            raise

        payload = event.model_dump(mode="json")

        # ── publish to entity-events ──────────────────────────────────────────
        producer = _get_producer()
        future   = producer.send(
            settings.KAFKA_OUTPUT_TOPIC,
            key=event.source_id,
            value=payload,
        )
        producer.flush()
        metadata = future.get(timeout=10)

        bound_log.info(
            "publish.done",
            topic=metadata.topic,
            partition=metadata.partition,
            offset=metadata.offset,
            entity_count=event.entity_count,
            has_ml_entities=event.has_ml_entities,
            extraction_partial=event.extraction_partial,
            type_counts=event.entity_type_counts,
        )

        # ── emit Prometheus metrics ───────────────────────────────────────────
        _emit_metrics(event)

        return payload

    except SoftTimeLimitExceeded:
        bound_log.error("publish.soft_time_limit_exceeded")
        raise   # must retry — downstream services depend on this message

    except Exception as exc:
        bound_log.error("publish.failed", error=str(exc))
        raise


@celery_app.task(
    bind=True,
    name="app.tasks.publish.publish_failed_event",
    max_retries=3,
    queue="ner-dlq",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
)
def publish_failed_event(self, failed_dict: dict) -> dict:
    """
    Publishes failed event metadata to processing.failed Kafka topic (DLQ).
    """
    source_id = failed_dict.get("source_id", "unknown")
    source    = failed_dict.get("source", "unknown")

    bound_log = log.bind(
        task="publish_failed_event",
        source=source,
        source_id=source_id,
    )

    try:
        # ── stamp failure time ────────────────────────────────────────────────
        failed_dict["failed_at"] = datetime.now(timezone.utc).isoformat()

        # ── validate schema before publishing ─────────────────────────────────
        from app.tasks.merge import FailedNEREvent
        try:
            event = FailedNEREvent.model_validate(failed_dict)
        except Exception as exc:
            bound_log.error(
                "publish_failed.schema_validation_failed",
                error=str(exc),
            )
            raise

        payload = event.model_dump(mode="json")

        # ── publish to DLQ ────────────────────────────────────────────────────
        producer = _get_producer()
        future   = producer.send(
            settings.KAFKA_FAILED_TOPIC,
            key=event.source_id,
            value=payload,
        )
        producer.flush()
        metadata = future.get(timeout=10)

        bound_log.info(
            "publish_failed.done",
            topic=metadata.topic,
            partition=metadata.partition,
            offset=metadata.offset,
        )

        return payload

    except SoftTimeLimitExceeded:
        bound_log.error("publish_failed.soft_time_limit_exceeded")
        raise

    except Exception as exc:
        bound_log.error("publish_failed.failed", error=str(exc))
        raise


def _emit_metrics(event: EntityEvent) -> None:
    """
    Increments Prometheus counters per entity type.
    Called after successful publish — metrics reflect
    only successfully published events.
    """
    try:
        for entity_type, count in event.entity_type_counts.items():
            _ENTITIES_PUBLISHED.labels(
                entity_type=entity_type,
                source=event.source,
            ).inc(count)

        _EVENTS_PUBLISHED.labels(
            source=event.source,
            partial=str(event.extraction_partial),
        ).inc()

    except Exception as exc:
        # never fail publish due to metrics error
        log.warning("publish.metrics_failed", error=str(exc))
