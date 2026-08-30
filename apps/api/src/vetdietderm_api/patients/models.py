from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Client(Base):
    __tablename__ = "clients"

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    patients: Mapped[list["Patient"]] = relationship(back_populates="client")


class Patient(Base):
    __tablename__ = "patients"

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    client_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("clients.uuid", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    species: Mapped[str] = mapped_column(String(16), nullable=False)
    breed: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    body_weight_kg: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    expected_adult_weight_kg: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    life_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    activity: Mapped[str | None] = mapped_column(String(64), nullable=True)
    neutered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pregnant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    lactating: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    lactation_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    litter_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bcs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allergies: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    chronic_conditions: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    feeding_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    client: Mapped[Client] = relationship(back_populates="patients")
