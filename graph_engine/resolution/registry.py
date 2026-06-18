"""
graph_engine.resolution.registry
==================================
The Entity Registry is the resolution engine's "memory" — it answers the
question "have I seen this canonical identity before, and under what
entity_id?" without the resolution engine needing to know whether that
memory lives in Redis, Postgres, or Neo4j itself.

Why a registry separate from Neo4j
-----------------------------------
Neo4j is the system of record for the *graph* (entities + relationships +
evidence), but it is the wrong tool for the hot lookup path that runs on
every single incoming entity mention at ingest volume (10K-50K events/min
=> far higher entity-mention volume). A registry interface lets us:
  - serve exact-match lookups from Redis (sub-millisecond, the common case
    for domain/email/phone/ip/url/social_id)
  - serve fuzzy-match candidate retrieval from Postgres (trigram/GIN index
    on canonical_name, or pg_trgm similarity) without round-tripping Neo4j
    for every candidate scan
  - keep Neo4j writes batched/async on the graph_updates topic, decoupled
    from the synchronous "do I already have an id for this" decision

Interfaces are defined here; three backends are provided:
  - InMemoryEntityRegistry   : tests, local dev, single-process demos
  - RedisEntityRegistry      : production hot path for EXACT_MATCH_TYPES
  - PostgresEntityRegistry   : production source of truth for canonical
                                names/aliases + fuzzy-candidate retrieval,
                                also the durable backing store Redis is
                                a cache in front of

A Neo4jEntityRegistry is intentionally NOT provided as a primary backend —
per the architecture mandate, Neo4j should only ever be touched via the
graph_updates topic + writer, never as a synchronous lookup dependency on
the resolution hot path. The Postgres registry is what gives resolution
its durability instead.
"""

from __future__ import annotations

import abc
import json
import time
from dataclasses import dataclass, field
from typing import Optional, Protocol

from graph_engine.models import EntityType


@dataclass
class RegistryRecord:
    entity_id: str
    entity_type: EntityType
    canonical_value: str          # the exact-match key OR the fuzzy comparison string
    canonical_name: str           # display form
    aliases: list[str] = field(default_factory=list)
    confidence: float = 0.5
    evidence_ids: list[str] = field(default_factory=list)
    updated_at: float = field(default_factory=time.time)

    def to_json(self) -> str:
        return json.dumps(
            {
                "entity_id": self.entity_id,
                "entity_type": self.entity_type.value,
                "canonical_value": self.canonical_value,
                "canonical_name": self.canonical_name,
                "aliases": self.aliases,
                "confidence": self.confidence,
                "evidence_ids": self.evidence_ids,
                "updated_at": self.updated_at,
            }
        )

    @classmethod
    def from_json(cls, raw: str) -> "RegistryRecord":
        d = json.loads(raw)
        return cls(
            entity_id=d["entity_id"],
            entity_type=EntityType(d["entity_type"]),
            canonical_value=d["canonical_value"],
            canonical_name=d["canonical_name"],
            aliases=d.get("aliases", []),
            confidence=d.get("confidence", 0.5),
            evidence_ids=d.get("evidence_ids", []),
            updated_at=d.get("updated_at", time.time()),
        )


class EntityRegistry(abc.ABC):
    """Abstract interface every backend implements. The resolution engine
    only ever depends on this interface, never on a concrete backend."""

    @abc.abstractmethod
    def lookup_exact(self, entity_type: EntityType, canonical_value: str) -> Optional[RegistryRecord]:
        """O(1)-ish lookup for EXACT_MATCH_TYPES."""

    @abc.abstractmethod
    def candidates_for_fuzzy(
        self, entity_type: EntityType, canonical_value: str, limit: int = 50
    ) -> list[RegistryRecord]:
        """Returns a bounded candidate set for fuzzy matching. A real
        Postgres backend should use pg_trgm `%` similarity or a
        trigram-GIN-indexed prefix scan to keep this bounded at scale —
        never a full table scan."""

    @abc.abstractmethod
    def get(self, entity_id: str) -> Optional[RegistryRecord]:
        ...

    @abc.abstractmethod
    def create(self, record: RegistryRecord) -> RegistryRecord:
        ...

    @abc.abstractmethod
    def add_alias(self, entity_id: str, alias: str) -> None:
        ...

    @abc.abstractmethod
    def merge(self, winner_id: str, loser_id: str) -> RegistryRecord:
        """Absorb loser_id into winner_id: union aliases + evidence_ids,
        keep the higher-confidence canonical_name, and leave a tombstone
        so any later lookup of loser_id resolves to winner_id."""

    @abc.abstractmethod
    def update_confidence(self, entity_id: str, confidence: float) -> None:
        ...

    @abc.abstractmethod
    def resolve_tombstone(self, entity_id: str) -> str:
        """Follow merge tombstones to the live entity_id. Returns
        entity_id unchanged if it was never merged away."""


# ---------------------------------------------------------------------------
# In-memory backend — tests / local dev / single-process demos
# ---------------------------------------------------------------------------

class InMemoryEntityRegistry(EntityRegistry):
    def __init__(self) -> None:
        self._by_id: dict[str, RegistryRecord] = {}
        self._by_exact_key: dict[tuple[EntityType, str], str] = {}
        self._tombstones: dict[str, str] = {}

    def lookup_exact(self, entity_type: EntityType, canonical_value: str) -> Optional[RegistryRecord]:
        eid = self._by_exact_key.get((entity_type, canonical_value))
        if eid is None:
            return None
        return self.get(eid)

    def candidates_for_fuzzy(
        self, entity_type: EntityType, canonical_value: str, limit: int = 50
    ) -> list[RegistryRecord]:
        # Naive scan — fine for tests/dev, NOT representative of production
        # behavior (see PostgresEntityRegistry for the indexed version).
        out = [
            r for r in self._by_id.values()
            if r.entity_type == entity_type
        ]
        return out[:limit]

    def get(self, entity_id: str) -> Optional[RegistryRecord]:
        entity_id = self.resolve_tombstone(entity_id)
        return self._by_id.get(entity_id)

    def create(self, record: RegistryRecord) -> RegistryRecord:
        self._by_id[record.entity_id] = record
        if record.entity_type in _EXACT_TYPES_HINT:
            self._by_exact_key[(record.entity_type, record.canonical_value)] = record.entity_id
        return record

    def add_alias(self, entity_id: str, alias: str) -> None:
        rec = self.get(entity_id)
        if rec and alias not in rec.aliases:
            rec.aliases.append(alias)
            rec.updated_at = time.time()

    def merge(self, winner_id: str, loser_id: str) -> RegistryRecord:
        winner = self.get(winner_id)
        loser = self.get(loser_id)
        if winner is None or loser is None:
            raise KeyError("merge requires both entity_ids to exist")
        for alias in loser.aliases + [loser.canonical_name]:
            if alias not in winner.aliases and alias != winner.canonical_name:
                winner.aliases.append(alias)
        for eid in loser.evidence_ids:
            if eid not in winner.evidence_ids:
                winner.evidence_ids.append(eid)
        winner.confidence = max(winner.confidence, loser.confidence)
        winner.updated_at = time.time()
        self._tombstones[loser_id] = winner_id
        del self._by_id[loser_id]
        return winner

    def update_confidence(self, entity_id: str, confidence: float) -> None:
        rec = self.get(entity_id)
        if rec:
            rec.confidence = confidence
            rec.updated_at = time.time()

    def resolve_tombstone(self, entity_id: str) -> str:
        seen = set()
        while entity_id in self._tombstones and entity_id not in seen:
            seen.add(entity_id)
            entity_id = self._tombstones[entity_id]
        return entity_id


_EXACT_TYPES_HINT = {
    EntityType.DOMAIN, EntityType.EMAIL, EntityType.PHONE, EntityType.IP,
    EntityType.URL, EntityType.UPI, EntityType.BANK_ACCOUNT,
    EntityType.CRYPTO_WALLET, EntityType.SOCIAL_ACCOUNT,
    EntityType.HASHTAG, EntityType.MENTION_HANDLE,
}


# ---------------------------------------------------------------------------
# Redis backend — production hot path for exact-match lookups
# ---------------------------------------------------------------------------

class RedisEntityRegistry(EntityRegistry):
    """Wraps a `redis.Redis` (sync) or `redis.asyncio.Redis` client.

    Key layout:
        entity:{entity_id}                  -> RegistryRecord JSON
        exact_idx:{entity_type}:{value}     -> entity_id
        tombstone:{entity_id}               -> winner_entity_id

    NOTE: This class exposes a sync interface for simplicity in this
    deliverable. In a Faust/asyncio agent, wrap calls with
    `asyncio.to_thread(...)` or swap the client for `redis.asyncio.Redis`
    and make these methods `async def` — the method bodies are otherwise
    unchanged. Kept sync here so it has zero hard dependency on which
    async runtime the rest of the service uses.
    """

    def __init__(self, redis_client, ttl_seconds: Optional[int] = None) -> None:
        self.r = redis_client
        self.ttl = ttl_seconds  # None = no expiry; registry entries are durable

    def _exact_key(self, entity_type: EntityType, canonical_value: str) -> str:
        return f"exact_idx:{entity_type.value}:{canonical_value}"

    def lookup_exact(self, entity_type: EntityType, canonical_value: str) -> Optional[RegistryRecord]:
        eid = self.r.get(self._exact_key(entity_type, canonical_value))
        if not eid:
            return None
        return self.get(eid if isinstance(eid, str) else eid.decode())

    def candidates_for_fuzzy(
        self, entity_type: EntityType, canonical_value: str, limit: int = 50
    ) -> list[RegistryRecord]:
        # Redis has no native trigram index — fuzzy candidate generation is
        # delegated to PostgresEntityRegistry in production. A Redis-only
        # deployment should not be used for FUZZY_MATCH_TYPES.
        raise NotImplementedError(
            "RedisEntityRegistry does not support fuzzy candidate retrieval; "
            "use PostgresEntityRegistry for person/organization/location."
        )

    def get(self, entity_id: str) -> Optional[RegistryRecord]:
        entity_id = self.resolve_tombstone(entity_id)
        raw = self.r.get(f"entity:{entity_id}")
        if not raw:
            return None
        raw = raw if isinstance(raw, str) else raw.decode()
        return RegistryRecord.from_json(raw)

    def create(self, record: RegistryRecord) -> RegistryRecord:
        pipe = self.r.pipeline()
        pipe.set(f"entity:{record.entity_id}", record.to_json(), ex=self.ttl)
        pipe.set(self._exact_key(record.entity_type, record.canonical_value), record.entity_id, ex=self.ttl)
        pipe.execute()
        return record

    def add_alias(self, entity_id: str, alias: str) -> None:
        rec = self.get(entity_id)
        if rec and alias not in rec.aliases:
            rec.aliases.append(alias)
            rec.updated_at = time.time()
            self.r.set(f"entity:{entity_id}", rec.to_json(), ex=self.ttl)

    def merge(self, winner_id: str, loser_id: str) -> RegistryRecord:
        winner = self.get(winner_id)
        loser = self.get(loser_id)
        if winner is None or loser is None:
            raise KeyError("merge requires both entity_ids to exist")
        for alias in loser.aliases + [loser.canonical_name]:
            if alias not in winner.aliases and alias != winner.canonical_name:
                winner.aliases.append(alias)
        for eid in loser.evidence_ids:
            if eid not in winner.evidence_ids:
                winner.evidence_ids.append(eid)
        winner.confidence = max(winner.confidence, loser.confidence)
        winner.updated_at = time.time()
        pipe = self.r.pipeline()
        pipe.set(f"entity:{winner_id}", winner.to_json(), ex=self.ttl)
        pipe.set(f"tombstone:{loser_id}", winner_id, ex=self.ttl)
        pipe.delete(f"entity:{loser_id}")
        pipe.execute()
        return winner

    def update_confidence(self, entity_id: str, confidence: float) -> None:
        rec = self.get(entity_id)
        if rec:
            rec.confidence = confidence
            rec.updated_at = time.time()
            self.r.set(f"entity:{entity_id}", rec.to_json(), ex=self.ttl)

    def resolve_tombstone(self, entity_id: str) -> str:
        seen = set()
        current = entity_id
        while current not in seen:
            seen.add(current)
            nxt = self.r.get(f"tombstone:{current}")
            if not nxt:
                return current
            current = nxt if isinstance(nxt, str) else nxt.decode()
        return current


# ---------------------------------------------------------------------------
# Postgres backend — durable source of truth + fuzzy candidate retrieval
# ---------------------------------------------------------------------------

class PostgresEntityRegistry(EntityRegistry):
    """Wraps a DB-API-compatible connection (psycopg2/psycopg3) or an
    SQLAlchemy Session. Expected schema (see deploy/schema.sql):

        CREATE TABLE entity_registry (
            entity_id        TEXT PRIMARY KEY,
            entity_type      TEXT NOT NULL,
            canonical_value  TEXT NOT NULL,
            canonical_name   TEXT NOT NULL,
            aliases          TEXT[] NOT NULL DEFAULT '{}',
            confidence       REAL NOT NULL DEFAULT 0.5,
            evidence_ids     TEXT[] NOT NULL DEFAULT '{}',
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX ux_entity_exact
            ON entity_registry (entity_type, canonical_value);
        CREATE INDEX ix_entity_name_trgm
            ON entity_registry USING gin (canonical_name gin_trgm_ops);

        CREATE TABLE entity_tombstones (
            loser_id  TEXT PRIMARY KEY,
            winner_id TEXT NOT NULL
        );

    This class issues parameterized SQL only — no string interpolation of
    user-controlled values, which matters given this data ultimately
    originates from open/adversarial OSINT sources.
    """

    def __init__(self, conn) -> None:
        self.conn = conn

    def lookup_exact(self, entity_type: EntityType, canonical_value: str) -> Optional[RegistryRecord]:
        cur = self.conn.cursor()
        cur.execute(
            "SELECT entity_id, entity_type, canonical_value, canonical_name, "
            "aliases, confidence, evidence_ids, updated_at "
            "FROM entity_registry WHERE entity_type = %s AND canonical_value = %s",
            (entity_type.value, canonical_value),
        )
        row = cur.fetchone()
        return self._row_to_record(row) if row else None

    def candidates_for_fuzzy(
        self, entity_type: EntityType, canonical_value: str, limit: int = 50
    ) -> list[RegistryRecord]:
        cur = self.conn.cursor()
        # pg_trgm similarity-ordered candidate retrieval — bounded, indexed.
        # Requires `CREATE EXTENSION pg_trgm;` once per database.
        cur.execute(
            "SELECT entity_id, entity_type, canonical_value, canonical_name, "
            "aliases, confidence, evidence_ids, updated_at "
            "FROM entity_registry "
            "WHERE entity_type = %s AND canonical_name %% %s "
            "ORDER BY similarity(canonical_name, %s) DESC "
            "LIMIT %s",
            (entity_type.value, canonical_value, canonical_value, limit),
        )
        return [self._row_to_record(row) for row in cur.fetchall()]

    def get(self, entity_id: str) -> Optional[RegistryRecord]:
        entity_id = self.resolve_tombstone(entity_id)
        cur = self.conn.cursor()
        cur.execute(
            "SELECT entity_id, entity_type, canonical_value, canonical_name, "
            "aliases, confidence, evidence_ids, updated_at "
            "FROM entity_registry WHERE entity_id = %s",
            (entity_id,),
        )
        row = cur.fetchone()
        return self._row_to_record(row) if row else None

    def create(self, record: RegistryRecord) -> RegistryRecord:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT INTO entity_registry "
            "(entity_id, entity_type, canonical_value, canonical_name, aliases, confidence, evidence_ids) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (entity_type, canonical_value) DO NOTHING",
            (
                record.entity_id, record.entity_type.value, record.canonical_value,
                record.canonical_name, record.aliases, record.confidence, record.evidence_ids,
            ),
        )
        self.conn.commit()
        return self.get(record.entity_id) or record

    def add_alias(self, entity_id: str, alias: str) -> None:
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE entity_registry SET aliases = array_append(aliases, %s), updated_at = now() "
            "WHERE entity_id = %s AND NOT (%s = ANY(aliases))",
            (alias, entity_id, alias),
        )
        self.conn.commit()

    def merge(self, winner_id: str, loser_id: str) -> RegistryRecord:
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE entity_registry w SET "
            "  aliases = (SELECT array_agg(DISTINCT x) FROM unnest(w.aliases || l.aliases || ARRAY[l.canonical_name]) x), "
            "  evidence_ids = (SELECT array_agg(DISTINCT x) FROM unnest(w.evidence_ids || l.evidence_ids) x), "
            "  confidence = GREATEST(w.confidence, l.confidence), "
            "  updated_at = now() "
            "FROM entity_registry l "
            "WHERE w.entity_id = %s AND l.entity_id = %s",
            (winner_id, loser_id),
        )
        cur.execute("DELETE FROM entity_registry WHERE entity_id = %s", (loser_id,))
        cur.execute(
            "INSERT INTO entity_tombstones (loser_id, winner_id) VALUES (%s, %s) "
            "ON CONFLICT (loser_id) DO UPDATE SET winner_id = EXCLUDED.winner_id",
            (loser_id, winner_id),
        )
        self.conn.commit()
        return self.get(winner_id)

    def update_confidence(self, entity_id: str, confidence: float) -> None:
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE entity_registry SET confidence = %s, updated_at = now() WHERE entity_id = %s",
            (confidence, entity_id),
        )
        self.conn.commit()

    def resolve_tombstone(self, entity_id: str) -> str:
        cur = self.conn.cursor()
        seen = set()
        current = entity_id
        while current not in seen:
            seen.add(current)
            cur.execute("SELECT winner_id FROM entity_tombstones WHERE loser_id = %s", (current,))
            row = cur.fetchone()
            if not row:
                return current
            current = row[0]
        return current

    @staticmethod
    def _row_to_record(row) -> RegistryRecord:
        return RegistryRecord(
            entity_id=row[0],
            entity_type=EntityType(row[1]),
            canonical_value=row[2],
            canonical_name=row[3],
            aliases=list(row[4] or []),
            confidence=row[5],
            evidence_ids=list(row[6] or []),
            updated_at=row[7].timestamp() if hasattr(row[7], "timestamp") else time.time(),
        )