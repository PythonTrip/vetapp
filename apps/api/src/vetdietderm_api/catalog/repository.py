from collections.abc import Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from vetdietderm_api.catalog.models import Food, FoodNutrientValue, Nutrient, utc_now
from vetdietderm_api.catalog.schemas import (
    FoodCreate,
    FoodCategoryGroup,
    FoodMatrixPage,
    FoodMatrixQuery,
    FoodMatrixRow,
    FoodMatrixValue,
    FoodNutrientValueRead,
    FoodNutrientValueWrite,
    FoodType,
    FoodSummary,
    FoodUpdate,
)

LIST_CAP = 50
AS_FED_BASIS = "per_100g_as_fed"


def _ilike_pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Продукт не найден")


def list_nutrients(session: Session) -> list[Nutrient]:
    stmt = (
        select(Nutrient)
        .where(Nutrient.is_active.is_(True))
        .order_by(Nutrient.sort_order, Nutrient.code)
    )
    return list(session.scalars(stmt).all())


def _food_predicates(
    query: str,
    category_filters: Sequence[tuple[str | None, str | None, bool]],
) -> list:
    predicates = []
    needle = query.strip()
    if needle:
        predicates.append(Food.name.ilike(_ilike_pattern(needle), escape="\\"))
    if category_filters:
        pair_predicates = [
            (Food.category.is_(None) if category is None else Food.category == category)
            if all_subcategories
            else and_(
                Food.category.is_(None) if category is None else Food.category == category,
                Food.subcategory.is_(None) if subcategory is None else Food.subcategory == subcategory,
            )
            for category, subcategory, all_subcategories in set(category_filters)
        ]
        predicates.append(or_(*pair_predicates))
    return predicates


def list_food_categories(session: Session) -> list[FoodCategoryGroup]:
    pairs = session.execute(select(Food.category, Food.subcategory).distinct()).all()
    grouped: dict[str | None, set[str | None]] = {}
    for category, subcategory in pairs:
        grouped.setdefault(category, set()).add(subcategory)

    def nullable_name(value: str | None) -> tuple[bool, str]:
        return value is None, (value or "").casefold()

    return [
        FoodCategoryGroup(
            category=category,
            subcategories=sorted(grouped[category], key=nullable_name),
        )
        for category in sorted(grouped, key=nullable_name)
    ]


def search_foods(
    session: Session,
    query: str,
    food_type: FoodType | None,
    category_filters: Sequence[tuple[str | None, str | None, bool]] = (),
) -> list[Food]:
    stmt = select(Food)
    needle = query.strip()
    stmt = stmt.where(*_food_predicates(query, category_filters))
    if food_type is not None:
        stmt = stmt.where(Food.type == food_type.value)
    if needle:
        stmt = stmt.order_by(
            case((func.lower(Food.name) == needle.lower(), 0), else_=1),
            func.lower(Food.name),
            Food.name,
            Food.uuid,
        )
    else:
        stmt = stmt.order_by(func.lower(Food.name), Food.name, Food.uuid)
    stmt = stmt.limit(LIST_CAP)
    return list(session.scalars(stmt).all())


def list_food_matrix(
    session: Session,
    query: FoodMatrixQuery,
    category_filters: Sequence[tuple[str | None, str | None, bool]],
) -> FoodMatrixPage:
    predicates = _food_predicates(query.q, category_filters)
    foods_stmt = select(Food, func.count().over().label("total_count")).where(*predicates)
    needle = query.q.strip()

    if query.sort == "name":
        if needle:
            foods_stmt = foods_stmt.order_by(
                case((func.lower(Food.name) == needle.lower(), 0), else_=1),
                func.lower(Food.name),
                Food.name,
                Food.uuid,
            )
        else:
            foods_stmt = foods_stmt.order_by(func.lower(Food.name), Food.name, Food.uuid)
    else:
        sort_nutrient_uuid = session.scalar(
            select(Nutrient.uuid).where(
                Nutrient.code == query.sort,
                Nutrient.category == query.nutrient_category.value,
                Nutrient.is_active.is_(True),
            )
        )
        if sort_nutrient_uuid is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Поле сортировки не входит в выбранную группу нутриентов",
            )
        sort_value = (
            select(FoodNutrientValue.value)
            .where(
                FoodNutrientValue.food_uuid == Food.uuid,
                FoodNutrientValue.basis == AS_FED_BASIS,
                FoodNutrientValue.nutrient_uuid == sort_nutrient_uuid,
            )
            .order_by(FoodNutrientValue.updated_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        value_order = sort_value.asc() if query.sort_dir == "asc" else sort_value.desc()
        foods_stmt = foods_stmt.order_by(
            value_order.nulls_last(),
            func.lower(Food.name),
            Food.name,
            Food.uuid,
        )

    page_rows = session.execute(foods_stmt.offset(query.offset).limit(query.limit)).all()
    foods = [row[0] for row in page_rows]
    total = int(page_rows[0][1]) if page_rows else 0
    food_ids = [food.uuid for food in foods]
    values_by_food: dict[UUID, dict[str, float | None]] = {food_uuid: {} for food_uuid in food_ids}
    if food_ids:
        value_rows = session.execute(
            select(
                FoodNutrientValue.food_uuid,
                Nutrient.code,
                FoodNutrientValue.value,
            )
            .join(Nutrient, Nutrient.uuid == FoodNutrientValue.nutrient_uuid)
            .where(
                FoodNutrientValue.food_uuid.in_(food_ids),
                FoodNutrientValue.basis == AS_FED_BASIS,
                Nutrient.category == query.nutrient_category.value,
                Nutrient.is_active.is_(True),
            )
            .distinct(FoodNutrientValue.food_uuid, FoodNutrientValue.nutrient_uuid)
            .order_by(
                FoodNutrientValue.food_uuid,
                FoodNutrientValue.nutrient_uuid,
                FoodNutrientValue.updated_at.desc(),
            )
        ).all()
        for food_uuid, code, value in value_rows:
            values_by_food[food_uuid][code] = float(value) if value is not None else None

    items = [
        FoodMatrixRow(
            **FoodSummary.model_validate(food).model_dump(),
            nutrient_values=[
                FoodMatrixValue(code=code, value=value)
                for code, value in values_by_food[food.uuid].items()
            ],
        )
        for food in foods
    ]
    return FoodMatrixPage(items=items, total=total)


def get_food(session: Session, food_uuid: UUID) -> Food:
    stmt = (
        select(Food)
        .options(selectinload(Food.nutrient_values).selectinload(FoodNutrientValue.nutrient))
        .where(Food.uuid == food_uuid)
        .execution_options(populate_existing=True)
    )
    food = session.scalars(stmt).one_or_none()
    if food is None:
        raise _not_found()
    return food


def create_food(session: Session, data: FoodCreate) -> Food:
    food = Food(**data.model_dump(mode="json"))
    session.add(food)
    session.commit()
    return get_food(session, food.uuid)


def update_food(session: Session, food_uuid: UUID, data: FoodUpdate) -> Food:
    food = get_food(session, food_uuid)
    for key, value in data.model_dump(exclude_unset=True, mode="json").items():
        setattr(food, key, value)
    food.updated_at = utc_now()
    session.commit()
    return get_food(session, food_uuid)


def replace_nutrient_values(
    session: Session,
    food_uuid: UUID,
    values: Sequence[FoodNutrientValueWrite],
) -> Food:
    food = get_food(session, food_uuid)
    codes = [item.code for item in values]
    if len(codes) != len(set(codes)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Код нутриента не должен повторяться",
        )

    nutrient_rows = list(session.scalars(select(Nutrient).where(Nutrient.code.in_(codes))).all())
    nutrients_by_code = {row.code: row for row in nutrient_rows}
    unknown_codes = sorted(set(codes) - nutrients_by_code.keys())
    if unknown_codes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Неизвестные коды нутриентов: {', '.join(unknown_codes)}",
        )

    session.execute(
        delete(FoodNutrientValue).where(
            FoodNutrientValue.food_uuid == food_uuid,
            FoodNutrientValue.basis == AS_FED_BASIS,
        )
    )
    for item in values:
        session.add(
            FoodNutrientValue(
                food_uuid=food.uuid,
                nutrient_uuid=nutrients_by_code[item.code].uuid,
                value=item.value,
                basis=AS_FED_BASIS,
                value_status=item.value_status.value,
                source_uuid=None,
            )
        )
    food.updated_at = utc_now()
    session.commit()
    return get_food(session, food_uuid)


def serialize_nutrient_values(food: Food) -> list[FoodNutrientValueRead]:
    rows = sorted(
        food.nutrient_values,
        key=lambda item: (item.nutrient.sort_order, item.nutrient.code),
    )
    return [
        FoodNutrientValueRead(
            uuid=row.uuid,
            code=row.nutrient.code,
            value=float(row.value) if row.value is not None else None,
            basis=row.basis,
            value_status=row.value_status,
            source_uuid=row.source_uuid,
        )
        for row in rows
    ]
