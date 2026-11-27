from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Text, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from vetdietderm_api.clock import utc_now
from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6
from vetdietderm_api.messaging.models import ClinicContact


class ClinicContactLinkEvent(Base):
    __tablename__ = "clinic_contact_link_events"
    __table_args__ = (
        Index("ix_clinic_contact_link_events_contact_history", "contact_uuid", "clinic_id", "created_at", "uuid"),
    )

    uuid: Mapped[UUID] = mapped_column(primary_key=True, default=uuid6)
    clinic_id: Mapped[UUID]
    contact_uuid: Mapped[UUID] = mapped_column(ForeignKey("clinic_contacts.uuid", ondelete="CASCADE"))
    actor_user_id: Mapped[UUID]
    actor_label: Mapped[str] = mapped_column(Text)
    previous_client_uuid: Mapped[UUID | None]
    new_client_uuid: Mapped[UUID | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


def change_client_link(
    session: Session, contact: ClinicContact, client_uuid: UUID | None, *, actor_user_id: UUID, actor_label: str,
) -> None:
    """Stage the link and its event together. The caller holds the contact row lock."""
    if contact.client_uuid == client_uuid:
        return
    session.add(ClinicContactLinkEvent(
        clinic_id=contact.clinic_id,
        contact_uuid=contact.uuid,
        actor_user_id=actor_user_id,
        actor_label=actor_label,
        previous_client_uuid=contact.client_uuid,
        new_client_uuid=client_uuid,
    ))
    contact.client_uuid = client_uuid


def list_link_events(session: Session, clinic_id: UUID, contact_uuid: UUID) -> list[ClinicContactLinkEvent]:
    event = ClinicContactLinkEvent
    return list(session.scalars(
        select(event)
        .where(event.clinic_id == clinic_id, event.contact_uuid == contact_uuid)
        .order_by(event.created_at, event.uuid)
    ))
