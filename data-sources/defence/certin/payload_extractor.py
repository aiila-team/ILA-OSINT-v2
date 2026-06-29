import re
from datetime import datetime, timezone


def _normalize_certin_date(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("CERT-In advisory date must be a string")

    cleaned = re.sub(r"\s+", " ", value).strip()
    try:
        parsed = datetime.strptime(cleaned, "%B %d, %Y")
    except ValueError as exc:
        raise ValueError(f"Invalid CERT-In timestamp: {value}") from exc

    return parsed.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def certin_to_event_payload(advisory):

    return {
        "event_id": f"certin_{advisory['id']}",

        "source": "cert-in",

        "source_id": "cert-in",

        "content": advisory.get("content") or advisory.get("title", ""),

        "published_at": _normalize_certin_date(advisory["date"]),

        "collected_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),

        "user": None,

        "metadata": {
            "severity": advisory["severity"],
            "reference_url": advisory["url"]
        },

        "entities": {
            "cves": [],
            "urls": [advisory["url"]]
        },

        "media_type": None,
        "media_info": None,
        "media_files": []
    }