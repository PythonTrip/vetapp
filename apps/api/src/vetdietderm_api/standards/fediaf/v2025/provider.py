from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from typing import Literal, Mapping
from uuid import UUID

from vetdietderm_api.assessments.schemas import (
    AnimalProfile,
    AssessmentRequest,
    AssessmentResponse,
    EnergyEstimateRequest,
    EnergyEstimateResponse,
    SuggestionsResponse,
)
from vetdietderm_api.standards.contract import (
    ContextOption,
    EnergyFormulaOption,
    FoodSnapshot,
    SizeClassOption,
    StandardContextOptions,
    StandardMetadata,
)
from vetdietderm_api.standards.fediaf.v2025 import assessment, resolver
from vetdietderm_api.standards.fediaf.v2025.normative_data import load_standard_data

PROVIDER_VERSION = "fediaf/v2025/1.1.0"


def _provider_checksum() -> str:
    package_dir = Path(__file__).parent
    digest = sha256()
    for path in sorted(package_dir.iterdir(), key=lambda item: item.name):
        if path.name == "__pycache__" or path.suffix not in {".py", ".json"}:
            continue
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


class Fediaf2025Provider:
    def __init__(self) -> None:
        self._data = load_standard_data()
        edition = self._data.edition
        self._metadata = StandardMetadata(
            standard_code="fediaf",
            edition=edition.code,
            import_version=edition.import_version,
            provider_version=PROVIDER_VERSION,
            provider_checksum=_provider_checksum(),
            edition_uuid=edition.uuid,
            source_checksum=edition.source_checksum,
            source_title=edition.source_title,
            source_url=edition.source_url,
            publication_date=edition.publication_date,
            language=edition.language,
            clinical_warning_ru=edition.clinical_warning_ru,
            published_at=edition.published_at,
        )

    @property
    def metadata(self) -> StandardMetadata:
        return self._metadata

    @property
    def data(self):
        """Read-only FEDIAF structure for tests and standard-local calculations."""
        return self._data

    def assess(
        self,
        request: AssessmentRequest,
        foods: Mapping[UUID, FoodSnapshot],
    ) -> AssessmentResponse:
        return assessment.assess_nutrition(request, self._data, foods)

    def suggest(self, animal: AnimalProfile) -> SuggestionsResponse:
        return resolver.suggest_context(animal, self._data)

    def estimate_energy(self, request: EnergyEstimateRequest) -> EnergyEstimateResponse:
        return assessment.evaluate_energy_scenario(request, self._data)

    def context_options(self, species: Literal["dog", "cat"]) -> StandardContextOptions:
        profiles = tuple(
            ContextOption(item.code, item.name_ru)
            for item in sorted(self._data.profiles.values(), key=lambda value: value.code)
            if item.species_code == species and item.clinician_selectable
        )
        formulas = tuple(
            EnergyFormulaOption(
                code=item.code,
                name_ru=item.name_ru,
                required_animal_fields=tuple(item.required_animal_fields),
                result_kind=item.result_kind,  # type: ignore[arg-type]
                allowed_weight_bases=tuple(item.allowed_weight_bases),  # type: ignore[arg-type]
            )
            for item in sorted(self._data.formulas.values(), key=lambda value: value.code)
            if item.species_code == species
        )
        sizes = tuple(
            SizeClassOption(
                code=item.code,
                name_ru=item.name_ru,
                min_adult_weight_kg=float(item.min_adult_weight_kg) if item.min_adult_weight_kg is not None else None,
                max_adult_weight_kg=float(item.max_adult_weight_kg) if item.max_adult_weight_kg is not None else None,
            )
            for item in sorted(
                self._data.size_classes.values(),
                key=lambda value: (float(value.min_adult_weight_kg or 0), value.code),
            )
            if item.species_code == species
        )
        return StandardContextOptions(self.metadata.edition, profiles, formulas, sizes)


provider = Fediaf2025Provider()
