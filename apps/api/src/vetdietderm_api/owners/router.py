import hashlib
import secrets
import time
from collections.abc import Iterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vetdietderm_api.attachments import repository as attachment_repo
from vetdietderm_api.attachments.schemas import OwnerFileRead
from vetdietderm_api.attachments.storage import extension_for, resolve_file
from vetdietderm_api.auth import csrf, require_clinical_access, require_user
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.owners import repository as repo
from vetdietderm_api.owners.models import JoinCode, OwnerAccount, OwnerRegistration, OwnerSession, utc_now
from vetdietderm_api.owners.schemas import CurrentJoinCode, DoctorPreview, OwnerLogin, OwnerProfileWrite, OwnerRead, OwnerRegister
from vetdietderm_api.owners.schemas import AnimalCreate, AnimalRead, AnimalUpdate
from vetdietderm_api.owners.schemas import RegistrationAccept, RegistrationAccepted, RegistrationRead
from vetdietderm_api.patients.models import Patient
from vetdietderm_api.settings import get_settings

COOKIE = "vetapp_owner_session"
SESSION_SECONDS = 30 * 24 * 3600
router = APIRouter(tags=["owners"], dependencies=[Depends(csrf)])


def owner_db(response: Response) -> Iterator[Session]:
    response.headers["Cache-Control"] = "no-store"
    with get_session_factory()() as db:
        yield db


DB = Annotated[Session, Depends(owner_db)]


def session_digest(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def require_owner(request: Request, db: DB) -> OwnerAccount:
    row = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
    if row is None or row.expires <= time.time():
        raise HTTPException(401, "Войдите в кабинет владельца")
    owner = db.get(OwnerAccount, row.owner_account_uuid)
    if owner is None:
        raise HTTPException(401, "Войдите в кабинет владельца")
    return owner


Owner = Annotated[OwnerAccount, Depends(require_owner)]


def create_session(db: Session, request: Request, response: Response, owner: OwnerAccount) -> None:
    old = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
    if old:
        db.delete(old)
    key = secrets.token_urlsafe(32)
    db.add(OwnerSession(key_hash=session_digest(key), owner_account_uuid=owner.uuid,
                        expires=time.time() + SESSION_SECONDS))
    db.commit()
    response.set_cookie(COOKIE, key, httponly=True, secure=get_settings().AUTH_COOKIE_SECURE,
                        samesite="lax", path="/", max_age=SESSION_SECONDS)


@router.get("/join-codes/current", response_model=CurrentJoinCode, dependencies=[Depends(require_clinical_access)])
def join_code(request: Request, db: DB):
    row = repo.current_code(db, request.state.user, request.headers.get("X-Vetapp-Workspace", "personal"))
    return dict(code=row.code, link=f"{get_settings().FRONTEND_URL.rstrip('/')}/join/{row.code}",
                doctor_name=row.doctor_label, organization_name=row.organization_name)


@router.get("/owner/join/{code}", response_model=DoctorPreview)
def preview(code: str, db: DB):
    row = repo.code_by_value(db, code)
    return dict(doctor_name=row.doctor_label, organization_name=row.organization_name)


@router.post("/owner/register", response_model=OwnerRead, status_code=201)
def register(body: OwnerRegister, request: Request, response: Response, db: DB):
    code = repo.code_by_value(db, body.code)
    existing = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
    if existing and existing.expires > time.time():
        raise HTTPException(409, "Аккаунт уже привязан к врачу. Повторное присоединение недоступно")
    repo.email_available(db, body.email)
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


@router.post("/owner/login", response_model=OwnerRead)
def login(body: OwnerLogin, request: Request, response: Response, db: DB):
    owner = db.scalar(select(OwnerAccount).where(OwnerAccount.email == repo.normalize_email(body.email)))
    # Equal expensive work for unknown emails and incorrect passwords.
    candidate = repo.password_hash(body.password, owner.password_salt if owner else "00" * 16)
    if owner is None or not secrets.compare_digest(candidate, owner.password_hash):
        raise HTTPException(401, "Неверная почта или пароль")
    create_session(db, request, response, owner)
    return repo.owner_read(db, owner)


@router.post("/owner/logout")
def logout(request: Request, response: Response, db: DB):
    row = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
    if row:
        db.delete(row)
        db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/owner/me", response_model=OwnerRead)
def me(owner: Owner, db: DB):
    return repo.owner_read(db, owner)


@router.patch("/owner/me", response_model=OwnerRead)
def update_me(body: OwnerProfileWrite, owner: Owner, db: DB):
    registration = repo.registration_for_owner(db, owner, lock=True)
    repo.email_available(db, body.email, owner.uuid)
    if registration.client_uuid:
        code = db.get(JoinCode, owner.join_code_uuid)
        client = repo.linked_client(db, registration.client_uuid, code)
        for key, value in body.model_dump().items():
            setattr(client, key, value)
        client.updated_at = utc_now()
    for key, value in body.model_dump().items():
        setattr(owner, key, value)
    owner.updated_at = utc_now()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, repo.TAKEN_EMAIL) from exc
    return repo.owner_read(db, owner)


@router.get("/owner/animals/{animal_id}/files", response_model=list[OwnerFileRead])
def animal_files(animal_id: UUID, owner: Owner, db: DB):
    return attachment_repo.list_owner_files(db, owner, animal_id)


@router.get("/owner/files/{attachment_id}")
def download_owner_file(attachment_id: UUID, owner: Owner, db: DB):
    attachment = attachment_repo.get_owner_file(db, owner, attachment_id)
    try:
        path = resolve_file(attachment.storage_key)
    except FileNotFoundError:
        raise HTTPException(404, "Файл не найден") from None
    try:
        suffix = extension_for(attachment.content_type)
    except KeyError:
        suffix = ""
    return FileResponse(path, media_type=attachment.content_type, filename=f"file{suffix}")


@router.get("/owner/animals", response_model=list[AnimalRead])
def animals(owner: Owner, db: DB):
    return repo.list_animals(db, owner)


@router.post("/owner/animals", response_model=AnimalRead, status_code=201)
def add_animal(body: AnimalCreate, owner: Owner, db: DB):
    return repo.create_animal(db, owner, body)


@router.patch("/owner/animals/{animal_id}", response_model=AnimalRead)
def edit_animal(animal_id: UUID, body: AnimalUpdate, owner: Owner, db: DB):
    return repo.update_animal(db, owner, animal_id, body)


@router.get("/owner-registrations", response_model=list[RegistrationRead], dependencies=[Depends(require_clinical_access)])
def registrations(request: Request, db: DB):
    return repo.registration_queue(db, request.state.user, request.state.tenant_id)


@router.get("/owner-registrations/{registration_id}/patients", response_model=list[AnimalRead],
            dependencies=[Depends(require_clinical_access)])
def matching_patients(registration_id: UUID, client_uuid: UUID, request: Request, db: DB):
    _, _, code = repo.registration_context(db, registration_id)
    repo.authorize_registration(code, request.state.user)
    repo.linked_client(db, client_uuid, code)
    return list(db.scalars(select(Patient).where(Patient.client_uuid == client_uuid,
        repo.workspace_filter(Patient, code)).order_by(Patient.name, Patient.uuid)))


@router.post("/owner-registrations/{registration_id}/accept", response_model=RegistrationAccepted,
             dependencies=[Depends(require_user)])
def accept(registration_id: UUID, body: RegistrationAccept, request: Request, db: DB):
    # Permission and row provenance follow the invitation, independent of the selected workspace.
    db.info["user"] = request.state.user
    registration = repo.accept_registration(db, registration_id, body)
    db.commit()
    return dict(uuid=registration.uuid, client_uuid=registration.client_uuid, status=registration.status)
