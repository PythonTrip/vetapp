from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CommunicationChannel(StrEnum):
    phone = "phone"
    email = "email"
    text = "text"
    video = "video"
    in_person = "in_person"


class CommunicationDirection(StrEnum):
    inbound = "inbound"
    outbound = "outbound"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class CommunicationWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    channel: CommunicationChannel
    direction: CommunicationDirection
    subject: str | None = Field(default=None, max_length=255)
    body: str | None = None
    occurred_at: datetime | None = None
    follow_up_at: datetime | None = None

    @field_validator("subject", "body", mode="before")
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class CommunicationUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    channel: CommunicationChannel | None = None
    direction: CommunicationDirection | None = None
    subject: str | None = Field(default=None, max_length=255)
    body: str | None = None
    occurred_at: datetime | None = None
    follow_up_at: datetime | None = None

    @field_validator("subject", "body", mode="before")
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class CommunicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    patient_uuid: UUID
    client_uuid: UUID
    channel: CommunicationChannel
    direction: CommunicationDirection
    subject: str | None
    body: str | None
    occurred_at: datetime
    follow_up_at: datetime | None
    created_at: datetime
    updated_at: datetime
