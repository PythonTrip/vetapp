"""Owner credentials and synchronization with linked clinical profiles."""

import secrets
import time

from fastapi import HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vetdietderm_api.clock import utc_now
from vetdietderm_api.owners import repository as repo
from vetdietderm_api.owners.models import JoinCode, OwnerAccount, OwnerRegistration, OwnerSession
from vetdietderm_api.owners.schemas import OwnerCredentials, OwnerLogin, OwnerProfileUpdate, OwnerRegister
from vetdietderm_api.owners.sessions import COOKIE, create_session, session_digest


def register(body: OwnerRegister, request: Request, response: Response, db: Session):
    code = repo.code_by_value(db, body.code)
    repo.email_available(db, body.email, code.tenant_id)
    session = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
    active_owner = db.get(OwnerAccount, session.owner_account_uuid) if session and session.expires > time.time() else None
    if active_owner and active_owner.tenant_id == code.tenant_id:
        raise HTTPException(409, "В этой клинике уже открыт кабинет владельца")
    salt = secrets.token_hex(16)
    owner = OwnerAccount(name=body.name, email=body.email, phone=body.phone,
                         password_salt=salt, password_hash=repo.password_hash(body.password, salt),
                         doctor_user_id=code.doctor_user_id, join_code_uuid=code.uuid,
                         workspace=code.workspace, tenant_id=code.tenant_id)
    db.add(owner)
    try:
        db.flush()
        db.add(OwnerRegistration(owner_account_uuid=owner.uuid))
        create_session(db, request, response, owner)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, repo.TAKEN_EMAIL) from exc
    return repo.owner_read(db, owner)


def password_owner(db: Session, body: OwnerLogin, code: JoinCode) -> OwnerAccount:
    owner = db.scalar(select(OwnerAccount).where(OwnerAccount.email == repo.normalize_email(body.email),
                                               OwnerAccount.tenant_id == code.tenant_id))
    # Equal expensive work for unknown emails and incorrect passwords.
    candidate = repo.password_hash(body.password, owner.password_salt if owner and owner.password_salt else "00" * 16)
    if owner is None or not secrets.compare_digest(candidate, owner.password_hash or ""):
        raise HTTPException(401, "Неверная почта или пароль")
    return owner


def set_credentials(body: OwnerCredentials, owner: OwnerAccount, db: Session):
    # Only initial setup: existing passwords require a separate reauthentication flow.
    registration = repo.registration_for_owner(db, owner, lock=True)
    db.refresh(owner, with_for_update=True)
    if owner.password_hash:
        raise HTTPException(409, "Вход по почте уже настроен")
    repo.email_available(db, body.email, owner.tenant_id, owner.uuid)
    if registration.client_uuid:
        code = db.get(JoinCode, owner.join_code_uuid)
        client = repo.linked_client(db, registration.client_uuid, code)
        client.email = body.email
        client.updated_at = utc_now()
    owner.email = body.email
    owner.password_salt = secrets.token_hex(16)
    owner.password_hash = repo.password_hash(body.password, owner.password_salt)
    owner.updated_at = utc_now()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, repo.TAKEN_EMAIL) from exc
    return repo.owner_read(db, owner)


def update_me(body: OwnerProfileUpdate, owner: OwnerAccount, db: Session):
    registration = repo.registration_for_owner(db, owner, lock=True)
    if owner.password_hash and not body.email:
        raise HTTPException(422, "Укажите почту для входа")
    if body.email:
        repo.email_available(db, body.email, owner.tenant_id, owner.uuid)
    if registration.client_uuid:
        code = db.get(JoinCode, owner.join_code_uuid)
        client = repo.linked_client(db, registration.client_uuid, code)
        for key, value in body.model_dump().items():
            setattr(client, key, value or None if key == "email" else value)
        client.updated_at = utc_now()
    for key, value in body.model_dump().items():
        setattr(owner, key, value or None if key == "email" else value)
    owner.updated_at = utc_now()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, repo.TAKEN_EMAIL) from exc
    return repo.owner_read(db, owner)



def login(body: OwnerLogin, request: Request, response: Response, db: Session):
    owner = password_owner(db, body, repo.code_by_value(db, body.code))
    create_session(db, request, response, owner)
    return repo.owner_read(db, owner)
