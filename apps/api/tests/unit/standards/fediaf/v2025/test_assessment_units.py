from dataclasses import replace
from decimal import Decimal
from uuid import uuid4

import pytest

from vetdietderm_api.assessments.ration import resolve_ration_foods
from vetdietderm_api.assessments.schemas import (
    AnimalProfile,
    AssessmentRequest,
    ProfileSelection,
    RationComponent,
)
from vetdietderm_api.catalog.schemas import FeedForm
from vetdietderm_api.patients.schemas import Species
from vetdietderm_api.standards.contract import FoodSnapshot, FoodValue
from vetdietderm_api.standards.fediaf.v2025 import provider
from vetdietderm_api.standards.fediaf.v2025.assessment import _status, assess_nutrition


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

    def resolve_for(species: str):
        payload = AssessmentRequest.model_validate({
            "animal": {"species": species},
            "components": [{"food_uuid": food_uuid, "grams": 100}],
        })
        resolved, _ = resolve_ration_foods(payload, {food_uuid: food}, None)
        return resolved[food_uuid]

    dog = resolve_for("dog")
    cat = resolve_for("cat")

    assert "ME" not in food.values
    assert dog.values["ME"].value == pytest.approx(395)
    assert cat.values["ME"].value == pytest.approx(387.5)
    assert dog.values["ME"].value_status == "calculated"
    assert cat.values["ME"].value_status == "calculated"


def test_combined_amino_acids_have_independent_daily_and_density_results() -> None:
    food_uuid = uuid4()
    food = FoodSnapshot(food_uuid, "Amino acid source", "commercial", "dry", {
        "ME": FoodValue(200, "measured"),
        "MO": FoodValue(20, "measured"),
        "Met": FoodValue(0.4, "measured"),
        "Cys": FoodValue(0.2, "measured"),
    })
    request = AssessmentRequest(
        animal=AnimalProfile(species=Species.dog, current_body_weight_kg=5, age_months=26),
        components=[RationComponent(food_uuid=food_uuid, grams=100)],
    )
    response = provider.assess(request, {food_uuid: food})
    row = next(item for item in response.rows if item.code == "methionine_cystine")
    assert row.ration_daily_amount == pytest.approx(0.6)
    assert row.ration_per_1000_kcal_me == pytest.approx(3)
    assert row.intake_bases.per_100g_as_fed == pytest.approx(0.6)
    assert row.intake_bases.per_100g_dry_matter == pytest.approx(0.75)
    assert row.contributions[0].daily_amount == pytest.approx(0.6)
    assert row.status == "below_minimum"
    assert row.density_status == "met"


def test_known_contribution_can_exceed_a_daily_ceiling_with_missing_food_data() -> None:
    ids = [uuid4(), uuid4()]
    profile = provider.data.profiles["dog_adult_mer110"]
    target = next(item for item in provider.data.targets if item.profile_uuid == profile.uuid and item.source_code == "Ca")
    # Synthetic ceiling for arithmetic verification only.
    ceiling = replace(target, basis="daily_per_metabolic_bw", minimum_value=None, maximum_value=Decimal("1"))
    snapshot = replace(provider.data, targets=(ceiling,))
    request = AssessmentRequest(
        animal=AnimalProfile(species=Species.dog, current_body_weight_kg=1, age_months=26),
        profile_mode="manual",
        profile_selection=ProfileSelection(
            standard_code="fediaf", edition=provider.metadata.edition,
            profile_code=profile.code, source="manual",
        ),
        components=[RationComponent(food_uuid=key, grams=100) for key in ids],
    )
    known = FoodSnapshot(ids[0], "Known Ca", "commercial", "dry", {"Ca": FoodValue(2, "measured")})
    unknown = FoodSnapshot(ids[1], "Unknown Ca", "supplement", "unknown", {})
    response = assess_nutrition(request, snapshot, {ids[0]: known, ids[1]: unknown})
    row = next(item for item in response.rows if item.code == "Ca")
    assert row.target.maximum == 1
    assert row.status == "above_maximum"
    assert row.ration_daily_amount is None
    assert [item.daily_amount for item in row.contributions] == [2, None]


def test_threshold_comparison_excludes_float_noise() -> None:
    assert _status(0.1 + 0.2, None, 0.3) == "met"
    assert _status(0.299999, 0.3, None) == "below_minimum"
    assert _status(0.300001, None, 0.3) == "above_maximum"


@pytest.mark.parametrize(("moisture", "expected"), [(50, "above_maximum"), (None, "missing_product_data")])
def test_dry_matter_ceiling_uses_dry_matter_basis_without_me(moisture, expected) -> None:
    key = uuid4()
    profile = provider.data.profiles["dog_adult_mer110"]
    target = next(item for item in provider.data.targets if item.profile_uuid == profile.uuid and item.source_code == "Ca")
    # Synthetic ceiling, 1,000 mg per 100 g dry matter.
    ceiling = replace(target, basis="per_100g_dry_matter", minimum_value=None, maximum_value=Decimal("1000"))
    request = AssessmentRequest(
        animal=AnimalProfile(species=Species.dog, current_body_weight_kg=5, age_months=26),
        components=[RationComponent(food_uuid=key, grams=100)],
    )
    food = FoodSnapshot(key, "Test composition", "commercial", "dry", {
        "Ca": FoodValue(600, "measured"),
        "MO": FoodValue(moisture, "measured" if moisture is not None else "unknown"),
    })
    assessment = assess_nutrition(request, replace(provider.data, targets=(ceiling,)), {key: food})
    row = next(item for item in assessment.rows if item.code == "Ca")
    assert row.status == expected
    assert row.published_target.basis == "per_100g_dry_matter"
    assert row.ration_daily_amount == 600
    assert row.ration_per_1000_kcal_me is None
    assert row.intake_bases.per_100g_dry_matter == (1200 if moisture is not None else None)
