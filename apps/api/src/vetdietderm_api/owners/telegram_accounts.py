"""Exchange a verified Telegram identity for an owner session."""

import json
import time
from urllib.parse import parse_qs

from fastapi import HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vetdietderm_api.ids import uuid6
from vetdietderm_api.owners import repository as repo, telegram
from vetdietderm_api.owners.clinic_bots import connected_bot
from vetdietderm_api.owners.models import OwnerAccount, OwnerRegistration, OwnerSession, TelegramExchange, TelegramIdentity
from vetdietderm_api.owners.profile import password_owner
from vetdietderm_api.owners.schemas import TelegramLogin, TelegramWidgetLogin
from vetdietderm_api.owners.sessions import COOKIE, create_session, session_digest
from vetdietderm_api.settings import get_settings


def telegram_exchange(body: TelegramLogin, request: Request, response: Response, db: Session, *, link: bool, verified=None, name="Владелец"):
    code = repo.code_by_value(db, body.code)
    if verified is None:
        bot = connected_bot(db, code)
        verified = telegram.validate_init_data(body.init_data, bot.token if bot else None,
                                      get_settings().TELEGRAM_INIT_DATA_MAX_AGE)
        user = json.loads(parse_qs(body.init_data)["user"][0])
        name = " ".join(str(user.get(key) or "") for key in ("first_name", "last_name")).strip()[:255] or name
    identity, digest, expires = verified
    binding = db.scalar(select(TelegramIdentity).join(OwnerAccount).where(
        OwnerAccount.tenant_id == code.tenant_id,
        TelegramIdentity.tenant_id == code.tenant_id, TelegramIdentity.telegram_user_id == identity))
    if link:
        owner = password_owner(db, body, code)
        session = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
        if session and session.expires > time.time() and session.owner_account_uuid != owner.uuid:
            raise HTTPException(409, "Сначала выйдите из другого кабинета владельца")
        other = db.get(TelegramIdentity, owner.uuid)
        if (binding and binding.owner_account_uuid != owner.uuid) or (other and other.telegram_user_id != identity):
            raise HTTPException(409, "Telegram или кабинет уже привязан к другому аккаунту")
        if binding is None:
            db.add(TelegramIdentity(telegram_user_id=identity, owner_account_uuid=owner.uuid, tenant_id=code.tenant_id))
    else:
        session = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
        active_owner = db.get(OwnerAccount, session.owner_account_uuid) if session and session.expires > time.time() else None
        if active_owner and active_owner.tenant_id == code.tenant_id and (
            binding is None or binding.owner_account_uuid != active_owner.uuid
        ):
            raise HTTPException(409, "Сначала выйдите из другого кабинета владельца")
    if not link and binding:
        owner = db.get(OwnerAccount, binding.owner_account_uuid)
    elif not link:
        owner = OwnerAccount(uuid=uuid6(), name=name, phone="", doctor_user_id=code.doctor_user_id,
                             join_code_uuid=code.uuid, workspace=code.workspace, tenant_id=code.tenant_id)
        db.add(owner)
        db.add(OwnerRegistration(owner_account_uuid=owner.uuid))
        db.add(TelegramIdentity(telegram_user_id=identity, owner_account_uuid=owner.uuid, tenant_id=code.tenant_id))
    try:
        # Use one cutoff so a token validated just before expiry cannot delete its
        # own replay marker if the clock passes its expiry during this request.
        cutoff = time.time()
        if expires < cutoff:
            raise HTTPException(401, "Данные Telegram устарели. Откройте Mini App заново")
        db.execute(delete(TelegramExchange).where(TelegramExchange.expires < cutoff))
        db.add(TelegramExchange(digest=digest, expires=expires))
        # Unique constraints serialize replay and concurrent account-link conflicts.
        db.flush()
        create_session(db, request, response, owner)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Привязка конфликтует или данные Telegram уже использованы. Откройте Mini App заново") from exc
    return repo.owner_read(db, owner)


def telegram_widget(body: TelegramWidgetLogin, request: Request, response: Response, db: Session):
    bot = connected_bot(db, repo.code_by_value(db, body.code))
    verified = telegram.validate_widget(body.model_dump(exclude={"code"}), bot.token if bot else None,
                               get_settings().TELEGRAM_INIT_DATA_MAX_AGE)
    return telegram_exchange(TelegramLogin(code=body.code, init_data="widget"), request, response, db, link=False,
                             verified=verified, name=(body.first_name + " " + (body.last_name or "")).strip()[:255])
