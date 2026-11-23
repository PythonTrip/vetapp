"""Catalog entries for editions that cannot be assessed yet."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class UnavailableEdition:
    standard_code: str
    edition: str
    source_url: str
    reason: str
    normative_categories: tuple[str, ...]


def pending_dataset_edition(
    *,
    standard_code: str,
    edition: str,
    source_url: str,
    title: str,
    normative_categories: tuple[str, ...],
    dataset_path: Path,
) -> UnavailableEdition:
    if dataset_path.is_file():
        reason = f"Нормативные таблицы {title} найдены, провайдер оценки ещё не подключён."
    else:
        reason = f"Нормативные таблицы {title} ещё не загружены."
    return UnavailableEdition(
        standard_code,
        edition,
        source_url,
        reason,
        normative_categories,
    )
