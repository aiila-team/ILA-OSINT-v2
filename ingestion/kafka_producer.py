from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from confluent_kafka import KafkaError, Producer

from ingestion.metrics import (
    dlq_count,
    events_published,
    events_normalized,
    events_received,
    schema_failures,
    validation_failures,
)
from kafka.config import BOOTSTRAP_SERVERS
from kafka.producer import publish_raw_event as _publish_raw_event
from kafka.topics import RAW_EVENTS

logger = logging.getLogger(__name__)


class KafkaProducerError(Exception):
    pass


class DeadLetterError(Exception):
    def __init__(self, source: str, error: str, raw_payload: Dict[str, Any]):
        self.source = source
        self.error = error
        self.raw_payload = raw_payload
        super().__init__(error)


class RawEventPublisher:
    def __init__(self, bootstrap_servers: str = BOOTSTRAP_SERVERS):
        self.producer = Producer(
            {
                "bootstrap.servers": bootstrap_servers,
                "client.id": "ila-ingestion-producer",
                "acks": "all",
                "compression.type": "snappy",
                "retries": 5,
                "retry.backoff.ms": 100,
            }
        )

    def _delivery_callback(self, err: Optional[KafkaError], msg: Any) -> None:
        if err:
            logger.error("Kafka delivery failed", extra={"topic": msg.topic() if msg else None, "error": str(err)})
        else:
            logger.debug(
                "Kafka delivery succeeded",
                extra={"topic": msg.topic(), "partition": msg.partition(), "offset": msg.offset()},
            )

    def publish(self, event: Dict[str, Any]) -> str:
        try:
            self.producer.produce(
                topic=RAW_EVENTS,
                value=json.dumps(event).encode("utf-8"),
                key=event["event_id"].encode("utf-8"),
                on_delivery=self._delivery_callback,
            )
            self.producer.flush(timeout=10.0)
            events_published.inc()
            return event["event_id"]
        except KafkaError as exc:
            schema_failures.inc()
            logger.error("Failed to publish RawEvent to Kafka", extra={"error": str(exc)})
            raise KafkaProducerError(str(exc)) from exc
        except Exception as exc:
            schema_failures.inc()
            logger.exception("Unexpected failure publishing RawEvent", exc_info=exc)
            raise KafkaProducerError(str(exc)) from exc


class DeadLetterPublisher:
    def __init__(self, bootstrap_servers: str = BOOTSTRAP_SERVERS):
        self.producer = Producer(
            {
                "bootstrap.servers": bootstrap_servers,
                "client.id": "ila-ingestion-dlq-producer",
                "acks": "all",
                "compression.type": "snappy",
            }
        )
        self.topic = "dead-letter-events"

    def publish(self, source: str, reason: str, raw_payload: Dict[str, Any]) -> None:
        event = {
            "source": source,
            "error": reason,
            "raw_payload": raw_payload,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        self.producer.produce(
            topic=self.topic,
            value=json.dumps(event).encode("utf-8"),
            key=source.encode("utf-8"),
        )
        self.producer.flush(timeout=5.0)
        dlq_count.inc()


_shared_publisher: Optional[RawEventPublisher] = None
_shared_dlq_publisher: Optional[DeadLetterPublisher] = None


def get_publisher() -> RawEventPublisher:
    global _shared_publisher
    if _shared_publisher is None:
        _shared_publisher = RawEventPublisher()
    return _shared_publisher


def get_dlq_publisher() -> DeadLetterPublisher:
    global _shared_dlq_publisher
    if _shared_dlq_publisher is None:
        _shared_dlq_publisher = DeadLetterPublisher()
    return _shared_dlq_publisher


def publish_event(event: Dict[str, Any]) -> str:
    events_received.inc()
    try:
        return get_publisher().publish(event)
    except Exception as exc:
        validation_failures.inc()
        raise


def publish_raw_event(
    source_type: str,
    content: str,
    published_at: str,
    source_url: Optional[str] = None,
    event_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    provenance_id: Optional[str] = None,
) -> str:
    return _publish_raw_event(
        source_type=source_type,
        content=content,
        published_at=published_at,
        source_url=source_url,
        event_id=event_id,
        payload=payload,
        provenance_id=provenance_id,
    )


def publish_dlq(source: str, reason: str, raw_payload: Dict[str, Any]) -> None:
    get_dlq_publisher().publish(source, reason, raw_payload)
