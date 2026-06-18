from datetime import datetime, timezone


def build_bhuvan_payload(layer: dict) -> dict:
    """
    Convert parsed Bhuvan layer into AIILA standard schema.
    """

    return {
        "event_id": f"bhuvan_{layer['layer_id']}",

        "source": "bhuvan",
        "source_type": "geospatial",

        "source_id": layer["layer_id"],

        "title": layer["title"],

        "content": (
            layer["abstract"]
            or layer["title"]
            or layer["layer_id"]
        ),

        "published_at": None,

        "collected_at": datetime.now(
            timezone.utc
        ).isoformat(),

        "event_type": "geospatial_dataset",

        "category": "geoint",

        "provider": "NRSC",

        "dataset_name": layer["layer_id"],

        "dataset_type": layer["layer_type"],

        "tags": [],

        "entities": [],

        "locations": [],

        "relationships": [],

        "metadata": {
            "layer_type": layer["layer_type"]
        },

        "raw": layer["raw"],
    }