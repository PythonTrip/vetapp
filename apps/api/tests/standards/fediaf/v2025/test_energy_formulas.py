import pytest

from vetdietderm_api.assessments.schemas import (
    AnimalProfile,
    EnergyEstimateRequest,
    EnergyPointValue,
    EnergyRangeValue,
)
from vetdietderm_api.patients.schemas import Species
from vetdietderm_api.standards.fediaf.v2025 import provider


def test_dog_low_activity_formula_matches_published_expression() -> None:
    request = EnergyEstimateRequest(
        animal=AnimalProfile(
            species=Species.dog,
            current_body_weight_kg=10,
            activity="low",
        )
    )
    result = provider.estimate_energy(request)

    assert result.energy_formula_code == "activity_low"
    assert isinstance(result.value, EnergyPointValue)
    assert result.value.kcal_day == pytest.approx(95 * 10**0.75)
    assert result.missing_fields == []


def test_cat_indoor_formula_preserves_published_range() -> None:
    request = EnergyEstimateRequest(
        animal=AnimalProfile(
            species=Species.cat,
            current_body_weight_kg=4,
            neutered=True,
        )
    )
    result = provider.estimate_energy(request)

    assert result.energy_formula_code == "adult_indoor_neutered"
    assert isinstance(result.value, EnergyRangeValue)
    assert result.value.min_kcal_day == pytest.approx(52 * 4**0.67)
    assert result.value.max_kcal_day == pytest.approx(75 * 4**0.67)
    assert result.reference_energy_kcal == pytest.approx(
        (result.value.min_kcal_day + result.value.max_kcal_day) / 2
    )


def test_puppy_formula_reports_missing_mature_weight() -> None:
    result = provider.estimate_energy(
        EnergyEstimateRequest(
            animal=AnimalProfile(
                species=Species.dog,
                current_body_weight_kg=5,
                age_months=4,
                life_stage="puppy_kitten",
            )
        )
    )

    assert result.energy_formula_code == "puppy_8w_1y"
    assert result.value is None
    assert result.missing_fields == ["expected_mature_weight_kg"]
