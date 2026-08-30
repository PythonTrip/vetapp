from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AttachmentKind(StrEnum):
    lesion_photo = "lesion_photo"
    document = "document"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class AttachmentUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    encounter_uuid: UUID | None = None
    kind: AttachmentKind | None = None
    caption: str | None = None
    body_region: str | None = None
    vas_score: int | None = Field(default=None, ge=1, le=10)

    @field_validator("caption", "body_region", mode="before")
    @classmethod
    def empty_optional_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    patient_uuid: UUID
    encounter_uuid: UUID | None
    kind: AttachmentKind
    caption: str | None
    body_region: str | None
    vas_score: int | None
    content_type: str
    byte_size: int
    created_at: datetime
    updated_at: datetime
