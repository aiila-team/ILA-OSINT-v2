from celery import Celery
from celery.signals import worker_ready, worker_shutdown
from kombu import Queue, Exchange
import structlog
from app.config import settings

log = structlog.get_logger()

# ── Celery application instance ───────────────────────────────────────────────
celery_app = Celery("ila-ner-pipeline")

# ── Exchange ──────────────────────────────────────────────────────────────────
default_exchange = Exchange("ner", type="direct")

# ── Queues ────────────────────────────────────────────────────────────────────
# ner-fast  → 9 regex extractors — CPU only, microseconds, high concurrency
# ner-ml    → 3 ML extractors + merge callback + publish — Triton I/O bound
# ner-dlq   → chord error handler — isolated, never blocks main pipeline
celery_app.conf.task_queues = (
    Queue("ner-fast", default_exchange, routing_key="ner.fast"),
    Queue("ner-ml",   default_exchange, routing_key="ner.ml"),
    Queue("ner-dlq",  default_exchange, routing_key="ner.dlq"),
)

celery_app.conf.task_default_queue       = "ner-fast"
celery_app.conf.task_default_exchange    = "ner"
celery_app.conf.task_default_routing_key = "ner.fast"

# ── Task routing ──────────────────────────────────────────────────────────────
celery_app.conf.task_routes = {
    # Dispatch & merge callbacks
    "app.tasks.dispatch.dispatch_ner_pipeline":   {"queue": "ner-ml"},
    "app.tasks.dispatch.dispatch_ner_chord":      {"queue": "ner-ml"},
    "app.tasks.merge.merge_entities":             {"queue": "ner-ml"},
    "app.tasks.merge.handle_chord_error":         {"queue": "ner-dlq"},
    "app.tasks.publish.publish_entity_event":     {"queue": "ner-ml"},

    # Regex extractors (supporting both singular and plural mappings)
    "app.tasks.extractors.extract_phone":         {"queue": "ner-fast"},
    "app.tasks.extractors.extract_phones":        {"queue": "ner-fast"},
    "app.tasks.extractors.extract_email":         {"queue": "ner-fast"},
    "app.tasks.extractors.extract_emails":        {"queue": "ner-fast"},
    "app.tasks.extractors.extract_upi":           {"queue": "ner-fast"},
    "app.tasks.extractors.extract_bank_account":  {"queue": "ner-fast"},
    "app.tasks.extractors.extract_bank_accounts": {"queue": "ner-fast"},
    "app.tasks.extractors.extract_crypto":        {"queue": "ner-fast"},
    "app.tasks.extractors.extract_ip_address":    {"queue": "ner-fast"},
    "app.tasks.extractors.extract_ip_addresses":  {"queue": "ner-fast"},
    "app.tasks.extractors.extract_domain":        {"queue": "ner-fast"},
    "app.tasks.extractors.extract_domains":       {"queue": "ner-fast"},
    "app.tasks.extractors.extract_hashtag":       {"queue": "ner-fast"},
    "app.tasks.extractors.extract_hashtags":      {"queue": "ner-fast"},
    "app.tasks.extractors.extract_mention":       {"queue": "ner-fast"},
    "app.tasks.extractors.extract_mentions":      {"queue": "ner-fast"},

    # ML extractors (supporting both singular and plural mappings)
    "app.tasks.extractors.extract_person":        {"queue": "ner-ml"},
    "app.tasks.extractors.extract_persons":       {"queue": "ner-ml"},
    "app.tasks.extractors.extract_organisation":  {"queue": "ner-ml"},
    "app.tasks.extractors.extract_orgs":          {"queue": "ner-ml"},
    "app.tasks.extractors.extract_location":      {"queue": "ner-ml"},
    "app.tasks.extractors.extract_locations":     {"queue": "ner-ml"},
}

# ── Broker + backend ──────────────────────────────────────────────────────────
celery_app.conf.broker_url     = settings.REDIS_URL
celery_app.conf.result_backend = settings.REDIS_URL

# ── Serialization ─────────────────────────────────────────────────────────────
celery_app.conf.task_serializer   = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content    = ["json"]

# ── Reliability ───────────────────────────────────────────────────────────────
celery_app.conf.task_acks_late             = True
celery_app.conf.task_reject_on_worker_lost = True
celery_app.conf.worker_prefetch_multiplier = 1

# ── Time limits ───────────────────────────────────────────────────────────────
celery_app.conf.task_soft_time_limit = settings.CELERY_TASK_SOFT_TIME_LIMIT
celery_app.conf.task_time_limit      = settings.CELERY_TASK_TIME_LIMIT

# ── Result expiry ─────────────────────────────────────────────────────────────
celery_app.conf.result_expires = settings.CELERY_RESULT_EXPIRES

# ── Chord unlock polling ──────────────────────────────────────────────────────
celery_app.conf.result_chord_join_timeout  = 30.0
celery_app.conf.result_chord_retry_interval = 1.0

# ── Task tracking ─────────────────────────────────────────────────────────────
celery_app.conf.task_track_started = True

# ── Worker lifecycle hooks ────────────────────────────────────────────────────
@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    log.info("ner.worker.ready", hostname=sender.hostname)

@worker_shutdown.connect
def on_worker_shutdown(sender, **kwargs):
    log.info("ner.worker.shutdown", hostname=sender.hostname)

# ── Auto-discover tasks ───────────────────────────────────────────────────────
celery_app.autodiscover_tasks([
    "app.tasks.dispatch",
    "app.tasks.extractors",
    "app.tasks.merge",
    "app.tasks.publish",
])
