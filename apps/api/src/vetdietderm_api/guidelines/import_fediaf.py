"""Legacy one-time SQL importer; not used by assessment or guideline APIs."""

import argparse
import ast
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from vetdietderm_api.catalog.models import (
    Nutrient,
    NutrientGroup,
)
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.guidelines.legacy_models import (
    ApplicabilityRule,
    DerivedExpression,
    EnergyFormula,
    GrowthSizeClass,
    GuidelineEdition,
    GuidelineProfile,
    GuidelineStandard,
    GuidelineTarget,
    LactationFactor,
    SourceReference,
)
from vetdietderm_api.guidelines.legacy_guard import require_legacy_runtime_tables
from vetdietderm_api.ids import uuid6

REPO_ROOT = Path(__file__).resolve().parents[5]
SOURCE_PATH = REPO_ROOT / "docs" / "data" / "fediaf_2025_veterinary_nutrition_database_ru.json"
SCHEMA_PATH = REPO_ROOT / "docs" / "data" / "fediaf_2025_veterinary_nutrition_schema.json"
GOLDEN_PATH = REPO_ROOT / "docs" / "data" / "fediaf_2025_vii11_golden.json"

ALLOWED_TARGET_UNITS = {"g", "mg", "µg", "IU", "ratio"}

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
FORMULA_FIELDS = {
    "body_weight_kg",
    "body_weight_g",
    "expected_adult_weight_kg",
    "maintenance_energy_kcal_day",
    "litter_size",
    "lactation_factor",
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
PREDICATE_FIELDS = {
    "feedForm",
    "expectedAdultWeightKg",
    "ageMonths",
    "litterSize",
}

DERIVED_DEFINITIONS = {
    "epa_dha": {
        "name_ru": "ЭПК + ДГК",
        "unit": "g",
        "type": "sum",
        "ast": {"op": "sum", "nutrient_codes": ["EPA", "DHA"]},
    },
    "ca_p_ratio": {
        "name_ru": "Соотношение Ca:P",
        "unit": "ratio",
        "type": "ratio",
        "ast": {"op": "ratio", "numerator_code": "Ca", "denominator_code": "P"},
    },
    "methionine_cystine": {
        "name_ru": "Метионин + цистин",
        "unit": "g",
        "type": "sum",
        "ast": {"op": "sum", "nutrient_codes": ["Met", "Cys"]},
    },
    "phenylalanine_tyrosine": {
        "name_ru": "Фенилаланин + тирозин",
        "unit": "g",
        "type": "sum",
        "ast": {"op": "sum", "nutrient_codes": ["Phe", "Tyr"]},
    },
    "omega6_omega3": {
        "name_ru": "Соотношение омега-6/омега-3",
        "unit": "ratio",
        "type": "ratio",
        "ast": {
            "op": "group_ratio",
            "numerator_group_code": "OMEGA_6",
            "denominator_group_code": "OMEGA_3",
        },
    },
}

LATE_GROWTH_NOTE = (
    "Порог возраста указан источником приблизительно: около 6 месяцев; "
    "правило не следует трактовать как более точную медицинскую границу."
)


@dataclass(frozen=True)
class ImportReport:
    edition_uuid: str
    edition_code: str
    import_version: int
    status: str
    source_checksum: str
    profiles: int
    targets: int
    energy_formulas: int
    derived_expressions: int
    applicability_rules: int
    growth_size_classes: int
    lactation_factors: int
    warnings: tuple[str, ...]
    errors: tuple[str, ...]
    unchanged: bool = False


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as source:
        return json.load(source)


def _load_source(source_path: Path, schema_path: Path) -> tuple[dict[str, Any], str]:
    source_bytes = source_path.read_bytes()
    payload = json.loads(source_bytes.decode("utf-8"))
    schema = _load_json(schema_path)
    if not isinstance(payload, dict):
        raise ValueError("FEDIAF snapshot must contain a JSON object")
    required = schema.get("required")
    if not isinstance(required, list) or not all(isinstance(key, str) for key in required):
        raise ValueError("FEDIAF schema has no valid top-level required list")
    missing = sorted(set(required) - set(payload))
    if missing:
        raise ValueError(f"FEDIAF snapshot is missing required top-level keys: {missing}")
    for key in required:
        if not isinstance(payload[key], dict):
            raise ValueError(f"FEDIAF top-level key {key!r} must contain an object")
    return payload, hashlib.sha256(source_bytes).hexdigest()


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Expected numeric or null value, received {value!r}")
    return Decimal(str(value))


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
        operations = {
            ast.Add: "add",
            ast.Sub: "subtract",
            ast.Mult: "multiply",
            ast.Div: "divide",
            ast.Pow: "pow",
        }
        operator = operations.get(type(node.op))
        if operator is None:
            raise ValueError(f"Unsupported formula operator: {type(node.op).__name__}")
        return {"op": operator, "args": [_formula_node(node.left), _formula_node(node.right)]}
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if node.func.id not in {"pow", "min", "max"} or node.keywords:
            raise ValueError(f"Unsupported formula function: {node.func.id}")
        if node.func.id == "pow" and len(node.args) != 2:
            raise ValueError("pow requires exactly two arguments")
        if node.func.id in {"min", "max"} and not node.args:
            raise ValueError(f"{node.func.id} requires at least one argument")
        return {"op": node.func.id, "args": [_formula_node(item) for item in node.args]}
    raise ValueError(f"Unsupported formula syntax: {ast.dump(node, include_attributes=False)}")


def parse_formula(expression: str) -> dict[str, Any]:
    if not isinstance(expression, str) or not expression.strip():
        raise ValueError("Formula expression must be a non-empty string")
    return _formula_node(ast.parse(expression, mode="eval").body)


def _range_expression(expression: str) -> dict[str, Any]:
    body = ast.parse(expression, mode="eval").body
    if (
        not isinstance(body, ast.BinOp)
        or not isinstance(body.op, ast.Mult)
        or not isinstance(body.left, (ast.List, ast.Tuple))
        or len(body.left.elts) != 2
    ):
        raise ValueError("Range expression must be a two-value array multiplied by an expression")
    return {
        "min": {
            "op": "multiply",
            "args": [_formula_node(body.left.elts[0]), _formula_node(body.right)],
        },
        "max": {
            "op": "multiply",
            "args": [_formula_node(body.left.elts[1]), _formula_node(body.right)],
        },
    }


def formula_asts(
    formula: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    direct = formula.get("expression")
    expression_min = formula.get("expression_min")
    expression_max = formula.get("expression_max")
    range_expression = formula.get("range_expression")
    range_ast: dict[str, Any] | None = None
    if isinstance(range_expression, str) and range_expression.strip():
        range_ast = _range_expression(range_expression)
    elif expression_min is not None or expression_max is not None:
        range_ast = {
            "min": parse_formula(expression_min) if expression_min else None,
            "max": parse_formula(expression_max) if expression_max else None,
        }
    if isinstance(direct, str) and direct.strip():
        return parse_formula(direct), range_ast
    if range_ast is not None:
        return None, range_ast
    raise ValueError(f"Energy formula {formula.get('code')!r} has no executable expression")


def _validate_formula_ast(node: Any) -> list[str]:
    if not isinstance(node, dict):
        return ["formula AST node is not an object"]
    operator = node.get("op")
    if operator not in FORMULA_OPERATORS:
        return [f"formula AST contains unsupported operator {operator!r}"]
    if operator == "constant":
        value = node.get("value")
        return [] if isinstance(value, (int, float)) and not isinstance(value, bool) else [
            "formula constant is not numeric"
        ]
    if operator == "field":
        field = node.get("field")
        if field not in FORMULA_FIELDS:
            return [f"formula field {field!r} is not whitelisted"]
        return []
    errors: list[str] = []
    args = node.get("args")
    if not isinstance(args, list) or not args:
        return [f"formula operator {operator!r} has no args"]
    for child in args:
        errors.extend(_validate_formula_ast(child))
    return errors


def _validate_predicate(node: Any) -> list[str]:
    if not isinstance(node, dict):
        return ["predicate node is not an object"]
    operator = node.get("op")
    if operator not in PREDICATE_OPERATORS:
        return [f"predicate contains unsupported operator {operator!r}"]
    errors: list[str] = []
    if operator in {"and", "or"}:
        args = node.get("args")
        if not isinstance(args, list) or not args:
            return [f"predicate operator {operator!r} has no args"]
        for child in args:
            errors.extend(_validate_predicate(child))
    elif operator == "not":
        errors.extend(_validate_predicate(node.get("arg")))
    else:
        field = node.get("field")
        if field not in PREDICATE_FIELDS:
            errors.append(f"predicate field {field!r} is not whitelisted")
    return errors


def _formula_constraint_predicate(constraints: Any) -> dict[str, Any] | None:
    if not isinstance(constraints, dict):
        return None
    litter_size = constraints.get("litter_size")
    if not isinstance(litter_size, dict):
        return None
    clauses: list[dict[str, Any]] = []
    boundary_map = {
        "min": "gte",
        "min_exclusive": "gt",
        "max": "lte",
        "max_exclusive": "lt",
    }
    for boundary, operator in boundary_map.items():
        if boundary in litter_size:
            clauses.append(
                {"op": operator, "field": "litterSize", "value": litter_size[boundary]}
            )
    if not clauses:
        return None
    return clauses[0] if len(clauses) == 1 else {"op": "and", "args": clauses}


def _required_animal_fields(formula: dict[str, Any]) -> list[str]:
    result: list[str] = []
    for field in formula.get("parameters", []):
        required = "lactation_week" if field == "lactation_factor" else field
        if required not in result:
            result.append(required)
    if _formula_constraint_predicate(formula.get("constraints")) is not None and "litter_size" not in result:
        result.append("litter_size")
    return result


def _allowed_weight_bases(species: str, code: str, formula: dict[str, Any]) -> list[str]:
    parameters = set(formula.get("parameters", []))
    adult_codes = {
        "dog": {
            "adult_age_1_2",
            "adult_age_3_7",
            "senior_over_7",
            "activity_low",
            "activity_moderate_low_impact",
            "activity_moderate_high_impact",
            "activity_high",
            "obesity_prone",
        },
        "cat": {"adult_indoor_neutered", "adult_active"},
    }
    if (
        code in adult_codes[species]
        and ("body_weight_kg" in parameters or "body_weight_g" in parameters)
        and "expected_adult_weight_kg" not in parameters
    ):
        return ["current", "target_override"]
    return ["current"]


def _growth_curve_ast(expression: Any) -> dict[str, Any] | None:
    if not isinstance(expression, str) or not expression.strip():
        return None
    match = re.fullmatch(
        r"\s*(-?\d+(?:\.\d+)?)\s*\*\s*ln\(([A-Za-z_][A-Za-z0-9_]*)\)\s*([+-])\s*(\d+(?:\.\d+)?)\s*",
        expression,
    )
    if match is None:
        raise ValueError(f"Unsupported growth curve expression {expression!r}")
    coefficient, field, sign, offset = match.groups()
    offset_value = Decimal(offset) * (-1 if sign == "-" else 1)
    return {
        "kind": "logarithmic",
        "coefficient": float(Decimal(coefficient)),
        "field": field,
        "offset": float(offset_value),
    }


def _source_reference(
    edition_uuid: Any,
    source_url: str,
    *,
    page: int | None = None,
    table_code: str | None = None,
    section_code: str | None = None,
    row_code: str | None = None,
    footnote: str | None = None,
    source_value_text: str | None = None,
    note_ru: str | None = None,
    source_language: str = "en",
) -> SourceReference:
    return SourceReference(
        uuid=uuid6(),
        edition_uuid=edition_uuid,
        source_url=source_url,
        source_language=source_language,
        page=page,
        table_code=table_code,
        section_code=section_code,
        row_code=row_code,
        footnote=footnote,
        source_value_text=source_value_text,
        note_ru=note_ru,
    )


def _applicability_code(
    target: GuidelineTarget,
    rules_by_uuid: dict[Any, ApplicabilityRule],
) -> str:
    if target.applicability_rule_uuid is None:
        return "all"
    rule_code = rules_by_uuid[target.applicability_rule_uuid].code
    return {
        "feed_form_wet": "wet",
        "feed_form_dry": "dry",
    }.get(rule_code, rule_code)


def _vii11_golden_validation(
    session: Session,
    edition: GuidelineEdition,
    golden_path: Path,
) -> list[str]:
    errors: list[str] = []
    try:
        golden = _load_json(golden_path)
    except (OSError, json.JSONDecodeError) as exc:
        return [f"VII-11 golden fixture cannot be loaded: {exc}"]
    if not isinstance(golden, dict) or not isinstance(golden.get("rows"), list):
        return ["VII-11 golden fixture must contain a rows array"]
    if golden.get("edition") != edition.code:
        errors.append(
            f"VII-11 golden edition {golden.get('edition')!r} does not match {edition.code!r}"
        )

    profiles = {
        item.uuid: item
        for item in session.scalars(
            select(GuidelineProfile).where(GuidelineProfile.edition_uuid == edition.uuid)
        )
    }
    targets = list(
        session.scalars(
            select(GuidelineTarget).where(GuidelineTarget.edition_uuid == edition.uuid)
        )
    )
    rules_by_uuid = {
        item.uuid: item
        for item in session.scalars(
            select(ApplicabilityRule).where(ApplicabilityRule.edition_uuid == edition.uuid)
        )
    }
    sources = {
        item.uuid: item
        for item in session.scalars(
            select(SourceReference).where(SourceReference.edition_uuid == edition.uuid)
        )
    }

    actual: dict[tuple[str, str, str, str], tuple[str, Decimal | None]] = {}
    seen_all: set[tuple[str, str, str, str]] = set()
    for target in targets:
        profile = profiles[target.profile_uuid]
        applicability = _applicability_code(target, rules_by_uuid)
        key = (profile.species_code, profile.code, target.source_code, applicability)
        if key in seen_all:
            errors.append(f"Duplicate standard row: {'/'.join(key)}")
        seen_all.add(key)
        if target.unit not in ALLOWED_TARGET_UNITS:
            errors.append(f"Unknown target unit {target.unit!r} at {'/'.join(key)}")
        if target.source_code in DERIVED_DEFINITIONS and target.derived_expression_uuid is None:
            errors.append(f"Composite {target.source_code} is stored as an atomic nutrient")
        if profile.calculation_basis != "daily_per_metabolic_bw":
            continue
        source = sources.get(target.source_reference_uuid)
        if source is None or source.page is None or not source.table_code:
            errors.append(f"VII-11 source page/table is missing at {'/'.join(key)}")
        else:
            if source.page != golden.get("source_page"):
                errors.append(f"VII-11 source page mismatch at {'/'.join(key)}")
            if source.table_code != golden.get("source_table"):
                errors.append(f"VII-11 source table mismatch at {'/'.join(key)}")
            if source.source_language != golden.get("source_language"):
                errors.append(f"VII-11 source language mismatch at {'/'.join(key)}")
        actual[key] = (target.unit, target.minimum_value)

    expected: dict[tuple[str, str, str, str], tuple[str, Decimal | None]] = {}
    for index, row in enumerate(golden["rows"], start=1):
        if not isinstance(row, dict):
            errors.append(f"VII-11 golden row {index} is not an object")
            continue
        fields = ("species", "profile_code", "code", "applicability", "source_unit")
        if not all(isinstance(row.get(field), str) and row[field] for field in fields):
            errors.append(f"VII-11 golden row {index} has incomplete identity")
            continue
        key = (
            row["species"],
            row["profile_code"],
            row["code"],
            row["applicability"],
        )
        if key in expected:
            errors.append(f"Duplicate VII-11 golden row: {'/'.join(key)}")
            continue
        try:
            expected[key] = (row["source_unit"], _decimal(row.get("source_value")))
        except ValueError as exc:
            errors.append(f"VII-11 golden row {index}: {exc}")

    for key in sorted(expected.keys() | actual.keys()):
        if key not in actual:
            errors.append(f"VII-11 target is missing: {'/'.join(key)}")
            continue
        if key not in expected:
            errors.append(f"Unexpected VII-11 target: {'/'.join(key)}")
            continue
        expected_unit, expected_value = expected[key]
        actual_unit, actual_value = actual[key]
        if expected_unit != actual_unit:
            errors.append(
                f"VII-11 unit mismatch at {'/'.join(key)}: "
                f"expected {expected_unit!r}, imported {actual_unit!r}"
            )
        if expected_value != actual_value:
            errors.append(
                f"VII-11 value mismatch at {'/'.join(key)}: "
                f"expected {expected_value!r}, imported {actual_value!r}"
            )
        if expected_value is None and actual_value == 0:
            errors.append(f"VII-11 empty cell was stored as numeric zero at {'/'.join(key)}")
    return errors


def _report(session: Session, edition: GuidelineEdition, *, warnings: list[str], errors: list[str], unchanged: bool = False) -> ImportReport:
    def count(model: Any) -> int:
        return int(
            session.scalar(
                select(func.count()).select_from(model).where(model.edition_uuid == edition.uuid)
            )
            or 0
        )

    return ImportReport(
        edition_uuid=str(edition.uuid),
        edition_code=edition.code,
        import_version=edition.import_version,
        status=edition.status,
        source_checksum=edition.source_checksum,
        profiles=count(GuidelineProfile),
        targets=count(GuidelineTarget),
        energy_formulas=count(EnergyFormula),
        derived_expressions=count(DerivedExpression),
        applicability_rules=count(ApplicabilityRule),
        growth_size_classes=count(GrowthSizeClass),
        lactation_factors=count(LactationFactor),
        warnings=tuple(warnings),
        errors=tuple(errors),
        unchanged=unchanged,
    )


def _semantic_validation(
    session: Session,
    edition: GuidelineEdition,
    source_target_codes: set[str],
    catalog_nutrient_codes: set[str],
    mapped_source_codes: set[str],
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    profiles = list(
        session.scalars(select(GuidelineProfile).where(GuidelineProfile.edition_uuid == edition.uuid))
    )
    targets = list(
        session.scalars(select(GuidelineTarget).where(GuidelineTarget.edition_uuid == edition.uuid))
    )
    formulas = list(
        session.scalars(select(EnergyFormula).where(EnergyFormula.edition_uuid == edition.uuid))
    )
    rules = list(
        session.scalars(select(ApplicabilityRule).where(ApplicabilityRule.edition_uuid == edition.uuid))
    )
    if not profiles:
        errors.append("No guideline profiles were imported")
    if not targets:
        errors.append("No guideline targets were imported")
    if not formulas:
        errors.append("No energy formulas were imported")
    for target in targets:
        if (target.nutrient_uuid is None) == (target.derived_expression_uuid is None):
            errors.append(f"Target {target.uuid} violates nutrient/derived XOR")
        if target.target_status == "established" and target.minimum_value is None and target.maximum_value is None:
            errors.append(f"Established target {target.uuid} has no numeric value")
        if target.target_status == "not_established" and (
            target.minimum_value is not None or target.maximum_value is not None
        ):
            errors.append(f"Not-established target {target.uuid} has a numeric value")
    for formula in formulas:
        if formula.formula_ast is not None:
            errors.extend(
                f"Formula {formula.species_code}/{formula.code}: {item}"
                for item in _validate_formula_ast(formula.formula_ast)
            )
        elif formula.result_kind == "point":
            errors.append(
                f"Formula {formula.species_code}/{formula.code}: point formula has no AST"
            )
        if formula.range_ast:
            for endpoint in ("min", "max"):
                node = formula.range_ast.get(endpoint)
                if node is not None:
                    errors.extend(
                        f"Formula {formula.species_code}/{formula.code} range {endpoint}: {item}"
                        for item in _validate_formula_ast(node)
                    )
    for rule in rules:
        errors.extend(f"Rule {rule.code}: {item}" for item in _validate_predicate(rule.predicate_json))
    missing_mappings = sorted(source_target_codes - mapped_source_codes)
    if missing_mappings:
        errors.append(f"Unmapped FEDIAF nutrient codes: {', '.join(missing_mappings)}")
    nutrient_codes = set(session.scalars(select(Nutrient.code)))
    unknown_catalog_codes = sorted(catalog_nutrient_codes - nutrient_codes)
    if unknown_catalog_codes:
        errors.append(
            "FEDIAF catalog contains unknown canonical nutrient codes: "
            + ", ".join(unknown_catalog_codes)
        )
    group_codes = set(session.scalars(select(NutrientGroup.code)))
    for definition in DERIVED_DEFINITIONS.values():
        definition_ast = definition["ast"]
        for code in definition_ast.get("nutrient_codes", []):
            if code not in nutrient_codes:
                errors.append(f"Derived expression references missing nutrient {code}")
        for key in ("numerator_code", "denominator_code"):
            code = definition_ast.get(key)
            if code is not None and code not in nutrient_codes:
                errors.append(f"Derived expression references missing nutrient {code}")
        for key in ("numerator_group_code", "denominator_group_code"):
            code = definition_ast.get(key)
            if code is not None and code not in group_codes:
                errors.append(f"Derived expression references missing nutrient group {code}")
    vitamin_e_target = next((target for target in targets if target.source_code == "E"), None)
    if vitamin_e_target is not None:
        warnings.append(
            "FEDIAF vitamin E targets use IU while the catalog canonical unit is mg; "
            "the assessment unit converter must apply a vitamin-E-specific conversion."
        )
    return errors, warnings


def import_fediaf(
    session: Session,
    *,
    source_path: Path = SOURCE_PATH,
    schema_path: Path = SCHEMA_PATH,
    golden_path: Path = GOLDEN_PATH,
    import_version: int = 1,
) -> ImportReport:
    require_legacy_runtime_tables(session)
    if import_version < 1:
        raise ValueError("import_version must be at least 1")
    payload, checksum = _load_source(source_path, schema_path)
    metadata = payload["database_meta"]
    source_metadata = metadata.get("source")
    if not isinstance(source_metadata, dict):
        raise ValueError("database_meta.source must be an object")
    edition_code = metadata.get("version")
    if not isinstance(edition_code, str) or not edition_code.strip():
        raise ValueError("database_meta.version must be a non-empty string")
    standard = session.scalar(
        select(GuidelineStandard).where(GuidelineStandard.code == "fediaf")
    )
    now = datetime.now(timezone.utc)
    if standard is None:
        standard = GuidelineStandard(
            uuid=uuid6(),
            code="fediaf",
            name="FEDIAF",
            publisher="European Pet Food Industry Federation",
            created_at=now,
            updated_at=now,
        )
        session.add(standard)
        session.flush()
    existing = session.scalar(
        select(GuidelineEdition).where(
            GuidelineEdition.standard_uuid == standard.uuid,
            GuidelineEdition.code == edition_code,
            GuidelineEdition.import_version == import_version,
        )
    )
    if existing is not None:
        if existing.source_checksum != checksum:
            raise ValueError(
                "Edition code/import version already exists with a different checksum; "
                "use a new --import-version instead of mutating it"
            )
        if existing.status == "draft":
            return _report(
                session,
                existing,
                warnings=[],
                errors=[
                    "The unchanged edition remains in draft after a failed validation; "
                    "a draft import is not successful. Correct the source or importer "
                    "and use a new --import-version."
                ],
                unchanged=True,
            )
        return _report(session, existing, warnings=[], errors=[], unchanged=True)

    source_title = source_metadata.get("title")
    source_url = source_metadata.get("url")
    clinical_warning = metadata.get("clinical_warning_ru")
    language = metadata.get("language", "ru")
    if not all(isinstance(value, str) and value.strip() for value in (source_title, source_url, clinical_warning, language)):
        raise ValueError("FEDIAF edition metadata is incomplete")
    edition = GuidelineEdition(
        uuid=uuid6(),
        standard_uuid=standard.uuid,
        code=edition_code,
        import_version=import_version,
        status="draft",
        source_checksum=checksum,
        source_title=source_title,
        source_url=source_url,
        publication_date=source_metadata.get("publication_date"),
        language=language,
        clinical_warning_ru=clinical_warning,
        created_at=now,
    )
    session.add(edition)
    session.flush()
    edition_source = _source_reference(edition.uuid, source_url, source_language="en")
    session.add(edition_source)
    session.flush()

    errors: list[str] = []
    mapped_source_codes: set[str] = set()
    nutrients = {row.code: row for row in session.scalars(select(Nutrient))}

    derived: dict[str, DerivedExpression] = {}
    for code, definition in DERIVED_DEFINITIONS.items():
        row = DerivedExpression(
            uuid=uuid6(),
            edition_uuid=edition.uuid,
            code=code,
            name_ru=definition["name_ru"],
            result_unit=definition["unit"],
            expression_type=definition["type"],
            ast_json=definition["ast"],
        )
        session.add(row)
        derived[code] = row

    rules: dict[str, ApplicabilityRule] = {}
    for code, name_ru, predicate in (
        ("feed_form_wet", "Рацион во влажной форме", {"op": "eq", "field": "feedForm", "value": "wet"}),
        ("feed_form_dry", "Рацион в сухой форме", {"op": "eq", "field": "feedForm", "value": "dry"}),
        (
            "dog_late_growth_weight_le_15",
            "Поздний рост: ожидаемая взрослая масса ≤15 кг",
            {"op": "lte", "field": "expectedAdultWeightKg", "value": 15},
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
        ),
    ):
        rule = ApplicabilityRule(
            uuid=uuid6(),
            edition_uuid=edition.uuid,
            code=code,
            name_ru=name_ru,
            predicate_json=predicate,
            note_ru=LATE_GROWTH_NOTE if "approx_6m" in code else None,
            source_reference_uuid=edition_source.uuid,
        )
        session.add(rule)
        rules[code] = rule

    profiles: dict[str, GuidelineProfile] = {}
    source_profiles: list[tuple[str, dict[str, Any]]] = []
    for species in ("dog", "cat"):
        species_payload = payload["species_data"].get(species)
        if not isinstance(species_payload, dict):
            errors.append(f"species_data.{species} is missing")
            continue
        for profile_payload in species_payload.get("nutrient_profiles", []):
            basis = profile_payload.get("basis", {})
            profile = GuidelineProfile(
                uuid=uuid6(),
                edition_uuid=edition.uuid,
                species_code=species,
                code=profile_payload["code"],
                name_ru=profile_payload.get("name_ru") or profile_payload["code"],
                physiological_state=profile_payload.get("physiological_state"),
                energy_basis_value=_decimal(basis.get("energy")) or Decimal("1000"),
                energy_basis_unit=basis.get("energy_unit", "kcal"),
                energy_basis_type=basis.get("energy_type", "metabolisable_energy"),
                calculation_basis=profile_payload.get(
                    "calculation_basis", "published_per_1000_kcal"
                ),
                clinician_selectable=profile_payload.get("clinician_selectable", True) is True,
                active=True,
            )
            session.add(profile)
            profiles[profile.code] = profile
            source_profiles.append((species, profile_payload))

    # UUIDs are assigned in Python; flush parent rows before adding children because
    # these deliberately lightweight models do not require ORM relationship loading.
    session.flush()

    seen_source_rows: set[tuple[str, str, str, str]] = set()
    for species, profile_payload in source_profiles:
        profile = profiles[profile_payload["code"]]
        source = profile_payload.get("source", {})
        if profile.calculation_basis == "daily_per_metabolic_bw" and (
            not source.get("page") or not source.get("table")
        ):
            errors.append(f"{profile.code} is missing VII-11 source page/table")
        target_basis = (
            "daily_per_metabolic_bw"
            if profile.calculation_basis == "daily_per_metabolic_bw"
            else "per_1000_kcal_me"
        )
        target_payloads = profile_payload.get("nutrients", [])
        if not isinstance(target_payloads, list):
            errors.append(f"{profile.code}/nutrients must be an array")
            continue
        for sort_order, value_payload in enumerate(target_payloads, start=1):
            if not isinstance(value_payload, dict):
                errors.append(f"{profile.code}/target[{sort_order}] is not an object")
                continue
            source_code = value_payload.get("code")
            if not isinstance(source_code, str) or not source_code:
                errors.append(f"{profile.code}/target[{sort_order}] has no nutrient code")
                continue
            unit = value_payload.get("unit")
            if unit not in ALLOWED_TARGET_UNITS:
                errors.append(f"{profile.code}/{source_code} has unknown unit {unit!r}")
                continue
            rule_code = value_payload.get("applicability_rule_code")
            applicability = {
                "feed_form_wet": "wet",
                "feed_form_dry": "dry",
            }.get(rule_code, rule_code or "all")
            row_key = (species, profile.code, source_code, applicability)
            if row_key in seen_source_rows:
                errors.append(f"Duplicate standard row: {'/'.join(row_key)}")
                continue
            seen_source_rows.add(row_key)
            if source_code == "Ca" and profile.code == "dog_late_growth":
                mapped_source_codes.add(source_code)
                for suffix, minimum, rule_code in (
                    ("weight_le_15", Decimal("2.0"), "dog_late_growth_weight_le_15"),
                    (
                        "weight_gt_15_age_lte_approx_6m",
                        Decimal("2.5"),
                        "dog_late_growth_weight_gt_15_age_lte_approx_6m",
                    ),
                    (
                        "weight_gt_15_age_gt_approx_6m",
                        Decimal("2.0"),
                        "dog_late_growth_weight_gt_15_age_gt_approx_6m",
                    ),
                ):
                    reference = _source_reference(
                        edition.uuid,
                        source.get("url", source_url),
                        page=source.get("page"),
                        table_code=source.get("table"),
                        row_code=f"Ca:{suffix}",
                        footnote=value_payload.get("footnote"),
                        source_value_text=value_payload.get("source_value_text"),
                        note_ru=" ".join(
                            item
                            for item in (value_payload.get("note_ru"), LATE_GROWTH_NOTE)
                            if item
                        ),
                        source_language=source.get("language", "en"),
                    )
                    session.add(reference)
                    session.flush()
                    session.add(
                        GuidelineTarget(
                            uuid=uuid6(),
                            edition_uuid=edition.uuid,
                            profile_uuid=profile.uuid,
                            nutrient_uuid=nutrients["Ca"].uuid,
                            derived_expression_uuid=None,
                            source_code="Ca",
                            target_status="established",
                            minimum_value=minimum,
                            maximum_value=None,
                            unit=value_payload["unit"],
                            basis=target_basis,
                            applicability_rule_uuid=rules[rule_code].uuid,
                            source_reference_uuid=reference.uuid,
                            source_value_text=value_payload.get("source_value_text"),
                            footnote=value_payload.get("footnote"),
                            note_ru=reference.note_ru,
                            sort_order=sort_order,
                        )
                    )
                continue

            nutrient_uuid = None
            derived_uuid = None
            if source_code in derived:
                derived_uuid = derived[source_code].uuid
                mapped_source_codes.add(source_code)
            else:
                canonical = nutrients.get(source_code)
                if canonical is None:
                    errors.append(f"{profile.code}/{source_code} has no canonical nutrient")
                    continue
                nutrient_uuid = canonical.uuid
                mapped_source_codes.add(source_code)
            established = value_payload.get("established") is True
            minimum = _decimal(value_payload.get("minimum"))
            if not established:
                if minimum is not None:
                    errors.append(
                        f"{profile.code}/{source_code} is not established but stores "
                        f"numeric minimum {minimum}; empty source cells must be null"
                    )
                minimum = None
            reference = _source_reference(
                edition.uuid,
                source.get("url", source_url),
                page=source.get("page"),
                table_code=source.get("table"),
                row_code=source_code,
                footnote=value_payload.get("footnote"),
                source_value_text=value_payload.get("source_value_text"),
                note_ru=value_payload.get("note_ru"),
                source_language=source.get("language", "en"),
            )
            session.add(reference)
            session.flush()
            if rule_code is not None and rule_code not in rules:
                errors.append(
                    f"{profile.code}/{source_code} references unknown applicability rule {rule_code}"
                )
                continue
            session.add(
                GuidelineTarget(
                    uuid=uuid6(),
                    edition_uuid=edition.uuid,
                    profile_uuid=profile.uuid,
                    nutrient_uuid=nutrient_uuid,
                    derived_expression_uuid=derived_uuid,
                    source_code=source_code,
                    target_status="established" if established else "not_established",
                    minimum_value=minimum,
                    maximum_value=None,
                    unit=value_payload["unit"],
                    basis=target_basis,
                    applicability_rule_uuid=rules[rule_code].uuid if rule_code else None,
                    source_reference_uuid=reference.uuid,
                    source_value_text=value_payload.get("source_value_text"),
                    footnote=value_payload.get("footnote"),
                    note_ru=value_payload.get("note_ru"),
                    sort_order=sort_order,
                )
            )

    for species in ("dog", "cat"):
        species_payload = payload["species_data"].get(species, {})
        for formula_payload in species_payload.get("energy_formulas", []):
            code = formula_payload.get("code", "unknown")
            try:
                formula_ast, range_ast = formula_asts(formula_payload)
            except (SyntaxError, ValueError) as exc:
                errors.append(f"Energy formula {species}/{code}: {exc}")
                continue
            reference = _source_reference(
                edition.uuid,
                formula_payload.get("source_url", source_url),
                page=formula_payload.get("page"),
                table_code=formula_payload.get("source_table"),
                row_code=code,
                note_ru=formula_payload.get("note_ru"),
            )
            session.add(reference)
            session.flush()
            applicability_uuid = None
            constraint_predicate = _formula_constraint_predicate(
                formula_payload.get("constraints")
            )
            if constraint_predicate is not None:
                rule = ApplicabilityRule(
                    uuid=uuid6(),
                    edition_uuid=edition.uuid,
                    code=f"energy_{species}_{code}",
                    name_ru=f"Применимость формулы: {formula_payload.get('name_ru', code)}",
                    predicate_json=constraint_predicate,
                    source_reference_uuid=reference.uuid,
                )
                session.add(rule)
                session.flush()
                rules[rule.code] = rule
                applicability_uuid = rule.uuid
            direct_expression = formula_payload.get("expression")
            result_kind = (
                "point"
                if isinstance(direct_expression, str) and direct_expression.strip()
                else "range"
            )
            session.add(
                EnergyFormula(
                    uuid=uuid6(),
                    edition_uuid=edition.uuid,
                    profile_uuid=None,
                    species_code=species,
                    code=code,
                    name_ru=formula_payload.get("name_ru") or code,
                    formula_ast=formula_ast,
                    range_ast=range_ast,
                    required_animal_fields=_required_animal_fields(formula_payload),
                    result_kind=result_kind,
                    allowed_weight_bases=_allowed_weight_bases(species, code, formula_payload),
                    result_unit=formula_payload["result_unit"],
                    applicability_rule_uuid=applicability_uuid,
                    source_reference_uuid=reference.uuid,
                    note_ru=formula_payload.get("note_ru"),
                    active=True,
                )
            )

        raw_size_classes = species_payload.get("size_classes", [])
        if isinstance(raw_size_classes, dict):
            raw_size_classes = raw_size_classes.get("items", [])
        if not isinstance(raw_size_classes, list):
            errors.append(f"species_data.{species}.size_classes is invalid")
            raw_size_classes = []
        for size_payload in raw_size_classes:
            weight = size_payload.get("expected_adult_weight_kg", {})
            ages = size_payload.get("growth_curve_age_weeks", {})
            try:
                curve_ast = _growth_curve_ast(size_payload.get("growth_curve_percent_expression"))
            except ValueError as exc:
                errors.append(f"Growth size class {size_payload.get('code')}: {exc}")
                curve_ast = None
            session.add(
                GrowthSizeClass(
                    uuid=uuid6(),
                    edition_uuid=edition.uuid,
                    species_code=species,
                    code=size_payload["code"],
                    name_ru=size_payload.get("name_ru") or size_payload["code"],
                    min_adult_weight_kg=_decimal(weight.get("min")),
                    max_adult_weight_kg=_decimal(weight.get("max")),
                    min_exclusive=weight.get("min_exclusive") is True,
                    max_inclusive=weight.get("max_inclusive", True) is True,
                    growth_curve_ast=curve_ast,
                    min_age_weeks=ages.get("min"),
                    max_age_weeks=ages.get("max"),
                    source_reference_uuid=edition_source.uuid,
                )
            )

        lactation = species_payload.get("lactation", {})
        lactation_source = _source_reference(
            edition.uuid,
            source_url,
            page=lactation.get("source_page"),
            section_code=f"{species}_lactation",
        )
        session.add(lactation_source)
        session.flush()
        for week, factor in lactation.get("week_factors", {}).items():
            session.add(
                LactationFactor(
                    uuid=uuid6(),
                    edition_uuid=edition.uuid,
                    species_code=species,
                    week=int(week),
                    factor=_decimal(factor),
                    source_reference_uuid=lactation_source.uuid,
                )
            )

    session.flush()
    catalog_nutrient_codes = {
        item["code"]
        for item in payload["catalogs"].get("nutrients", [])
        if isinstance(item, dict) and isinstance(item.get("code"), str)
    }
    source_target_codes = {
        item["code"]
        for _, profile_payload in source_profiles
        for item in profile_payload.get("nutrients", [])
        if isinstance(item, dict) and isinstance(item.get("code"), str)
    }
    semantic_errors, warnings = _semantic_validation(
        session,
        edition,
        source_target_codes,
        catalog_nutrient_codes,
        mapped_source_codes,
    )
    errors.extend(semantic_errors)
    errors.extend(_vii11_golden_validation(session, edition, golden_path))
    if not errors:
        edition.status = "validated"
        edition.validated_at = datetime.now(timezone.utc)
    session.commit()
    return _report(session, edition, warnings=warnings, errors=errors)


def _print_report(report: ImportReport) -> None:
    if report.unchanged:
        outcome = "unchanged draft (not successful)" if report.errors else "unchanged"
        print(
            f"FEDIAF edition {report.edition_code} import_version={report.import_version} "
            f"{outcome} ({report.source_checksum})"
        )
    print(f"Edition: FEDIAF {report.edition_code} v{report.import_version} [{report.status}]")
    print(f"Checksum: {report.source_checksum}")
    print(
        "Counts: "
        f"profiles={report.profiles}, targets={report.targets}, "
        f"energy_formulas={report.energy_formulas}, "
        f"derived_expressions={report.derived_expressions}, "
        f"applicability_rules={report.applicability_rules}, "
        f"growth_size_classes={report.growth_size_classes}, "
        f"lactation_factors={report.lactation_factors}"
    )
    for warning in report.warnings:
        print(f"WARNING: {warning}")
    for error in report.errors:
        print(f"ERROR: {error}")
    print(f"Warnings: {len(report.warnings)}")
    print(f"Errors: {len(report.errors)}")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Import the FEDIAF snapshot into PostgreSQL")
    parser.add_argument("--import-version", type=int, default=1)
    parser.add_argument("--source", type=Path, default=SOURCE_PATH)
    parser.add_argument("--schema", type=Path, default=SCHEMA_PATH)
    parser.add_argument("--golden", type=Path, default=GOLDEN_PATH)
    args = parser.parse_args()
    session = get_session_factory()()
    try:
        report = import_fediaf(
            session,
            source_path=args.source,
            schema_path=args.schema,
            golden_path=args.golden,
            import_version=args.import_version,
        )
    except Exception as exc:
        session.rollback()
        print(f"FEDIAF import failed: {exc}")
        raise SystemExit(1) from exc
    finally:
        session.close()
    _print_report(report)
    if report.errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
