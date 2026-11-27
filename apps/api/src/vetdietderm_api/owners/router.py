"""Staff-side clinic bot, join code and registration queue endpoints.

Owner-facing (client cabinet) routes were removed; see branch archive/owner-cabinet.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Request

from vetdietderm_api.auth import csrf, require_clinical_access, require_user
from vetdietderm_api.owners import clinic_bots
from vetdietderm_api.owners import registrations as registration_service
from vetdietderm_api.owners import repository as repo
from vetdietderm_api.owners.schemas import AnimalRead, ClinicBotRead, ClinicBotWrite, CurrentJoinCode
from vetdietderm_api.owners.schemas import RegistrationAccept, RegistrationAccepted, RegistrationRead
from vetdietderm_api.owners.sessions import DB

router = APIRouter(tags=["owners"], dependencies=[Depends(csrf)])


def clinic_uuid(request: Request) -> UUID:
    return UUID(str(request.state.tenant_id))


@router.get("/clinic-bot", response_model=ClinicBotRead, dependencies=[Depends(require_clinical_access)])
def read_clinic_bot(request: Request, db: DB) -> ClinicBotRead:
    return clinic_bots.read_clinic_bot(db, clinic_uuid(request))


@router.put("/clinic-bot", response_model=ClinicBotRead, dependencies=[Depends(require_clinical_access)])
def save_clinic_bot(body: ClinicBotWrite, request: Request, db: DB) -> ClinicBotRead:
    return clinic_bots.save_clinic_bot(body, request.state.user, request.state.tenant_id, db)


@router.post("/clinic-bot/verify", response_model=ClinicBotRead, dependencies=[Depends(require_clinical_access)])
def verify_clinic_bot(request: Request, db: DB) -> ClinicBotRead:
    return clinic_bots.verify_clinic_bot(request.state.user, request.state.tenant_id, db)


@router.post("/clinic-bot/disconnect", response_model=ClinicBotRead, dependencies=[Depends(require_clinical_access)])
def disconnect_clinic_bot(request: Request, db: DB) -> ClinicBotRead:
    return clinic_bots.disconnect_clinic_bot(request.state.user, request.state.tenant_id, db)


@router.get("/join-codes/current", response_model=CurrentJoinCode, dependencies=[Depends(require_clinical_access)])
def join_code(request: Request, db: DB):
    row = repo.current_code(db, clinic_uuid(request))
    return dict(code=row.code, link=None, doctor_name=row.doctor_label, organization_name=row.organization_name)


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
