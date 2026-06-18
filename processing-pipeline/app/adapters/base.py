# app/adapters/base.py
from abc import ABC, abstractmethod

from app.schemas.raw_event import RawEvent


class SourceAdapter(ABC):
    """Abstract base class for all source adapters normalising payload → RawEvent."""

    @abstractmethod
    def normalize(self, payload: dict, topic: str) -> RawEvent:
        """Transform source-specific payload → canonical RawEvent."""
        pass
