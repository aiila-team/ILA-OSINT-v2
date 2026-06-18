"""
graph_engine.models
====================
Single source of truth for every data contract that crosses a process or
Kafka-topic boundary in the graph engine. Every other module imports from
here rather than redefining shapes inline — this is what keeps the
canonicalization / resolution / inference / writer stages decoupled and
independently testable.

Design notes
------------
- All models are Pydantic v2 BaseModels: free runtime validation, free JSON
  (de)serialization for Kafka payloads, free schema export for documentation.
- Nothing in this module talks to Kafka, Neo4j, Redis, or Postgres. It is
  pure data shape. That's intentional: contracts must be stable and testable
  in isolation from infrastructure.
- `entity_id` is ALWAYS `sha256(f"{entity_type}:{canonical_value}")[:32]`.
  It is computed by canonicalization.engine and never invented elsewhere,
  so the same real-world thing always maps to the same id regardless of
  which collector, which language, or which casing produced the mention.
"""

from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class EntityType(str, Enum):
    """Canonical entity types. Mirrors the PRD's entity taxonomy. Extend
    here first — every other module switches on this enum."""
    PERSON = "person"
    ORGANIZATION = "organization"
    LOCATION = "location"
    DOMAIN = "domain"
    EMAIL = "email"
    PHONE = "phone"
    IP = "ip"
    URL = "url"
    SOCIAL_ACCOUNT = "social_account"
    CRYPTO_WALLET = "crypto_wallet"
    UPI = "upi"
    BANK_ACCOUNT = "bank_account"
    HASHTAG = "hashtag"
    MENTION_HANDLE = "mention_handle"
    SOURCE = "source"  # the publishing account/channel/outlet itself


# Entity types resolved via Stage 1 (deterministic exact match on a
# normalized canonical identifier). No fuzzy logic involved — if two
# mentions normalize to the same string, they are the same real-world thing.
EXACT_MATCH_TYPES = {
    EntityType.DOMAIN,
    EntityType.EMAIL,
    EntityType.PHONE,
    EntityType.IP,
    EntityType.URL,
    EntityType.UPI,
    EntityType.BANK_ACCOUNT,
    EntityType.CRYPTO_WALLET,
    EntityType.SOCIAL_ACCOUNT,
    EntityType.HASHTAG,
    EntityType.MENTION_HANDLE,
}

# Entity types resolved via Stage 2 (fuzzy name matching). Free-text names
# have no canonical identifier — "Rahul Gandhi" vs "rahul gandhi" vs
# "राहुल गांधी" need similarity scoring, not string equality.
FUZZY_MATCH_TYPES = {
    EntityType.PERSON,
    EntityType.ORGANIZATION,
    EntityType.LOCATION,
}


class RelationshipType(str, Enum):
    MENTIONS = "MENTIONS"
    POSTED = "POSTED"
    LINKED_TO = "LINKED_TO"
    OWNS = "OWNS"
    ASSOCIATED_WITH = "ASSOCIATED_WITH"
    LOCATED_AT = "LOCATED_AT"
    OBSERVED_AT = "OBSERVED_AT"
    PUBLISHED = "PUBLISHED"
    TARGETS = "TARGETS"
    USES = "USES"
    HOSTS = "HOSTS"


class GraphUpdateOp(str, Enum):
    UPSERT_ENTITY = "UPSERT_ENTITY"
    MERGE_ENTITY = "MERGE_ENTITY"
    UPSERT_RELATIONSHIP = "UPSERT_RELATIONSHIP"
    ATTACH_EVIDENCE = "ATTACH_EVIDENCE"
    UPDATE_CONFIDENCE = "UPDATE_CONFIDENCE"


class ResolutionStage(str, Enum):
    EXACT_MATCH = "exact_match"
    FUZZY_MATCH = "fuzzy_match"
    BEHAVIORAL_SIMILARITY = "behavioral_similarity"
    NETWORK_SIMILARITY = "network_similarity"
    UNRESOLVED = "unresolved"


# ---------------------------------------------------------------------------
# Inbound contract — what the (existing, already-built) entity extraction
# service publishes to Kafka topic `entities`. This is intentionally an
# exact mirror of the schema given in the brief — the graph engine is a
# *consumer* of this contract, never a producer of it.
# ---------------------------------------------------------------------------

class RawExtractedEntity(BaseModel):
    entity_type: str
    value: str
    confidence: float = Field(ge=0.0, le=1.0)


class RawEntityExtractionEvent(BaseModel):
    """Exact shape of a message on the `entities` topic, as produced by the
    existing extraction service. We intentionally do NOT import EntityType
    here for entity_type — upstream may emit values our enum doesn't know
    about yet (new source, new extractor), and a strict enum would crash
    the consumer on every unrecognized type. Canonicalization is responsible
    for mapping/validating into EntityType, and unknown types are routed to
    a dead-letter/unresolved path rather than raising.
    """
    source: str
    source_id: str
    published_at: str
    entities: list[RawExtractedEntity] = Field(default_factory=list)

    # Fields below are not in the literal example payload but are present
    # on the raw_events normalized schema this service descends from, and
    # are optional here for forward compatibility — extraction may start
    # passing them through later without breaking this consumer.
    event_id: Optional[str] = None
    content: Optional[str] = None
    collected_at: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Evidence — the spine of explainability. Every node and edge in the graph
# must trace back to one or more Evidence records, which trace back to a
# specific raw source event. "Why does this exist?" is always answerable
# by following entity/relationship -> evidence_ids -> Evidence -> source.
# ---------------------------------------------------------------------------

class Evidence(BaseModel):
    evidence_id: str = Field(default_factory=lambda: f"ev_{uuid.uuid4().hex}")
    source: str                      # e.g. "telegram", "newsapi", "cert-in"
    source_id: str                   # original platform/document id
    source_event_id: Optional[str] = None  # raw_events.event_id, if present
    collector: str = "unknown"       # which collector/extractor produced this
    observed_at: Optional[str] = None    # published_at from the source
    collected_at: Optional[str] = None   # when our pipeline ingested it
    content_snippet: Optional[str] = None  # short excerpt, never full body
    raw_ref: Optional[str] = None    # pointer to raw payload (S3 key, doc id)
    created_at: float = Field(default_factory=time.time)

    def fingerprint(self) -> str:
        """Stable identity for dedup — two Evidence objects pointing at the
        same (source, source_id) for the same observation are the same
        evidence, even if generated by two different pipeline runs."""
        return f"{self.source}:{self.source_id}:{self.observed_at}"


# ---------------------------------------------------------------------------
# Canonicalization output
# ---------------------------------------------------------------------------

class CanonicalEntity(BaseModel):
    """Output of canonicalization.engine — a single normalized entity
    mention, with its deterministic entity_id already computed, ready to be
    handed to the resolution engine."""
    entity_id: str
    entity_type: EntityType
    canonical_value: str          # normalized form, used for matching
    raw_value: str                # original mention, kept for display/audit
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: Evidence


# ---------------------------------------------------------------------------
# Resolution output — what gets published to `resolved_entities`
# ---------------------------------------------------------------------------

class ResolvedEntity(BaseModel):
    entity_id: str
    entity_type: EntityType
    canonical_name: str
    aliases: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    resolution_stage: ResolutionStage
    evidence_ids: list[str] = Field(default_factory=list)
    merged_from: list[str] = Field(default_factory=list)  # entity_ids absorbed
    needs_review: bool = False     # True for behavioral/network "candidate" merges
    resolved_at: float = Field(default_factory=time.time)


class MergeCandidate(BaseModel):
    """A *suggested*, not auto-applied, merge — output of Stage 3/4. These
    never mutate the registry directly; they land in an analyst review
    queue (or a future auto-merge policy gated by precision metrics)."""
    candidate_id: str = Field(default_factory=lambda: f"mc_{uuid.uuid4().hex}")
    entity_id_a: str
    entity_id_b: str
    stage: ResolutionStage
    similarity_score: float = Field(ge=0.0, le=1.0)
    rationale: str
    created_at: float = Field(default_factory=time.time)


# ---------------------------------------------------------------------------
# Relationship inference output
# ---------------------------------------------------------------------------

class Relationship(BaseModel):
    relationship_id: str = Field(default_factory=lambda: f"rel_{uuid.uuid4().hex}")
    source_entity_id: str
    target_entity_id: str
    relationship_type: RelationshipType
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_ids: list[str] = Field(default_factory=list)
    rule_name: str = "unknown"     # which inference rule produced this
    inferred_at: float = Field(default_factory=time.time)

    @field_validator("target_entity_id")
    @classmethod
    def no_self_loops_silently(cls, v: str, info) -> str:
        # Self-loops are allowed (e.g. OBSERVED_AT can legitimately repeat)
        # but this validator is the single place to add a policy later.
        return v


# ---------------------------------------------------------------------------
# Graph update envelope — the ONLY contract Neo4j ever consumes from.
# Per the architecture mandate: "Neo4j must NOT consume raw events."
# ---------------------------------------------------------------------------

class GraphUpdate(BaseModel):
    update_id: str = Field(default_factory=lambda: f"gu_{uuid.uuid4().hex}")
    operation: GraphUpdateOp
    entity: Optional[ResolvedEntity] = None
    relationship: Optional[Relationship] = None
    evidence: Optional[Evidence] = None
    target_entity_id: Optional[str] = None     # for ATTACH_EVIDENCE / UPDATE_CONFIDENCE
    target_relationship_id: Optional[str] = None
    merge_winner_id: Optional[str] = None       # for MERGE_ENTITY
    merge_loser_id: Optional[str] = None
    new_confidence: Optional[float] = None
    emitted_at: float = Field(default_factory=time.time)

    class Config:
        use_enum_values = True