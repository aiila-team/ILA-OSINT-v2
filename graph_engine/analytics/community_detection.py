"""
graph_engine.analytics.community_detection
=============================================
Runs on Neo4j Graph Data Science (GDS) — these are batch/nightly
operations against an in-memory GDS graph projection, never against the
live OLTP graph directly, per the architecture doc's explicit guidance
("run overnight, not on the live OLTP cluster").

Pattern for every analytics module in this package:
  1. project a named in-memory graph (`gds.graph.project`) scoped to the
     relevant node labels/relationship types
  2. run the algorithm against the projection
  3. write results back as node properties (`...WriteProperty` variants)
     OR stream them back to the caller for the caller to persist/return
  4. drop the projection

This module exposes both a write-back path (for scheduled jobs that
should persist community membership onto the graph) and a stream path
(for on-demand API use, e.g. network.py wanting an ad-hoc community
computation for a specific subgraph without touching the persisted
property).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger("graph_engine.analytics.community_detection")

DEFAULT_PROJECTION_NAME = "ila_community_projection"


@dataclass
class CommunityDetectionConfig:
    relationship_types: tuple[str, ...] = (
        "MENTIONS", "LINKED_TO", "ASSOCIATED_WITH", "OWNS", "USES",
    )
    min_community_size: int = 3       # below this, treat as noise, not a "cluster"
    leiden_gamma: float = 1.0         # resolution parameter; higher = smaller communities


class CommunityDetectionEngine:
    """Wraps a `neo4j.Driver`. All methods are synchronous for clarity —
    in production this runs as a scheduled batch job (Celery beat / Dagster
    schedule / cron), not inline on a request path, so sync execution is
    appropriate and simpler to reason about for a job that's allowed to
    take minutes."""

    def __init__(self, driver, database: str = "neo4j", config: CommunityDetectionConfig | None = None) -> None:
        self.driver = driver
        self.database = database
        self.config = config or CommunityDetectionConfig()

    def _project(self, projection_name: str) -> None:
        rel_filter = "{" + ", ".join(
            f'{rt}: {{orientation: "UNDIRECTED"}}' for rt in self.config.relationship_types
        ) + "}"
        cypher = f"""
        CALL gds.graph.project(
            $projection_name,
            'Entity',
            {rel_filter},
            {{relationshipProperties: 'weight'}}
        )
        """
        self._run(cypher, {"projection_name": projection_name})

    def _drop_projection(self, projection_name: str) -> None:
        self._run(
            "CALL gds.graph.drop($projection_name, false)",
            {"projection_name": projection_name},
        )

    # -- Louvain --------------------------------------------------------

    def run_louvain(self, write_back: bool = True, projection_name: str = DEFAULT_PROJECTION_NAME) -> list[dict]:
        """Detects communities (fraud rings, bot clusters, coordinated
        networks per the architecture doc). Louvain is fast and a good
        default; use run_leiden for better-quality partitions on large
        graphs where Louvain's resolution-limit artifacts matter."""
        self._project(projection_name)
        try:
            if write_back:
                self._run(
                    """
                    CALL gds.louvain.write($projection_name, {
                        writeProperty: 'community_id',
                        relationshipWeightProperty: 'weight'
                    })
                    YIELD communityCount, modularity
                    """,
                    {"projection_name": projection_name},
                )
                return self._summarize_communities("community_id")
            else:
                rows = self._run(
                    """
                    CALL gds.louvain.stream($projection_name, {relationshipWeightProperty: 'weight'})
                    YIELD nodeId, communityId
                    RETURN gds.util.asNode(nodeId).entity_id AS entity_id, communityId
                    """,
                    {"projection_name": projection_name},
                )
                return self._group_by_community(rows)
        finally:
            self._drop_projection(projection_name)

    # -- Leiden -----------------------------------------------------------

    def run_leiden(self, write_back: bool = True, projection_name: str = DEFAULT_PROJECTION_NAME) -> list[dict]:
        """Leiden generally produces better-connected communities than
        Louvain at the cost of more compute — recommended for the
        periodic deep analysis pass rather than every nightly run."""
        self._project(projection_name)
        try:
            if write_back:
                self._run(
                    """
                    CALL gds.leiden.write($projection_name, {
                        writeProperty: 'community_id_leiden',
                        relationshipWeightProperty: 'weight',
                        gamma: $gamma
                    })
                    YIELD communityCount, modularity
                    """,
                    {"projection_name": projection_name, "gamma": self.config.leiden_gamma},
                )
                return self._summarize_communities("community_id_leiden")
            else:
                rows = self._run(
                    """
                    CALL gds.leiden.stream($projection_name, {
                        relationshipWeightProperty: 'weight', gamma: $gamma
                    })
                    YIELD nodeId, communityId
                    RETURN gds.util.asNode(nodeId).entity_id AS entity_id, communityId
                    """,
                    {"projection_name": projection_name, "gamma": self.config.leiden_gamma},
                )
                return self._group_by_community(rows)
        finally:
            self._drop_projection(projection_name)

    # -- helpers --------------------------------------------------------

    def _summarize_communities(self, property_name: str) -> list[dict]:
        rows = self._run(
            f"""
            MATCH (n:Entity)
            WHERE n.{property_name} IS NOT NULL
            RETURN n.{property_name} AS community_id, count(*) AS size,
                   collect(n.entity_id)[0..50] AS sample_entity_ids
            ORDER BY size DESC
            """,
            {},
        )
        return [r for r in rows if r["size"] >= self.config.min_community_size]

    def _group_by_community(self, rows: list[dict]) -> list[dict]:
        grouped: dict[int, list[str]] = {}
        for row in rows:
            grouped.setdefault(row["communityId"], []).append(row["entity_id"])
        return [
            {"community_id": cid, "size": len(members), "sample_entity_ids": members[:50]}
            for cid, members in grouped.items()
            if len(members) >= self.config.min_community_size
        ]

    def _run(self, cypher: str, params: dict) -> list[dict]:
        with self.driver.session(database=self.database) as session:
            result = session.execute_write(lambda tx: list(tx.run(cypher, params)))
            return [dict(r) for r in result]