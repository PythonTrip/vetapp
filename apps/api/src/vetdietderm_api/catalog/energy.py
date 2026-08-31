"""Canonical food metabolizable energy: kcal/100 g as fed.

Assessment scales stored ME with ``grams / 100``. Daily RER/MER formulas are
a separate animal-requirement module and must not use these helpers.

``species`` is accepted so NRC predictive and natural-product Atwater equations
can be added later without changing the stored unit.
"""

from decimal import Decimal
from enum import StrEnum

ME_CODE = "ME"
ME_BASIS = "per_100g_as_fed"
ME_UNIT = "kcal/100g"
MAX_ME_KCAL_PER_100G = Decimal("1000")
LEGACY_KCAL_PER_KG_THRESHOLD = MAX_ME_KCAL_PER_100G


class FoodEnergySpecies(StrEnum):
    dog = "dog"
    cat = "cat"


class FoodEnergyMethod(StrEnum):
    modified_atwater = "modified_atwater"


def calculate_me_modified_atwater(
    protein: Decimal | None,
    fat: Decimal | None,
    carbohydrates: Decimal | None,
    *,
    species: FoodEnergySpecies | str | None = None,
) -> Decimal | None:
    """Return Modified Atwater ME in kcal/100 g as fed.

    ``species`` is reserved for later dog/cat equations; this method does not
    use it.
    """
    del species
    if protein is None or fat is None or carbohydrates is None:
        return None

    return (
        protein * Decimal("3.5")
        + fat * Decimal("8.5")
        + carbohydrates * Decimal("3.5")
    )


def calculate_food_me(
    protein: Decimal | None,
    fat: Decimal | None,
    carbohydrates: Decimal | None,
    *,
    species: FoodEnergySpecies | str | None = None,
    method: FoodEnergyMethod = FoodEnergyMethod.modified_atwater,
) -> Decimal | None:
    if method is not FoodEnergyMethod.modified_atwater:
        raise ValueError(f"Unsupported food energy method: {method}")
    return calculate_me_modified_atwater(
        protein,
        fat,
        carbohydrates,
        species=species,
    )


def is_plausible_me_kcal_per_100g(value: Decimal) -> bool:
    return Decimal("0") <= value <= MAX_ME_KCAL_PER_100G


def validate_me_kcal_per_100g(value: Decimal) -> Decimal:
    if not is_plausible_me_kcal_per_100g(value):
        raise ValueError(
            "ME must be kcal/100 g as fed and stay within 0–1000."
        )
    return value


def legacy_kcal_per_kg_to_kcal_per_100g(value: Decimal) -> Decimal:
    return value / Decimal("10")


def canonicalize_imported_me(
    value: Decimal | None,
    *,
    protein: Decimal | None = None,
    fat: Decimal | None = None,
    carbohydrates: Decimal | None = None,
    species: FoodEnergySpecies | str | None = None,
) -> Decimal | None:
    calculated = calculate_food_me(
        protein,
        fat,
        carbohydrates,
        species=species,
    )
    if calculated is not None:
        return validate_me_kcal_per_100g(calculated)

    if value is None:
        return None

    canonical = value
    if abs(canonical) > LEGACY_KCAL_PER_KG_THRESHOLD:
        canonical = legacy_kcal_per_kg_to_kcal_per_100g(canonical)
    if not is_plausible_me_kcal_per_100g(canonical):
        return None
    return canonical
