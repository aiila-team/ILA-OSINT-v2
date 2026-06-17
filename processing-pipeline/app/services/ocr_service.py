# app/services/ocr_service.py
import io
from functools import lru_cache

import httpx
import pytesseract
import structlog
from PIL import Image

from app.config import settings

logger = structlog.get_logger()

# Set Tesseract command path if configured in environment
if settings.TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD


@lru_cache(maxsize=1)
def get_http_client() -> httpx.Client:
    """Returns a pooled, thread-safe HTTPX Client cached per worker process."""
    limits = httpx.Limits(
        max_keepalive_connections=5,
        max_connections=10,
        keepalive_expiry=30.0
    )
    return httpx.Client(
        limits=limits,
        verify=True,
        headers={"User-Agent": "ILA-OSINT-ProcessingPipeline/1.0"}
    )


class OCRService:
    """
    Production-grade Service to process media URLs.
    Extracts text from images (via Tesseract OCR) and transcribes audio (via IndicConformer ASR).
    Falls back gracefully so that a failed media download/process never crashes the document flow.
    """

    def __init__(self) -> None:
        self.client = get_http_client()

    def process_media(self, media_urls: list[str], language_hint: str | None = None) -> str:
        """
        Main pipeline interface to process a list of media URLs.
        Detects images and audio and extracts text accordingly.
        """
        if not media_urls:
            return ""

        # Cap the number of media URLs to process
        media_urls = media_urls[:settings.OCR_MAX_MEDIA_ITEMS]
        extracted_texts = []
        
        # Build language parameter for Tesseract based on hint
        tesseract_lang = settings.OCR_LANG_STRING
        if language_hint:
            lang_map = {"hi": "hin", "hin": "hin", "en": "eng", "eng": "eng"}
            mapped = lang_map.get(language_hint.lower())
            if mapped and mapped != "eng":
                tesseract_lang = f"{settings.OCR_LANG_STRING}+{mapped}"

        for url in media_urls:
            try:
                download_result = self._fetch_media(url)
                if not download_result:
                    continue

                media_bytes, content_type = download_result
                path_lower = url.lower()
                
                is_image = "image" in content_type or any(
                    path_lower.endswith(ext)
                    for ext in [".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"]
                )
                is_audio = "audio" in content_type or any(
                    path_lower.endswith(ext) for ext in [".wav", ".mp3", ".ogg", ".m4a", ".flac"]
                )

                if is_image:
                    logger.info("Processing image OCR", url=url)
                    text = self._ocr_image(media_bytes, lang=tesseract_lang)
                    if text:
                        extracted_texts.append(f"[OCR: {text}]")
                elif is_audio:
                    logger.info("Processing audio ASR", url=url)
                    text = self._asr_audio(media_bytes, content_type)
                    if text:
                        extracted_texts.append(f"[ASR: {text}]")
                else:
                    logger.debug(
                        "Unsupported media content type, skipping",
                        url=url,
                        content_type=content_type
                    )

            except Exception as exc:
                logger.warning("ocr.process_failed", url=url, error=str(exc))

        return "\n\n".join(extracted_texts)

    def extract_from_urls(self, media_urls: list[str]) -> str | None:
        """Alias for process_media (specifically for images) to match the new client interface."""
        text = self.process_media(media_urls)
        return text if text else None

    # ── internal helpers ──────────────────────────────────────────────────────

    def _fetch_media(self, url: str) -> tuple[bytes, str] | None:
        """Download media from URL using connection pooling and proper timeouts."""
        try:
            response = self.client.get(
                url,
                timeout=settings.OCR_FETCH_TIMEOUT_SECONDS,
                follow_redirects=True
            )
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "")
            return response.content, content_type
        except httpx.TimeoutException:
            logger.warning("ocr.fetch_timeout", url=url)
            return None
        except httpx.HTTPStatusError as exc:
            logger.warning("ocr.fetch_http_error", url=url, status=exc.response.status_code)
            return None
        except Exception as exc:
            logger.warning("ocr.fetch_failed", url=url, error=str(exc))
            return None

    def _ocr_image(self, image_bytes: bytes, lang: str) -> str:
        """Perform OCR on image bytes using Tesseract."""
        try:
            img = Image.open(io.BytesIO(image_bytes))
            text = pytesseract.image_to_string(img, lang=lang)
            return text.strip()
        except Exception as e:
            logger.error("Tesseract OCR processing failed", error=str(e))
            return ""

    def _asr_audio(self, audio_bytes: bytes, content_type: str) -> str:
        """Perform ASR on audio bytes using IndicConformer (via Triton/API)."""
        if not settings.INDIC_CONFORMER_URL:
            logger.warn("IndicConformer ASR endpoint not configured. Skipping ASR.")
            return ""

        try:
            files = {"file": ("audio", audio_bytes, content_type)}
            response = self.client.post(
                settings.INDIC_CONFORMER_URL,
                files=files,
                timeout=15.0
            )
            response.raise_for_status()
            result = response.json()
            return result.get("transcript", "").strip()
        except Exception as e:
            logger.error("IndicConformer ASR processing failed", error=str(e))
            return ""


@lru_cache(maxsize=1)
def get_ocr_service() -> OCRService:
    return OCRService()
