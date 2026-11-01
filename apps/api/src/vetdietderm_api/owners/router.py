import hashlib
import json
import secrets
import time
from collections.abc import Iterator
from typing import Annotated, Literal
from urllib.parse import parse_qs
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vetdietderm_api.attachments import repository as attachment_repo
from vetdietderm_api.attachments.schemas import OwnerFileRead
from vetdietderm_api.attachments.storage import extension_for, resolve_file
from vetdietderm_api.auth import csrf, require_clinical_access, require_user
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.ids import uuid6
from vetdietderm_api.owners import repository as repo
from vetdietderm_api.owners import uploads
from vetdietderm_api.owners.models import OwnerAnimal, OwnerUpload, JoinCode, OwnerAccount, OwnerRegistration, OwnerSession, TelegramExchange, TelegramIdentity, utc_now
from vetdietderm_api.owners.schemas import CurrentJoinCode, DoctorPreview, OwnerLogin, OwnerProfileUpdate, OwnerRead, OwnerRegister
from vetdietderm_api.owners.schemas import OwnerUploadRead, AnimalCreate, AnimalRead, AnimalUpdate
from vetdietderm_api.owners.schemas import RegistrationAccept, RegistrationAccepted, RegistrationRead
from vetdietderm_api.owners.schemas import TelegramLogin, TelegramLink, TelegramWidgetLogin, OwnerCredentials, OwnerJoin
from vetdietderm_api.owners.telegram import validate_init_data, validate_widget
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
    settings = get_settings()
    response.set_cookie(COOKIE, key, httponly=True, secure=settings.AUTH_COOKIE_SECURE,
                        samesite=getattr(settings, "OWNER_COOKIE_SAMESITE", "lax"), path="/", max_age=SESSION_SECONDS)


@router.post("/owner/telegram/login", response_model=OwnerRead)
def telegram_login(body: TelegramLogin, request: Request, response: Response, db: DB):
    return telegram_exchange(body, request, response, db, link=False)


@router.post("/owner/telegram/link", response_model=OwnerRead)
def telegram_link(body: TelegramLink, request: Request, response: Response, db: DB):
    return telegram_exchange(body, request, response, db, link=True)


def telegram_exchange(body: TelegramLogin, request: Request, response: Response, db: Session, *, link: bool, verified=None, name="Владелец"):
    settings = get_settings()
    identity, digest, expires = verified or validate_init_data(body.init_data, settings.TELEGRAM_BOT_TOKEN,
                                                  settings.TELEGRAM_INIT_DATA_MAX_AGE)
    if verified is None:
        user = json.loads(parse_qs(body.init_data)["user"][0])
        name = " ".join(str(user.get(key) or "") for key in ("first_name", "last_name")).strip()[:255] or name
    binding = db.get(TelegramIdentity, identity)
    if link:
        owner = db.scalar(select(OwnerAccount).where(OwnerAccount.email == repo.normalize_email(body.email)))
        candidate = repo.password_hash(body.password, owner.password_salt if owner and owner.password_salt else "00" * 16)
        if owner is None or not secrets.compare_digest(candidate, owner.password_hash or ""):
            raise HTTPException(401, "Неверная почта или пароль")
        session = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
        if session and session.expires > time.time() and session.owner_account_uuid != owner.uuid:
            raise HTTPException(409, "Сначала выйдите из другого кабинета владельца")
        other = db.scalar(select(TelegramIdentity).where(TelegramIdentity.owner_account_uuid == owner.uuid))
        if (binding and binding.owner_account_uuid != owner.uuid) or (other and other.telegram_user_id != identity):
            raise HTTPException(409, "Telegram или кабинет уже привязан к другому аккаунту")
        if binding is None:
            db.add(TelegramIdentity(telegram_user_id=identity, owner_account_uuid=owner.uuid))
    else:
        session = db.get(OwnerSession, session_digest(request.cookies.get(COOKIE, "")))
        if binding is None:
            if session and session.expires > time.time():
                raise HTTPException(409, "В кабинете уже выполнен вход. Подтвердите пароль для привязки Telegram")
            owner = OwnerAccount(uuid=uuid6(), name=name, email=None, phone="", password_salt=None, password_hash=None,
                                 doctor_user_id=None, join_code_uuid=None, workspace=None)
            db.add(owner)
            db.add(OwnerRegistration(owner_account_uuid=owner.uuid))
            db.add(TelegramIdentity(telegram_user_id=identity, owner_account_uuid=owner.uuid))
        else:
            owner = db.get(OwnerAccount, binding.owner_account_uuid)
        if session and session.expires > time.time() and session.owner_account_uuid != owner.uuid:
            raise HTTPException(409, "Сначала выйдите из другого кабинета владельца")
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


@router.get("/owner/telegram/config")
def telegram_config(response: Response):
    response.headers["Cache-Control"] = "no-store"
    settings = get_settings()
    return {"bot_username": settings.TELEGRAM_BOT_USERNAME if settings.TELEGRAM_BOT_TOKEN else None}


@router.post("/owner/telegram/widget", response_model=OwnerRead)
def telegram_widget(body: TelegramWidgetLogin, request: Request, response: Response, db: DB):
    settings = get_settings()
    verified = validate_widget(body.model_dump(), settings.TELEGRAM_BOT_TOKEN, settings.TELEGRAM_INIT_DATA_MAX_AGE)
    return telegram_exchange(TelegramLogin(init_data="widget"), request, response, db, link=False,
                             verified=verified, name=(body.first_name + " " + (body.last_name or "")).strip()[:255])


@router.post("/owner/credentials", response_model=OwnerRead)
def set_credentials(body: OwnerCredentials, owner: Owner, db: DB):
    # Only initial setup: existing passwords require a separate reauthentication flow.
    registration = repo.registration_for_owner(db, owner, lock=True)
    db.refresh(owner, with_for_update=True)
    if owner.password_hash:
        raise HTTPException(409, "Вход по почте уже настроен")
    repo.email_available(db, body.email, owner.uuid)
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


@router.post("/owner/connect-doctor", response_model=OwnerRead)
def connect_doctor(body: OwnerJoin, owner: Owner, db: DB):
    repo.registration_for_owner(db, owner, lock=True)
    db.refresh(owner)
    if owner.join_code_uuid:
        raise HTTPException(409, "Врач уже подключён")
    code = repo.code_by_value(db, body.code)
    owner.join_code_uuid = code.uuid
    owner.doctor_user_id = code.doctor_user_id
    owner.workspace = code.workspace
    owner.tenant_id = code.tenant_id
    owner.updated_at = utc_now()
    db.commit()
    return repo.owner_read(db, owner)


@router.get("/join-codes/current", response_model=CurrentJoinCode, dependencies=[Depends(require_clinical_access)])
def join_code(request: Request, db: DB):
    row = repo.current_code(db, request.state.user, request.headers.get("X-Vetapp-Workspace", "personal"))
    settings = get_settings()
    owner_origin = settings.OWNER_FRONTEND_URL or settings.FRONTEND_URL
    return dict(code=row.code, link=f"{owner_origin.rstrip('/')}/join/{row.code}",
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
    candidate = repo.password_hash(body.password, owner.password_salt if owner and owner.password_salt else "00" * 16)
    if owner is None or not secrets.compare_digest(candidate, owner.password_hash or ""):
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
def update_me(body: OwnerProfileUpdate, owner: Owner, db: DB):
    registration = repo.registration_for_owner(db, owner, lock=True)
    if owner.password_hash and not body.email:
        raise HTTPException(422, "Укажите почту для входа")
    if body.email:
        repo.email_available(db, body.email, owner.uuid)
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
    return [uploads.photo_read(db, owner, animal) for animal in repo.list_animals(db, owner)]


@router.post("/owner/animals", response_model=AnimalRead, status_code=201)
def add_animal(body: AnimalCreate, owner: Owner, db: DB):
    return uploads.photo_read(db, owner, repo.create_animal(db, owner, body))


@router.patch("/owner/animals/{animal_id}", response_model=AnimalRead)
def edit_animal(animal_id: UUID, body: AnimalUpdate, owner: Owner, db: DB):
    return uploads.photo_read(db, owner, repo.update_animal(db, owner, animal_id, body))


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


@router.get("/owner/animals/{animal_id}/uploads", response_model=list[OwnerUploadRead])
def uploaded_documents(animal_id: UUID, owner: Owner, db: DB):
    return uploads.list_files(db, owner, animal_id)


@router.post("/owner/animals/{animal_id}/uploads", response_model=OwnerUploadRead, status_code=201)
def upload_owner_media(animal_id: UUID, file: UploadFile, kind: Annotated[Literal["photo", "document", "chat"], Form()], owner: Owner, db: DB):
    return uploads.upload(db, owner, animal_id, file, kind)


@router.get("/owner/uploads/{upload_id}")
def download_owner_upload(upload_id: UUID, owner: Owner, db: DB):
    row = db.scalar(select(OwnerUpload).where(OwnerUpload.uuid == upload_id, OwnerUpload.owner_account_uuid == owner.uuid))
    if row is None:
        raise HTTPException(404, "Файл не найден")
    # Resolve ownership again, so a removed animal does not leave a readable URL.
    current = next((animal.uuid for animal in repo.list_animals(db, owner) if animal.uuid == row.animal_uuid), None)
    if current is None:
        previous = db.get(OwnerAnimal, row.animal_uuid)
        current = previous.patient_uuid if previous else None
    if current is None:
        raise HTTPException(404, "Животное не найдено")
    uploads.animal_ids(db, owner, current)
    return uploads.download(row, inline=row.kind == "photo")
