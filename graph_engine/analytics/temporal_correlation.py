"""
graph_engine.analytics.temporal_correlation
==============================================
Detects three patterns the architecture doc calls out explicitly:

1. Coordinated activity: multiple distinct entities posting/mentioning
   the same target entity within a tight time window — a volume/timing
   signature that suggests scripted or orchestrated behavior rather than
   organic, independent activity.

2. Dormant activation: an entity with a long quiet period (no new
   evidence/relationships) suddenly resuming activity — frequently
   relevant for sleeper-account / pre-positioned-infrastructure detection.

3. Burst campaigns: a sudden spike in mention/post volume against a
   single target (domain, hashtag, person) relative to its own historical
   baseline — implemented as a z-score over a rolling window, mirroring
   the anomaly-detection approach the architecture doc specifies for the
   real-time risk-scoring path, but applied here at the graph level
   (across an entity's full Evidence/Assertion history) rather than
   per-event.

These run as bounded Cypher queries against the persisted graph (NOT GDS
projections — these are time-windowed aggregate queries, not iterative
graph algorithms) and are intentionally simple/explainable: every score
this module produces can be explained in one sentence to an analyst,
which matters because temporal-correlation flags feed directly into
risk_scorer.py and ultimately into alerts a human has to justify acting on.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass


@dataclass
class TemporalCorrelationConfig:
    coordination_window_seconds: int = 30 * 60   # 30-minute window, matches
                                                    # the military-event fusion
                                                    # window in the architecture doc
    coordination_min_distinct_actors: int = 3
    dormancy_threshold_seconds: int = 30 * 24 * 3600   # 30 days of silence
    burst_lookback_buckets: int = 14            # e.g. 14 daily buckets
    burst_zscore_threshold: float = 3.0


class TemporalCorrelationEngine:
    def __init__(self, driver, database: str = "neo4j", config: TemporalCorrelationConfig | None = None) -> None:
        self.driver = driver
        self.database = database
        self.config = config or TemporalCorrelationConfig()

    # -- coordinated activity --------------------------------------------

    def detect_coordinated_activity(self, target_entity_id: str) -> list[dict]:
        """Finds clusters of distinct source/actor entities whose
        Assertion timestamps against `target_entity_id` fall within
        `coordination_window_seconds` of each other, in groups of at
        least `coordination_min_distinct_actors`."""
        rows = self._run(
            """
            MATCH (asrt:Assertion)-[:ABOUT_TARGET]->(t:Entity {entity_id: $target_id})
            MATCH (asrt)-[:ABOUT_SOURCE]->(actor:Entity)
            RETURN actor.entity_id AS actor_id, asrt.inferred_at AS ts
            ORDER BY ts
            """,
            {"target_id": target_entity_id},
        )
        if not rows:
            return []

        window = self.config.coordination_window_seconds
        clusters: list[dict] = []
        bucket: list[dict] = []
        for row in rows:
            if bucket and row["ts"] - bucket[0]["ts"] > window:
                clusters.append(self._summarize_cluster(bucket))
                bucket = []
            bucket.append(row)
        if bucket:
            clusters.append(self._summarize_cluster(bucket))

        return [
            c for c in clusters
            if c["distinct_actor_count"] >= self.config.coordination_min_distinct_actors
        ]

    def _summarize_cluster(self, bucket: list[dict]) -> dict:
        actors = {r["actor_id"] for r in bucket}
        return {
            "window_start": bucket[0]["ts"],
            "window_end": bucket[-1]["ts"],
            "distinct_actor_count": len(actors),
            "actor_ids": sorted(actors),
            "event_count": len(bucket),
        }

    # -- dormant activation ------------------------------------------------

    def detect_dormant_activation(self, entity_id: str, now: float) -> dict | None:
        """Returns a flag if entity_id has a gap >= dormancy_threshold
        between its second-to-last and last evidence timestamps,
        indicating reactivation after a long quiet period."""
        rows = self._run(
            """
            MATCH (n:Entity {entity_id: $entity_id})-[:HAS_EVIDENCE]->(ev:Evidence)
            RETURN ev.observed_at AS ts
            ORDER BY ts
            """,
            {"entity_id": entity_id},
        )
        timestamps = sorted(r["ts"] for r in rows if r["ts"] is not None)
        if len(timestamps) < 2:
            return None

        last_gap = timestamps[-1] - timestamps[-2]
        if last_gap >= self.config.dormancy_threshold_seconds:
            return {
                "entity_id": entity_id,
                "dormant_seconds": last_gap,
                "reactivated_at": timestamps[-1],
                "previous_activity_at": timestamps[-2],
            }
        return None

    # -- burst campaign detection -------------------------------------------

    def detect_burst(self, target_entity_id: str, bucket_seconds: int = 86400) -> dict | None:
        """Z-score of the most recent activity bucket against the
        preceding `burst_lookback_buckets` buckets' mean/stdev. A z-score
        above `burst_zscore_threshold` flags a burst campaign."""
        rows = self._run(
            """
            MATCH (asrt:Assertion)-[:ABOUT_TARGET]->(t:Entity {entity_id: $target_id})
            RETURN asrt.inferred_at AS ts
            ORDER BY ts
            """,
            {"target_id": target_entity_id},
        )
        timestamps = [r["ts"] for r in rows if r["ts"] is not None]
        if not timestamps:
            return None

        buckets = self._bucketize(timestamps, bucket_seconds)
        n = self.config.burst_lookback_buckets
        if len(buckets) < n + 1:
            return None  # not enough history to establish a baseline

        history = buckets[-(n + 1):-1]
        current = buckets[-1]
        mean = statistics.mean(history)
        stdev = statistics.pstdev(history) or 1e-6  # avoid div-by-zero on flat history
        z = (current - mean) / stdev

        if z >= self.config.burst_zscore_threshold:
            return {
                "entity_id": target_entity_id,
                "current_bucket_count": current,
                "baseline_mean": mean,
                "baseline_stdev": stdev,
                "z_score": round(z, 2),
            }
        return None

    @staticmethod
    def _bucketize(timestamps: list[float], bucket_seconds: int) -> list[int]:
        if not timestamps:
            return []
        start = timestamps[0]
        max_bucket = int((timestamps[-1] - start) // bucket_seconds)
        counts = [0] * (max_bucket + 1)
        for ts in timestamps:
            idx = int((ts - start) // bucket_seconds)
            counts[idx] += 1
        return counts

    def _run(self, cypher: str, params: dict) -> list[dict]:
        with self.driver.session(database=self.database) as session:
            result = session.execute_read(lambda tx: list(tx.run(cypher, params)))
            return [dict(r) for r in result]