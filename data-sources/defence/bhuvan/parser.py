"""Parser for Bhuvan WMS/WFS responses."""

import re
import xml.etree.ElementTree as ET
from typing import Any


_LAYER_SLUG_RE = re.compile(r"^(?P<state>[A-Za-z]{2,3})_(?P<district>[^_]+)_(?P<layer>.+)$")


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

        slug_text = title or layer_id
        slug = ""
        parsed_state = ""
        parsed_district = ""
        parsed_layer = ""
        if slug_text:
            slug_match = _LAYER_SLUG_RE.match(slug_text)
            if slug_match:
                slug = slug_text
                parsed_state = slug_match.group("state").upper()
                parsed_district = slug_match.group("district")
                parsed_layer = slug_match.group("layer")

        queryable = layer.get("queryable") == "1"
        styles = [
            style.findtext("Name", "").strip()
            for style in layer.findall("Style")
            if style.findtext("Name")
        ]

        srs = [
            s.text.strip()
            for s in layer.findall("SRS")
            if s.text and s.text.strip()
        ]

        latlon_bbox = {}
        latlon_tag = layer.find("LatLonBoundingBox")
        if latlon_tag is not None:
            latlon_bbox = {
                "minx": latlon_tag.get("minx"),
                "miny": latlon_tag.get("miny"),
                "maxx": latlon_tag.get("maxx"),
                "maxy": latlon_tag.get("maxy"),
            }

        bounding_boxes = []
        for bbox_tag in layer.findall("BoundingBox"):
            bbox = {
                "srs": bbox_tag.get("SRS") or bbox_tag.get("CRS"),
                "minx": bbox_tag.get("minx"),
                "miny": bbox_tag.get("miny"),
                "maxx": bbox_tag.get("maxx"),
                "maxy": bbox_tag.get("maxy"),
            }
            bounding_boxes.append(bbox)

        layers.append(
            {
                "layer_id": layer_id,
                "title": title,
                "abstract": abstract,
                "layer_type": layer_type,
                "slug": slug,
                "parsed_state": parsed_state,
                "parsed_district": parsed_district,
                "parsed_layer": parsed_layer,
                "srs": srs,
                "latlon_bbox": latlon_bbox,
                "bounding_boxes": bounding_boxes,
                "queryable": queryable,
                "styles": styles,

                # Original source metadata
                "raw": {
                    "name": layer_id,
                    "title": title,
                    "abstract": abstract,
                    "slug": slug,
                    "parsed_state": parsed_state,
                    "parsed_district": parsed_district,
                    "parsed_layer": parsed_layer,
                    "srs": srs,
                    "latlon_bbox": latlon_bbox,
                    "bounding_boxes": bounding_boxes,
                    "queryable": queryable,
                    "styles": styles,
                },
            }
        )

    return layers