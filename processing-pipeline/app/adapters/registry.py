# app/adapters/registry.py
from app.adapters.base import SourceAdapter
from app.adapters.news import NewsAdapter
from app.adapters.youtube import YoutubeAdapter
from app.adapters.telegram import TelegramAdapter
from app.adapters.nasa import NasaAdapter
from app.adapters.bhuvan import BhuvanAdapter
from app.adapters.certin import CertInAdapter
# Map Kafka topics directly to their corresponding normalizer adapter instances.
ADAPTER_REGISTRY = {
    "raw-events.telegram": TelegramAdapter(),
    "raw-events.youtube": YoutubeAdapter(),
    # "raw-events.bhuvan": BhuvanAdapter(),  # Temporarily disabled to skip the 120k backlog during testing
    "raw-events.cert-in": CertInAdapter(),
    "raw-events.nasa": NasaAdapter(),
    "raw-events.news": NewsAdapter(),
}

def get_adapter(topic: str) -> SourceAdapter | None:
    """Retrieve the adapter registered for a specific Kafka topic."""
    return ADAPTER_REGISTRY.get(topic)