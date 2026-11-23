"""Catalog adapters for editions awaiting verified commercial-use datasets."""
from dataclasses import dataclass


@dataclass(frozen=True)
class UnavailableEdition:
    standard_code: str
    edition: str
    source_url: str
    reason: str
    normative_categories: tuple[str, ...]


NRC_2006 = UnavailableEdition(
    "nrc", "2006", "https://doi.org/10.17226/10668",
    "Право на коммерческое использование таблиц NRC не подтверждено.",
    ("MR", "RA", "AI", "SUL"),
)

AAFCO_2026 = UnavailableEdition(
    "aafco", "2026", "https://www.aafco.org/resources/publications/",
    "Требуются проверенные таблицы Official Publication, применимые обновления и разрешение на коммерческое использование.",
    ("minimum", "maximum"),
)
