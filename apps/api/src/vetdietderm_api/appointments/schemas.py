from datetime import datetime
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from vetdietderm_api.patients.schemas import PatientRead
from vetdietderm_api.encounters.schemas import EncounterStatus
from vetdietderm_api.questionnaires.schemas import VisitType as BookableVisitType


class AppointmentStatus(StrEnum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class VisitType(StrEnum):
    primary = "primary"
    secondary = "secondary"
    supervision = "supervision"
    consultation = "consultation"
    recheck = "recheck"
    procedure = "procedure"
    telemedicine = "telemedicine"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def coerce_amount_rub(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError("Сумма должна быть больше нуля")
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError("Сумма должна быть больше нуля") from None


def format_amount_rub(value: object) -> str | None:
    if value is None or value == "":
        return None
    return f"{Decimal(str(value)).quantize(Decimal('0.01')):.2f}"


class AppointmentWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    patient_uuid: UUID
    encounter_uuid: UUID | None = None
    starts_at: datetime
    duration_min: int = Field(default=30, ge=5, le=480)
    visit_type: BookableVisitType = BookableVisitType.consultation
    status: AppointmentStatus = AppointmentStatus.scheduled
    notes: str | None = None
    amount_rub: Decimal | None = None
    paid: bool = False

    @field_validator("notes", mode="before")
    @classmethod
    def empty_notes_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @field_validator("amount_rub", mode="before")
    @classmethod
    def amount_is_decimal(cls, value: object) -> Decimal | None:
        return coerce_amount_rub(value)


class AppointmentUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    patient_uuid: UUID | None = None
    encounter_uuid: UUID | None = None
    starts_at: datetime | None = None
    duration_min: int | None = Field(default=None, ge=5, le=480)
    visit_type: VisitType | None = None
    status: AppointmentStatus | None = None
    notes: str | None = None
    amount_rub: Decimal | None = None
    paid: bool | None = None

    @field_validator("notes", mode="before")
    @classmethod
    def empty_notes_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @field_validator("amount_rub", mode="before")
    @classmethod
    def amount_is_decimal(cls, value: object) -> Decimal | None:
        return coerce_amount_rub(value)


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    patient_uuid: UUID
    encounter_uuid: UUID | None
    encounter_status: EncounterStatus | None = None
    starts_at: datetime
    duration_min: int
    visit_type: VisitType
    status: AppointmentStatus
    amount_rub: str | None = None
    paid: bool = False
    notes: str | None
    owner_problem: str | None

    @field_validator("amount_rub", mode="before")
    @classmethod
    def amount_has_two_places(cls, value: object) -> str | None:
        return format_amount_rub(value)

    created_at: datetime
    updated_at: datetime
    patient: PatientRead
