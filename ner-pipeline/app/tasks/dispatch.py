import structlog
from celery import group
from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.schemas.enriched_doc import EnrichedDocument
from app.tasks.merge import merge_entities, handle_chord_error

log = structlog.get_logger()


@celery_app.task(
    bind=True,
    name="app.tasks.dispatch.dispatch_ner_chord",
    max_retries=3,
    queue="ner-ml",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
)
def dispatch_ner_chord(self, doc: dict) -> None:
    bound_log = log.bind(
        task="dispatch_ner_chord",
        source=doc.get("source"),
        source_id=doc.get("source_id"),
    )

    # ── short-circuit ─────────────────────────────────────────────────────────
    if doc.get("is_duplicate"):
        bound_log.debug("dispatch.skipped_duplicate")
        _dispatch_duplicate_shortcut(doc)
        return

    # ── validate input schema ─────────────────────────────────────────────────
    try:
        enriched = EnrichedDocument.model_validate(doc)
    except Exception as exc:
        bound_log.error("dispatch.schema_validation_failed", error=str(exc))
        raise

    # ── verify at least one text field is extractable ─────────────────────────
    extractable = enriched.get_extractable_fields()
    if not extractable:
        bound_log.warning("dispatch.no_extractable_content")
        _dispatch_empty_shortcut(doc)
        return

    try:
        # ── import all 12 extractor tasks ─────────────────────────────────────
        from app.tasks.extractors import (
            extract_phones,
            extract_emails,
            extract_upi,
            extract_bank_accounts,
            extract_crypto,
            extract_ip_addresses,
            extract_domains,
            extract_hashtags,
            extract_mentions,
            extract_persons,
            extract_orgs,
            extract_locations,
        )

        # ── build chord ───────────────────────────────────────────────────────
        # All 12 tasks receive the same serialized doc dict.
        # group() fires all simultaneously.
        # merge_entities fires only when all 12 complete.
        # handle_chord_error fires if any task exhausts retries.

        extraction_group = group([
            # ── regex extractors → ner-fast ───────────────────────────────────
            extract_phones.s(doc),
            extract_emails.s(doc),
            extract_upi.s(doc),
            extract_bank_accounts.s(doc),
            extract_crypto.s(doc),
            extract_ip_addresses.s(doc),
            extract_domains.s(doc),
            extract_hashtags.s(doc),
            extract_mentions.s(doc),

            # ── ML extractors → ner-ml ────────────────────────────────────────
            extract_persons.s(doc),
            extract_orgs.s(doc),
            extract_locations.s(doc),
        ])

        callback = merge_entities.s(doc).on_error(handle_chord_error.s(doc))
        chord_signature = (
            extraction_group
            | callback
        )

        chord_signature.apply_async()

        bound_log.info(
            "dispatch.chord_fired",
            extractable_fields=list(extractable.keys()),
            field_char_counts={k: len(v) for k, v in extractable.items()},
        )

    except SoftTimeLimitExceeded:
        bound_log.error("dispatch.soft_time_limit_exceeded")
        raise


def _dispatch_duplicate_shortcut(doc: dict) -> None:
    """
    Publishes a minimal EntityEvent for duplicate documents.
    Duplicates still need an entity-events record so downstream
    consumers (MongoDB writer, graph-engine) can update last_seen timestamps.
    """
    from app.tasks.publish import publish_entity_event
    from datetime import datetime, timezone

    minimal_event = {
        "source":             doc["source"],
        "source_id":          doc["source_id"],
        "published_at":       doc["published_at"],
        "processed_at":       datetime.now(timezone.utc).isoformat(),
        "language":           doc.get("language"),
        "entities":           [],
        "entity_count":       0,
        "entity_type_counts": {},
        "has_ml_entities":    False,
        "extraction_partial": False,
        "failed_extractors":  [],
        "pipeline_version":   "1.0.0",
        "is_duplicate":       True,
        "duplicate_of":       doc.get("duplicate_of"),
    }
    publish_entity_event.apply_async(
        args=[minimal_event],
        queue="ner-ml",
    )


def _dispatch_empty_shortcut(doc: dict) -> None:
    """
    Publishes a minimal EntityEvent for documents with no extractable content.
    Ensures every enriched document has a corresponding entity-events record.
    """
    from app.tasks.publish import publish_entity_event
    from datetime import datetime, timezone

    minimal_event = {
        "source":             doc["source"],
        "source_id":          doc["source_id"],
        "published_at":       doc["published_at"],
        "processed_at":       datetime.now(timezone.utc).isoformat(),
        "language":           doc.get("language"),
        "entities":           [],
        "entity_count":       0,
        "entity_type_counts": {},
        "has_ml_entities":    False,
        "extraction_partial": True,
        "failed_extractors":  ["all — no extractable content"],
        "pipeline_version":   "1.0.0",
        "is_duplicate":       False,
        "duplicate_of":       None,
    }
    publish_entity_event.apply_async(
        args=[minimal_event],
        queue="ner-ml",
    )


# ── Legacy backward compatibility entrypoint ─────────────────────────────────

def dispatch_ner_pipeline(doc_dict: dict) -> None:
    """Legacy entrypoint for backwards compatibility. Delegates to dispatch_ner_chord."""
    dispatch_ner_chord.delay(doc_dict)
