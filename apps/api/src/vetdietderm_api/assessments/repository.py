from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from vetdietderm_api.assessments.models import DietPlan
from vetdietderm_api.catalog.models import (
    Food,
    FoodNutrientValue,
    Nutrient,
)
from vetdietderm_api.catalog.nutrient_selection import nutrient_value_order
from vetdietderm_api.standards.contract import FoodSnapshot, FoodValue

LIST_CAP = 50


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
        .order_by(*nutrient_value_order())
    ).all()
    for value, code in rows:
        if code in values[value.food_uuid]:
            continue
        numeric = float(value.value) if isinstance(value.value, Decimal) else value.value
        values[value.food_uuid][code] = FoodValue(
            value=numeric,
            value_status=value.value_status,
            source=str(value.source_uuid) if value.source_uuid else None,
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


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="План питания не найден")


def _plan_stmt():
    return select(DietPlan).options(joinedload(DietPlan.patient))


def get_plan(session: Session, plan_uuid: UUID) -> DietPlan:
    plan = session.scalars(_plan_stmt().where(DietPlan.uuid == plan_uuid)).one_or_none()
    if plan is None:
        raise _not_found()
    return plan


def list_plans(session: Session, patient_uuid: UUID | None) -> list[DietPlan]:
    stmt = _plan_stmt()
    if patient_uuid is not None:
        stmt = stmt.where(DietPlan.patient_uuid == patient_uuid)
    stmt = stmt.order_by(DietPlan.updated_at.desc()).limit(LIST_CAP)
    return list(session.scalars(stmt).unique().all())
