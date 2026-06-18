from datetime import datetime, timezone

from ingestion.factory import RawEventFactory
from ingestion.models import RawEvent
from ingestion.services import TimestampNormalizationService


def test_raw_event_factory_creates_valid_event():
    payload = {
        "event_id": "test_1",
        "source_id": "src_1",
        "title": "Test event",
        "content": "This is a test.",
        "published_at": "2026-06-12T14:05:33Z",
        "collected_at": "2026-06-12T14:05:33Z",
        "ingested_at": "2026-06-12T14:05:33Z",
        "user": {"username": "tester", "user_id": "123"},
        "media_files": [{"url": "https://example.com/image.jpg", "type": "image"}],
        "entities": [{"type": "url", "value": "https://example.com"}],
        "references": [{"type": "url", "value": "https://example.com"}],
        "tags": ["test"],
        "metadata": {"source": "unit-test"},
    }

    event = RawEventFactory.create(source="telegram", source_type="social_media", extracted_payload=payload)

    assert isinstance(event, RawEvent)
    assert event.source == "telegram"
    assert event.content == "This is a test."
    assert event.published_at == datetime(2026, 6, 12, 14, 5, 33, tzinfo=timezone.utc)
    assert event.media_urls == ["https://example.com/image.jpg"]
    assert event.author == "tester"
    assert event.media[0].type == "image"


def test_raw_event_factory_rejects_empty_content():
    payload = {
        "event_id": "test_2",
        "source_id": "src_1",
        "published_at": "2026-06-12T14:05:33Z",
        "collected_at": "2026-06-12T14:05:33Z",
        "ingested_at": "2026-06-12T14:05:33Z",
    }

    try:
        RawEventFactory.create(source="nasa", source_type="space", extracted_payload=payload)
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "content cannot be empty" in str(exc)


def test_raw_event_factory_normalizes_telegram_author_id_int():
    payload = {
        "event_id": "test_telegram_1",
        "source_id": "src_telegram",
        "title": "Telegram test event",
        "content": "Telegram author id should become string.",
        "published_at": "2026-06-12T14:05:33Z",
        "collected_at": "2026-06-12T14:05:33Z",
        "ingested_at": "2026-06-12T14:05:33Z",
        "user": {"username": "tester", "user_id": -1001699833011},
        "media_files": [],
    }

    event = RawEventFactory.create(source="telegram", source_type="social_media", extracted_payload=payload)

    assert isinstance(event, RawEvent)
    assert event.author_id == "-1001699833011"


def test_raw_event_factory_normalizes_null_author_id():
    payload = {
        "event_id": "test_telegram_2",
        "source_id": "src_telegram",
        "title": "Telegram test event with null author id",
        "content": "Content is present.",
        "published_at": "2026-06-12T14:05:33Z",
        "collected_at": "2026-06-12T14:05:33Z",
        "ingested_at": "2026-06-12T14:05:33Z",
        "user": {"username": "tester", "user_id": None},
        "media_files": [],
    }

    event = RawEventFactory.create(source="telegram", source_type="social_media", extracted_payload=payload)

    assert isinstance(event, RawEvent)
    assert event.author_id is None


def test_certin_date_normalizer_handles_variable_whitespace():
    import importlib.util
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[1]
    certin_path = repo_root / "data-sources" / "defence" / "certin" / "payload_extractor.py"
    spec = importlib.util.spec_from_file_location("certin_payload_extractor", str(certin_path))
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    normalized = module._normalize_certin_date("June      11, 2026")
    assert normalized == "2026-06-11T00:00:00Z"

    normalized = module._normalize_certin_date("April     5, 2026")
    assert normalized == "2026-04-05T00:00:00Z"


def test_raw_event_factory_normalizes_dictionary_of_lists_entities():
    payload = {
        "event_id": "test_3",
        "source_id": "src_1",
        "title": "Test event",
        "content": "This is a test.",
        "published_at": "2026-06-12T14:05:33Z",
        "collected_at": "2026-06-12T14:05:33Z",
        "ingested_at": "2026-06-12T14:05:33Z",
        "entities": {
            "urls": ["https://example.com/1", "https://example.com/2"],
            "hashtags": ["#tag1", "#tag2"],
            "cves": []
        }
    }

    event = RawEventFactory.create(source="telegram", source_type="social_media", extracted_payload=payload)

    assert isinstance(event, RawEvent)
    entity_dict = {(e.type, e.value) for e in event.entities}
    assert ("urls", "https://example.com/1") in entity_dict
    assert ("urls", "https://example.com/2") in entity_dict
    assert ("hashtags", "#tag1") in entity_dict
    assert ("hashtags", "#tag2") in entity_dict
    assert not any(e.type == "cves" for e in event.entities)
