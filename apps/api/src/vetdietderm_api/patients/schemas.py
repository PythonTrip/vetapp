from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Species(StrEnum):
    dog = "dog"
    cat = "cat"
    other = "other"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _string_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        items = [part.strip() for part in value.split(",")]
        return [item for item in items if item]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


class ClientCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1)
    email: str | None = None
    phone: str | None = None

    @field_validator("email", "phone", mode="before")
    @classmethod
    def empty_contact_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class ClientUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1)
    email: str | None = None
    phone: str | None = None

    @field_validator("email", "phone", mode="before")
    @classmethod
    def empty_contact_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    name: str
    email: str | None
    phone: str | None
    created_at: datetime
    updated_at: datetime


class PatientBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1)
    species: Species
    breed: str = ""
    body_weight_kg: float | None = Field(default=None, gt=0)
    expected_adult_weight_kg: float | None = None
    birth_date: date | None = None
    life_stage: str | None = None
    activity: str | None = None
    neutered: bool = False
    pregnant: bool = False
    lactating: bool = False
    lactation_week: int | None = Field(default=None, ge=0)
    litter_size: int | None = Field(default=None, ge=0)
    bcs: int | None = Field(default=None, ge=1, le=9)
    allergies: list[str] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)
    feeding_notes: str | None = None

    @field_validator("life_stage", "activity", "feeding_notes", mode="before")
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @field_validator("allergies", "chronic_conditions", mode="before")
    @classmethod
    def clean_string_list(cls, value: object) -> list[str]:
        return _string_list(value)


class PatientCreate(PatientBase):
    client_uuid: UUID


class PatientUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    client_uuid: UUID | None = None
    name: str | None = Field(default=None, min_length=1)
    species: Species | None = None
    breed: str | None = None
    body_weight_kg: float | None = Field(default=None, gt=0)
    expected_adult_weight_kg: float | None = None
    birth_date: date | None = None
    life_stage: str | None = None
    activity: str | None = None
    neutered: bool | None = None
    pregnant: bool | None = None
    lactating: bool | None = None
    lactation_week: int | None = Field(default=None, ge=0)
    litter_size: int | None = Field(default=None, ge=0)
    bcs: int | None = Field(default=None, ge=1, le=9)
    allergies: list[str] | None = None
    chronic_conditions: list[str] | None = None
    feeding_notes: str | None = None

    @field_validator("life_stage", "activity", "feeding_notes", mode="before")
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @field_validator("allergies", "chronic_conditions", mode="before")
    @classmethod
    def clean_optional_string_list(cls, value: object) -> list[str] | None:
        if value is None:
            return None
        return _string_list(value)


class PatientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    client_uuid: UUID
    client: ClientRead
    name: str
    species: Species
    breed: str
    body_weight_kg: float | None
    expected_adult_weight_kg: float | None
    birth_date: date | None
    life_stage: str | None
    activity: str | None
    neutered: bool
    pregnant: bool
    lactating: bool
    lactation_week: int | None
    litter_size: int | None
    bcs: int | None
    allergies: list[str]
    chronic_conditions: list[str]
    feeding_notes: str | None
    created_at: datetime
    updated_at: datetime

    @field_validator("body_weight_kg", "expected_adult_weight_kg", mode="before")
    @classmethod
    def numeric_to_float(cls, value: object) -> float | None:
        if value is None:
            return None
        if isinstance(value, Decimal):
            return float(value)
        return float(value)
