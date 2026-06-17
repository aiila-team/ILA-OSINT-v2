import asyncio
import signal
import sys
import structlog

from app.kafka.consumer import consume_forever

# ── structlog configuration ───────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(10),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

log = structlog.get_logger()


def _handle_signal(sig, frame) -> None:
    log.info("ner_consumer.signal_received", signal=sig)
    sys.exit(0)


def main() -> None:
    # Register standard system signals for termination
    signal.signal(signal.SIGINT,  _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    log.info("ner_consumer.entry_point.starting")

    try:
        asyncio.run(consume_forever())
    except SystemExit:
        log.info("ner_consumer.entry_point.exit")
    except Exception as exc:
        log.error("ner_consumer.entry_point.fatal", error=str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
