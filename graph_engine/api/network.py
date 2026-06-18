"""
graph_engine.api.network
===========================
Surfaces the output of analytics/community_detection.py and
analytics/centrality.py through read endpoints. These read PERSISTED
properties (community_id, pagerank_score, etc.) written by the scheduled
batch jobs — this module never triggers a GDS run synchronously on a
request path, since community detection/centrality are explicitly
batch/nightly operations per the architecture doc.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from graph_engine.api.entity_profile import get_neo4j_session

router = APIRouter(tags=["network"])


@router.get("/entities/{entity_id}/community")
def get_entity_community(entity_id: str, session=Depends(get_neo4j_session)):
    record = session.run(
        "MATCH (n:Entity {entity_id: $entity_id}) "
        "RETURN n.community_id AS community_id, n.community_id_leiden AS community_id_leiden",
        {"entity_id": entity_id},
    ).single()
    if record is None:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
    if record["community_id"] is None and record["community_id_leiden"] is None:
        return {"entity_id": entity_id, "community_id": None, "detail": "No community detection run has covered this entity yet"}
    return dict(record) | {"entity_id": entity_id}


@router.get("/communities/{community_id}")
def get_community_members(
    community_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    session=Depends(get_neo4j_session),
):
    rows = session.run(
        """
        MATCH (n:Entity {community_id: $community_id})
        RETURN n.entity_id AS entity_id, n.entity_type AS entity_type,
               n.canonical_name AS canonical_name, n.risk_score AS risk_score,
               n.pagerank_score AS pagerank_score
        ORDER BY coalesce(n.risk_score, 0) DESC
        LIMIT $limit
        """,
        {"community_id": community_id, "limit": limit},
    ).data()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No members found for community {community_id}")
    return {"community_id": community_id, "members": rows, "member_count": len(rows)}


@router.get("/entities/{entity_id}/network")
def get_actor_network(
    entity_id: str,
    relationship_types: str = Query(
        default="MENTIONS,LINKED_TO,ASSOCIATED_WITH,OWNS,USES",
        description="Comma-separated relationship types to include",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    session=Depends(get_neo4j_session),
):
    """1-hop actor network filtered to a relationship-type allowlist —
    e.g. for the Specialist's 'actor network' exploration view, which
    typically wants to exclude noisy OBSERVED_AT edges."""
    types = [t.strip().upper() for t in relationship_types.split(",") if t.strip()]
    if not types:
        raise HTTPException(status_code=400, detail="relationship_types must contain at least one type")
    type_pattern = "|".join(types)
    cypher = f"""
    MATCH (n:Entity {{entity_id: $entity_id}})-[r:{type_pattern}]-(other:Entity)
    RETURN other.entity_id AS entity_id, other.entity_type AS entity_type,
           other.canonical_name AS canonical_name, type(r) AS relationship_type,
           r.weight AS weight, r.confidence AS confidence
    ORDER BY r.weight DESC
    LIMIT $limit
    """
    rows = session.run(cypher, {"entity_id": entity_id, "limit": limit}).data()
    return {"entity_id": entity_id, "relationship_types": types, "network": rows, "count": len(rows)}