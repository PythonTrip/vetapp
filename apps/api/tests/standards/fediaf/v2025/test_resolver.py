import pytest

from vetdietderm_api.assessments.schemas import AnimalProfile
from vetdietderm_api.patients.schemas import Species
from vetdietderm_api.standards.fediaf.v2025 import provider
from vetdietderm_api.standards.fediaf.v2025.resolver import suggest_formula, suggest_profile


@pytest.mark.parametrize(
    ("animal", "profile", "formula"),
    [
        (
            AnimalProfile(species=Species.dog, current_body_weight_kg=10, activity="low"),
            "dog_adult_mer95",
            "activity_low",
        ),
        (
            AnimalProfile(
                species=Species.dog,
                current_body_weight_kg=8,
                expected_mature_weight_kg=20,
                age_months=5,
                life_stage="puppy_kitten",
            ),
            "dog_late_growth",
            "puppy_8w_1y",
        ),
        (
            AnimalProfile(
                species=Species.cat,
                current_body_weight_kg=4,
                neutered=True,
            ),
            "cat_adult_mer75",
            "adult_indoor_neutered",
        ),
        (
            AnimalProfile(
                species=Species.cat,
                current_body_weight_kg=4,
                lactating=True,
                lactation_week=2,
            ),
            "cat_reproduction",
            "lactation_lt3",
        ),
    ],
)
def test_profile_and_formula_resolution(
    animal: AnimalProfile,
    profile: str,
    formula: str,
) -> None:
    assert suggest_profile(animal, provider.data)[0] == profile
    assert suggest_formula(animal, provider.data)[0] == formula
    suggestions = provider.suggest(animal)
    assert suggestions.suggested_profile_code == profile
    assert suggestions.suggested_energy_formula_code == formula


@pytest.mark.parametrize(
    ("weight", "expected_code"),
    [
        (5, "dog_expected_adult_weight_le_7"),
        (10, "dog_expected_adult_weight_gt_7_le_15"),
        (20, "dog_expected_adult_weight_gt_15_le_27_5"),
        (40, "dog_expected_adult_weight_gt_27_5_le_47_5"),
        (60, "dog_expected_adult_weight_gt_47_5"),
    ],
)
def test_dog_growth_size_class_boundaries(weight: float, expected_code: str) -> None:
    animal = AnimalProfile(
        species=Species.dog,
        current_body_weight_kg=5,
        expected_mature_weight_kg=weight,
    )
    assert provider.suggest(animal).suggested_size_class_code == expected_code
