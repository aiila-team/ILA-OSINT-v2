"""
Shared Kafka producer module for all data sources.

This module provides centralized Kafka connection management, serialization,
retries, delivery callbacks, and topic routing. All data sources use
publish_raw_event() to send normalized events to the raw-events topic.
"""

import json
import logging
import uuid
from typing import Optional

from confluent_kafka import Producer, KafkaError

from ingestion.factory import RawEventFactory
from kafka.config import BOOTSTRAP_SERVERS
from kafka.topics import RAW_EVENTS

logger = logging.getLogger(__name__)


class KafkaProducerError(Exception):
    """Exception raised for Kafka producer errors."""
    pass


def _delivery_callback(err: Optional[KafkaError], msg) -> None:
    """
    Callback for Kafka producer delivery reports.
    
    Args:
        err: Error object if delivery failed, None otherwise
        msg: Message object with topic and partition info
    """
    if err:
        logger.error(
            "Kafka delivery failed",
            extra={
                "topic": msg.topic() if msg else None,
                "error": str(err),
            }
        )
    else:
        logger.debug(
            "Kafka delivery succeeded",
            extra={
                "topic": msg.topic(),
                "partition": msg.partition(),
                "offset": msg.offset(),
            }
        )


def _subtopic_for_source(source_type: str) -> str:
    """Return a per-source subtopic name under the RAW_EVENTS namespace.

    Uses a simple sanitization so source names like 'cert-in' become
    'raw-events.cert-in'.
    """
    if not source_type:
        return RAW_EVENTS
    sanitized = str(source_type).strip().lower().replace(" ", "_")
    return f"{RAW_EVENTS}.{sanitized}"


class SharedKafkaProducer:
    """
    Centralized Kafka producer for all data sources.
    
    Manages connection, retries, serialization, and topic routing for all
    normalized events across the system.
    """
    
    _instance: Optional["SharedKafkaProducer"] = None
    
    def __init__(
        self,
        bootstrap_servers: str = BOOTSTRAP_SERVERS,
        retries: int = 3,
        retry_backoff_ms: int = 100,
    ):
        """
        Initialize the shared Kafka producer.
        
        Args:
            bootstrap_servers: Comma-separated list of Kafka broker addresses
            retries: Number of retries for failed sends
            retry_backoff_ms: Backoff time between retries in milliseconds
        """
        self.bootstrap_servers = bootstrap_servers
        self.retries = retries
        self.retry_backoff_ms = retry_backoff_ms
        
        config = {
            "bootstrap.servers": bootstrap_servers,
            "client.id": "ila-osint-shared-producer",
            "acks": "all",  # Wait for all replicas to acknowledge
            "retries": retries,
            "retry.backoff.ms": retry_backoff_ms,
            "compression.type": "snappy",
            "linger.ms": 10,  # Batch messages for 10ms
            "batch.size": 16384,  # 16KB batch
        }
        
        try:
            self.producer = Producer(config)
            logger.info("Kafka producer initialized", extra={"brokers": bootstrap_servers})
        except Exception as e:
            logger.error("Failed to initialize Kafka producer", extra={"error": str(e)})
            raise KafkaProducerError(f"Failed to initialize producer: {e}") from e
    
    @classmethod
    def get_instance(cls) -> "SharedKafkaProducer":
        """
        Get or create the singleton instance of the shared producer.
        
        Returns:
            SharedKafkaProducer: The singleton instance
        """
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def publish_raw_event(
    self,
    source_type: str,
    content: str,
    published_at: str,
    source_url: Optional[str] = None,
    payload: Optional[dict] = None,
    event_id: Optional[str] = None,
    provenance_id: Optional[str] = None,
 ) -> str:
        """
        Publish a normalized RawEvent to Kafka.
        
        This is the single entry point for all data sources. Each source
        collector normalizes its data and calls this function.
        
        Args:
            source_type: Type of source (e.g., 'bhuvan', 'nasa', 'cisa', 'telegram')
            content: Main content/title of the event
            published_at: ISO format timestamp when the event was published
            source_url: Optional URL where the event originated
            event_id: Optional event ID (auto-generated if not provided)
            provenance_id: Optional provenance ID (auto-generated if not provided)
        
        Returns:
            str: The event_id of the published event
        
        Raises:
            KafkaProducerError: If publication fails after retries
        """
        if not event_id:
            event_id = str(uuid.uuid4())
        
        if not provenance_id:
            provenance_id = str(uuid.uuid4())
        
        raw_payload = payload or {}
        raw_payload = dict(raw_payload)
        raw_payload.update(
            {
                "content": content,
                "published_at": published_at,
                "source_url": source_url,
                "event_id": event_id,
                "provenance_id": provenance_id,
            }
        )

        raw_event = RawEventFactory.create(
            source=raw_payload.get("source") or source_type,
            source_type=source_type,
            extracted_payload=raw_payload,
        )

        event_dict = raw_event.model_dump(mode="json")
        event_dict["payload"] = json.dumps(raw_event.payload, default=str)
        event_dict["collection_metadata"] = json.dumps(raw_event.collection_metadata, default=str)

        for entity in event_dict.get("entities", []):
            if entity is not None and not isinstance(entity.get("metadata"), str):
                entity["metadata"] = json.dumps(entity.get("metadata"), default=str)

        try:
            message_bytes = json.dumps(event_dict).encode("utf-8")
        except (TypeError, ValueError) as e:
            logger.exception(
                "Failed to serialize RawEvent to JSON",
                extra={"event_id": event_id, "source_type": source_type},
            )
            raise KafkaProducerError(f"Serialization failed: {e}") from e
        
        # Send to Kafka with key based on source_type for partitioning
        try:
            # Primary publish to the main raw-events topic
            self.producer.produce(
                topic=RAW_EVENTS,
                value=message_bytes,
                key=event_id.encode("utf-8"),
                on_delivery=_delivery_callback,
            )
            logger.info(
                "event_published",
                extra={"event_id": event_id, "source_type": source_type},
            )

            # Also publish to a per-source subtopic for easier classification
            subtopic = _subtopic_for_source(source_type)
            if subtopic != RAW_EVENTS:
                try:
                    self.producer.produce(
                        topic=subtopic,
                        value=message_bytes,
                        key=event_id.encode("utf-8"),
                        on_delivery=_delivery_callback,
                    )
                except KafkaError as se:
                    logger.warning(
                        "Failed to publish to subtopic",
                        extra={"subtopic": subtopic, "error": str(se)}
                    )

            # Trigger delivery callbacks for pending messages
            self.producer.flush(timeout=5.0)

            logger.debug(
                "RawEvent published to Kafka",
                extra={
                    "event_id": event_id,
                    "source_type": source_type,
                    "topic": RAW_EVENTS,
                    "subtopic": subtopic,
                }
            )

            return event_id

        except KafkaError as e:
            logger.exception(
                "publish_failed",
                extra={
                    "event_id": event_id,
                    "source_type": source_type,
                    "reason": str(e),
                },
            )
            raise KafkaProducerError(f"Failed to publish event: {e}") from e
    
    def close(self) -> None:
        """Close the Kafka producer connection."""
        if self.producer:
            self.producer.flush(timeout=10.0)
            logger.info("Kafka producer closed")


# Singleton instance for use across the application
_shared_producer = SharedKafkaProducer.get_instance()


def publish_raw_event(
    source_type: str,
    content: str,
    published_at: str,
    source_url: Optional[str] = None,
    event_id: Optional[str] = None,
    payload: Optional[dict] = None,
    provenance_id: Optional[str] = None,
) -> str:
    """
    Publish a normalized RawEvent to Kafka using the shared producer.
    
    This is the main entry point for all data sources. Normalizes data
    to RawEvent schema and sends to the raw-events topic with proper
    serialization, retries, and delivery callbacks.
    
    Args:
        source_type: Type of source (e.g., 'bhuvan', 'nasa', 'cisa', 'telegram')
        content: Main content/title of the event
        published_at: ISO format timestamp when the event was published
        source_url: Optional URL where the event originated
        event_id: Optional event ID (auto-generated if not provided)
        provenance_id: Optional provenance ID (auto-generated if not provided)
    
    Returns:
        str: The event_id of the published event
    
    Raises:
        KafkaProducerError: If publication fails after retries
    """
    return _shared_producer.publish_raw_event(
        source_type=source_type,
        content=content,
        published_at=published_at,
        source_url=source_url,
        event_id=event_id,
        provenance_id=provenance_id,
        payload=payload,
    )