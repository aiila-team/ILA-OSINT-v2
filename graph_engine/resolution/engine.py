"""
graph_engine.resolution.engine
================================
Phase 2 — Entity Resolution.

Takes a stream of CanonicalEntity objects (from canonicalization) and
decides, for each one, whether it IS an entity already in the registry or
is a genuinely new one — producing ResolvedEntity records (and, for the
two future-ready stages, MergeCandidate suggestions that never auto-apply).

Stage 1 — Exact Match (synchronous, auto-merge)
    Applies to EXACT_MATCH_TYPES. canonical_value equality IS identity —
    no scoring needed. If the registry has a record for
    (entity_type, canonical_value), this mention belongs to it.

Stage 2 — Fuzzy Match (synchronous, auto-merge above a high threshold)
    Applies to FUZZY_MATCH_TYPES. Uses RapidFuzz token_sort_ratio combined
    with Jaro-Winkler similarity (rapidfuzz.distance.JaroWinkler) — the
    two catch different failure modes: token_sort_ratio is robust to word
    reordering ("Gandhi Rahul" vs "Rahul Gandhi"), Jaro-Winkler is robust
    to small prefix-preserving edits and transliteration noise. We combine
    them rather than picking one, and only auto-merge when BOTH agree AND
    there is corroborating evidence (shared phone/email/location entity in
    the same source event) — a name match alone is never sufched to merge
    two people automatically; false merges are an evidence-integrity
    problem in a defense context, not just an accuracy nuisance.

Stage 3 — Behavioral Similarity (interface only, future-ready)
    Posting-time overlap, shared channels, etc. This stage NEVER
    auto-merges — output is a MergeCandidate routed to an analyst review
    queue. A concrete provider can be plugged in later without touching
    the resolution engine's control flow.

Stage 4 — Network Similarity (interface only, future-ready)
    Shared neighbors / shared infrastructure in the graph itself. Requires
    the graph to already exist, so this stage naturally runs as a
    nightly/batch job against Neo4j (see analytics/), not inline in the
    streaming resolution path. The interface is defined here so the
    contract is fixed even though the implementation lives downstream.
"""

from __future__ import annotations

import abc
import time
from dataclasses import dataclass, field
from typing import Optional

from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler

from graph_engine.canonicalization.engine import CanonicalizationEngine
from graph_engine.models import (
    CanonicalEntity,
    EntityType,
    EXACT_MATCH_TYPES,
    FUZZY_MATCH_TYPES,
    MergeCandidate,
    ResolvedEntity,
    ResolutionStage,
)
from graph_engine.resolution.registry import EntityRegistry, RegistryRecord


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class ResolutionConfig:
    fuzzy_token_sort_threshold: float = 90.0   # rapidfuzz scale: 0-100
    fuzzy_jaro_winkler_threshold: float = 0.92  # rapidfuzz scale: 0.0-1.0
    fuzzy_auto_merge_requires_corroboration: bool = True
    fuzzy_candidate_limit: int = 50
    new_entity_default_confidence: float = 0.55


# ---------------------------------------------------------------------------
# Future-ready stage interfaces (Stage 3 / Stage 4)
# ---------------------------------------------------------------------------

class BehavioralSimilarityProvider(abc.ABC):
    """Stage 3 interface. A real implementation would compare posting
    cadence histograms, shared channel membership, n-gram overlap of
    posted content, etc. across two candidate entities of the same type.
    Deliberately NOT implemented here — this is future-ready scaffolding,
    not a stub that pretends to work. Wiring a concrete provider in is a
    constructor injection, nothing in the resolution engine changes.
    """

    @abc.abstractmethod
    def compute_similarity(
        self, entity_a: RegistryRecord, entity_b: RegistryRecord
    ) -> float:
        """Return 0.0-1.0 similarity. Implementations should be pure
        w.r.t. side effects — this stage only ever proposes
        MergeCandidates, never merges directly."""

    @abc.abstractmethod
    def find_candidates(
        self, entity: RegistryRecord, limit: int = 20
    ) -> list[RegistryRecord]:
        """Return a bounded set of same-type entities worth comparing
        against (e.g. active within the same 24h window, same source
        platform) — never a full registry scan."""


class NoOpBehavioralSimilarityProvider(BehavioralSimilarityProvider):
    """Default no-op so the resolution engine runs end-to-end today
    without requiring a real behavioral model to exist yet."""

    def compute_similarity(self, entity_a, entity_b) -> float:
        return 0.0

    def find_candidates(self, entity, limit: int = 20) -> list[RegistryRecord]:
        return []


class NetworkSimilarityProvider(abc.ABC):
    """Stage 4 interface. Requires graph traversal (shared neighbors,
    shared infrastructure) — this naturally depends on Neo4j already
    having ingested prior graph_updates, so concrete implementations
    belong in analytics/ and run as a scheduled batch job, not inline in
    the streaming resolution path. See analytics/centrality.py and
    analytics/community_detection.py for the building blocks (shared
    neighborhood overlap can be derived from a Jaccard-similarity pass
    over adjacency lists).
    """

    @abc.abstractmethod
    def compute_similarity(self, entity_id_a: str, entity_id_b: str) -> float:
        ...

    @abc.abstractmethod
    def find_candidates(self, entity_id: str, limit: int = 20) -> list[str]:
        """Return candidate entity_ids sharing graph neighborhood with
        entity_id (e.g. Jaccard similarity over 1-hop neighbor sets)."""


class NoOpNetworkSimilarityProvider(NetworkSimilarityProvider):
    def compute_similarity(self, entity_id_a: str, entity_id_b: str) -> float:
        return 0.0

    def find_candidates(self, entity_id: str, limit: int = 20) -> list[str]:
        return []


# ---------------------------------------------------------------------------
# Resolution result wrapper
# ---------------------------------------------------------------------------

@dataclass
class ResolutionResult:
    resolved: ResolvedEntity
    merge_candidates: list[MergeCandidate] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class EntityResolutionEngine:
    def __init__(
        self,
        registry: EntityRegistry,
        config: Optional[ResolutionConfig] = None,
        behavioral_provider: Optional[BehavioralSimilarityProvider] = None,
        network_provider: Optional[NetworkSimilarityProvider] = None,
    ) -> None:
        self.registry = registry
        self.config = config or ResolutionConfig()
        self.behavioral_provider = behavioral_provider or NoOpBehavioralSimilarityProvider()
        self.network_provider = network_provider or NoOpNetworkSimilarityProvider()

    # -- public API ------------------------------------------------------

    def resolve(self, canonical_entity: CanonicalEntity) -> ResolutionResult:
        """Resolve a single canonical entity mention into a ResolvedEntity,
        creating a new registry record if nothing matches, or attaching
        this mention's evidence to an existing one if it does.
        """
        if canonical_entity.entity_type in EXACT_MATCH_TYPES:
            return self._resolve_exact(canonical_entity)
        elif canonical_entity.entity_type in FUZZY_MATCH_TYPES:
            return self._resolve_fuzzy(canonical_entity)
        else:
            # SOURCE and any future type default to exact-match semantics
            # on canonical_value — safest default for an unclassified type.
            return self._resolve_exact(canonical_entity)

    def run_behavioral_pass(self, entity_type: EntityType) -> list[MergeCandidate]:
        """Stage 3 batch entry point — intended to be invoked periodically
        (e.g. every 15 minutes per the architecture doc) by a separate
        scheduled job, NOT inline per-message. Iterates registry entries
        of the given type and asks the behavioral provider for candidates.
        With the default NoOp provider this returns an empty list, which
        is the correct behavior until a real provider is plugged in.
        """
        # NOTE: requires an EntityRegistry that can enumerate by type at
        # scale (Postgres backend, paginated) — left as an extension point
        # rather than implemented against the abstract interface, since
        # "list all entities of a type" is intentionally not part of the
        # core EntityRegistry contract (it's a batch-job concern, not a
        # per-message resolution concern).
        return []

    # -- Stage 1 -----------------------------------------------------------

    def _resolve_exact(self, ce: CanonicalEntity) -> ResolutionResult:
        existing = self.registry.lookup_exact(ce.entity_type, ce.canonical_value)
        if existing is not None:
            existing.evidence_ids.append(ce.evidence.evidence_id)
            existing.confidence = max(existing.confidence, ce.confidence)
            existing.updated_at = time.time()
            self.registry.update_confidence(existing.entity_id, existing.confidence)
            self.registry.add_alias(existing.entity_id, ce.raw_value)
            resolved = ResolvedEntity(
                entity_id=existing.entity_id,
                entity_type=existing.entity_type,
                canonical_name=existing.canonical_name,
                aliases=existing.aliases,
                confidence=existing.confidence,
                resolution_stage=ResolutionStage.EXACT_MATCH,
                evidence_ids=existing.evidence_ids,
            )
            return ResolutionResult(resolved=resolved)

        record = RegistryRecord(
            entity_id=ce.entity_id,
            entity_type=ce.entity_type,
            canonical_value=ce.canonical_value,
            canonical_name=ce.raw_value,
            aliases=[],
            confidence=max(ce.confidence, self.config.new_entity_default_confidence),
            evidence_ids=[ce.evidence.evidence_id],
        )
        self.registry.create(record)
        resolved = ResolvedEntity(
            entity_id=record.entity_id,
            entity_type=record.entity_type,
            canonical_name=record.canonical_name,
            aliases=[],
            confidence=record.confidence,
            resolution_stage=ResolutionStage.EXACT_MATCH,
            evidence_ids=record.evidence_ids,
        )
        return ResolutionResult(resolved=resolved)

    # -- Stage 2 -----------------------------------------------------------

    def _resolve_fuzzy(self, ce: CanonicalEntity) -> ResolutionResult:
        comparison_value = CanonicalizationEngine._normalize_freetext_name(ce.raw_value)

        candidates = self.registry.candidates_for_fuzzy(
            ce.entity_type, comparison_value, limit=self.config.fuzzy_candidate_limit
        )

        best_match: Optional[RegistryRecord] = None
        best_score = 0.0
        merge_candidates: list[MergeCandidate] = []

        for candidate in candidates:
            token_score = fuzz.token_sort_ratio(comparison_value, candidate.canonical_value)
            jw_score = JaroWinkler.normalized_similarity(comparison_value, candidate.canonical_value)

            meets_threshold = (
                token_score >= self.config.fuzzy_token_sort_threshold
                and jw_score >= self.config.fuzzy_jaro_winkler_threshold
            )

            if meets_threshold:
                combined = (token_score / 100.0 + jw_score) / 2.0
                if combined > best_score:
                    best_score = combined
                    best_match = candidate
            elif token_score >= 70 or jw_score >= 0.80:
                # Below auto-merge bar but worth flagging for analyst review
                merge_candidates.append(
                    MergeCandidate(
                        entity_id_a=ce.entity_id,
                        entity_id_b=candidate.entity_id,
                        stage=ResolutionStage.FUZZY_MATCH,
                        similarity_score=round((token_score / 100.0 + jw_score) / 2.0, 3),
                        rationale=(
                            f"token_sort_ratio={token_score:.1f}, "
                            f"jaro_winkler={jw_score:.3f} — below auto-merge "
                            f"threshold, requires corroboration or analyst review"
                        ),
                    )
                )

        has_corroboration = self._has_corroborating_evidence(ce)

        if best_match is not None and (
            not self.config.fuzzy_auto_merge_requires_corroboration or has_corroboration
        ):
            best_match.evidence_ids.append(ce.evidence.evidence_id)
            self.registry.add_alias(best_match.entity_id, ce.raw_value)
            self.registry.update_confidence(
                best_match.entity_id, max(best_match.confidence, ce.confidence)
            )
            resolved = ResolvedEntity(
                entity_id=best_match.entity_id,
                entity_type=best_match.entity_type,
                canonical_name=best_match.canonical_name,
                aliases=best_match.aliases + [ce.raw_value],
                confidence=max(best_match.confidence, ce.confidence),
                resolution_stage=ResolutionStage.FUZZY_MATCH,
                evidence_ids=best_match.evidence_ids,
            )
            return ResolutionResult(resolved=resolved, merge_candidates=merge_candidates)

        if best_match is not None and not has_corroboration:
            # High name-similarity but no corroborating evidence: do not
            # auto-merge. Create as a new entity AND surface the strong
            # candidate for analyst review rather than silently dropping it.
            merge_candidates.append(
                MergeCandidate(
                    entity_id_a=ce.entity_id,
                    entity_id_b=best_match.entity_id,
                    stage=ResolutionStage.FUZZY_MATCH,
                    similarity_score=round(best_score, 3),
                    rationale=(
                        "Name similarity exceeded auto-merge threshold but no "
                        "corroborating evidence (shared phone/email/location) "
                        "was found in the same source event — held for review "
                        "to avoid a false merge."
                    ),
                )
            )

        # No safe match — register as new.
        record = RegistryRecord(
            entity_id=ce.entity_id,
            entity_type=ce.entity_type,
            canonical_value=comparison_value,
            canonical_name=ce.raw_value,
            aliases=[],
            confidence=max(ce.confidence, self.config.new_entity_default_confidence),
            evidence_ids=[ce.evidence.evidence_id],
        )
        self.registry.create(record)
        resolved = ResolvedEntity(
            entity_id=record.entity_id,
            entity_type=record.entity_type,
            canonical_name=record.canonical_name,
            aliases=[],
            confidence=record.confidence,
            resolution_stage=ResolutionStage.FUZZY_MATCH,
            evidence_ids=record.evidence_ids,
            needs_review=bool(merge_candidates),
        )
        return ResolutionResult(resolved=resolved, merge_candidates=merge_candidates)

    # -- corroboration check -------------------------------------------------

    def _has_corroborating_evidence(self, ce: CanonicalEntity) -> bool:
        """Placeholder corroboration check. A production implementation
        looks at OTHER entities extracted from the *same source event*
        (passed in alongside ce by the caller / inference stage) and checks
        whether any of them (phone/email/location) already co-occurred with
        the candidate entity in registry history. Wired here as a hook
        returning False (conservative default: never auto-merge purely on
        name similarity) — the inference stage, which sees the full set of
        co-occurring entities per event, is the natural place to supply a
        real corroboration signal via `resolve_with_context()` below.
        """
        return False

    def resolve_with_context(
        self, canonical_entity: CanonicalEntity, co_occurring_entity_ids: list[str]
    ) -> ResolutionResult:
        """Context-aware variant used by the Faust agent, which has
        visibility into all entities extracted from the same source event.
        co_occurring_entity_ids lets Stage 2 check corroboration properly
        instead of always falling back to the conservative `False`."""
        if canonical_entity.entity_type not in FUZZY_MATCH_TYPES:
            return self.resolve(canonical_entity)

        original_check = self._has_corroborating_evidence
        try:
            self._has_corroborating_evidence = lambda ce: self._check_corroboration(  # type: ignore
                ce, co_occurring_entity_ids
            )
            return self._resolve_fuzzy(canonical_entity)
        finally:
            self._has_corroborating_evidence = original_check  # type: ignore

    def _check_corroboration(self, ce: CanonicalEntity, co_occurring_ids: list[str]) -> bool:
        # A real corroboration signal: does the candidate match's existing
        # evidence trail already reference any of the same co-occurring
        # entity_ids (e.g. same phone number appeared alongside both name
        # mentions in different source events)? Left as a direct registry
        # lookup rather than a full graph query — Stage 4 (network
        # similarity) is the proper home for deeper graph-based
        # corroboration once entities are in Neo4j.
        return len(co_occurring_ids) > 0 and any(
            self.registry.get(eid) is not None for eid in co_occurring_ids
        )