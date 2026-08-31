from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_EVEN
from hashlib import sha256
import json
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status

from vetdietderm_api.assessments.ast import AstEvaluationError, evaluate_formula, evaluate_predicate
from vetdietderm_api.assessments.repository import FoodSnapshot, PublishedGuideline
from vetdietderm_api.assessments.schemas import (
    AssessmentGate,
    AssessmentRequest,
    AssessmentResponse,
    AssessmentRow,
    AssessmentStatus,
    AnimalProfile,
    ContextSuggestion,
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
    FormulaSuggestionOption,
    ResolvedContext,
    RowCompleteness,
    SizeClassSuggestionOption,
    SourceRead,
    SuggestionOption,
    SuggestionsResponse,
    TargetRead,
)
from vetdietderm_api.guidelines.models import (
    DerivedExpression,
    EnergyFormula,
    GrowthSizeClass,
    GuidelineProfile,
    GuidelineTarget,
)

ENGINE_ID = "nutrition-engine/2.0.0"
COVERAGE_THRESHOLD_PERCENT = 60.0
HASH_DECIMAL_SCALE = Decimal("0.000001")
_MICROGRAM_UNITS = frozenset({"µg", "mcg"})
_MG_G_UNITS = frozenset({"mg", "g"})


@dataclass(frozen=True)
class RationData:
    foods: list[tuple[FoodSnapshot, float]]
    totals: dict[str, float]
    complete_codes: set[str]
    missing_by_code: dict[str, list[str]]


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
    return format(
        Decimal(str(value)).quantize(HASH_DECIMAL_SCALE, rounding=ROUND_HALF_EVEN),
        "f",
    )


def _input_hash(payload: AssessmentRequest, snapshot: PublishedGuideline) -> str:
    animal = payload.animal
    energy_formula_code, _formula_reason, _confidence = _suggest_formula(animal, snapshot)
    nutrient_profile_code, _profile_reason = _suggest_nutrient_standard(animal, snapshot)
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
            "lactating": animal.lactating,
            "lactation_week": animal.lactation_week,
            "litter_size": animal.litter_size,
        },
        "energy_formula_code": energy_formula_code,
        "nutrient_profile_code": nutrient_profile_code,
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
        "ration_species_mismatch_confirmed": payload.ration_species_mismatch_confirmed,
        "guideline": {
            "edition_code": snapshot.edition.code,
            "source_checksum": snapshot.edition.source_checksum,
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


def _known_value(food: FoodSnapshot, code: str) -> float | None:
    value = food.values.get(code)
    if value is None or value.value is None or value.value_status == "unknown":
        return None
    return float(value.value)


def _ration_data(payload: AssessmentRequest, foods_by_id: Mapping[UUID, FoodSnapshot]) -> RationData:
    foods = [(foods_by_id[item.food_uuid], item.grams) for item in payload.components]
    codes = {code for food, _grams in foods for code in food.values}
    totals: dict[str, float] = {}
    complete_codes: set[str] = set()
    missing_by_code: dict[str, list[str]] = {}
    for code in codes:
        missing = [food.name for food, _grams in foods if _known_value(food, code) is None]
        missing_by_code[code] = missing
        if not missing:
            complete_codes.add(code)
            totals[code] = sum(
                (_known_value(food, code) or 0.0) * grams / 100.0
                for food, grams in foods
            )
    return RationData(
        foods=foods,
        totals=totals,
        complete_codes=complete_codes,
        missing_by_code=missing_by_code,
    )


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
            if _known_value(food, code) is None:
                missing.add(food.name)
    return sorted(missing)


def _derived_value(
    expression: DerivedExpression,
    ration: RationData,
    snapshot: PublishedGuideline,
    me_kcal: float,
) -> float:
    ast = expression.ast_json
    operator = ast.get("op")
    if operator == "sum":
        return sum(ration.totals[code] for code in _dependency_codes(expression, snapshot)) * 1000 / me_kcal
    if operator == "ratio":
        codes = _dependency_codes(expression, snapshot)
        denominator = ration.totals[codes[1]]
        if denominator == 0:
            raise ZeroDivisionError
        return ration.totals[codes[0]] / denominator
    if operator == "group_ratio":
        numerator_group = ast["numerator_group_code"]
        denominator_group = ast["denominator_group_code"]
        numerator = sum(ration.totals[code] for code in snapshot.groups[numerator_group])
        denominator = sum(ration.totals[code] for code in snapshot.groups[denominator_group])
        if denominator == 0:
            raise ZeroDivisionError
        return numerator / denominator
    raise ValueError(f"Unsupported derived AST operator: {operator!r}")


def _derived_daily_value(
    expression: DerivedExpression,
    ration: RationData,
    snapshot: PublishedGuideline,
) -> float:
    ast = expression.ast_json
    operator = ast.get("op")
    if operator == "sum":
        return sum(ration.totals[code] for code in _dependency_codes(expression, snapshot))
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
    return _derive_size_class(animal, snapshot)


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
    formula_code, _reason, _confidence = _suggest_formula(animal, snapshot)
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
            warnings=["energy_formula_unresolved"],
            missing_fields=["energy_formula_code"],
            energy_adjustment_percent=request.energy_adjustment_percent,
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
        working_energy_kcal=(
            reference_energy * request.energy_adjustment_percent / 100
            if reference_energy is not None
            else None
        ),
    )


def _energy(
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
) -> EnergyAssessment:
    animal = payload.animal
    rer = (
        70 * animal.current_body_weight_kg**0.75
        if animal.current_body_weight_kg is not None
        else None
    )
    rer_factor_kcal = rer * payload.rer_factor if rer is not None else None
    estimate = evaluate_energy_scenario(
        EnergyEstimateRequest(
            animal=animal,
            energy_adjustment_percent=payload.energy_adjustment_percent,
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
        rer_kcal_day=rer,
        rer_factor=payload.rer_factor,
        rer_factor_kcal_day=rer_factor_kcal,
        complete=estimate.reference_energy_kcal is not None,
        missing_fields=missing,
        explanation_ru=explanation,
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
    if from_unit == to_unit or {from_unit, to_unit} <= _MICROGRAM_UNITS:
        return 1.0
    if {from_unit, to_unit} == _MG_G_UNITS:
        return 0.001 if from_unit == "mg" else 1000.0
    return None


def _status(
    value: float,
    minimum: float | None,
    maximum: float | None,
) -> AssessmentStatus:
    if minimum is not None and value < minimum:
        return AssessmentStatus.below_minimum
    if maximum is not None and value > maximum:
        return AssessmentStatus.above_maximum
    if minimum is None and maximum is None:
        return AssessmentStatus.not_established
    return AssessmentStatus.met


def _target_row(
    target: GuidelineTarget,
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
    ration: RationData,
    me_kcal: float | None,
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
    if metabolic_daily_basis and payload.animal.current_body_weight_kg is not None:
        exponent = 0.75 if payload.animal.species.value == "dog" else 0.67
        metabolic_bw = payload.animal.current_body_weight_kg**exponent
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
    missing_foods = _missing_foods(ration, dependencies)
    if not daily_basis and not ratio_target and (me_kcal is None or me_kcal <= 0):
        missing_foods = sorted({*missing_foods, *[food.name for food, _grams in ration.foods if _known_value(food, "ME") is None]})
    completeness = RowCompleteness(
        complete_components=len(ration.foods) - len(missing_foods),
        total_components=len(ration.foods),
        missing_food_names=missing_foods,
    )
    row_status: AssessmentStatus
    value: float | None = None
    ration_daily_amount: float | None = None
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
    if row_status == AssessmentStatus.met:
        if target.target_status == "not_established":
            row_status = AssessmentStatus.not_established
        elif missing_foods:
            row_status = AssessmentStatus.missing_product_data
        elif metabolic_daily_basis and metabolic_bw is None:
            row_status = AssessmentStatus.insufficient_context
            note = "Для суточного минимума нужна текущая масса животного."
        elif energy_daily_basis and working_energy_kcal is None:
            row_status = AssessmentStatus.insufficient_context
            note = "Для суточной цели нужен автоматически рассчитанный рабочий уровень энергии."
        elif not daily_basis and not ratio_target and (me_kcal is None or me_kcal <= 0):
            row_status = AssessmentStatus.missing_product_data
        else:
            conversion_factor: float | None = 1.0
            if not derived:
                conversion_factor = _mass_conversion_factor(
                    snapshot.nutrients[target.nutrient_uuid].base_unit,
                    target.unit,
                )
            if conversion_factor is None:
                row_status = AssessmentStatus.insufficient_context
                note = (
                    f"Нельзя безопасно сравнить единицы продукта "
                    f"({snapshot.nutrients[target.nutrient_uuid].base_unit}) и нормы ({target.unit})."
                )
            else:
                try:
                    if daily_basis or ratio_target:
                        raw_amount = (
                            _derived_daily_value(expression, ration, snapshot)
                            if derived
                            else ration.totals[code]
                        )
                    elif derived:
                        raw_amount = _derived_value(expression, ration, snapshot, me_kcal)
                    else:
                        raw_amount = ration.totals[code] * 1000 / me_kcal
                    value = raw_amount * conversion_factor
                    if daily_basis:
                        ration_daily_amount = value
                    row_status = _status(value, target_minimum, target_maximum)
                except ZeroDivisionError:
                    row_status = AssessmentStatus.insufficient_context
                    note = "Выражение не определено из-за нулевого знаменателя."
    return AssessmentRow(
        code=code,
        name=name,
        unit=target.unit,
        derived=derived,
        ration_per_1000_kcal_me=None if daily_basis else value,
        ration_daily_amount=ration_daily_amount,
        target=TargetRead(
            minimum=target_minimum,
            maximum=target_maximum,
            unit=target.unit,
            basis="per_day" if daily_basis else target.basis,
            source_value_text=target.source_value_text,
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
    *,
    daily_basis: bool,
) -> list[AssessmentRow]:
    rows: list[AssessmentRow] = []
    for code in sorted(ration.complete_codes - target_dependencies - {"ME"}):
        nutrient = snapshot.nutrients_by_code.get(code)
        if nutrient is None or (not daily_basis and (me_kcal is None or me_kcal <= 0)):
            continue
        rows.append(
            AssessmentRow(
                code=code,
                name=nutrient.name,
                unit=nutrient.base_unit,
                derived=False,
                ration_per_1000_kcal_me=(
                    None if daily_basis else ration.totals[code] * 1000 / me_kcal
                ),
                ration_daily_amount=ration.totals[code] if daily_basis else None,
                target=None,
                status=AssessmentStatus.not_established,
                completeness=RowCompleteness(
                    complete_components=len(ration.foods),
                    total_components=len(ration.foods),
                    missing_food_names=[],
                ),
                source=SourceRead(
                    title=snapshot.edition.source_title,
                    url=snapshot.edition.source_url,
                ),
                note_ru="Справочное значение каталога: целевой уровень FEDIAF не установлен.",
            )
        )
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


def _validated_context(
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
) -> tuple[GuidelineProfile | None, EnergyFormula | None]:
    species = payload.animal.species.value
    if species not in {"dog", "cat"}:
        return None, None
    profile_code, _profile_reason = _suggest_nutrient_standard(payload.animal, snapshot)
    formula_code, _formula_reason, _confidence = _suggest_formula(payload.animal, snapshot)
    if not profile_code:
        raise _unprocessable(
            "profile_unresolved",
            "Сервер не смог определить нутриентный стандарт FEDIAF по карточке животного",
        )
    if not formula_code:
        raise _unprocessable(
            "energy_formula_unresolved",
            "Сервер не смог определить энергетическую формулу FEDIAF по карточке животного",
        )
    profile = snapshot.profiles.get(profile_code)
    if profile is None:
        raise _unprocessable(
            "profile_not_found",
            "Автоматически выбранный нутриентный стандарт не найден в опубликованной редакции",
        )
    if profile.species_code != species:
        raise _unprocessable(
            "profile_species_mismatch",
            "Автоматически выбранный нутриентный стандарт не относится к выбранному виду",
        )
    formula = snapshot.formulas.get(formula_code)
    if formula is None:
        raise _unprocessable(
            "energy_formula_not_found",
            "Энергетический сценарий не найден в опубликованной редакции",
        )
    if formula.species_code != species:
        raise _unprocessable(
            "energy_formula_species_mismatch",
            "Энергетический сценарий не относится к выбранному виду",
        )
    expected_state = (
        "reproduction"
        if payload.animal.pregnant
        or payload.animal.lactating
        or payload.animal.life_stage in {"gestation", "lactation"}
        else "growth"
        if payload.animal.life_stage == "puppy_kitten"
        or (payload.animal.age_months is not None and payload.animal.age_months < 12)
        else "adult"
    )
    compatible_states = {
        "adult": {"adult"},
        "growth": {"growth", "growth_reproduction"},
        "reproduction": {"reproduction", "growth_reproduction"},
    }[expected_state]
    if profile.physiological_state not in compatible_states:
        raise _unprocessable(
            "profile_life_stage_mismatch",
            "Автоматически выбранный нутриентный стандарт несовместим со стадией жизни",
        )
    _validate_weight_basis(
        payload.animal,
        formula,
        _resolved_weight_basis(payload.animal, formula),
    )
    return profile, formula


def assess_nutrition(
    payload: AssessmentRequest,
    snapshot: PublishedGuideline,
    foods_by_id: Mapping[UUID, FoodSnapshot],
) -> AssessmentResponse:
    profile, formula = _validated_context(payload, snapshot)
    energy = _energy(payload, snapshot)
    size_class = _resolve_size_class(payload.animal, snapshot)
    context = ResolvedContext(
        nutrient_profile_code=profile.code if profile else None,
        energy_formula_code=formula.code if formula else None,
        size_class_code=size_class.code if size_class else None,
        weight_basis=(
            _resolved_weight_basis(payload.animal, formula) if formula else "current"
        ),
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
    if profile is None or formula is None:
        gate = AssessmentGate(
            code="species_out_of_scope",
            explanation_ru="FEDIAF 2025 применяется только к собакам и кошкам; нормативное сравнение не выполнено.",
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
            input_hash=_input_hash(payload, snapshot),
            normative_comparison_performed=False,
            gate=gate,
        )
    if energy.missing_fields:
        fields = ", ".join(energy.missing_fields)
        raise _unprocessable(
            "missing_required_animal_fields",
            f"Не заполнены обязательные параметры энергетического сценария: {fields}",
        )
    ration = _ration_data(payload, foods_by_id)
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
            me_kcal,
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
            daily_basis=True,
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
        input_hash=_input_hash(payload, snapshot),
        normative_comparison_performed=True,
        gate=None,
    )


def _age_reason(species: str, age_months: float | None) -> str:
    if age_months is None:
        return f"{species}_age_unknown"
    age = f"{age_months:g}".replace(".", "_")
    return f"{species}_age_{age}_months"


def _suggest_formula(
    animal: Any,
    snapshot: PublishedGuideline,
) -> tuple[str | None, str, str]:
    species = animal.species.value
    formulas = {code for code, item in snapshot.formulas.items() if item.species_code == species}
    if species == "dog":
        if animal.lactating or animal.life_stage == "lactation":
            code = "lactation_5_8" if (animal.litter_size or 0) >= 5 else "lactation_1_4"
            return (
                code if code in formulas else None,
                "dog_lactating",
                "high" if animal.litter_size is not None else "low",
            )
        if animal.pregnant or animal.life_stage == "gestation":
            return (
                "gestation_last_5w" if "gestation_last_5w" in formulas else None,
                "dog_pregnant",
                "low",
            )
        if animal.life_stage == "puppy_kitten" or (
            animal.age_months is not None and animal.age_months < 12
        ):
            return (
                "puppy_8w_1y" if "puppy_8w_1y" in formulas else None,
                _age_reason("dog", animal.age_months),
                "high" if animal.age_months is not None else "low",
            )
        if animal.life_stage == "senior":
            return (
                "senior_over_7" if "senior_over_7" in formulas else None,
                "dog_life_stage_senior",
                "high",
            )
        activity_map = {
            "low": "activity_low",
            "moderate": "activity_moderate_low_impact",
            "high": "activity_high",
            "very_high": "activity_high",
        }
        code = activity_map.get(animal.activity or "", "adult_age_3_7")
        return (
            code if code in formulas else None,
            f"dog_activity_{animal.activity}" if animal.activity else "dog_adult_default",
            "high" if animal.activity else "low",
        )
    if species == "cat":
        if animal.lactating or animal.life_stage == "lactation":
            week = animal.lactation_week
            code = "lactation_lt3" if week is not None and week < 3 else "lactation_3_4" if week is not None and week <= 4 else "lactation_gt4"
            return (
                code if code in formulas else None,
                "cat_lactating",
                "high" if week is not None else "low",
            )
        if animal.pregnant or animal.life_stage == "gestation":
            return ("gestation" if "gestation" in formulas else None, "cat_pregnant", "high")
        if animal.life_stage == "puppy_kitten" or (
            animal.age_months is not None and animal.age_months < 12
        ):
            age = animal.age_months
            code = "kitten_0_4m" if age is not None and age < 4 else "kitten_4_9m" if age is not None and age < 9 else "kitten_9_12m"
            return (
                code if code in formulas else None,
                _age_reason("cat", age),
                "high" if age is not None else "low",
            )
        indoor_or_neutered = animal.neutered or animal.activity == "low"
        code = "adult_indoor_neutered" if indoor_or_neutered else "adult_active"
        return (
            code if code in formulas else None,
            "cat_indoor_or_neutered" if indoor_or_neutered else "cat_adult_active",
            "high",
        )
    return None, "species_out_of_scope", "low"


def _suggest_nutrient_standard(
    animal: Any,
    snapshot: PublishedGuideline,
) -> tuple[str | None, str]:
    species = animal.species.value
    profile_codes = {
        code
        for code, item in snapshot.profiles.items()
        if item.species_code == species
    }
    if species == "dog":
        if animal.lactating or animal.life_stage == "lactation":
            code, reason = "dog_early_growth_reproduction", "dog_lactating"
        elif animal.pregnant or animal.life_stage == "gestation":
            code, reason = "dog_early_growth_reproduction", "dog_pregnant"
        elif animal.life_stage == "puppy_kitten" or (
            animal.age_months is not None and animal.age_months < 12
        ):
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
        elif animal.life_stage == "puppy_kitten" or (
            animal.age_months is not None and animal.age_months < 12
        ):
            code, reason = "cat_growth", "cat_age_lt_12_months"
        else:
            indoor_or_neutered = animal.neutered or animal.activity == "low"
            code = "cat_adult_mer75" if indoor_or_neutered else "cat_adult_mer100"
            reason = "cat_adult_indoor_or_neutered" if indoor_or_neutered else "cat_adult_active"
    else:
        return None, "species_out_of_scope"
    return (code if code in profile_codes else None), reason


def _suggest_size(animal: Any, snapshot: PublishedGuideline) -> str | None:
    item = _derive_size_class(animal, snapshot)
    return item.code if item else None


def suggest_context(animal: Any, snapshot: PublishedGuideline) -> SuggestionsResponse:
    species = animal.species.value
    formula_code, formula_reason, confidence = _suggest_formula(animal, snapshot)
    profile_code, profile_reason = _suggest_nutrient_standard(animal, snapshot)
    profiles = sorted(
        (
            item
            for item in snapshot.profiles.values()
            if item.species_code == species and item.clinician_selectable
        ),
        key=lambda item: item.code,
    )
    formulas = sorted(
        (item for item in snapshot.formulas.values() if item.species_code == species),
        key=lambda item: item.code,
    )
    sizes = sorted(
        (item for item in snapshot.size_classes.values() if item.species_code == species),
        key=lambda item: (float(item.min_adult_weight_kg or 0), item.code),
    )
    confidence_ru = {
        "high": "высокая уверенность",
        "medium": "средняя уверенность",
        "low": "низкая уверенность",
    }[confidence]
    return SuggestionsResponse(
        edition=_edition(snapshot),
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
        energy_suggestion=(
            ContextSuggestion(code=formula_code, reason=formula_reason)
            if formula_code
            else None
        ),
        nutrient_standard_suggestion=(
            ContextSuggestion(code=profile_code, reason=profile_reason)
            if profile_code
            else None
        ),
        suggested_profile_code=profile_code,
        suggested_energy_formula_code=formula_code,
        suggested_size_class_code=_suggest_size(animal, snapshot),
        confidence=confidence,
        confidence_ru=confidence_ru,
    )
