import importlib.util
import json
import logging
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT_DIR = HERE.parents[3]
for p in (str(ROOT_DIR), str(HERE.parent), str(HERE.parent.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

logger = logging.getLogger(__name__)

try:
    from .parser import extract_advisories
    from .payload_extractor import certin_to_event_payload
except ImportError:
    from parser import extract_advisories
    from payload_extractor import certin_to_event_payload

from ingestion.kafka_producer import publish_raw_event


def print_certin_payload(payload):
    print("\n" + "=" * 80)
    print(f"Advisory ID: {payload.get('event_id')}")
    print(f"Title: {payload.get('title')}")
    print(f"Source: {payload.get('source')}")
    print(f"Published: {payload.get('published_at')}")
    print("\nPayload:")
    print(json.dumps(payload, indent=2, default=str))
    print("=" * 80)


def main():

    advisories = extract_advisories()

    print(
        f"\nFound {len(advisories)} advisories\n"
    )

    logger.info("collector_started", extra={"source": "cert-in"})

    for advisory in advisories:
        try:
            payload = certin_to_event_payload(advisory)

            # Publish to shared Kafka producer
            event_id = publish_raw_event(
                source_type="cert-in",
                content=payload.get('content', ''),
                published_at=payload.get('published_at', ''),
                source_url=payload.get('metadata', {}).get('reference_url'),
                payload=payload,
            )
            logger.info(
                "event_published",
                extra={
                    "source": "cert-in",
                    "event_id": event_id,
                    "advisory_id": advisory.get('id'),
                },
            )
            print(f"✓ Published event {event_id}")
            print_certin_payload(payload)

        except Exception as e:
            logger.exception(
                "publish_failed",
                extra={
                    "source": "cert-in",
                    "advisory_id": advisory.get('id'),
                    "error": str(e),
                },
            )
            print(f"✗ Failed {advisory['id']} : {e}")


if __name__ == "__main__":
    main()