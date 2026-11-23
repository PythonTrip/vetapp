"""NRC 2006 assessment provider."""

from pathlib import Path

from vetdietderm_api.standards.contract import NutritionStandardProvider
from vetdietderm_api.standards.density import load_density_provider
from vetdietderm_api.standards.nrc.v2006.edition import DATASET_PATH

PROVIDER_VERSION = "nrc/v2006/1.0.0"


def load_provider() -> NutritionStandardProvider | None:
    if not DATASET_PATH.is_file():
        return None
    return load_density_provider(
        DATASET_PATH,
        standard_code="nrc",
        provider_version=PROVIDER_VERSION,
        implementation_paths=(Path(__file__), Path(load_density_provider.__code__.co_filename)),
    )
