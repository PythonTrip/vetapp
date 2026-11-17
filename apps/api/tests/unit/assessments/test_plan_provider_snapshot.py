from uuid import uuid4

from vetdietderm_api.assessments import plans
from vetdietderm_api.assessments.schemas import (
    AnimalProfile,
    AssessmentRequest,
    DietPlanWrite,
    RationComponent,
)
from vetdietderm_api.catalog.schemas import FeedForm
from vetdietderm_api.patients.schemas import Species
from vetdietderm_api.standards.contract import FoodSnapshot, FoodValue
from vetdietderm_api.standards.fediaf.v2025 import provider


def test_new_plan_snapshot_freezes_provider_and_result(monkeypatch) -> None:
    food_uuid = uuid4()
    food = FoodSnapshot(
        uuid=food_uuid,
        name="Golden food",
        type="commercial",
        feed_form="dry",
        values={"ME": FoodValue(value=350, value_status="measured")},
    )
    monkeypatch.setattr(plans.repository, "load_foods", lambda _session, _ids: {food_uuid: food})
    payload = DietPlanWrite(
        name="Provider snapshot",
        assessment_request=AssessmentRequest(
            animal=AnimalProfile(
                species=Species.dog,
                current_body_weight_kg=10,
                activity="low",
            ),
            feed_form=FeedForm.dry,
            components=[RationComponent(food_uuid=food_uuid, grams=100)],
        ),
    )

    _ration, snapshot = plans._compute_snapshot(object(), payload)  # type: ignore[arg-type]

    assert snapshot["standard_code"] == "fediaf"
    assert snapshot["edition"] == provider.metadata.edition
    assert snapshot["provider_version"] == provider.metadata.provider_version
    assert snapshot["provider_checksum"] == provider.metadata.provider_checksum
    assert snapshot["resolved_context"] == snapshot["assessment"]["context"]
    assert snapshot["result"] == snapshot["assessment"]
