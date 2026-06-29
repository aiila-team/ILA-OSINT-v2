import os

import pytest
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor

MODEL_NAME = "ai4bharat/indictrans2-indic-en-dist-200M"
SRC_LANG = "hin_Deva"
TGT_LANG = "eng_Latn"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


@pytest.mark.skipif(
    os.environ.get("HF_HUB_TOKEN") is None,
    reason="Hugging Face token not set. Set HF_HUB_TOKEN to access gated model."
)
def test_indictrans2_translation_direct_load():
    """Load IndicTrans2 directly via transformers and verify translation output."""
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME,
        trust_remote_code=True,
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_NAME,
        trust_remote_code=True,
        torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
    ).to(DEVICE)
    ip = IndicProcessor(inference=True)

    source_text = "नमस्ते दुनिया"
    preprocessed = ip.preprocess_batch([source_text], src_lang=SRC_LANG, tgt_lang=TGT_LANG)

    inputs = tokenizer(
        preprocessed,
        truncation=True,
        padding="longest",
        max_length=256,
        return_tensors="pt",
    ).to(DEVICE)

    with torch.no_grad():
        generated_tokens = model.generate(
            **inputs,
            use_cache=True,
            min_length=0,
            max_length=256,
            num_beams=1,
            num_return_sequences=1,
        )

    decoded = tokenizer.batch_decode(
        generated_tokens,
        skip_special_tokens=True,
        clean_up_tokenization_spaces=True,
    )
    translations = ip.postprocess_batch(decoded, lang=TGT_LANG)

    assert len(translations) == 1
    assert isinstance(translations[0], str)
    assert translations[0].strip() != ""
    assert translations[0].strip() != source_text
    assert any(token in translations[0].lower() for token in ("hello", "world", "hi", "greetings")) or len(translations[0].split()) >= 2
