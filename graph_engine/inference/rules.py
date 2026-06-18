"""
graph_engine.inference.rules
==============================
Phase 3 — Relationship Inference.

Input to this stage is the full set of ResolvedEntity objects extracted
from ONE source event (i.e. everything `entities`/`resolved_entities`
contained for a single source_id), plus the event's own metadata (source,
author/account if known, published_at). Output is zero or more
Relationship objects, each carrying its own evidence_ids.

Design: extensible rule registry
---------------------------------
Each rule is a small, independently testable function:

    def rule(context: InferenceContext) -> list[Relationship]

registered into `DEFAULT_RULES`. Adding a new relationship heuristic means
writing one function and appending it to the list — nothing else in the
pipeline changes. This mirrors the "rule engine must be extensible"
requirement directly rather than hardcoding a monolithic inference method.

Every rule MUST:
  - only emit a Relationship if it has >=1 evidence_id backing it (the
    InferenceContext's evidence_id is always attached automatically by
    `_emit`, so rules never have to remember to do this themselves)
  - assign a confidence reflecting how strong the heuristic is — these are
    deliberately conservative; calibration against analyst feedback is a
    Phase 2 operational task per the architecture doc, not something to
    fake at this layer.

Relationship semantics implemented
------------------------------------
MENTIONS         : the publishing account/source MENTIONS any other
                    extracted entity in the same event (the weakest,
                    broadest relationship — "this name appeared in this
                    post").
POSTED            : the publishing account/source POSTED the event itself,
                    represented as a relationship to a synthetic per-event
                    "content" anchor entity is avoided here — POSTED is
                    instead emitted source -> (domain/url) when the post
                    body contains a URL/domain, modeling "this account
                    posted a link to this domain."
LINKED_TO         : generic fallback co-occurrence between two non-source
                    entities in the same event when no more specific rule
                    fires (e.g. a person mentioned alongside a domain with
                    no clearer semantic).
OWNS              : an account/person co-occurring with a UPI/bank/crypto/
                    email/phone identifier IN A STRUCTURAL POSITION
                    suggesting control (currently: extracted from a known
                    "profile"/"contact info" style source, or when the
                    identifier and the source account appear together
                    across >=2 independent source events — single-event
                    co-occurrence alone is NOT sufficient evidence of
                    ownership and is intentionally under-triggered here).
ASSOCIATED_WITH   : person <-> organization co-occurrence.
LOCATED_AT        : person/organization <-> location co-occurrence.
OBSERVED_AT       : any entity <-> the event's location/timestamp context,
                    used for temporal/geo analytics rather than identity.
PUBLISHED         : source -> the event's own identity (modeled via the
                    source entity and the event's source_id/evidence,
                    primarily useful for timeline.py's "source timeline").
TARGETS           : entity co-occurring with location/organization when
                    the event content matches a threat-keyword heuristic
                    (kept intentionally simple/explainable; real
                    implementation should be a pluggable keyword/model
                    hook, not hardcoded NLP — see `targets_keyword_hook`).
USES              : person/organization <-> domain/url/crypto_wallet when
                    the event implies tooling/infrastructure usage.
HOSTS             : domain <-> ip co-occurrence in the same event.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Optional

from graph_engine.models import Evidence, Relationship, RelationshipType, ResolvedEntity, EntityType


@dataclass
class InferenceContext:
    """Everything one rule needs to see for a single source event."""
    source: str
    source_id: str
    source_entity: Optional[ResolvedEntity]   # the publishing account, if resolved as one
    entities: list[ResolvedEntity]             # all entities resolved from this event
    evidence: Evidence                         # the evidence record for this event
    content: Optional[str] = None              # raw text, if available, for keyword hooks
    metadata: dict = field(default_factory=dict)
    # Cross-event corroboration count keyed by (entity_id_a, entity_id_b) ->
    # number of distinct prior source events where both co-occurred. Used
    # by the OWNS rule's "seen together >=2 times" heuristic. Populated by
    # the caller from a small Redis counter (see faust_app.py); defaults to
    # empty, meaning OWNS will simply never fire until that counter exists.
    co_occurrence_counts: dict[tuple[str, str], int] = field(default_factory=dict)

    def by_type(self, *types: EntityType) -> list[ResolvedEntity]:
        return [e for e in self.entities if e.entity_type in types]


RuleFn = Callable[[InferenceContext], list[Relationship]]


def _emit(
    ctx: InferenceContext,
    source_entity_id: str,
    target_entity_id: str,
    rel_type: RelationshipType,
    confidence: float,
    rule_name: str,
) -> Relationship:
    return Relationship(
        source_entity_id=source_entity_id,
        target_entity_id=target_entity_id,
        relationship_type=rel_type,
        confidence=confidence,
        evidence_ids=[ctx.evidence.evidence_id],
        rule_name=rule_name,
    )


# ---------------------------------------------------------------------------
# Individual rules
# ---------------------------------------------------------------------------

def rule_mentions(ctx: InferenceContext) -> list[Relationship]:
    """SOURCE -[:MENTIONS]-> every other entity in the event."""
    if ctx.source_entity is None:
        return []
    out = []
    for e in ctx.entities:
        if e.entity_id == ctx.source_entity.entity_id:
            continue
        out.append(_emit(ctx, ctx.source_entity.entity_id, e.entity_id,
                          RelationshipType.MENTIONS, confidence=0.85, rule_name="rule_mentions"))
    return out


def rule_posted_link(ctx: InferenceContext) -> list[Relationship]:
    """SOURCE -[:POSTED]-> domain/url entities present in the same event."""
    if ctx.source_entity is None:
        return []
    out = []
    for e in ctx.by_type(EntityType.DOMAIN, EntityType.URL):
        out.append(_emit(ctx, ctx.source_entity.entity_id, e.entity_id,
                          RelationshipType.POSTED, confidence=0.9, rule_name="rule_posted_link"))
    return out


def rule_hosts(ctx: InferenceContext) -> list[Relationship]:
    """domain -[:HOSTS]- ip when both appear in the same event (direction:
    domain -> ip, "this domain resolves to / is hosted at this IP")."""
    domains = ctx.by_type(EntityType.DOMAIN)
    ips = ctx.by_type(EntityType.IP)
    out = []
    for d in domains:
        for ip in ips:
            out.append(_emit(ctx, d.entity_id, ip.entity_id,
                              RelationshipType.HOSTS, confidence=0.6, rule_name="rule_hosts"))
    return out


def rule_located_at(ctx: InferenceContext) -> list[Relationship]:
    """person/organization -[:LOCATED_AT]-> location."""
    subjects = ctx.by_type(EntityType.PERSON, EntityType.ORGANIZATION)
    locations = ctx.by_type(EntityType.LOCATION)
    out = []
    for s in subjects:
        for loc in locations:
            out.append(_emit(ctx, s.entity_id, loc.entity_id,
                              RelationshipType.LOCATED_AT, confidence=0.55, rule_name="rule_located_at"))
    return out


def rule_associated_with(ctx: InferenceContext) -> list[Relationship]:
    """person -[:ASSOCIATED_WITH]- organization co-occurrence."""
    persons = ctx.by_type(EntityType.PERSON)
    orgs = ctx.by_type(EntityType.ORGANIZATION)
    out = []
    for p in persons:
        for o in orgs:
            out.append(_emit(ctx, p.entity_id, o.entity_id,
                              RelationshipType.ASSOCIATED_WITH, confidence=0.5,
                              rule_name="rule_associated_with"))
    return out


def rule_observed_at(ctx: InferenceContext) -> list[Relationship]:
    """Every entity -[:OBSERVED_AT]-> the event's location, if present in
    metadata (distinct from LOCATED_AT, which models semantic residence/
    affiliation; OBSERVED_AT models "this entity surfaced in an event
    geolocated here," which matters for temporal_correlation analytics)."""
    loc_value = ctx.metadata.get("location")
    if not loc_value:
        return []
    # OBSERVED_AT targets a location *value*, not necessarily a resolved
    # LOCATION entity already in ctx.entities — if the event metadata carries
    # a raw geocode string, the caller is expected to have canonicalized and
    # resolved it before building the context. If not present among
    # ctx.entities, we skip rather than synthesize an unresolved target id.
    location_entities = ctx.by_type(EntityType.LOCATION)
    if not location_entities:
        return []
    out = []
    for e in ctx.entities:
        for loc in location_entities:
            if e.entity_id == loc.entity_id:
                continue
            out.append(_emit(ctx, e.entity_id, loc.entity_id,
                              RelationshipType.OBSERVED_AT, confidence=0.4,
                              rule_name="rule_observed_at"))
    return out


def rule_uses(ctx: InferenceContext) -> list[Relationship]:
    """person/organization -[:USES]-> domain/url/crypto_wallet, when the
    content suggests tool/infrastructure usage (kept simple/explainable:
    triggers on co-occurrence with an organization, since person<->domain
    is already partially covered by POSTED for the publishing account)."""
    orgs = ctx.by_type(EntityType.ORGANIZATION)
    infra = ctx.by_type(EntityType.DOMAIN, EntityType.URL, EntityType.CRYPTO_WALLET)
    out = []
    for o in orgs:
        for i in infra:
            out.append(_emit(ctx, o.entity_id, i.entity_id,
                              RelationshipType.USES, confidence=0.45, rule_name="rule_uses"))
    return out


# Pluggable keyword hook for TARGETS — kept as a simple, explainable,
# swappable function rather than baking in an NLP model at this layer.
# Replace with a call to the propaganda/threat classifier's output if/when
# that model's verdict is available in ctx.metadata.
DEFAULT_THREAT_KEYWORDS = re.compile(
    r"\b(attack|threat|target|strike|breach|exploit|compromise)\b", re.IGNORECASE
)


def rule_targets(ctx: InferenceContext) -> list[Relationship]:
    """entity -[:TARGETS]-> organization/location, gated on a threat
    keyword appearing in the raw content. Confidence is intentionally low
    — this is a coarse keyword heuristic, not a validated classifier, and
    per the AI risks noted in the architecture doc, keyword-only threat
    detection should never alone drive a high-priority alert."""
    if not ctx.content or not DEFAULT_THREAT_KEYWORDS.search(ctx.content):
        return []
    actors = ctx.by_type(EntityType.PERSON, EntityType.ORGANIZATION)
    objects = ctx.by_type(EntityType.ORGANIZATION, EntityType.LOCATION)
    out = []
    for a in actors:
        for o in objects:
            if a.entity_id == o.entity_id:
                continue
            out.append(_emit(ctx, a.entity_id, o.entity_id,
                              RelationshipType.TARGETS, confidence=0.3, rule_name="rule_targets"))
    return out


def rule_owns(ctx: InferenceContext) -> list[Relationship]:
    """SOURCE -[:OWNS]-> upi/bank_account/crypto_wallet/email/phone —
    gated on cross-event corroboration (seen together in >=2 distinct
    source events), per the module docstring. A single co-occurrence in
    one post is treated as MENTIONS, not ownership; OWNS is a much
    stronger, auditable claim and false positives here directly damage
    evidence-package integrity."""
    if ctx.source_entity is None:
        return []
    identifiers = ctx.by_type(
        EntityType.UPI, EntityType.BANK_ACCOUNT, EntityType.CRYPTO_WALLET,
        EntityType.EMAIL, EntityType.PHONE,
    )
    out = []
    for ident in identifiers:
        key = tuple(sorted((ctx.source_entity.entity_id, ident.entity_id)))
        if ctx.co_occurrence_counts.get(key, 0) >= 2:
            out.append(_emit(ctx, ctx.source_entity.entity_id, ident.entity_id,
                              RelationshipType.OWNS, confidence=0.75, rule_name="rule_owns"))
    return out


def rule_published(ctx: InferenceContext) -> list[Relationship]:
    """SOURCE -[:PUBLISHED]-> SOURCE (self-referential timeline anchor) is
    avoided; instead PUBLISHED is emitted source -> every entity type
    SOURCE itself, when the event explicitly represents a publication
    object distinct from the account (e.g. NewsAPI articles where 'source'
    is the outlet and the article itself is treated as carrying entities).
    For sources where no distinct publication entity exists, this rule is
    a no-op by design — POSTED + MENTIONS already cover the relationship
    surface for social-style sources."""
    return []  # Explicit no-op placeholder; see docstring. Extension point.


DEFAULT_RULES: list[RuleFn] = [
    rule_mentions,
    rule_posted_link,
    rule_hosts,
    rule_located_at,
    rule_associated_with,
    rule_observed_at,
    rule_uses,
    rule_targets,
    rule_owns,
    rule_published,
]


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class RelationshipInferenceEngine:
    """Runs every registered rule against a context and deduplicates the
    output. Extensible: pass a custom `rules` list to add/replace rules
    without modifying this class."""

    def __init__(self, rules: Optional[list[RuleFn]] = None) -> None:
        self.rules = rules if rules is not None else list(DEFAULT_RULES)

    def register_rule(self, rule: RuleFn) -> None:
        self.rules.append(rule)

    def infer(self, ctx: InferenceContext) -> list[Relationship]:
        results: list[Relationship] = []
        seen: set[tuple[str, str, str]] = set()
        for rule in self.rules:
            for rel in rule(ctx):
                dedup_key = (rel.source_entity_id, rel.target_entity_id, rel.relationship_type.value)
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)
                results.append(rel)
        return results