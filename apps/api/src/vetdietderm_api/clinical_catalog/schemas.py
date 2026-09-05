from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from vetdietderm_api.encounters.schemas import EncounterSpecialty


class ClinicalCatalogKind(StrEnum):
    field = "field"
    section = "section"


class ClinicalCatalogScope(StrEnum):
    clinic = "clinic"
    doctor = "doctor"


class ClinicalCatalogItemWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    kind: ClinicalCatalogKind
    scope: ClinicalCatalogScope
    specialty: EncounterSpecialty | None = None
    key: str = Field(min_length=1, max_length=160)
    label: str = Field(min_length=1, max_length=160)
    definition: dict[str, Any] = Field(default_factory=dict)
    doctor_name: str | None = Field(default=None, max_length=160)

    @model_validator(mode="after")
    def validate_owner(self) -> "ClinicalCatalogItemWrite":
        if self.scope is ClinicalCatalogScope.doctor and not self.doctor_name:
            raise ValueError("Для личного элемента укажите имя врача")
        if self.scope is ClinicalCatalogScope.clinic:
            self.doctor_name = None
        return self


class ClinicalCatalogItemUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    scope: ClinicalCatalogScope | None = None
    specialty: EncounterSpecialty | None = None
    key: str | None = Field(default=None, min_length=1, max_length=160)
    label: str | None = Field(default=None, min_length=1, max_length=160)
    definition: dict[str, Any] | None = None
    doctor_name: str | None = Field(default=None, max_length=160)


class ClinicalCatalogItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    kind: ClinicalCatalogKind
    scope: ClinicalCatalogScope
    specialty: EncounterSpecialty | None
    key: str
    label: str
    definition: dict[str, Any]
    doctor_name: str | None
    created_at: datetime
    updated_at: datetime
