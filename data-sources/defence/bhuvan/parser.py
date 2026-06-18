"""Parser for Bhuvan WMS/WFS responses."""

import xml.etree.ElementTree as ET
from typing import Any


def parse_bhuvan_response(raw_data: Any) -> list[dict[str, Any]]:
    """
    Parse Bhuvan WMS/WFS XML responses into normalized layer records.

    Responsibility:
    - Understand Bhuvan XML
    - Extract layer metadata
    - Return source-specific records

    Does NOT:
    - Generate AIILA event schema
    - Create event IDs
    - Perform classification
    - Build Kafka payloads
    """

    if not isinstance(raw_data, str):
        return []

    try:
        root = ET.fromstring(raw_data)
    except ET.ParseError:
        return []

    layers = []
    seen = set()

    for layer in root.findall(".//Layer"):

        name_tag = layer.find("Name")

        if name_tag is None or not name_tag.text:
            continue

        layer_id = name_tag.text.strip()

        if not layer_id or layer_id in seen:
            continue

        seen.add(layer_id)

        title_tag = layer.find("Title")
        abstract_tag = layer.find("Abstract")

        title = (
            title_tag.text.strip()
            if title_tag is not None and title_tag.text
            else ""
        )

        abstract = (
            abstract_tag.text.strip()
            if abstract_tag is not None and abstract_tag.text
            else ""
        )

        layer_type = (
            layer_id.split(":")[0]
            if ":" in layer_id
            else ""
        )

        layers.append(
            {
                "layer_id": layer_id,
                "title": title,
                "abstract": abstract,
                "layer_type": layer_type,

                # Original source metadata
                "raw": {
                    "name": layer_id,
                    "title": title,
                    "abstract": abstract,
                },
            }
        )

    return layers