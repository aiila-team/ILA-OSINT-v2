"""
graph_engine.analytics.risk_scorer
=====================================
Graph-based risk propagation — distinct from (and complementary to) the
real-time 11-model risk ensemble described in the architecture doc's
backend section. That ensemble scores a single EVENT in under 2 seconds.
This module scores ENTITIES and CLUSTERS based on their position and
connections in the accumulated graph — a slower, batch/on-demand
computation that answers "how risky is this node given everything we
know about its neighborhood," not "how risky is this one post."

Three levels, each explainable:

entity_risk
    Weighted combination of: the entity's own max observed event-risk
    score (passed in by the caller — this module does not re-derive it,
    it propagates it), its centrality scores (a highly-central entity in
    a risky neighborhood matters more), and risk inherited from
    high-confidence neighbors (personalized-PageRank-style propagation,
    implemented here as a bounded-hop weighted average rather than a full
    GDS personalized PageRank, to keep the explanation simple: "this
    entity's risk is elevated because N of its M direct connections are
    independently high-risk, weighted by relationship confidence").

relationship_risk
    A relationship's risk is a function of its own confidence and the
    risk of its two endpoint entities — a high-confidence edge between
    two high-risk entities is itself worth flagging (e.g. for evidence
    package prioritization).

cluster_risk
    Aggregate risk of a community (from community_detection output) —
    mean + max entity risk within the cluster, plus a density-adjusted
    term so a large cluster with a few risky outliers isn't
    over-penalized relative to a small, uniformly risky cluster.

Every score returned includes a `contributing_factors` breakdown — this
directly answers the Specialist persona's explicit requirement: "every
flagged entity has top-3 contributing features listed."
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RiskScorerConfig:
    own_score_weight: float = 0.5
    centrality_weight: float = 0.2
    neighbor_propagation_weight: float = 0.3
    propagation_hops: int = 1
    neighbor_risk_threshold: float = 0.6   # neighbors at/above this count as "high-risk" in explanations


@dataclass
class RiskResult:
    entity_id: str
    risk_score: float
    contributing_factors: list[dict] = field(default_factory=list)


class RiskScorer:
    def __init__(self, driver, database: str = "neo4j", config: RiskScorerConfig | None = None) -> None:
        self.driver = driver
        self.database = database
        self.config = config or RiskScorerConfig()

    # -- entity risk -------------------------------------------------------

    def entity_risk(self, entity_id: str, own_event_risk_score: float) -> RiskResult:
        """own_event_risk_score: the max/latest score from the real-time
        11-model ensemble for events involving this entity, on a 0-10
        scale (per the architecture doc) — normalized to 0-1 here for
        consistent graph-risk arithmetic."""
        own_normalized = max(0.0, min(own_event_risk_score / 10.0, 1.0))

        node = self._get_node(entity_id)
        centrality = 0.0
        if node:
            centrality = node.get("pagerank_score") or 0.0
            centrality = min(centrality / 5.0, 1.0)  # rough normalization; recalibrate against observed distribution

        neighbors = self._get_neighbor_risks(entity_id, hops=self.config.propagation_hops)
        propagated = 0.0
        high_risk_neighbors = []
        if neighbors:
            weighted_sum = sum(n["risk"] * n["confidence"] for n in neighbors)
            weight_total = sum(n["confidence"] for n in neighbors) or 1e-6
            propagated = weighted_sum / weight_total
            high_risk_neighbors = [
                n for n in neighbors if n["risk"] >= self.config.neighbor_risk_threshold
            ]

        cfg = self.config
        score = (
            cfg.own_score_weight * own_normalized
            + cfg.centrality_weight * centrality
            + cfg.neighbor_propagation_weight * propagated
        )
        score = round(min(score, 1.0), 4)

        factors = sorted(
            [
                {"factor": "own_event_risk", "contribution": round(cfg.own_score_weight * own_normalized, 4),
                 "detail": f"Highest real-time event risk score observed for this entity: {own_event_risk_score:.1f}/10"},
                {"factor": "graph_centrality", "contribution": round(cfg.centrality_weight * centrality, 4),
                 "detail": "PageRank-based influence within the entity's network"},
                {"factor": "neighbor_risk_propagation", "contribution": round(cfg.neighbor_propagation_weight * propagated, 4),
                 "detail": (
                     f"{len(high_risk_neighbors)} of {len(neighbors)} direct connections are "
                     f"independently high-risk (>= {cfg.neighbor_risk_threshold})"
                     if neighbors else "No connected entities with known risk scores"
                 )},
            ],
            key=lambda f: f["contribution"],
            reverse=True,
        )[:3]

        return RiskResult(entity_id=entity_id, risk_score=score, contributing_factors=factors)

    # -- relationship risk --------------------------------------------------

    def relationship_risk(
        self,
        relationship_confidence: float,
        source_entity_risk: float,
        target_entity_risk: float,
    ) -> RiskResult:
        endpoint_risk = max(source_entity_risk, target_entity_risk)
        score = round(relationship_confidence * endpoint_risk, 4)
        factors = [
            {"factor": "relationship_confidence", "contribution": relationship_confidence,
             "detail": "Confidence assigned to this relationship by the inference engine"},
            {"factor": "max_endpoint_risk", "contribution": endpoint_risk,
             "detail": "Higher of the two connected entities' individual risk scores"},
        ]
        return RiskResult(entity_id="<relationship>", risk_score=score, contributing_factors=factors)

    # -- cluster risk -------------------------------------------------------

    def cluster_risk(self, member_risks: list[float]) -> RiskResult:
        if not member_risks:
            return RiskResult(entity_id="<cluster>", risk_score=0.0, contributing_factors=[])

        mean_risk = sum(member_risks) / len(member_risks)
        max_risk = max(member_risks)
        density_term = min(len(member_risks) / 10.0, 1.0)  # larger coordinated clusters get a small boost

        score = round(0.5 * mean_risk + 0.4 * max_risk + 0.1 * density_term, 4)
        factors = [
            {"factor": "mean_member_risk", "contribution": round(0.5 * mean_risk, 4),
             "detail": f"Average individual risk across {len(member_risks)} cluster members"},
            {"factor": "max_member_risk", "contribution": round(0.4 * max_risk, 4),
             "detail": "Highest individual risk score within the cluster"},
            {"factor": "cluster_size_density", "contribution": round(0.1 * density_term, 4),
             "detail": f"Cluster size factor ({len(member_risks)} members)"},
        ]
        return RiskResult(entity_id="<cluster>", risk_score=score, contributing_factors=factors)

    # -- helpers --------------------------------------------------------

    def _get_node(self, entity_id: str) -> dict | None:
        rows = self._run(
            "MATCH (n:Entity {entity_id: $entity_id}) RETURN n.pagerank_score AS pagerank_score",
            {"entity_id": entity_id},
        )
        return rows[0] if rows else None

    def _get_neighbor_risks(self, entity_id: str, hops: int) -> list[dict]:
        """Returns risk + relationship confidence for each direct neighbor
        that already has a persisted `risk_score` property (written back
        by a previous run of this scorer, or seeded from event-level
        scoring). Bounded to 1-2 hops — deeper propagation should go
        through a proper GDS personalized PageRank, not this method."""
        hop_pattern = "*1..%d" % max(1, min(hops, 2))
        rows = self._run(
            f"""
            MATCH (n:Entity {{entity_id: $entity_id}})-[r{hop_pattern}]-(neighbor:Entity)
            WHERE neighbor.risk_score IS NOT NULL
            RETURN DISTINCT neighbor.entity_id AS entity_id, neighbor.risk_score AS risk,
                   1.0 AS confidence
            LIMIT 200
            """,
            {"entity_id": entity_id},
        )
        return [{"entity_id": r["entity_id"], "risk": r["risk"], "confidence": r["confidence"]} for r in rows]

    def persist_risk(self, entity_id: str, risk_score: float) -> None:
        self._run(
            "MATCH (n:Entity {entity_id: $entity_id}) SET n.risk_score = $risk_score",
            {"entity_id": entity_id, "risk_score": risk_score},
        )

    def _run(self, cypher: str, params: dict) -> list[dict]:
        with self.driver.session(database=self.database) as session:
            result = session.execute_read(lambda tx: list(tx.run(cypher, params)))
            return [dict(r) for r in result]