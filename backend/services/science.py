"""Scientific dependency foundations. No analytics are represented as implemented."""
from importlib import import_module
from typing import Protocol

from backend.models import Observation

SCIENTIFIC_MODULES = ("pandas", "numpy", "sklearn", "xarray", "geopandas")


def scientific_versions() -> dict[str, str]:
    """Explicit verification utility; raises on import failure rather than masking it."""
    return {name: import_module(name).__version__ for name in SCIENTIFIC_MODULES}


class ScientificSource(Protocol):
    """Future adapters must retain raw provenance and explicit missing values."""

    def retrieve(self, *, region: str, indicator: str, start: str,
                 end: str) -> list[Observation]: ...


def calculate_trend(observations: list[Observation]) -> None:
    raise NotImplementedError("Trend engine pending statistical validation; no result generated.")
