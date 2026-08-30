from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.catalog.models import (
    Food,
    FoodNutrientValue,
    Nutrient,
    NutrientGroup,
    NutrientGroupMember,
)
from vetdietderm_api.guidelines.models import (
    ApplicabilityRule,
    DerivedExpression,
    EnergyFormula,
    GrowthSizeClass,
    GuidelineEdition,
    GuidelineProfile,
    GuidelineStandard,
    GuidelineTarget,
    LactationFactor,
    SourceReference,
)


@dataclass(frozen=True)
class FoodValue:
    value: float | None
    value_status: str


@dataclass(frozen=True)
class FoodSnapshot:
    uuid: UUID
    name: str
    type: str
    feed_form: str
    values: dict[str, FoodValue]


@dataclass(frozen=True)
class PublishedGuideline:
    edition: GuidelineEdition
    profiles: dict[str, GuidelineProfile]
    formulas: dict[str, EnergyFormula]
    size_classes: dict[str, GrowthSizeClass]
    targets: list[GuidelineTarget]
    derived: dict[UUID, DerivedExpression]
    nutrients: dict[UUID, Nutrient]
    nutrients_by_code: dict[str, Nutrient]
    rules: dict[UUID, ApplicabilityRule]
    sources: dict[UUID, SourceReference]
    groups: dict[str, list[str]]
    lactation_factors: dict[tuple[str, int], float]


def load_published_guideline(session: Session) -> PublishedGuideline:
    edition = session.scalars(
        select(GuidelineEdition)
        .join(GuidelineStandard, GuidelineEdition.standard_uuid == GuidelineStandard.uuid)
        .where(GuidelineStandard.code == "fediaf", GuidelineEdition.status == "published")
        .order_by(GuidelineEdition.published_at.desc())
        .limit(1)
    ).one_or_none()
    if edition is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "guideline_not_published",
                "message": "Опубликованная редакция FEDIAF не найдена",
            },
        )

    profiles = {
        item.code: item
        for item in session.scalars(
            select(GuidelineProfile).where(GuidelineProfile.edition_uuid == edition.uuid)
        )
    }
    formulas = {
        item.code: item
        for item in session.scalars(
            select(EnergyFormula).where(
                EnergyFormula.edition_uuid == edition.uuid,
                EnergyFormula.active.is_(True),
            )
        )
    }
    size_classes = {
        item.code: item
        for item in session.scalars(
            select(GrowthSizeClass).where(GrowthSizeClass.edition_uuid == edition.uuid)
        )
    }
    targets = list(
        session.scalars(
            select(GuidelineTarget)
            .where(GuidelineTarget.edition_uuid == edition.uuid)
            .order_by(GuidelineTarget.sort_order, GuidelineTarget.source_code)
        )
    )
    derived = {
        item.uuid: item
        for item in session.scalars(
            select(DerivedExpression).where(DerivedExpression.edition_uuid == edition.uuid)
        )
    }
    rules = {
        item.uuid: item
        for item in session.scalars(
            select(ApplicabilityRule).where(ApplicabilityRule.edition_uuid == edition.uuid)
        )
    }
    sources = {
        item.uuid: item
        for item in session.scalars(
            select(SourceReference).where(SourceReference.edition_uuid == edition.uuid)
        )
    }
    nutrients = {item.uuid: item for item in session.scalars(select(Nutrient))}
    memberships = session.execute(
        select(NutrientGroup.code, Nutrient.code)
        .join(NutrientGroupMember, NutrientGroupMember.group_uuid == NutrientGroup.uuid)
        .join(Nutrient, Nutrient.uuid == NutrientGroupMember.nutrient_uuid)
    ).all()
    groups: dict[str, list[str]] = {}
    for group_code, nutrient_code in memberships:
        groups.setdefault(group_code, []).append(nutrient_code)
    lactation_factors = {
        (item.species_code, item.week): float(item.factor)
        for item in session.scalars(
            select(LactationFactor).where(LactationFactor.edition_uuid == edition.uuid)
        )
    }
    return PublishedGuideline(
        edition=edition,
        profiles=profiles,
        formulas=formulas,
        size_classes=size_classes,
        targets=targets,
        derived=derived,
        nutrients=nutrients,
        nutrients_by_code={item.code: item for item in nutrients.values()},
        rules=rules,
        sources=sources,
        groups=groups,
        lactation_factors=lactation_factors,
    )


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
