import json
import uuid
from datetime import datetime

from kafka.producer import producer
from kafka.topics import RAW_EVENTS

def publish_raw_event(article):

    payload = {
        "event_id": str(uuid.uuid4()),
        "provenance_id": str(uuid.uuid4()),
        "source_type": "rss",
        "source_url": article["url"],
        "content": article["title"],
        "published_at": article["published"],
        "ingested_at": datetime.utcnow().isoformat()
    }

    producer.produce(
        RAW_EVENTS,
        json.dumps(payload).encode()
    )

    producer.flush()