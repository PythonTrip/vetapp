from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse

from vetdietderm_api.attachments import repository as attachment_repo
from vetdietderm_api.attachments.schemas import OwnerFileRead
from vetdietderm_api.attachments.storage import extension_for, resolve_file
from vetdietderm_api.auth import csrf, require_clinical_access, require_user
from vetdietderm_api.owners import registrations as registration_service
from vetdietderm_api.owners import repository as repo
from vetdietderm_api.owners import clinic_bots, profile, telegram_accounts, uploads
from vetdietderm_api.owners.schemas import ClinicBotRead, ClinicBotWrite, CurrentJoinCode, DoctorPreview, OwnerLogin, OwnerProfileUpdate, OwnerRead, OwnerRegister
from vetdietderm_api.owners.schemas import OwnerUploadRead, AnimalCreate, AnimalRead, AnimalUpdate
from vetdietderm_api.owners.schemas import RegistrationAccept, RegistrationAccepted, RegistrationRead
from vetdietderm_api.owners.schemas import TelegramLogin, TelegramLink, TelegramWidgetLogin, OwnerCredentials
from vetdietderm_api.owners.sessions import DB, Owner, end_session
from vetdietderm_api.settings import get_settings

router = APIRouter(tags=["owners"], dependencies=[Depends(csrf)])


@router.post("/owner/telegram/login", response_model=OwnerRead)
def telegram_login(body: TelegramLogin, request: Request, response: Response, db: DB):
    return telegram_accounts.telegram_exchange(body, request, response, db, link=False)


@router.post("/owner/telegram/link", response_model=OwnerRead)
def telegram_link(body: TelegramLink, request: Request, response: Response, db: DB):
    return telegram_accounts.telegram_exchange(body, request, response, db, link=True)


@router.get("/owner/telegram/config")
def telegram_config(code: str, db: DB):
    bot = clinic_bots.connected_bot(db, repo.code_by_value(db, code))
    return {"bot_username": bot.username if bot else None}


@router.post("/owner/telegram/widget", response_model=OwnerRead)
def telegram_widget(body: TelegramWidgetLogin, request: Request, response: Response, db: DB):
    return telegram_accounts.telegram_widget(body, request, response, db)


@router.post("/owner/credentials", response_model=OwnerRead)
def set_credentials(body: OwnerCredentials, owner: Owner, db: DB):
    return profile.set_credentials(body, owner, db)


def clinic_uuid(request: Request) -> UUID:
    return UUID(str(request.state.tenant_id))


@router.get("/clinic-bot", response_model=ClinicBotRead, dependencies=[Depends(require_clinical_access)])
def read_clinic_bot(request: Request, db: DB) -> ClinicBotRead:
    return clinic_bots.read_clinic_bot(db, clinic_uuid(request))


@router.put("/clinic-bot", response_model=ClinicBotRead, dependencies=[Depends(require_clinical_access)])
def save_clinic_bot(body: ClinicBotWrite, request: Request, db: DB) -> ClinicBotRead:
    return clinic_bots.save_clinic_bot(body, request.state.user, request.state.tenant_id, db)


@router.get("/join-codes/current", response_model=CurrentJoinCode, dependencies=[Depends(require_clinical_access)])
def join_code(request: Request, db: DB):
    row = repo.current_code(db, clinic_uuid(request))
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
    return profile.register(body, request, response, db)


@router.post("/owner/login", response_model=OwnerRead)
def login(body: OwnerLogin, request: Request, response: Response, db: DB):
    return profile.login(body, request, response, db)


@router.post("/owner/logout")
def logout(request: Request, response: Response, db: DB):
    end_session(request, response, db)
    return {"ok": True}


@router.get("/owner/me", response_model=OwnerRead)
def me(owner: Owner, db: DB):
    return repo.owner_read(db, owner)


@router.patch("/owner/me", response_model=OwnerRead)
def update_me(body: OwnerProfileUpdate, owner: Owner, db: DB):
    return profile.update_me(body, owner, db)


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
    return repo.matching_patients(db, registration_id, client_uuid, request.state.user)


@router.post("/owner-registrations/{registration_id}/accept", response_model=RegistrationAccepted,
             dependencies=[Depends(require_user)])
def accept(registration_id: UUID, body: RegistrationAccept, request: Request, db: DB):
    return registration_service.accept_and_commit(db, registration_id, body, request.state.user)


@router.get("/owner/animals/{animal_id}/uploads", response_model=list[OwnerUploadRead])
def uploaded_documents(animal_id: UUID, owner: Owner, db: DB):
    return uploads.list_files(db, owner, animal_id)


@router.post("/owner/animals/{animal_id}/uploads", response_model=OwnerUploadRead, status_code=201)
def upload_owner_media(animal_id: UUID, file: UploadFile, kind: Annotated[Literal["photo", "document", "chat"], Form()], owner: Owner, db: DB):
    return uploads.upload(db, owner, animal_id, file, kind)


@router.get("/owner/uploads/{upload_id}")
def download_owner_upload(upload_id: UUID, owner: Owner, db: DB):
    row = uploads.get_owner_upload(db, owner, upload_id)
    return uploads.download(row, inline=row.kind == "photo")
