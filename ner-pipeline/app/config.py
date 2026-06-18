from functools import lru_cache
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import urlparse, urlunparse

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # ── Kafka ────────────────────────────────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = Field(default="localhost:9092")
    KAFKA_INPUT_TOPIC: str = Field(default="enriched-data")
    KAFKA_OUTPUT_TOPIC: str = Field(default="entity-events")
    KAFKA_DLQ_TOPIC: str = Field(default="processing.failed")
    KAFKA_CONSUMER_GROUP: str = Field(default="ner-pipeline-v1")
    KAFKA_AUTO_OFFSET_RESET: str = Field(default="earliest")
    KAFKA_MAX_POLL_RECORDS: int = Field(default=50)

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = Field(default="redis://localhost:6379/0")
    REDIS_MURIL_CACHE_DB: int = Field(default=2)
    REDIS_MURIL_CACHE_TTL: int = Field(default=60)

    # ── Celery ───────────────────────────────────────────────────────────────
    CELERY_TASK_SOFT_TIME_LIMIT: int = Field(default=60)
    CELERY_TASK_TIME_LIMIT: int = Field(default=90)
    CELERY_RESULT_EXPIRES: int = Field(default=300)

    # ── Triton ───────────────────────────────────────────────────────────────
    TRITON_URL: str = Field(default="http://localhost:8000")
    TRITON_TIMEOUT_SECONDS: float = Field(default=10.0)
    TRITON_MURIL_MODEL_NAME: str = Field(default="muril-ner")

    # ── NER ──────────────────────────────────────────────────────────────────
    NER_CONFIDENCE_THRESHOLD: float = Field(default=0.75)
    NER_PHONE_DEFAULT_REGION: str = Field(default="IN")
    NER_MAX_CONTENT_CHARS: int = Field(default=10000)

    # ── Domain extraction ────────────────────────────────────────────────────
    NER_EXCLUDED_DOMAINS: set[str] = Field(
        default={
            "twitter.com", "t.me", "telegram.org",
            "youtube.com", "youtu.be", "facebook.com",
            "instagram.com", "reddit.com", "linkedin.com",
            "google.com", "whatsapp.com",
        }
    )

    # ── GeoNames ─────────────────────────────────────────────────────────────
    GEONAMES_DB_PATH: str = Field(default="/data/geonames/IN.txt")
    GEONAMES_ENABLED: bool = Field(default=True)

    # ── Observability ────────────────────────────────────────────────────────
    LOG_LEVEL: str = Field(default="INFO")
    PROMETHEUS_PORT: int = Field(default=8002)

    # ── Environment ──────────────────────────────────────────────────────────
    ENVIRONMENT: str = Field(default="development")

    # ── Clean TRITON_URL for Client Library Compatibility ────────
    @model_validator(mode="after")
    def clean_triton_url(self) -> "Settings":
        """Strips scheme (http:// or https://) if present in TRITON_URL."""
        url = self.TRITON_URL
        if url.startswith("http://"):
            self.TRITON_URL = url[7:]
        elif url.startswith("https://"):
            self.TRITON_URL = url[8:]
        return self

    # ── Backward Compatibility Properties ──────────────────────────
    @property
    def KAFKA_CONSUMER_GROUP_ID(self) -> str:
        return self.KAFKA_CONSUMER_GROUP

    @property
    def KAFKA_FAILED_TOPIC(self) -> str:
        return self.KAFKA_DLQ_TOPIC

    @property
    def CONFIDENCE_THRESHOLD(self) -> float:
        return self.NER_CONFIDENCE_THRESHOLD

    @property
    def CELERY_BROKER_URL(self) -> str:
        return self.REDIS_URL

    @property
    def CELERY_RESULT_BACKEND(self) -> str:
        return self.REDIS_URL

    @property
    def MURIL_MODEL_NAME(self) -> str:
        return self.TRITON_MURIL_MODEL_NAME

    @property
    def MURIL_CACHE_TTL(self) -> int:
        return self.REDIS_MURIL_CACHE_TTL

    @property
    def REDIS_MURIL_CACHE_URL(self) -> str:
        """Parses REDIS_URL and replaces the database index with REDIS_MURIL_CACHE_DB."""
        try:
            parsed = urlparse(self.REDIS_URL)
            new_path = f"/{self.REDIS_MURIL_CACHE_DB}"
            new_parsed = parsed._replace(path=new_path)
            return urlunparse(new_parsed)
        except Exception:
            return self.REDIS_URL

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
