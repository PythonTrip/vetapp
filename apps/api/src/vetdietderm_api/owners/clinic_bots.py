"""Clinic bot configuration and uniqueness checks."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vetdietderm_api.owners import telegram
from vetdietderm_api.owners.models import ClinicBot, JoinCode
from vetdietderm_api.owners.schemas import ClinicBotRead, ClinicBotStatus, ClinicBotWrite

DUPLICATE_BOT = "Этот бот уже подключён к другой клинике"


def connected_bot(db: Session, code: JoinCode) -> ClinicBot | None:
    bot = db.get(ClinicBot, code.tenant_id)
    return bot if bot and bot.status == ClinicBotStatus.connected else None


def clinic_bot_read(row: ClinicBot | None) -> ClinicBotRead:
    if row is None:
        return ClinicBotRead()
    return ClinicBotRead(status=ClinicBotStatus(row.status), bot_id=row.bot_id,
                         username=row.username, last_error=row.last_error)


def save_clinic_bot(body: ClinicBotWrite, user: dict, tenant_id: str, db: Session) -> ClinicBotRead:
    org = user.get("organization") or {}
    if org.get("org_role") not in {"owner", "admin"}:
        raise HTTPException(403, "Подключить бота могут владелец и администратор клиники")
    clinic = UUID(str(tenant_id))
    checked = telegram.fetch_bot_identity(body.token)
    row = db.get(ClinicBot, clinic, with_for_update=True)
    if isinstance(checked, str):
        if row is not None and row.status == ClinicBotStatus.connected:
            raise HTTPException(422, checked)
        if row is None:
            db.add(ClinicBot(clinic_id=clinic, status=ClinicBotStatus.error, token=None,
                             bot_id=None, username=None, last_error=checked))
        else:
            row.status = ClinicBotStatus.error
            row.token = None
            row.last_error = checked
        db.commit()
        raise HTTPException(422, checked)
    bot_id, username = checked
    taken = db.scalar(select(ClinicBot.clinic_id).where(
        ClinicBot.bot_id == bot_id, ClinicBot.clinic_id != clinic))
    if taken is not None:
        raise HTTPException(409, DUPLICATE_BOT)
    if row is None:
        row = ClinicBot(clinic_id=clinic, token=body.token, bot_id=bot_id, username=username,
                        status=ClinicBotStatus.connected, last_error=None)
        db.add(row)
    else:
        row.token = body.token
        row.bot_id = bot_id
        row.username = username
        row.status = ClinicBotStatus.connected
        row.last_error = None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, DUPLICATE_BOT) from None
    return clinic_bot_read(row)



def read_clinic_bot(db: Session, clinic_id: UUID) -> ClinicBotRead:
    return clinic_bot_read(db.get(ClinicBot, clinic_id))
