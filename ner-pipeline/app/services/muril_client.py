import json
from functools import lru_cache

import httpx
import redis
import structlog

from app.config import settings

log = structlog.get_logger()


# ── Redis client for MuRIL response cache ─────────────────────────────────────

@lru_cache(maxsize=1)
def _get_cache() -> redis.Redis:
    return redis.from_url(
        settings.REDIS_MURIL_CACHE_URL,
        decode_responses=True,
    )


# Shared Redis client using the separate cache database configuration (for backwards compatibility)
redis_client = _get_cache()


# ── Raw NER tag structure returned by Triton ──────────────────────────────────

class NERTag:
    __slots__ = ("word", "entity", "score", "start", "end")

    def __init__(self, word: str, entity: str, score: float, start: int, end: int):
        self.word   = word
        self.entity = entity    # "B-PER"|"I-PER"|"B-ORG"|"I-ORG"|"B-LOC"|"I-LOC"|"O"
        self.score  = score
        self.start  = start
        self.end    = end

    def __repr__(self) -> str:
        return f"NERTag({self.entity} '{self.word}' {self.score:.3f})"


class MuRILClient:
    """
    Single responsibility: call Triton MuRIL-NER and return raw NER tags.
    Implements Redis caching so the chord's 3 ML tasks
    only make one Triton round trip per document.

    Cache key:  ner:muril:{source_id}
    Cache TTL:  settings.REDIS_MURIL_CACHE_TTL (default 60s)
    Cache value: JSON-serialized list of NERTag dicts
    """

    def __init__(self):
        # httpx requires a scheme, but TRITON_URL is stripped for Triton client compatibility
        triton_host = settings.TRITON_URL
        scheme = "http://" if not triton_host.startswith(("http://", "https://")) else ""
        self._triton_url = (
            f"{scheme}{triton_host}"
            f"/v2/models/{settings.TRITON_MURIL_MODEL_NAME}/infer"
        )
        self._timeout = settings.TRITON_TIMEOUT_SECONDS
        self._cache   = _get_cache()
        self._ttl     = settings.REDIS_MURIL_CACHE_TTL

    # ── public API ────────────────────────────────────────────────────────────

    def get_ner_tags(self, source_id: str, text: str) -> list[NERTag]:
        """
        Returns NER tags for the given text.
        Checks Redis cache first — calls Triton only on cache miss.
        Uses a Redis lock to ensure that parallel Celery tasks for the same
        document do not duplicate Triton inference requests.
        """
        cache_key = f"ner:muril:{source_id}"

        # ── 1. Cache lookup ──
        cached = self._read_cache(cache_key)
        if cached is not None:
            log.debug("muril.cache_hit", source_id=source_id)
            return cached

        # ── 2. Redis Lock to prevent concurrent Triton calls ──
        lock_key = f"lock:muril:{source_id}"
        try:
            with self._cache.lock(lock_key, timeout=15):
                # Double-check cache
                cached = self._read_cache(cache_key)
                if cached is not None:
                    log.debug("muril.cache_hit.double_checked", source_id=source_id)
                    return cached

                # ── 3. Triton inference ──
                log.debug("muril.triton_call", source_id=source_id)
                tags = self._call_triton(text)

                # ── 4. Cache write ──
                self._write_cache(cache_key, tags)
                return tags
        except Exception as exc:
            # Fallback to direct Triton call in case of lock issues
            log.warning("muril.lock_failed_fallback_direct", source_id=source_id, error=str(exc))
            return self._call_triton(text)

    def get_tags_by_type(
        self,
        source_id: str,
        text: str,
        entity_prefix: str,          # "PER" | "ORG" | "LOC"
    ) -> list[list[NERTag]]:
        """
        Returns grouped entity spans for a specific entity type.
        Groups consecutive B-/I- tags into single entity spans.
        e.g. [B-PER "Rahul", I-PER "Gandhi"] → one span ["Rahul Gandhi"]
        """
        all_tags = self.get_ner_tags(source_id, text)
        return self._group_spans(all_tags, entity_prefix)

    # ── Triton call ───────────────────────────────────────────────────────────

    def _call_triton(self, text: str) -> list[NERTag]:
        raw_tags = self._call_triton_raw(text)
        
        parsed_tags = []
        for item in raw_tags:
            if isinstance(item, str):
                try:
                    parsed = json.loads(item)
                    if isinstance(parsed, list):
                        parsed_tags.extend(parsed)
                    elif isinstance(parsed, dict):
                        parsed_tags.append(parsed)
                except Exception as exc:
                    log.warning("muril.failed_to_parse_raw_tag_string", item=item[:100], error=str(exc))
            elif isinstance(item, dict):
                parsed_tags.append(item)
            else:
                log.warning("muril.unexpected_raw_tag_type", item_type=type(item))

        return [
            NERTag(
                word=t["word"],
                entity=t["entity"] if (isinstance(t["entity"], str) and t["entity"].startswith(("B-", "I-", "O"))) else f"B-{t['entity']}",
                score=float(t["score"]),
                start=int(t["start"]),
                end=int(t["end"]),
            )
            for t in parsed_tags
            if isinstance(t, dict) and "word" in t and "entity" in t and "score" in t and "start" in t and "end" in t
        ]

    def _call_triton_raw(self, text: str) -> list:
        payload = {
            "inputs": [
                {
                    "name":     "TEXT",
                    "shape":    [1],
                    "datatype": "BYTES",
                    "data":     [text],
                }
            ],
            "outputs": [{"name": "NER_TAGS"}],
            "parameters": {
                "model": settings.TRITON_MURIL_MODEL_NAME,
            },
        }

        try:
            response = httpx.post(
                self._triton_url,
                json=payload,
                timeout=self._timeout,
            )
            response.raise_for_status()
            return response.json()["outputs"][0]["data"]

        except httpx.TimeoutException:
            log.warning("muril.triton_timeout")
            return []

        except httpx.HTTPStatusError as exc:
            log.warning(
                "muril.triton_http_error",
                status=exc.response.status_code,
            )
            return []

        except Exception as exc:
            log.error("muril.triton_unexpected_error", error=str(exc))
            return []

    # ── span grouping ─────────────────────────────────────────────────────────

    def _group_spans(
        self,
        tags: list[NERTag],
        entity_prefix: str,
    ) -> list[list[NERTag]]:
        """
        Groups BIO-tagged tokens into entity spans.
        B-PER starts a new span. I-PER continues it. O ends it.
        Returns list of spans — each span is a list of NERTag.
        """
        spans:        list[list[NERTag]] = []
        current_span: list[NERTag]       = []

        for tag in tags:
            if tag.entity == f"B-{entity_prefix}":
                if current_span:
                    spans.append(current_span)
                current_span = [tag]

            elif tag.entity == f"I-{entity_prefix}" and current_span:
                current_span.append(tag)

            else:
                if current_span:
                    spans.append(current_span)
                    current_span = []

        if current_span:
            spans.append(current_span)

        return spans

    # ── cache helpers ─────────────────────────────────────────────────────────

    def _read_cache(self, key: str) -> list[NERTag] | None:
        try:
            raw = self._cache.get(key)
            if not isinstance(raw, str):
                return None
            data = json.loads(raw)
            return [
                NERTag(
                    word=t["word"],
                    entity=t["entity"],
                    score=t["score"],
                    start=t["start"],
                    end=t["end"],
                )
                for t in data
            ]
        except Exception as exc:
            log.warning("muril.cache_read_failed", error=str(exc))
            return None

    def _write_cache(self, key: str, tags: list[NERTag]) -> None:
        try:
            serialized = json.dumps([
                {
                    "word":   t.word,
                    "entity": t.entity,
                    "score":  t.score,
                    "start":  t.start,
                    "end":    t.end,
                }
                for t in tags
            ])
            self._cache.setex(key, self._ttl, serialized)
        except Exception as exc:
            log.warning("muril.cache_write_failed", error=str(exc))


@lru_cache(maxsize=1)
def get_muril_client() -> MuRILClient:
    return MuRILClient()
