import hashlib
import secrets
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from vetdietderm_api.owners.models import JoinCode, OwnerAccount, OwnerAnimal, OwnerRegistration, StaffEmailReservation, utc_now
from vetdietderm_api.owners.schemas import AnimalCreate, AnimalRead, AnimalUpdate, RegistrationAccept
from vetdietderm_api.patients.models import Client, Patient

TAKEN_EMAIL = "Этот адрес электронной почты уже используется"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def reserve_staff_email(db: Session, email: str, user_id: str) -> None:
    email = normalize_email(email)
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    stmt = insert(StaffEmailReservation).values(email=email, user_id=UUID(str(user_id)), updated_at=utc_now())
    db.execute(stmt.on_conflict_do_update(index_elements=["email"], set_={
        "user_id": stmt.excluded.user_id, "updated_at": stmt.excluded.updated_at}))
    db.commit()


def email_available(db: Session, email: str, owner_id: UUID | None = None) -> None:
    owner = db.scalar(select(OwnerAccount).where(OwnerAccount.email == normalize_email(email)))
    if (owner and owner.uuid != owner_id) or db.get(StaffEmailReservation, normalize_email(email)):
        raise HTTPException(409, TAKEN_EMAIL)


def password_hash(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex()


def current_code(db: Session, user: dict, workspace: str) -> JoinCode:
    org = user.get("organization") if workspace == "organization" else None
    tenant = UUID(str(org["org_id"])) if org else None
    doctor = UUID(str(user["user_id"]))
    # Unique partial indexes arbitrate simultaneous first loads across API processes.
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    db.execute(insert(JoinCode).values(
        code=secrets.token_urlsafe(12), doctor_user_id=doctor,
        doctor_label=user.get("display_name") or user["email"], workspace=workspace,
        tenant_id=tenant, organization_name=org["name"] if org else None,
    ).on_conflict_do_nothing())
    row = db.scalar(select(JoinCode).where(JoinCode.doctor_user_id == doctor, JoinCode.tenant_id == tenant))
    row.doctor_label = user.get("display_name") or user["email"]
    row.organization_name = org["name"] if org else None
    db.commit()
    return row


def code_by_value(db: Session, code: str) -> JoinCode:
    row = db.scalar(select(JoinCode).where(JoinCode.code == code))
    if row is None:
        raise HTTPException(404, "Код не найден")
    return row


def owner_read(db: Session, owner: OwnerAccount) -> dict:
    code = db.get(JoinCode, owner.join_code_uuid)
    return dict(uuid=owner.uuid, name=owner.name, email=owner.email, phone=owner.phone,
                doctor_name=code.doctor_label, organization_name=code.organization_name)


def registration_for_owner(db: Session, owner: OwnerAccount, *, lock: bool = False) -> OwnerRegistration:
    stmt = select(OwnerRegistration).where(OwnerRegistration.owner_account_uuid == owner.uuid)
    registration = db.scalar(stmt.with_for_update() if lock else stmt)
    if registration is None:
        raise HTTPException(404, "Регистрация не найдена")
    return registration


def list_animals(db: Session, owner: OwnerAccount) -> list[OwnerAnimal | Patient]:
    registration = registration_for_owner(db, owner)
    if registration.client_uuid:
        code = db.get(JoinCode, owner.join_code_uuid)
        return list(db.scalars(select(Patient).where(
            Patient.client_uuid == registration.client_uuid, workspace_filter(Patient, code)
        ).order_by(Patient.created_at, Patient.uuid)))
    return list(db.scalars(select(OwnerAnimal).where(
        OwnerAnimal.registration_uuid == registration.uuid).order_by(OwnerAnimal.created_at, OwnerAnimal.uuid)))


def create_animal(db: Session, owner: OwnerAccount, payload: AnimalCreate) -> OwnerAnimal | Patient:
    registration = registration_for_owner(db, owner, lock=True)
    if registration.client_uuid:
        code = db.get(JoinCode, owner.join_code_uuid)
        linked_client(db, registration.client_uuid, code)
        animal = Patient(client_uuid=registration.client_uuid, tenant_id=code.tenant_id,
                         created_by=code.doctor_user_id, **payload.model_dump())
    else:
        animal = OwnerAnimal(registration_uuid=registration.uuid, **payload.model_dump())
    db.add(animal)
    db.commit()
    return animal


def update_animal(db: Session, owner: OwnerAccount, animal_id: UUID, payload: AnimalUpdate) -> OwnerAnimal | Patient:
    registration = registration_for_owner(db, owner, lock=True)
    if registration.client_uuid:
        code = db.get(JoinCode, owner.join_code_uuid)
        animal = db.scalar(select(Patient).where(
            Patient.uuid == animal_id, Patient.client_uuid == registration.client_uuid,
            workspace_filter(Patient, code)))
    else:
        animal = db.scalar(select(OwnerAnimal).where(
            OwnerAnimal.uuid == animal_id, OwnerAnimal.registration_uuid == registration.uuid))
    if animal is None:
        raise HTTPException(404, "Животное не найдено")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(animal, key, value)
    animal.updated_at = utc_now()
    db.commit()
    return animal


def workspace_filter(model, code: JoinCode):
    if code.tenant_id:
        return model.tenant_id == code.tenant_id
    return model.tenant_id.is_(None) & (model.created_by == code.doctor_user_id)


def linked_client(db: Session, client_id: UUID, code: JoinCode) -> Client:
    client = db.scalar(select(Client).where(Client.uuid == client_id, workspace_filter(Client, code)))
    if client is None:
        raise HTTPException(404, "Клиент не найден")
    return client


def authorize_registration(code: JoinCode, user: dict, *, write: bool = False) -> None:
    if code.tenant_id:
        org = user.get("organization") or {}
        if org.get("status") != "active" or str(code.tenant_id) != str(org.get("org_id")):
            raise HTTPException(403, "Регистрация недоступна")
        if write and org.get("org_role") not in {"owner", "admin", "member"}:
            raise HTTPException(403, "Роль наблюдателя разрешает только просмотр")
    elif str(code.doctor_user_id) != str(user["user_id"]):
        raise HTTPException(403, "Регистрация доступна только пригласившему врачу")


def registration_context(db: Session, registration_id: UUID, *, lock: bool = False):
    stmt = select(OwnerRegistration).where(OwnerRegistration.uuid == registration_id)
    registration = db.scalar(stmt.with_for_update() if lock else stmt)
    if registration is None:
        raise HTTPException(404, "Регистрация не найдена")
    owner = db.get(OwnerAccount, registration.owner_account_uuid)
    code = db.get(JoinCode, owner.join_code_uuid)
    return registration, owner, code


def registration_queue(db: Session, user: dict, tenant_id: str | None) -> list[dict]:
    stmt = select(OwnerRegistration, OwnerAccount, JoinCode).join(
        OwnerAccount, OwnerRegistration.owner_account_uuid == OwnerAccount.uuid
    ).join(JoinCode, OwnerAccount.join_code_uuid == JoinCode.uuid).where(OwnerRegistration.status == "pending")
    if tenant_id:
        stmt = stmt.where(JoinCode.tenant_id == UUID(str(tenant_id)))
    else:
        stmt = stmt.where(JoinCode.tenant_id.is_(None), JoinCode.doctor_user_id == UUID(str(user["user_id"])))
    result = []
    for registration, owner, code in db.execute(stmt.order_by(OwnerRegistration.created_at, OwnerRegistration.uuid)):
        authorize_registration(code, user)
        org = user.get("organization") or {}
        result.append(dict(uuid=registration.uuid, name=owner.name, email=owner.email, phone=owner.phone,
            doctor_name=code.doctor_label, organization_name=code.organization_name,
            can_accept=not code.tenant_id or org.get("org_role") in {"owner", "admin", "member"},
            animals=[AnimalRead.model_validate(row) for row in db.scalars(select(OwnerAnimal).where(
                OwnerAnimal.registration_uuid == registration.uuid).order_by(OwnerAnimal.created_at, OwnerAnimal.uuid))]))
    return result


def accept_registration(session: Session, registration_id: UUID, payload: RegistrationAccept) -> OwnerRegistration:
    """Accept atomically in the invitation workspace; caller supplies verified staff in session.info['user'].

    Flush only: the endpoint (or a future visit confirmation) owns the transaction commit.
    All owner writes lock the same registration before changing contacts or passports.
    """
    registration, owner, code = registration_context(session, registration_id, lock=True)
    authorize_registration(code, session.info["user"], write=True)
    if registration.status != "pending":
        raise HTTPException(409, "Регистрация уже принята")
    animals = list(session.scalars(select(OwnerAnimal).where(
        OwnerAnimal.registration_uuid == registration.uuid).order_by(OwnerAnimal.uuid)))
    animal_ids = {animal.uuid for animal in animals}
    matches = {match.owner_animal_id: match.patient_uuid for match in payload.matches}
    patient_ids = [match.patient_uuid for match in payload.matches if match.patient_uuid]
    if len(matches) != len(payload.matches) or not set(matches) <= animal_ids or len(patient_ids) != len(set(patient_ids)):
        raise HTTPException(422, "Проверьте сопоставления: каждое животное и пациент выбираются только один раз")
    if payload.mode == "create" and (payload.client_uuid or patient_ids):
        raise HTTPException(422, "Для нового клиента нельзя выбрать существующих пациентов")
    if payload.mode == "link" and not payload.client_uuid:
        raise HTTPException(422, "Выберите существующего клиента")
    client = linked_client(session, payload.client_uuid, code) if payload.mode == "link" else Client(
        name=owner.name, email=owner.email, phone=owner.phone,
        tenant_id=code.tenant_id, created_by=code.doctor_user_id)
    # Validate every match before making changes.
    patients = {}
    for patient_id in patient_ids:
        patient = session.scalar(select(Patient).where(Patient.uuid == patient_id,
            Patient.client_uuid == client.uuid, workspace_filter(Patient, code)).with_for_update())
        if patient is None:
            raise HTTPException(422, "Пациент не принадлежит выбранному клиенту")
        patients[patient_id] = patient
    if payload.mode == "create":
        session.add(client)
        session.flush()
    for animal in animals:
        patient = patients.get(matches.get(animal.uuid))
        if patient is None:
            patient = Patient(client_uuid=client.uuid, tenant_id=code.tenant_id, created_by=code.doctor_user_id)
            session.add(patient)
        for key in ("name", "species", "breed", "sex", "birth_date"):
            setattr(patient, key, getattr(animal, key))
        patient.updated_at = utc_now()
        session.flush()
        animal.patient_uuid = patient.uuid
        from vetdietderm_api.chat.repository import link_thread
        link_thread(session, animal.uuid, patient.uuid)
    registration.client_uuid = client.uuid
    registration.status = "accepted"
    registration.accepted_at = utc_now()
    session.flush()
    return registration
