import hashlib
import secrets
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from vetdietderm_api.owners.models import JoinCode, OwnerAccount, OwnerAnimal, OwnerRegistration, StaffEmailReservation, utc_now
from vetdietderm_api.owners.schemas import AnimalCreate, AnimalUpdate

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


def registration_for_owner(db: Session, owner: OwnerAccount) -> OwnerRegistration:
    registration = db.scalar(select(OwnerRegistration).where(OwnerRegistration.owner_account_uuid == owner.uuid))
    if registration is None:
        raise HTTPException(404, "Регистрация не найдена")
    return registration


def list_animals(db: Session, owner: OwnerAccount) -> list[OwnerAnimal]:
    registration = registration_for_owner(db, owner)
    return list(db.scalars(select(OwnerAnimal).where(
        OwnerAnimal.registration_uuid == registration.uuid).order_by(OwnerAnimal.created_at, OwnerAnimal.uuid)))


def create_animal(db: Session, owner: OwnerAccount, payload: AnimalCreate) -> OwnerAnimal:
    registration = registration_for_owner(db, owner)
    animal = OwnerAnimal(registration_uuid=registration.uuid, **payload.model_dump())
    db.add(animal)
    db.commit()
    return animal


def update_animal(db: Session, owner: OwnerAccount, animal_id: UUID, payload: AnimalUpdate) -> OwnerAnimal:
    registration = registration_for_owner(db, owner)
    animal = db.scalar(select(OwnerAnimal).where(
        OwnerAnimal.uuid == animal_id, OwnerAnimal.registration_uuid == registration.uuid))
    if animal is None:
        raise HTTPException(404, "Животное не найдено")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(animal, key, value)
    animal.updated_at = utc_now()
    db.commit()
    return animal
