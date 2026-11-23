from pathlib import Path

from vetdietderm_api.standards.unavailable import UnavailableEdition, pending_dataset_edition

DATASET_PATH = Path(__file__).with_name("normative_data.json")
SOURCE_URL = "https://www.aafco.org/resources/publications/"
NORMATIVE_CATEGORIES = ("minimum", "maximum")


def catalog_entry() -> UnavailableEdition:
    return pending_dataset_edition(
        standard_code="aafco",
        edition="2026",
        source_url=SOURCE_URL,
        title="AAFCO 2026",
        normative_categories=NORMATIVE_CATEGORIES,
        dataset_path=DATASET_PATH,
    )
