import csv
import re
import structlog
from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.extractors.base import EntityExtractor
from app.extractors.ml.person import _build_span_text
from app.schemas.extracted_entity import ExtractedEntity
from app.services.muril_client import get_muril_client

log = structlog.get_logger()


# ── GeoNames offline lookup ───────────────────────────────────────────────────

class GeoNamesDB:
    """
    Offline GeoNames lookup using the India country file (IN.txt).
    Downloaded from: https://download.geonames.org/export/dump/IN.zip
    Stored at: settings.GEONAMES_DB_PATH
    Loaded once per worker process into memory — ~50MB for India dataset.
    Provides lat/lon + admin division for extracted location names.
    """

    def __init__(self, db_path: str):
        self._index: dict[str, dict] = {}
        self._load(db_path)

    def _load(self, db_path: str) -> None:
        path = Path(db_path)
        if not path.exists():
            log.warning("geonames.db_not_found", path=db_path)
            return

        try:
            with open(path, encoding="utf-8") as f:
                reader = csv.reader(f, delimiter="\t")
                for row in reader:
                    if len(row) < 15:
                        continue
                    name       = row[1].lower().strip()
                    alt_names  = row[3].lower().split(",") if row[3] else []
                    latitude   = float(row[4]) if row[4] else None
                    longitude  = float(row[5]) if row[5] else None
                    feature    = row[7]         # feature class
                    admin1     = row[10]        # state code
                    population = int(row[14]) if row[14] else 0

                    entry = {
                        "name":       row[1],
                        "latitude":   latitude,
                        "longitude":  longitude,
                        "feature":    feature,
                        "admin1":     admin1,
                        "population": population,
                        "country":    "IN",
                    }

                    # index by primary name
                    if name not in self._index or \
                       population > self._index[name].get("population", 0):
                        self._index[name] = entry

                    # index by alternate names
                    for alt in alt_names:
                        alt = alt.strip()
                        if alt and alt not in self._index:
                            self._index[alt] = entry

            log.info("geonames.loaded", entries=len(self._index))

        except Exception as exc:
            log.error("geonames.load_failed", error=str(exc))

    def lookup(self, name: str) -> dict | None:
        return self._index.get(name.lower().strip())


@lru_cache(maxsize=1)
def _get_geonames_db() -> GeoNamesDB | None:
    if not settings.GEONAMES_ENABLED:
        return None
    return GeoNamesDB(settings.GEONAMES_DB_PATH)


# ── Location classification ───────────────────────────────────────────────────

# GeoNames feature class → human-readable type
_FEATURE_CLASS_MAP: dict[str, str] = {
    "P": "populated_place",     # city, town, village
    "A": "administrative",      # country, state, district
    "H": "water_body",          # river, lake, bay
    "L": "area",                # park, reserve, region
    "R": "road",                # road, railway, highway
    "S": "structure",           # building, fort, temple, station
    "T": "terrain",             # mountain, hill, valley
    "U": "undersea",
    "V": "vegetation",          # forest, jungle
}

# Indian state code → state name
_INDIA_STATE_MAP: dict[str, str] = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "25": "Daman and Diu",
    "26": "Dadra and Nagar Haveli",
    "27": "Maharashtra",
    "28": "Andhra Pradesh",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
}

# Sensitive border regions — flag for risk engine
_SENSITIVE_REGIONS: frozenset[str] = frozenset({
    "jammu", "kashmir", "ladakh", "srinagar", "leh",
    "manipur", "nagaland", "mizoram", "arunachal",
    "aksai chin", "line of control", "loc",
    "international border", "border", "indo-pak",
    "indo-china", "doklam", "galwan",
})

# Noise location names — common words MuRIL tags as LOC in certain contexts
_NOISE_LOCATIONS: frozenset[str] = frozenset({
    "north", "south", "east", "west", "central",
    "here", "there", "somewhere", "anywhere", "everywhere",
    "online", "internet", "web",
})


def _normalize_location_name(name: str) -> str:
    name = name.strip(" .,;:-'\"")
    name = " ".join(name.split())
    return name


def _is_noise_location(name: str) -> bool:
    lower = name.lower().strip()
    if len(lower) < 3:
        return True
    if lower in _NOISE_LOCATIONS:
        return True
    if lower.replace(" ", "").isdigit():
        return True
    return False


def _is_sensitive_region(name: str) -> bool:
    lower = name.lower()
    return any(region in lower for region in _SENSITIVE_REGIONS)


class LocationExtractor(EntityExtractor):
    """
    Extracts location names using MuRIL-NER via Triton.
    Reads from Redis cache — does not call Triton directly.
    The first ML extractor task to run for a given source_id
    populates the cache; subsequent extractors (org, location) read from it.
    """

    def __init__(self, source_id: str | None = None, translation_failed: bool = False):
        super().__init__(entity_type="location")
        self.source_id = source_id or "unknown_doc"
        self.translation_failed = translation_failed

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        # Delegate to extract_for_doc utilizing the instance properties
        return self.extract_for_doc(
            text=text,
            source_field=source_field,
            source_id=self.source_id,
            translation_failed=self.translation_failed,
        )

    def extract_for_doc(
        self,
        text: str,
        source_field: str,
        source_id: str,
        translation_failed: bool = False,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []
        geonames = _get_geonames_db()

        try:
            client = get_muril_client()
            spans  = client.get_tags_by_type(
                source_id=source_id,
                text=text,
                entity_prefix="LOC",
            )

            seen: set[str] = set()

            for span in spans:
                surface, raw, avg_score, char_start, char_end = _build_span_text(span)
                normalized = _normalize_location_name(surface)

                if _is_noise_location(normalized):
                    continue

                if normalized in seen:
                    continue
                seen.add(normalized)

                # ── GeoNames enrichment ───────────────────────────────────────
                geo_entry    = geonames.lookup(normalized) if geonames else None
                latitude     = geo_entry["latitude"]   if geo_entry else None
                longitude    = geo_entry["longitude"]  if geo_entry else None
                country      = geo_entry["country"]    if geo_entry else None
                feature      = geo_entry["feature"]    if geo_entry else None
                admin1       = geo_entry["admin1"]     if geo_entry else None
                state_name   = _INDIA_STATE_MAP.get(admin1, "") if admin1 else ""
                location_type = _FEATURE_CLASS_MAP.get(feature, "unknown") \
                                if feature else "unknown"

                # geo match boosts confidence
                confidence = avg_score
                if geo_entry:
                    confidence = min(1.0, confidence + 0.05)
                if translation_failed:
                    confidence = confidence * 0.85

                confidence       = round(confidence, 4)
                is_low           = confidence < settings.NER_CONFIDENCE_THRESHOLD
                is_sensitive     = _is_sensitive_region(normalized)

                results.append(
                    ExtractedEntity(
                        entity_type="location",
                        value=normalized,
                        raw_value=raw,
                        confidence=confidence,
                        low_confidence=is_low,
                        source_field=source_field,
                        char_start=char_start,
                        char_end=char_end,
                        metadata={
                            "latitude":          latitude,
                            "longitude":         longitude,
                            "country":           country,
                            "state":             state_name,
                            "location_type":     location_type,
                            "geo_matched":       geo_entry is not None,
                            "is_sensitive_region": is_sensitive,
                            "translation_failed": translation_failed,
                        },
                    )
                )

        except Exception as exc:
            log.error(
                "extractor.location.failed",
                source_id=source_id,
                source_field=source_field,
                error=str(exc),
            )

        return results
