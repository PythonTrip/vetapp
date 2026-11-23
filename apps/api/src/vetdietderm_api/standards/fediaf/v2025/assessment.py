from collections.abc import Iterable, Mapping
from decimal import Decimal
from hashlib import sha256
import json
from math import fsum, isclose
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status

from vetdietderm_api.assessments.ration import PreparedRation, RationData, known_value, prepare_ration
from vetdietderm_api.standards.contract import FoodSnapshot
from vetdietderm_api.standards.fediaf.v2025 import resolver as context_resolver
from vetdietderm_api.assessments.schemas import (
    AssessmentGate,
    AssessmentRequest,
    AssessmentResponse,
    AssessmentRow,
    AssessmentStatus,
    AnimalProfile,
    CoverageAssessment,
    EditionIdentity,
    EnergyAssessment,
    EnergyEstimateRequest,
    EnergyEstimateResponse,
    EnergyEstimateSource,
    EnergyMultiplierPoint,
    EnergyMultiplierRange,
    EnergyPointValue,
    EnergyRangeValue,
    NutrientContribution,
    ProfileCompatibility,
    ResolvedContext,
    RowCompleteness,
    SourceRead,
    TargetRead,
)
from vetdietderm_api.standards.fediaf.v2025.applicability import evaluate_predicate
from vetdietderm_api.standards.fediaf.v2025.energy_formulas import (
    EnergyFormulaError as AstEvaluationError,
    evaluate_formula,
)
from vetdietderm_api.standards.fediaf.v2025.models import (
    DerivedExpression,
    EnergyFormula,
    GrowthSizeClass,
    GuidelineProfile,
    GuidelineTarget,
    StandardData as PublishedGuideline,
)

ENGINE_ID = "nutrition-engine/2.1.0"
COVERAGE_THRESHOLD_PERCENT = 60.0
_MASS_IN_GRAMS = {"g": 1, "mg": 1e-3, "µg": 1e-6, "mcg": 1e-6}


def _edition(snapshot: PublishedGuideline) -> EditionIdentity:
    edition = snapshot.edition
    return EditionIdentity(
        code=edition.code,
        source_checksum=edition.source_checksum,
        source_title=edition.source_title,
        source_url=edition.source_url,
        clinical_warning_ru=edition.clinical_warning_ru,
    )


def _unprocessable(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": code, "message": message},
    )


def _fixed_decimal(value: float) -> str:
    return str(Decimal(str(value)).normalize())


def _input_hash(
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
    foods: Mapping[UUID, FoodSnapshot],
) -> str:
    animal = payload.animal
    energy_formula_code, _formula_reason, _confidence = context_resolver.suggest_formula(
        animal, snapshot
    )
    nutrient_profile_code = (
        payload.profile_selection.profile_code if payload.profile_selection else
        context_resolver.suggest_profile(animal, snapshot)[0] if payload.profile_mode == "legacy_auto" else None
    )
    normalized = {
        "animal": {
            "species": animal.species.value,
            "current_body_weight_kg": (
                _fixed_decimal(animal.current_body_weight_kg)
                if animal.current_body_weight_kg is not None
                else None
            ),
            "target_body_weight_kg": (
                _fixed_decimal(animal.target_body_weight_kg)
                if animal.target_body_weight_kg is not None
                else None
            ),
            "expected_mature_weight_kg": (
                _fixed_decimal(animal.expected_mature_weight_kg)
                if animal.expected_mature_weight_kg is not None
                else None
            ),
            "age_months": (
                _fixed_decimal(animal.age_months) if animal.age_months is not None else None
            ),
            "life_stage": animal.life_stage,
            "activity": animal.activity,
            "neutered": animal.neutered,
            "pregnant": animal.pregnant,
            "gestation_week": animal.gestation_week,
            "lactating": animal.lactating,
            "lactation_week": animal.lactation_week,
            "litter_size": animal.litter_size,
            "bcs": animal.bcs,
        },
        "energy_formula_code": energy_formula_code,
        "nutrient_profile_code": nutrient_profile_code,
        "profile_mode": payload.profile_mode,
        "profile_selection": payload.profile_selection.model_dump() if payload.profile_selection else None,
        "rer_factor": _fixed_decimal(payload.rer_factor),
        "therapeutic_goal": payload.therapeutic_goal,
        "energy_adjustment_percent": _fixed_decimal(payload.energy_adjustment_percent),
        "ration": sorted(
            (
                {
                    "food_uuid": str(item.food_uuid),
                    "grams": _fixed_decimal(item.grams),
                }
                for item in payload.components
            ),
            key=lambda item: item["food_uuid"],
        ),
        "feed_form": payload.feed_form.value,
        "food_values": {
            str(key): {
                "name": food.name,
                "type": food.type,
                "feed_form": food.feed_form,
                "values": {code: (item.value, item.value_status, item.source) for code, item in food.values.items()},
            }
            for key, food in foods.items()
        },
        "ration_species_mismatch_confirmed": payload.ration_species_mismatch_confirmed,
        "guideline": {
            "edition_code": snapshot.edition.code,
            "source_checksum": snapshot.edition.source_checksum,
            "engine_id": ENGINE_ID,
        },
    }
    canonical = json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return sha256(canonical).hexdigest()


def _dependency_codes(expression: DerivedExpression, snapshot: PublishedGuideline) -> list[str]:
    ast = expression.ast_json
    operator = ast.get("op")
    if operator == "sum":
        codes = ast.get("nutrient_codes")
        if isinstance(codes, list) and all(isinstance(item, str) for item in codes):
            return codes
    if operator == "ratio":
        numerator = ast.get("numerator_code")
        denominator = ast.get("denominator_code")
        if isinstance(numerator, str) and isinstance(denominator, str):
            return [numerator, denominator]
    if operator == "group_ratio":
        numerator = ast.get("numerator_group_code")
        denominator = ast.get("denominator_group_code")
        if isinstance(numerator, str) and isinstance(denominator, str):
            return snapshot.groups.get(numerator, []) + snapshot.groups.get(denominator, [])
    raise ValueError(f"Unsupported derived AST operator: {operator!r}")


def _target_dependencies(target: GuidelineTarget, snapshot: PublishedGuideline) -> list[str]:
    if target.nutrient_uuid is not None:
        return [snapshot.nutrients[target.nutrient_uuid].code]
    if target.derived_expression_uuid is None:
        return []
    return _dependency_codes(snapshot.derived[target.derived_expression_uuid], snapshot)


def _missing_foods(ration: RationData, codes: Iterable[str]) -> list[str]:
    missing: set[str] = set()
    for code in codes:
        for food, _grams in ration.foods:
            if known_value(food, code) is None:
                missing.add(food.name)
    return sorted(missing)


def _derived_ratio(
    expression: DerivedExpression,
    ration: RationData,
    snapshot: PublishedGuideline,
) -> float:
    ast = expression.ast_json
    operator = ast.get("op")
    if operator == "ratio":
        codes = _dependency_codes(expression, snapshot)
        denominator = ration.totals[codes[1]]
        if denominator == 0:
            raise ZeroDivisionError
        return ration.totals[codes[0]] / denominator
    if operator == "group_ratio":
        numerator = sum(
            ration.totals[code] for code in snapshot.groups[ast["numerator_group_code"]]
        )
        denominator = sum(
            ration.totals[code] for code in snapshot.groups[ast["denominator_group_code"]]
        )
        if denominator == 0:
            raise ZeroDivisionError
        return numerator / denominator
    raise ValueError(f"Unsupported derived AST operator: {operator!r}")


def _animal_predicate_fields(
    animal: AnimalProfile,
    feed_form: str = "unknown",
    size_class: GrowthSizeClass | None = None,
) -> dict[str, str | float | int | None]:
    expected_mature_weight = animal.expected_mature_weight_kg
    if size_class is not None:
        if size_class.max_adult_weight_kg is not None:
            expected_mature_weight = float(size_class.max_adult_weight_kg)
        elif size_class.min_adult_weight_kg is not None:
            expected_mature_weight = float(size_class.min_adult_weight_kg) + 0.001
    return {
        "feedForm": feed_form,
        "expectedAdultWeightKg": expected_mature_weight,
        "ageMonths": animal.age_months,
        "litterSize": animal.litter_size,
    }


def _predicate_fields(
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
    size_class_code: str | None,
) -> dict[str, str | float | int | None]:
    size_class = snapshot.size_classes.get(size_class_code or "")
    return _animal_predicate_fields(payload.animal, payload.feed_form.value, size_class)


def _predicate_uses_field(node: Mapping[str, Any], field: str) -> bool:
    if node.get("field") == field:
        return True
    args = node.get("args")
    if isinstance(args, list):
        return any(isinstance(item, dict) and _predicate_uses_field(item, field) for item in args)
    child = node.get("arg")
    return isinstance(child, dict) and _predicate_uses_field(child, field)


def _energy_field_values(
    animal: AnimalProfile,
    snapshot: PublishedGuideline,
    weight_basis: str,
    maintenance_energy_kcal_day: float | None = None,
) -> dict[str, float | int | None]:
    body_weight = (
        animal.target_body_weight_kg
        if weight_basis == "target_override"
        else animal.current_body_weight_kg
    )
    return {
        "body_weight_kg": body_weight,
        "body_weight_g": body_weight * 1000 if body_weight is not None else None,
        "expected_adult_weight_kg": animal.expected_mature_weight_kg,
        "expected_mature_weight_kg": animal.expected_mature_weight_kg,
        "maintenance_energy_kcal_day": maintenance_energy_kcal_day,
        "litter_size": animal.litter_size,
        "lactation_factor": (
            snapshot.lactation_factors.get((animal.species.value, animal.lactation_week))
            if animal.lactation_week is not None
            else None
        ),
    }


def _energy_inputs(
    animal: AnimalProfile,
    required_fields: list[str],
    field_values: Mapping[str, float | int | None],
    weight_basis: str,
) -> dict[str, float | int]:
    request_values: dict[str, float | int | None] = {
        "current_body_weight_kg": animal.current_body_weight_kg,
        "target_body_weight_kg": animal.target_body_weight_kg,
        "expected_mature_weight_kg": animal.expected_mature_weight_kg,
        "maintenance_energy_kcal_day": field_values.get("maintenance_energy_kcal_day"),
        "litter_size": animal.litter_size,
        "lactation_week": animal.lactation_week,
    }
    used: dict[str, float | int] = {}
    for field in required_fields:
        if field in {"body_weight_kg", "body_weight_g"}:
            request_field = (
                "target_body_weight_kg"
                if weight_basis == "target_override"
                else "current_body_weight_kg"
            )
        elif field in {"expected_adult_weight_kg", "expected_mature_weight_kg"}:
            request_field = "expected_mature_weight_kg"
        else:
            request_field = field
        value = request_values.get(request_field)
        if value is not None:
            used[request_field] = value
        if field == "lactation_week" and field_values.get("lactation_factor") is not None:
            used["lactation_factor"] = field_values["lactation_factor"]
    return used


def _derive_size_class(
    animal: AnimalProfile,
    snapshot: PublishedGuideline,
) -> GrowthSizeClass | None:
    weight = animal.expected_mature_weight_kg
    if animal.species.value != "dog" or weight is None:
        return None
    for item in snapshot.size_classes.values():
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


def _resolve_size_class(
    animal: AnimalProfile,
    snapshot: PublishedGuideline,
) -> GrowthSizeClass | None:
    return context_resolver.resolve_size_class(animal, snapshot)


def _resolved_weight_basis(animal: AnimalProfile, formula: EnergyFormula) -> str:
    if animal.target_body_weight_kg is not None and "target_override" in formula.allowed_weight_bases:
        return "target_override"
    return "current"


def _validate_weight_basis(
    animal: AnimalProfile,
    formula: EnergyFormula,
    weight_basis: str,
) -> None:
    if weight_basis not in formula.allowed_weight_bases:
        raise _unprocessable(
            "weight_basis_not_allowed",
            "Выбранная основа массы недоступна для энергетического сценария",
        )
    if weight_basis == "target_override" and animal.target_body_weight_kg is None:
        raise _unprocessable(
            "target_weight_missing",
            "Для основы target_override нужна целевая масса",
        )


def _evaluate_energy_value(
    formula: EnergyFormula,
    field_values: Mapping[str, float | int | None],
) -> EnergyPointValue | EnergyRangeValue:
    if formula.result_kind == "point":
        if formula.formula_ast is None:
            raise AstEvaluationError("point formula AST is missing")
        return EnergyPointValue(kcal_day=evaluate_formula(formula.formula_ast, field_values))
    range_ast = formula.range_ast or {}
    min_ast = range_ast.get("min")
    max_ast = range_ast.get("max")
    if not isinstance(min_ast, dict) or not isinstance(max_ast, dict):
        raise AstEvaluationError("range formula requires both bounds")
    first = evaluate_formula(min_ast, field_values)
    second = evaluate_formula(max_ast, field_values)
    return EnergyRangeValue(
        min_kcal_day=min(first, second),
        max_kcal_day=max(first, second),
    )


def _reference_energy(value: EnergyPointValue | EnergyRangeValue | None) -> float | None:
    if isinstance(value, EnergyPointValue):
        return value.kcal_day
    if isinstance(value, EnergyRangeValue):
        return (value.min_kcal_day + value.max_kcal_day) / 2
    return None


def _automatic_base_mer(animal: AnimalProfile, snapshot: PublishedGuideline) -> float | None:
    if animal.species.value != "cat":
        return None
    code = (
        "adult_indoor_neutered"
        if animal.neutered or animal.activity == "low"
        else "adult_active"
    )
    formula = snapshot.formulas.get(code)
    if formula is None:
        return None
    weight_basis = _resolved_weight_basis(animal, formula)
    field_values = _energy_field_values(animal, snapshot, weight_basis)
    if any(field_values.get(field) is None for field in formula.required_animal_fields):
        return None
    try:
        return _reference_energy(_evaluate_energy_value(formula, field_values))
    except AstEvaluationError:
        return None


def evaluate_energy_scenario(
    request: EnergyEstimateRequest,
    snapshot: PublishedGuideline,
) -> EnergyEstimateResponse:
    animal = request.animal
    rer = 70 * animal.current_body_weight_kg**0.75 if animal.current_body_weight_kg is not None else None
    rer_adjusted = rer * request.rer_factor if rer is not None else None
    formula_code, reason, _confidence = context_resolver.suggest_formula(animal, snapshot)
    formula = snapshot.formulas.get(formula_code or "")
    if formula is None:
        return EnergyEstimateResponse(
            energy_formula_code=None,
            value=None,
            inputs={},
            source=EnergyEstimateSource(
                edition=snapshot.edition.code,
                table=None,
                page=None,
            ),
            warnings=[reason],
            missing_fields=[reason] if reason in {"age_months", "gestation_week", "litter_size", "growth_age_outside_formula_scope"} else ["energy_formula_code"],
            energy_adjustment_percent=request.energy_adjustment_percent,
            rer_kcal_day=rer,
            rer_factor=request.rer_factor,
            rer_factor_kcal_day=rer_adjusted,
        )
    weight_basis = _resolved_weight_basis(animal, formula)
    _validate_weight_basis(animal, formula, weight_basis)
    size_class = _resolve_size_class(animal, snapshot)
    automatic_base_mer = (
        _automatic_base_mer(animal, snapshot)
        if "maintenance_energy_kcal_day" in formula.required_animal_fields
        else None
    )

    reference = (
        snapshot.sources.get(formula.source_reference_uuid)
        if formula.source_reference_uuid
        else None
    )
    source = EnergyEstimateSource(
        edition=snapshot.edition.code,
        table=reference.table_code if reference else None,
        page=reference.page if reference else None,
    )
    field_values = _energy_field_values(
        animal,
        snapshot,
        weight_basis,
        automatic_base_mer,
    )
    missing: list[str] = []
    warnings: list[str] = []
    for field in formula.required_animal_fields:
        if field == "lactation_week":
            if animal.lactation_week is None or field_values["lactation_factor"] is None:
                missing.append("lactation_week")
        elif field_values.get(field) is None:
            if field in {"body_weight_kg", "body_weight_g"}:
                missing.append(
                    "target_body_weight_kg" if weight_basis == "target_override" else "current_body_weight_kg"
                )
            elif field in {"expected_adult_weight_kg", "expected_mature_weight_kg"}:
                missing.append("expected_mature_weight_kg")
            else:
                missing.append(field)
    if "maintenance_energy_kcal_day" in missing:
        warnings.append("missing_base_mer")
    if formula.applicability_rule_uuid is not None:
        rule = snapshot.rules[formula.applicability_rule_uuid]
        applicable = evaluate_predicate(rule.predicate_json, _animal_predicate_fields(animal))
        if applicable is None:
            missing.append("formula_applicability_context")
        elif not applicable:
            raise _unprocessable(
                "invalid_physiological_context",
                "Энергетический сценарий не применим к указанным параметрам животного"
            )

    missing = list(dict.fromkeys(missing))
    value: EnergyPointValue | EnergyRangeValue | None = None
    base_mer_value: EnergyPointValue | None = None
    multiplier_value: EnergyMultiplierPoint | EnergyMultiplierRange | None = None
    if not missing:
        try:
            value = _evaluate_energy_value(formula, field_values)
        except AstEvaluationError:
            missing.append("formula_evaluation")
            warnings.append("formula_evaluation")

    if "maintenance_energy_kcal_day" in formula.required_animal_fields:
        base_mer = automatic_base_mer
        if base_mer is not None:
            base_mer_value = EnergyPointValue(kcal_day=base_mer)
        multiplier_fields = dict(field_values)
        multiplier_fields["maintenance_energy_kcal_day"] = 1.0
        try:
            if formula.result_kind == "point" and formula.formula_ast is not None:
                multiplier_value = EnergyMultiplierPoint(
                    factor=evaluate_formula(formula.formula_ast, multiplier_fields)
                )
            elif formula.range_ast:
                min_ast = formula.range_ast.get("min")
                max_ast = formula.range_ast.get("max")
                if isinstance(min_ast, dict) and isinstance(max_ast, dict):
                    first = evaluate_formula(min_ast, multiplier_fields)
                    second = evaluate_formula(max_ast, multiplier_fields)
                    multiplier_value = EnergyMultiplierRange(
                        min_factor=min(first, second),
                        max_factor=max(first, second),
                    )
        except AstEvaluationError:
            multiplier_value = None

    reference_energy = _reference_energy(value)
    return EnergyEstimateResponse(
        energy_formula_code=formula.code,
        value=value,
        inputs=_energy_inputs(
            animal,
            formula.required_animal_fields,
            field_values,
            weight_basis,
        ),
        source=source,
        warnings=list(dict.fromkeys(warnings)),
        missing_fields=missing,
        weight_basis=weight_basis,
        size_class_code=size_class.code if size_class else None,
        base_mer_value=base_mer_value,
        multiplier_value=multiplier_value,
        reference_energy_kcal=reference_energy,
        range_working_point_rule="midpoint" if isinstance(value, EnergyRangeValue) else None,
        energy_adjustment_percent=request.energy_adjustment_percent,
        rer_kcal_day=rer,
        rer_factor=request.rer_factor,
        rer_factor_kcal_day=rer_adjusted,
        working_energy_kcal=(
            reference_energy * request.energy_adjustment_percent / 100
            if reference_energy is not None
            else None
        ),
    )


def evaluate_energy_requirement(
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
) -> EnergyAssessment:
    estimate = evaluate_energy_scenario(
        EnergyEstimateRequest(
            animal=payload.animal,
            energy_adjustment_percent=payload.energy_adjustment_percent,
            rer_factor=payload.rer_factor,
        ),
        snapshot,
    )
    range_value = estimate.value if isinstance(estimate.value, EnergyRangeValue) else None
    missing = estimate.missing_fields
    explanation = (
        "Недостаточно параметров карточки животного для расчёта FEDIAF MER."
        if missing
        else None
    )
    return EnergyAssessment(
        energy_formula_code=estimate.energy_formula_code,
        reference_energy_kcal=estimate.reference_energy_kcal,
        reference_energy_min_kcal=range_value.min_kcal_day if range_value else None,
        reference_energy_max_kcal=range_value.max_kcal_day if range_value else None,
        range_working_point_rule=estimate.range_working_point_rule,
        energy_adjustment_percent=payload.energy_adjustment_percent,
        working_energy_kcal=estimate.working_energy_kcal,
        rer_kcal_day=estimate.rer_kcal_day,
        rer_factor=estimate.rer_factor,
        rer_factor_kcal_day=estimate.rer_factor_kcal_day,
        complete=estimate.reference_energy_kcal is not None,
        missing_fields=missing,
        explanation_ru=explanation,
        source=estimate.source,
        inputs=estimate.inputs,
        weight_basis=estimate.weight_basis,
    )


def _source(target: GuidelineTarget, snapshot: PublishedGuideline) -> SourceRead:
    reference = snapshot.sources.get(target.source_reference_uuid) if target.source_reference_uuid else None
    return SourceRead(
        title=snapshot.edition.source_title,
        url=(reference.source_url if reference else snapshot.edition.source_url),
        page=reference.page if reference else None,
        table=reference.table_code if reference else None,
        row=reference.row_code if reference else None,
    )


def _mass_conversion_factor(from_unit: str, to_unit: str) -> float | None:
    if from_unit == to_unit:
        return 1.0
    if from_unit in _MASS_IN_GRAMS and to_unit in _MASS_IN_GRAMS:
        return _MASS_IN_GRAMS[from_unit] / _MASS_IN_GRAMS[to_unit]
    return None


def _status(
    value: float,
    minimum: float | None,
    maximum: float | None,
) -> AssessmentStatus:
    # Ignore numerical noise from converting and summing equivalent inputs.
    if minimum is not None and value < minimum and not isclose(value, minimum, rel_tol=1e-12):
        return AssessmentStatus.below_minimum
    if maximum is not None and value > maximum and not isclose(value, maximum, rel_tol=1e-12):
        return AssessmentStatus.above_maximum
    if minimum is None and maximum is None:
        return AssessmentStatus.not_established
    return AssessmentStatus.met


def _target_row(
    target: GuidelineTarget,
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
    ration: RationData,
    size_class_code: str | None,
    working_energy_kcal: float | None,
) -> AssessmentRow:
    derived = target.derived_expression_uuid is not None
    expression = snapshot.derived[target.derived_expression_uuid] if derived else None
    ratio_target = bool(
        expression and expression.ast_json.get("op") in {"ratio", "group_ratio"}
    )
    metabolic_daily_basis = target.basis == "daily_per_metabolic_bw"
    energy_daily_basis = target.basis == "per_1000_kcal_me" and not ratio_target
    daily_basis = metabolic_daily_basis or energy_daily_basis
    metabolic_bw: float | None = None
    species_exponent = 0.75 if payload.animal.species.value == "dog" else 0.67
    body_weight = payload.animal.current_body_weight_kg
    if metabolic_daily_basis and body_weight is not None:
        metabolic_bw = body_weight**species_exponent
    target_factor = (
        metabolic_bw
        if metabolic_daily_basis
        else working_energy_kcal / 1000
        if energy_daily_basis and working_energy_kcal is not None
        else 1.0
        if not daily_basis
        else None
    )
    target_minimum = (
        float(target.minimum_value) * target_factor
        if target.minimum_value is not None and target_factor is not None
        else None
    )
    target_maximum = (
        float(target.maximum_value) * target_factor
        if target.maximum_value is not None and target_factor is not None
        else None
    )
    if derived:
        assert expression is not None
        code = expression.code
        name = expression.name_ru
    else:
        nutrient = snapshot.nutrients[target.nutrient_uuid]
        code = nutrient.code
        name = nutrient.name
    dependencies = _target_dependencies(target, snapshot)
    missing_nutrients = _missing_foods(ration, dependencies)
    missing_foods = missing_nutrients
    if target.basis == "per_100g_dry_matter" and ration.dry_matter_grams is None:
        missing_foods = sorted(set(missing_nutrients) | {
            food.name for food, _grams in ration.foods
            if (moisture := known_value(food, "MO")) is None or not 0 <= moisture <= 100
        })
    completeness = RowCompleteness(
        complete_components=len(ration.foods) - len(missing_foods),
        total_components=len(ration.foods),
        missing_food_names=missing_foods,
    )
    row_status: AssessmentStatus
    value: float | None = None
    ration_daily_amount: float | None = None
    published_target = TargetRead(
        minimum=float(target.minimum_value) if target.minimum_value is not None else None,
        maximum=float(target.maximum_value) if target.maximum_value is not None else None,
        unit=target.unit,
        basis="ratio" if ratio_target else target.basis,
        source_value_text=target.source_value_text,
        category="recommended_minimum" if target.minimum_value is not None else "maximum" if target.maximum_value is not None else None,
    )
    concentration: float | None = None
    density_status: AssessmentStatus | None = None
    contributions: list[NutrientContribution] = []
    intake_bases = None
    note = target.note_ru
    if target.applicability_rule_uuid is not None:
        rule = snapshot.rules[target.applicability_rule_uuid]
        feed_form_unresolved = (
            payload.feed_form.value == "unknown"
            and _predicate_uses_field(rule.predicate_json, "feedForm")
        )
        applicability = None if feed_form_unresolved else evaluate_predicate(
            rule.predicate_json,
            _predicate_fields(payload, snapshot, size_class_code),
        )
        if applicability is None:
            row_status = AssessmentStatus.insufficient_context
            note = rule.note_ru or "Недостаточно контекста для проверки применимости цели."
        elif not applicability:
            row_status = AssessmentStatus.not_applicable
            note = rule.note_ru or "Цель не применяется к подтверждённому контексту."
        else:
            row_status = AssessmentStatus.met
    else:
        row_status = AssessmentStatus.met
    aggregatable = expression is None or expression.ast_json.get("op") == "sum"
    units_compatible = True
    if aggregatable:
        factors = {
            code: _mass_conversion_factor(snapshot.nutrients_by_code[code].base_unit, target.unit)
            for code in dependencies
        }
        units_compatible = all(factor is not None for factor in factors.values())
        if units_compatible:
            for food, grams in ration.foods:
                amounts = [(known_value(food, code), factor) for code, factor in factors.items()]
                complete = all(amount is not None for amount, _factor in amounts)
                contributions.append(NutrientContribution(
                    food_uuid=food.uuid,
                    daily_amount=(
                        fsum(amount * factor for amount, factor in amounts if amount is not None and factor is not None)
                        * grams / 100 if complete else None
                    ),
                ))
            if not missing_nutrients:
                ration_daily_amount = fsum(
                    item.daily_amount for item in contributions if item.daily_amount is not None
                )
                intake_bases = ration.intake_bases(
                    ration_daily_amount, body_weight=body_weight, metabolic_exponent=species_exponent,
                )
                concentration = intake_bases.per_1000_kcal_me
        if energy_daily_basis and row_status == AssessmentStatus.met and target.target_status != "not_established":
            density_status = (
                AssessmentStatus.insufficient_context if not units_compatible else
                AssessmentStatus.missing_product_data if concentration is None else
                _status(concentration, published_target.minimum, published_target.maximum)
            )
    if row_status == AssessmentStatus.met:
        if target.target_status == "not_established":
            row_status = AssessmentStatus.not_established
        elif missing_foods:
            row_status = AssessmentStatus.missing_product_data
            if daily_basis and target_maximum is not None:
                known_amount = fsum(item.daily_amount for item in contributions if item.daily_amount is not None)
                if _status(known_amount, None, target_maximum) == AssessmentStatus.above_maximum:
                    row_status = AssessmentStatus.above_maximum
                    note = "Даже известная часть рациона превышает верхнюю границу."
        elif metabolic_daily_basis and metabolic_bw is None:
            row_status = AssessmentStatus.insufficient_context
            note = "Для суточного минимума нужна текущая масса животного."
        elif energy_daily_basis and working_energy_kcal is None:
            row_status = AssessmentStatus.insufficient_context
            note = "Для суточной цели нужен автоматически рассчитанный рабочий уровень энергии."
        elif aggregatable and not units_compatible:
            row_status = AssessmentStatus.insufficient_context
            note = f"Единицы исходных нутриентов нельзя привести к единице цели ({target.unit})."
        else:
            try:
                if ratio_target:
                    assert expression is not None
                    value = _derived_ratio(expression, ration, snapshot)
                elif daily_basis:
                    value = ration_daily_amount
                else:
                    basis_values = intake_bases.model_dump(exclude={"metabolic_exponent"}) if intake_bases else {}
                    value = basis_values.get(target.basis)
                if value is None:
                    row_status = (
                        AssessmentStatus.missing_product_data
                        if target.basis == "per_100g_dry_matter" and ration.dry_matter_grams is None
                        else AssessmentStatus.insufficient_context
                    )
                    note = "Недостаточно данных для приведения поступления к базису норматива."
                else:
                    row_status = _status(value, target_minimum, target_maximum)
            except ZeroDivisionError:
                row_status = AssessmentStatus.insufficient_context
                note = "Выражение не определено из-за нулевого знаменателя."
    return AssessmentRow(
        code=code,
        name=name,
        unit=target.unit,
        derived=derived,
        ration_per_1000_kcal_me=value if ratio_target else concentration,
        ration_daily_amount=ration_daily_amount,
        ration_ratio=value if ratio_target else None,
        published_target=published_target,
        density_status=density_status,
        intake_bases=intake_bases,
        contributions=contributions,
        target=TargetRead(
            minimum=target_minimum,
            maximum=target_maximum,
            unit=target.unit,
            basis="per_day" if daily_basis else published_target.basis,
            source_value_text=target.source_value_text,
            category=published_target.category,
        ),
        status=row_status,
        completeness=completeness,
        source=_source(target, snapshot),
        note_ru=note,
    )


def _reference_rows(
    snapshot: PublishedGuideline,
    ration: RationData,
    me_kcal: float | None,
    target_dependencies: set[str],
    target_codes: set[str],
) -> list[AssessmentRow]:
    rows: list[AssessmentRow] = []
    source = SourceRead(title=snapshot.edition.source_title, url=snapshot.edition.source_url)
    for code in sorted(ration.complete_codes - target_dependencies - {"ME", "pH"}):
        nutrient = snapshot.nutrients_by_code.get(code)
        if nutrient is None:
            continue
        rows.append(
            AssessmentRow(
                code=code,
                name=nutrient.name,
                unit=nutrient.base_unit,
                derived=False,
                ration_per_1000_kcal_me=ration.totals[code] * 1000 / me_kcal if me_kcal else None,
                ration_daily_amount=ration.totals[code],
                contributions=[
                    NutrientContribution(food_uuid=food.uuid, daily_amount=food.values[code].value * grams / 100)
                    for food, grams in ration.foods
                ],
                target=None,
                status=AssessmentStatus.not_established,
                completeness=RowCompleteness(
                    complete_components=len(ration.foods),
                    total_components=len(ration.foods),
                    missing_food_names=[],
                ),
                source=source,
                note_ru="Справочное значение каталога: целевой уровень FEDIAF не установлен.",
            )
        )
    aliases = {"Ca/P": "Ca:P", "ω6/ω3": "omega6_omega3"}
    for code, (value, unit) in ration.control_ratios(snapshot.groups).items():
        if value is None or code in target_codes or aliases.get(code) in target_codes:
            continue
        rows.append(AssessmentRow(
            code=code, name=code, unit=unit, derived=True, ration_per_1000_kcal_me=None,
            ration_ratio=value, target=None, status=AssessmentStatus.not_established,
            completeness=RowCompleteness(
                complete_components=len(ration.foods), total_components=len(ration.foods), missing_food_names=[],
            ),
            source=source, note_ru="Справочный показатель состава рациона.",
        ))
    return rows


def _assessment_summary(
    rows: list[AssessmentRow],
) -> tuple[str, int, int, int, int]:
    met_count = sum(item.status == AssessmentStatus.met for item in rows)
    below_count = sum(item.status == AssessmentStatus.below_minimum for item in rows)
    above_count = sum(item.status == AssessmentStatus.above_maximum for item in rows)
    verdict_rows = [
        item
        for item in rows
        if item.target is not None and item.status != AssessmentStatus.not_applicable
    ]
    blockers = {
        AssessmentStatus.missing_product_data,
        AssessmentStatus.insufficient_context,
        AssessmentStatus.not_established,
    }
    unevaluable_count = sum(item.status in blockers for item in verdict_rows)
    if unevaluable_count or not verdict_rows:
        overall = "indeterminate"
    elif below_count or above_count:
        overall = "inadequate"
    else:
        overall = "adequate"
    return overall, met_count, below_count, above_count, unevaluable_count


def _validated_profile(
    payload: AssessmentRequest, snapshot: PublishedGuideline,
) -> tuple[GuidelineProfile | None, ProfileCompatibility | None]:
    selection = payload.profile_selection
    if selection is None:
        if payload.profile_mode == "manual":
            return None, None
        suggested, _ = context_resolver.suggest_profile(payload.animal, snapshot)
        return snapshot.profiles.get(suggested or ""), None

    if (selection.standard_code, selection.edition) != ("fediaf", snapshot.edition.code):
        raise _unprocessable("standard_mismatch", "Выбранный стандарт не соответствует расчётному провайдеру.")
    review = context_resolver.validate_profile(selection.profile_code, payload.animal, snapshot)
    if review.level == "hard":
        raise _unprocessable(review.code or "profile_incompatible", review.message or "Профиль несовместим.")
    if review.comment_required and not selection.comment:
        raise _unprocessable("profile_comment_required", review.message or "Укажите комментарий.")
    if selection.source == "recommendation":
        recommended, _ = context_resolver.suggest_profile(payload.animal, snapshot)
        if recommended != selection.profile_code:
            raise _unprocessable("recommendation_changed", "Рекомендация изменилась. Подтвердите профиль вручную.")
    return snapshot.profiles[selection.profile_code], review


def assess_nutrition(
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
    foods_by_id: Mapping[UUID, FoodSnapshot],
) -> AssessmentResponse:
    energy = evaluate_energy_requirement(payload, snapshot)
    return assess_prepared(payload, snapshot, prepare_ration(payload, foods_by_id, energy))


def assess_prepared(
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
    prepared: PreparedRation,
) -> AssessmentResponse:
    profile, compatibility = _validated_profile(payload, snapshot)
    energy = prepared.requirement
    input_hash = _input_hash(payload, snapshot, prepared.foods_by_id)
    ration_energy = prepared.energy
    size_class = _resolve_size_class(payload.animal, snapshot)
    context = ResolvedContext(
        nutrient_profile_code=profile.code if profile else None,
        profile_selection=payload.profile_selection,
        profile_compatibility=compatibility,
        energy_formula_code=energy.energy_formula_code,
        size_class_code=size_class.code if size_class else None,
        weight_basis=energy.weight_basis,
        feed_form=payload.feed_form,
        therapeutic_goal=payload.therapeutic_goal,
        ration_species_mismatch_confirmed=payload.ration_species_mismatch_confirmed,
    )
    empty_coverage = CoverageAssessment(
        expected_atomic_count=0,
        complete_atomic_count=0,
        percent=0,
        below_threshold=False,
    )
    if profile is None:
        requires_profile = payload.animal.species.value in {"dog", "cat"}
        gate = AssessmentGate(
            code="profile_confirmation_required" if requires_profile else "species_out_of_scope",
            explanation_ru=(
                "Подтвердите нормативный профиль для оценки рациона." if requires_profile else
                "FEDIAF 2025 применяется только к собакам и кошкам."
            ),
        )
        return AssessmentResponse(
            engine_id=ENGINE_ID,
            edition=_edition(snapshot),
            context=context,
            energy=energy,
            coverage=empty_coverage,
            rows=[],
            met_count=0,
            below_minimum_count=0,
            above_maximum_count=0,
            unevaluable_count=0,
            overall="indeterminate",
            input_hash=input_hash,
            normative_comparison_performed=False,
            gate=gate,
            ration_energy=ration_energy,
        )
    if energy.missing_fields and payload.profile_mode == "legacy_auto":
        fields = ", ".join(energy.missing_fields)
        raise _unprocessable(
            "missing_required_animal_fields",
            f"Не заполнены обязательные параметры энергетического сценария: {fields}",
        )
    ration = prepared.nutrients
    targets = [item for item in snapshot.targets if item.profile_uuid == profile.uuid]
    expected_codes = {
        code
        for target in targets
        for code in _target_dependencies(target, snapshot)
    }
    complete_codes = expected_codes & ration.complete_codes
    percent = (len(complete_codes) / len(expected_codes) * 100) if expected_codes else 0.0
    # 60% is retained from the prototype pending a documented FEDIAF rule.
    coverage = CoverageAssessment(
        expected_atomic_count=len(expected_codes),
        complete_atomic_count=len(complete_codes),
        percent=percent,
        below_threshold=percent < COVERAGE_THRESHOLD_PERCENT,
    )
    me_kcal = ration.totals.get("ME") if "ME" in ration.complete_codes else None
    rows = [
        _target_row(
            item,
            payload,
            snapshot,
            ration,
            size_class.code if size_class else None,
            energy.working_energy_kcal,
        )
        for item in targets
    ]
    rows.extend(
        _reference_rows(
            snapshot,
            ration,
            me_kcal,
            expected_codes,
            {row.code for row in rows},
        )
    )
    overall, met_count, below_count, above_count, unevaluable_count = _assessment_summary(rows)
    return AssessmentResponse(
        engine_id=ENGINE_ID,
        edition=_edition(snapshot),
        context=context,
        energy=energy,
        coverage=coverage,
        rows=rows,
        met_count=met_count,
        below_minimum_count=below_count,
        above_maximum_count=above_count,
        unevaluable_count=unevaluable_count,
        overall=overall,
        input_hash=input_hash,
        normative_comparison_performed=True,
        gate=None,
        ration_energy=ration_energy,
    )



suggest_context = context_resolver.suggest_context
