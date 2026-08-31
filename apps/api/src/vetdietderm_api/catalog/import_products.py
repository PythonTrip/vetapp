import json
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from vetdietderm_api.catalog.energy import ME_CODE, canonicalize_imported_me
from vetdietderm_api.catalog.models import Food, FoodNutrientValue, Nutrient
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.ids import uuid6

REPO_ROOT = Path(__file__).resolve().parents[5]
PRODUCTS_PATH = REPO_ROOT / "products_normalized.json"
AS_FED_BASIS = "per_100g_as_fed"


def _optional_decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    if not isinstance(value, (int, float, Decimal, str)):
        raise ValueError("ME/macronutrient values must be numeric or null")
    return Decimal(str(value))


TYPE_MAPPING = {
    "сухие корма": ("commercial", "dry"),
    "влажные корма": ("commercial", "wet"),
    "лакомства": ("commercial", "unknown"),
    "добавки": ("supplement", "unknown"),
    "белки": ("ingredient", "unknown"),
    "углеводы": ("ingredient", "unknown"),
    "жиры": ("ingredient", "unknown"),
    "клетчатка": ("ingredient", "unknown"),
}


@dataclass(frozen=True)
class ImportReport:
    source_rows: int
    distinct_foods: int
    created_foods: int
    updated_foods: int
    nutrient_values: int
    null_values_skipped: int


def _load_products(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as source:
        payload = json.load(source)
    if not isinstance(payload, list):
        raise ValueError("products_normalized.json must contain a JSON array")
    if not all(isinstance(item, dict) for item in payload):
        raise ValueError("Every product must be a JSON object")
    return payload


def _normalized_products(products: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in products:
        raw_name = item.get("name")
        if not isinstance(raw_name, str) or not raw_name.strip():
            raise ValueError("Every product requires a non-empty name")
        category = item.get("type")
        if category not in TYPE_MAPPING:
            raise ValueError(f"Unsupported product type for {raw_name!r}: {category!r}")
        result[raw_name] = item
    return result


def import_products(session: Session, path: Path = PRODUCTS_PATH) -> ImportReport:
    products = _load_products(path)
    products_by_name = _normalized_products(products)
    nutrients = list(session.scalars(select(Nutrient).order_by(Nutrient.sort_order)).all())
    if not nutrients:
        raise RuntimeError("Nutrient dictionary is empty; run Alembic migrations first")

    names = list(products_by_name)
    existing_foods = list(session.scalars(select(Food).where(Food.name.in_(names))).all())
    foods_by_name = {food.name: food for food in existing_foods}
    now = datetime.now(timezone.utc)
    created = 0

    for name, item in products_by_name.items():
        food_type, feed_form = TYPE_MAPPING[item["type"]]
        food = foods_by_name.get(name)
        if food is None:
            food = Food(uuid=uuid6(), name=name, type=food_type, feed_form=feed_form)
            foods_by_name[name] = food
            session.add(food)
            created += 1
        food.type = food_type
        food.feed_form = feed_form
        food.category = item["type"]
        subcategory = item.get("subcat")
        food.subcategory = subcategory.strip() if isinstance(subcategory, str) and subcategory.strip() else None
        food.updated_at = now

    session.flush()
    imported_foods = [foods_by_name[name] for name in names]
    imported_food_ids = [food.uuid for food in imported_foods]
    session.execute(
        delete(FoodNutrientValue).where(
            FoodNutrientValue.food_uuid.in_(imported_food_ids),
            FoodNutrientValue.basis == AS_FED_BASIS,
            FoodNutrientValue.source_uuid.is_(None),
        )
    )

    value_rows: list[dict[str, Any]] = []
    null_count = 0
    for name, item in products_by_name.items():
        food = foods_by_name[name]
        protein = _optional_decimal(item.get("CP"))
        fat = _optional_decimal(item.get("CFa"))
        carbohydrates = _optional_decimal(item.get("CH"))
        for nutrient in nutrients:
            raw_value = item.get(nutrient.code)
            if nutrient.code == ME_CODE:
                value = canonicalize_imported_me(
                    _optional_decimal(raw_value),
                    protein=protein,
                    fat=fat,
                    carbohydrates=carbohydrates,
                )
                if value is None:
                    null_count += 1
                    continue
                value_rows.append(
                    {
                        "uuid": uuid6(),
                        "food_uuid": food.uuid,
                        "nutrient_uuid": nutrient.uuid,
                        "value": value,
                        "basis": AS_FED_BASIS,
                        "value_status": "calculated",
                        "source_uuid": None,
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                continue
            if raw_value is None:
                null_count += 1
                continue
            if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
                raise ValueError(
                    f"Nutrient {nutrient.code!r} for {name!r} must be numeric or null"
                )
            value_rows.append(
                {
                    "uuid": uuid6(),
                    "food_uuid": food.uuid,
                    "nutrient_uuid": nutrient.uuid,
                    "value": Decimal(str(raw_value)),
                    "basis": AS_FED_BASIS,
                    "value_status": "measured",
                    "source_uuid": None,
                    "created_at": now,
                    "updated_at": now,
                }
            )

    chunk_size = 5_000
    for start in range(0, len(value_rows), chunk_size):
        session.execute(insert(FoodNutrientValue), value_rows[start : start + chunk_size])
    session.commit()
    return ImportReport(
        source_rows=len(products),
        distinct_foods=len(products_by_name),
        created_foods=created,
        updated_foods=len(products_by_name) - created,
        nutrient_values=len(value_rows),
        null_values_skipped=null_count,
    )


def main() -> None:
    session = get_session_factory()()
    try:
        report = import_products(session)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    print(
        "Food catalog import complete: "
        f"source={report.source_rows}, distinct={report.distinct_foods}, "
        f"created={report.created_foods}, updated={report.updated_foods}, "
        f"values={report.nutrient_values}, null_skipped={report.null_values_skipped}"
    )


if __name__ == "__main__":
    main()
