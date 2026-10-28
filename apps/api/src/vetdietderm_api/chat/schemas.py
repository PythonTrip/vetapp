from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints


class MessageCreate(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    uuid: UUID
    author_kind: Literal["owner", "staff"]
    author_label: str
    body: str
    created_at: datetime
