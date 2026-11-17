from uuid import uuid4

import pytest

from vetdietderm_api.assessments.schemas import (
    AnimalProfile,
    AssessmentRequest,
    RationComponent,
)
from vetdietderm_api.catalog.schemas import FeedForm
from vetdietderm_api.patients.schemas import Species
from vetdietderm_api.standards.contract import FoodSnapshot, FoodValue
from vetdietderm_api.standards.fediaf.v2025 import provider
from vetdietderm_api.standards.fediaf.v2025.assessment import _foods_with_resolved_me


def test_daily_target_keeps_per_1000_kcal_scaling_after_unit_normalization() -> None:
    food_uuid = uuid4()
    food = FoodSnapshot(
        uuid=food_uuid,
        name="Canonical mineral food",
        type="commercial",
        feed_form="dry",
        values={
            "ME": FoodValue(value=350, value_status="measured"),
            "Ca": FoodValue(value=1250, value_status="measured"),
        },
    )
    request = AssessmentRequest(
        animal=AnimalProfile(
            species=Species.dog,
            current_body_weight_kg=10,
            age_months=60,
            life_stage="adult",
            activity="low",
            neutered=True,
        ),
        feed_form=FeedForm.dry,
        components=[RationComponent(food_uuid=food_uuid, grams=100)],
    )

    result = provider.assess(request, {food_uuid: food})
    ca_row = next(row for row in result.rows if row.code == "Ca" and row.target is not None)
    source_target = next(
        target
        for target in provider.data.targets
        if target.profile_uuid
        == provider.data.profiles[result.context.nutrient_profile_code].uuid
        and target.source_code == "Ca"
        and target.applicability_rule_uuid is None
    )

    assert result.energy.working_energy_kcal is not None
    assert ca_row.unit == "mg"
    assert ca_row.target.minimum == pytest.approx(
        float(source_target.minimum_value)
        * result.energy.working_energy_kcal
        / 1000
    )


def test_assessment_resolves_me_per_species_without_mutating_food_snapshot() -> None:
    food_uuid = uuid4()
    food = FoodSnapshot(
        uuid=food_uuid,
        name="Natural ingredient",
        type="ingredient",
        feed_form="unknown",
        values={
            "CP": FoodValue(value=25, value_status="measured"),
            "CFa": FoodValue(value=15, value_status="measured"),
            "CFi": FoodValue(value=3, value_status="measured"),
            "CAs": FoodValue(value=7, value_status="measured"),
            "MO": FoodValue(value=10, value_status="measured"),
        },
    )

    dog = _foods_with_resolved_me({food_uuid: food}, "dog")[food_uuid]
    cat = _foods_with_resolved_me({food_uuid: food}, "cat")[food_uuid]

    assert "ME" not in food.values
    assert dog.values["ME"].value == pytest.approx(395)
    assert cat.values["ME"].value == pytest.approx(387.5)
    assert dog.values["ME"].value_status == "calculated"
    assert cat.values["ME"].value_status == "calculated"
