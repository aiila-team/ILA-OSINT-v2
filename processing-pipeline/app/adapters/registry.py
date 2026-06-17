# app/adapters/registry.py
from app.adapters.base import SourceAdapter
from app.adapters.news import NewsAdapter
from app.adapters.youtube import YouTubeAdapter
from app.adapters.telegram import TelegramAdapter

# Map Kafka topics directly to their corresponding normalizer adapter instances.
ADAPTER_REGISTRY: dict[str, SourceAdapter] = {
    "news.raw": NewsAdapter(),
    "youtube.raw": YouTubeAdapter(),
    "telegram.raw": TelegramAdapter(),
}

def get_adapter(topic: str) -> SourceAdapter | None:
    """Retrieve the adapter registered for a specific Kafka topic."""
    return ADAPTER_REGISTRY.get(topic)