from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EncounterSpecialty(StrEnum):
    dermatology = "dermatology"
    nutrition = "nutrition"
    general = "general"


class EncounterType(StrEnum):
    appointment = "appointment"
    note = "note"
    diagnostic = "diagnostic"
    treatment = "treatment"


class EncounterStatus(StrEnum):
    draft = "draft"
    in_progress = "in_progress"
    completed = "completed"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class PrescriptionItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1)
    dosage: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str = ""


class AnamnesisData(BaseModel):
    specialty: EncounterSpecialty
    answers: dict[str, str | list[str]] = Field(default_factory=dict)
    free_text: str | None = None


class EncounterWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    specialty: EncounterSpecialty = EncounterSpecialty.general
    type: EncounterType = EncounterType.appointment
    status: EncounterStatus = EncounterStatus.draft
    chief_complaint: str | None = None
    anamnesis: str | None = None
    anamnesis_data: AnamnesisData | None = None
    exam: str | None = None
    plan: str | None = None
    diagnoses: list[str] = Field(default_factory=list)
    prescriptions: list[PrescriptionItem] = Field(default_factory=list)
    vas_score: int | None = Field(default=None, ge=1, le=10)
    occurred_at: datetime | None = None

    @field_validator(
        "chief_complaint",
        "anamnesis",
        "exam",
        "plan",
        mode="before",
    )
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @field_validator("diagnoses", mode="before")
    @classmethod
    def clean_diagnoses(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return []


class EncounterUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    specialty: EncounterSpecialty | None = None
    type: EncounterType | None = None
    status: EncounterStatus | None = None
    chief_complaint: str | None = None
    anamnesis: str | None = None
    anamnesis_data: AnamnesisData | None = None
    exam: str | None = None
    plan: str | None = None
    diagnoses: list[str] | None = None
    prescriptions: list[PrescriptionItem] | None = None
    vas_score: int | None = Field(default=None, ge=1, le=10)
    occurred_at: datetime | None = None

    @field_validator(
        "chief_complaint",
        "anamnesis",
        "exam",
        "plan",
        mode="before",
    )
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @field_validator("diagnoses", mode="before")
    @classmethod
    def clean_optional_diagnoses(cls, value: object) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return []


class EncounterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    patient_uuid: UUID
    specialty: EncounterSpecialty
    type: EncounterType
    status: EncounterStatus
    chief_complaint: str | None
    anamnesis: str | None
    anamnesis_data: dict[str, Any] | None
    exam: str | None
    plan: str | None
    diagnoses: list[str]
    prescriptions: list[dict[str, Any]]
    vas_score: int | None
    occurred_at: datetime
    created_at: datetime
    updated_at: datetime
