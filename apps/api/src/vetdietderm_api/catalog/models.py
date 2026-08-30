from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Nutrient(Base):
    __tablename__ = "nutrients"
    __table_args__ = (
        CheckConstraint(
            "category IN ('main', 'mineral', 'vitamin', 'amino_acid', 'fatty_acid')",
            name="ck_nutrients_category",
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    base_unit: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class Food(Base):
    __tablename__ = "foods"
    __table_args__ = (
        CheckConstraint(
            "type IN ('commercial', 'ingredient', 'supplement')",
            name="ck_foods_type",
        ),
        CheckConstraint(
            "feed_form IN ('dry', 'wet', 'unknown')",
            name="ck_foods_feed_form",
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    feed_form: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    nutrient_values: Mapped[list["FoodNutrientValue"]] = relationship(
        back_populates="food",
        cascade="all, delete-orphan",
    )


class FoodNutrientValue(Base):
    __tablename__ = "food_nutrient_values"
    __table_args__ = (
        CheckConstraint(
            "basis IN ('per_100g_as_fed', 'per_100g_dm', 'per_1000_kcal', 'per_mj')",
            name="ck_food_nutrient_values_basis",
        ),
        CheckConstraint(
            "value_status IN ('measured', 'calculated', 'estimated', 'trace', "
            "'not_detected', 'unknown')",
            name="ck_food_nutrient_values_status",
        ),
        UniqueConstraint(
            "food_uuid",
            "nutrient_uuid",
            "basis",
            "source_uuid",
            name="uq_food_nutrient_values_identity",
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    food_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("foods.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nutrient_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("nutrients.uuid", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    value: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    basis: Mapped[str] = mapped_column(String(32), nullable=False)
    value_status: Mapped[str] = mapped_column(String(32), nullable=False, default="measured")
    source_uuid: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    food: Mapped[Food] = relationship(back_populates="nutrient_values")
    nutrient: Mapped[Nutrient] = relationship()


class NutrientGroup(Base):
    __tablename__ = "nutrient_groups"

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class NutrientGroupMember(Base):
    __tablename__ = "nutrient_group_members"

    group_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("nutrient_groups.uuid", ondelete="CASCADE"),
        primary_key=True,
    )
    nutrient_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("nutrients.uuid", ondelete="CASCADE"),
        primary_key=True,
    )

