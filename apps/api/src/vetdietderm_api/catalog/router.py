from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.catalog import repository
from vetdietderm_api.catalog.schemas import (
    FoodCreate,
    FoodCategoryGroup,
    FoodMatrixPage,
    FoodMatrixQuery,
    FoodNutrientValueWrite,
    FoodRead,
    FoodSummary,
    FoodType,
    FoodUpdate,
    NutrientCategory,
    NutrientRead,
)
from vetdietderm_api.db import get_session

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter(tags=["catalog"])
NULL_FILTER_TOKEN = "__none__"
ALL_SUBCATEGORIES_FILTER_TOKEN = "__all__"


def _food_read(food) -> FoodRead:
    summary = FoodSummary.model_validate(food)
    return FoodRead(
        **summary.model_dump(),
        nutrient_values=repository.serialize_nutrient_values(food),
    )


def _category_filters(
    categories: list[str] | None,
    subcategories: list[str] | None,
) -> list[tuple[str | None, str | None, bool]]:
    if not categories and not subcategories:
        return []
    if not categories or not subcategories or len(categories) != len(subcategories):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="category и subcategory должны передаваться парами",
        )

    def decode(value: str) -> str | None:
        return None if value == NULL_FILTER_TOKEN else value

    return [
        (
            decode(category),
            None if subcategory == ALL_SUBCATEGORIES_FILTER_TOKEN else decode(subcategory),
            subcategory == ALL_SUBCATEGORIES_FILTER_TOKEN,
        )
        for category, subcategory in zip(categories, subcategories)
    ]


@router.get("/foods", response_model=list[FoodSummary])
@logger.catch(reraise=True)
def list_foods(
    session: SessionDep,
    q: Annotated[str, Query()] = "",
    type: Annotated[FoodType | None, Query()] = None,
    category: Annotated[list[str] | None, Query()] = None,
    subcategory: Annotated[list[str] | None, Query()] = None,
) -> list[FoodSummary]:
    filters = _category_filters(category, subcategory)
    return [
        FoodSummary.model_validate(row)
        for row in repository.search_foods(session, q, type, filters)
    ]


@router.get("/foods/matrix", response_model=FoodMatrixPage)
@logger.catch(reraise=True)
def list_food_matrix(
    session: SessionDep,
    nutrient_category: Annotated[NutrientCategory, Query()],
    q: Annotated[str, Query()] = "",
    category: Annotated[list[str] | None, Query()] = None,
    subcategory: Annotated[list[str] | None, Query()] = None,
    sort: Annotated[str, Query()] = "name",
    sort_dir: Annotated[Literal["asc", "desc"], Query()] = "asc",
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> FoodMatrixPage:
    filters = _category_filters(category, subcategory)
    query = FoodMatrixQuery(
        q=q,
        category=category or [],
        subcategory=subcategory or [],
        nutrient_category=nutrient_category,
        sort=sort,
        sort_dir=sort_dir,
        offset=offset,
        limit=limit,
    )
    return repository.list_food_matrix(session, query, filters)


@router.get("/foods/categories", response_model=list[FoodCategoryGroup])
@logger.catch(reraise=True)
def list_food_categories(session: SessionDep) -> list[FoodCategoryGroup]:
    return repository.list_food_categories(session)


@router.get("/foods/{food_id}", response_model=FoodRead)
@logger.catch(reraise=True)
def read_food(food_id: UUID, session: SessionDep) -> FoodRead:
    return _food_read(repository.get_food(session, food_id))


@router.post("/foods", response_model=FoodRead, status_code=201)
@logger.catch(reraise=True)
def create_food(payload: FoodCreate, session: SessionDep) -> FoodRead:
    return _food_read(repository.create_food(session, payload))


@router.patch("/foods/{food_id}", response_model=FoodRead)
@logger.catch(reraise=True)
def patch_food(food_id: UUID, payload: FoodUpdate, session: SessionDep) -> FoodRead:
    return _food_read(repository.update_food(session, food_id, payload))


@router.put("/foods/{food_id}/nutrient-values", response_model=FoodRead)
@logger.catch(reraise=True)
def put_nutrient_values(
    food_id: UUID,
    payload: list[FoodNutrientValueWrite],
    session: SessionDep,
) -> FoodRead:
    return _food_read(repository.replace_nutrient_values(session, food_id, payload))


@router.get("/nutrients", response_model=list[NutrientRead])
@logger.catch(reraise=True)
def list_nutrients(session: SessionDep) -> list[NutrientRead]:
    return [NutrientRead.model_validate(row) for row in repository.list_nutrients(session)]
