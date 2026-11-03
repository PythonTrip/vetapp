from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JoinCode(Base):
    __tablename__ = "join_codes"
    __table_args__ = (
        Index("uq_join_codes_personal", "doctor_user_id", unique=True,
              postgresql_where=text("tenant_id IS NULL"), sqlite_where=text("tenant_id IS NULL")),
        Index("uq_join_codes_organization", "doctor_user_id", "tenant_id", unique=True,
              postgresql_where=text("tenant_id IS NOT NULL"), sqlite_where=text("tenant_id IS NOT NULL")),
    )
    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    doctor_user_id: Mapped[UUID] = mapped_column(Uuid)
    doctor_label: Mapped[str] = mapped_column(String(255))
    workspace: Mapped[str] = mapped_column(String(16))
    tenant_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    organization_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class OwnerAccount(Base):
    __tablename__ = "owner_accounts"
    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    phone: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str | None] = mapped_column(String(128))
    password_salt: Mapped[str | None] = mapped_column(String(64))
    doctor_user_id: Mapped[UUID | None] = mapped_column(Uuid)
    join_code_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("join_codes.uuid"))
    workspace: Mapped[str | None] = mapped_column(String(16))
    tenant_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class OwnerSession(Base):
    __tablename__ = "owner_sessions"
    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_account_uuid: Mapped[UUID] = mapped_column(ForeignKey("owner_accounts.uuid", ondelete="CASCADE"))
    expires: Mapped[float] = mapped_column(Float, index=True)


class TelegramIdentity(Base):
    __tablename__ = "owner_telegram_identities"
    telegram_user_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    owner_account_uuid: Mapped[UUID] = mapped_column(ForeignKey("owner_accounts.uuid", ondelete="CASCADE"), unique=True)


class TelegramExchange(Base):
    __tablename__ = "owner_telegram_exchanges"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires: Mapped[float] = mapped_column(Float, index=True)


class StaffEmailReservation(Base):
    __tablename__ = "staff_email_reservations"
    email: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(Uuid)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class OwnerRegistration(Base):
    __tablename__ = "owner_registrations"
    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    owner_account_uuid: Mapped[UUID] = mapped_column(ForeignKey("owner_accounts.uuid"), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    client_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("clients.uuid", ondelete="RESTRICT"), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class OwnerAnimal(Base):
    __tablename__ = "owner_animals"
    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    registration_uuid: Mapped[UUID] = mapped_column(ForeignKey("owner_registrations.uuid"), index=True)
    patient_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("patients.uuid", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    species: Mapped[str] = mapped_column(String(16))
    breed: Mapped[str] = mapped_column(String(255), default="", server_default="")
    sex: Mapped[str] = mapped_column(String(16), default="unspecified", server_default="unspecified")
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ClinicBot(Base):
    __tablename__ = "clinic_bots"
    __table_args__ = (
        CheckConstraint("status IN ('connected', 'error')", name="ck_clinic_bots_status"),
        UniqueConstraint("bot_id", name="uq_clinic_bots_bot_id"),
    )
    clinic_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    token: Mapped[str | None] = mapped_column(String(256))
    bot_id: Mapped[int | None] = mapped_column(BigInteger)
    username: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))
    last_error: Mapped[str | None] = mapped_column(String(500))

    def __repr__(self) -> str:
        return (f"ClinicBot(clinic_id={self.clinic_id!r}, bot_id={self.bot_id!r}, "
                f"username={self.username!r}, status={self.status!r})")


class OwnerUpload(Base):
    __tablename__ = "owner_uploads"
    __table_args__ = (CheckConstraint("kind IN ('photo', 'document', 'chat')", name="ck_owner_upload_kind"),)
    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    owner_account_uuid: Mapped[UUID] = mapped_column(ForeignKey("owner_accounts.uuid", ondelete="CASCADE"), index=True)
    # Identifies either an OwnerAnimal or an accepted Patient; authorization resolves both.
    animal_uuid: Mapped[UUID] = mapped_column(Uuid, index=True)
    message_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("chat_messages.uuid", ondelete="CASCADE"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(16))
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    byte_size: Mapped[int] = mapped_column(BigInteger)
    storage_key: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
