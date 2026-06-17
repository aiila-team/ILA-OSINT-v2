import json
import asyncio
import structlog
from aiokafka import AIOKafkaConsumer
from aiokafka.errors import KafkaConnectionError, KafkaError

from app.config import settings
from app.schemas.enriched_doc import EnrichedDocument

log = structlog.get_logger()


def _validate_payload(payload: dict) -> bool:
    """
    Lightweight guard before schema validation.
    Avoids constructing EnrichedDocument for obviously malformed messages.
    """
    if not isinstance(payload, dict):
        return False
    if not payload.get("source_id"):
        return False
    if not payload.get("source"):
        return False
    if payload.get("content") is None and payload.get("translated_content") is None:
        return False
    return True


def _derive_source(payload: dict, topic: str) -> dict:
    """
    Derives source field from topic name if missing.
    e.g. enriched-data topic carries source in payload already
    but guard against missing values.
    """
    if not payload.get("source"):
        payload["source"] = topic.replace("-", "_").replace(".raw", "").strip()
    return payload


class KafkaConsumerService:
    def __init__(self):
        self.consumer = None
        self.running = False

    async def start(self) -> None:
        log.info(
            "ner_consumer.starting",
            topic=settings.KAFKA_INPUT_TOPIC,
            group=settings.KAFKA_CONSUMER_GROUP,
        )

        self.consumer = AIOKafkaConsumer(
            settings.KAFKA_INPUT_TOPIC,
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id=settings.KAFKA_CONSUMER_GROUP,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset=settings.KAFKA_AUTO_OFFSET_RESET,
            enable_auto_commit=False,
            max_poll_records=settings.KAFKA_MAX_POLL_RECORDS,
            # NER pipeline processes slower than processing pipeline
            # give more time before broker considers consumer dead
            session_timeout_ms=30000,
            heartbeat_interval_ms=10000,
            max_poll_interval_ms=300000,    # 5 min — chord can take time under load
        )

        await self.consumer.start()
        self.running = True
        log.info("ner_consumer.started")

        try:
            async for msg in self.consumer:
                if not self.running:
                    break
                await self._process_message(msg)

        except KafkaConnectionError as exc:
            log.error("ner_consumer.kafka_connection_error", error=str(exc))
            raise

        except KafkaError as exc:
            log.error("ner_consumer.kafka_error", error=str(exc))
            raise

        except asyncio.CancelledError:
            log.info("ner_consumer.cancelled")

        finally:
            await self.stop()

    async def _process_message(self, msg) -> None:
        bound_log = log.bind(
            topic=msg.topic,
            partition=msg.partition,
            offset=msg.offset,
        )

        # ── deserialisation guard ─────────────────────────────────────────
        if not isinstance(msg.value, dict):
            bound_log.warning("ner_consumer.invalid_payload_type")
            if self.consumer:
                await self.consumer.commit()
            return

        payload = msg.value

        # ── lightweight field guard ───────────────────────────────────────
        if not _validate_payload(payload):
            bound_log.warning(
                "ner_consumer.missing_required_fields",
                has_source_id=bool(payload.get("source_id")),
                has_source=bool(payload.get("source")),
                has_content=bool(payload.get("content")),
            )
            if self.consumer:
                await self.consumer.commit()
            return

        # ── derive source if missing ──────────────────────────────────────
        payload = _derive_source(payload, msg.topic)

        # ── schema validation ─────────────────────────────────────────────
        try:
            EnrichedDocument.model_validate(payload)
        except Exception as exc:
            bound_log.error(
                "ner_consumer.schema_validation_failed",
                source_id=payload.get("source_id"),
                error=str(exc),
            )
            # Commit offset for malformed messages to prevent poison pill pipeline blockages
            if self.consumer:
                await self.consumer.commit()
            return

        # ── skip duplicates at consumer level ─────────────────────────────
        # Duplicate docs still need a minimal EntityEvent published
        # so dispatch handles them via _dispatch_duplicate_shortcut
        # We do NOT skip them here — we dispatch and let the task decide

        # ── dispatch to Celery ────────────────────────────────────────────
        try:
            from app.tasks.dispatch import dispatch_ner_chord
            dispatch_ner_chord.apply_async(
                args=[payload],
                queue="ner-ml",
            )
            bound_log.info(
                "ner_consumer.dispatched",
                source=payload["source"],
                source_id=payload["source_id"],
                is_duplicate=payload.get("is_duplicate", False),
            )
        except Exception as exc:
            bound_log.error(
                "ner_consumer.dispatch_failed",
                source_id=payload.get("source_id"),
                error=str(exc),
            )
            # do not commit — Kafka will redeliver on restart
            return

        # ── commit only after successful dispatch ─────────────────────────
        if self.consumer:
            await self.consumer.commit()

    async def stop(self) -> None:
        if self.consumer and self.running:
            self.running = False
            log.info("ner_consumer.stopping")
            await self.consumer.stop()
            log.info("ner_consumer.stopped")


async def consume_forever() -> None:
    """Helper function to run the consumer service loop indefinitely."""
    service = KafkaConsumerService()
    await service.start()

