from uuid import uuid4

import pytest
from fastapi import HTTPException

from vetdietderm_api.assessments.schemas import AssessmentRequest
from vetdietderm_api.standards.contract import FoodSnapshot, FoodValue
from vetdietderm_api.standards.fediaf.v2025 import provider


@pytest.fixture
def evaluate():
    key = uuid4()
    food = FoodSnapshot(key, "Food", "commercial", "dry", {"ME": FoodValue(300, "measured")})

    def run(profile=None):
        request = AssessmentRequest.model_validate({
            "animal": {"species": "dog", "current_body_weight_kg": 5, "age_months": 26},
            "profile_mode": "manual",
            "components": [{"food_uuid": key, "grams": 100}],
            "profile_selection": ({
                "standard_code": "fediaf", "edition": "2025.09",
                "source": "manual", "profile_code": profile,
            } if profile else None),
        })
        return provider.assess(request, {key: food})

    return run


def test_manual_mode_without_confirmation_returns_energy_only(evaluate):
    result = evaluate()
    assert not result.normative_comparison_performed
    assert not result.rows
    assert result.ration_energy.total_kcal_day == 300


def test_manual_alternative_does_not_change_energy(evaluate):
    result = evaluate("dog_adult_mer95")
    assert result.context.nutrient_profile_code == "dog_adult_mer95"
    assert result.context.profile_compatibility.level == "soft"
    assert result.energy == evaluate("dog_adult_mer110").energy
    assert result.input_hash != evaluate("dog_adult_mer110").input_hash
    assert result.energy.energy_formula_code == "adult_age_1_2"
    assert result.energy.working_energy_kcal == pytest.approx(434.681198)
    assert result.energy.rer_kcal_day == pytest.approx(234.059107)


def test_species_mismatch_is_blocked(evaluate):
    with pytest.raises(HTTPException) as error:
        evaluate("cat_adult_mer100")
    assert error.value.detail["code"] == "profile_species_mismatch"


def test_partial_me_does_not_create_complete_ration_energy():
    commercial_id = uuid4()
    unknown_id = uuid4()
    request = AssessmentRequest.model_validate({
        "animal": {"species": "dog", "current_body_weight_kg": 5, "age_months": 26},
        "profile_mode": "manual",
        "components": [
            {"food_uuid": commercial_id, "grams": 50},
            {"food_uuid": unknown_id, "grams": 10},
        ],
    })
    result = provider.assess(request, {
        commercial_id: FoodSnapshot(commercial_id, "Dry food", "commercial", "dry", {
            code: FoodValue(value, "measured")
            for code, value in {"CP": 25, "CFa": 15, "CFi": 3, "CAs": 7, "MO": 10}.items()
        }),
        unknown_id: FoodSnapshot(unknown_id, "Supplement", "supplement", "unknown", {}),
    })
    energy = result.ration_energy
    assert energy.items[0].method == "fediaf_nrc_predictive"
    # FEDIAF 2025 §7.2.2.2a, NFE 40 g, GE 459.8 kcal, fibre 3.333% DM.
    assert energy.items[0].me_kcal_per_100g == pytest.approx(371.4204667)
    assert energy.known_kcal_day == pytest.approx(185.7102334)
    assert energy.items[1].warning is not None
    assert energy.total_kcal_day is None
    assert energy.coverage_percent is None
    assert energy.difference_kcal_day is None
