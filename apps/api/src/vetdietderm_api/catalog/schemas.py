from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class FoodType(StrEnum):
    commercial = "commercial"
    ingredient = "ingredient"
    supplement = "supplement"


class FeedForm(StrEnum):
    dry = "dry"
    wet = "wet"
    unknown = "unknown"


class NutrientCategory(StrEnum):
    main = "main"
    mineral = "mineral"
    vitamin = "vitamin"
    amino_acid = "amino_acid"
    fatty_acid = "fatty_acid"


class NutrientValueStatus(StrEnum):
    measured = "measured"
    calculated = "calculated"
    estimated = "estimated"
    trace = "trace"
    not_detected = "not_detected"
    unknown = "unknown"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class FoodCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=255)
    type: FoodType
    feed_form: FeedForm = FeedForm.unknown
    category: str | None = Field(default=None, max_length=255)
    subcategory: str | None = Field(default=None, max_length=255)

    @field_validator("category", "subcategory", mode="before")
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class FoodUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: FoodType | None = None
    feed_form: FeedForm | None = None
    category: str | None = Field(default=None, max_length=255)
    subcategory: str | None = Field(default=None, max_length=255)

    @field_validator("category", "subcategory", mode="before")
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @model_validator(mode="after")
    def required_fields_cannot_be_null(self) -> "FoodUpdate":
        for field_name in ("name", "type", "feed_form"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self


class NutrientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    code: str
    name: str
    category: NutrientCategory
    base_unit: str
    sort_order: int
    is_active: bool


class FoodNutrientValueWrite(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    value: Decimal | None = Field(default=None, ge=0)
    value_status: NutrientValueStatus = NutrientValueStatus.measured
    basis: Literal["per_100g_as_fed"] = "per_100g_as_fed"

    @model_validator(mode="after")
    def require_unknown_for_null(self) -> "FoodNutrientValueWrite":
        if self.value is None and self.value_status != NutrientValueStatus.unknown:
            raise ValueError("NULL value requires value_status=unknown")
        return self


class FoodNutrientValueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    code: str
    value: float | None
    basis: str
    value_status: NutrientValueStatus
    source_uuid: UUID | None


class FoodSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    name: str
    type: FoodType
    feed_form: FeedForm
    category: str | None
    subcategory: str | None
    created_at: datetime
    updated_at: datetime


class FoodCategoryGroup(BaseModel):
    category: str | None
    subcategories: list[str | None]


class FoodMatrixQuery(BaseModel):
    q: str = ""
    category: list[str] = Field(default_factory=list)
    subcategory: list[str] = Field(default_factory=list)
    nutrient_category: NutrientCategory
    sort: str = "name"
    sort_dir: Literal["asc", "desc"] = "asc"
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=100)


class FoodMatrixValue(BaseModel):
    code: str
    value: float | None


class FoodMatrixRow(FoodSummary):
    nutrient_values: list[FoodMatrixValue]


class FoodMatrixPage(BaseModel):
    items: list[FoodMatrixRow]
    total: int


class FoodRead(FoodSummary):
    nutrient_values: list[FoodNutrientValueRead]
