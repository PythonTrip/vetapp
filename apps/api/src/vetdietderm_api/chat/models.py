from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6
from vetdietderm_api.owners.models import utc_now


class ChatThread(Base):
    __tablename__ = "chat_threads"
    __table_args__ = (CheckConstraint("owner_animal_uuid IS NOT NULL OR patient_uuid IS NOT NULL", name="ck_chat_thread_animal"),)
    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    owner_animal_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("owner_animals.uuid", ondelete="CASCADE"), unique=True)
    patient_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("patients.uuid", ondelete="CASCADE"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_thread_time", "thread_uuid", "created_at", "uuid"),
        CheckConstraint("author_kind IN ('owner', 'staff')", name="ck_chat_message_author"),
        CheckConstraint("length(trim(body)) > 0 AND length(body) <= 4000", name="ck_chat_message_body"),
    )
    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    thread_uuid: Mapped[UUID] = mapped_column(ForeignKey("chat_threads.uuid", ondelete="CASCADE"))
    author_kind: Mapped[str] = mapped_column(String(16))
    author_id: Mapped[UUID] = mapped_column(Uuid)
    author_label: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
