from __future__ import annotations

from typing import Any

from vetdietderm_api.assessments.schemas import (
    ContextSuggestion,
    EditionIdentity,
    FormulaSuggestionOption,
    SizeClassSuggestionOption,
    SuggestionOption,
    SuggestionsResponse,
)
from vetdietderm_api.standards.fediaf.v2025.models import GrowthSizeClass, StandardData


def resolve_size_class(animal: Any, data: StandardData) -> GrowthSizeClass | None:
    weight = animal.expected_mature_weight_kg
    if animal.species.value != "dog" or weight is None:
        return None
    for item in data.size_classes.values():
        minimum_ok = item.min_adult_weight_kg is None or (
            weight > float(item.min_adult_weight_kg)
            if item.min_exclusive
            else weight >= float(item.min_adult_weight_kg)
        )
        maximum_ok = item.max_adult_weight_kg is None or (
            weight <= float(item.max_adult_weight_kg)
            if item.max_inclusive
            else weight < float(item.max_adult_weight_kg)
        )
        if minimum_ok and maximum_ok:
            return item
    return None


def _age_reason(species: str, age_months: float | None) -> str:
    if age_months is None:
        return f"{species}_age_unknown"
    return f"{species}_age_{f'{age_months:g}'.replace('.', '_')}_months"


def suggest_formula(animal: Any, data: StandardData) -> tuple[str | None, str, str]:
    species = animal.species.value
    formulas = {code for code, item in data.formulas.items() if item.species_code == species}
    if species == "dog":
        if animal.lactating or animal.life_stage == "lactation":
            code = "lactation_5_8" if (animal.litter_size or 0) >= 5 else "lactation_1_4"
            return code if code in formulas else None, "dog_lactating", "high" if animal.litter_size is not None else "low"
        if animal.pregnant or animal.life_stage == "gestation":
            return "gestation_last_5w" if "gestation_last_5w" in formulas else None, "dog_pregnant", "low"
        if animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
            return "puppy_8w_1y" if "puppy_8w_1y" in formulas else None, _age_reason("dog", animal.age_months), "high" if animal.age_months is not None else "low"
        if animal.life_stage == "senior":
            return "senior_over_7" if "senior_over_7" in formulas else None, "dog_life_stage_senior", "high"
        code = {
            "low": "activity_low",
            "moderate": "activity_moderate_low_impact",
            "high": "activity_high",
            "very_high": "activity_high",
        }.get(animal.activity or "", "adult_age_3_7")
        return code if code in formulas else None, f"dog_activity_{animal.activity}" if animal.activity else "dog_adult_default", "high" if animal.activity else "low"
    if species == "cat":
        if animal.lactating or animal.life_stage == "lactation":
            week = animal.lactation_week
            code = "lactation_lt3" if week is not None and week < 3 else "lactation_3_4" if week is not None and week <= 4 else "lactation_gt4"
            return code if code in formulas else None, "cat_lactating", "high" if week is not None else "low"
        if animal.pregnant or animal.life_stage == "gestation":
            return "gestation" if "gestation" in formulas else None, "cat_pregnant", "high"
        if animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
            age = animal.age_months
            code = "kitten_0_4m" if age is not None and age < 4 else "kitten_4_9m" if age is not None and age < 9 else "kitten_9_12m"
            return code if code in formulas else None, _age_reason("cat", age), "high" if age is not None else "low"
        indoor = animal.neutered or animal.activity == "low"
        code = "adult_indoor_neutered" if indoor else "adult_active"
        return code if code in formulas else None, "cat_indoor_or_neutered" if indoor else "cat_adult_active", "high"
    return None, "species_out_of_scope", "low"


def suggest_profile(animal: Any, data: StandardData) -> tuple[str | None, str]:
    species = animal.species.value
    profile_codes = {code for code, item in data.profiles.items() if item.species_code == species}
    if species == "dog":
        if animal.lactating or animal.life_stage == "lactation":
            code, reason = "dog_early_growth_reproduction", "dog_lactating"
        elif animal.pregnant or animal.life_stage == "gestation":
            code, reason = "dog_early_growth_reproduction", "dog_pregnant"
        elif animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
            early = animal.age_months is None or animal.age_months < 3.5
            code = "dog_early_growth_reproduction" if early else "dog_late_growth"
            reason = "dog_age_lt_14_weeks" if early else "dog_age_ge_14_weeks"
        else:
            code = "dog_adult_mer95" if animal.activity == "low" else "dog_adult_mer110"
            reason = "dog_adult_low_activity" if animal.activity == "low" else "dog_adult_other_activity"
    elif species == "cat":
        if animal.lactating or animal.life_stage == "lactation":
            code, reason = "cat_reproduction", "cat_lactating"
        elif animal.pregnant or animal.life_stage == "gestation":
            code, reason = "cat_reproduction", "cat_pregnant"
        elif animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
            code, reason = "cat_growth", "cat_age_lt_12_months"
        else:
            indoor = animal.neutered or animal.activity == "low"
            code = "cat_adult_mer75" if indoor else "cat_adult_mer100"
            reason = "cat_adult_indoor_or_neutered" if indoor else "cat_adult_active"
    else:
        return None, "species_out_of_scope"
    return (code if code in profile_codes else None), reason


def suggest_context(animal: Any, data: StandardData) -> SuggestionsResponse:
    species = animal.species.value
    formula_code, formula_reason, confidence = suggest_formula(animal, data)
    profile_code, profile_reason = suggest_profile(animal, data)
    profiles = sorted(
        (item for item in data.profiles.values() if item.species_code == species and item.clinician_selectable),
        key=lambda item: item.code,
    )
    formulas = sorted(
        (item for item in data.formulas.values() if item.species_code == species),
        key=lambda item: item.code,
    )
    sizes = sorted(
        (item for item in data.size_classes.values() if item.species_code == species),
        key=lambda item: (float(item.min_adult_weight_kg or 0), item.code),
    )
    size_class = resolve_size_class(animal, data)
    return SuggestionsResponse(
        edition=EditionIdentity(
            code=data.edition.code,
            source_checksum=data.edition.source_checksum,
            source_title=data.edition.source_title,
            source_url=data.edition.source_url,
            clinical_warning_ru=data.edition.clinical_warning_ru,
        ),
        profile_options=[SuggestionOption(code=item.code, name_ru=item.name_ru) for item in profiles],
        energy_formula_options=[
            FormulaSuggestionOption(
                code=item.code,
                name_ru=item.name_ru,
                required_animal_fields=item.required_animal_fields,
                result_kind=item.result_kind,
                allowed_weight_bases=item.allowed_weight_bases,
            )
            for item in formulas
        ],
        size_class_options=[
            SizeClassSuggestionOption(
                code=item.code,
                name_ru=item.name_ru,
                min_adult_weight_kg=float(item.min_adult_weight_kg) if item.min_adult_weight_kg is not None else None,
                max_adult_weight_kg=float(item.max_adult_weight_kg) if item.max_adult_weight_kg is not None else None,
            )
            for item in sizes
        ],
        energy_suggestion=ContextSuggestion(code=formula_code, reason=formula_reason) if formula_code else None,
        nutrient_standard_suggestion=ContextSuggestion(code=profile_code, reason=profile_reason) if profile_code else None,
        suggested_profile_code=profile_code,
        suggested_energy_formula_code=formula_code,
        suggested_size_class_code=size_class.code if size_class else None,
        confidence=confidence,
        confidence_ru={"high": "высокая уверенность", "medium": "средняя уверенность", "low": "низкая уверенность"}[confidence],
    )
