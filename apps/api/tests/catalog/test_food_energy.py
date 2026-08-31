from decimal import Decimal

import pytest
from pydantic import ValidationError

from vetdietderm_api.catalog.energy import (
    MAX_ME_KCAL_PER_100G,
    calculate_food_me,
    calculate_me_modified_atwater,
    canonicalize_imported_me,
    is_plausible_me_kcal_per_100g,
    legacy_kcal_per_kg_to_kcal_per_100g,
    validate_me_kcal_per_100g,
)
from vetdietderm_api.catalog.schemas import FoodNutrientValueWrite, NutrientValueStatus


def test_modified_atwater_returns_kcal_per_100g_not_kcal_per_kg() -> None:
    me = calculate_me_modified_atwater(
        Decimal("25"),
        Decimal("15"),
        Decimal("40"),
    )
    assert me == Decimal("355.0")
    assert me != Decimal("3550")


def test_food_me_dispatcher_keeps_species_hook_without_changing_modified_atwater() -> None:
    dog = calculate_food_me(
        Decimal("25"),
        Decimal("15"),
        Decimal("40"),
        species="dog",
    )
    cat = calculate_food_me(
        Decimal("25"),
        Decimal("15"),
        Decimal("40"),
        species="cat",
    )
    assert dog == cat == Decimal("355.0")


@pytest.mark.parametrize(
    "value",
    [Decimal("3000"), Decimal("3500"), Decimal("4500"), Decimal("3585")],
)
def test_kcal_per_kg_values_are_not_plausible_as_kcal_per_100g(value: Decimal) -> None:
    assert is_plausible_me_kcal_per_100g(value) is False
    with pytest.raises(ValueError, match="kcal/100 g"):
        validate_me_kcal_per_100g(value)


@pytest.mark.parametrize(
    "value",
    [Decimal("0"), Decimal("89.5"), Decimal("355"), Decimal("850"), MAX_ME_KCAL_PER_100G],
)
def test_canonical_kcal_per_100g_values_are_accepted(value: Decimal) -> None:
    assert validate_me_kcal_per_100g(value) == value


def test_legacy_kcal_per_kg_divides_by_ten() -> None:
    assert legacy_kcal_per_kg_to_kcal_per_100g(Decimal("3585")) == Decimal("358.5")
    assert legacy_kcal_per_kg_to_kcal_per_100g(Decimal("895")) == Decimal("89.5")


def test_canonicalize_prefers_recalculated_modified_atwater() -> None:
    canonical = canonicalize_imported_me(
        Decimal("3585"),
        protein=Decimal("25"),
        fat=Decimal("15"),
        carbohydrates=Decimal("40"),
    )
    assert canonical == Decimal("355.0")


def test_canonicalize_converts_legacy_kcal_per_kg_without_macros() -> None:
    assert canonicalize_imported_me(Decimal("3585")) == Decimal("358.5")
    assert canonicalize_imported_me(Decimal("89.5")) == Decimal("89.5")
    assert canonicalize_imported_me(Decimal("-30980")) is None


def test_write_schema_rejects_kcal_per_kg_me() -> None:
    with pytest.raises(ValidationError, match="kcal/100 g"):
        FoodNutrientValueWrite(
            code="ME",
            value=Decimal("3500"),
            value_status=NutrientValueStatus.measured,
        )


def test_write_schema_accepts_kcal_per_100g_me() -> None:
    payload = FoodNutrientValueWrite(
        code="ME",
        value=Decimal("355"),
        value_status=NutrientValueStatus.measured,
    )
    assert payload.value == Decimal("355")
    assert payload.basis == "per_100g_as_fed"


def test_assessment_energy_uses_grams_over_100() -> None:
    me_kcal_per_100g = Decimal("355")
    grams = Decimal("200")
    daily_kcal = me_kcal_per_100g * grams / Decimal("100")
    assert daily_kcal == Decimal("710")
