from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from vetdietderm_api.assessments.schemas import (
    AssessmentResponse,
    DietPlanRead,
    DietPlanSummary,
    EnergyEstimateResponse,
    SuggestionsResponse,
)
from vetdietderm_api.catalog.schemas import FoodRead, NutrientRead
from vetdietderm_api.guidelines.schemas import ActiveGuidelineRead


pytestmark = pytest.mark.integration


def _body(response, expected_status: int):
    assert response.status_code == expected_status, response.text
    return response.json() if response.content else None


def test_catalog_assessment_and_diet_plan_snapshot_are_integrated(
    api_client: TestClient,
    seeded_nutrients: dict[str, UUID],
) -> None:
    nutrients = [
        NutrientRead.model_validate(item)
        for item in _body(api_client.get("/nutrients"), 200)
    ]
    assert len(nutrients) == len(seeded_nutrients)
    assert {item.code for item in nutrients} == set(seeded_nutrients)
    nutrients_by_code = {item.code: item for item in nutrients}
    assert "J" not in nutrients_by_code
    assert nutrients_by_code["I"].base_unit == "mg"
    assert nutrients_by_code["Se"].base_unit == "mcg"
    assert nutrients_by_code["B4"].name == "Холин"

    client = _body(api_client.post("/clients", json={"name": "Анна Соколова"}), 201)
    patient = _body(
        api_client.post(
            "/patients",
            json={
                "client_uuid": client["uuid"],
                "name": "Рэй",
                "species": "dog",
                "breed": "метис",
                "body_weight_kg": 30,
                "life_stage": "adult",
                "activity": "low",
                "neutered": True,
                "bcs": 5,
            },
        ),
        201,
    )

    original_food_name = "Рацион Integration Adult Dog"
    food = FoodRead.model_validate(
        _body(
            api_client.post(
                "/foods",
                json={
                    "name": original_food_name,
                    "type": "commercial",
                    "feed_form": "dry",
                    "category": "Лечебные рационы",
                    "subcategory": "Integration Brand",
                },
            ),
            201,
        )
    )
    assert food.nutrient_values == []

    nutrient_payload = [
        {"code": "ME", "value": 380, "value_status": "measured"},
        {"code": "CP", "value": 28, "value_status": "measured"},
        {"code": "CFa", "value": 15, "value_status": "measured"},
        {"code": "Ca", "value": 1200, "value_status": "measured"},
        {"code": "P", "value": 900, "value_status": "measured"},
        {"code": "EPA", "value": 0.1, "value_status": "estimated"},
        {"code": "DHA", "value": 0.1, "value_status": "estimated"},
    ]
    food = FoodRead.model_validate(
        _body(
            api_client.put(
                f"/foods/{food.uuid}/nutrient-values",
                json=nutrient_payload,
            ),
            200,
        )
    )
    assert {item.code for item in food.nutrient_values} == {
        "ME",
        "CP",
        "CFa",
        "Ca",
        "P",
        "EPA",
        "DHA",
    }

    search = _body(
        api_client.get(
            "/foods",
            params={
                "q": "integration adult",
                "category": "Лечебные рационы",
                "subcategory": "Integration Brand",
            },
        ),
        200,
    )
    assert [item["uuid"] for item in search] == [str(food.uuid)]

    categories = _body(api_client.get("/foods/categories"), 200)
    assert categories == [
        {
            "category": "Лечебные рационы",
            "subcategories": ["Integration Brand"],
        }
    ]
    matrix = _body(
        api_client.get(
            "/foods/matrix",
            params={
                "nutrient_category": "main",
                "q": "Integration",
                "sort": "CP",
                "sort_dir": "desc",
                "offset": 0,
                "limit": 10,
            },
        ),
        200,
    )
    assert matrix["total"] == 1
    assert matrix["items"][0]["uuid"] == str(food.uuid)
    assert {item["code"] for item in matrix["items"][0]["nutrient_values"]} >= {
        "ME",
        "CP",
        "CFa",
    }

    invalid_filters = api_client.get(
        "/foods",
        params={"category": "Лечебные рационы"},
    )
    assert invalid_filters.status_code == 422
    assert invalid_filters.json()["detail"] == "category и subcategory должны передаваться парами"

    unknown_code = api_client.put(
        f"/foods/{food.uuid}/nutrient-values",
        json=[{"code": "NOT_A_NUTRIENT", "value": 1}],
    )
    assert unknown_code.status_code == 422
    assert unknown_code.json() == {
        "detail": "Неизвестные коды нутриентов: NOT_A_NUTRIENT"
    }
    unchanged_food = FoodRead.model_validate(
        _body(api_client.get(f"/foods/{food.uuid}"), 200)
    )
    assert {item.code for item in unchanged_food.nutrient_values} == {
        item.code for item in food.nutrient_values
    }

    animal = {
        "species": "dog",
        "current_body_weight_kg": 30,
        "age_months": 60,
        "life_stage": "adult",
        "activity": "low",
        "neutered": True,
        "bcs": 5,
    }
    suggestions = SuggestionsResponse.model_validate(
        _body(api_client.post("/assessments/suggestions", json={"animal": animal}), 200)
    )
    assert suggestions.suggested_profile_code
    assert suggestions.suggested_energy_formula_code
    assert suggestions.edition.code.startswith("2025")

    energy = EnergyEstimateResponse.model_validate(
        _body(
            api_client.post(
                "/assessments/energy-estimate",
                json={"animal": animal, "energy_adjustment_percent": 90},
            ),
            200,
        )
    )
    assert energy.energy_formula_code == suggestions.suggested_energy_formula_code
    assert energy.value is not None
    assert energy.reference_energy_kcal is not None
    assert energy.working_energy_kcal == pytest.approx(energy.reference_energy_kcal * 0.9)
    assert energy.missing_fields == []

    assessment_request = {
        "animal": animal,
        "feed_form": "dry",
        "therapeutic_goal": False,
        "rer_factor": 1.6,
        "energy_adjustment_percent": 90,
        "components": [{"food_uuid": str(food.uuid), "grams": 300}],
    }
    assessment = AssessmentResponse.model_validate(
        _body(api_client.post("/assessments", json=assessment_request), 200)
    )
    assert assessment.engine_id == "nutrition-engine/2.0.0"
    assert assessment.edition == suggestions.edition
    assert assessment.edition.source_checksum
    assert assessment.context.nutrient_profile_code == suggestions.suggested_profile_code
    assert assessment.context.energy_formula_code == suggestions.suggested_energy_formula_code
    assert assessment.energy.complete is True
    assert assessment.normative_comparison_performed is True
    assert assessment.input_hash is not None and len(assessment.input_hash) == 64
    assert assessment.rows
    rows_by_code = {}
    for row in assessment.rows:
        rows_by_code.setdefault(row.code, []).append(row)
    assert all(row.unit == "mg" and row.target.unit == "mg" for row in rows_by_code["Ca"])
    assert all(row.unit == "mg" and row.target.unit == "mg" for row in rows_by_code["I"])
    assert all(row.unit == "mcg" and row.target.unit == "mcg" for row in rows_by_code["Se"])
    assert assessment.coverage.complete_atomic_count > 0
    assert assessment.met_count == sum(row.status == "met" for row in assessment.rows)
    assert assessment.below_minimum_count == sum(
        row.status == "below_minimum" for row in assessment.rows
    )
    assert assessment.above_maximum_count == sum(
        row.status == "above_maximum" for row in assessment.rows
    )
    verdict_rows = [
        row
        for row in assessment.rows
        if row.target is not None and row.status != "not_applicable"
    ]
    assert assessment.unevaluable_count == sum(
        row.status in {"missing_product_data", "insufficient_context", "not_established"}
        for row in verdict_rows
    )

    duplicate_component = {
        **assessment_request,
        "components": [
            {"food_uuid": str(food.uuid), "grams": 150},
            {"food_uuid": str(food.uuid), "grams": 150},
        ],
    }
    assert api_client.post("/assessments", json=duplicate_component).status_code == 422

    unknown_food_request = {
        **assessment_request,
        "components": [{"food_uuid": str(uuid4()), "grams": 300}],
    }
    unknown_food = api_client.post("/assessments", json=unknown_food_request)
    assert unknown_food.status_code == 422
    assert unknown_food.json()["detail"].startswith("Неизвестные продукты:")

    plan_payload = {
        "name": "План Рэя — исходный",
        "patient_uuid": patient["uuid"],
        "notes": "  Контроль через две недели  ",
        "assessment_request": assessment_request,
    }
    saved_plan = DietPlanRead.model_validate(
        _body(api_client.post("/diet-plans", json=plan_payload), 201)
    )
    assert saved_plan.patient is not None
    assert saved_plan.patient.uuid == UUID(patient["uuid"])
    assert saved_plan.ration[0].food_name == original_food_name
    assert saved_plan.notes == "Контроль через две недели"
    assert saved_plan.assessment_snapshot.request.animal.species == "dog"
    assert saved_plan.assessment_snapshot.request.animal.current_body_weight_kg == 30
    assert saved_plan.assessment_snapshot.request.energy_adjustment_percent == 90
    assert saved_plan.assessment_snapshot.request.components[0].food_uuid == food.uuid
    assert saved_plan.assessment_snapshot.request.components[0].grams == 300
    assert saved_plan.assessment_snapshot.result.input_hash == assessment.input_hash
    assert saved_plan.assessment_snapshot.result == saved_plan.assessment_snapshot.assessment
    assert saved_plan.assessment_snapshot.standard_code == "fediaf"
    assert saved_plan.assessment_snapshot.provider_version
    assert saved_plan.assessment_snapshot.provider_checksum
    original_hash = saved_plan.assessment_snapshot.result.input_hash

    plan_list = [
        DietPlanSummary.model_validate(item)
        for item in _body(
            api_client.get("/diet-plans", params={"patientId": patient["uuid"]}),
            200,
        )
    ]
    assert [item.uuid for item in plan_list] == [saved_plan.uuid]

    renamed_food = FoodRead.model_validate(
        _body(
            api_client.patch(
                f"/foods/{food.uuid}",
                json={"name": "Рацион Integration Adult Dog v2"},
            ),
            200,
        )
    )
    assert renamed_food.name.endswith("v2")

    persisted_snapshot = DietPlanRead.model_validate(
        _body(api_client.get(f"/diet-plans/{saved_plan.uuid}"), 200)
    )
    assert persisted_snapshot.ration[0].food_name == original_food_name
    assert persisted_snapshot.assessment_snapshot.result.input_hash == original_hash

    replacement_request = {
        **assessment_request,
        "energy_adjustment_percent": 95,
        "components": [{"food_uuid": str(food.uuid), "grams": 280}],
    }
    replaced_plan = DietPlanRead.model_validate(
        _body(
            api_client.patch(
                f"/diet-plans/{saved_plan.uuid}",
                json={
                    "name": "План Рэя — пересчитанный",
                    "patient_uuid": patient["uuid"],
                    "notes": "Новая версия",
                    "assessment_request": replacement_request,
                },
            ),
            200,
        )
    )
    assert replaced_plan.uuid == saved_plan.uuid
    assert replaced_plan.ration[0].food_name == renamed_food.name
    assert replaced_plan.assessment_snapshot.request.energy_adjustment_percent == 95
    assert replaced_plan.assessment_snapshot.result.input_hash != original_hash
    assert (
        replaced_plan.assessment_snapshot.provider_checksum
        == saved_plan.assessment_snapshot.provider_checksum
    )

    active_guideline = ActiveGuidelineRead.model_validate(
        _body(api_client.get("/guidelines/active"), 200)
    )
    assert active_guideline.standard_code == "fediaf"
    assert active_guideline.provider_checksum == replaced_plan.assessment_snapshot.provider_checksum
