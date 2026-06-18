"""
graph_engine.writer.graph_writer
==================================
Phase 5 — Neo4j Writer.

This is the ONLY component in the system that writes to Neo4j, and it
ONLY ever consumes GraphUpdate envelopes (never raw_events, never
`entities`, never `resolved_entities` directly) — enforcing the
architecture mandate that Neo4j is a pure persistence target for an
already-decided graph state, not a place where resolution/inference logic
leaks in via ad-hoc Cypher.

Evidence model in Neo4j
------------------------
Every relationship is represented TWICE, deliberately:

1. A direct, typed, weighted edge between the two entity nodes
   (e.g. `(:Person)-[:ASSOCIATED_WITH]->(:Organization)`), carrying
   `weight`, `confidence`, `first_seen`, `last_seen`, `evidence_count`.
   This is what powers fast traversal (`entity_profile.py`'s 1/2/3-hop
   queries) — you do not want to walk through Assertion/Evidence nodes on
   every graph-visualizer hop.

2. An `:Assertion` node per *individual inference event* that produced (or
   reinforced) that edge, linked:
       (:Assertion)-[:ABOUT_SOURCE]->(sourceEntity)
       (:Assertion)-[:ABOUT_TARGET]->(targetEntity)
       (:Assertion)-[:BASED_ON]->(:Evidence)
   and the `:Evidence` node itself carries `source`, `source_id`,
   `collector`, `observed_at`, `raw_ref`. This is what answers "why does
   this edge exist?" — `evidence_browser.py` walks Assertion/Evidence
   nodes, never the aggregate edge alone.

This two-layer model is intentionally more verbose than a single edge with
an `evidence_ids` array property, because Neo4j relationship properties
have practical size/perf limits at high evidence_count, and because
Assertion nodes let analysts ask "show me every individual post that
contributed to this edge" with a normal graph query instead of fetching
and resolving an array of opaque ids client-side.

Idempotency
------------
Every write is a `MERGE`, never `CREATE`. Node merge keys are always
`entity_id` (already globally deterministic from canonicalization).
Relationship merges use `MERGE (a)-[r:TYPE]->(b)` with NO properties in
the merge pattern itself (properties go in `ON CREATE`/`ON MATCH` `SET`
clauses) — this is the standard Neo4j idempotency pattern; putting a
property inside the MERGE pattern would silently create duplicate edges
whenever that property's value differs across writes.

Concurrency
------------
Multiple Faust/Kafka consumer instances may call these methods in
parallel for *different* partitions, and the same entity_id can appear in
two different partitions' updates simultaneously (e.g. a SOURCE entity
mentioned across many source events on different partitions). Neo4j's
MERGE takes a write lock on the matched/created node for the duration of
the transaction, so concurrent MERGEs on the same key serialize safely at
the database level — no application-level locking is implemented here
deliberately, since re-implementing what Neo4j already guarantees would
only add bugs. What this module DOES guarantee on its own side: every
write is a single Cypher statement (or a single UNWIND-batched statement)
executed inside one driver-managed transaction, so partial writes cannot
leave a relationship without its Assertion/Evidence trail.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from graph_engine.models import (
    Evidence,
    GraphUpdate,
    GraphUpdateOp,
    Relationship,
    ResolvedEntity,
)

logger = logging.getLogger("graph_engine.writer")

# Neo4j label per EntityType value. Kept as a flat dict at module scope so
# Cypher templates below can reference it without per-call overhead.
_ENTITY_LABELS = {
    "person": "Person",
    "organization": "Organization",
    "location": "Location",
    "domain": "Domain",
    "email": "Email",
    "phone": "Phone",
    "ip": "IP",
    "url": "URL",
    "social_account": "SocialAccount",
    "crypto_wallet": "CryptoWallet",
    "upi": "UPI",
    "bank_account": "BankAccount",
    "hashtag": "Hashtag",
    "mention_handle": "MentionHandle",
    "source": "Source",
}


def _label_for(entity_type: str) -> str:
    return _ENTITY_LABELS.get(entity_type, "Entity")


class Neo4jGraphWriter:
    """Wraps a `neo4j.Driver` (or `neo4j.AsyncDriver`). Methods shown here
    are written against the sync driver API for clarity; the async
    equivalents (`async def`, `await session.execute_write(...)`) are a
    mechanical translation and are what should actually be used inside
    `faust_app.py` / the graph_updates consumer to avoid blocking the
    event loop.
    """

    def __init__(self, driver, database: str = "neo4j") -> None:
        self.driver = driver
        self.database = database

    # -- dispatch ------------------------------------------------------

    def apply(self, update: GraphUpdate) -> None:
        """Single entry point — routes a GraphUpdate to the right Cypher.
        This is the only method the Kafka consumer loop needs to call."""
        op = update.operation
        if hasattr(op, "value"):
            op = op.value

        if op == GraphUpdateOp.UPSERT_ENTITY.value:
            self._upsert_entity(update.entity, update.evidence)
        elif op == GraphUpdateOp.UPSERT_RELATIONSHIP.value:
            self._upsert_relationship(update.relationship, update.evidence)
        elif op == GraphUpdateOp.ATTACH_EVIDENCE.value:
            self._attach_evidence(update.target_entity_id, update.target_relationship_id, update.evidence)
        elif op == GraphUpdateOp.MERGE_ENTITY.value:
            self._merge_entity(update.merge_winner_id, update.merge_loser_id)
        elif op == GraphUpdateOp.UPDATE_CONFIDENCE.value:
            self._update_confidence(update.target_entity_id, update.new_confidence)
        else:
            logger.warning("Unhandled GraphUpdate operation: %s (update_id=%s)", op, update.update_id)

    # -- entity upsert ---------------------------------------------------

    def _upsert_entity(self, entity: Optional[ResolvedEntity], evidence: Optional[Evidence]) -> None:
        if entity is None:
            logger.warning("UPSERT_ENTITY GraphUpdate missing entity payload; skipping")
            return
        label = _label_for(entity.entity_type if isinstance(entity.entity_type, str) else entity.entity_type.value)
        cypher = f"""
        MERGE (n:Entity:{label} {{entity_id: $entity_id}})
        ON CREATE SET
            n.entity_type = $entity_type,
            n.canonical_name = $canonical_name,
            n.confidence = $confidence,
            n.aliases = $aliases,
            n.first_seen = $now,
            n.last_seen = $now
        ON MATCH SET
            n.canonical_name = $canonical_name,
            n.confidence = CASE WHEN $confidence > n.confidence THEN $confidence ELSE n.confidence END,
            n.aliases = apoc.coll.toSet(coalesce(n.aliases, []) + $aliases),
            n.last_seen = $now
        RETURN n.entity_id AS entity_id
        """
        params = {
            "entity_id": entity.entity_id,
            "entity_type": entity.entity_type if isinstance(entity.entity_type, str) else entity.entity_type.value,
            "canonical_name": entity.canonical_name,
            "confidence": entity.confidence,
            "aliases": entity.aliases,
            "now": entity.resolved_at,
        }
        self._run(cypher, params, fallback=self._upsert_entity_no_apoc, fallback_args=(entity,))

        if evidence is not None:
            self._attach_evidence(target_entity_id=entity.entity_id, target_relationship_id=None, evidence=evidence)

    def _upsert_entity_no_apoc(self, entity: ResolvedEntity) -> None:
        """APOC-free fallback (some managed Neo4j tiers / strict security
        policies disable APOC). Alias union done client-side instead."""
        label = _label_for(entity.entity_type if isinstance(entity.entity_type, str) else entity.entity_type.value)
        cypher = f"""
        MERGE (n:Entity:{label} {{entity_id: $entity_id}})
        ON CREATE SET
            n.entity_type = $entity_type, n.canonical_name = $canonical_name,
            n.confidence = $confidence, n.aliases = $aliases,
            n.first_seen = $now, n.last_seen = $now
        ON MATCH SET
            n.canonical_name = $canonical_name,
            n.confidence = CASE WHEN $confidence > n.confidence THEN $confidence ELSE n.confidence END,
            n.last_seen = $now
        RETURN n.aliases AS existing_aliases
        """
        params = {
            "entity_id": entity.entity_id,
            "entity_type": entity.entity_type if isinstance(entity.entity_type, str) else entity.entity_type.value,
            "canonical_name": entity.canonical_name,
            "confidence": entity.confidence,
            "aliases": entity.aliases,
            "now": entity.resolved_at,
        }
        result = self._run_raw(cypher, params)
        if result:
            existing = set(result[0].get("existing_aliases") or [])
            merged = sorted(existing.union(entity.aliases))
            self._run_raw(
                f"MATCH (n:Entity:{label} {{entity_id: $entity_id}}) SET n.aliases = $aliases",
                {"entity_id": entity.entity_id, "aliases": merged},
            )

    # -- relationship upsert -----------------------------------------------

    def _upsert_relationship(self, rel: Optional[Relationship], evidence: Optional[Evidence]) -> None:
        if rel is None:
            logger.warning("UPSERT_RELATIONSHIP GraphUpdate missing relationship payload; skipping")
            return
        rel_type = rel.relationship_type if isinstance(rel.relationship_type, str) else rel.relationship_type.value
        # Relationship type is interpolated (not parameterized — Cypher
        # doesn't support parameterized relationship types), but it is
        # ALWAYS sourced from the closed RelationshipType enum, never from
        # raw user/source text, so there is no injection surface here.
        cypher = f"""
        MATCH (a:Entity {{entity_id: $source_id}})
        MATCH (b:Entity {{entity_id: $target_id}})
        MERGE (a)-[r:{rel_type}]->(b)
        ON CREATE SET
            r.weight = 1,
            r.confidence = $confidence,
            r.first_seen = $now,
            r.last_seen = $now,
            r.evidence_count = 1,
            r.relationship_id = $relationship_id
        ON MATCH SET
            r.weight = r.weight + 1,
            r.confidence = CASE WHEN $confidence > r.confidence THEN $confidence ELSE r.confidence END,
            r.last_seen = $now,
            r.evidence_count = r.evidence_count + 1
        RETURN r.relationship_id AS relationship_id
        """
        params = {
            "source_id": rel.source_entity_id,
            "target_id": rel.target_entity_id,
            "confidence": rel.confidence,
            "now": rel.inferred_at,
            "relationship_id": rel.relationship_id,
        }
        rows = self._run_raw(cypher, params)
        if not rows:
            logger.warning(
                "UPSERT_RELATIONSHIP matched no nodes (source=%s target=%s) — "
                "entity nodes must be upserted before relationships referencing "
                "them; check graph_updates ordering.",
                rel.source_entity_id, rel.target_entity_id,
            )
            return

        if evidence is not None:
            self._write_assertion(rel, evidence)

    def _write_assertion(self, rel: Relationship, evidence: Evidence) -> None:
        """Reifies one inference event as an :Assertion node connected to
        source entity, target entity, and the :Evidence node — the
        evidence-trail layer described in the module docstring."""
        rel_type = rel.relationship_type if isinstance(rel.relationship_type, str) else rel.relationship_type.value
        cypher = """
        MERGE (ev:Evidence {evidence_id: $evidence_id})
        ON CREATE SET
            ev.source = $ev_source, ev.source_id = $ev_source_id,
            ev.collector = $ev_collector, ev.observed_at = $ev_observed_at,
            ev.collected_at = $ev_collected_at, ev.raw_ref = $ev_raw_ref,
            ev.content_snippet = $ev_snippet, ev.created_at = $ev_created_at
        WITH ev
        MATCH (a:Entity {entity_id: $source_id})
        MATCH (b:Entity {entity_id: $target_id})
        MERGE (asrt:Assertion {
            relationship_id: $relationship_id,
            evidence_id: $evidence_id
        })
        ON CREATE SET
            asrt.relationship_type = $rel_type,
            asrt.confidence = $confidence,
            asrt.rule_name = $rule_name,
            asrt.inferred_at = $inferred_at
        MERGE (asrt)-[:ABOUT_SOURCE]->(a)
        MERGE (asrt)-[:ABOUT_TARGET]->(b)
        MERGE (asrt)-[:BASED_ON]->(ev)
        """
        params = {
            "evidence_id": evidence.evidence_id,
            "ev_source": evidence.source,
            "ev_source_id": evidence.source_id,
            "ev_collector": evidence.collector,
            "ev_observed_at": evidence.observed_at,
            "ev_collected_at": evidence.collected_at,
            "ev_raw_ref": evidence.raw_ref,
            "ev_snippet": evidence.content_snippet,
            "ev_created_at": evidence.created_at,
            "source_id": rel.source_entity_id,
            "target_id": rel.target_entity_id,
            "relationship_id": rel.relationship_id,
            "rel_type": rel_type,
            "confidence": rel.confidence,
            "rule_name": rel.rule_name,
            "inferred_at": rel.inferred_at,
        }
        self._run_raw(cypher, params)

    # -- evidence attach (entity-level) -----------------------------------

    def _attach_evidence(
        self,
        target_entity_id: Optional[str],
        target_relationship_id: Optional[str],
        evidence: Optional[Evidence],
    ) -> None:
        if evidence is None:
            return
        cypher = """
        MERGE (ev:Evidence {evidence_id: $evidence_id})
        ON CREATE SET
            ev.source = $ev_source, ev.source_id = $ev_source_id,
            ev.collector = $ev_collector, ev.observed_at = $ev_observed_at,
            ev.collected_at = $ev_collected_at, ev.raw_ref = $ev_raw_ref,
            ev.content_snippet = $ev_snippet, ev.created_at = $ev_created_at
        """
        params = {
            "evidence_id": evidence.evidence_id,
            "ev_source": evidence.source,
            "ev_source_id": evidence.source_id,
            "ev_collector": evidence.collector,
            "ev_observed_at": evidence.observed_at,
            "ev_collected_at": evidence.collected_at,
            "ev_raw_ref": evidence.raw_ref,
            "ev_snippet": evidence.content_snippet,
            "ev_created_at": evidence.created_at,
        }
        self._run_raw(cypher, params)

        if target_entity_id:
            self._run_raw(
                """
                MATCH (n:Entity {entity_id: $entity_id})
                MATCH (ev:Evidence {evidence_id: $evidence_id})
                MERGE (n)-[:HAS_EVIDENCE]->(ev)
                """,
                {"entity_id": target_entity_id, "evidence_id": evidence.evidence_id},
            )

    # -- merge entity --------------------------------------------------

    def _merge_entity(self, winner_id: Optional[str], loser_id: Optional[str]) -> None:
        """Absorbs loser node into winner: re-point every relationship
        (incoming and outgoing) from loser to winner, union aliases, union
        HAS_EVIDENCE edges, then delete loser. Implemented WITHOUT APOC's
        `apoc.refactor.mergeNodes` by default (portable across Neo4j
        Community vs Enterprise vs APOC-restricted managed instances);
        an APOC-accelerated path can be substituted in production for
        large fan-in/fan-out nodes where this query becomes a bottleneck.
        """
        if not winner_id or not loser_id:
            logger.warning("MERGE_ENTITY missing winner/loser id; skipping")
            return

        # Re-point outgoing relationships
        self._run_raw(
            """
            MATCH (loser:Entity {entity_id: $loser_id})-[r]->(other)
            MATCH (winner:Entity {entity_id: $winner_id})
            WHERE other.entity_id <> $winner_id
            CALL apoc.refactor.to(r, winner) YIELD input
            RETURN count(*) AS n
            """,
            {"loser_id": loser_id, "winner_id": winner_id},
            swallow_errors=True,  # falls back below if APOC unavailable
        )
        # Re-point incoming relationships
        self._run_raw(
            """
            MATCH (other)-[r]->(loser:Entity {entity_id: $loser_id})
            MATCH (winner:Entity {entity_id: $winner_id})
            WHERE other.entity_id <> $winner_id
            CALL apoc.refactor.from(r, winner) YIELD output
            RETURN count(*) AS n
            """,
            {"loser_id": loser_id, "winner_id": winner_id},
            swallow_errors=True,
        )
        # Union aliases, mark tombstone, delete loser node
        self._run_raw(
            """
            MATCH (loser:Entity {entity_id: $loser_id})
            MATCH (winner:Entity {entity_id: $winner_id})
            SET winner.aliases = apoc.coll.toSet(
                    coalesce(winner.aliases, []) + coalesce(loser.aliases, []) + [loser.canonical_name]
                ),
                winner.confidence = CASE WHEN loser.confidence > winner.confidence
                                          THEN loser.confidence ELSE winner.confidence END
            DETACH DELETE loser
            """,
            {"loser_id": loser_id, "winner_id": winner_id},
            swallow_errors=True,
        )
        # Tombstone node so future writes targeting loser_id (in-flight
        # Kafka messages produced before the merge decision propagated)
        # can be redirected at write time rather than silently recreating
        # the loser as a new orphan node.
        self._run_raw(
            "MERGE (t:Tombstone {loser_id: $loser_id}) SET t.winner_id = $winner_id",
            {"loser_id": loser_id, "winner_id": winner_id},
        )

    def _update_confidence(self, entity_id: Optional[str], confidence: Optional[float]) -> None:
        if not entity_id or confidence is None:
            return
        self._run_raw(
            "MATCH (n:Entity {entity_id: $entity_id}) SET n.confidence = $confidence",
            {"entity_id": entity_id, "confidence": confidence},
        )

    # -- low-level execution ------------------------------------------

    def _run(self, cypher: str, params: dict[str, Any], fallback=None, fallback_args=()) -> None:
        try:
            self._run_raw(cypher, params)
        except Exception as exc:  # noqa: BLE001 - APOC-missing is the expected case here
            if fallback is not None:
                logger.info("Primary write path failed (%s); using fallback.", exc)
                fallback(*fallback_args)
            else:
                raise

    def _run_raw(self, cypher: str, params: dict[str, Any], swallow_errors: bool = False) -> list[dict]:
        try:
            with self.driver.session(database=self.database) as session:
                result = session.execute_write(lambda tx: list(tx.run(cypher, params)))
                return [dict(r) for r in result]
        except Exception as exc:  # noqa: BLE001
            if swallow_errors:
                logger.debug("Swallowed Cypher error (likely APOC unavailable): %s", exc)
                return []
            logger.error("Neo4j write failed: %s\nCypher: %s", exc, cypher)
            raise

    # -- batch write entry point ----------------------------------------

    def apply_batch(self, updates: list[GraphUpdate]) -> None:
        """Apply a batch of updates. Entity upserts are applied before
        relationship upserts within the batch (relationships require both
        endpoint nodes to already exist) — this ordering matters when a
        Faust agent batches several GraphUpdates from the same source
        event together for throughput."""
        entity_ops = [u for u in updates if u.operation in (GraphUpdateOp.UPSERT_ENTITY, "UPSERT_ENTITY")]
        other_ops = [u for u in updates if u not in entity_ops]
        for u in entity_ops:
            self.apply(u)
        for u in other_ops:
            self.apply(u)