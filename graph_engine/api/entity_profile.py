"""
graph_engine.api.entity_profile
==================================
1/2/3-hop entity profile traversal. Mirrors the architecture doc's
explicit SLA framing (3-hop < 5 sec) by enforcing a server-side node cap
and pushing hop-depth selection to the client rather than always
returning the maximum traversal — exactly the "incremental loading"
strategy the frontend section recommends (render 1-hop immediately, load
deeper hops on demand).

Returned shape is deliberately layout-free (no x/y coordinates) — the
architecture doc's frontend section calls out that the *backend* should
own graph layout pre-computation for the D3.js force simulation to hit
its render SLA. That's a separate concern from this endpoint (which
returns graph topology + properties); a layout pre-computation pass using
GDS's node embedding / FastRP + a force-directed layout library, or even
a simple per-request d3-force run server-side, belongs in front of this
endpoint's response on the way to the frontend, not inside it. Wiring
that in is a follow-up once the visualization team confirms which layout
algorithm they want — keeping it out of scope here avoids guessing.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

router = APIRouter(prefix="/entities", tags=["entity-profile"])

MAX_NODES_PER_RESPONSE = 500   # server-side cap per architecture doc's scalability guidance


def get_neo4j_session():
    """Dependency placeholder. Wire to your app's actual driver/session
    factory (e.g. `app.state.neo4j_driver.session(...)`). Kept abstract
    here so this router can be mounted into any FastAPI app without this
    module owning driver lifecycle/config."""
    raise NotImplementedError(
        "Override this dependency in your FastAPI app: "
        "app.dependency_overrides[get_neo4j_session] = your_session_factory"
    )


@router.get("/{entity_id}/profile")
def get_entity_profile(
    entity_id: str,
    hops: int = Query(default=1, ge=1, le=3, description="Traversal depth: 1, 2, or 3 hops"),
    session=Depends(get_neo4j_session),
):
    """Returns the entity itself, its profile properties, and its
    N-hop subgraph (nodes + relationships), capped at
    MAX_NODES_PER_RESPONSE. If the cap is hit, `truncated: true` is set so
    the frontend can show an explicit "showing N of M connections, refine
    your query" indicator rather than silently rendering a partial graph.
    """
    entity = _fetch_entity(session, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")

    nodes, edges, total_matched = _fetch_subgraph(session, entity_id, hops)

    return {
        "entity": entity,
        "hops": hops,
        "nodes": nodes,
        "relationships": edges,
        "node_count": len(nodes),
        "truncated": total_matched > len(nodes),
        "total_matched_before_cap": total_matched,
    }


def _fetch_entity(session, entity_id: str) -> Optional[dict]:
    cypher = """
    MATCH (n:Entity {entity_id: $entity_id})
    OPTIONAL MATCH (n)-[:HAS_EVIDENCE]->(ev:Evidence)
    RETURN n.entity_id AS entity_id, n.entity_type AS entity_type,
           n.canonical_name AS canonical_name, n.aliases AS aliases,
           n.confidence AS confidence, n.risk_score AS risk_score,
           n.first_seen AS first_seen, n.last_seen AS last_seen,
           count(ev) AS evidence_count
    """
    result = session.run(cypher, {"entity_id": entity_id})
    record = result.single()
    return dict(record) if record else None


def _fetch_subgraph(session, entity_id: str, hops: int) -> tuple[list[dict], list[dict], int]:
    # variable-length pattern depth is interpolated from a validated int
    # (Query(..., ge=1, le=3) above) — never from raw client text, so this
    # is not a Cypher-injection surface.
    cypher = f"""
    MATCH path = (start:Entity {{entity_id: $entity_id}})-[*1..{hops}]-(connected:Entity)
    WITH collect(DISTINCT connected) AS connected_nodes,
         collect(DISTINCT relationships(path)) AS rel_lists
    WITH connected_nodes, apoc.coll.flatten(rel_lists) AS all_rels
    RETURN connected_nodes, all_rels
    """
    try:
        record = session.run(cypher, {"entity_id": entity_id}).single()
    except Exception:
        # APOC-free fallback: fetch nodes and edges in two simpler queries.
        return _fetch_subgraph_no_apoc(session, entity_id, hops)

    if record is None:
        return [], [], 0

    raw_nodes = record["connected_nodes"] or []
    raw_rels = record["all_rels"] or []

    total_matched = len(raw_nodes)
    capped_nodes = raw_nodes[:MAX_NODES_PER_RESPONSE]
    capped_ids = {n["entity_id"] for n in capped_nodes}

    nodes = [_node_to_dict(n) for n in capped_nodes]
    edges = [
        _rel_to_dict(r) for r in raw_rels
        if r.start_node.get("entity_id") in capped_ids and r.end_node.get("entity_id") in capped_ids
    ]
    return nodes, edges, total_matched


def _fetch_subgraph_no_apoc(session, entity_id: str, hops: int) -> tuple[list[dict], list[dict], int]:
    nodes_cypher = f"""
    MATCH (start:Entity {{entity_id: $entity_id}})-[*1..{hops}]-(connected:Entity)
    RETURN DISTINCT connected
    LIMIT {MAX_NODES_PER_RESPONSE + 1}
    """
    node_rows = session.run(nodes_cypher, {"entity_id": entity_id}).data()
    total_matched = len(node_rows)
    capped = node_rows[:MAX_NODES_PER_RESPONSE]
    nodes = [_node_to_dict(r["connected"]) for r in capped]
    capped_ids = {n["entity_id"] for n in nodes} | {entity_id}

    edges_cypher = """
    MATCH (a:Entity)-[r]->(b:Entity)
    WHERE a.entity_id IN $ids AND b.entity_id IN $ids
    RETURN r, a.entity_id AS src, b.entity_id AS tgt, type(r) AS rel_type
    """
    edge_rows = session.run(edges_cypher, {"ids": list(capped_ids)}).data()
    edges = [
        {
            "source": row["src"], "target": row["tgt"], "type": row["rel_type"],
            "weight": row["r"].get("weight"), "confidence": row["r"].get("confidence"),
            "first_seen": row["r"].get("first_seen"), "last_seen": row["r"].get("last_seen"),
            "evidence_count": row["r"].get("evidence_count"),
        }
        for row in edge_rows
    ]
    return nodes, edges, total_matched


def _node_to_dict(node) -> dict:
    return {
        "entity_id": node.get("entity_id"),
        "entity_type": node.get("entity_type"),
        "canonical_name": node.get("canonical_name"),
        "confidence": node.get("confidence"),
        "risk_score": node.get("risk_score"),
    }


def _rel_to_dict(rel) -> dict:
    return {
        "source": rel.start_node.get("entity_id"),
        "target": rel.end_node.get("entity_id"),
        "type": rel.type,
        "weight": rel.get("weight"),
        "confidence": rel.get("confidence"),
        "first_seen": rel.get("first_seen"),
        "last_seen": rel.get("last_seen"),
        "evidence_count": rel.get("evidence_count"),
    }