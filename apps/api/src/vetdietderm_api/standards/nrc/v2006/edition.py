from pathlib import Path

from vetdietderm_api.standards.unavailable import UnavailableEdition, pending_dataset_edition

DATASET_PATH = Path(__file__).with_name("normative_data.json")
SOURCE_URL = "https://doi.org/10.17226/10668"
NORMATIVE_CATEGORIES = ("MR", "RA", "AI", "SUL")


def catalog_entry() -> UnavailableEdition:
    return pending_dataset_edition(
        standard_code="nrc",
        edition="2006",
        source_url=SOURCE_URL,
        title="NRC 2006",
        normative_categories=NORMATIVE_CATEGORIES,
        dataset_path=DATASET_PATH,
    )
