from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from vetdietderm_api.assessments import repository
from vetdietderm_api.assessments.router import router
from vetdietderm_api.db import get_session
from vetdietderm_api.standards.contract import FoodSnapshot, FoodValue


@pytest.fixture
def workbench(monkeypatch):
    food_id = uuid4()
    food = FoodSnapshot(food_id, "Test food", "commercial", "dry", {"ME": FoodValue(300, "measured")})
    monkeypatch.setattr(repository, "load_foods", lambda _session, _ids: {food_id: food})
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_session] = lambda: object()
    with TestClient(app) as client:
        yield client, {
            "animal": {"species": "dog", "age_months": 26, "current_body_weight_kg": 5},
            "components": [{"food_uuid": str(food_id), "grams": 100}],
            "profile_mode": "manual",
        }


def test_registry_catalog_and_profile_confirmation_use_the_http_contract(workbench) -> None:
    client, payload = workbench
    standards = client.get("/assessments/standards").json()
    by_code = {item["standard_code"]: item for item in standards}
    assert by_code["fediaf"]["available"]
    assert by_code["nrc"]["normative_categories"] == ["MR", "RA", "AI", "SUL"]
    assert not by_code["aafco"]["available"]
    suggestions = client.post("/assessments/suggestions", json={"animal": payload["animal"]}).json()
    assert suggestions["suggested_profile_code"] == "dog_adult_mer110"
    assert {item["code"] for item in suggestions["profile_options"]} >= {"dog_adult_mer95", "dog_adult_mer110"}

    preview = client.post("/assessments", json=payload)
    assert preview.status_code == 200
    assert not preview.json()["normative_comparison_performed"]
    assert preview.json()["rows"] == []
    assert preview.json()["ration_energy"]["total_kcal_day"] == 300
    assert client.post("/diet-plans", json={"name": "Unconfirmed", "assessment_request": payload}).status_code == 422

    payload["profile_selection"] = {
        "standard_code": "fediaf", "edition": "2025.09",
        "profile_code": "dog_adult_mer95", "source": "manual",
    }
    assessment = client.post("/assessments", json=payload)
    assert assessment.status_code == 200
    assert assessment.json()["context"]["nutrient_profile_code"] == "dog_adult_mer95"
    assert assessment.json()["energy"] == preview.json()["energy"]


def test_stale_recommendation_requires_explicit_manual_confirmation(workbench) -> None:
    client, payload = workbench
    previous = client.post("/assessments/suggestions", json={"animal": payload["animal"]})
    assert previous.status_code == 200
    assert previous.json()["suggested_profile_code"] == "dog_adult_mer110"
    updated_animal = {**payload["animal"], "activity": "low"}
    current = client.post("/assessments/suggestions", json={"animal": updated_animal})
    assert current.status_code == 200
    assert current.json()["suggested_profile_code"] == "dog_adult_mer95"

    selection = {
        "standard_code": "fediaf",
        "edition": "2025.09",
        "profile_code": "dog_adult_mer110",
        "source": "recommendation",
    }
    request = {**payload, "animal": updated_animal, "profile_selection": selection}
    rejected = client.post("/assessments", json=request)
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["code"] == "recommendation_changed"

    manual = {**selection, "source": "manual"}
    accepted = client.post("/assessments", json={**request, "profile_selection": manual})
    assert accepted.status_code == 200
    result = accepted.json()
    assert result["normative_comparison_performed"] is True
    assert result["context"]["nutrient_profile_code"] == "dog_adult_mer110"
    assert result["context"]["profile_selection"]["source"] == "manual"
    assert result["context"]["profile_compatibility"]["level"] == "soft"


@pytest.mark.parametrize("empty_comment", [
    pytest.param(None, id="missing-comment"),
    pytest.param("   ", id="blank-comment"),
])
def test_growth_override_requires_a_nonblank_clinician_comment(workbench, empty_comment) -> None:
    client, payload = workbench
    puppy = {**payload["animal"], "age_months": 2.5, "expected_mature_weight_kg": 12}
    suggestions = client.post("/assessments/suggestions", json={"animal": puppy})
    assert suggestions.status_code == 200
    assert suggestions.json()["suggested_profile_code"] == "dog_early_growth_reproduction"

    selection = {
        "standard_code": "fediaf",
        "edition": "2025.09",
        "profile_code": "dog_late_growth",
        "source": "manual",
        "comment": empty_comment,
    }
    request = {**payload, "animal": puppy, "profile_selection": selection}
    rejected = client.post("/assessments", json=request)
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["code"] == "profile_comment_required"

    comment = "Возраст оценён при осмотре, выбор профиля проверен врачом."
    accepted = client.post("/assessments", json={
        **request, "profile_selection": {**selection, "comment": comment},
    })
    assert accepted.status_code == 200
    result = accepted.json()
    assert result["normative_comparison_performed"] is True
    assert result["context"]["nutrient_profile_code"] == "dog_late_growth"
    assert result["context"]["profile_selection"]["comment"] == comment
    assert result["context"]["profile_compatibility"]["code"] == "growth_age_review"
    assert result["context"]["profile_compatibility"]["comment_required"] is True


@pytest.mark.parametrize(("code", "edition"), [("nrc", "2006"), ("aafco", "2026")])
def test_unavailable_standards_never_fall_back_to_fediaf(workbench, code, edition) -> None:
    client, payload = workbench
    response = client.post("/assessments/suggestions", json={
        "animal": payload["animal"], "standard_code": code, "edition": edition,
    })
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "standard_unavailable"
    response = client.post("/assessments", json={
        **payload, "profile_selection": {
            "standard_code": code, "edition": edition, "profile_code": "dog_adult",
            "source": "manual",
        },
    })
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "standard_unavailable"
