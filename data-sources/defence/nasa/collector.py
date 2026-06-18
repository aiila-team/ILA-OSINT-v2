"""Async collector for the NASA defence source."""

import aiohttp
import asyncio
import os
import sys
import time
from logging import getLogger
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve()
ROOT_DIR = HERE.parents[3]
for p in (str(ROOT_DIR), str(HERE.parent), str(HERE.parent.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from .config import BASE_URL, NASA_API_KEY
    from .parser import parse_nasa_response
    from ..continuous_collector import ContinuousCollector
except ImportError:
    from config import BASE_URL, NASA_API_KEY
    from parser import parse_nasa_response
    from continuous_collector import ContinuousCollector

from ingestion.kafka_producer import publish_raw_event

logger = getLogger(__name__)

# Configuration for continuous collection
COLLECTION_INTERVAL = int(os.getenv('NASA_COLLECTION_INTERVAL', '60'))  # seconds
MAX_RETRIES = int(os.getenv('NASA_MAX_RETRIES', '3'))
RETRY_DELAY = int(os.getenv('NASA_RETRY_DELAY', '5'))  # seconds


async def collect() -> list[dict[str, Any]]:
    """Collect NASA Earthdata metadata and publish to Kafka."""
    logger.info("collector_started", extra={"source": "nasa"})

    if not NASA_API_KEY:
        logger.warning('NASA API key not set; skipping NASA collection', extra={"source": "nasa"})
        return []

    params = {'api_key': NASA_API_KEY}
    try:
        async with aiohttp.ClientSession() as session:
            payload = await _fetch_nasa_payload(session, BASE_URL, params)
    except aiohttp.ClientResponseError as exc:
        logger.error(
            'NASA collector HTTP error',
            extra={
                'source': 'nasa',
                'status': exc.status,
                'error': str(exc),
            },
            exc_info=True,
        )
        return []
    except Exception as exc:
        logger.exception(
            'Unexpected error in NASA collector',
            extra={'source': 'nasa', 'error': str(exc)},
        )
        return []

    records = parse_nasa_response(payload)
    
    # Normalize each record and publish to shared Kafka producer
    for record in records:
        try:
            event_id = publish_raw_event(
                source_type="nasa",
                content=record.get('title', ''),
                published_at=record.get('published_at') or record.get('timestamp') or '',
                source_url=record.get('url'),
                payload=record,
            )
            logger.info(
                "event_published",
                extra={"source": "nasa", "event_id": event_id},
            )
        except Exception as e:
            logger.exception(
                "publish_failed",
                extra={"source": "nasa", "reason": str(e), "record": record.get('id')},
            )
    
    logger.info(
        "collection_success",
        extra={"source": "nasa", "events_collected": len(records)},
    )
    return records


async def _fetch_nasa_payload(
    session: aiohttp.ClientSession,
    url: str,
    params: dict[str, Any],
) -> Any:
    timeout = aiohttp.ClientTimeout(total=90, connect=30)
    backoff = 1

    for attempt in range(1, MAX_RETRIES + 1):
        start = time.monotonic()
        try:
            async with session.get(url, params=params, timeout=timeout) as response:
                latency = time.monotonic() - start
                if 500 <= response.status < 600:
                    logger.warning(
                        "NASA transient server error",
                        extra={
                            "source": "nasa",
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
                return await response.json()
        except (aiohttp.ClientConnectionError, aiohttp.ServerTimeoutError, asyncio.TimeoutError) as exc:
            latency = time.monotonic() - start
            logger.warning(
                "NASA transient network failure",
                extra={
                    "source": "nasa",
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

if __name__ == '__main__':
    collector = ContinuousCollector(
        name='nasa',
        collect_fn=collect,
        interval=COLLECTION_INTERVAL,
        max_retries=MAX_RETRIES,
        retry_delay=RETRY_DELAY,
    )
    
    try:
        asyncio.run(collector.run_continuous())
    except KeyboardInterrupt:
        print('\nCollection stopped by user.')

