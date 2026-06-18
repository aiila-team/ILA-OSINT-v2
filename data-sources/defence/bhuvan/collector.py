"""Async collector for the Bhuvan defence source."""

import aiohttp
import asyncio
import os
import sys
import time
from logging import getLogger
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve()
ROOT_DIR = HERE.parents[3]

for p in (str(ROOT_DIR), str(HERE.parent), str(HERE.parent.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from .config import BASE_URL, RATE_LIMIT
    from .parser import parse_bhuvan_response
    from .payload_extractor import build_bhuvan_payload
    from ..continuous_collector import ContinuousCollector
except ImportError:
    from config import BASE_URL, RATE_LIMIT
    from parser import parse_bhuvan_response
    from payload_extractor import build_bhuvan_payload
    from continuous_collector import ContinuousCollector

from ingestion.kafka_producer import publish_raw_event

logger = getLogger(__name__)

# Configuration for continuous collection
COLLECTION_INTERVAL = int(
    os.getenv("BHUVAN_COLLECTION_INTERVAL", "60")
)

MAX_RETRIES = int(
    os.getenv("BHUVAN_MAX_RETRIES", "3")
)

RETRY_DELAY = int(
    os.getenv("BHUVAN_RETRY_DELAY", "5")
)


async def collect() -> list[dict[str, Any]]:
    """
    Collect Bhuvan WMS capabilities,
    transform to AIILA payloads,
    and publish to Kafka.
    """

    logger.info("collector_started", extra={"source": "bhuvan"})

    params = {
        "SERVICE": "WMS",
        "REQUEST": "GetCapabilities",
    }

    async with aiohttp.ClientSession() as session:
        xml_data = await _fetch_bhuvan_xml(session, BASE_URL, params)

    # Parse XML into source records
    records = parse_bhuvan_response(xml_data)

    published_at = datetime.now(
        timezone.utc
    ).isoformat()

    payloads: list[dict[str, Any]] = []

    for record in records:
        try:
            # Convert parsed record to AIILA schema
            event_payload = build_bhuvan_payload(record)

            payloads.append(event_payload)

            # Publish to Kafka
            event_id = publish_raw_event(
                source_type="bhuvan",
                content=event_payload.get(
                    "content",
                    event_payload.get("title", ""),
                ),
                published_at=published_at,
                source_url=None,
                payload=event_payload,
            )

            logger.info(
                "Published bhuvan event",
                extra={
                    "event_id": event_id,
                    "source_id": event_payload.get(
                        "source_id"
                    ),
                },
            )

        except Exception as e:
            logger.error(
                "Failed to publish bhuvan event",
                extra={
                    "error": str(e),
                    "record": record.get("layer_id"),
                },
                exc_info=True,
            )

    logger.info(
        "Collected and published bhuvan events",
        extra={
            "count": len(payloads),
        },
    )

    return payloads


async def _fetch_bhuvan_xml(
    session: aiohttp.ClientSession,
    url: str,
    params: dict[str, Any],
) -> str:
    timeout = aiohttp.ClientTimeout(total=90, connect=30)
    backoff = 1

    for attempt in range(1, MAX_RETRIES + 1):
        start = time.monotonic()
        try:
            async with session.get(url, params=params, timeout=timeout) as response:
                latency = time.monotonic() - start
                if 500 <= response.status < 600:
                    logger.warning(
                        "Bhuvan transient server error",
                        extra={
                            "source": "bhuvan",
                            "status": response.status,
                            "attempt": attempt,
                            "latency_seconds": latency,
                        },
                    )
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(backoff)
                        backoff *= 2
                        continue
                response.raise_for_status()
                return await response.text()
        except (aiohttp.ClientConnectionError, aiohttp.ServerTimeoutError, asyncio.TimeoutError) as exc:
            latency = time.monotonic() - start
            logger.warning(
                "Bhuvan network or timeout failure",
                extra={
                    "source": "bhuvan",
                    "attempt": attempt,
                    "latency_seconds": latency,
                    "error": str(exc),
                },
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            raise


if __name__ == "__main__":

    collector = ContinuousCollector(
        name="bhuvan",
        collect_fn=collect,
        interval=COLLECTION_INTERVAL,
        max_retries=MAX_RETRIES,
        retry_delay=RETRY_DELAY,
    )

    try:
        asyncio.run(
            collector.run_continuous()
        )

    except KeyboardInterrupt:
        print("\nCollection stopped by user.")