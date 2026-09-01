from __future__ import annotations

import ast
from collections.abc import Mapping
from math import isfinite
from typing import Any

from vetdietderm_api.standards.fediaf.v2025.applicability import (
    formula_constraint_predicate,
)
from vetdietderm_api.standards.fediaf.v2025.models import (
    ApplicabilityRule,
    EnergyFormula,
    SourceReference,
)
from vetdietderm_api.standards.fediaf.v2025.sources import source_reference, stable_uuid


class EnergyFormulaError(ValueError):
    pass


def _constant(value: int | float) -> dict[str, Any]:
    return {"op": "constant", "value": value}


def _formula_node(node: ast.AST) -> dict[str, Any]:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return _constant(node.value)
    if isinstance(node, ast.Name):
        return {"op": "field", "field": node.id}
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        if isinstance(node.operand, ast.Constant) and isinstance(node.operand.value, (int, float)):
            return _constant(-node.operand.value)
        return {"op": "subtract", "args": [_constant(0), _formula_node(node.operand)]}
    if isinstance(node, ast.BinOp):
        operator = {
            ast.Add: "add",
            ast.Sub: "subtract",
            ast.Mult: "multiply",
            ast.Div: "divide",
            ast.Pow: "pow",
        }.get(type(node.op))
        if operator is None:
            raise EnergyFormulaError(f"Unsupported formula operator: {type(node.op).__name__}")
        return {"op": operator, "args": [_formula_node(node.left), _formula_node(node.right)]}
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if node.func.id not in {"pow", "min", "max"} or node.keywords:
            raise EnergyFormulaError(f"Unsupported formula function: {node.func.id}")
        return {"op": node.func.id, "args": [_formula_node(item) for item in node.args]}
    raise EnergyFormulaError(f"Unsupported formula syntax: {ast.dump(node, include_attributes=False)}")


def parse_formula(expression: str) -> dict[str, Any]:
    if not isinstance(expression, str) or not expression.strip():
        raise EnergyFormulaError("Formula expression must be non-empty")
    return _formula_node(ast.parse(expression, mode="eval").body)


def formula_asts(formula: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    direct = formula.get("expression")
    expression_min = formula.get("expression_min")
    expression_max = formula.get("expression_max")
    range_expression = formula.get("range_expression")
    range_ast: dict[str, Any] | None = None
    if isinstance(range_expression, str) and range_expression.strip():
        body = ast.parse(range_expression, mode="eval").body
        if (
            not isinstance(body, ast.BinOp)
            or not isinstance(body.op, ast.Mult)
            or not isinstance(body.left, (ast.List, ast.Tuple))
            or len(body.left.elts) != 2
        ):
            raise EnergyFormulaError("Range expression must be a two-value array times an expression")
        range_ast = {
            "min": {"op": "multiply", "args": [_formula_node(body.left.elts[0]), _formula_node(body.right)]},
            "max": {"op": "multiply", "args": [_formula_node(body.left.elts[1]), _formula_node(body.right)]},
        }
    elif expression_min is not None or expression_max is not None:
        range_ast = {
            "min": parse_formula(expression_min) if expression_min else None,
            "max": parse_formula(expression_max) if expression_max else None,
        }
    if isinstance(direct, str) and direct.strip():
        return parse_formula(direct), range_ast
    if range_ast is not None:
        return None, range_ast
    raise EnergyFormulaError(f"Energy formula {formula.get('code')!r} has no expression")


def required_animal_fields(formula: dict[str, Any]) -> list[str]:
    result: list[str] = []
    for field in formula.get("parameters", []):
        required = "lactation_week" if field == "lactation_factor" else field
        if required not in result:
            result.append(required)
    if formula_constraint_predicate(formula.get("constraints")) is not None and "litter_size" not in result:
        result.append("litter_size")
    return result


def allowed_weight_bases(species: str, code: str, formula: dict[str, Any]) -> list[str]:
    adult_codes = {
        "dog": {
            "adult_age_1_2", "adult_age_3_7", "senior_over_7", "activity_low",
            "activity_moderate_low_impact", "activity_moderate_high_impact",
            "activity_high", "obesity_prone",
        },
        "cat": {"adult_indoor_neutered", "adult_active"},
    }
    parameters = set(formula.get("parameters", []))
    if (
        code in adult_codes[species]
        and parameters.intersection({"body_weight_kg", "body_weight_g"})
        and "expected_adult_weight_kg" not in parameters
    ):
        return ["current", "target_override"]
    return ["current"]


def build_formula(
    species: str,
    payload: dict[str, Any],
    default_url: str,
) -> tuple[EnergyFormula, SourceReference, ApplicabilityRule | None]:
    code = payload["code"]
    formula_ast, range_ast = formula_asts(payload)
    reference = source_reference(
        f"energy:{species}:{code}",
        payload.get("source_url", default_url),
        page=payload.get("page"),
        table_code=payload.get("source_table"),
        row_code=code,
        note_ru=payload.get("note_ru"),
    )
    predicate = formula_constraint_predicate(payload.get("constraints"))
    rule = None
    if predicate is not None:
        rule_code = f"energy_{species}_{code}"
        rule = ApplicabilityRule(
            uuid=stable_uuid("rule", rule_code),
            code=rule_code,
            name_ru=f"Применимость формулы: {payload.get('name_ru', code)}",
            predicate_json=predicate,
            source_reference_uuid=reference.uuid,
        )
    result_kind = "point" if payload.get("expression") else "range"
    formula = EnergyFormula(
        uuid=stable_uuid("formula", f"{species}:{code}"),
        species_code=species,
        code=code,
        name_ru=payload.get("name_ru") or code,
        formula_ast=formula_ast,
        range_ast=range_ast,
        required_animal_fields=required_animal_fields(payload),
        result_kind=result_kind,
        allowed_weight_bases=allowed_weight_bases(species, code, payload),
        result_unit=payload["result_unit"],
        applicability_rule_uuid=rule.uuid if rule else None,
        source_reference_uuid=reference.uuid,
        note_ru=payload.get("note_ru"),
    )
    return formula, reference, rule


def evaluate_formula(node: Mapping[str, Any], fields: Mapping[str, float | int | None]) -> float:
    operator = node.get("op")
    if operator == "constant":
        value = node.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise EnergyFormulaError("Formula constant must be numeric")
        return float(value)
    if operator == "field":
        field = node.get("field")
        if not isinstance(field, str) or fields.get(field) is None:
            raise EnergyFormulaError(f"Missing formula field: {field}")
        return float(fields[field])  # type: ignore[arg-type]
    args = node.get("args")
    if not isinstance(args, list) or not args or not all(isinstance(item, dict) for item in args):
        raise EnergyFormulaError(f"Formula operator {operator!r} requires args")
    values = [evaluate_formula(item, fields) for item in args]
    if operator == "add":
        result = sum(values)
    elif operator == "subtract" and len(values) == 2:
        result = values[0] - values[1]
    elif operator == "multiply":
        result = 1.0
        for value in values:
            result *= value
    elif operator == "divide" and len(values) == 2 and values[1] != 0:
        result = values[0] / values[1]
    elif operator == "pow" and len(values) == 2:
        result = values[0] ** values[1]
    elif operator == "min":
        result = min(values)
    elif operator == "max":
        result = max(values)
    else:
        raise EnergyFormulaError(f"Unsupported FEDIAF formula operator: {operator!r}")
    if not isfinite(result):
        raise EnergyFormulaError("Formula result is not finite")
    return result
