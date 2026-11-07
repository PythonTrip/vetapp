from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vetdietderm_api.clock import utc_now
from vetdietderm_api.db import Base
from vetdietderm_api.tenancy import TenantOwned
from vetdietderm_api.encounters.models import Encounter
from vetdietderm_api.ids import uuid6
from vetdietderm_api.patients.models import Patient

if TYPE_CHECKING:
    from vetdietderm_api.visits.models import VisitRequest


class Appointment(TenantOwned, Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint(
            "(amount_rub IS NULL OR amount_rub > 0) "
            "AND (NOT paid OR amount_rub IS NOT NULL) "
            "AND (paid OR amount_rub IS NULL OR status = 'completed')",
            name="ck_appointments_charge",
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    patient_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("patients.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    encounter_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("encounters.uuid", ondelete="SET NULL"),
        nullable=True,
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    visit_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    amount_rub: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    patient: Mapped[Patient] = relationship()
    encounter: Mapped[Encounter | None] = relationship()
    visit_request: Mapped["VisitRequest | None"] = relationship(viewonly=True)

    @property
    def owner_problem(self) -> str | None:
        return self.visit_request.reason if self.visit_request else None

    @property
    def encounter_status(self) -> str | None:
        return self.encounter.status if self.encounter else None
