# app/observability/metrics.py
from prometheus_client import Counter, Histogram

# Metric for messages processed at each stage
STAGE_MESSAGES = Counter(
    "processing_stage_messages_total",
    "Total messages processed at each pipeline stage",
    labelnames=["stage", "source", "status"]
)

# Metric for deduplication hits
DEDUP_HITS = Counter(
    "processing_dedup_hits_total",
    "Total deduplication hits",
    labelnames=["type", "source"]
)

# Metric for stage processing duration
STAGE_LATENCY = Histogram(
    "processing_stage_duration_seconds",
    "Time spent in each pipeline stage",
    labelnames=["stage", "source"]
)
