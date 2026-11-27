from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints


class ContactUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    local_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ContactClientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_uuid: UUID | None


class ContactLinkEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    clinic_id: UUID
    contact_uuid: UUID
    actor_user_id: UUID
    actor_label: str
    previous_client_uuid: UUID | None
    new_client_uuid: UUID | None
    created_at: datetime


class ContactRead(BaseModel):
    uuid: UUID
    clinic_id: UUID
    telegram_user_id: int
    telegram_chat_id: int
    profile_name: str | None
    username: str | None
    local_name: str
    client_uuid: UUID | None
    conversation_uuid: UUID
    created_at: datetime
    updated_at: datetime


class ConversationMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    clinic_id: UUID
    conversation_uuid: UUID
    direction: Literal["inbound", "outbound"]
    channel: Literal["telegram"]
    origin: Literal["telegram", "owner_cabinet"]
    occurred_at: datetime
    bot_id: int | None
    telegram_chat_id: int | None
    telegram_message_id: int | None
    source_update_id: int | None
    edited_at: datetime | None
    body: str | None
    author_user_id: UUID | None
    author_label: str | None
    source_chat_message_uuid: UUID | None
    created_at: datetime
