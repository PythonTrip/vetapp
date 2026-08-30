from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from vetdietderm_api.encounters.schemas import EncounterSpecialty


class TemplateScope(StrEnum):
    standard = "standard"
    clinic = "clinic"
    doctor = "doctor"


class TemplateSection(StrEnum):
    anamnesis = "anamnesis"
    exam = "exam"
    plan = "plan"


class EncounterTemplateWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    scope: TemplateScope
    section: TemplateSection
    specialty: EncounterSpecialty
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1)
    doctor_name: str | None = Field(default=None, max_length=160)

    @model_validator(mode="after")
    def validate_scope(self) -> "EncounterTemplateWrite":
        if self.scope is TemplateScope.standard:
            raise ValueError("Стандартные шаблоны управляются приложением")
        if self.scope is TemplateScope.doctor and not self.doctor_name:
            raise ValueError("Для шаблона врача укажите имя врача")
        if self.scope is TemplateScope.clinic:
            self.doctor_name = None
        return self


class EncounterTemplateUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    scope: TemplateScope | None = None
    section: TemplateSection | None = None
    specialty: EncounterSpecialty | None = None
    title: str | None = Field(default=None, min_length=1, max_length=160)
    body: str | None = Field(default=None, min_length=1)
    doctor_name: str | None = Field(default=None, max_length=160)


class EncounterTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    scope: TemplateScope
    section: TemplateSection
    specialty: EncounterSpecialty
    title: str
    body: str
    doctor_name: str | None
    created_at: datetime
    updated_at: datetime
