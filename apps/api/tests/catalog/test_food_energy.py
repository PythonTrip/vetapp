from decimal import Decimal

import pytest
from pydantic import ValidationError

from vetdietderm_api.catalog.energy import (
    ME_UNIT,
    MAX_ME_KCAL_PER_100G,
    FoodEnergyMethod,
    FoodEnergySource,
    calculate_food_me,
    calculate_me_fediaf_natural,
    calculate_me_fediaf_nrc_predictive,
    calculate_me_modified_atwater,
    canonicalize_imported_me,
    is_plausible_me_kcal_per_100g,
    legacy_kcal_per_kg_to_kcal_per_100g,
    resolve_me,
    validate_me_kcal_per_100g,
)
from vetdietderm_api.catalog.schemas import FoodNutrientValueWrite, NutrientValueStatus
from vetdietderm_api.standards.contract import FoodValue


def _product(food_type: str, **values: Decimal | None) -> dict:
    return {
        "type": food_type,
        "values": {
            code: FoodValue(
                value=float(value) if value is not None else None,
                value_status="measured" if value is not None else "unknown",
            )
            for code, value in values.items()
        },
    }


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


def test_canonicalize_preserves_declared_me_instead_of_recalculating() -> None:
    canonical = canonicalize_imported_me(
        Decimal("3585"),
        protein=Decimal("25"),
        fat=Decimal("15"),
        carbohydrates=Decimal("40"),
    )
    assert canonical == Decimal("358.5")


def test_canonicalize_does_not_synthesize_persisted_me() -> None:
    assert canonicalize_imported_me(
        None,
        protein=Decimal("25"),
        fat=Decimal("15"),
        carbohydrates=Decimal("40"),
    ) is None


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


def test_resolve_me_prefers_valid_declared_value() -> None:
    product = _product(
        "commercial",
        ME=Decimal("380"),
        CP=Decimal("25"),
        CFa=Decimal("15"),
        CFi=Decimal("3"),
        CAs=Decimal("7"),
        MO=Decimal("10"),
    )

    dog = resolve_me(product, "dog")
    cat = resolve_me(product, "cat")

    assert dog == cat
    assert dog.value == Decimal("380.0")
    assert dog.unit == ME_UNIT
    assert dog.source is FoodEnergySource.declared
    assert dog.method is FoodEnergyMethod.declared


def test_resolve_me_accepts_catalog_nutrient_value_shape() -> None:
    result = resolve_me(
        {
            "type": "ingredient",
            "nutrient_values": [
                {
                    "code": code,
                    "value": float(value),
                    "value_status": "measured",
                    "basis": "per_100g_as_fed",
                }
                for code, value in {
                    "CP": Decimal("25"),
                    "CFa": Decimal("15"),
                    "CFi": Decimal("3"),
                    "CAs": Decimal("7"),
                    "MO": Decimal("10"),
                }.items()
            ],
        },
        "dog",
    )

    assert result.value == Decimal("395.0")
    assert result.method is FoodEnergyMethod.fediaf_natural


def test_commercial_fallback_uses_fediaf_nrc_predictive_equation() -> None:
    product = _product(
        "commercial",
        CP=Decimal("25"),
        CFa=Decimal("15"),
        CFi=Decimal("3"),
        CAs=Decimal("7"),
        MO=Decimal("10"),
    )
    nfe = Decimal("40")
    fiber_dm = Decimal("3") / Decimal("90") * Decimal("100")
    ge = Decimal("5.7") * 25 + Decimal("9.4") * 15 + Decimal("4.1") * (nfe + 3)
    expected_dog = ge * (Decimal("91.2") - Decimal("1.43") * fiber_dm) / 100 - Decimal("1.04") * 25
    expected_cat = ge * (Decimal("87.9") - Decimal("0.88") * fiber_dm) / 100 - Decimal("0.77") * 25

    dog = resolve_me(product, "dog")
    cat = resolve_me(product, "cat")

    assert dog.value == expected_dog
    assert cat.value == expected_cat
    assert dog.source is FoodEnergySource.calculated
    assert dog.method is FoodEnergyMethod.fediaf_nrc_predictive
    assert cat.method is FoodEnergyMethod.fediaf_nrc_predictive
    assert calculate_me_fediaf_nrc_predictive(
        Decimal("25"), Decimal("15"), Decimal("3"), Decimal("7"), Decimal("10"), species="dog"
    ) == expected_dog


def test_natural_fallback_is_species_specific() -> None:
    product = _product(
        "ingredient",
        CP=Decimal("25"),
        CFa=Decimal("15"),
        CFi=Decimal("3"),
        CAs=Decimal("7"),
        MO=Decimal("10"),
    )

    dog = resolve_me(product, "dog")
    cat = resolve_me(product, "cat")

    assert dog.value == Decimal("395.0")
    assert cat.value == Decimal("387.50")
    assert dog.method is FoodEnergyMethod.fediaf_natural
    assert cat.method is FoodEnergyMethod.fediaf_natural
    assert calculate_me_fediaf_natural(
        Decimal("25"), Decimal("15"), Decimal("3"), Decimal("7"), Decimal("10"), species="cat"
    ) == Decimal("387.5")


@pytest.mark.parametrize("missing_code", ["CP", "CFa", "CFi", "CAs", "MO"])
def test_missing_required_proximate_returns_null(missing_code: str) -> None:
    values = {
        "CP": Decimal("25"),
        "CFa": Decimal("15"),
        "CFi": Decimal("3"),
        "CAs": Decimal("7"),
        "MO": Decimal("10"),
    }
    values[missing_code] = None

    result = resolve_me(_product("ingredient", **values), "dog")

    assert result.value is None
    assert result.source is FoodEnergySource.calculated
    assert result.method is FoodEnergyMethod.fediaf_natural


def test_invalid_declared_me_falls_back_but_invalid_proximates_do_not() -> None:
    calculated = resolve_me(
        _product(
            "commercial",
            ME=Decimal("3500"),
            CP=Decimal("25"),
            CFa=Decimal("15"),
            CFi=Decimal("3"),
            CAs=Decimal("7"),
            MO=Decimal("10"),
        ),
        "dog",
    )
    invalid_proximates = resolve_me(
        _product(
            "ingredient",
            CP=Decimal("60"),
            CFa=Decimal("30"),
            CFi=Decimal("20"),
            CAs=Decimal("10"),
            MO=Decimal("10"),
        ),
        "dog",
    )

    assert calculated.value is not None
    assert calculated.source is FoodEnergySource.calculated
    assert invalid_proximates.value is None


def test_supplement_without_declared_me_is_not_assumed_to_be_natural_food() -> None:
    result = resolve_me(
        _product(
            "supplement",
            CP=Decimal("25"),
            CFa=Decimal("15"),
            CFi=Decimal("3"),
            CAs=Decimal("7"),
            MO=Decimal("10"),
        ),
        "dog",
    )

    assert result.value is None
