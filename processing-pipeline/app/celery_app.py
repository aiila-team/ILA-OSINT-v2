import structlog
from celery import Celery
from celery.signals import worker_ready, worker_shutdown
from kombu import Exchange, Queue

from app.config import settings

log = structlog.get_logger()

# ── Celery application instance ───────────────────────────────────────────────
celery_app = Celery("ila-processing-pipeline")

# ── Exchanges ─────────────────────────────────────────────────────────────────
default_exchange = Exchange("ila", type="direct")

# ── Priority queues ───────────────────────────────────────────────────────────
# critical  → risk scoring, alert generation (not this service, reserved for future)
# high      → publish task — must reach Kafka fast after enrichment
# medium    → dedup, translate, embed — main pipeline stages
# low       → OCR/ASR — slow, never blocks the main chain
# batch     → nightly aggregations, cluster assignments

celery_app.conf.task_queues = (
    Queue("critical", default_exchange, routing_key="critical"),
    Queue("high",     default_exchange, routing_key="high"),
    Queue("medium",   default_exchange, routing_key="medium"),
    Queue("low",      default_exchange, routing_key="low"),
    Queue("batch",    default_exchange, routing_key="batch"),
)

celery_app.conf.task_default_queue    = "medium"
celery_app.conf.task_default_exchange = "ila"
celery_app.conf.task_default_routing_key = "medium"

# ── Task routing — explicit per task ─────────────────────────────────────────
celery_app.conf.task_routes = {
    "app.tasks.dedup.dedup_task":         {"queue": "medium"},
    "app.tasks.translate.translate_task": {"queue": "medium"},
    "app.tasks.ocr.ocr_task":             {"queue": "low"},
    "app.tasks.embed.embed_task":         {"queue": "medium"},
    "app.tasks.publish.publish_task":     {"queue": "high"},
    "app.tasks.dedup.merge_parallel_results": {"queue": "high"},
}

# ── Broker + backend ──────────────────────────────────────────────────────────
celery_app.conf.broker_url    = settings.REDIS_URL
celery_app.conf.result_backend = settings.REDIS_URL
celery_app.conf.broker_transport_options = {
    "socket_timeout": 10.0,
    "socket_connect_timeout": 10.0,
    "socket_keepalive": True,
}

# ── Serialization ─────────────────────────────────────────────────────────────
celery_app.conf.task_serializer   = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content    = ["json"]

# ── Reliability ───────────────────────────────────────────────────────────────
celery_app.conf.task_acks_late             = True   # ack only after task completes
celery_app.conf.task_reject_on_worker_lost = True   # requeue if worker dies mid-task
celery_app.conf.worker_prefetch_multiplier = 1      # one task per worker at a time
                                                     # prevents one worker hoarding queue

# ── Time limits ───────────────────────────────────────────────────────────────
celery_app.conf.task_soft_time_limit = settings.CELERY_TASK_SOFT_TIME_LIMIT
celery_app.conf.task_time_limit      = settings.CELERY_TASK_TIME_LIMIT

# ── Result expiry ─────────────────────────────────────────────────────────────
celery_app.conf.result_expires = 3600   # 1 hour — results are not read back in this pipeline
                                         # chain passes data as arguments, not via result backend

# ── Task tracking ─────────────────────────────────────────────────────────────
celery_app.conf.task_track_started = True

# ── Beat schedule (nightly batch jobs) ───────────────────────────────────────
celery_app.conf.beat_schedule = {
    "nightly-cluster-assignment": {
        "task": "app.tasks.embed.run_hdbscan_clustering",
        "schedule": 3600 * 24,           # every 24 hours
        "options": {"queue": "batch"},
    },
}

# ── Worker lifecycle hooks ────────────────────────────────────────────────────
@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    log.info("celery.worker.ready", hostname=sender.hostname)


@worker_shutdown.connect
def on_worker_shutdown(sender, **kwargs):
    log.info("celery.worker.shutdown", hostname=sender.hostname)


# ── Auto-discover tasks ───────────────────────────────────────────────────────
celery_app.autodiscover_tasks([
    "app.tasks.dedup",
    "app.tasks.translate",
    "app.tasks.ocr",
    "app.tasks.embed",
    "app.tasks.publish",
])