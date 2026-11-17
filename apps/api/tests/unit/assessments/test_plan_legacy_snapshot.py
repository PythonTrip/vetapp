from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from vetdietderm_api.assessments import plans
from vetdietderm_api.assessments.models import DietPlan


def _legacy_snapshot(
    *,
    missing_request_adjustment: bool,
    missing_assessment_adjustment: bool = False,
) -> dict[str, object]:
    request: dict[str, object] = {
        "animal": {
            "species": "dog",
            "current_body_weight_kg": 10,
        },
        "feed_form": "unknown",
        "components": [{"food_uuid": str(uuid4()), "grams": 100}],
    }
    if not missing_request_adjustment:
        request["energy_adjustment_percent"] = None

    energy: dict[str, object] = {
        "energy_formula_code": "adult",
        "reference_energy_kcal": 640,
        "reference_energy_min_kcal": None,
        "reference_energy_max_kcal": None,
        "working_energy_kcal": 777,
        "rer_kcal_day": 394,
        "rer_factor": 1.6,
        "rer_factor_kcal_day": 630.4,
        "complete": True,
        "missing_fields": [],
    }
    if not missing_assessment_adjustment:
        energy["energy_adjustment_percent"] = None

    return {
        "request": request,
        "assessment": {
            "engine_id": "nutrition-engine/legacy",
            "edition": {
                "code": "2025",
                "source_checksum": "saved-checksum",
                "source_title": "Saved FEDIAF",
                "source_url": "https://example.test/fediaf",
                "clinical_warning_ru": "Сохранённое предупреждение",
            },
            "context": {
                "nutrient_profile_code": "adult",
                "energy_formula_code": "adult",
                "size_class_code": None,
                "feed_form": "unknown",
                "therapeutic_goal": False,
            },
            "energy": energy,
            "coverage": {
                "expected_atomic_count": 0,
                "complete_atomic_count": 0,
                "percent": 0,
                "below_threshold": False,
            },
            "rows": [],
            "met_count": 0,
            "normative_comparison_performed": True,
        },
        "nutrient_profile_code": "adult",
        "energy_formula_code": "adult",
    }


def _plan(snapshot: dict[str, object]) -> DietPlan:
    now = datetime.now(timezone.utc)
    return DietPlan(
        uuid=uuid4(),
        name="Legacy plan",
        patient_uuid=None,
        patient=None,
        ration_json=[],
        assessment_snapshot_json=snapshot,
        notes=None,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.parametrize(
    ("missing_request_adjustment", "missing_assessment_adjustment"),
    [
        (False, False),
        (True, False),
        (False, True),
        (True, True),
    ],
)
def test_legacy_plan_read_maps_null_or_missing_adjustment_without_recalculation(
    monkeypatch: pytest.MonkeyPatch,
    missing_request_adjustment: bool,
    missing_assessment_adjustment: bool,
) -> None:
    stored_snapshot = _legacy_snapshot(
        missing_request_adjustment=missing_request_adjustment,
        missing_assessment_adjustment=missing_assessment_adjustment,
    )
    original_snapshot = deepcopy(stored_snapshot)

    def fail_if_recalculated(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("A stored assessment snapshot must not be recalculated")

    monkeypatch.setattr(plans, "assess_nutrition", fail_if_recalculated)

    result = plans.to_read(_plan(stored_snapshot))

    assert result.assessment_snapshot.request.energy_adjustment_percent == 100
    assert result.assessment_snapshot.assessment.energy.energy_adjustment_percent == 100
    assert result.assessment_snapshot.assessment.energy.working_energy_kcal == 777
    assert result.assessment_snapshot.standard_code == "fediaf"
    assert result.assessment_snapshot.edition == "2025"
    assert result.assessment_snapshot.provider_version == "legacy/sql"
    assert result.assessment_snapshot.provider_checksum == "saved-checksum"
    assert result.assessment_snapshot.resolved_context == result.assessment_snapshot.assessment.context
    assert result.assessment_snapshot.result == result.assessment_snapshot.assessment
    assert stored_snapshot == original_snapshot


def test_legacy_plan_summary_uses_the_same_compatibility_mapper() -> None:
    result = plans.to_summary(
        _plan(
            _legacy_snapshot(
                missing_request_adjustment=True,
                missing_assessment_adjustment=True,
            )
        )
    )

    assert result.engine_id == "nutrition-engine/legacy"
    assert result.edition_code == "2025"


def test_legacy_mapper_preserves_existing_adjustment_values() -> None:
    stored_snapshot = _legacy_snapshot(missing_request_adjustment=False)
    request = stored_snapshot["request"]
    assessment = stored_snapshot["assessment"]
    assert isinstance(request, dict)
    assert isinstance(assessment, dict)
    energy = assessment["energy"]
    assert isinstance(energy, dict)
    request["energy_adjustment_percent"] = 80
    energy["energy_adjustment_percent"] = 80

    result = plans.to_read(_plan(stored_snapshot))

    assert result.assessment_snapshot.request.energy_adjustment_percent == 80
    assert result.assessment_snapshot.assessment.energy.energy_adjustment_percent == 80
