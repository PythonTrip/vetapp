"""AAFCO assessment provider.

The published edition code comes from ``database_meta.version`` in the dataset.
"""

from pathlib import Path

from vetdietderm_api.standards.aafco.v2026.edition import DATASET_PATH
from vetdietderm_api.standards.contract import NutritionStandardProvider
from vetdietderm_api.standards.density import load_density_provider

PROVIDER_VERSION = "aafco/v2026/1.1.0"


def load_provider() -> NutritionStandardProvider | None:
    if not DATASET_PATH.is_file():
        return None
    return load_density_provider(
        DATASET_PATH,
        standard_code="aafco",
        provider_version=PROVIDER_VERSION,
        implementation_paths=(Path(__file__), Path(load_density_provider.__code__.co_filename)),
    )
