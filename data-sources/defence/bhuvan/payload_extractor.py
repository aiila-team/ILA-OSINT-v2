import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

_LAYER_SLUG_RE = re.compile(r"^(?P<state>[A-Za-z]{2,3})_(?P<district>[^_]+)_(?P<layer>.+)$")


def _parse_layer_slug(value: str) -> dict[str, str]:
    if not value:
        return {}
    match = _LAYER_SLUG_RE.match(value)
    if not match:
        return {}
    return {
        "parsed_state": match.group("state").upper(),
        "parsed_district": match.group("district"),
        "parsed_layer": match.group("layer"),
    }


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (ValueError, TypeError):
        return None


def _build_location(layer: dict, slug: dict[str, str]) -> dict[str, Any] | None:
    bbox = layer.get("latlon_bbox") or {}
    minx = _safe_float(bbox.get("minx"))
    miny = _safe_float(bbox.get("miny"))
    maxx = _safe_float(bbox.get("maxx"))
    maxy = _safe_float(bbox.get("maxy"))
    if minx is None or miny is None or maxx is None or maxy is None:
        return None

    name = slug.get("parsed_district") or slug.get("parsed_state") or layer.get("title") or layer.get("layer_id")
    location = {
        "name": name,
        "lat": (miny + maxy) / 2,
        "lon": (minx + maxx) / 2,
    }
    if slug.get("parsed_state"):
        location["state"] = slug["parsed_state"]
    if slug.get("parsed_district"):
        location["city"] = slug["parsed_district"]
    return location


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _parse_feature_id(feature: dict[str, Any], layer: dict[str, Any]) -> str:
    candidate = _safe_str(feature.get("id"))
    if not candidate:
        properties = feature.get("properties") or {}
        candidate = _safe_str(
            properties.get("id")
            or properties.get("name")
            or properties.get("NAME")
            or properties.get("Name")
        )
    if candidate:
        return re.sub(r"[^A-Za-z0-9_\-]+", "_", candidate)

    fingerprint = hashlib.sha1(
        json.dumps(feature, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()[:16]
    layer_id = _safe_str(layer.get("layer_id"))
    sanitized_layer_id = re.sub(r"[^A-Za-z0-9_\-]+", "_", layer_id)
    return f"{sanitized_layer_id}_{fingerprint}"


def _geometry_centroid(geometry: dict[str, Any]) -> dict[str, float] | None:
    if not isinstance(geometry, dict):
        return None

    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")

    if geom_type == "Point" and isinstance(coords, list) and len(coords) >= 2:
        return {"lon": float(coords[0]), "lat": float(coords[1])}

    if geom_type in {"LineString", "MultiPoint"} and isinstance(coords, list):
        points = [tuple(point) for point in coords if isinstance(point, list) and len(point) >= 2]
        if points:
            lon = sum(p[0] for p in points) / len(points)
            lat = sum(p[1] for p in points) / len(points)
            return {"lon": lon, "lat": lat}

    if geom_type in {"Polygon", "MultiLineString"} and isinstance(coords, list):
        ring = coords[0] if coords else []
        points = [tuple(point) for point in ring if isinstance(point, list) and len(point) >= 2]
        if points:
            lon = sum(p[0] for p in points) / len(points)
            lat = sum(p[1] for p in points) / len(points)
            return {"lon": lon, "lat": lat}

    if geom_type == "MultiPolygon" and isinstance(coords, list):
        first_polygon = coords[0] if coords else []
        ring = first_polygon[0] if first_polygon else []
        points = [tuple(point) for point in ring if isinstance(point, list) and len(point) >= 2]
        if points:
            lon = sum(p[0] for p in points) / len(points)
            lat = sum(p[1] for p in points) / len(points)
            return {"lon": lon, "lat": lat}

    return None


def _build_feature_tags(layer: dict, slug: dict[str, str], properties: dict[str, Any] | None = None) -> list[str]:
    base_tags = [
        "bhuvan",
        "geospatial",
        "geoint",
        "defence",
        "monitoring",
        "strategic_warning",
        "disaster_intelligence",
        "border_activity_monitoring",
    ]
    property_text = " ".join(
        str(value) for value in (properties or {}).values() if value is not None
    )
    content = " ".join(
        filter(None, [
            layer.get("layer_id", ""),
            layer.get("title", ""),
            layer.get("abstract", ""),
            slug.get("parsed_layer", ""),
            property_text,
        ])
    ).lower()
    if any(keyword in content for keyword in ["landslide", "slope", "flood", "ndvi", "drainage", "erosion"]):
        base_tags.append("hydro_meteorological")
    if any(keyword in content for keyword in ["border", "patrol", "security", "fence", "river", "frontier"]):
        base_tags.append("border_security")
    if any(keyword in content for keyword in ["road", "rail", "airport", "terminal", "bridge", "tunnel", "pipeline"]):
        base_tags.append("infrastructure")
    if any(keyword in content for keyword in ["settlement", "city", "village", "town", "urban"]):
        base_tags.append("settlement")
    return sorted(set(base_tags))


def _build_feature_title(feature: dict[str, Any], layer: dict[str, Any], slug: dict[str, str]) -> str:
    properties = feature.get("properties") or {}
    title = _safe_str(
        feature.get("id")
        or properties.get("name")
        or properties.get("NAME")
        or properties.get("Name")
        or slug.get("parsed_layer")
    )
    if title:
        return title
    return layer.get("title") or layer.get("layer_id")


def _build_feature_content(feature: dict[str, Any], layer: dict[str, Any], slug: dict[str, str]) -> str:
    properties = feature.get("properties") or {}
    attributes = []
    for key, value in properties.items():
        if value is None:
            continue
        attributes.append(f"{key}={value}")
        if len(attributes) >= 5:
            break
    if not attributes:
        attributes = [f"Layer={layer.get('layer_id')}"]

    region_parts = []
    if slug.get("parsed_state"):
        region_parts.append(slug["parsed_state"])
    if slug.get("parsed_district"):
        region_parts.append(slug["parsed_district"])

    content_parts = [
        f"Feature from Bhuvan layer {layer.get('layer_id')}",
        "; ".join(attributes),
    ]
    if region_parts:
        content_parts.append("Region: " + ", ".join(region_parts))
    return " | ".join([part for part in content_parts if part])


def _build_feature_summary(feature: dict[str, Any], layer: dict[str, Any], slug: dict[str, str]) -> str:
    feature_title = _build_feature_title(feature, layer, slug)
    summary = [feature_title]
    if slug.get("parsed_layer"):
        summary.append(slug["parsed_layer"])
    return " | ".join(summary)


def _build_feature_location(feature: dict[str, Any], layer: dict[str, Any], slug: dict[str, str]) -> dict[str, Any] | None:
    geom = feature.get("geometry") or {}
    centroid = _geometry_centroid(geom)
    if not centroid:
        return None

    location = {
        "name": _build_feature_title(feature, layer, slug),
        "lat": centroid["lat"],
        "lon": centroid["lon"],
    }
    if slug.get("parsed_state"):
        location["state"] = slug["parsed_state"]
    if slug.get("parsed_district"):
        location["city"] = slug["parsed_district"]
    return location


def _build_feature_payload(feature: dict[str, Any], layer: dict[str, Any], source_url: str) -> dict[str, Any]:
    slug = _parse_layer_slug(layer.get("title") or layer.get("layer_id") or "")
    feature_id = _parse_feature_id(feature, layer)
    feature_type = slug.get("parsed_layer") or layer.get("layer_type") or "geospatial_feature"
    properties = feature.get("properties") or {}
    location = _build_feature_location(feature, layer, slug)
    tags = _build_feature_tags(layer, slug, properties)
    content = _build_feature_content(feature, layer, slug)
    summary = _build_feature_summary(feature, layer, slug)

    entities = [
        {
            "type": "dataset",
            "value": layer.get("layer_id"),
            "metadata": {
                "layer_type": layer.get("layer_type"),
                "slug": slug.get("parsed_layer"),
            },
        },
        {
            "type": "feature_type",
            "value": feature_type,
            "metadata": {},
        },
    ]
    if slug.get("parsed_state"):
        entities.append(
            {
                "type": "location",
                "value": slug["parsed_state"],
                "metadata": {"level": "state"},
            }
        )
    if slug.get("parsed_district"):
        entities.append(
            {
                "type": "location",
                "value": slug["parsed_district"],
                "metadata": {"level": "district"},
            }
        )

    relationships = [
        {
            "type": "derived_from",
            "source": feature_id,
            "target": layer.get("layer_id"),
        }
    ]
    if location:
        relationships.append(
            {
                "type": "observed_at",
                "source": feature_id,
                "target": location.get("name"),
            }
        )

    metadata = {
        "layer_id": layer.get("layer_id"),
        "layer_title": layer.get("title"),
        "layer_type": layer.get("layer_type"),
        "feature_id": feature_id,
        "feature_type": feature_type,
        "feature_properties": properties,
        "feature_geometry_type": (feature.get("geometry") or {}).get("type"),
        "feature_geometry": feature.get("geometry"),
        "feature_source_url": source_url,
    }
    if slug.get("parsed_state"):
        metadata["state"] = slug["parsed_state"]
    if slug.get("parsed_district"):
        metadata["district"] = slug["parsed_district"]

    return {
        "event_id": f"bhuvan_feature_{feature_id}",
        "source": "bhuvan",
        "source_type": "geospatial",
        "source_id": feature_id,
        "title": _build_feature_title(feature, layer, slug),
        "content": content,
        "summary": summary,
        "published_at": datetime.now(timezone.utc).isoformat(),
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "event_type": "geospatial_feature",
        "category": "geoint",
        "provider": "NRSC",
        "dataset_name": layer.get("layer_id"),
        "dataset_type": layer.get("layer_type"),
        "tags": tags,
        "entities": entities,
        "locations": [location] if location else [],
        "relationships": relationships,
        "metadata": metadata,
        "raw": feature,
    }


def build_bhuvan_feature_payload(feature: dict[str, Any], layer: dict[str, Any], source_url: str) -> dict[str, Any]:
    return _build_feature_payload(feature, layer, source_url)


def _build_dataset_tags(layer: dict, slug: dict[str, str]) -> list[str]:
    content_parts = [
        layer.get("abstract") or "",
        f"Layer: {layer.get('title') or layer.get('layer_id')}" if layer.get("title") or layer.get("layer_id") else "",
        f"Layer type: {layer.get('layer_type')}" if layer.get("layer_type") else "",
    ]
    if slug.get("parsed_state") or slug.get("parsed_district"):
        region_parts = []
        if slug.get("parsed_state"):
            region_parts.append(slug["parsed_state"])
        if slug.get("parsed_district"):
            region_parts.append(slug["parsed_district"])
        content_parts.append("Region: " + ", ".join(region_parts))
    if layer.get("srs"):
        content_parts.append(f"Projections: {', '.join(layer['srs'])}")
    bbox = layer.get("latlon_bbox") or {}
    if any(bbox.values()):
        content_parts.append(
            "LatLonBoundingBox: " + ", ".join(
                f"{k}={v}" for k, v in bbox.items() if v
            )
        )
    if layer.get("bounding_boxes"):
        boxes = []
        for box in layer["bounding_boxes"]:
            details = [
                f"{k}={v}" for k, v in box.items() if v and k != "srs"
            ]
            if box.get("srs"):
                details.insert(0, f"SRS={box['srs']}")
            if details:
                boxes.append("(" + ", ".join(details) + ")")
        if boxes:
            content_parts.append("BoundingBoxes: " + "; ".join(boxes))
    content = "\n".join([part for part in content_parts if part]).strip()
    if not content:
        content = layer.get("title") or layer.get("layer_id") or ""
    return content


def _build_content(layer: dict, slug: dict[str, str]) -> str:
    content_parts = [
        layer.get("abstract") or "",
        f"Layer: {layer.get('title') or layer.get('layer_id')}" if layer.get("title") or layer.get("layer_id") else "",
        f"Type: {layer.get('layer_type')}" if layer.get("layer_type") else "",
    ]
    if slug.get("parsed_state") or slug.get("parsed_district"):
        region_parts = []
        if slug.get("parsed_state"):
            region_parts.append(slug["parsed_state"])
        if slug.get("parsed_district"):
            region_parts.append(slug["parsed_district"])
        content_parts.append("Region: " + ", ".join(region_parts))
    if layer.get("srs"):
        content_parts.append(f"Projections: {', '.join(layer['srs'])}")
    bbox = layer.get("latlon_bbox") or {}
    if any(bbox.values()):
        content_parts.append(
            "LatLonBoundingBox: " + ", ".join(
                f"{k}={v}" for k, v in bbox.items() if v
            )
        )
    if layer.get("bounding_boxes"):
        boxes = []
        for box in layer["bounding_boxes"]:
            details = [
                f"{k}={v}" for k, v in box.items() if v and k != "srs"
            ]
            if box.get("srs"):
                details.insert(0, f"SRS={box['srs']}")
            if details:
                boxes.append("(" + ", ".join(details) + ")")
        if boxes:
            content_parts.append("BoundingBoxes: " + "; ".join(boxes))
    content = "\n".join([part for part in content_parts if part]).strip()
    if not content:
        content = layer.get("title") or layer.get("layer_id") or ""
    return content


def _build_summary(layer: dict, slug: dict[str, str]) -> str:
    summary = []
    if layer.get("layer_type"):
        summary.append(f"Type: {layer['layer_type']}")
    if slug.get("parsed_state"):
        summary.append(f"State: {slug['parsed_state']}")
    if slug.get("parsed_district"):
        summary.append(f"Area: {slug['parsed_district']}")
    return " | ".join(summary)


def build_bhuvan_payload(layer: dict) -> dict:
    """
    Convert parsed Bhuvan layer into AIILA standard schema.
    """

    slug = _parse_layer_slug(layer.get("title") or layer.get("layer_id") or "")
    location = _build_location(layer, slug)
    tags = _build_dataset_tags(layer, slug)
    content = _build_content(layer, slug)
    summary = _build_summary(layer, slug)

    entities = [
        {
            "type": "dataset",
            "value": layer.get("layer_id"),
            "metadata": {
                "layer_type": layer.get("layer_type"),
                "slug": slug.get("parsed_layer"),
            },
        }
    ]
    if layer.get("layer_type"):
        entities.append(
            {
                "type": "layer_type",
                "value": layer["layer_type"],
                "metadata": {},
            }
        )
    if slug.get("parsed_state"):
        entities.append(
            {
                "type": "location",
                "value": slug["parsed_state"],
                "metadata": {"level": "state"},
            }
        )
    if slug.get("parsed_district"):
        entities.append(
            {
                "type": "location",
                "value": slug["parsed_district"],
                "metadata": {"level": "district"},
            }
        )

    relationships = []
    if location:
        relationships.append(
            {
                "type": "observed_at",
                "source": layer.get("layer_id"),
                "target": location.get("name"),
            }
        )

    metadata = {
        "layer_type": layer.get("layer_type"),
        "slug": slug,
        "srs": layer.get("srs"),
        "latlon_bbox": layer.get("latlon_bbox"),
        "bounding_boxes": layer.get("bounding_boxes"),
    }

    if slug.get("parsed_state"):
        metadata["state"] = slug["parsed_state"]
    if slug.get("parsed_district"):
        metadata["district"] = slug["parsed_district"]

    return {
        "event_id": f"bhuvan_{layer['layer_id']}",

        "source": "bhuvan",
        "source_type": "geospatial",

        "source_id": layer["layer_id"],

        "title": layer.get("title") or layer.get("layer_id"),

        "content": content,

        "summary": summary,

        "published_at": None,

        "collected_at": datetime.now(
            timezone.utc
        ).isoformat(),

        "event_type": "geospatial_dataset",

        "category": "geoint",

        "provider": "NRSC",

        "dataset_name": layer["layer_id"],

        "dataset_type": layer.get("layer_type"),

        "tags": tags,

        "entities": entities,

        "locations": [location] if location else [],

        "relationships": relationships,

        "metadata": metadata,

        "raw": layer["raw"],
    }