from uuid import uuid4

import pytest
from fastapi import HTTPException

from vetdietderm_api.assessments import plans, repository
from vetdietderm_api.assessments.schemas import (
    AnimalProfile,
    AssessmentRequest,
    DietPlanWrite,
    ProfileSelection,
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
    monkeypatch.setattr(repository, "load_foods", lambda _session, _ids: {food_uuid: food})
    payload = DietPlanWrite(
        name="Provider snapshot",
        assessment_request=AssessmentRequest(
            animal=AnimalProfile(
                species=Species.dog,
                current_body_weight_kg=10,
                activity="low",
            ),
            feed_form=FeedForm.dry,
            profile_mode="manual",
            profile_selection=ProfileSelection(
                standard_code="fediaf", edition=provider.metadata.edition,
                profile_code="dog_adult_mer110", source="manual", comment="Manual alternative",
            ),
            components=[RationComponent(food_uuid=food_uuid, grams=100)],
        ),
    )

    _ration, snapshot = plans._compute_snapshot(object(), payload, "clinician-id")  # type: ignore[arg-type]

    assert snapshot["standard_code"] == "fediaf"
    assert snapshot["edition"] == provider.metadata.edition
    assert snapshot["provider_version"] == provider.metadata.provider_version
    assert snapshot["provider_checksum"] == provider.metadata.provider_checksum
    assert snapshot["resolved_context"] == snapshot["assessment"]["context"]
    assert snapshot["result"] == snapshot["assessment"]
    assert snapshot["confirmed_by"] == "clinician-id"
    assert snapshot["confirmed_at"] is not None
    assert snapshot["nutrient_profile_code"] == "dog_adult_mer110"
    assert snapshot["resolved_context"]["profile_compatibility"]["level"] == "soft"
    assert snapshot["result"]["ration_energy"]["items"][0]["kcal_day"] == 350

    changed = payload.model_copy(update={"expected_input_hash": "0" * 64})
    with pytest.raises(HTTPException) as error:
        plans._compute_snapshot(object(), changed, "clinician-id")  # type: ignore[arg-type]
    assert error.value.status_code == 409
