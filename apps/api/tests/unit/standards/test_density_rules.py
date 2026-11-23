from uuid import uuid4

from vetdietderm_api.assessments.ration import FoodSnapshot, FoodValue, PreparedRation, RationData, RationEnergyRead
from vetdietderm_api.assessments.schemas import (
    AnimalProfile,
    AssessmentRequest,
    AssessmentStatus,
    EnergyAssessment,
    ProfileSelection,
    RationComponent,
)
from vetdietderm_api.catalog.schemas import FeedForm
from vetdietderm_api.standards.aafco.v2026.provider import load_provider as load_aafco
from vetdietderm_api.standards.density import _comparison_status
from vetdietderm_api.standards.nrc.v2006.provider import load_provider as load_nrc


def test_exclusive_maximum_rejects_the_boundary() -> None:
    assert _comparison_status(1.0, None, 1.0, maximum_inclusive=False) is AssessmentStatus.above_maximum
    assert _comparison_status(1.0, None, 1.0, maximum_inclusive=True) is AssessmentStatus.met
    assert _comparison_status(0.99, None, 1.0, maximum_inclusive=False) is AssessmentStatus.met


def test_nrc_edition_and_growth_windows_follow_the_expanded_tables() -> None:
    provider = load_nrc()
    assert provider is not None
    assert provider.metadata.edition == "2006"
    dog_codes = {item.code for item in provider.context_options("dog").profiles}
    cat_codes = {item.code for item in provider.context_options("cat").profiles}
    assert dog_codes == {
        "dog_adult_maintenance",
        "dog_growth_4_14_weeks",
        "dog_growth_14plus_weeks",
    }
    assert cat_codes == {"cat_adult_maintenance", "cat_growth_post_weaning"}
    assert "dog_reproduction_late_gestation_peak_lactation_partial" not in dog_codes

    early = provider.suggest(AnimalProfile(species="dog", age_months=2.5, current_body_weight_kg=3))
    late = provider.suggest(AnimalProfile(species="dog", age_months=6, current_body_weight_kg=8))
    unweaned = provider.suggest(AnimalProfile(species="dog", age_months=0.5, current_body_weight_kg=0.8))
    unknown_age = provider.suggest(AnimalProfile(species="dog", life_stage="puppy_kitten", current_body_weight_kg=4))
    assert early.suggested_profile_code == "dog_growth_4_14_weeks"
    assert late.suggested_profile_code == "dog_growth_14plus_weeks"
    assert unweaned.suggested_profile_code is None
    assert unknown_age.suggested_profile_code is None


def test_reviewed_limits_change_density_comparison() -> None:
    nrc = load_nrc()
    aafco = load_aafco()
    assert nrc is not None and aafco is not None

    adult = _assess(
        nrc,
        AnimalProfile(species="dog", age_months=26, current_body_weight_kg=5),
        "nrc",
        "2006",
        "dog_adult_maintenance",
        {"His": 0.48, "I": 0.22, "A": 1000},
    )
    assert _row(adult, "His").status is AssessmentStatus.met
    assert _row(adult, "His").published_target.minimum == 0.48
    assert _row(adult, "I").status is AssessmentStatus.met
    assert _row(adult, "A").status is AssessmentStatus.insufficient_context

    cat = _assess(
        nrc,
        AnimalProfile(species="cat", age_months=36, current_body_weight_kg=4),
        "nrc",
        "2006",
        "cat_adult_maintenance",
        {"Tau": 0.2},
        feed_form=FeedForm.dry,
    )
    taurine = _row(cat, "Tau")
    assert taurine.status is AssessmentStatus.insufficient_context
    assert "0,10" in (taurine.note_ru or "")

    large = _assess(
        aafco,
        AnimalProfile(species="dog", age_months=4, current_body_weight_kg=12, expected_mature_weight_kg=32),
        "aafco",
        "2016",
        "dog_growth_reproduction",
        {"Ca": 5000},
    )
    small = _assess(
        aafco,
        AnimalProfile(species="dog", age_months=4, current_body_weight_kg=6, expected_mature_weight_kg=12),
        "aafco",
        "2016",
        "dog_growth_reproduction",
        {"Ca": 5000},
    )
    adult_dog = _assess(
        aafco,
        AnimalProfile(species="dog", age_months=36, current_body_weight_kg=32, expected_mature_weight_kg=32),
        "aafco",
        "2016",
        "dog_adult_maintenance",
        {"Ca": 5000},
    )
    assert _row(large, "Ca").status is AssessmentStatus.above_maximum
    assert _row(large, "Ca").published_target.maximum == 4.5
    assert _row(small, "Ca").status is AssessmentStatus.met
    assert _row(adult_dog, "Ca").status is AssessmentStatus.met
    assert _row(adult_dog, "Ca").published_target.maximum == 6.25

    omega = _assess(
        aafco,
        AnimalProfile(species="dog", age_months=36, current_body_weight_kg=20),
        "aafco",
        "2016",
        "dog_adult_maintenance",
        {"LA": 31, "AA": 0, "ALA": 1, "EPA": 0, "DHA": 0},
    )
    boundary = _assess(
        aafco,
        AnimalProfile(species="dog", age_months=36, current_body_weight_kg=20),
        "aafco",
        "2016",
        "dog_adult_maintenance",
        {"LA": 30, "AA": 0, "ALA": 1, "EPA": 0, "DHA": 0},
    )
    incomplete = _assess(
        aafco,
        AnimalProfile(species="dog", age_months=36, current_body_weight_kg=20),
        "aafco",
        "2016",
        "dog_adult_maintenance",
        {"LA": 31, "ALA": 1},
    )
    assert _row(omega, "O6_O3_RATIO").status is AssessmentStatus.above_maximum
    assert _row(boundary, "O6_O3_RATIO").status is AssessmentStatus.met
    assert _row(incomplete, "O6_O3_RATIO").status is AssessmentStatus.missing_product_data

    cat_food = _assess(
        aafco,
        AnimalProfile(species="cat", age_months=36, current_body_weight_kg=4),
        "aafco",
        "2016",
        "cat_adult_maintenance",
        {"P": 5000, "Ca": 5000},
    )
    assert _row(cat_food, "P").status is AssessmentStatus.met
    assert _row(cat_food, "P").published_target.maximum == 5.0
    assert _row(cat_food, "CA_P").status is AssessmentStatus.met
    soluble = _row(cat_food, "P_HIGH_SOLUBLE")
    assert soluble.status is AssessmentStatus.insufficient_context
    assert soluble.code != "P"


def _assess(provider, animal, standard_code, edition, profile_code, values, feed_form=FeedForm.unknown):
    food_id = uuid4()
    stored = {"ME": 1000.0, **values}
    food = FoodSnapshot(
        food_id,
        "Diet",
        "commercial",
        feed_form.value,
        {code: FoodValue(value, "measured") for code, value in stored.items()},
    )
    ration = RationData(
        foods=[(food, 100)],
        totals=dict(stored),
        complete_codes=set(stored),
        missing_by_code={},
        weight_grams=100,
        dry_matter_grams=None,
    )
    prepared = PreparedRation(
        foods_by_id={food_id: food},
        requirement=EnergyAssessment(
            energy_formula_code=None,
            reference_energy_kcal=None,
            reference_energy_min_kcal=None,
            reference_energy_max_kcal=None,
            energy_adjustment_percent=100,
            working_energy_kcal=1000,
            rer_kcal_day=None,
            rer_factor=1.6,
            rer_factor_kcal_day=None,
            complete=True,
            missing_fields=[],
        ),
        energy=RationEnergyRead(
            items=[],
            total_kcal_day=1000,
            known_kcal_day=1000,
            requirement_kcal_day=1000,
            coverage_percent=100,
            difference_kcal_day=0,
        ),
        nutrients=ration,
    )
    request = AssessmentRequest(
        animal=animal,
        feed_form=feed_form,
        profile_mode="manual",
        profile_selection=ProfileSelection(
            standard_code=standard_code,
            edition=edition,
            profile_code=profile_code,
            source="manual",
        ),
        components=[RationComponent(food_uuid=food_id, grams=100)],
    )
    return provider.assess_prepared(request, prepared)


def _row(response, code):
    found = [item for item in response.rows if item.code == code]
    assert len(found) == 1, code
    return found[0]
