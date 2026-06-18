"""
graph_engine.api.evidence_browser
====================================
The explainability surface. Every endpoint here answers a variant of
"why does this exist?" by walking the Assertion/Evidence reification
layer the writer maintains (see writer/graph_writer.py module docstring
for the two-layer edge model). This is what the Graph Visualizer's
"snapshot for evidence packages" requirement and the BNSS evidence-chain
requirement both depend on at the API level.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from graph_engine.api.entity_profile import get_neo4j_session

router = APIRouter(tags=["evidence-browser"])


@router.get("/relationships/{relationship_id}/evidence")
def get_relationship_evidence(relationship_id: str, session=Depends(get_neo4j_session)):
    """Every individual Assertion (one per inference event) that
    contributed to this relationship, each with its backing Evidence."""
    cypher = """
    MATCH (asrt:Assertion {relationship_id: $relationship_id})-[:BASED_ON]->(ev:Evidence)
    MATCH (asrt)-[:ABOUT_SOURCE]->(src:Entity)
    MATCH (asrt)-[:ABOUT_TARGET]->(tgt:Entity)
    RETURN asrt.relationship_type AS relationship_type, asrt.confidence AS confidence,
           asrt.rule_name AS rule_name, asrt.inferred_at AS inferred_at,
           src.entity_id AS source_entity_id, tgt.entity_id AS target_entity_id,
           ev.evidence_id AS evidence_id, ev.source AS source, ev.source_id AS source_id,
           ev.collector AS collector, ev.observed_at AS observed_at,
           ev.collected_at AS collected_at, ev.raw_ref AS raw_ref,
           ev.content_snippet AS content_snippet
    ORDER BY asrt.inferred_at DESC
    """
    rows = session.run(cypher, {"relationship_id": relationship_id}).data()
    if not rows:
        raise HTTPException(status_code=404, detail="No evidence found for this relationship_id")
    return {"relationship_id": relationship_id, "assertions": rows, "assertion_count": len(rows)}


@router.get("/entities/{entity_id}/evidence")
def get_entity_evidence(entity_id: str, session=Depends(get_neo4j_session)):
    """Direct evidence attached to the entity node itself (e.g. the
    extraction event(s) that first/repeatedly produced this entity),
    separate from relationship-level evidence."""
    cypher = """
    MATCH (n:Entity {entity_id: $entity_id})-[:HAS_EVIDENCE]->(ev:Evidence)
    RETURN ev.evidence_id AS evidence_id, ev.source AS source, ev.source_id AS source_id,
           ev.collector AS collector, ev.observed_at AS observed_at,
           ev.collected_at AS collected_at, ev.raw_ref AS raw_ref,
           ev.content_snippet AS content_snippet
    ORDER BY ev.observed_at DESC
    """
    rows = session.run(cypher, {"entity_id": entity_id}).data()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No evidence found for entity {entity_id}")
    return {"entity_id": entity_id, "evidence": rows, "evidence_count": len(rows)}


@router.get("/evidence/{evidence_id}/source")
def get_evidence_source(evidence_id: str, session=Depends(get_neo4j_session)):
    """The terminal hop: from an Evidence node back to its description of
    the original raw source event. `raw_ref` is a pointer (S3 key /
    MongoDB document id), NOT the full raw content — fetching the actual
    raw document is the caller's responsibility against the appropriate
    store (MongoDB per the architecture doc's database-ownership table),
    which this graph-engine API deliberately does not own."""
    cypher = """
    MATCH (ev:Evidence {evidence_id: $evidence_id})
    RETURN ev.evidence_id AS evidence_id, ev.source AS source, ev.source_id AS source_id,
           ev.collector AS collector, ev.observed_at AS observed_at,
           ev.collected_at AS collected_at, ev.raw_ref AS raw_ref,
           ev.content_snippet AS content_snippet, ev.created_at AS created_at
    """
    record = session.run(cypher, {"evidence_id": evidence_id}).single()
    if record is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")
    return dict(record)