# app/services/embed_service.py
from functools import lru_cache

import structlog
from sentence_transformers import SentenceTransformer

from app.config import settings

logger = structlog.get_logger()


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    """
    Loads and caches the SentenceTransformer model once per worker process.
    Configured with settings.EMBEDDING_MODEL_NAME and settings.EMBED_DEVICE.
    """
    logger.info(
        "Loading embedding model",
        model_name=settings.EMBEDDING_MODEL_NAME,
        device=settings.EMBED_DEVICE
    )
    return SentenceTransformer(settings.EMBEDDING_MODEL_NAME, device=settings.EMBED_DEVICE)


class EmbedService:
    """
    Production-grade Service to generate text embeddings using the cached E5 transformer model.
    Handles single documents and batches, using appropriate E5 instruction prefixes.
    """

    def __init__(self) -> None:
        self.model = get_model()

    def generate_embedding(self, text: str, prefix: str = "passage: ") -> list[float]:
        """
        Generate a list of floats representing the embedding vector for a single document.
        Defaults to 'passage: ' prefix for document indexing.
        """
        if not text.strip():
            return []

        prefixed_text = f"{prefix}{text.strip()}"
        embeddings = self.model.encode(
            [prefixed_text],
            normalize_embeddings=True,
            show_progress_bar=False
        )
        return embeddings[0].tolist()

    def embed(self, text: str, prefix: str = "passage: ") -> list[float]:
        """Alias for generate_embedding to match client interfaces."""
        return self.generate_embedding(text, prefix=prefix)

    def embed_batch(self, texts: list[str], prefix: str = "passage: ") -> list[list[float]]:
        """
        Generates embeddings in batches for high-throughput processing.
        Useful for aggregation and nightly batch jobs.
        """
        cleaned_texts = [f"{prefix}{t.strip()}" for t in texts if t.strip()]
        if not cleaned_texts:
            return []

        embeddings = self.model.encode(
            cleaned_texts,
            normalize_embeddings=True,
            batch_size=settings.EMBED_BATCH_SIZE,
            show_progress_bar=False
        )
        return embeddings.tolist()


# Class alias for compatibility
EmbeddingService = EmbedService


@lru_cache(maxsize=1)
def get_embed_service() -> EmbedService:
    return EmbedService()
