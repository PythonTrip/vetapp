from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Text, UniqueConstraint, false, text
from sqlalchemy.orm import Mapped, mapped_column, query_expression

from vetdietderm_api.clock import utc_now
from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6


class ClinicContact(Base):
    __tablename__ = "clinic_contacts"
    __table_args__ = (
        UniqueConstraint("clinic_id", "telegram_user_id", name="uq_clinic_contacts_user"),
        UniqueConstraint("clinic_id", "telegram_chat_id", name="uq_clinic_contacts_chat"),
    )

    uuid: Mapped[UUID] = mapped_column(primary_key=True, default=uuid6)
    clinic_id: Mapped[UUID]
    telegram_user_id: Mapped[int] = mapped_column(BigInteger)
    telegram_chat_id: Mapped[int] = mapped_column(BigInteger)
    profile_name: Mapped[str | None] = mapped_column(Text)
    username: Mapped[str | None] = mapped_column(Text)
    local_name: Mapped[str] = mapped_column(Text)
    client_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("clients.uuid", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class ClinicConversation(Base):
    __tablename__ = "clinic_conversations"
    __table_args__ = (
        UniqueConstraint("clinic_id", "contact_uuid", name="uq_clinic_conversations_contact"),
    )

    uuid: Mapped[UUID] = mapped_column(primary_key=True, default=uuid6)
    clinic_id: Mapped[UUID]
    contact_uuid: Mapped[UUID] = mapped_column(ForeignKey("clinic_contacts.uuid", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


EXTERNAL_MESSAGE_IDENTITY = ("bot_id", "telegram_chat_id", "telegram_message_id")
EXTERNAL_MESSAGE_PREDICATE = text(
    "bot_id IS NOT NULL AND telegram_chat_id IS NOT NULL AND telegram_message_id IS NOT NULL"
)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (
        CheckConstraint("direction IN ('inbound', 'outbound')", name="ck_conversation_messages_direction"),
        CheckConstraint("channel = 'telegram'", name="ck_conversation_messages_channel"),
        CheckConstraint("origin IN ('telegram', 'owner_cabinet')", name="ck_conversation_messages_origin"),
        Index(
            "uq_conversation_messages_external", *EXTERNAL_MESSAGE_IDENTITY,
            unique=True, postgresql_where=EXTERNAL_MESSAGE_PREDICATE,
        ),
        Index(
            "uq_conversation_messages_source", "source_chat_message_uuid",
            unique=True, postgresql_where=text("source_chat_message_uuid IS NOT NULL"),
        ),
        CheckConstraint(
            "delivery_status IN ('queued', 'sent', 'failed', 'unconfirmed')",
            name="ck_conversation_messages_delivery_status",
        ),
        Index(
            "uq_conversation_messages_idempotency", "conversation_uuid", "idempotency_key",
            unique=True, postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
        Index(
            "ix_conversation_messages_delivery_queue", "created_at", "uuid",
            postgresql_where=text("delivery_status = 'queued'"),
        ),
    )

    uuid: Mapped[UUID] = mapped_column(primary_key=True, default=uuid6)
    clinic_id: Mapped[UUID]
    conversation_uuid: Mapped[UUID] = mapped_column(ForeignKey("clinic_conversations.uuid", ondelete="CASCADE"))
    direction: Mapped[str] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(Text)
    origin: Mapped[str] = mapped_column(Text, server_default="telegram")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    bot_id: Mapped[int | None] = mapped_column(BigInteger)
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger)
    telegram_message_id: Mapped[int | None] = mapped_column(BigInteger)
    source_update_id: Mapped[int | None] = mapped_column(BigInteger)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    body: Mapped[str | None] = mapped_column(Text)
    attachment_storage_key: Mapped[str | None] = mapped_column(Text)
    attachment_content_type: Mapped[str | None] = mapped_column(Text)
    attachment_byte_size: Mapped[int | None] = mapped_column(BigInteger)
    unsupported_attachment: Mapped[bool] = mapped_column(server_default=false())
    author_user_id: Mapped[UUID | None]
    author_label: Mapped[str | None] = mapped_column(Text)
    source_chat_message_uuid: Mapped[UUID | None]
    patient_uuid: Mapped[UUID | None] = mapped_column(
        ForeignKey("patients.uuid", name="fk_conversation_messages_patient", ondelete="RESTRICT"),
    )
    patient_current: Mapped[bool] = query_expression()
    delivery_status: Mapped[str | None] = mapped_column(Text)
    delivery_attempt_count: Mapped[int] = mapped_column(server_default="0")
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    target_bot_id: Mapped[int | None] = mapped_column(BigInteger)
    delivery_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    @property
    def has_attachment(self) -> bool:
        return self.attachment_storage_key is not None
