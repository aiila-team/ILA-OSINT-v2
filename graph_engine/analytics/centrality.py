"""
graph_engine.analytics.centrality
====================================
Influence scoring via Neo4j GDS. PageRank surfaces "who is influential in
the information-flow sense" (good for propaganda amplifier identification),
Betweenness surfaces "who bridges otherwise-disconnected clusters" (good
for identifying coordination brokers / money-mule connectors), Degree is
the cheap baseline both others should be sanity-checked against.

Same projection lifecycle pattern as community_detection.py: project,
compute, write-back-or-stream, drop. Kept as a separate module (per the
required folder structure) rather than merged into community_detection
because centrality and community detection are run on different
schedules and different relationship-type scopes in practice — PageRank
over MENTIONS/LINKED_TO answers a different question than Louvain over
OWNS/USES.
"""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_PROJECTION_NAME = "ila_centrality_projection"


@dataclass
class CentralityConfig:
    relationship_types: tuple[str, ...] = (
        "MENTIONS", "LINKED_TO", "ASSOCIATED_WITH", "POSTED",
    )
    pagerank_damping_factor: float = 0.85
    top_n: int = 100


class CentralityEngine:
    def __init__(self, driver, database: str = "neo4j", config: CentralityConfig | None = None) -> None:
        self.driver = driver
        self.database = database
        self.config = config or CentralityConfig()

    def _project(self, projection_name: str) -> None:
        rel_filter = "{" + ", ".join(
            f'{rt}: {{orientation: "NATURAL"}}' for rt in self.config.relationship_types
        ) + "}"
        self._run(
            f"""
            CALL gds.graph.project(
                $projection_name, 'Entity', {rel_filter},
                {{relationshipProperties: 'weight'}}
            )
            """,
            {"projection_name": projection_name},
        )

    def _drop(self, projection_name: str) -> None:
        self._run("CALL gds.graph.drop($projection_name, false)", {"projection_name": projection_name})

    def run_pagerank(self, write_back: bool = True, projection_name: str = DEFAULT_PROJECTION_NAME) -> list[dict]:
        self._project(projection_name)
        try:
            if write_back:
                self._run(
                    """
                    CALL gds.pageRank.write($projection_name, {
                        writeProperty: 'pagerank_score',
                        dampingFactor: $damping,
                        relationshipWeightProperty: 'weight'
                    })
                    """,
                    {"projection_name": projection_name, "damping": self.config.pagerank_damping_factor},
                )
                return self._top_n_by("pagerank_score")
            rows = self._run(
                """
                CALL gds.pageRank.stream($projection_name, {
                    dampingFactor: $damping, relationshipWeightProperty: 'weight'
                })
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).entity_id AS entity_id, score
                ORDER BY score DESC LIMIT $top_n
                """,
                {"projection_name": projection_name, "damping": self.config.pagerank_damping_factor, "top_n": self.config.top_n},
            )
            return rows
        finally:
            self._drop(projection_name)

    def run_betweenness(self, write_back: bool = True, projection_name: str = DEFAULT_PROJECTION_NAME) -> list[dict]:
        """Betweenness is O(V*E) — expensive on large graphs. Run on a
        bounded subgraph (e.g. a single community's induced subgraph from
        community_detection output) rather than the full 100M-node graph
        in production; this method projects the full configured scope, so
        callers are responsible for pre-filtering when operating at scale."""
        self._project(projection_name)
        try:
            if write_back:
                self._run(
                    "CALL gds.betweenness.write($projection_name, {writeProperty: 'betweenness_score'})",
                    {"projection_name": projection_name},
                )
                return self._top_n_by("betweenness_score")
            rows = self._run(
                """
                CALL gds.betweenness.stream($projection_name)
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).entity_id AS entity_id, score
                ORDER BY score DESC LIMIT $top_n
                """,
                {"projection_name": projection_name, "top_n": self.config.top_n},
            )
            return rows
        finally:
            self._drop(projection_name)

    def run_degree(self, write_back: bool = True, projection_name: str = DEFAULT_PROJECTION_NAME) -> list[dict]:
        self._project(projection_name)
        try:
            if write_back:
                self._run(
                    "CALL gds.degree.write($projection_name, {writeProperty: 'degree_score'})",
                    {"projection_name": projection_name},
                )
                return self._top_n_by("degree_score")
            rows = self._run(
                """
                CALL gds.degree.stream($projection_name)
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).entity_id AS entity_id, score
                ORDER BY score DESC LIMIT $top_n
                """,
                {"projection_name": projection_name, "top_n": self.config.top_n},
            )
            return rows
        finally:
            self._drop(projection_name)

    def _top_n_by(self, property_name: str) -> list[dict]:
        return self._run(
            f"""
            MATCH (n:Entity)
            WHERE n.{property_name} IS NOT NULL
            RETURN n.entity_id AS entity_id, n.{property_name} AS score
            ORDER BY score DESC LIMIT $top_n
            """,
            {"top_n": self.config.top_n},
        )

    def _run(self, cypher: str, params: dict) -> list[dict]:
        with self.driver.session(database=self.database) as session:
            result = session.execute_write(lambda tx: list(tx.run(cypher, params)))
            return [dict(r) for r in result]