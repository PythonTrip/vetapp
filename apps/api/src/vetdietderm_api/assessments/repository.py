from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.catalog.models import (
    Food,
    FoodNutrientValue,
    Nutrient,
)
from vetdietderm_api.standards.contract import FoodSnapshot, FoodValue


def load_foods(session: Session, food_uuids: list[UUID]) -> dict[UUID, FoodSnapshot]:
    foods = list(session.scalars(select(Food).where(Food.uuid.in_(food_uuids))))
    missing = sorted(str(item) for item in set(food_uuids) - {food.uuid for food in foods})
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Неизвестные продукты: {', '.join(missing)}",
        )
    values: dict[UUID, dict[str, FoodValue]] = {food.uuid: {} for food in foods}
    rows = session.execute(
        select(FoodNutrientValue, Nutrient.code)
        .join(Nutrient, Nutrient.uuid == FoodNutrientValue.nutrient_uuid)
        .where(
            FoodNutrientValue.food_uuid.in_(food_uuids),
            FoodNutrientValue.basis == "per_100g_as_fed",
        )
    ).all()
    for value, code in rows:
        numeric = float(value.value) if isinstance(value.value, Decimal) else value.value
        values[value.food_uuid][code] = FoodValue(
            value=numeric,
            value_status=value.value_status,
        )
    return {
        food.uuid: FoodSnapshot(
            uuid=food.uuid,
            name=food.name,
            type=food.type,
            feed_form=food.feed_form,
            values=values[food.uuid],
        )
        for food in foods
    }
