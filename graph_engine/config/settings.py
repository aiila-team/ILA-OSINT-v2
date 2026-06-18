"""Centralized configuration for the Graph Engine.

Every tunable value used across canonicalization, resolution, inference,
the writer, analytics, and the Faust app is defined here — nowhere else.

Why centralized
---------------
The architecture spec is explicit that "business logic must remain outside
Neo4j" and that inference rules "must be modular" and "not hardcoded
throughout services." The same discipline applies to configuration: every
threshold, topic name, and connection string lives in exactly one place so
that:

    - Tuning AUTO_MERGE_THRESHOLD doesn't require touching resolution code
    - Changing a Kafka topic name doesn't require grepping six files
    - Local dev / staging / production differ only by environment variables

All values are read from environment variables with safe defaults for
local development. Nothing here should ever contain a literal secret —
secrets are referenced by name only (e.g. NEO4J_PASSWORD env var) and the
actual value is injected via Vault / K8s Secrets at deploy time, consistent
with the rest of the ILA V2 platform.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Final


def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("true", "1", "yes")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


# ══════════════════════════════════════════════════════════════════════════════
# NEO4J
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Neo4jSettings:
    uri:      str = os.getenv("NEO4J_URI", "neo4j://localhost:7687")
    user:     str = os.getenv("NEO4J_USER", "neo4j")
    password: str = os.getenv("NEO4J_PASSWORD", "")           # injected via Vault in prod
    database: str = os.getenv("NEO4J_DATABASE", "neo4j")

    # Connection pool tuning — Neo4j MERGE under concurrent load is the
    # known bottleneck called out in the architecture deep-dive.
    max_connection_pool_size: int = _env_int("NEO4J_MAX_POOL_SIZE", 50)
    connection_timeout_seconds: int = _env_int("NEO4J_CONN_TIMEOUT", 30)
    max_transaction_retry_seconds: int = _env_int("NEO4J_TX_RETRY_SECONDS", 15)

    # Whether the APOC plugin is installed (graph_writer alias-merge query
    # depends on apoc.coll.toSet — set False to use the pure-Cypher fallback)
    apoc_available: bool = _env_bool("NEO4J_APOC_AVAILABLE", True)


# ══════════════════════════════════════════════════════════════════════════════
# REDIS  (Entity Registry backing store)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class RedisSettings:
    host:     str = os.getenv("REDIS_HOST", "localhost")
    port:     int = _env_int("REDIS_PORT", 6379)
    db:       int = _env_int("REDIS_REGISTRY_DB", 2)   # dedicated DB index for entity registry
    password: str | None = os.getenv("REDIS_PASSWORD") or None
    ssl:      bool = _env_bool("REDIS_SSL", False)

    # If False, EntityRegistry falls back to in-memory dict automatically.
    # Useful for local dev / unit tests without a Redis instance running.
    enabled:  bool = _env_bool("REDIS_REGISTRY_ENABLED", True)

    socket_timeout_seconds: int = _env_int("REDIS_SOCKET_TIMEOUT", 5)


# ══════════════════════════════════════════════════════════════════════════════
# KAFKA — topics, consumer groups, broker connection
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class KafkaTopics:
    """
    Topic names used across the Graph Engine pipeline.

        entity_events     : input  — produced by NER pipeline
        graph_command      : internal — resolver output, writer input
        graph_updates       : output — consumed by Risk Engine, Analytics, Alerts
        dead_letter         : failures that exhausted retries
    """
    entity_events:  str = os.getenv("KAFKA_TOPIC_ENTITY_EVENTS", "entity-events")
    graph_command:  str = os.getenv("KAFKA_TOPIC_GRAPH_COMMAND", "graph-command-topic")
    graph_updates:  str = os.getenv("KAFKA_TOPIC_GRAPH_UPDATES", "graph-updates")
    dead_letter:    str = os.getenv("KAFKA_TOPIC_DLQ", "graph-engine-dlq")


@dataclass(frozen=True)
class KafkaSettings:
    bootstrap_servers: str = os.getenv(
        "KAFKA_BOOTSTRAP_SERVERS", "kafka-1:9092,kafka-2:9092,kafka-3:9092"
    )
    schema_registry_url: str = os.getenv(
        "KAFKA_SCHEMA_REGISTRY_URL", "http://schema-registry:8081"
    )
    sasl_mechanism: str | None = os.getenv("KAFKA_SASL_MECHANISM") or None
    sasl_username:  str | None = os.getenv("KAFKA_SASL_USERNAME") or None
    sasl_password:  str | None = os.getenv("KAFKA_SASL_PASSWORD") or None   # via Vault
    ssl_cafile:     str | None = os.getenv("KAFKA_SSL_CAFILE") or None

    # Faust app identity — this consumer group name must be unique per
    # logical service so Kafka can independently scale graph-engine
    # workers from every other pipeline stage.
    app_id: str = os.getenv("KAFKA_GRAPH_ENGINE_APP_ID", "ila-graph-engine")

    # Partition count used when topics are auto-created in dev.
    # Production topic creation/partitioning is owned by Sridhar's infra.
    default_partitions: int = _env_int("KAFKA_DEFAULT_PARTITIONS", 6)
    default_replication_factor: int = _env_int("KAFKA_DEFAULT_REPLICATION", 3)

    topics: KafkaTopics = field(default_factory=KafkaTopics)


# ══════════════════════════════════════════════════════════════════════════════
# CANONICALIZATION
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class CanonicalizationSettings:
    # Default country code assumed when normalizing phone numbers that
    # arrive without one. ILA V2 is India-first per the architecture spec.
    default_country_code: str = os.getenv("CANON_DEFAULT_COUNTRY_CODE", "91")

    # Minimum length after stripping non-digits for a value to be
    # considered a valid Indian mobile number.
    phone_national_length: int = _env_int("CANON_PHONE_NATIONAL_LENGTH", 10)
    valid_mobile_prefixes: tuple[str, ...] = ("6", "7", "8", "9")

    # Minimum length for a value to be treated as a valid bank account number.
    min_bank_account_length: int = _env_int("CANON_MIN_BANK_ACCOUNT_LEN", 9)

    # Minimum length for a value to be treated as a valid crypto address.
    min_crypto_address_length: int = _env_int("CANON_MIN_CRYPTO_ADDR_LEN", 25)


# ══════════════════════════════════════════════════════════════════════════════
# IDENTITY RESOLUTION
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ResolutionSettings:
    """
    Thresholds for the three-level resolution engine.

    These values were called out explicitly in the architecture deep-dive
    as "educated guesses" requiring recalibration based on analyst
    feedback — that is exactly why they live here as env-overridable
    settings rather than literals inside resolution/engine.py.
    """
    # Level 2 → Level 3 boundary. Matches scoring >= this auto-merge.
    auto_merge_threshold: float = _env_float("RESOLUTION_AUTO_MERGE_THRESHOLD", 0.85)

    # Below this, candidates are discarded entirely as noise.
    min_probabilistic_threshold: float = _env_float("RESOLUTION_MIN_PROB_THRESHOLD", 0.55)

    # Minimum name similarity (SequenceMatcher ratio) to even consider
    # two Person/Organization entities as Level 2/3 candidates.
    name_similarity_threshold: float = _env_float("RESOLUTION_NAME_SIM_THRESHOLD", 0.80)

    # Confidence boost applied when two candidates share an alias
    # (e.g. same phone number appears in both entities' alias_values).
    shared_identifier_boost: float = _env_float("RESOLUTION_SHARED_ID_BOOST", 0.15)

    # Ceiling applied after boosting — never let a probabilistic match
    # claim higher confidence than a genuine deterministic merge.
    max_boosted_confidence: float = _env_float("RESOLUTION_MAX_BOOSTED_CONFIDENCE", 0.99)

    # Whether Level 3 candidate-vs-all-candidates search uses a full
    # registry scan (fine up to ~50K entities per type) or is expected
    # to be backed by a FAISS shortlist. This flag lets engine.py choose
    # its code path without a hard import-time dependency on FAISS.
    use_faiss_shortlist: bool = _env_bool("RESOLUTION_USE_FAISS", False)
    faiss_similarity_threshold: float = _env_float("RESOLUTION_FAISS_THRESHOLD", 0.87)


# ══════════════════════════════════════════════════════════════════════════════
# RELATIONSHIP INFERENCE
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class InferenceSettings:
    # Confidence values per assertion type — centralizing these means
    # Decision Layer / risk scoring calibration changes don't require
    # touching individual InferenceRule subclasses.
    confidence_owns_phone:         float = _env_float("INFER_CONF_OWNS_PHONE", 0.85)
    confidence_owns_email:         float = _env_float("INFER_CONF_OWNS_EMAIL", 0.85)
    confidence_owns_upi:           float = _env_float("INFER_CONF_OWNS_UPI", 0.92)
    confidence_owns_crypto:        float = _env_float("INFER_CONF_OWNS_CRYPTO", 0.80)
    confidence_owns_bank_account:  float = _env_float("INFER_CONF_OWNS_BANK", 0.88)
    confidence_owns_account:       float = _env_float("INFER_CONF_OWNS_ACCOUNT", 0.75)
    confidence_located_in:         float = _env_float("INFER_CONF_LOCATED_IN", 0.70)
    confidence_mentions_default:   float = _env_float("INFER_CONF_MENTIONS", 0.60)
    confidence_transfer_with_context:    float = _env_float("INFER_CONF_TRANSFER_CTX", 0.80)
    confidence_transfer_without_context: float = _env_float("INFER_CONF_TRANSFER_NO_CTX", 0.50)
    confidence_org_controls_org:   float = _env_float("INFER_CONF_ORG_CONTROLS", 0.70)
    confidence_ip_domain_linked:   float = _env_float("INFER_CONF_IP_DOMAIN", 0.85)
    confidence_author_posted:      float = _env_float("INFER_CONF_AUTHOR_POSTED", 1.0)


# ══════════════════════════════════════════════════════════════════════════════
# GRAPH WRITER
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class WriterSettings:
    # Neo4j string property size limit applied to Evidence.content before write.
    max_content_property_chars: int = _env_int("WRITER_MAX_CONTENT_CHARS", 4000)

    # Retry behaviour for transient Neo4j write failures
    # (separate from Kafka-level consumer retry — this is intra-transaction).
    max_write_retries: int = _env_int("WRITER_MAX_RETRIES", 3)
    write_retry_backoff_seconds: float = _env_float("WRITER_RETRY_BACKOFF", 1.5)

    # Whether to run constraint/index creation automatically on startup.
    auto_create_schema: bool = _env_bool("WRITER_AUTO_CREATE_SCHEMA", True)


# ══════════════════════════════════════════════════════════════════════════════
# GRAPH ANALYTICS  (Neo4j GDS — Louvain, PageRank, Betweenness, temporal jobs)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class AnalyticsSettings:
    # Named GDS graph projection used by all analytics jobs.
    gds_graph_name: str = os.getenv("GDS_GRAPH_NAME", "ila-entity-graph")

    # Analytics run on a schedule, never inline on the ingestion path,
    # per the explicit architecture requirement: "Not in ingestion path.
    # Scheduled jobs."
    community_detection_cron: str = os.getenv("ANALYTICS_LOUVAIN_CRON", "0 */6 * * *")   # every 6h
    centrality_cron:          str = os.getenv("ANALYTICS_CENTRALITY_CRON", "0 2 * * *")  # nightly 2 AM
    temporal_correlation_cron: str = os.getenv("ANALYTICS_TEMPORAL_CRON", "*/15 * * * *") # every 15 min

    # Louvain / Leiden tuning
    community_min_size: int = _env_int("ANALYTICS_COMMUNITY_MIN_SIZE", 3)
    louvain_max_iterations: int = _env_int("ANALYTICS_LOUVAIN_MAX_ITER", 10)

    # Temporal correlation window for COORDINATES_WITH detection
    temporal_window_minutes: int = _env_int("ANALYTICS_TEMPORAL_WINDOW_MIN", 30)

    # Result caps — protects API and UI from unbounded graph responses
    max_centrality_results: int = _env_int("ANALYTICS_MAX_CENTRALITY_RESULTS", 100)


# ══════════════════════════════════════════════════════════════════════════════
# INVESTIGATION API
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ApiSettings:
    # Hard cap on traversal depth and node count — called out explicitly
    # in the architecture deep-dive as a required guardrail:
    # "Must enforce server-side node limits (e.g., max 500 nodes per
    # graph response)."
    max_traversal_hops: int = _env_int("API_MAX_TRAVERSAL_HOPS", 3)
    max_nodes_per_response: int = _env_int("API_MAX_NODES_PER_RESPONSE", 500)
    default_hops: int = _env_int("API_DEFAULT_HOPS", 2)

    # Pagination for evidence browser / timeline endpoints
    default_page_size: int = _env_int("API_DEFAULT_PAGE_SIZE", 25)
    max_page_size: int = _env_int("API_MAX_PAGE_SIZE", 100)


# ══════════════════════════════════════════════════════════════════════════════
# OBSERVABILITY
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ObservabilitySettings:
    # Prometheus-compatible metrics, per the architecture spec's
    # explicit observability requirements section.
    metrics_enabled: bool = _env_bool("METRICS_ENABLED", True)
    metrics_port:    int  = _env_int("METRICS_PORT", 9100)
    log_level:       str  = os.getenv("GRAPH_ENGINE_LOG_LEVEL", "INFO")

    # Structured JSON logging vs human-readable (JSON in prod for Loki).
    json_logs: bool = _env_bool("GRAPH_ENGINE_JSON_LOGS", True)


# ══════════════════════════════════════════════════════════════════════════════
# ROOT SETTINGS OBJECT
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class GraphEngineSettings:
    """
    Single root object aggregating every settings group.

    Import this, not the individual dataclasses, in application code:

        from graph_engine.config import settings
        driver = neo4j.AsyncGraphDatabase.driver(
            settings.neo4j.uri,
            auth=(settings.neo4j.user, settings.neo4j.password),
        )
    """
    environment: str = os.getenv("ILA_ENVIRONMENT", "development")  # development | staging | production

    neo4j:          Neo4jSettings              = field(default_factory=Neo4jSettings)
    redis:          RedisSettings              = field(default_factory=RedisSettings)
    kafka:          KafkaSettings               = field(default_factory=KafkaSettings)
    canonicalization: CanonicalizationSettings = field(default_factory=CanonicalizationSettings)
    resolution:     ResolutionSettings          = field(default_factory=ResolutionSettings)
    inference:      InferenceSettings           = field(default_factory=InferenceSettings)
    writer:         WriterSettings              = field(default_factory=WriterSettings)
    analytics:      AnalyticsSettings           = field(default_factory=AnalyticsSettings)
    api:            ApiSettings                 = field(default_factory=ApiSettings)
    observability:  ObservabilitySettings       = field(default_factory=ObservabilitySettings)

    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def validate(self) -> list[str]:
        """
        Run basic sanity checks at startup. Returns a list of warning
        strings (empty list = all good). Intended to be called once in
        faust_app.py before the worker starts, so misconfiguration fails
        fast and loud rather than silently in production.
        """
        warnings: list[str] = []

        if self.is_production() and not self.neo4j.password:
            warnings.append("NEO4J_PASSWORD is empty in a production environment.")

        if self.is_production() and self.redis.enabled and not self.redis.password:
            warnings.append("REDIS_PASSWORD is empty in a production environment.")

        if self.resolution.auto_merge_threshold <= self.resolution.min_probabilistic_threshold:
            warnings.append(
                "RESOLUTION_AUTO_MERGE_THRESHOLD must be greater than "
                "RESOLUTION_MIN_PROB_THRESHOLD — current values would make "
                "every probabilistic candidate eligible for auto-merge."
            )

        if self.api.max_nodes_per_response > 2000:
            warnings.append(
                "API_MAX_NODES_PER_RESPONSE is very high — this risks "
                "violating the 3-hop / 3-second graph traversal SLA."
            )

        return warnings


# Module-level singleton — import this everywhere.
settings: Final[GraphEngineSettings] = GraphEngineSettings()