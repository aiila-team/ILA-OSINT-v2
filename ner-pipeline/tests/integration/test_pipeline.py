import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
import fnmatch
import json
from app.tasks.dispatch import dispatch_ner_pipeline
from app.celery_app import celery_app
from app.config import settings

class MockRedis:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, val):
        self.store[key] = val
        return True

    def keys(self, pattern):
        return [k for k in self.store.keys() if fnmatch.fnmatch(k, pattern)]

    def delete(self, *keys):
        for k in keys:
            self.store.pop(k, None)
        return True

    def lock(self, name, timeout=None):
        class MockLock:
            def __enter__(self):
                return self
            def __exit__(self, exc_type, exc_val, exc_tb):
                pass
        return MockLock()

# Single global mock instance to share state between tasks and merge callbacks
MOCK_REDIS_INSTANCE = MockRedis()

class TestPipelineIntegration(unittest.TestCase):
    def setUp(self):
        # Configure Celery to execute tasks locally and synchronously in-process
        celery_app.conf.update(
            task_always_eager=True,
            task_eager_propagates=True
        )

    @patch("app.services.muril_client.redis_client", new=MOCK_REDIS_INSTANCE)
    @patch("app.tasks.merge.redis_client", new=MOCK_REDIS_INSTANCE)
    @patch("app.services.muril_client.MuRILClient._call_triton_raw")
    @patch("app.tasks.publish._get_producer")
    def test_full_pipeline_flow(self, mock_get_producer, mock_triton_raw, *args):
        mock_producer = MagicMock()
        mock_future = MagicMock()
        mock_future.get.return_value = MagicMock(topic=settings.KAFKA_OUTPUT_TOPIC, partition=0, offset=1)
        mock_producer.send.return_value = mock_future
        mock_get_producer.return_value = mock_producer

        # Mock MuRIL-NER output from Triton
        mock_triton_raw.return_value = [
            {"word": "New Delhi", "entity": "LOC", "score": 0.95, "start": 18, "end": 27}
        ]
        
        doc_dict = {
            "source": "twitter",
            "source_id": "tweet_1001",
            "content": "Breaking news in New Delhi. Contact us at emergency@gov.in.",
            "published_at": datetime.now(timezone.utc).isoformat(),
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "content_hash": "hash_xyz_123",
            "is_duplicate": False,
            "translation_failed": False,
            "pipeline_version": "1.0.0"
        }
        
        # Dispatch pipeline chord (runs synchronously due to task_always_eager)
        dispatch_ner_pipeline(doc_dict)
        
        # Verify that output publishing was triggered
        self.assertTrue(mock_producer.send.called)
        
        # Verify at least one call was made to the target output topic
        called_topics = [call[0][0] for call in mock_producer.send.call_args_list]
        self.assertIn(settings.KAFKA_OUTPUT_TOPIC, called_topics)
        
        # Check published payload content
        published_payloads = [call[1].get("value") or call[0][1] for call in mock_producer.send.call_args_list]
        
        # Find the successful event payload (extraction_partial=False)
        success_events = [p for p in published_payloads if not p.get("extraction_partial")]
        self.assertEqual(len(success_events), 1)
        
        event = success_events[0]
        self.assertEqual(event["source_id"], "tweet_1001")
        self.assertEqual(event["source"], "twitter")
        
        # Check extracted entities (Location and Email)
        extracted_types = [entity["entity_type"] for entity in event["entities"]]
        self.assertIn("location", extracted_types)
        self.assertIn("email", extracted_types)
        
        # Validate values
        email_entity = next(e for e in event["entities"] if e["entity_type"] == "email")
        self.assertEqual(email_entity["value"], "emergency@gov.in")
        
        loc_entity = next(e for e in event["entities"] if e["entity_type"] == "location")
        self.assertEqual(loc_entity["value"], "New Delhi")
