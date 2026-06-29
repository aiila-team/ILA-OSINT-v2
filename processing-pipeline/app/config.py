# app/config.py
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Kafka ────────────────────────────────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_INPUT_TOPIC_PATTERN: str = r"raw-events\..*"
    KAFKA_OUTPUT_TOPIC: str = "enriched-data"
    KAFKA_DLQ_TOPIC: str = "processing.failed"
    KAFKA_CONSUMER_GROUP: str = "processing-pipeline-v1"
    KAFKA_AUTO_OFFSET_RESET: str = "earliest"
    KAFKA_MAX_POLL_RECORDS: int = 100

    # ── Redis (Celery broker + dedup store) ──────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_DEDUP_DB: int = 1          # separate DB for dedup keys — no eviction risk

    # ── Celery ───────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    CELERY_WORKER_CONCURRENCY: int = 4
    CELERY_TASK_SOFT_TIME_LIMIT: int = 120   # seconds — task gets SoftTimeLimitExceeded
    CELERY_TASK_TIME_LIMIT: int = 180        # hard kill after this

    # ── Model serving (Triton) ───────────────────────────────────────────────
    TRITON_URL: str = "http://localhost:8000"
    TRITON_TIMEOUT_SECONDS: float = 30.0

    # ── Deduplication ────────────────────────────────────────────────────────
    DEDUP_JACCARD_THRESHOLD: float = 0.85
    DEDUP_NUM_PERM: int = 128
    DEDUP_TTL_DAYS: int = 7
    DEDUP_MINHASH_SCAN_LIMIT: int = 500      # max LSH keys scanned per doc

    # ── Translation ──────────────────────────────────────────────────────────
    TRANSLATION_MIN_CONFIDENCE: float = 0.6  # below this → flag translation_failed
    TRANSLATION_MAX_CHARS: int = 5000        # truncate before sending to Triton

    # ── Embedding ────────────────────────────────────────────────────────────
    EMBED_MODEL_NAME: str = "intfloat/multilingual-e5-large"
    EMBED_DEVICE: str = "cpu"                # override to "cuda" on GPU workers
    EMBED_BATCH_SIZE: int = 1                # single doc per Celery task

    # ── OCR / ASR ────────────────────────────────────────────────────────────
    OCR_LANG_STRING: str = "eng+hin+ben+tel+tam+urd"
    OCR_MAX_MEDIA_ITEMS: int = 3             # cap per document
    OCR_FETCH_TIMEOUT_SECONDS: float = 10.0
    TESSERACT_CMD: str | None = None
    INDIC_CONFORMER_URL: str | None = None

    # ── Observability ────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    PROMETHEUS_PORT: int = 8001

    # ── Environment ──────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"         # development | staging | production

    # ── Backward Compatibility Properties ────────────────────────────────────
    @property
    def KAFKA_CONSUMER_GROUP_ID(self) -> str:
        return self.KAFKA_CONSUMER_GROUP

    @property
    def KAFKA_RAW_TOPIC_PATTERN(self) -> str:
        return self.KAFKA_INPUT_TOPIC_PATTERN

    @property
    def KAFKA_ENRICHED_TOPIC(self) -> str:
        return self.KAFKA_OUTPUT_TOPIC

    @property
    def KAFKA_FAILED_TOPIC(self) -> str:
        return self.KAFKA_DLQ_TOPIC

    @property
    def TRITON_SERVER_URL(self) -> str:
        return self.TRITON_URL

    @property
    def EMBEDDING_MODEL_NAME(self) -> str:
        return self.EMBED_MODEL_NAME

    @property
    def REDIS_DEDUP_TTL_SECONDS(self) -> int:
        return self.DEDUP_TTL_DAYS * 24 * 60 * 60


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


# module-level singleton — import this everywhere
settings = get_settings()
