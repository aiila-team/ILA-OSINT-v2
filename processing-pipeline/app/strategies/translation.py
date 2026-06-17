# app/strategies/translation.py
import time
from abc import ABC, abstractmethod
from functools import lru_cache

import httpx
import structlog

from app.config import settings

logger = structlog.get_logger()

# ISO 639-1 and ISO 639-3 codes for all 22 scheduled Indian languages
INDIC_LANG_CODES: frozenset[str] = frozenset({
    "hi", "bn", "te", "mr", "ta", "gu", "ur",
    "kn", "ml", "pa", "or", "as", "sa", "mai", "kok",
    "mni", "doi", "sat", "ne", "sd", "ks", "brx", "bo",
    "hin", "ben", "tel", "mar", "tam", "guj", "urd",
    "kan", "mal", "pan", "ory", "asm", "san", "nep", "snd", "kas", "bod",
})

# ISO 639-1 / ISO 639-3 to IndicTrans2 language-script mapping
ISO_MAP = {
    "hi": "hin_Deva", "hin": "hin_Deva",
    "as": "asm_Beng", "asm": "asm_Beng",
    "bn": "ben_Beng", "ben": "ben_Beng",
    "gu": "guj_Gujr", "guj": "guj_Gujr",
    "kn": "kan_Knda", "kan": "kan_Knda",
    "ml": "mal_Mlym", "mal": "mal_Mlym",
    "mr": "mar_Deva", "mar": "mar_Deva",
    "or": "ory_Orya", "ory": "ory_Orya",
    "pa": "pan_Guru", "pan": "pan_Guru",
    "sa": "san_Deva", "san": "san_Deva",
    "ta": "tam_Taml", "tam": "tam_Taml",
    "te": "tel_Telu", "tel": "tel_Telu",
    "ur": "urd_Arab", "urd": "urd_Arab",
    "mai": "mai_Deva",
    "kok": "kok_Deva",
    "mni": "mni_Beng",
    "doi": "doi_Deva",
    "sat": "sat_Olch",
    "ne": "nep_Deva", "nep": "nep_Deva",
    "sd": "snd_Deva", "snd": "snd_Deva",
    "ks": "kas_Deva", "ks_Deva": "kas_Deva",
    "brx": "brx_Deva",
    "bo": "bod_Tibt", "bod": "bod_Tibt",
}


@lru_cache(maxsize=1)
def get_http_client() -> httpx.Client:
    """
    Returns a pooled, thread-safe HTTPX Client cached per worker process.
    Configured with connection pooling limits to optimize connection reuse.
    """
    limits = httpx.Limits(
        max_keepalive_connections=10,
        max_connections=20,
        keepalive_expiry=30.0
    )
    return httpx.Client(
        limits=limits,
        verify=True,
    )


# ── Base ABC ──────────────────────────────────────────────────────────────────

class TranslationStrategy(ABC):

    @abstractmethod
    def translate(self, text: str) -> tuple[str, float, bool]:
        """
        Translates text to English.
        Returns:
            Tuple[translated_text, confidence, failed_flag]
        """
        ...


# ── Passthrough — English or unknown language ─────────────────────────────────

class PassthroughStrategy(TranslationStrategy):

    def translate(self, text: str) -> tuple[str, float, bool]:
        return text, 1.0, False


# ── IndicTrans2 via Triton inference server ───────────────────────────────────

class IndicTrans2Strategy(TranslationStrategy):

    def __init__(self, src_lang: str):
        self.src_lang = src_lang
        self.src_lang_code = ISO_MAP.get(src_lang.lower(), "hin_Deva")
        
        # Build URL ensuring correct model API endpoint
        base_url = settings.TRITON_URL.rstrip("/")
        self._url = f"{base_url}/v2/models/indictrans2/infer"
        self._timeout = settings.TRITON_TIMEOUT_SECONDS

    def translate(self, text: str) -> tuple[str, float, bool]:
        if not text.strip():
            return text, 1.0, False

        # Truncate before sending — Triton model has a strict max sequence limit
        truncated = text[: settings.TRANSLATION_MAX_CHARS]

        payload = {
            "inputs": [
                {
                    "name": "TEXT",
                    "shape": [1],
                    "datatype": "BYTES",
                    "data": [truncated],
                }
            ],
            "outputs": [{"name": "TRANSLATION"}],
            "parameters": {
                "src_lang": self.src_lang_code,
                "tgt_lang": "eng_Latn",
            },
        }

        client = get_http_client()
        max_retries = 3
        backoff_factor = 0.5

        for attempt in range(max_retries):
            try:
                response = client.post(
                    self._url,
                    json=payload,
                    timeout=self._timeout,
                )
                response.raise_for_status()
                result = response.json()
                translated = result["outputs"][0]["data"][0]
                confidence = float(
                    result["outputs"][0]
                    .get("parameters", {})
                    .get("confidence", 0.9)
                )
                return translated, confidence, False

            except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt == max_retries - 1:
                    logger.error(
                        "translation.failed_after_retries",
                        lang=self.src_lang,
                        url=self._url,
                        error=str(exc)
                    )
                    return text, 0.0, True
                
                sleep_time = backoff_factor * (2 ** attempt)
                logger.warning(
                    "translation.retrying",
                    attempt=attempt + 1,
                    sleep_time=sleep_time,
                    error=str(exc)
                )
                time.sleep(sleep_time)

            except httpx.HTTPStatusError as exc:
                logger.error(
                    "translation.http_status_error",
                    lang=self.src_lang,
                    status_code=exc.response.status_code,
                    url=self._url,
                    error=str(exc)
                )
                return text, 0.0, True

            except Exception as exc:
                logger.error(
                    "translation.unexpected_error",
                    lang=self.src_lang,
                    url=self._url,
                    error=str(exc)
                )
                return text, 0.0, True

        return text, 0.0, True


# ── Factory ───────────────────────────────────────────────────────────────────

def get_translation_strategy(lang_code: str | None) -> TranslationStrategy:
    """
    Returns the correct strategy for the detected language.
    Called once per document in the translate task.
    """
    if not lang_code:
        return PassthroughStrategy()

    lang_lower = lang_code.lower()
    if lang_lower in ("en", "eng"):
        return PassthroughStrategy()

    if lang_lower in INDIC_LANG_CODES:
        return IndicTrans2Strategy(src_lang=lang_lower)

    return PassthroughStrategy()
