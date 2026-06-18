"""
graph_engine.api.timeline
============================
Chronological views over the evidence/assertion trail — what the Entity
Profile's ActivityTimeline panel and investigation workflow's "what
happened, in what order" needs are built on. All three endpoints are
thin, paginated Cypher queries over Evidence/Assertion timestamps; no
graph algorithms here, just ordered retrieval.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from graph_engine.api.entity_profile import get_neo4j_session

router = APIRouter(tags=["timeline"])


@router.get("/entities/{entity_id}/timeline")
def get_entity_timeline(
    entity_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    before: float | None = Query(default=None, description="Unix timestamp cursor for pagination"),
    session=Depends(get_neo4j_session),
):
    cypher = """
    MATCH (n:Entity {entity_id: $entity_id})-[:HAS_EVIDENCE]->(ev:Evidence)
    WHERE $before IS NULL OR ev.observed_at < $before
    RETURN ev.evidence_id AS evidence_id, ev.source AS source, ev.source_id AS source_id,
           ev.observed_at AS observed_at, ev.content_snippet AS content_snippet
    ORDER BY ev.observed_at DESC
    LIMIT $limit
    """
    rows = session.run(cypher, {"entity_id": entity_id, "limit": limit, "before": before}).data()
    return {
        "entity_id": entity_id,
        "events": rows,
        "next_cursor": rows[-1]["observed_at"] if len(rows) == limit else None,
    }


@router.get("/relationships/{relationship_id}/timeline")
def get_relationship_timeline(
    relationship_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    session=Depends(get_neo4j_session),
):
    """Every Assertion event that reinforced this relationship, in time
    order — shows how/when the edge's weight and confidence accumulated."""
    cypher = """
    MATCH (asrt:Assertion {relationship_id: $relationship_id})
    RETURN asrt.inferred_at AS inferred_at, asrt.confidence AS confidence,
           asrt.rule_name AS rule_name, asrt.evidence_id AS evidence_id
    ORDER BY asrt.inferred_at DESC
    LIMIT $limit
    """
    rows = session.run(cypher, {"relationship_id": relationship_id, "limit": limit}).data()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No timeline found for relationship {relationship_id}")
    return {"relationship_id": relationship_id, "events": rows}


@router.get("/sources/{source}/timeline")
def get_source_timeline(
    source: str,
    limit: int = Query(default=100, ge=1, le=1000),
    before: float | None = Query(default=None),
    session=Depends(get_neo4j_session),
):
    """All evidence ingested from a given source platform (e.g.
    'telegram', 'newsapi') in time order — useful for crawler-health /
    source-reliability review, distinct from any single entity's view."""
    cypher = """
    MATCH (ev:Evidence {source: $source})
    WHERE $before IS NULL OR ev.observed_at < $before
    RETURN ev.evidence_id AS evidence_id, ev.source_id AS source_id,
           ev.observed_at AS observed_at, ev.collected_at AS collected_at,
           ev.content_snippet AS content_snippet
    ORDER BY ev.observed_at DESC
    LIMIT $limit
    """
    rows = session.run(cypher, {"source": source, "limit": limit, "before": before}).data()
    return {
        "source": source,
        "events": rows,
        "next_cursor": rows[-1]["observed_at"] if len(rows) == limit else None,
    }