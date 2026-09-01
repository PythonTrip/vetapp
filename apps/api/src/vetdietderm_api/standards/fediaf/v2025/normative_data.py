from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from types import MappingProxyType
from typing import Any

from vetdietderm_api.standards.fediaf.v2025.applicability import (
    LATE_GROWTH_NOTE,
    base_rules,
)
from vetdietderm_api.standards.fediaf.v2025.energy_formulas import build_formula
from vetdietderm_api.standards.fediaf.v2025.models import (
    DerivedExpression,
    Edition,
    GrowthSizeClass,
    GuidelineProfile,
    GuidelineTarget,
    Nutrient,
    StandardData,
)
from vetdietderm_api.standards.fediaf.v2025.sources import (
    profile_target_source,
    source_reference,
    stable_uuid,
)

DATA_PATH = Path(__file__).with_name("normative_data.json")

GRAM_TO_MILLIGRAM_MINERALS = frozenset({"Ca", "P", "Mg", "Na", "K", "Cl"})
MILLIGRAM_MINERALS = frozenset({"Fe", "Cu", "Zn", "Mn", "I"})
MICROGRAM_MINERALS = frozenset({"Se"})

DERIVED_DEFINITIONS: dict[str, dict[str, Any]] = {
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


def source_bytes() -> bytes:
    return DATA_PATH.read_bytes()


def source_checksum() -> str:
    return sha256(source_bytes()).hexdigest()


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Expected numeric or null value, received {value!r}")
    return Decimal(str(value))


def _canonical_nutrient_unit(code: str, category: str, source_unit: str) -> str:
    if category != "mineral":
        return source_unit
    if code in GRAM_TO_MILLIGRAM_MINERALS | MILLIGRAM_MINERALS:
        return "mg"
    if code in MICROGRAM_MINERALS:
        return "mcg"
    raise ValueError(f"Unsupported FEDIAF mineral {code!r}")


def _canonical_target_value(
    code: str,
    source_unit: str,
    value: Decimal | None,
) -> tuple[str, Decimal | None]:
    if code in GRAM_TO_MILLIGRAM_MINERALS:
        if source_unit != "g":
            raise ValueError(f"Expected {code} target in g, received {source_unit!r}")
        return "mg", value * 1000 if value is not None else None
    if code in MILLIGRAM_MINERALS:
        if source_unit != "mg":
            raise ValueError(f"Expected {code} target in mg, received {source_unit!r}")
        return "mg", value
    if code in MICROGRAM_MINERALS:
        if source_unit not in {"µg", "mcg"}:
            raise ValueError(f"Expected {code} target in µg, received {source_unit!r}")
        return "mcg", value
    return source_unit, value


def _growth_curve(expression: Any) -> dict[str, Any] | None:
    if not isinstance(expression, str) or not expression.strip():
        return None
    match = re.fullmatch(
        r"\s*(-?\d+(?:\.\d+)?)\s*\*\s*ln\(([A-Za-z_][A-Za-z0-9_]*)\)\s*([+-])\s*(\d+(?:\.\d+)?)\s*",
        expression,
    )
    if match is None:
        raise ValueError(f"Unsupported FEDIAF growth curve: {expression!r}")
    coefficient, field, sign, offset = match.groups()
    return {
        "kind": "logarithmic",
        "coefficient": float(Decimal(coefficient)),
        "field": field,
        "offset": float(Decimal(offset) * (-1 if sign == "-" else 1)),
    }


@lru_cache(maxsize=1)
def load_standard_data() -> StandardData:
    """Build the immutable FEDIAF 2025 working set once, without a DB session."""
    raw = source_bytes()
    payload = json.loads(raw.decode("utf-8"))
    metadata = payload["database_meta"]
    source_metadata = metadata["source"]
    source_url = source_metadata["url"]
    edition = Edition(
        uuid=stable_uuid("edition", metadata["version"]),
        code=metadata["version"],
        import_version=1,
        source_checksum=sha256(raw).hexdigest(),
        source_title=source_metadata["title"],
        source_url=source_url,
        publication_date=source_metadata.get("publication_date"),
        language=metadata.get("language", "ru"),
        clinical_warning_ru=metadata["clinical_warning_ru"],
        published_at=datetime(2025, 9, 1, tzinfo=timezone.utc),
    )

    edition_source = source_reference("edition", source_url)
    sources = {edition_source.uuid: edition_source}
    rules_by_code = base_rules(edition_source.uuid)

    nutrients_by_code: dict[str, Nutrient] = {}
    for item in payload["catalogs"]["nutrients"]:
        code = item["code"]
        category = item["category_code"]
        nutrient = Nutrient(
            uuid=stable_uuid("nutrient", code),
            code=code,
            name=item.get("name_ru") or code,
            category=category,
            base_unit=_canonical_nutrient_unit(
                code,
                category,
                item["unit_per_1000_kcal_me"],
            ),
        )
        nutrients_by_code[nutrient.code] = nutrient

    derived_by_code: dict[str, DerivedExpression] = {}
    for code, definition in DERIVED_DEFINITIONS.items():
        expression = DerivedExpression(
            uuid=stable_uuid("derived", code),
            code=code,
            name_ru=definition["name_ru"],
            result_unit=definition["unit"],
            expression_type=definition["type"],
            ast_json=definition["ast"],
        )
        derived_by_code[code] = expression

    profiles: dict[str, GuidelineProfile] = {}
    targets: list[GuidelineTarget] = []
    formulas = {}
    size_classes = {}
    lactation_factors: dict[tuple[str, int], float] = {}

    for species in ("dog", "cat"):
        species_payload = payload["species_data"][species]
        for profile_payload in species_payload["nutrient_profiles"]:
            basis = profile_payload.get("basis", {})
            profile = GuidelineProfile(
                uuid=stable_uuid("profile", profile_payload["code"]),
                species_code=species,
                code=profile_payload["code"],
                name_ru=profile_payload.get("name_ru") or profile_payload["code"],
                physiological_state=profile_payload.get("physiological_state"),
                energy_basis_value=_decimal(basis.get("energy")) or Decimal("1000"),
                energy_basis_unit=basis.get("energy_unit", "kcal"),
                energy_basis_type=basis.get("energy_type", "metabolisable_energy"),
                calculation_basis=profile_payload.get("calculation_basis", "published_per_1000_kcal"),
                clinician_selectable=profile_payload.get("clinician_selectable", True) is True,
            )
            profiles[profile.code] = profile
            profile_source = profile_payload.get("source", {})
            target_basis = (
                "daily_per_metabolic_bw"
                if profile.calculation_basis == "daily_per_metabolic_bw"
                else "per_1000_kcal_me"
            )
            for sort_order, target_payload in enumerate(profile_payload.get("nutrients", []), start=1):
                code = target_payload["code"]
                if code == "Ca" and profile.code == "dog_late_growth":
                    split_targets = (
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
                    )
                    for suffix, minimum, rule_code in split_targets:
                        canonical_unit, canonical_minimum = _canonical_target_value(
                            code,
                            target_payload["unit"],
                            minimum,
                        )
                        note = " ".join(
                            item for item in (target_payload.get("note_ru"), LATE_GROWTH_NOTE) if item
                        )
                        reference = profile_target_source(
                            species,
                            profile.code,
                            sort_order,
                            target_payload,
                            profile_source,
                            source_url,
                            identity_suffix=suffix,
                            note_ru=note,
                        )
                        sources[reference.uuid] = reference
                        targets.append(
                            GuidelineTarget(
                                uuid=stable_uuid("target", f"{profile.code}:{sort_order}:{code}:{suffix}"),
                                profile_uuid=profile.uuid,
                                nutrient_uuid=nutrients_by_code[code].uuid,
                                derived_expression_uuid=None,
                                source_code=code,
                                target_status="established",
                                minimum_value=canonical_minimum,
                                maximum_value=None,
                                unit=canonical_unit,
                                basis=target_basis,
                                applicability_rule_uuid=rules_by_code[rule_code].uuid,
                                source_reference_uuid=reference.uuid,
                                source_value_text=target_payload.get("source_value_text"),
                                footnote=target_payload.get("footnote"),
                                note_ru=note,
                                sort_order=sort_order,
                            )
                        )
                    continue

                reference = profile_target_source(
                    species,
                    profile.code,
                    sort_order,
                    target_payload,
                    profile_source,
                    source_url,
                    identity_suffix=target_payload.get("applicability_rule_code") or "all",
                )
                sources[reference.uuid] = reference
                derived = derived_by_code.get(code)
                nutrient = nutrients_by_code.get(code)
                if derived is None and nutrient is None:
                    raise ValueError(f"FEDIAF target references unknown nutrient {code!r}")
                established = target_payload.get("established") is True
                rule_code = target_payload.get("applicability_rule_code")
                canonical_unit, canonical_minimum = _canonical_target_value(
                    code,
                    target_payload["unit"],
                    _decimal(target_payload.get("minimum")) if established else None,
                )
                targets.append(
                    GuidelineTarget(
                        uuid=stable_uuid(
                            "target",
                            f"{profile.code}:{sort_order}:{code}:{rule_code or 'all'}",
                        ),
                        profile_uuid=profile.uuid,
                        nutrient_uuid=nutrient.uuid if nutrient else None,
                        derived_expression_uuid=derived.uuid if derived else None,
                        source_code=code,
                        target_status="established" if established else "not_established",
                        minimum_value=canonical_minimum,
                        maximum_value=None,
                        unit=canonical_unit,
                        basis=target_basis,
                        applicability_rule_uuid=rules_by_code[rule_code].uuid if rule_code else None,
                        source_reference_uuid=reference.uuid,
                        source_value_text=target_payload.get("source_value_text"),
                        footnote=target_payload.get("footnote"),
                        note_ru=target_payload.get("note_ru"),
                        sort_order=sort_order,
                    )
                )

        for formula_payload in species_payload.get("energy_formulas", []):
            formula, reference, formula_rule = build_formula(species, formula_payload, source_url)
            formulas[formula.code] = formula
            sources[reference.uuid] = reference
            if formula_rule is not None:
                rules_by_code[formula_rule.code] = formula_rule

        raw_size_classes = species_payload.get("size_classes", [])
        if isinstance(raw_size_classes, dict):
            raw_size_classes = raw_size_classes.get("items", [])
        for item in raw_size_classes:
            weight = item.get("expected_adult_weight_kg", {})
            ages = item.get("growth_curve_age_weeks", {})
            size_class = GrowthSizeClass(
                uuid=stable_uuid("size", f"{species}:{item['code']}"),
                species_code=species,
                code=item["code"],
                name_ru=item.get("name_ru") or item["code"],
                min_adult_weight_kg=_decimal(weight.get("min")),
                max_adult_weight_kg=_decimal(weight.get("max")),
                min_exclusive=weight.get("min_exclusive") is True,
                max_inclusive=weight.get("max_inclusive", True) is True,
                growth_curve_ast=_growth_curve(item.get("growth_curve_percent_expression")),
                min_age_weeks=ages.get("min"),
                max_age_weeks=ages.get("max"),
                source_reference_uuid=edition_source.uuid,
            )
            size_classes[size_class.code] = size_class

        lactation = species_payload.get("lactation", {})
        lactation_source = source_reference(
            f"lactation:{species}",
            source_url,
            page=lactation.get("source_page"),
            section_code=f"{species}_lactation",
        )
        sources[lactation_source.uuid] = lactation_source
        for week, factor in lactation.get("week_factors", {}).items():
            lactation_factors[(species, int(week))] = float(factor)

    rules = {item.uuid: item for item in rules_by_code.values()}
    derived = {item.uuid: item for item in derived_by_code.values()}
    nutrients = {item.uuid: item for item in nutrients_by_code.values()}
    targets.sort(key=lambda item: (item.sort_order, item.source_code, str(item.uuid)))
    return StandardData(
        edition=edition,
        profiles=MappingProxyType(profiles),
        formulas=MappingProxyType(formulas),
        size_classes=MappingProxyType(size_classes),
        targets=tuple(targets),
        derived=MappingProxyType(derived),
        nutrients=MappingProxyType(nutrients),
        nutrients_by_code=MappingProxyType(nutrients_by_code),
        rules=MappingProxyType(rules),
        sources=MappingProxyType(sources),
        groups=MappingProxyType({
            "OMEGA_3": ("ALA", "EPA", "DHA"),
            "OMEGA_6": ("LA", "AA"),
        }),
        lactation_factors=MappingProxyType(lactation_factors),
    )
