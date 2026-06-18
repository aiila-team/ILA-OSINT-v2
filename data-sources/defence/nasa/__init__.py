from importlib import import_module
from typing import TYPE_CHECKING

__all__ = ['collect']

if TYPE_CHECKING:
    from .collector import collect  # pragma: no cover


def __getattr__(name: str):
    if name == 'collect':
        module = import_module(f'{__name__}.collector')
        collect = getattr(module, 'collect')
        globals()[name] = collect
        return collect
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
