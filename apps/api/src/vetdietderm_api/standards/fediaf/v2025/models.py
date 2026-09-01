from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Mapping
from uuid import UUID


@dataclass(frozen=True)
class Edition:
    uuid: UUID
    code: str
    import_version: int
    source_checksum: str
    source_title: str
    source_url: str
    publication_date: str | None
    language: str
    clinical_warning_ru: str
    published_at: datetime


@dataclass(frozen=True)
class Nutrient:
    uuid: UUID
    code: str
    name: str
    category: str
    base_unit: str


@dataclass(frozen=True)
class GuidelineProfile:
    uuid: UUID
    species_code: str
    code: str
    name_ru: str
    physiological_state: str | None
    energy_basis_value: Decimal
    energy_basis_unit: str
    energy_basis_type: str
    calculation_basis: str
    clinician_selectable: bool
    active: bool = True


@dataclass(frozen=True)
class SourceReference:
    uuid: UUID
    source_url: str
    source_language: str = "en"
    page: int | None = None
    table_code: str | None = None
    section_code: str | None = None
    row_code: str | None = None
    footnote: str | None = None
    source_value_text: str | None = None
    note_ru: str | None = None


@dataclass(frozen=True)
class ApplicabilityRule:
    uuid: UUID
    code: str
    name_ru: str
    predicate_json: Mapping[str, Any]
    note_ru: str | None = None
    source_reference_uuid: UUID | None = None


@dataclass(frozen=True)
class DerivedExpression:
    uuid: UUID
    code: str
    name_ru: str
    result_unit: str
    expression_type: str
    ast_json: Mapping[str, Any]


@dataclass(frozen=True)
class EnergyFormula:
    uuid: UUID
    species_code: str
    code: str
    name_ru: str
    formula_ast: Mapping[str, Any] | None
    range_ast: Mapping[str, Any] | None
    required_animal_fields: list[str]
    result_kind: str
    allowed_weight_bases: list[str]
    result_unit: str
    applicability_rule_uuid: UUID | None
    source_reference_uuid: UUID | None
    note_ru: str | None
    active: bool = True


@dataclass(frozen=True)
class GuidelineTarget:
    uuid: UUID
    profile_uuid: UUID
    nutrient_uuid: UUID | None
    derived_expression_uuid: UUID | None
    source_code: str
    target_status: str
    minimum_value: Decimal | None
    maximum_value: Decimal | None
    unit: str
    basis: str
    applicability_rule_uuid: UUID | None
    source_reference_uuid: UUID | None
    source_value_text: str | None
    footnote: str | None
    note_ru: str | None
    sort_order: int


@dataclass(frozen=True)
class GrowthSizeClass:
    uuid: UUID
    species_code: str
    code: str
    name_ru: str
    min_adult_weight_kg: Decimal | None
    max_adult_weight_kg: Decimal | None
    min_exclusive: bool
    max_inclusive: bool
    growth_curve_ast: Mapping[str, Any] | None
    min_age_weeks: int | None
    max_age_weeks: int | None
    source_reference_uuid: UUID | None


@dataclass(frozen=True)
class StandardData:
    edition: Edition
    profiles: Mapping[str, GuidelineProfile]
    formulas: Mapping[str, EnergyFormula]
    size_classes: Mapping[str, GrowthSizeClass]
    targets: tuple[GuidelineTarget, ...]
    derived: Mapping[UUID, DerivedExpression]
    nutrients: Mapping[UUID, Nutrient]
    nutrients_by_code: Mapping[str, Nutrient]
    rules: Mapping[UUID, ApplicabilityRule]
    sources: Mapping[UUID, SourceReference]
    groups: Mapping[str, tuple[str, ...]]
    lactation_factors: Mapping[tuple[str, int], float]
