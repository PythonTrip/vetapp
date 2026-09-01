"""Resolve food metabolizable energy in kcal/100 g as fed.

Declared product energy always wins. Calculated energy is deliberately resolved
against a species at assessment time and must not be persisted as a single food
nutrient value.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import Any, Protocol

ME_CODE = "ME"
ME_BASIS = "per_100g_as_fed"
ME_UNIT = "kcal/100g"
MAX_ME_KCAL_PER_100G = Decimal("1000")
LEGACY_KCAL_PER_KG_THRESHOLD = MAX_ME_KCAL_PER_100G

_PROXIMATE_CODES = ("CP", "CFa", "CFi", "CAs", "MO")


class FoodEnergySpecies(StrEnum):
    dog = "dog"
    cat = "cat"


class FoodEnergySource(StrEnum):
    declared = "declared"
    calculated = "calculated"


class FoodEnergyMethod(StrEnum):
    declared = "declared"
    fediaf_nrc_predictive = "fediaf_nrc_predictive"
    fediaf_natural = "fediaf_natural"
    # Kept for callers of the pre-resolver compatibility helper below.
    modified_atwater = "modified_atwater"


@dataclass(frozen=True)
class MECalculation:
    value: Decimal | None
    unit: str
    source: FoodEnergySource
    method: FoodEnergyMethod


class FoodEnergyProduct(Protocol):
    type: str
    values: Mapping[str, Any]


def _decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return result if result.is_finite() else None


def _product_attribute(product: FoodEnergyProduct | Mapping[str, Any], name: str) -> Any:
    if isinstance(product, Mapping):
        return product.get(name)
    return getattr(product, name, None)


def _known_nutrient(
    product: FoodEnergyProduct | Mapping[str, Any],
    code: str,
) -> Decimal | None:
    values = _product_attribute(product, "values")
    item: Any = None
    if isinstance(values, Mapping):
        item = values.get(code)
    else:
        nutrient_values = _product_attribute(product, "nutrient_values")
        if nutrient_values is not None:
            for candidate in nutrient_values:
                candidate_code = (
                    candidate.get("code")
                    if isinstance(candidate, Mapping)
                    else getattr(candidate, "code", None)
                )
                if candidate_code is None and not isinstance(candidate, Mapping):
                    candidate_code = getattr(getattr(candidate, "nutrient", None), "code", None)
                candidate_basis = (
                    candidate.get("basis")
                    if isinstance(candidate, Mapping)
                    else getattr(candidate, "basis", ME_BASIS)
                )
                if candidate_code == code and candidate_basis == ME_BASIS:
                    item = candidate
                    break
    if isinstance(item, Mapping):
        status = item.get("value_status")
        raw_value = item.get("value")
    else:
        status = getattr(item, "value_status", None)
        raw_value = getattr(item, "value", item)
    if status == "unknown":
        return None
    return _decimal(raw_value)


def _proximate_values(
    product: FoodEnergyProduct | Mapping[str, Any],
) -> dict[str, Decimal] | None:
    values = {code: _known_nutrient(product, code) for code in _PROXIMATE_CODES}
    if any(value is None for value in values.values()):
        return None
    complete = {code: value for code, value in values.items() if value is not None}
    if any(value < 0 or value > 100 for value in complete.values()):
        return None
    return complete


def calculate_nfe(
    protein: Decimal,
    fat: Decimal,
    crude_fiber: Decimal,
    ash: Decimal,
    moisture: Decimal,
) -> Decimal | None:
    try:
        valid = all(
            value.is_finite() and Decimal("0") <= value <= Decimal("100")
            for value in (protein, fat, crude_fiber, ash, moisture)
        )
    except (AttributeError, InvalidOperation):
        return None
    if not valid:
        return None
    nfe = Decimal("100") - protein - fat - crude_fiber - ash - moisture
    return nfe if Decimal("0") <= nfe <= Decimal("100") else None


def calculate_me_fediaf_nrc_predictive(
    protein: Decimal,
    fat: Decimal,
    crude_fiber: Decimal,
    ash: Decimal,
    moisture: Decimal,
    *,
    species: FoodEnergySpecies | str,
) -> Decimal | None:
    """FEDIAF/NRC four-step predictive ME for prepared pet food."""
    resolved_species = FoodEnergySpecies(species)
    nfe = calculate_nfe(protein, fat, crude_fiber, ash, moisture)
    dry_matter = Decimal("100") - moisture
    if nfe is None or dry_matter <= 0:
        return None

    crude_fiber_dm = crude_fiber / dry_matter * Decimal("100")
    gross_energy = (
        Decimal("5.7") * protein
        + Decimal("9.4") * fat
        + Decimal("4.1") * (nfe + crude_fiber)
    )
    if resolved_species is FoodEnergySpecies.dog:
        digestibility = Decimal("91.2") - Decimal("1.43") * crude_fiber_dm
        urinary_loss = Decimal("1.04") * protein
    else:
        digestibility = Decimal("87.9") - Decimal("0.88") * crude_fiber_dm
        urinary_loss = Decimal("0.77") * protein
    if digestibility <= 0:
        return None

    result = gross_energy * digestibility / Decimal("100") - urinary_loss
    return result if is_plausible_me_kcal_per_100g(result) else None


def calculate_me_fediaf_natural(
    protein: Decimal,
    fat: Decimal,
    crude_fiber: Decimal,
    ash: Decimal,
    moisture: Decimal,
    *,
    species: FoodEnergySpecies | str,
) -> Decimal | None:
    """Simplified FEDIAF ME for natural foods, in kcal/100 g as fed."""
    resolved_species = FoodEnergySpecies(species)
    nfe = calculate_nfe(protein, fat, crude_fiber, ash, moisture)
    if nfe is None:
        return None
    fat_factor = Decimal("9") if resolved_species is FoodEnergySpecies.dog else Decimal("8.5")
    result = Decimal("4") * protein + fat_factor * fat + Decimal("4") * nfe
    return result if is_plausible_me_kcal_per_100g(result) else None


def resolve_me(
    product: FoodEnergyProduct | Mapping[str, Any],
    species: FoodEnergySpecies | str,
) -> MECalculation:
    """Resolve declared or species-specific calculated food ME without persistence."""
    declared = _known_nutrient(product, ME_CODE)
    if declared is not None and is_plausible_me_kcal_per_100g(declared):
        return MECalculation(
            value=declared,
            unit=ME_UNIT,
            source=FoodEnergySource.declared,
            method=FoodEnergyMethod.declared,
        )

    food_type = _product_attribute(product, "type")
    food_type = getattr(food_type, "value", food_type)
    if food_type == "commercial":
        method = FoodEnergyMethod.fediaf_nrc_predictive
    elif food_type == "ingredient":
        method = FoodEnergyMethod.fediaf_natural
    else:
        # FEDIAF equations selected by this resolver do not define a fallback
        # for supplements or unknown product types.
        return MECalculation(
            value=None,
            unit=ME_UNIT,
            source=FoodEnergySource.calculated,
            method=FoodEnergyMethod.fediaf_natural,
        )
    proximate = _proximate_values(product)
    value: Decimal | None = None
    if proximate is not None:
        calculator = (
            calculate_me_fediaf_nrc_predictive
            if method is FoodEnergyMethod.fediaf_nrc_predictive
            else calculate_me_fediaf_natural
        )
        value = calculator(
            proximate["CP"],
            proximate["CFa"],
            proximate["CFi"],
            proximate["CAs"],
            proximate["MO"],
            species=species,
        )
    return MECalculation(
        value=value,
        unit=ME_UNIT,
        source=FoodEnergySource.calculated,
        method=method,
    )


def calculate_me_modified_atwater(
    protein: Decimal | None,
    fat: Decimal | None,
    carbohydrates: Decimal | None,
    *,
    species: FoodEnergySpecies | str | None = None,
) -> Decimal | None:
    """Compatibility helper; new fallback calculations use :func:`resolve_me`."""
    del species
    if protein is None or fat is None or carbohydrates is None:
        return None
    return protein * Decimal("3.5") + fat * Decimal("8.5") + carbohydrates * Decimal("3.5")


def calculate_food_me(
    protein: Decimal | None,
    fat: Decimal | None,
    carbohydrates: Decimal | None,
    *,
    species: FoodEnergySpecies | str | None = None,
    method: FoodEnergyMethod = FoodEnergyMethod.modified_atwater,
) -> Decimal | None:
    if method is not FoodEnergyMethod.modified_atwater:
        raise ValueError(f"Unsupported legacy food energy method: {method}")
    return calculate_me_modified_atwater(protein, fat, carbohydrates, species=species)


def is_plausible_me_kcal_per_100g(value: Decimal) -> bool:
    try:
        return value.is_finite() and Decimal("0") <= value <= MAX_ME_KCAL_PER_100G
    except (AttributeError, InvalidOperation):
        return False


def validate_me_kcal_per_100g(value: Decimal) -> Decimal:
    if not is_plausible_me_kcal_per_100g(value):
        raise ValueError("ME must be kcal/100 g as fed and stay within 0-1000.")
    return value


def legacy_kcal_per_kg_to_kcal_per_100g(value: Decimal) -> Decimal:
    return value / Decimal("10")


def canonicalize_imported_me(
    value: Decimal | None,
    **_legacy_macronutrients: Any,
) -> Decimal | None:
    """Canonicalize declared import ME; never synthesize a persisted fallback."""
    if value is None:
        return None
    if not value.is_finite():
        return None
    canonical = value
    if abs(canonical) > LEGACY_KCAL_PER_KG_THRESHOLD:
        canonical = legacy_kcal_per_kg_to_kcal_per_100g(canonical)
    return canonical if is_plausible_me_kcal_per_100g(canonical) else None
