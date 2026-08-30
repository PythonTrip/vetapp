from collections.abc import Mapping
from math import isfinite
from typing import Any


class AstEvaluationError(ValueError):
    pass


class UnsupportedAstError(AstEvaluationError):
    pass


class MissingAstFieldError(AstEvaluationError):
    def __init__(self, field: str) -> None:
        super().__init__(f"Missing AST field: {field}")
        self.field = field


FORMULA_OPERATORS = {
    "constant",
    "field",
    "add",
    "subtract",
    "multiply",
    "divide",
    "pow",
    "min",
    "max",
}
PREDICATE_OPERATORS = {
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "in",
    "and",
    "or",
    "not",
}


def _args(node: Mapping[str, Any], operator: str) -> list[dict[str, Any]]:
    args = node.get("args")
    if not isinstance(args, list) or not args:
        raise AstEvaluationError(f"AST operator {operator!r} requires args")
    if not all(isinstance(item, dict) for item in args):
        raise AstEvaluationError(f"AST operator {operator!r} received invalid args")
    return args


def evaluate_formula(node: Mapping[str, Any], fields: Mapping[str, float | int | None]) -> float:
    operator = node.get("op")
    if operator not in FORMULA_OPERATORS:
        raise UnsupportedAstError(f"Unsupported formula AST operator: {operator!r}")
    if operator == "constant":
        value = node.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise AstEvaluationError("Formula constant must be numeric")
        return float(value)
    if operator == "field":
        field = node.get("field")
        if not isinstance(field, str):
            raise AstEvaluationError("Formula field name is invalid")
        value = fields.get(field)
        if value is None:
            raise MissingAstFieldError(field)
        return float(value)

    values = [evaluate_formula(item, fields) for item in _args(node, str(operator))]
    if operator == "add":
        result = sum(values)
    elif operator == "subtract":
        if len(values) != 2:
            raise AstEvaluationError("subtract requires two args")
        result = values[0] - values[1]
    elif operator == "multiply":
        result = 1.0
        for value in values:
            result *= value
    elif operator == "divide":
        if len(values) != 2 or values[1] == 0:
            raise AstEvaluationError("divide requires two args and a non-zero denominator")
        result = values[0] / values[1]
    elif operator == "pow":
        if len(values) != 2:
            raise AstEvaluationError("pow requires two args")
        result = values[0] ** values[1]
    elif operator == "min":
        result = min(values)
    else:
        result = max(values)
    if not isfinite(result):
        raise AstEvaluationError("Formula result is not finite")
    return result


def evaluate_predicate(
    node: Mapping[str, Any],
    fields: Mapping[str, str | float | int | None],
) -> bool | None:
    operator = node.get("op")
    if operator not in PREDICATE_OPERATORS:
        raise UnsupportedAstError(f"Unsupported predicate AST operator: {operator!r}")
    if operator in {"and", "or"}:
        results = [evaluate_predicate(item, fields) for item in _args(node, str(operator))]
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
            raise AstEvaluationError("not requires an arg")
        result = evaluate_predicate(child, fields)
        return None if result is None else not result

    field = node.get("field")
    if not isinstance(field, str):
        raise AstEvaluationError("Predicate field name is invalid")
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
            raise AstEvaluationError("in requires a values list")
        return actual in values
    if operator == "between":
        minimum = node.get("min")
        maximum = node.get("max")
        if minimum is None or maximum is None:
            values = node.get("values", expected)
            if not isinstance(values, list) or len(values) != 2:
                raise AstEvaluationError("between requires min/max")
            minimum, maximum = values
        return minimum <= actual <= maximum
    if expected is None:
        raise AstEvaluationError(f"Predicate {operator!r} requires value")
    if operator == "gt":
        return actual > expected
    if operator == "gte":
        return actual >= expected
    if operator == "lt":
        return actual < expected
    return actual <= expected
