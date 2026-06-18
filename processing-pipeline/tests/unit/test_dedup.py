import pytest
from app.tasks.dedup import merge_parallel_results


def test_merge_parallel_results_success():
    # Baseline document dictionary returned by dedup_task
    base_doc = {
        "source": "tv9_telugu",
        "source_id": "76d07129bfb460958eade712f9597a976359dc91bc886d832a96738bd0a4c466",
        "content": " ప్రతి ఒక్కరూ తమ ఆదాయంలో కొంత భాగాన్ని ఆదా చేసి...",
        "published_at": "2026-06-12T17:37:15+00:00",
        "collected_at": "2026-06-12T17:37:18+00:00",
        "is_duplicate": False,
        "duplicate_of": None,
        "content_hash": "13519a487e4d43e20c6b92cefb565fe4d67fd12f3d0d4d64c4bd946bda617059",
        "language": None,
        "translated_content": None,
        "translation_confidence": None,
        "translation_failed": False,
        "ocr_text": None,
    }

    # Simulate translate_task output
    translate_res = base_doc.copy()
    translate_res.update({
        "_stage": "translate",
        "language": "te",
        "translated_content": "Every one plans to save...",
        "translation_confidence": 0.95,
        "translation_failed": False,
    })

    # Simulate ocr_task output
    ocr_res = base_doc.copy()
    ocr_res.update({
        "_stage": "ocr",
        "ocr_text": "Extracted text from media",
    })

    # Test merge in [translate_res, ocr_res] order
    merged_1 = merge_parallel_results([translate_res, ocr_res])
    assert merged_1["language"] == "te"
    assert merged_1["translated_content"] == "Every one plans to save..."
    assert merged_1["translation_confidence"] == 0.95
    assert merged_1["translation_failed"] is False
    assert merged_1["ocr_text"] == "Extracted text from media"
    assert "_stage" not in merged_1

    # Test merge in [ocr_res, translate_res] order
    merged_2 = merge_parallel_results([ocr_res, translate_res])
    assert merged_2["language"] == "te"
    assert merged_2["translated_content"] == "Every one plans to save..."
    assert merged_2["translation_confidence"] == 0.95
    assert merged_2["translation_failed"] is False
    assert merged_2["ocr_text"] == "Extracted text from media"
    assert "_stage" not in merged_2


def test_merge_parallel_results_fallback():
    # Baseline document dictionary
    base_doc = {
        "source": "tv9_telugu",
        "source_id": "76d07129bfb460958eade712f9597a976359dc91bc886d832a96738bd0a4c466",
        "is_duplicate": False,
        "duplicate_of": None,
        "language": None,
        "translated_content": None,
        "translation_confidence": None,
        "translation_failed": False,
        "ocr_text": None,
    }

    # Simulate translate_task output WITHOUT _stage metadata
    translate_res = base_doc.copy()
    translate_res.update({
        "language": "te",
        "translated_content": "Every one plans to save...",
        "translation_confidence": 0.95,
        "translation_failed": False,
    })

    # Simulate ocr_task output WITHOUT _stage metadata
    ocr_res = base_doc.copy()
    ocr_res.update({
        "ocr_text": "Extracted text from media",
    })

    # Test merge in [translate_res, ocr_res] order
    merged_1 = merge_parallel_results([translate_res, ocr_res])
    assert merged_1["language"] == "te"
    assert merged_1["translated_content"] == "Every one plans to save..."
    assert merged_1["translation_confidence"] == 0.95
    assert merged_1["ocr_text"] == "Extracted text from media"

    # Test merge in [ocr_res, translate_res] order
    merged_2 = merge_parallel_results([ocr_res, translate_res])
    assert merged_2["language"] == "te"
    assert merged_2["translated_content"] == "Every one plans to save..."
    assert merged_2["translation_confidence"] == 0.95
    assert merged_2["ocr_text"] == "Extracted text from media"


def test_merge_parallel_results_is_duplicate():
    # Baseline document dictionary
    base_doc = {
        "source": "tv9_telugu",
        "source_id": "76d07129bfb460958eade712f9597a976359dc91bc886d832a96738bd0a4c466",
        "is_duplicate": False,
        "duplicate_of": None,
    }

    # If document was flagged as duplicate, the tasks short-circuit
    res_1 = base_doc.copy()
    res_1.update({
        "is_duplicate": True,
        "duplicate_of": "original_source_id",
    })

    res_2 = base_doc.copy()
    res_2.update({
        "is_duplicate": True,
        "duplicate_of": "original_source_id",
    })

    merged = merge_parallel_results([res_1, res_2])
    assert merged["is_duplicate"] is True
    assert merged["duplicate_of"] == "original_source_id"


from unittest.mock import MagicMock, patch
from app.tasks.dedup import dedup_task

@patch("app.tasks.dedup.get_dedup_engine_cached")
@patch("app.tasks.dedup.dispatch_downstream")
def test_dedup_task_unique_dispatches_downstream(mock_dispatch, mock_get_engine):
    # Mock DedupEngine behaviour
    mock_engine = MagicMock()
    mock_engine.check_exact_duplicate.return_value = False
    mock_engine.check_near_duplicate.return_value = None
    mock_get_engine.return_value = mock_engine

    raw_event_dict = {
        "source": "tv9_telugu",
        "source_id": "76d07129bfb460958eade712f9597a976359dc91bc886d832a96738bd0a4c466",
        "content": " ప్రతి ఒక్కరూ తమ ఆదాయంలో కొంత భాగాన్ని ఆదా చేసి...",
        "published_at": "2026-06-12T17:37:15+00:00",
        "collected_at": "2026-06-12T17:37:18+00:00",
    }

    result = dedup_task(raw_event_dict)
    
    assert result["is_duplicate"] is False
    # Verify exact and near duplicate registration methods were called
    mock_engine.register_exact_document.assert_called_once()
    mock_engine.register_lsh_document.assert_called_once()
    # Verify downstream dispatch was triggered
    mock_dispatch.assert_called_once_with(result)


@patch("app.tasks.dedup.get_dedup_engine_cached")
@patch("app.tasks.dedup.dispatch_downstream")
def test_dedup_task_duplicate_suppresses_dispatch(mock_dispatch, mock_get_engine):
    # Mock DedupEngine behaviour
    mock_engine = MagicMock()
    mock_engine.check_exact_duplicate.return_value = True  # exact duplicate
    mock_get_engine.return_value = mock_engine

    raw_event_dict = {
        "source": "tv9_telugu",
        "source_id": "76d07129bfb460958eade712f9597a976359dc91bc886d832a96738bd0a4c466",
        "content": " ప్రతి ఒక్కరూ తమ ఆదాయంలో కొంత భాగాన్ని ఆదా చేసి...",
        "published_at": "2026-06-12T17:37:15+00:00",
        "collected_at": "2026-06-12T17:37:18+00:00",
    }

    result = dedup_task(raw_event_dict)
    
    assert result["is_duplicate"] is True
    # Verify registration was skipped
    mock_engine.register_exact_document.assert_not_called()
    mock_engine.register_lsh_document.assert_not_called()
    # Verify downstream dispatch was NOT triggered
    mock_dispatch.assert_not_called()
