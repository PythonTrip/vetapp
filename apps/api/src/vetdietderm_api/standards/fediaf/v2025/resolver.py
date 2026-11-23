from __future__ import annotations

from typing import Any

from vetdietderm_api.assessments.schemas import (
    ContextSuggestion,
    EditionIdentity,
    FormulaSuggestionOption,
    ProfileCompatibility,
    ProfileSuggestionOption,
    SizeClassSuggestionOption,
    SuggestionsResponse,
)
from vetdietderm_api.standards.fediaf.v2025.models import GrowthSizeClass, StandardData

DOG_LATE_GROWTH_MONTHS = 14 * 7 / (365.25 / 12)
DOG_WEANING_MONTHS = 8 * 7 / (365.25 / 12)


def life_stage(animal: Any) -> str:
    if animal.pregnant or animal.lactating or animal.life_stage in {"gestation", "lactation"}:
        return "reproduction"
    if animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
        return "growth"
    return "adult"


def validate_profile(code: str, animal: Any, data: StandardData) -> ProfileCompatibility:
    profile = data.profiles.get(code)
    if profile is None or not profile.clinician_selectable or not profile.active:
        return ProfileCompatibility(level="hard", code="profile_not_found", message="Профиль недоступен в выбранной редакции.")
    if profile.species_code != animal.species.value:
        return ProfileCompatibility(level="hard", code="profile_species_mismatch", message="Профиль предназначен для другого вида.")
    stage = life_stage(animal)
    allowed = {stage, "growth_reproduction"} if stage != "adult" else {"adult"}
    if profile.physiological_state not in allowed:
        return ProfileCompatibility(level="hard", code="profile_life_stage_mismatch", message="Профиль несовместим со стадией жизни пациента.")
    suggested, _ = suggest_profile(animal, data)
    if stage == "growth" and animal.species.value == "dog":
        if animal.age_months is None or code != suggested:
            return ProfileCompatibility(
                level="soft", code="growth_age_review",
                message="Проверьте применимость профиля роста по границе 14 недель и укажите причину выбора.",
                comment_required=True,
            )
    if code != suggested:
        return ProfileCompatibility(level="soft", code="profile_differs_from_recommendation", message="Профиль отличается от рекомендации для этого пациента.")
    return ProfileCompatibility(level="compatible")


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
            size = animal.litter_size
            if size is None or size < 1:
                return None, "litter_size", "low"
            code = "lactation_5_8" if size >= 5 else "lactation_1_4"
            return code if code in formulas else None, "dog_lactating", "high"
        if animal.pregnant or animal.life_stage == "gestation":
            if animal.gestation_week is None:
                return None, "gestation_week", "low"
            code = "gestation_first_4w" if animal.gestation_week <= 4 else "gestation_last_5w"
            return code if code in formulas else None, "dog_pregnant", "high"
        if animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
            if animal.age_months is None:
                return None, "age_months", "low"
            if not DOG_WEANING_MONTHS <= animal.age_months <= 12:
                return None, "growth_age_outside_formula_scope", "low"
            return "puppy_8w_1y" if "puppy_8w_1y" in formulas else None, _age_reason("dog", animal.age_months), "high" if animal.age_months is not None else "low"
        age = animal.age_months
        if animal.life_stage == "senior" or (age is not None and age >= 96 and not animal.activity):
            return "senior_over_7" if "senior_over_7" in formulas else None, "dog_life_stage_senior", "high"
        # VII-6 lists whole-year cohorts. Use completed years at the cohort boundary.
        age_default = "adult_age_1_2" if age is not None and age < 36 else "adult_age_3_7"
        code = {
            "low": "activity_low",
            "moderate": "activity_moderate_low_impact",
            "high": "activity_high",
            "very_high": "activity_high",
        }.get(animal.activity or "", age_default)
        return code if code in formulas else None, f"dog_activity_{animal.activity}" if animal.activity else _age_reason("dog", age), "high" if animal.activity else "low"
    if species == "cat":
        if animal.lactating or animal.life_stage == "lactation":
            size = animal.litter_size
            if size is None or size < 1:
                return None, "litter_size", "low"
            code = "lactation_lt3" if size < 3 else "lactation_3_4" if size <= 4 else "lactation_gt4"
            return code if code in formulas else None, "cat_lactating", "high"
        if animal.pregnant or animal.life_stage == "gestation":
            return "gestation" if "gestation" in formulas else None, "cat_pregnant", "high"
        if animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
            age = animal.age_months
            if age is None:
                return None, "age_months", "low"
            if age > 12:
                return None, "growth_age_outside_formula_scope", "low"
            code = "kitten_0_4m" if age < 4 else "kitten_4_9m" if age < 9 else "kitten_9_12m"
            return code if code in formulas else None, _age_reason("cat", age), "high"
        indoor = animal.neutered or animal.activity == "low"
        code = "adult_indoor_neutered" if indoor else "adult_active"
        return code if code in formulas else None, "cat_indoor_or_neutered" if indoor else "cat_adult_active", "high"
    return None, "species_out_of_scope", "low"


def suggest_profile(animal: Any, data: StandardData) -> tuple[str | None, str]:
    species = animal.species.value
    profile_codes = {code for code, item in data.profiles.items() if item.species_code == species}
    if species == "dog":
        if animal.lactating or animal.life_stage == "lactation":
            code, reason = "dog_early_growth_reproduction", "Профиль охватывает лактацию у собак."
        elif animal.pregnant or animal.life_stage == "gestation":
            code, reason = "dog_early_growth_reproduction", "Профиль охватывает беременность у собак."
        elif animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
            early = animal.age_months is None or animal.age_months < DOG_LATE_GROWTH_MONTHS
            code = "dog_early_growth_reproduction" if early else "dog_late_growth"
            reason = (
                "Рекомендация предварительная: возраст не указан."
                if animal.age_months is None else
                "Возраст менее 14 недель." if early else "Возраст от 14 недель."
            )
        else:
            code = "dog_adult_mer95" if animal.activity == "low" else "dog_adult_mer110"
            reason = (
                "Для низкой активности рекомендован профиль MER 95."
                if animal.activity == "low" else
                "Для взрослой собаки рекомендован MER 110."
                if animal.activity else
                "Рекомендация предварительная: активность не указана."
            )
    elif species == "cat":
        if animal.lactating or animal.life_stage == "lactation":
            code, reason = "cat_reproduction", "Профиль охватывает лактацию у кошек."
        elif animal.pregnant or animal.life_stage == "gestation":
            code, reason = "cat_reproduction", "Профиль охватывает беременность у кошек."
        elif animal.life_stage == "puppy_kitten" or (animal.age_months is not None and animal.age_months < 12):
            code, reason = "cat_growth", "Профиль применяется в период роста котёнка."
        else:
            indoor = animal.neutered or animal.activity == "low"
            code = "cat_adult_mer75" if indoor else "cat_adult_mer100"
            reason = (
                "Для стерилизованной кошки или кошки с низкой активностью рекомендован MER 75."
                if indoor else "Для активной взрослой кошки рекомендован MER 100."
                if animal.activity else "Рекомендация предварительная: активность не указана."
            )
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
        profile_options=[ProfileSuggestionOption(
            code=item.code, name_ru=item.name_ru, species=item.species_code,
            life_stage=item.physiological_state, basis=item.calculation_basis,
            category="recommended_minimum", compatibility=validate_profile(item.code, animal, data),
        ) for item in profiles],
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
