from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

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
