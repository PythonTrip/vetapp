from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from vetdietderm_api.standards.fediaf.v2025.models import ApplicabilityRule
from vetdietderm_api.standards.fediaf.v2025.sources import stable_uuid

LATE_GROWTH_NOTE = (
    "Порог возраста указан источником приблизительно: около 6 месяцев; "
    "правило не следует трактовать как более точную медицинскую границу."
)


class PredicateEvaluationError(ValueError):
    pass


def evaluate_predicate(
    node: Mapping[str, Any],
    fields: Mapping[str, str | float | int | None],
) -> bool | None:
    """Evaluate the small predicate language used by FEDIAF 2025 only."""
    operator = node.get("op")
    if operator in {"and", "or"}:
        args = node.get("args")
        if not isinstance(args, list) or not args or not all(isinstance(item, dict) for item in args):
            raise PredicateEvaluationError(f"Predicate {operator!r} requires args")
        results = [evaluate_predicate(item, fields) for item in args]
        if operator == "and":
            if False in results:
                return False
            return None if None in results else True
        if True in results:
            return True
        return None if None in results else False
    if operator == "not":
        child = node.get("arg")
        if not isinstance(child, dict):
            raise PredicateEvaluationError("Predicate 'not' requires an arg")
        value = evaluate_predicate(child, fields)
        return None if value is None else not value

    field = node.get("field")
    if not isinstance(field, str):
        raise PredicateEvaluationError("Predicate field is invalid")
    actual = fields.get(field)
    if actual is None:
        return None
    expected = node.get("value")
    if operator == "eq":
        return actual == expected
    if operator == "neq":
        return actual != expected
    if operator == "in":
        values = node.get("values", expected)
        if not isinstance(values, list):
            raise PredicateEvaluationError("Predicate 'in' requires values")
        return actual in values
    if operator == "between":
        minimum, maximum = node.get("min"), node.get("max")
        if minimum is None or maximum is None:
            values = node.get("values", expected)
            if not isinstance(values, list) or len(values) != 2:
                raise PredicateEvaluationError("Predicate 'between' requires bounds")
            minimum, maximum = values
        return minimum <= actual <= maximum
    if expected is None:
        raise PredicateEvaluationError(f"Predicate {operator!r} requires a value")
    comparisons = {
        "gt": lambda: actual > expected,
        "gte": lambda: actual >= expected,
        "lt": lambda: actual < expected,
        "lte": lambda: actual <= expected,
    }
    comparison = comparisons.get(str(operator))
    if comparison is None:
        raise PredicateEvaluationError(f"Unsupported FEDIAF predicate: {operator!r}")
    return comparison()


def base_rules(source_uuid: Any) -> dict[str, ApplicabilityRule]:
    definitions: tuple[tuple[str, str, dict[str, Any], str | None], ...] = (
        (
            "feed_form_wet",
            "Рацион во влажной форме",
            {"op": "eq", "field": "feedForm", "value": "wet"},
            None,
        ),
        (
            "feed_form_dry",
            "Рацион в сухой форме",
            {"op": "eq", "field": "feedForm", "value": "dry"},
            None,
        ),
        (
            "dog_late_growth_weight_le_15",
            "Поздний рост: ожидаемая взрослая масса ≤15 кг",
            {"op": "lte", "field": "expectedAdultWeightKg", "value": 15},
            None,
        ),
        (
            "dog_late_growth_weight_gt_15_age_lte_approx_6m",
            "Поздний рост: масса >15 кг и возраст примерно до 6 месяцев",
            {
                "op": "and",
                "args": [
                    {"op": "gt", "field": "expectedAdultWeightKg", "value": 15},
                    {"op": "lte", "field": "ageMonths", "value": 6},
                ],
            },
            LATE_GROWTH_NOTE,
        ),
        (
            "dog_late_growth_weight_gt_15_age_gt_approx_6m",
            "Поздний рост: масса >15 кг и возраст старше примерно 6 месяцев",
            {
                "op": "and",
                "args": [
                    {"op": "gt", "field": "expectedAdultWeightKg", "value": 15},
                    {"op": "gt", "field": "ageMonths", "value": 6},
                ],
            },
            LATE_GROWTH_NOTE,
        ),
    )
    return {
        code: ApplicabilityRule(
            uuid=stable_uuid("rule", code),
            code=code,
            name_ru=name,
            predicate_json=predicate,
            note_ru=note,
            source_reference_uuid=source_uuid,
        )
        for code, name, predicate, note in definitions
    }


def formula_constraint_predicate(constraints: Any) -> dict[str, Any] | None:
    if not isinstance(constraints, dict):
        return None
    litter_size = constraints.get("litter_size")
    if not isinstance(litter_size, dict):
        return None
    clauses: list[dict[str, Any]] = []
    for boundary, operator in {
        "min": "gte",
        "min_exclusive": "gt",
        "max": "lte",
        "max_exclusive": "lt",
    }.items():
        if boundary in litter_size:
            clauses.append({"op": operator, "field": "litterSize", "value": litter_size[boundary]})
    if not clauses:
        return None
    return clauses[0] if len(clauses) == 1 else {"op": "and", "args": clauses}
