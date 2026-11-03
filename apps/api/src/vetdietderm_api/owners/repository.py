import hashlib
import secrets
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from vetdietderm_api.owners.models import ClinicLink, JoinCode, OwnerAccount, OwnerAnimal, OwnerRegistration, StaffEmailReservation, TelegramIdentity, utc_now
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


def email_available(db: Session, email: str, clinic_id: UUID | None, owner_id: UUID | None = None) -> None:
    owner = db.scalar(select(OwnerAccount).where(OwnerAccount.email == normalize_email(email),
                                               OwnerAccount.tenant_id == clinic_id).limit(1))
    if (owner and owner.uuid != owner_id) or db.get(StaffEmailReservation, normalize_email(email)):
        raise HTTPException(409, TAKEN_EMAIL)


def password_hash(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex()


def freeze_clinic_link(db: Session, clinic_id: UUID, members: list[dict], user: dict) -> None:
    if db.get_bind().dialect.name == "postgresql":
        # Serialize first access even when the clinic has no existing code rows.
        lock_key = int.from_bytes(clinic_id.bytes[:8], "big", signed=True)
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
    if db.get(ClinicLink, clinic_id):
        return
    org = user["organization"]
    owners = {str(member.get("user_id")) for member in members
              if isinstance(member, dict) and member.get("org_role") == "owner"}
    candidates = list(db.scalars(select(JoinCode).where(JoinCode.tenant_id == clinic_id)
                                 .order_by(JoinCode.created_at.desc(), JoinCode.uuid.desc())))
    if candidates:
        code = next((row for row in candidates if str(row.doctor_user_id) in owners), candidates[0])
    else:
        code = JoinCode(code=secrets.token_urlsafe(12), tenant_id=clinic_id, workspace="organization",
                        doctor_user_id=UUID(str(user["user_id"])),
                        doctor_label=user.get("display_name") or user["email"])
        db.add(code)
    code.organization_name = org.get("name")
    db.flush()
    db.execute(update(OwnerAccount).where(OwnerAccount.tenant_id == clinic_id)
               .values(join_code_uuid=code.uuid))
    db.execute(delete(JoinCode).where(JoinCode.tenant_id == clinic_id, JoinCode.uuid != code.uuid))
    db.add(ClinicLink(clinic_id=clinic_id, code=code.code))
    db.commit()


def current_code(db: Session, clinic_id: UUID) -> JoinCode:
    link = db.get(ClinicLink, clinic_id)
    if link is None:
        raise HTTPException(404, "Код не найден")
    return code_by_value(db, link.code)


def code_by_value(db: Session, code: str) -> JoinCode:
    row = db.scalar(select(JoinCode).join(ClinicLink, ClinicLink.code == JoinCode.code)
                    .where(ClinicLink.code == code))
    if row is None:
        raise HTTPException(404, "Код не найден")
    return row


def owner_read(db: Session, owner: OwnerAccount) -> dict:
    code = db.get(JoinCode, owner.join_code_uuid) if owner.join_code_uuid else None
    registration = db.scalar(select(OwnerRegistration).where(OwnerRegistration.owner_account_uuid == owner.uuid))
    link = db.get(ClinicLink, owner.tenant_id) if owner.tenant_id else None
    return dict(clinic_code=link.code if link else None, uuid=owner.uuid, name=owner.name, email=owner.email or "", phone=owner.phone,
                telegram_linked=db.scalar(select(TelegramIdentity).where(TelegramIdentity.owner_account_uuid == owner.uuid)) is not None,
                has_password=bool(owner.password_hash),
                doctor_name=code.doctor_label if code else "", organization_name=code.organization_name if code else None,
                linked=bool(registration and registration.client_uuid))


def registration_for_owner(db: Session, owner: OwnerAccount, *, lock: bool = False) -> OwnerRegistration:
    stmt = select(OwnerRegistration).where(OwnerRegistration.owner_account_uuid == owner.uuid)
    registration = db.scalar(stmt.with_for_update() if lock else stmt)
    if registration is None:
        raise HTTPException(404, "Регистрация не найдена")
    return registration


def list_animals(db: Session, owner: OwnerAccount) -> list[OwnerAnimal | Patient]:
    registration = registration_for_owner(db, owner)
    if registration.client_uuid:
        code = db.get(JoinCode, owner.join_code_uuid) if owner.join_code_uuid else None
        return list(db.scalars(select(Patient).where(
            Patient.client_uuid == registration.client_uuid, workspace_filter(Patient, code)
        ).order_by(Patient.created_at, Patient.uuid)))
    return list(db.scalars(select(OwnerAnimal).where(
        OwnerAnimal.registration_uuid == registration.uuid).order_by(OwnerAnimal.created_at, OwnerAnimal.uuid)))


def create_animal(db: Session, owner: OwnerAccount, payload: AnimalCreate) -> OwnerAnimal | Patient:
    registration = registration_for_owner(db, owner, lock=True)
    if registration.client_uuid:
        code = db.get(JoinCode, owner.join_code_uuid) if owner.join_code_uuid else None
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
        code = db.get(JoinCode, owner.join_code_uuid) if owner.join_code_uuid else None
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
    code = db.get(JoinCode, owner.join_code_uuid) if owner.join_code_uuid else None
    if code is None:
        raise HTTPException(404, "Врач ещё не подключён")
    return registration, owner, code


def registration_queue(db: Session, user: dict, tenant_id: str | None) -> list[dict]:
    if not tenant_id:
        raise HTTPException(403, "Клиника недоступна")
    stmt = select(OwnerRegistration, OwnerAccount, JoinCode).join(
        OwnerAccount, OwnerRegistration.owner_account_uuid == OwnerAccount.uuid
    ).join(JoinCode, OwnerAccount.join_code_uuid == JoinCode.uuid).where(
        OwnerRegistration.status == "pending", JoinCode.tenant_id == UUID(str(tenant_id)))
    result = []
    org = user.get("organization") or {}
    clinic_name = org.get("name") if str(org.get("org_id")) == str(tenant_id) else None
    for registration, owner, code in db.execute(stmt.order_by(OwnerRegistration.created_at, OwnerRegistration.uuid)):
        authorize_registration(code, user)
        result.append(dict(uuid=registration.uuid, name=owner.name, email=owner.email or "", phone=owner.phone,
            doctor_name=code.doctor_label, organization_name=clinic_name or code.organization_name,
            can_accept=org.get("org_role") in {"owner", "admin", "member"},
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
