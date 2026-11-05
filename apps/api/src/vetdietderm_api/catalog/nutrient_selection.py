from collections.abc import Iterable
from uuid import UUID

from sqlalchemy.sql.elements import UnaryExpression

from vetdietderm_api.catalog.models import FoodNutrientValue


def nutrient_value_order() -> tuple[UnaryExpression, UnaryExpression]:
    """Newest source wins; UUID breaks timestamp ties on both database dialects."""
    return FoodNutrientValue.updated_at.desc(), FoodNutrientValue.uuid.desc()


def canonical_nutrient_values(rows: Iterable[FoodNutrientValue]) -> list[FoodNutrientValue]:
    winners: dict[tuple[UUID, str, str], FoodNutrientValue] = {}
    for row in sorted(rows, key=lambda row: (row.updated_at, row.uuid), reverse=True):
        winners.setdefault((row.food_uuid, row.nutrient.code, row.basis), row)
    return list(winners.values())
