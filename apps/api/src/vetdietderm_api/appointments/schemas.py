from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from vetdietderm_api.patients.schemas import PatientRead


class AppointmentStatus(StrEnum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class VisitType(StrEnum):
    consultation = "consultation"
    recheck = "recheck"
    procedure = "procedure"
    telemedicine = "telemedicine"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class AppointmentWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    patient_uuid: UUID
    encounter_uuid: UUID | None = None
    starts_at: datetime
    duration_min: int = Field(default=30, ge=5, le=480)
    visit_type: VisitType = VisitType.consultation
    status: AppointmentStatus = AppointmentStatus.scheduled
    notes: str | None = None

    @field_validator("notes", mode="before")
    @classmethod
    def empty_notes_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class AppointmentUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    patient_uuid: UUID | None = None
    encounter_uuid: UUID | None = None
    starts_at: datetime | None = None
    duration_min: int | None = Field(default=None, ge=5, le=480)
    visit_type: VisitType | None = None
    status: AppointmentStatus | None = None
    notes: str | None = None

    @field_validator("notes", mode="before")
    @classmethod
    def empty_notes_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    patient_uuid: UUID
    encounter_uuid: UUID | None
    starts_at: datetime
    duration_min: int
    visit_type: VisitType
    status: AppointmentStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime
    patient: PatientRead
