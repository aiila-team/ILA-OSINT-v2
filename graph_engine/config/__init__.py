"""Graph Engine configuration package.

Single public interface for all configuration across the Graph Engine.

Usage
-----
    from graph_engine.config import settings

    driver = neo4j.AsyncGraphDatabase.driver(
        settings.neo4j.uri,
        auth=(settings.neo4j.user, settings.neo4j.password),
    )

    if score >= settings.resolution.auto_merge_threshold:
        ...

Do not import GraphEngineSettings directly to construct a second instance —
`settings` is a module-level singleton so that every part of the engine
(canonicalization, resolution, inference, writer, analytics, api,
faust_app) observes the exact same configuration values within one
process.
"""

from .settings import (
    AnalyticsSettings,
    ApiSettings,
    CanonicalizationSettings,
    GraphEngineSettings,
    InferenceSettings,
    KafkaSettings,
    KafkaTopics,
    Neo4jSettings,
    ObservabilitySettings,
    RedisSettings,
    ResolutionSettings,
    WriterSettings,
    settings,
)

__all__ = [
    "settings",
    "GraphEngineSettings",
    "Neo4jSettings",
    "RedisSettings",
    "KafkaSettings",
    "KafkaTopics",
    "CanonicalizationSettings",
    "ResolutionSettings",
    "InferenceSettings",
    "WriterSettings",
    "AnalyticsSettings",
    "ApiSettings",
    "ObservabilitySettings",
]