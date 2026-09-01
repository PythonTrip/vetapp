from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Literal, Mapping, Protocol
from uuid import UUID

if TYPE_CHECKING:
    from vetdietderm_api.assessments.schemas import (
        AnimalProfile,
        AssessmentRequest,
        AssessmentResponse,
        EnergyEstimateRequest,
        EnergyEstimateResponse,
        SuggestionsResponse,
    )


@dataclass(frozen=True)
class StandardMetadata:
    standard_code: str
    edition: str
    import_version: int
    provider_version: str
    provider_checksum: str
    edition_uuid: UUID
    source_checksum: str
    source_title: str
    source_url: str
    publication_date: str | None
    language: str
    clinical_warning_ru: str
    published_at: datetime


@dataclass(frozen=True)
class FoodValue:
    value: float | None
    value_status: str


@dataclass(frozen=True)
class FoodSnapshot:
    uuid: UUID
    name: str
    type: str
    feed_form: str
    values: Mapping[str, FoodValue]


@dataclass(frozen=True)
class ContextOption:
    code: str
    name_ru: str


@dataclass(frozen=True)
class EnergyFormulaOption(ContextOption):
    required_animal_fields: tuple[str, ...]
    result_kind: Literal["point", "range"]
    allowed_weight_bases: tuple[Literal["current", "target_override"], ...]


@dataclass(frozen=True)
class SizeClassOption(ContextOption):
    min_adult_weight_kg: float | None
    max_adult_weight_kg: float | None


@dataclass(frozen=True)
class StandardContextOptions:
    edition: str
    profiles: tuple[ContextOption, ...]
    energy_formulas: tuple[EnergyFormulaOption, ...]
    size_classes: tuple[SizeClassOption, ...]


class NutritionStandardProvider(Protocol):
    """Common boundary exposed by every standard-specific implementation.

    A provider is free to use its own internal data structures and algorithms. The
    shared contract covers only metadata and the API-facing operations.
    """

    @property
    def metadata(self) -> StandardMetadata: ...

    def assess(
        self,
        request: AssessmentRequest,
        foods: Mapping[UUID, FoodSnapshot],
    ) -> AssessmentResponse: ...

    def suggest(self, animal: AnimalProfile) -> SuggestionsResponse: ...

    def estimate_energy(self, request: EnergyEstimateRequest) -> EnergyEstimateResponse: ...

    def context_options(self, species: Literal["dog", "cat"]) -> StandardContextOptions: ...
