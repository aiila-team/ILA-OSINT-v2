"""Parser for NASA API responses."""

from typing import Any
from datetime import datetime, timezone


def _get_current_timestamp() -> str:
    """Return current UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def _extract_tags(*texts: str) -> list[str]:
    """
    Simple keyword-based tag extraction.
    Can be replaced later with NLP/NER enrichment.
    """
    keywords = {
        "mars",
        "moon",
        "earth",
        "satellite",
        "asteroid",
        "comet",
        "galaxy",
        "nebula",
        "solar",
        "eclipse",
        "space",
        "orbit",
        "iss",
        "star",
        "jupiter",
        "venus",
        "mercury",
        "telescope",
    }

    content = " ".join(filter(None, texts)).lower()

    return sorted(
        [keyword for keyword in keywords if keyword in content]
    )


def parse_nasa_response(raw_data: Any) -> list[dict[str, Any]]:
    """
    Parse NASA API responses into standardized events.
    Supports:
    - APOD (Astronomy Picture of the Day)
    - Earthdata/CMR feeds
    """

    if not isinstance(raw_data, dict):
        return []

    collected_at = _get_current_timestamp()

    events: list[dict[str, Any]] = []

    # ==========================================================
    # APOD RESPONSE
    # ==========================================================
    if "date" in raw_data and "title" in raw_data:
        title = raw_data.get("title", "")
        explanation = raw_data.get("explanation", "")

        event = {
            "event_id": f"nasa_apod_{raw_data.get('date')}",
            "source": "nasa",
            "source_id": raw_data.get("date"),

            "title": title,
            "content": explanation,
            "summary": explanation,

            "published_at": raw_data.get("date"),
            "collected_at": collected_at,

            "event_type": "astronomy",
            "category": "space",
            "sub_category": "astronomy_picture_of_the_day",

            "severity": "informational",

            "media_type": raw_data.get("media_type"),
            "media_url": raw_data.get("url"),
            "hd_media_url": raw_data.get("hdurl"),

            "provider": "NASA",
            "author": raw_data.get("copyright"),

            "tags": _extract_tags(title, explanation),

            "entities": [],
            "locations": [],
            "relationships": [],

            "references": [
                {
                    "type": "url",
                    "value": raw_data.get("url"),
                }
            ],

            "metadata": {
                "service_version": raw_data.get("service_version"),
                "copyright": raw_data.get("copyright"),
            },

            "raw": raw_data,
        }

        events.append(event)
        return events

    # ==========================================================
    # EARTHDATA / CMR FEED RESPONSE
    # ==========================================================
    if "feed" in raw_data:
        entries = raw_data.get("feed", {}).get("entry", [])

        for item in entries:
            title = item.get("title", "")
            summary = item.get("summary", "")

            event = {
                "event_id": f"nasa_earthdata_{item.get('id')}",
                "source": "nasa",
                "source_id": item.get("id"),

                "title": title,
                "content": summary,
                "summary": summary,

                "published_at": item.get("updated"),
                "timestamp": item.get("time_start"),
                "collected_at": collected_at,

                "event_type": "satellite_dataset",
                "category": "geospatial",
                "sub_category": "earth_observation",

                "severity": "informational",

                "dataset_id": item.get("id"),

                "provider": "NASA Earthdata",

                "platform": item.get("platform"),
                "instrument": item.get("instrument"),
                "sensor": item.get("sensor"),

                "orbit": item.get("orbit"),
                "processing_level": item.get("processing_level"),

                "bounding_box": item.get("boxes"),
                "polygons": item.get("polygons"),

                "tags": _extract_tags(title, summary),

                "entities": [],
                "locations": [],
                "relationships": [],

                "references": [],

                "metadata": item,

                "raw": item,
            }

            events.append(event)

        return events

    return []