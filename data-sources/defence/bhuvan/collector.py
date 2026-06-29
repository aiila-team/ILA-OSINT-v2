"""Async collector for the Bhuvan defence source."""

import aiohttp
import asyncio
import json
import os
import sys
import time
from logging import getLogger
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

HERE = Path(__file__).resolve()
ROOT_DIR = HERE.parents[3]

for p in (str(ROOT_DIR), str(HERE.parent), str(HERE.parent.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from .config import BASE_URL, RATE_LIMIT
    from .parser import parse_bhuvan_response
    from .payload_extractor import build_bhuvan_feature_payload, build_bhuvan_payload
    from ..continuous_collector import ContinuousCollector
except ImportError:
    from config import BASE_URL, RATE_LIMIT
    from parser import parse_bhuvan_response
    from payload_extractor import build_bhuvan_feature_payload, build_bhuvan_payload
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

MAX_FEATURE_LAYERS = int(
    os.getenv("BHUVAN_MAX_FEATURE_LAYERS", "20")
)

MAX_FEATURES_PER_LAYER = int(
    os.getenv("BHUVAN_MAX_FEATURES_PER_LAYER", "5")
)

FEATURE_INFO_FORMAT = "application/json"


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

    payloads: list[dict[str, Any]] = []
    published_at = datetime.now(timezone.utc).isoformat()

    async with aiohttp.ClientSession() as session:
        xml_data = await _fetch_bhuvan_xml(session, BASE_URL, params)

        # Parse XML into source records
        records = parse_bhuvan_response(xml_data)

        for record in records:
            try:
                event_payload = build_bhuvan_payload(record)
                payloads.append(event_payload)
                event_id = publish_raw_event(
                    source_type="bhuvan",
                    content=event_payload.get(
                        "content",
                        event_payload.get("title", ""),
                    ),
                    published_at=published_at,
                    source_url=f"{BASE_URL}?SERVICE=WMS&REQUEST=GetCapabilities",
                    payload=event_payload,
                )
                logger.info(
                    "Published bhuvan dataset event",
                    extra={
                        "event_id": event_id,
                        "source_id": event_payload.get("source_id"),
                    },
                )
            except Exception as e:
                logger.error(
                    "Failed to publish bhuvan dataset event",
                    extra={
                        "error": str(e),
                        "record": record.get("layer_id"),
                    },
                    exc_info=True,
                )

        queryable_layers = [record for record in records if record.get("queryable")]
        for layer in queryable_layers[:MAX_FEATURE_LAYERS]:
            source_url = _build_feature_info_url(layer)
            try:
                feature_collection = await _fetch_bhuvan_feature_info(session, layer)
                if not feature_collection:
                    continue

                features = feature_collection.get("features", [])[:MAX_FEATURES_PER_LAYER]
                for feature in features:
                    try:
                        feature_payload = build_bhuvan_feature_payload(feature, layer, source_url)
                        payloads.append(feature_payload)
                        event_id = publish_raw_event(
                            source_type="bhuvan",
                            content=feature_payload.get(
                                "content",
                                feature_payload.get("title", ""),
                            ),
                            published_at=published_at,
                            source_url=source_url,
                            payload=feature_payload,
                        )
                        logger.info(
                            "Published bhuvan feature event",
                            extra={
                                "event_id": event_id,
                                "source_id": feature_payload.get("source_id"),
                                "layer_id": layer.get("layer_id"),
                            },
                        )
                    except Exception as inner_exc:
                        logger.error(
                            "Failed to publish bhuvan feature event",
                            extra={
                                "error": str(inner_exc),
                                "layer": layer.get("layer_id"),
                                "feature": feature.get("id"),
                            },
                            exc_info=True,
                        )
            except Exception as exc:
                logger.warning(
                    "Bhuvan feature extraction skipped for layer",
                    extra={
                        "error": str(exc),
                        "layer_id": layer.get("layer_id"),
                    },
                )

    logger.info(
        "Collected and published bhuvan events",
        extra={
            "count": len(payloads),
        },
    )

    return payloads


def _build_feature_info_url(layer: dict[str, Any]) -> str:
    params = _feature_info_params(layer)
    return f"{BASE_URL}?{urlencode(params)}"


def _feature_info_params(layer: dict[str, Any]) -> dict[str, Any]:
    bbox = layer.get("latlon_bbox") or {}
    minx = _safe_float(bbox.get("minx"))
    miny = _safe_float(bbox.get("miny"))
    maxx = _safe_float(bbox.get("maxx"))
    maxy = _safe_float(bbox.get("maxy"))

    if minx is None or miny is None or maxx is None or maxy is None:
        minx, miny, maxx, maxy = -180.0, -90.0, 180.0, 90.0

    srs_values = layer.get("srs") or []
    srs = srs_values[0] if srs_values else "EPSG:4326"

    return {
        "SERVICE": "WMS",
        "REQUEST": "GetFeatureInfo",
        "LAYERS": layer.get("layer_id"),
        "QUERY_LAYERS": layer.get("layer_id"),
        "INFO_FORMAT": FEATURE_INFO_FORMAT,
        "FEATURE_COUNT": str(MAX_FEATURES_PER_LAYER),
        "SRS": srs,
        "BBOX": f"{minx},{miny},{maxx},{maxy}",
        "WIDTH": "256",
        "HEIGHT": "256",
        "X": "128",
        "Y": "128",
        "STYLES": "",
    }


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


async def _fetch_bhuvan_feature_info(
    session: aiohttp.ClientSession,
    layer: dict[str, Any],
) -> dict[str, Any] | None:
    params = _feature_info_params(layer)
    timeout = aiohttp.ClientTimeout(total=90, connect=30)
    backoff = 1
    url = BASE_URL

    for attempt in range(1, MAX_RETRIES + 1):
        start = time.monotonic()
        try:
            async with session.get(url, params=params, timeout=timeout) as response:
                latency = time.monotonic() - start
                if 500 <= response.status < 600:
                    logger.warning(
                        "Bhuvan feature info transient server error",
                        extra={
                            "source": "bhuvan",
                            "layer_id": layer.get("layer_id"),
                            "status": response.status,
                            "attempt": attempt,
                            "latency_seconds": latency,
                        },
                    )
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(backoff)
                        backoff *= 2
                        continue
                text = await response.text()
                response.raise_for_status()
                payload = json.loads(text)
                if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
                    return None
                return payload
        except (aiohttp.ClientConnectionError, aiohttp.ServerTimeoutError, asyncio.TimeoutError, json.JSONDecodeError) as exc:
            latency = time.monotonic() - start
            logger.warning(
                "Bhuvan feature info network or parse failure",
                extra={
                    "source": "bhuvan",
                    "layer_id": layer.get("layer_id"),
                    "attempt": attempt,
                    "latency_seconds": latency,
                    "error": str(exc),
                },
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            return None
        except aiohttp.ClientResponseError as exc:
            latency = time.monotonic() - start
            logger.warning(
                "Bhuvan feature info http failure",
                extra={
                    "source": "bhuvan",
                    "layer_id": layer.get("layer_id"),
                    "status": exc.status,
                    "attempt": attempt,
                    "latency_seconds": latency,
                    "error": str(exc),
                },
            )
            return None


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