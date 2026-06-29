# app/kafka/consumer.py
import asyncio
import json
import structlog
from aiokafka import AIOKafkaConsumer, TopicPartition
from aiokafka.errors import KafkaConnectionError, KafkaError

from app.adapters.registry import get_adapter
from app.config import settings
from app.observability.metrics import STAGE_MESSAGES
from app.tasks.dedup import dedup_task

logger = structlog.get_logger()


class EventConsumer:
    """
    Async Kafka consumer that reads raw events, normalizes them,
    and triggers Celery pipelines.
    """

    def __init__(self) -> None:
        self.bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS
        self.group_id = settings.KAFKA_CONSUMER_GROUP_ID
        # FIX 2: Removed unused self.topic_pattern — pattern matching is
        # handled entirely by aiokafka via the constructor's pattern= arg.
        self.consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task | None = None  # FIX 6: store task reference
        self.running = False

    async def _init_consumer(self) -> None:
        """Helper to initialize AIOKafkaConsumer and subscribe to topics."""
        from app.adapters.registry import ADAPTER_REGISTRY

        # FIX 3: log registered topics for observability but don't build a
        # dead variable — subscription is driven by the regex pattern.
        registered_topics = list(ADAPTER_REGISTRY.keys())

        logger.info(
            "Initializing Kafka Consumer",
            bootstrap_servers=self.bootstrap_servers,
            group_id=self.group_id,
            pattern=settings.KAFKA_RAW_TOPIC_PATTERN,
            registered_topics=registered_topics,
        )

        def safe_deserialize(x: bytes) -> dict | None:
            try:
                return json.loads(x.decode("utf-8"))
            except Exception as decode_err:
                logger.warning("consumer.deserialization_failed", error=str(decode_err))
                return None

        # Pass the topics list directly as positional arguments to the constructor
        # so the subscription is registered before start() performs the initial metadata fetch.
        consumer = AIOKafkaConsumer(
            *registered_topics,
            bootstrap_servers=self.bootstrap_servers,
            group_id=self.group_id,
            enable_auto_commit=False,  # Manual commit ONLY
            auto_offset_reset=settings.KAFKA_AUTO_OFFSET_RESET,
            value_deserializer=safe_deserialize,
        )

        await consumer.start()

        # Only assign to self.consumer after successful initialization
        self.consumer = consumer
        logger.info(
            "Kafka consumer initialized and subscribed",
            subscription=consumer.subscription(),
        )

    async def start(self) -> None:
        """Start the consumer and run loop."""
        if self.running:
            logger.warning("Kafka Consumer is already running")
            return
        self.running = True
        # FIX 6: store the task so stop() can cancel and await it cleanly,
        # rather than leaving a fire-and-forget task that outlives the consumer.
        self._task = asyncio.create_task(self._consume_loop())

    async def stop(self) -> None:
        """Gracefully stop the consumer."""
        logger.info("Stopping Kafka Consumer")
        self.running = False

        # FIX 6: cancel and await the loop task so stop() doesn't return while
        # _consume_loop is still blocked on getmany().
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        if self.consumer:
            try:
                await self.consumer.stop()
            except Exception as e:
                logger.error("Error stopping Kafka consumer", error=str(e))
            finally:
                self.consumer = None

        logger.info("Kafka Consumer stopped")

    async def _consume_loop(self) -> None:
        """Core consumer poll and dispatch loop."""
        while self.running:
            if not self.consumer:
                try:
                    await self._init_consumer()
                except Exception as e:
                    logger.error("Failed to initialize Kafka consumer, retrying...", error=str(e))
                    await asyncio.sleep(5)
                    continue

            # Reference via local variable to prevent race condition/NoneType
            # errors if self.consumer is concurrently reset during async ops.
            consumer = self.consumer
            if not consumer:
                await asyncio.sleep(1)
                continue

            try:
                msg_pack = await consumer.getmany(timeout_ms=1000)
                for tp, messages in msg_pack.items():
                    for msg in messages:
                        # FIX 4: pass the local consumer snapshot into
                        # _process_message instead of letting it re-read
                        # self.consumer, which could be None by then.
                        await self._process_message(msg, tp.topic, tp.partition, consumer)
            except (TimeoutError, KafkaConnectionError, KafkaError) as ke:
                logger.error(
                    "consumer.kafka_error - connection lost, resetting consumer client",
                    error=str(ke),
                )
                try:
                    await consumer.stop()
                except Exception:
                    pass
                self.consumer = None
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                logger.info("consumer.cancelled")
                break
            except Exception as e:
                logger.error("Unexpected error in consumer loop", error=str(e))
                try:
                    await consumer.stop()
                except Exception:
                    pass
                self.consumer = None
                await asyncio.sleep(1)

    async def _process_message(
        self,
        msg,
        topic: str,
        partition: int,
        consumer: AIOKafkaConsumer,  # FIX 4: injected, not re-read from self
    ) -> None:
        payload = msg.value
        offset = msg.offset

        log = logger.bind(
            topic=topic,
            partition=partition,
            offset=offset,
            stage="consumer",
        )

        log.info("Received raw Kafka message")
        STAGE_MESSAGES.labels(stage="consumer", source=topic, status="started").inc()

        try:
            # 1. Deserialisation guard (handles malformed payloads gracefully)
            if not isinstance(payload, dict):
                log.warning("consumer.invalid_payload_type", type=type(payload).__name__)
                STAGE_MESSAGES.labels(stage="consumer", source=topic, status="failure").inc()
                tp = TopicPartition(topic, partition)
                await consumer.commit({tp: offset + 1})
                return

            # 2. Source field fallback if missing
            if not payload.get("source"):
                payload["source"] = topic.replace("raw-events.", "")

            # 3. Retrieve the adapter from registry
            adapter = get_adapter(topic)
            if not adapter:
                log.error("No normalizer adapter registered for topic, skipping message")
                STAGE_MESSAGES.labels(stage="consumer", source=topic, status="failure").inc()
                tp = TopicPartition(topic, partition)
                await consumer.commit({tp: offset + 1})
                return

            # 4. Normalize raw payload to canonical RawEvent
            try:
                raw_event = adapter.normalize(payload, topic)
            except Exception as parse_err:
                log.error("consumer.normalization_failed", error=str(parse_err))
                STAGE_MESSAGES.labels(stage="consumer", source=topic, status="failure").inc()
                tp = TopicPartition(topic, partition)
                await consumer.commit({tp: offset + 1})
                return

            log = log.bind(source_id=raw_event.source_id)
            log.info(
                "Successfully normalized event",
                source=raw_event.source,
                source_id=raw_event.source_id,
            )

            # Convert RawEvent to dict for Celery JSON serialization
            event_data = raw_event.model_dump(mode="json")
            if "source_metadata" not in event_data or event_data["source_metadata"] is None:
                event_data["source_metadata"] = {}
            event_data["source_metadata"]["topic_received"] = topic

            # 5. Dispatch deduplication task (Stage 1)
            # The dedup_task will dynamically dispatch downstream enrichment
            # tasks only if the event is unique.
            dedup_task.delay(event_data)
            log.info("Dispatched Celery deduplication task (Stage 1)")

            # 6. Manual commit offset ONLY after successful dispatch
            # FIX 5: was incorrectly labelled as step 7 in the original.
            tp = TopicPartition(topic, partition)
            await consumer.commit({tp: offset + 1})
            log.debug("Committed Kafka offset manually")

            STAGE_MESSAGES.labels(stage="consumer", source=topic, status="success").inc()

        except Exception as e:
            log.error("Failed to process message", error=str(e))
            STAGE_MESSAGES.labels(stage="consumer", source=topic, status="failure").inc()
            # Do NOT commit offset on processing failure so it can be retried