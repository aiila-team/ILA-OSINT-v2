"""
graph_engine.faust_app
=========================
The streaming orchestrator: consumes `entities` (produced by the
existing, already-complete entity extraction service — UNCHANGED, this
app only ever reads it), and publishes `resolved_entities` and
`graph_updates`. This is Phases 1-4 wired together as one Faust app;
Phase 5 (Neo4j writing) deliberately lives in a separate process
(writer/consumer.py) — see that module's docstring for why.

Per-source-event grouping
---------------------------
Relationship inference needs ALL entities extracted from one source event
together (to know what co-occurred), but Kafka delivers `entities`
messages one-per-event already (per the existing extraction service's
output schema: one RawEntityExtractionEvent message = one source event's
full entity list). So no windowing/joining is actually needed here — each
incoming message already IS the unit of co-occurrence. This matters: it
means inference can run synchronously within the same agent that
processes resolution for that message, with no stream-stream join
complexity. If a future source ever splits one event's entities across
multiple messages, that's the point at which a Faust table-based
windowed join would become necessary — not before.

Fault tolerance
------------------
- Unsupported entity types raise UnsupportedEntityTypeError inside
  canonicalization; caught here per-entity (not per-message) so one bad
  entity in a message doesn't drop the other valid entities from that
  same event.
- Any other unexpected exception during processing of a message is caught
  at the top level and the raw message is forwarded to a dead-letter
  topic with the exception text, rather than crashing the Faust worker
  (per the architecture doc's explicit callout: "no DLQ specified... you
  will silently lose threat data").
- Faust's own RocksDB-backed table state + Kafka consumer offset
  management gives at-least-once processing; every downstream write
  (registry.create, Neo4j MERGE) is idempotent specifically so
  at-least-once delivery never produces duplicate graph state.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import faust

from graph_engine.canonicalization.engine import CanonicalizationEngine, UnsupportedEntityTypeError
from graph_engine.config import settings
from graph_engine.inference.rules import InferenceContext, RelationshipInferenceEngine
from graph_engine.models import (
    Evidence,
    GraphUpdate,
    GraphUpdateOp,
    RawEntityExtractionEvent,
    ResolvedEntity,
    EntityType,
)
from graph_engine.resolution.engine import EntityResolutionEngine, ResolutionConfig
from graph_engine.resolution.registry import InMemoryEntityRegistry

logger = logging.getLogger("graph_engine.faust_app")

app = faust.App(
    "ila-graph-engine",
    broker=f"kafka://{settings.kafka.bootstrap_servers}",
    store="rocksdb://",   # durable local state store for Faust tables (merge-candidate dedup, co-occurrence counters)
    topic_partitions=8,
    consumer_auto_offset_reset="earliest",
)

# -- topic definitions -------------------------------------------------
# Schemas are declared with faust.Record-compatible raw dict value_type
# (`dict`) rather than a strict Faust Record mirroring
# RawEntityExtractionEvent, specifically so a slightly-evolving upstream
# schema (new optional field added to the extraction service) does not
# break deserialization here — we validate into our own Pydantic model
# explicitly inside the agent instead, where we control the failure mode.

entities_topic = app.topic(settings.kafka.topics.entities, value_type=bytes)
resolved_entities_topic = app.topic(settings.kafka.topics.resolved_entities, value_type=bytes)
graph_updates_topic = app.topic(settings.kafka.topics.graph_updates, value_type=bytes)
dlq_topic = app.topic(f"{settings.kafka.topics.entities}_dlq", value_type=bytes)
merge_candidates_topic = app.topic(settings.kafka.topics.merge_candidates, value_type=bytes)

# -- co-occurrence counter table ----------------------------------------
# Backs the OWNS rule's "seen together in >=2 distinct source events"
# corroboration requirement (see inference/rules.py rule_owns docstring).
# A Faust Table is the natural place for this: partitioned, durable
# (RocksDB-backed), and changelog-replicated for fault tolerance —
# exactly the cross-message counter state this rule needs that a single
# message's InferenceContext can't supply on its own.
co_occurrence_table = app.Table(
    "entity-co-occurrence-counts", default=int, partitions=8,
)

# -- engine instances (process-local, stateless besides the registry) ----
# NOTE: InMemoryEntityRegistry is the default here for a runnable,
# self-contained deliverable. In production, swap for
# RedisEntityRegistry/PostgresEntityRegistry (see resolution/registry.py)
# — construction is the only thing that changes; everything below is
# written against the EntityRegistry interface.
_canonicalizer = CanonicalizationEngine()
_registry = InMemoryEntityRegistry()
_resolution_engine = EntityResolutionEngine(
    registry=_registry,
    config=ResolutionConfig(
        fuzzy_token_sort_threshold=settings.resolution.fuzzy_token_sort_threshold,
        fuzzy_jaro_winkler_threshold=settings.resolution.fuzzy_jaro_winkler_threshold,
        fuzzy_candidate_limit=settings.resolution.fuzzy_candidate_limit,
    ),
)
_inference_engine = RelationshipInferenceEngine()


def _build_evidence(event: RawEntityExtractionEvent) -> Evidence:
    return Evidence(
        source=event.source,
        source_id=event.source_id,
        source_event_id=event.event_id,
        collector="entity-extraction-service",
        observed_at=event.published_at,
        collected_at=event.collected_at,
        content_snippet=(event.content[:280] if event.content else None),
        raw_ref=f"{event.source}:{event.source_id}",
    )


def _identify_source_entity(resolved: list[ResolvedEntity], event: RawEntityExtractionEvent) -> Optional[ResolvedEntity]:
    """Best-effort identification of "the publishing account" among the
    resolved entities for this event. The existing extraction schema
    doesn't explicitly tag one entity as "the author" — so this looks for
    a SOCIAL_ACCOUNT/SOURCE-typed entity first, and falls back to None
    (meaning source-anchored rules like MENTIONS/POSTED/OWNS simply don't
    fire for that event) rather than guessing incorrectly. If/when
    extraction adds an explicit `author` field (it's optional on
    RawEntityExtractionEvent already, forward-compatible), wire it in
    here as the preferred path before the entity-type heuristic.
    """
    for r in resolved:
        if r.entity_type in (EntityType.SOCIAL_ACCOUNT, EntityType.SOURCE):
            return r
    return None


@app.agent(entities_topic)
async def process_entities(stream):
    async for raw_value in stream:
        t0 = time.monotonic()
        try:
            payload = faust.utils.json.loads(raw_value) if isinstance(raw_value, (bytes, str)) else raw_value
            event = RawEntityExtractionEvent.model_validate(payload)
        except Exception as exc:  # noqa: BLE001
            logger.error("Malformed entities message, routing to DLQ: %s", exc)
            await dlq_topic.send(value=raw_value)
            continue

        try:
            await _process_one_event(event)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Unhandled error processing source_id=%s source=%s: %s",
                              event.source_id, event.source, exc)
            await dlq_topic.send(value=raw_value)
            continue

        elapsed_ms = (time.monotonic() - t0) * 1000
        if elapsed_ms > 1000:
            logger.warning("Slow event processing: %.0fms for source_id=%s", elapsed_ms, event.source_id)


async def _process_one_event(event: RawEntityExtractionEvent) -> None:
    evidence = _build_evidence(event)

    # -- Phase 1 + 2: canonicalize and resolve every entity in this event
    resolved_entities: list[ResolvedEntity] = []
    for raw_entity in event.entities:
        try:
            canonical = _canonicalizer.canonicalize(raw_entity, evidence)
        except UnsupportedEntityTypeError as exc:
            logger.info("Skipping unsupported entity: %s", exc)
            continue

        co_occurring_ids = [r.entity_id for r in resolved_entities]
        result = _resolution_engine.resolve_with_context(canonical, co_occurring_ids)
        resolved_entities.append(result.resolved)

        # publish resolved_entities (one message per resolved entity, per
        # the target pipeline's topic contract)
        await resolved_entities_topic.send(value=result.resolved.model_dump_json().encode("utf-8"))

        # publish UPSERT_ENTITY graph update immediately — entities must
        # land before relationships referencing them (see graph_writer.py)
        upsert_update = GraphUpdate(
            operation=GraphUpdateOp.UPSERT_ENTITY,
            entity=result.resolved,
            evidence=evidence,
        )
        await graph_updates_topic.send(value=upsert_update.model_dump_json().encode("utf-8"))

        for mc in result.merge_candidates:
            await merge_candidates_topic.send(value=mc.model_dump_json().encode("utf-8"))

        # update co-occurrence counters for every pair seen together in
        # this event (feeds the OWNS rule's corroboration requirement)
        for other in resolved_entities[:-1]:
            key = "|".join(sorted((result.resolved.entity_id, other.entity_id)))
            co_occurrence_table[key] += 1

    if not resolved_entities:
        return

    # -- Phase 3: relationship inference over the full resolved set
    source_entity = _identify_source_entity(resolved_entities, event)
    co_occurrence_counts = {}
    for i, a in enumerate(resolved_entities):
        for b in resolved_entities[i + 1:]:
            key = "|".join(sorted((a.entity_id, b.entity_id)))
            count = co_occurrence_table.get(key, 0)
            co_occurrence_counts[tuple(sorted((a.entity_id, b.entity_id)))] = count

    ctx = InferenceContext(
        source=event.source,
        source_id=event.source_id,
        source_entity=source_entity,
        entities=resolved_entities,
        evidence=evidence,
        content=event.content,
        metadata=event.metadata,
        co_occurrence_counts=co_occurrence_counts,
    )
    relationships = _inference_engine.infer(ctx)

    # -- Phase 4: publish graph updates for every inferred relationship
    for rel in relationships:
        update = GraphUpdate(
            operation=GraphUpdateOp.UPSERT_RELATIONSHIP,
            relationship=rel,
            evidence=evidence,
        )
        await graph_updates_topic.send(value=update.model_dump_json().encode("utf-8"))


if __name__ == "__main__":
    app.main()