from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from vetdietderm_api.catalog.schemas import FeedForm, FoodType
from vetdietderm_api.patients.schemas import Species


class AssessmentStatus(StrEnum):
    met = "met"
    below_minimum = "below_minimum"
    above_maximum = "above_maximum"
    not_established = "not_established"
    not_applicable = "not_applicable"
    insufficient_context = "insufficient_context"
    missing_product_data = "missing_product_data"


class AnimalProfile(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    species: Species
    current_body_weight_kg: float | None = Field(default=None, gt=0)
    target_body_weight_kg: float | None = Field(default=None, gt=0)
    expected_mature_weight_kg: float | None = Field(default=None, gt=0)
    age_months: float | None = Field(default=None, ge=0)
    life_stage: str | None = None
    activity: str | None = None
    neutered: bool = False
    pregnant: bool = False
    lactating: bool = False
    lactation_week: int | None = Field(default=None, ge=0)
    litter_size: int | None = Field(default=None, ge=0)
    bcs: int | None = Field(default=None, ge=1, le=9)

    @model_validator(mode="before")
    @classmethod
    def map_legacy_snapshot_weights(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        mapped = dict(value)
        if mapped.get("current_body_weight_kg") is None and mapped.get("body_weight_kg") is not None:
            mapped["current_body_weight_kg"] = mapped["body_weight_kg"]
        if (
            mapped.get("expected_mature_weight_kg") is None
            and mapped.get("expected_adult_weight_kg") is not None
        ):
            mapped["expected_mature_weight_kg"] = mapped["expected_adult_weight_kg"]
        return mapped


class RationComponent(BaseModel):
    food_uuid: UUID
    grams: float = Field(gt=0)


WeightBasis = Literal["current", "target_override"]
AssessmentOverall = Literal["adequate", "inadequate", "indeterminate"]
RangeWorkingPointRule = Literal["midpoint"]


class AssessmentRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    animal: AnimalProfile
    feed_form: FeedForm = FeedForm.unknown
    therapeutic_goal: bool = False
    rer_factor: float = Field(default=1.6, gt=0, le=10)
    energy_adjustment_percent: float = Field(default=100, gt=0, le=300)
    ration_species_mismatch_confirmed: bool = False
    components: list[RationComponent] = Field(min_length=1)

    @model_validator(mode="after")
    def component_ids_are_unique(self) -> "AssessmentRequest":
        ids = [item.food_uuid for item in self.components]
        if len(ids) != len(set(ids)):
            raise ValueError("Each food may appear only once in a ration")
        return self


class EditionIdentity(BaseModel):
    code: str
    source_checksum: str
    source_title: str
    source_url: str
    clinical_warning_ru: str


class ResolvedContext(BaseModel):
    nutrient_profile_code: str | None
    energy_formula_code: str | None
    size_class_code: str | None
    weight_basis: WeightBasis = "current"
    feed_form: FeedForm
    therapeutic_goal: bool
    ration_species_mismatch_confirmed: bool = False


class EnergyAssessment(BaseModel):
    energy_formula_code: str | None
    reference_energy_kcal: float | None
    reference_energy_min_kcal: float | None
    reference_energy_max_kcal: float | None
    range_working_point_rule: RangeWorkingPointRule | None = None
    energy_adjustment_percent: float
    working_energy_kcal: float | None
    rer_kcal_day: float | None
    rer_factor: float
    rer_factor_kcal_day: float | None
    complete: bool
    missing_fields: list[str]
    explanation_ru: str | None = None


class EnergyPointValue(BaseModel):
    kind: Literal["point"] = "point"
    kcal_day: float


class EnergyRangeValue(BaseModel):
    kind: Literal["range"] = "range"
    min_kcal_day: float
    max_kcal_day: float


EnergyEstimateValue = EnergyPointValue | EnergyRangeValue


class EnergyMultiplierPoint(BaseModel):
    kind: Literal["point"] = "point"
    factor: float


class EnergyMultiplierRange(BaseModel):
    kind: Literal["range"] = "range"
    min_factor: float
    max_factor: float


class EnergyEstimateSource(BaseModel):
    edition: str
    table: str | None
    page: int | None


class EnergyEstimateRequest(BaseModel):
    animal: AnimalProfile
    energy_adjustment_percent: float = Field(default=100, gt=0, le=300)


class EnergyEstimateResponse(BaseModel):
    energy_formula_code: str | None
    value: EnergyEstimateValue | None
    inputs: dict[str, float | int]
    source: EnergyEstimateSource
    warnings: list[str]
    missing_fields: list[str]
    weight_basis: WeightBasis = "current"
    size_class_code: str | None = None
    base_mer_value: EnergyPointValue | None = None
    multiplier_value: EnergyMultiplierPoint | EnergyMultiplierRange | None = None
    reference_energy_kcal: float | None = None
    range_working_point_rule: RangeWorkingPointRule | None = None
    energy_adjustment_percent: float = 100
    working_energy_kcal: float | None = None


class CoverageAssessment(BaseModel):
    expected_atomic_count: int
    complete_atomic_count: int
    percent: float
    below_threshold: bool


class RowCompleteness(BaseModel):
    complete_components: int
    total_components: int
    missing_food_names: list[str]


class TargetRead(BaseModel):
    minimum: float | None
    maximum: float | None
    unit: str
    basis: str
    source_value_text: str | None = None


class SourceRead(BaseModel):
    title: str
    url: str
    page: int | None = None
    table: str | None = None
    row: str | None = None


class AssessmentRow(BaseModel):
    code: str
    name: str
    unit: str
    derived: bool
    ration_per_1000_kcal_me: float | None
    ration_daily_amount: float | None = None
    target: TargetRead | None
    status: AssessmentStatus
    completeness: RowCompleteness
    source: SourceRead
    note_ru: str | None = None


class AssessmentGate(BaseModel):
    code: str
    explanation_ru: str


class AssessmentResponse(BaseModel):
    engine_id: str
    edition: EditionIdentity
    context: ResolvedContext
    energy: EnergyAssessment
    coverage: CoverageAssessment
    rows: list[AssessmentRow]
    met_count: int
    below_minimum_count: int = 0
    above_maximum_count: int = 0
    unevaluable_count: int = 0
    overall: AssessmentOverall = "indeterminate"
    input_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    normative_comparison_performed: bool
    gate: AssessmentGate | None = None


class SuggestionRequest(BaseModel):
    animal: AnimalProfile


class SuggestionOption(BaseModel):
    code: str
    name_ru: str


class FormulaSuggestionOption(SuggestionOption):
    required_animal_fields: list[str]
    result_kind: Literal["point", "range"]
    allowed_weight_bases: list[WeightBasis]


class ContextSuggestion(BaseModel):
    code: str
    reason: str


class SizeClassSuggestionOption(SuggestionOption):
    min_adult_weight_kg: float | None
    max_adult_weight_kg: float | None


class SuggestionsResponse(BaseModel):
    edition: EditionIdentity
    profile_options: list[SuggestionOption]
    energy_formula_options: list[FormulaSuggestionOption]
    size_class_options: list[SizeClassSuggestionOption]
    energy_suggestion: ContextSuggestion | None
    nutrient_standard_suggestion: ContextSuggestion | None
    suggested_profile_code: str | None
    suggested_energy_formula_code: str | None
    suggested_size_class_code: str | None
    confidence: str
    confidence_ru: str


class DietPlanRationComponent(BaseModel):
    food_uuid: UUID
    grams: float = Field(gt=0)
    food_name: str
    food_type: FoodType
    feed_form: FeedForm


class AssessmentSnapshot(BaseModel):
    request: AssessmentRequest
    assessment: AssessmentResponse
    nutrient_profile_code: str | None
    energy_formula_code: str | None


class DietPlanWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=255)
    patient_uuid: UUID | None = None
    notes: str | None = None
    assessment_request: AssessmentRequest

    @field_validator("notes", mode="before")
    @classmethod
    def blank_notes_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class PatientPlanReference(BaseModel):
    uuid: UUID
    name: str


class DietPlanSummary(BaseModel):
    uuid: UUID
    name: str
    patient_uuid: UUID | None
    patient: PatientPlanReference | None
    engine_id: str
    edition_code: str
    edition_source_checksum: str
    created_at: datetime
    updated_at: datetime


class DietPlanRead(DietPlanSummary):
    ration: list[DietPlanRationComponent]
    assessment_snapshot: AssessmentSnapshot
    notes: str | None
