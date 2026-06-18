from prometheus_client import Counter, Histogram, start_http_server


events_received = Counter(
    "ila_ingestion_events_received_total",
    "Total number of raw events received for ingestion normalization.",
)

events_normalized = Counter(
    "ila_ingestion_events_normalized_total",
    "Total number of events successfully normalized into RawEvent format.",
)

events_published = Counter(
    "ila_ingestion_events_published_total",
    "Total number of RawEvents successfully published to Kafka.",
)

validation_failures = Counter(
    "ila_ingestion_validation_failures_total",
    "Total number of RawEvent validation failures.",
)

schema_failures = Counter(
    "ila_ingestion_schema_failures_total",
    "Total number of AVRO schema serialization failures.",
)

dlq_count = Counter(
    "ila_ingestion_dlq_total",
    "Total number of events sent to the dead-letter queue.",
)

normalization_latency = Histogram(
    "ila_ingestion_normalization_latency_seconds",
    "Latency in seconds for RawEvent normalization.",
)


def expose_metrics(port: int = 8000) -> None:
    """Start the Prometheus metrics HTTP endpoint."""
    start_http_server(port)
