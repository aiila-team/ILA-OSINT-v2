# cmd/consumer.py
import asyncio
import logging
import signal
import sys

import structlog
from prometheus_client import start_http_server

from app.config import settings
from app.kafka.consumer import EventConsumer

# Configure Structlog to emit production-ready JSON logs
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(settings.LOG_LEVEL.upper())
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

async def shutdown(consumer: EventConsumer, loop: asyncio.AbstractEventLoop) -> None:
    """Gracefully shuts down the consumer daemon (used on Unix platforms)."""
    logger.info("Shutdown signal received, starting graceful termination")
    await consumer.stop()
    
    # Cancel all running tasks
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for task in tasks:
        task.cancel()
    
    logger.info("Cancelling outstanding tasks")
    await asyncio.gather(*tasks, return_exceptions=True)
    loop.stop()
    logger.info("Daemon shutdown complete")

def main() -> None:
    """Main entry point for the Kafka Consumer daemon."""
    logger.info("Starting Processing Pipeline Consumer Daemon")

    try:
        # 1. Start Prometheus metrics HTTP server
        try:
            start_http_server(settings.PROMETHEUS_PORT)
            logger.info("Prometheus metrics server started", port=settings.PROMETHEUS_PORT)
        except Exception as e:
            logger.critical("Failed to start Prometheus metrics server", error=str(e))
            sys.exit(1)

        # 2. Setup event loop and run consumer
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        consumer = EventConsumer()

        # Register OS signal handlers for graceful shutdown on Unix platforms
        if sys.platform != "win32":
            for sig in (signal.SIGINT, signal.SIGTERM):
                loop.add_signal_handler(
                    sig, 
                    lambda: asyncio.create_task(shutdown(consumer, loop))
                )

        try:
            # Start consumer within the loop
            loop.run_until_complete(consumer.start())
            
            if sys.platform == "win32":
                # On Windows, loop.run_forever doesn't respond well to Ctrl+C
                # Sleep periodically to allow KeyboardInterrupt to be caught
                logger.info("Consumer running. Press Ctrl+C to stop.")
                while True:
                    loop.run_until_complete(asyncio.sleep(1))
            else:
                loop.run_forever()
                
        except (KeyboardInterrupt, SystemExit):
            logger.info("System interruption received, shutting down")
            loop.run_until_complete(consumer.stop())
        finally:
            loop.close()
            logger.info("Process exited")

    except Exception as exc:
        logger.critical("consumer.entry_point.fatal", error=str(exc))
        sys.exit(1)

if __name__ == "__main__":
    main()
