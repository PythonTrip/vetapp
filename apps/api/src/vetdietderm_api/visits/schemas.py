from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from vetdietderm_api.owners.schemas import RegistrationAccept
from vetdietderm_api.questionnaires.schemas import QuestionKind, QuestionOption, VisitType

VisitStatus = Literal["requested", "scheduled", "rejected", "withdrawn", "cancelled", "completed", "no_show"]


class AnswerWrite(BaseModel):
    question_id: UUID
    value: Any


class AnswerSnapshot(BaseModel):
    question_id: UUID
    label: str
    kind: QuestionKind
    value: Any
    options: list[QuestionOption] = Field(default_factory=list)


class VisitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visit_type: VisitType
    proposed_starts_at: AwareDatetime
    answers: list[AnswerWrite] = Field(default_factory=list)


class VisitConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    starts_at: AwareDatetime
    duration_min: int = Field(ge=5, le=480)
    registration: RegistrationAccept | None = None


class VisitReject(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    reason: str | None = Field(default=None, max_length=500)


class VisitFileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    uuid: UUID
    content_type: str
    byte_size: int
    created_at: datetime


class VisitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    uuid: UUID
    owner_animal_uuid: UUID | None
    patient_uuid: UUID | None
    visit_type: VisitType
    proposed_starts_at: datetime
    confirmed_starts_at: datetime | None
    duration_min: int | None
    status: VisitStatus
    rejection_reason: str | None
    answers: list[AnswerSnapshot]
    files: list[VisitFileRead] = Field(default_factory=list)
    created_at: datetime


class StaffVisitRead(VisitRead):
    registration_uuid: UUID
    registration_status: Literal["pending", "accepted"]
    owner_name: str
    animal_name: str
    can_write: bool
