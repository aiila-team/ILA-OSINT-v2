import unittest
from unittest.mock import patch, MagicMock
from app.services.muril_client import MuRILClient, NERTag

class TestMuRILClient(unittest.TestCase):
    @patch("app.services.muril_client._get_cache")
    @patch("app.services.muril_client.MuRILClient._call_triton_raw")
    def test_call_triton_robust_parsing_serialized_string(self, mock_triton_raw, mock_get_cache):
        # Setup mock cache
        mock_cache = MagicMock()
        mock_cache.get.return_value = None
        mock_get_cache.return_value = mock_cache
        
        # Triton response is a list containing a JSON-serialized string of a list of tags
        mock_triton_raw.return_value = [
            '[{"word": "rahul gandhi", "entity": "PER", "score": 0.838, "start": 0, "end": 12}, {"word": "new delhi", "entity": "LOC", "score": 0.925, "start": 21, "end": 30}]'
        ]
        
        client = MuRILClient()
        tags = client._call_triton("Rahul Gandhi went to New Delhi.")
        
        self.assertEqual(len(tags), 2)
        self.assertEqual(tags[0].word, "rahul gandhi")
        self.assertEqual(tags[0].entity, "B-PER")
        self.assertEqual(tags[0].score, 0.838)
        self.assertEqual(tags[1].word, "new delhi")
        self.assertEqual(tags[1].entity, "B-LOC")
        self.assertEqual(tags[1].score, 0.925)

    @patch("app.services.muril_client._get_cache")
    @patch("app.services.muril_client.MuRILClient._call_triton_raw")
    def test_call_triton_robust_parsing_dict_mock(self, mock_triton_raw, mock_get_cache):
        # Setup mock cache
        mock_cache = MagicMock()
        mock_cache.get.return_value = None
        mock_get_cache.return_value = mock_cache
        
        # Triton response is a list containing dictionaries directly (as in integration tests)
        mock_triton_raw.return_value = [
            {"word": "rahul gandhi", "entity": "PER", "score": 0.838, "start": 0, "end": 12},
            {"word": "new delhi", "entity": "LOC", "score": 0.925, "start": 21, "end": 30}
        ]
        
        client = MuRILClient()
        tags = client._call_triton("Rahul Gandhi went to New Delhi.")
        
        self.assertEqual(len(tags), 2)
        self.assertEqual(tags[0].word, "rahul gandhi")
        self.assertEqual(tags[0].entity, "B-PER")
        self.assertEqual(tags[1].word, "new delhi")
        self.assertEqual(tags[1].entity, "B-LOC")
