from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from vetdietderm_api.assessments.repository import load_foods
from vetdietderm_api.assessments.plans import _compute_snapshot
from vetdietderm_api.assessments.schemas import AnimalProfile, AssessmentRequest, DietPlanWrite, RationComponent
from vetdietderm_api.catalog.models import Food, FoodNutrientValue, Nutrient
from vetdietderm_api.catalog.repository import get_food, list_food_matrix, serialize_nutrient_values
from vetdietderm_api.catalog.schemas import FoodMatrixQuery


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    for table in (Nutrient.__table__, Food.__table__, FoodNutrientValue.__table__):
        table.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.mark.parametrize("reader", ["matrix", "detail", "assessment"])
@pytest.mark.parametrize("code", ["CP", "ME"])
@pytest.mark.parametrize("tied", [False, True])
@pytest.mark.parametrize("reverse_insert", [False, True])
def test_readers_choose_same_source_regardless_of_insert_order(
    session, reader, code, tied, reverse_insert
):
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    food = Food(name="Multi source", type="commercial")
    comparison = Food(name="Comparison", type="commercial")
    nutrient = Nutrient(code=code, name=code, category="main", base_unit="g")
    session.add_all([food, comparison, nutrient])
    session.flush()
    winner = FoodNutrientValue(
        uuid=UUID(int=2 if tied else 1), food_uuid=food.uuid, nutrient_uuid=nutrient.uuid,
        value=Decimal("12"), basis="per_100g_as_fed", value_status="estimated",
        source_uuid=uuid4(), updated_at=now,
    )
    loser = FoodNutrientValue(
        uuid=UUID(int=1 if tied else 2), food_uuid=food.uuid, nutrient_uuid=nutrient.uuid,
        value=Decimal("3"), basis="per_100g_as_fed", value_status="measured",
        source_uuid=uuid4(), updated_at=now if tied else now - timedelta(days=1),
    )
    rows = [winner, loser]
    for row in reversed(rows) if reverse_insert else rows:
        session.add(row)
        session.flush()
    session.add(FoodNutrientValue(
        food_uuid=comparison.uuid, nutrient_uuid=nutrient.uuid, value=Decimal("8"),
        basis="per_100g_as_fed", value_status="measured",
    ))
    session.commit()

    if reader == "matrix":
        for direction, expected in [("asc", [comparison.uuid, food.uuid]),
                                    ("desc", [food.uuid, comparison.uuid])]:
            page = list_food_matrix(
                session, FoodMatrixQuery(nutrient_category="main", sort=code, sort_dir=direction), ()
            )
            assert [item.uuid for item in page.items] == expected
            for item in page.items:
                assert [(v.code, v.value) for v in item.nutrient_values] == [
                    (code, 12 if item.uuid == food.uuid else 8)
                ]
    elif reader == "detail":
        values = serialize_nutrient_values(get_food(session, food.uuid))
        assert len(values) == 1
        assert values[0].uuid == winner.uuid
        assert values[0].value == 12
        assert values[0].source_uuid == winner.source_uuid
        assert values[0].value_status == "estimated"
        assert serialize_nutrient_values(get_food(session, comparison.uuid))[0].value == 8
    else:
        foods = load_foods(session, [food.uuid, comparison.uuid])
        assert foods[food.uuid].values[code].value == 12
        assert foods[food.uuid].values[code].value_status == "estimated"
        assert foods[comparison.uuid].values[code].value == 8
        if code == "CP":
            _, snapshot = _compute_snapshot(session, DietPlanWrite(
                name="Canonical ration",
                assessment_request=AssessmentRequest(
                    animal=AnimalProfile(species="dog", current_body_weight_kg=10, activity="low"),
                    feed_form="dry",
                    components=[RationComponent(food_uuid=food.uuid, grams=200)],
                ),
            ))
            protein = next(row for row in snapshot["assessment"]["rows"] if row["code"] == "CP")
            assert protein["ration_daily_amount"] == 24
    assert session.scalar(select(func.count()).select_from(FoodNutrientValue)) == 3


def test_unknown_winner_does_not_fall_back_to_older_source_or_other_basis(session):
    food = Food(name="Unknown composition", type="commercial")
    nutrient = Nutrient(code="CP", name="Protein", category="main", base_unit="g")
    session.add_all([food, nutrient])
    session.flush()
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    for value, basis, updated_at in [
        (None, "per_100g_as_fed", now),
        (Decimal("3"), "per_100g_as_fed", now - timedelta(days=1)),
        (Decimal("20"), "per_100g_dm", now + timedelta(days=1)),
    ]:
        session.add(FoodNutrientValue(
            food_uuid=food.uuid, nutrient_uuid=nutrient.uuid, value=value,
            basis=basis, updated_at=updated_at, source_uuid=uuid4(),
            value_status="unknown" if value is None else "measured",
        ))
    session.commit()
    detail = serialize_nutrient_values(get_food(session, food.uuid))
    assert {v.basis: v.value for v in detail} == {
        "per_100g_as_fed": None, "per_100g_dm": 20,
    }
    page = list_food_matrix(session, FoodMatrixQuery(nutrient_category="main"), ())
    assert page.items[0].nutrient_values[0].value is None
    value = load_foods(session, [food.uuid])[food.uuid].values["CP"]
    assert value.value is None
    assert value.value_status == "unknown"
