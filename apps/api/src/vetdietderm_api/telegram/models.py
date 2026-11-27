"""Persisted Telegram transport updates."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, String, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.clock import utc_now
from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6

BOT_UPDATE_UNIQUE_CONSTRAINT = "uq_telegram_updates_bot_update"


class TelegramUpdate(Base):
    __tablename__ = "telegram_updates"
    __table_args__ = (
        UniqueConstraint("bot_id", "update_id", name=BOT_UPDATE_UNIQUE_CONSTRAINT),
        CheckConstraint("update_kind IN ('message', 'edited_message')", name="ck_telegram_updates_kind"),
        CheckConstraint(
            "transport_status IN ('queued', 'claimed', 'complete', 'error')",
            name="ck_telegram_updates_transport_status",
        ),
        Index("ix_telegram_updates_transport_created", "transport_status", "created_at"),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    clinic_id: Mapped[UUID] = mapped_column(Uuid)
    integration_id: Mapped[UUID] = mapped_column(Uuid)
    bot_id: Mapped[int] = mapped_column(BigInteger)
    update_id: Mapped[int] = mapped_column(BigInteger)
    update_kind: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    transport_status: Mapped[str] = mapped_column(String(16), server_default="queued")
    attempt_count: Mapped[int] = mapped_column(server_default="0")
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    transport_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
